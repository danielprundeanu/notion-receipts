// Recipe import core, shared by the import wizard's API routes (app/api/import/parse,
// app/api/import/confirm) and the CLI importer (scripts/import-recipe.ts). Keep
// Next-only calls (revalidatePath, NextResponse) in the routes so this runs from tsx too.
import { prisma } from "./db";
import { buildRecipeSearchText } from "./search";
import type { RawRecipe } from "./recipe-scraper";
import { REF_UNITS, type RefUnit } from "./recipe-refs";
import fs from "fs";
import path from "path";
import crypto from "crypto";

type UnitChoice = { action: string; unit: string; rate: number; from_unit?: string | null };
type IngredientNameMapping = { groceryItemId: string; groceryItemName: string };

// ─── Types ────────────────────────────────────────────────────────────────────

export type ParsedIngredient = {
  name: string;
  qty: number | null;
  unit: string | null;
  obs: string | null;
  groupName: string | null;
  groupOrder: number;
  order: number;
};

export type IngredientMatch = {
  status: "matched" | "similar" | "new";
  groceryItemId?: string;
  groceryItemName?: string;
  groceryItemUnit?: string | null;
  groceryItemUnit2?: string | null;
  candidates?: Array<{ id: string; name: string; unit: string | null; unit2?: string | null }>;
};

export type UnitConflict = {
  foreignUnit: string;           // unitatea din rețetă (ex: "cup")
  allowedUnits: string[];        // [unit, unit2] ale grocery item-ului
  autoResolved: boolean;         // true dacă există deja o regulă salvată (UnitRule)
  targetUnit?: string;           // cunoscut dacă autoResolved
  factor?: number;               // factor de conversie cunoscut
};

export type ReviewIngredient = ParsedIngredient & {
  match: IngredientMatch;
  unitConflict?: UnitConflict;
};

export type ParsedRecipe = {
  name: string;
  servings: number | null;
  batch: boolean;            // true = per batch (N porții), false = per serving (÷N, salvat cu servings=1)
  time: number | null;
  difficulty: string | null;
  category: string | null;
  link: string | null;
  image: string | null;
  favorite: boolean;
  ingredients: ReviewIngredient[];
  instructions: Array<{ text: string; isSection: boolean }>;
};

export type ConfirmedIngredient = {
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
  saveMapping?: boolean;           // true = user manually resolved, remember it for future imports
  addUnit2?: boolean;              // true = set foreignUnit as unit2 on the grocery item
  unit2Conversion?: number | null; // when addUnit2: 1 unit2 = unit2Conversion × unit1 (stored on the item)
  newItem?: {                       // new item to create
    name: string;
    unit: string | null;
    unit2?: string | null;
    conversion?: number | null;     // 1 unit2 = conversion × unit (when the recipe unit ≠ item unit)
    category: string | null;
  };
};

export type ConfirmedRecipe = {
  name: string;
  nameRo?: string | null;          // alternate-language title, only used for search
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
  // Other recipes used inside this one: an existing recipe (refRecipeId) or one
  // imported earlier in the same payload (refIndex < this recipe's index — so a
  // new recipe can never close a loop). Not set by the wizard (CLI importer only).
  references?: Array<{
    refRecipeId?: string;
    refIndex?: number;
    quantity: number;
    unit: RefUnit;
    groupOrder: number;
  }>;
};

export type NewUnitRule = { name: string; foreignUnit: string; targetUnit: string; factor: number };

// Bad input (unresolved ingredients, nothing to import) — the route answers 400.
export class ImportInputError extends Error {}

// A failure after some recipes already committed (each recipe is atomic).
export class ImportFailure extends Error {
  constructor(message: string, public recipeIds: string[], public newIngredientsCreated: number) {
    super(message);
  }
}

// ─── Learned mappings & unit rules ────────────────────────────────────────────

// Saved unit-conversion choices, keyed "ingredientname|foreignunit" (from the UnitRule table).
async function loadUnitChoices(): Promise<Record<string, UnitChoice>> {
  const rules = await prisma.unitRule.findMany();
  const out: Record<string, UnitChoice> = {};
  for (const r of rules) out[r.key] = { action: "use_unit", unit: r.targetUnit, rate: r.rate, from_unit: r.foreignUnit };
  return out;
}

