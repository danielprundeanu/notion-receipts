import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import fs from "fs";
import path from "path";
import crypto from "crypto";

// Persist manual "raw name → grocery item" mappings so they auto-resolve on future imports.
// Non-fatal: a failure here must never block the actual recipe import.
async function saveIngredientMappings(mappings: Array<{ rawName: string; groceryItemId: string; groceryItemName: string }>) {
  for (const m of mappings) {
    const rawName = m.rawName.toLowerCase().trim();
    if (!rawName) continue;
    try {
      await prisma.ingredientNameMapping.upsert({
        where: { rawName },
        update: { groceryItemId: m.groceryItemId, groceryItemName: m.groceryItemName },
        create: { rawName, groceryItemId: m.groceryItemId, groceryItemName: m.groceryItemName },
      });
    } catch (e) {
      console.warn("[import/confirm] could not persist ingredient mapping:", e instanceof Error ? e.message : e);
    }
  }
}

// Persist unit-conversion choices (1 foreignUnit = factor × targetUnit). Non-fatal.
async function saveUnitRules(rules: Array<{ name: string; foreignUnit: string; targetUnit: string; factor: number }>) {
  for (const r of rules) {
    const key = `${r.name.toLowerCase()}|${r.foreignUnit.toLowerCase()}`;
    try {
      await prisma.unitRule.upsert({
        where: { key },
        update: { targetUnit: r.targetUnit, rate: r.factor, foreignUnit: r.foreignUnit },
        create: { key, targetUnit: r.targetUnit, rate: r.factor, foreignUnit: r.foreignUnit },
      });
    } catch (e) {
      console.warn("[import/confirm] could not persist unit rule:", e instanceof Error ? e.message : e);
    }
  }
}

