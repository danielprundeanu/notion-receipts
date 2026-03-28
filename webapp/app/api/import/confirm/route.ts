import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const UNIT_CHOICES_PATH = path.resolve(process.cwd(), "../data/unit_choices.json");
const INGREDIENT_MAPPINGS_PATH = path.resolve(process.cwd(), "../data/ingredient_name_mappings.json");

function saveIngredientMappings(mappings: Array<{ rawName: string; groceryItemId: string; groceryItemName: string }>) {
  if (mappings.length === 0) return;
  let data: Record<string, { groceryItemId: string; groceryItemName: string }> = {};
  try { data = JSON.parse(fs.readFileSync(INGREDIENT_MAPPINGS_PATH, "utf-8")); } catch { /* new file */ }
  for (const m of mappings) {
    data[m.rawName.toLowerCase().trim()] = { groceryItemId: m.groceryItemId, groceryItemName: m.groceryItemName };
  }
  fs.writeFileSync(INGREDIENT_MAPPINGS_PATH, JSON.stringify(data, null, 2), "utf-8");
}

function saveUnitRules(rules: Array<{ name: string; foreignUnit: string; targetUnit: string; factor: number }>) {
  if (rules.length === 0) return;
  let choices: Record<string, unknown> = {};
  try { choices = JSON.parse(fs.readFileSync(UNIT_CHOICES_PATH, "utf-8")); } catch { /* new file */ }
  for (const r of rules) {
    const key = `${r.name.toLowerCase()}|${r.foreignUnit.toLowerCase()}`;
    choices[key] = { action: "use_unit", unit: r.targetUnit, rate: r.factor, from_unit: r.foreignUnit };
  }
  fs.writeFileSync(UNIT_CHOICES_PATH, JSON.stringify(choices, null, 2), "utf-8");
}

function saveBase64Image(dataUrl: string): string {
  const m = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!m) return dataUrl;
  const ext = m[1].split("/")[1] ?? "jpg";
  const buf = Buffer.from(m[2], "base64");
  const hash = crypto.createHash("md5").update(buf).digest("hex");
  const filename = `${hash}.${ext}`;
  const dest = path.join(process.cwd(), "public", "images", "recipes", filename);
  if (!fs.existsSync(dest)) fs.writeFileSync(dest, buf);
  return `/images/recipes/${filename}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ConfirmedIngredient = {
  name: string;
  qty: number | null;
  unit: string | null;
  groupName: string | null;
  groupOrder: number;
  order: number;
  // Resolved match info
  groceryItemId?: string | null;   // existing item
  groceryItemName?: string | null; // name of matched item (for saving mapping)
  saveMapping?: boolean;           // true = user manually resolved, save to file
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
  try {
    const { recipes, newUnitRules = [] } = (await req.json()) as {
      recipes: ConfirmedRecipe[];
      newUnitRules?: Array<{ name: string; foreignUnit: string; targetUnit: string; factor: number }>;
    };
    saveUnitRules(newUnitRules);

    // Save manually resolved ingredient mappings
    const newIngredientMappings: Array<{ rawName: string; groceryItemId: string; groceryItemName: string }> = [];
    for (const recipe of recipes) {
      for (const ing of recipe.ingredients) {
        if (ing.saveMapping && ing.groceryItemId && ing.groceryItemName) {
          newIngredientMappings.push({ rawName: ing.name, groceryItemId: ing.groceryItemId, groceryItemName: ing.groceryItemName });
        }
      }
    }
    saveIngredientMappings(newIngredientMappings);

    if (!Array.isArray(recipes) || recipes.length === 0) {
      return NextResponse.json({ error: "Nu sunt rețete de importat" }, { status: 400 });
    }

    // Validate: every ingredient must have a groceryItemId or a newItem
    for (const recipe of recipes) {
      const unresolved = recipe.ingredients.filter(
        (ing) => !ing.groceryItemId && !ing.newItem
      );
      if (unresolved.length > 0) {
        return NextResponse.json(
          { error: `Rețeta "${recipe.name}" are ${unresolved.length} ingredient(e) fără match: ${unresolved.map((i) => i.name).join(", ")}` },
          { status: 400 }
        );
      }
    }

    const created: string[] = [];
    const newIngredientCount: number[] = [];

    for (const recipeData of recipes) {
      const isBatch = recipeData.batch !== false;  // default true
      const originalServings = recipeData.servings && recipeData.servings > 0 ? recipeData.servings : 1;
      const savedServings = isBatch ? originalServings : 1;

      // Create recipe
      const recipe = await prisma.recipe.create({
        data: {
          name: recipeData.name,
          servings: savedServings,
          time: recipeData.time,
          difficulty: recipeData.difficulty,
          category: recipeData.category,
          favorite: recipeData.favorite,
          link: recipeData.link,
          imageUrl: recipeData.image?.startsWith("data:image/")
            ? saveBase64Image(recipeData.image)
            : recipeData.image ?? null,
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

        // Create new GroceryItem if needed
        if (!groceryItemId && ing.newItem) {
          const existing = await prisma.groceryItem.findFirst({
            where: { name: { equals: ing.newItem.name, mode: "insensitive" } },
          });

          if (existing) {
            groceryItemId = existing.id;
          } else {
            const created = await prisma.groceryItem.create({
              data: {
                name: ing.newItem.name,
                unit: ing.newItem.unit,
                unit2: ing.newItem.unit2 ?? null,
                category: ing.newItem.category,
              },
            });
            groceryItemId = created.id;
            newItemsCreated++;
          }
        }

        // Divide qty by original servings only when batch=false (per-serving mode)
        const normalizedQty = ing.qty != null
          ? (isBatch ? ing.qty : ing.qty / originalServings)
          : null;

        await prisma.ingredient.create({
          data: {
            recipeId: recipe.id,
            groceryItemId,
            quantity: normalizedQty,
            unit: ing.unit,
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
        await prisma.instruction.create({
          data: {
            recipeId: recipe.id,
            step: order,
            text: inst.text.trim(),
            isSection: inst.isSection,
            instrType: inst.isSection ? null : "numbered",
          },
        });
      }

      created.push(recipe.id);
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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Eroare internă" },
      { status: 500 }
    );
  }
}