// Saved manual "raw name → grocery item" mappings (from the IngredientNameMapping table).
async function loadIngredientNameMappings(): Promise<Record<string, IngredientNameMapping>> {
  const rows = await prisma.ingredientNameMapping.findMany();
  const out: Record<string, IngredientNameMapping> = {};
  for (const m of rows) out[m.rawName] = { groceryItemId: m.groceryItemId, groceryItemName: m.groceryItemName };
  return out;
}

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
async function saveUnitRules(rules: NewUnitRule[]) {
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

// ─── Ingredient matching ──────────────────────────────────────────────────────

function similarity(a: string, b: string): number {
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();
  if (s1 === s2) return 1;
  if (s1.includes(s2) || s2.includes(s1)) return 0.85;

  // Bigram similarity
  const bigrams = (str: string) => {
    const bg = new Set<string>();
    for (let i = 0; i < str.length - 1; i++) bg.add(str.slice(i, i + 2));
    return bg;
  };
  const bg1 = bigrams(s1);
  const bg2 = bigrams(s2);
  const intersection = [...bg1].filter((x) => bg2.has(x)).length;
  return (2 * intersection) / (bg1.size + bg2.size);
}

async function matchIngredient(name: string, nameMappings: Record<string, IngredientNameMapping>): Promise<IngredientMatch> {
  const nameLower = name.toLowerCase().trim();

  // 0. Saved manual mapping
  const saved = nameMappings[nameLower];
  if (saved) {
    const item = await prisma.groceryItem.findUnique({
      where: { id: saved.groceryItemId },
      select: { id: true, name: true, unit: true, unit2: true },
    });
    if (item) {
      return {
        status: "matched",
        groceryItemId: item.id,
        groceryItemName: item.name,
        groceryItemUnit: item.unit,
        groceryItemUnit2: item.unit2,
      };
    }
  }

  // 1. Exact match (case-insensitive) — EN sau RO
  const exact = await prisma.groceryItem.findFirst({
    where: {
      OR: [
        { name:   { equals: name, mode: "insensitive" } },
        { nameRo: { equals: name, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, unit: true, unit2: true },
  });
  if (exact) {
    return {
      status: "matched",
      groceryItemId: exact.id,
      groceryItemName: exact.name,
      groceryItemUnit: exact.unit,
      groceryItemUnit2: exact.unit2,
    };
  }

  // 2. Contains search — EN și RO
  const firstWord = nameLower.split(" ")[0];
  const candidates = await prisma.groceryItem.findMany({
    where: {
      OR: [
        { name:   { contains: nameLower,  mode: "insensitive" } },
        { name:   { contains: firstWord,  mode: "insensitive" } },
        { nameRo: { contains: nameLower,  mode: "insensitive" } },
        { nameRo: { contains: firstWord,  mode: "insensitive" } },
      ],
    },
    take: 20,
    select: { id: true, name: true, nameRo: true, unit: true, unit2: true },
  });

  if (candidates.length === 0) {
    return { status: "new" };
  }

  // Score candidates — ia maximul dintre similaritatea EN și RO
  // Dacă scorul RO e mai bun, returnează nameRo ca display name (mai util pentru utilizator)
  const scored = candidates
    .map((c) => {
      const scoreEn = similarity(nameLower, c.name.toLowerCase());
      const scoreRo = c.nameRo ? similarity(nameLower, c.nameRo.toLowerCase()) : 0;
      const score = Math.max(scoreEn, scoreRo);
      const displayName = scoreRo > scoreEn && c.nameRo ? c.nameRo : c.name;
      return { ...c, score, displayName };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const best = scored[0];

  // High confidence → auto-match as "similar"
  if (best.score >= 0.8) {
    return {
      status: "similar",
      groceryItemId: best.id,
      groceryItemName: best.displayName,
      groceryItemUnit: best.unit,
      groceryItemUnit2: best.unit2,
      candidates: scored.map((c) => ({ id: c.id, name: c.displayName, unit: c.unit, unit2: c.unit2 })),
    };
  }

  // Low confidence → return as new but with candidates
  return {
    status: "new",
    candidates: scored.map((c) => ({ id: c.id, name: c.displayName, unit: c.unit, unit2: c.unit2 })),
  };
}

// Count-style units: a bare quantity ("2 eggs", "1 chicken breast") maps directly to
// one of these with no numeric conversion. Anything else (g, ml, cup, …) is a measure.
const COUNT_UNITS = new Set(["piece", "clove", "slice", "can", "stalk", "bunch", "head", "handful"]);

function resolveUnitConflict(
  ingName: string,
  foreignUnit: string,
  allowedUnits: string[],
  choices: Record<string, UnitChoice>
): UnitConflict {
  const key = `${ingName.toLowerCase()}|${foreignUnit.toLowerCase()}`;
  const choice = choices[key];
  if (choice && choice.action === "use_unit") {
    return { foreignUnit, allowedUnits, autoResolved: true, targetUnit: choice.unit, factor: choice.rate };
  }
  return { foreignUnit, allowedUnits, autoResolved: false };
}

// Match scraped/parsed recipes against the grocery items (plus learned mappings and
// unit rules) — the wizard's Review step input. Recipes with an `error` pass through.
export async function matchRawRecipes(rawRecipes: RawRecipe[]): Promise<ParsedRecipe[]> {
  const reviewRecipes: ParsedRecipe[] = [];

  // Load saved mappings + unit rules once (shared across all recipes in this request)
  const unitChoices = await loadUnitChoices();
  const nameMappings = await loadIngredientNameMappings();

  for (const r of rawRecipes) {
    if (r.error) {
      reviewRecipes.push({ ...(r as unknown as ParsedRecipe) });
      continue;
    }

    const matchedIngredients: ReviewIngredient[] = await Promise.all(
      r.ingredients.map(async (ing, idx) => {
        const match = ing.name ? await matchIngredient(ing.name, nameMappings) : { status: "new" as const };

        // Resolve the ingredient's effective unit + any conflict against the matched item.
        let effectiveUnit = ing.unit;
        let unitConflict: UnitConflict | undefined;

        // Bare count with no unit word ("1 chicken breast", "2 eggs"): treat a unit-less
        // quantity as a count so it becomes a proper "piece" item instead of silently
        // importing unit=null (which nutrition can't convert). For a matched item prefer
        // its own count unit; for a brand-new item default to "piece" (the new grocery
        // item is then created as a count item). A qty-less "salt to taste" needs no unit.
        if (!effectiveUnit && ing.qty != null) {
          const allowed = [match.groceryItemUnit, match.groceryItemUnit2].filter(Boolean) as string[];
          effectiveUnit = allowed.find((u) => COUNT_UNITS.has(u)) ?? "piece";
        }

        if (match.groceryItemId) {
          const allowed = [match.groceryItemUnit, match.groceryItemUnit2].filter(Boolean) as string[];
          // A count-style unit ("piece") synthesized for a weight/volume item flows through
          // the normal resolve path (prompting "1 piece = ? g") instead of silently importing.
          if (effectiveUnit && allowed.length > 0 && !allowed.includes(effectiveUnit)) {
            unitConflict = resolveUnitConflict(ing.name, effectiveUnit, allowed, unitChoices);
          }
        }

        return {
          name: ing.name,
          qty: ing.qty,
          unit: effectiveUnit,
          obs: ing.obs ?? null,
          groupName: ing.groupName,
          groupOrder: ing.groupOrder,
          order: idx,
          match,
          unitConflict,
        };
      })
    );

    reviewRecipes.push({
      name: r.name || "Untitled recipe",
      servings: r.servings,
      batch: r.batch ?? true,
      time: r.time,
      difficulty: r.difficulty,
      category: r.category,
      link: r.link,
      image: r.image,
      favorite: r.favorite,
      ingredients: matchedIngredients,
      instructions: r.instructions,
    });
  }

  return reviewRecipes;
}

// ─── Saving ───────────────────────────────────────────────────────────────────

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

// Save resolved recipes (the wizard's Import step). Throws ImportInputError on bad
// input and ImportFailure (with what did commit) when a recipe fails mid-way.
export async function importRecipes(
  recipes: ConfirmedRecipe[],
  newUnitRules: NewUnitRule[] = []
): Promise<{ recipeIds: string[]; newIngredientsCreated: number }> {
  const created: string[] = [];
  const newIngredientCount: number[] = [];
  const total = () => newIngredientCount.reduce((a, b) => a + b, 0);

  await saveUnitRules(newUnitRules);

  // Save manually resolved ingredient mappings
  const newIngredientMappings: Array<{ rawName: string; groceryItemId: string; groceryItemName: string }> = [];
  for (const recipe of recipes ?? []) {
    for (const ing of recipe.ingredients) {
      if (ing.saveMapping && ing.groceryItemId && ing.groceryItemName) {
        newIngredientMappings.push({ rawName: ing.name, groceryItemId: ing.groceryItemId, groceryItemName: ing.groceryItemName });
      }
    }
  }
  await saveIngredientMappings(newIngredientMappings);

  if (!Array.isArray(recipes) || recipes.length === 0) {
    throw new ImportInputError("No recipes to import");
  }

  // Validate: every ingredient must have a groceryItemId or a newItem
  for (const [ri, recipe] of recipes.entries()) {
    const unresolved = recipe.ingredients.filter((ing) => !ing.groceryItemId && !ing.newItem);
    if (unresolved.length > 0) {
      throw new ImportInputError(
        `Recipe "${recipe.name}" has ${unresolved.length} unmatched ingredient(s): ${unresolved.map((i) => i.name).join(", ")}`
      );
    }
    for (const ref of recipe.references ?? []) {
      const target = ref.refRecipeId ? "id" : ref.refIndex != null && ref.refIndex >= 0 && ref.refIndex < ri ? "index" : null;
      if (!target || !(ref.quantity > 0) || !REF_UNITS.includes(ref.unit)) {
        throw new ImportInputError(
          `Recipe "${recipe.name}" has an invalid reference (needs refRecipeId or an earlier refIndex, quantity > 0, unit ${REF_UNITS.join("/")})`
        );
      }
    }
  }

  try {
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
        const nameRo = recipeData.nameRo?.trim() || null;
        const recipe = await tx.recipe.create({
          data: {
            name: recipeData.name,
            nameRo,
            searchText: buildRecipeSearchText(recipeData.name, nameRo),
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
                  ...(ing.newItem.conversion != null ? { conversion: ing.newItem.conversion } : {}),
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

        for (const ref of recipeData.references ?? []) {
          await tx.recipeReference.create({
            data: {
              recipeId: recipe.id,
              refRecipeId: ref.refRecipeId ?? created[ref.refIndex!],
              quantity: ref.quantity,
              unit: ref.unit,
              groupOrder: ref.groupOrder,
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
  } catch (err) {
    throw new ImportFailure(err instanceof Error ? err.message : "Internal error", created, total());
  }

  return { recipeIds: created, newIngredientsCreated: total() };
}