async function saveBase64Image(dataUrl: string): Promise<string | null> {
  const m = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!m) return dataUrl;
  const contentType = m[1];
  const ext = contentType.split("/")[1] ?? "jpg";
  const buf = Buffer.from(m[2], "base64");
  const hash = crypto.createHash("md5").update(buf).digest("hex");
  const filename = `${hash}.${ext}`;

  // Prefer Vercel Blob (persistent, and keeps megabytes of base64 out of the DB).
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { put } = await import("@vercel/blob");
      const blob = await put(`recipes/${filename}`, buf, {
        access: "public", contentType, addRandomSuffix: false, allowOverwrite: true,
      });
      return blob.url;
    } catch (e) {
      console.warn("[import/confirm] blob upload failed:", e instanceof Error ? e.message : e);
    }
  }

  // Dev fallback: write to public/. On a read-only FS with no blob token, drop the
  // image (return null) rather than persisting the whole base64 string in the DB.
  const dest = path.join(process.cwd(), "public", "images", "recipes", filename);
  try {
    if (!fs.existsSync(dest)) fs.writeFileSync(dest, buf);
    return `/images/recipes/${filename}`;
  } catch (e) {
    console.warn("[import/confirm] could not save image, dropping it:", e instanceof Error ? e.message : e);
    return null;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ConfirmedIngredient = {
  name: string;
  qty: number | null;
  unit: string | null;
  obs?: string | null;
  groupName: string | null;
  groupOrder: number;
  order: number;
  // Resolved match info
  groceryItemId?: string | null;   // existing item
  groceryItemName?: string | null; // name of matched item (for saving mapping)
  saveMapping?: boolean;           // true = user manually resolved, save to file
  addUnit2?: boolean;              // true = set foreignUnit as unit2 on the grocery item
  unit2Conversion?: number | null; // when addUnit2: 1 unit2 = unit2Conversion × unit1 (stored on the item)
  newItem?: {                       // new item to create
    name: string;
    unit: string | null;
    unit2?: string | null;
    category: string | null;
  };
};

type ConfirmedRecipe = {
  name: string;
  servings: number | null;
  batch: boolean;
  time: number | null;
  difficulty: string | null;
  category: string | null;
  link: string | null;
  image: string | null;
  favorite: boolean;
  createdAt?: string | null;
  ingredients: ConfirmedIngredient[];
  instructions: Array<{ text: string; isSection: boolean }>;
};

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Declared outside the try so a mid-loop failure can still report what was imported.
  const created: string[] = [];
  const newIngredientCount: number[] = [];

  try {
    const { recipes, newUnitRules = [] } = (await req.json()) as {
      recipes: ConfirmedRecipe[];
      newUnitRules?: Array<{ name: string; foreignUnit: string; targetUnit: string; factor: number }>;
    };
    await saveUnitRules(newUnitRules);

    // Save manually resolved ingredient mappings
    const newIngredientMappings: Array<{ rawName: string; groceryItemId: string; groceryItemName: string }> = [];
    for (const recipe of recipes) {
      for (const ing of recipe.ingredients) {
        if (ing.saveMapping && ing.groceryItemId && ing.groceryItemName) {
          newIngredientMappings.push({ rawName: ing.name, groceryItemId: ing.groceryItemId, groceryItemName: ing.groceryItemName });
        }
      }
    }
    await saveIngredientMappings(newIngredientMappings);

    if (!Array.isArray(recipes) || recipes.length === 0) {
      return NextResponse.json({ error: "No recipes to import" }, { status: 400 });
    }

    // Validate: every ingredient must have a groceryItemId or a newItem
    for (const recipe of recipes) {
      const unresolved = recipe.ingredients.filter(
        (ing) => !ing.groceryItemId && !ing.newItem
      );
      if (unresolved.length > 0) {
        return NextResponse.json(
          { error: `Recipe "${recipe.name}" has ${unresolved.length} unmatched ingredient(s): ${unresolved.map((i) => i.name).join(", ")}` },
          { status: 400 }
        );
      }
    }

    for (const recipeData of recipes) {
      const isBatch = recipeData.batch !== false;  // default true
      const originalServings = recipeData.servings && recipeData.servings > 0 ? recipeData.servings : 1;
      const savedServings = isBatch ? originalServings : 1;
      console.log(`[import] "${recipeData.name}" batch=${recipeData.batch} isBatch=${isBatch} servings=${recipeData.servings} originalServings=${originalServings} savedServings=${savedServings}`);

      // Resolve the image URL before opening the transaction (may upload to blob).
      const imageUrl = recipeData.image?.startsWith("data:image/")
        ? await saveBase64Image(recipeData.image)
        : recipeData.image ?? null;

      // Import each recipe atomically: Recipe + all its ingredients/instructions (and any
      // grocery-item upserts) commit together or not at all. A mid-recipe failure no longer
      // leaves a half-imported, ingredient-less recipe behind.
      const { recipeId, newItemsCreated } = await prisma.$transaction(async (tx) => {
        const recipe = await tx.recipe.create({
          data: {
            name: recipeData.name,
            servings: savedServings,
            time: recipeData.time,
            difficulty: recipeData.difficulty,
            category: recipeData.category,
            favorite: recipeData.favorite,
            link: recipeData.link,
            imageUrl,
            ...(recipeData.createdAt ? { createdAt: new Date(recipeData.createdAt) } : {}),
          },
        });

        let newItemsCreated = 0;

        // Create ingredients
        const sortedIngredients = [...recipeData.ingredients].sort(
          (a, b) => a.groupOrder - b.groupOrder || a.order - b.order
        );

        for (const ing of sortedIngredients) {
          let groceryItemId: string | null = ing.groceryItemId ?? null;

          // Set unit2 (and optionally the conversion) on existing grocery item if requested
          if (groceryItemId && ing.addUnit2 && ing.unit) {
            await tx.groceryItem.update({
              where: { id: groceryItemId },
              data: {
                unit2: ing.unit,
                ...(ing.unit2Conversion != null ? { conversion: ing.unit2Conversion } : {}),
              },
            });
          }

          // Create new GroceryItem if needed
          if (!groceryItemId && ing.newItem) {
            const existing = await tx.groceryItem.findFirst({
              where: { name: { equals: ing.newItem.name, mode: "insensitive" } },
            });

            if (existing) {
              groceryItemId = existing.id;
            } else {
              const createdItem = await tx.groceryItem.create({
                data: {
                  name: ing.newItem.name,
                  unit: ing.newItem.unit,
                  unit2: ing.newItem.unit2 ?? null,
                  category: ing.newItem.category,
                },
              });
              groceryItemId = createdItem.id;
              newItemsCreated++;
            }
          }

          // Divide qty by original servings only when batch=false (per-serving mode)
          const normalizedQty = ing.qty != null
            ? (isBatch ? ing.qty : ing.qty / originalServings)
            : null;

          await tx.ingredient.create({
            data: {
              recipeId: recipe.id,
              groceryItemId,
              quantity: normalizedQty,
              unit: ing.unit,
              notes: ing.obs ?? null,
              groupName: ing.groupName,
              groupOrder: ing.groupOrder,
              order: ing.order,
            },
          });
        }

        // Create instructions
        let order = 0;
        for (const inst of recipeData.instructions) {
          if (!inst.text.trim()) continue;
          order++;
          await tx.instruction.create({
            data: {
              recipeId: recipe.id,
              step: order,
              text: inst.text.trim(),
              isSection: inst.isSection,
              instrType: inst.isSection ? null : "numbered",
            },
          });
        }

        return { recipeId: recipe.id, newItemsCreated };
      }, { maxWait: 15_000, timeout: 30_000 });

      created.push(recipeId);
      newIngredientCount.push(newItemsCreated);
    }

    revalidatePath("/recipes");
    revalidatePath("/ingredients");

    return NextResponse.json({
      success: true,
      recipeIds: created,
      recipesCreated: created.length,
      newIngredientsCreated: newIngredientCount.reduce((a, b) => a + b, 0),
    });
  } catch (err) {
    console.error("[import/confirm] error:", err);
    // Some recipes may have committed before the failure (each is atomic). Refresh their
    // views and tell the client how many succeeded so the user knows where things stand.
    if (created.length > 0) {
      revalidatePath("/recipes");
      revalidatePath("/ingredients");
    }
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Internal error",
        recipesCreated: created.length,
        recipeIds: created,
        newIngredientsCreated: newIngredientCount.reduce((a, b) => a + b, 0),
      },
      { status: 500 }
    );
  }
}
