"use server";

import { prisma } from "./db";
import type { Prisma } from "@/app/generated/prisma/client";
import { ingredientGrams } from "./nutrition";
import { buildRecipeSearchText, normalizeSearch } from "./search";
import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";

// Generous limits: a large recipe recreates many rows sequentially, and each
// round-trip to Neon adds latency — the default 5s interactive-tx timeout is too tight.
const RECIPE_TX_OPTS = { maxWait: 15_000, timeout: 30_000 } as const;

// ─── Recipe Form Types ────────────────────────────────────────────────────────

export type RecipeFormInput = {
  name: string;
  nameRo?: string | null;
  categories: string[];
  servings: number | null;
  time: number | null;
  difficulty: string | null;
  favorite: boolean;
  link: string | null;
  imageUrl: string | null;
  ingredients: Array<{
    groceryItemName: string;
    quantity: number | null;
    unit: string | null;
    notes?: string | null;
    groupOrder: number;
    groupName: string | null;
    order: number;
  }>;
  instructions: Array<{
    text: string;
    isSection: boolean;
    step: number;
    instrType?: string | null;
  }>;
};

// ─── Grocery Item Search ──────────────────────────────────────────────────────

export async function searchGroceryItems(query: string) {
  if (query.trim().length < 2) return [];
  return prisma.groceryItem.findMany({
    where: {
      OR: [
        { name:   { contains: query, mode: "insensitive" } },
        { nameRo: { contains: query, mode: "insensitive" } },
      ],
    },
    take: 10,
    orderBy: { name: "asc" },
    select: { id: true, name: true, nameRo: true, unit: true, unit2: true },
  });
}

export async function getGroceryItemDetails(id: string) {
  return prisma.groceryItem.findUnique({
    where: { id },
    select: {
      id: true, name: true, nameRo: true, category: true, unit: true, unit2: true,
      conversion: true, kcal: true, carbs: true, fat: true, protein: true, unitWeight: true,
    },
  });
}

// ─── Recipe CRUD ──────────────────────────────────────────────────────────────

// Runs against a transaction client (tx) so recipe + ingredients + instructions
// are created all-or-nothing by the caller.
async function buildIngredientsAndInstructions(
  tx: Prisma.TransactionClient,
  recipeId: string,
  data: RecipeFormInput
) {
  for (const ing of data.ingredients) {
    if (!ing.groceryItemName.trim()) continue;

    // Case-insensitive lookup: "Flour" and "flour" are the same item. Matching
    // exactly (case-sensitive) would create a near-duplicate GroceryItem row.
    const trimmedName = ing.groceryItemName.trim();
    let groceryItem = await tx.groceryItem.findFirst({
      where: { name: { equals: trimmedName, mode: "insensitive" } },
    });
    if (!groceryItem) {
      groceryItem = await tx.groceryItem.create({
        data: { name: trimmedName, unit: ing.unit ?? null },
      });
    }

    await tx.ingredient.create({
      data: {
        recipeId,
        groceryItemId: groceryItem.id,
        quantity: ing.quantity,
        unit: ing.unit ?? groceryItem.unit,
        notes: ing.notes ?? null,
        groupOrder: ing.groupOrder,
        groupName: ing.groupName ?? null,
        order: ing.order,
      },
    });
  }

  let order = 0;
  for (const inst of data.instructions) {
    if (!inst.text.trim()) continue;
    order++;
    await tx.instruction.create({
      data: {
        recipeId,
        step: order,
        text: inst.text.trim(),
        isSection: inst.isSection,
        instrType: inst.isSection ? null : (inst.instrType ?? "numbered"),
      },
    });
  }
}

// Best-effort translation of a recipe title into the other language (RO↔EN) for search.
// Returns null if no API key or on any error — searchText then falls back to the original title.
async function translateTitleAlt(title: string): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY || !title.trim()) return null;
  try {
    const anthropic = new Anthropic();
    const res = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 80,
      system:
        "You translate a single recipe title between Romanian and English. " +
        "If the title is in English, translate it to Romanian; if it is in Romanian, translate it to English. " +
        "Reply with ONLY the translated title — no quotes, no explanation. Keep brand/proper names as-is.",
      messages: [{ role: "user", content: title.trim() }],
    });
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    return text || null;
  } catch (e) {
    console.error("translateTitleAlt:", e);
    return null;
  }
}

export async function createRecipe(data: RecipeFormInput): Promise<string> {
  // Translation is an external API call — keep it out of the transaction.
  const nameRo = data.nameRo?.trim() || (await translateTitleAlt(data.name));
  const recipeId = await prisma.$transaction(async (tx) => {
    const recipe = await tx.recipe.create({
      data: {
        name: data.name,
        nameRo,
        searchText: buildRecipeSearchText(data.name, nameRo),
        category: data.categories.length > 0 ? data.categories.join(", ") : null,
        servings: data.servings,
        time: data.time,
        difficulty: data.difficulty,
        favorite: data.favorite,
        link: data.link,
        imageUrl: data.imageUrl ?? null,
      },
    });
    await buildIngredientsAndInstructions(tx, recipe.id, data);
    return recipe.id;
  }, RECIPE_TX_OPTS);
  revalidatePath("/recipes");
  return recipeId;
}

export async function updateRecipe(
  id: string,
  data: RecipeFormInput
): Promise<void> {
  let nameRo: string | null = data.nameRo?.trim() || null;
  if (!nameRo) {
    // no manual value from the form — reuse the stored one, or (re)translate on title change
    const existing = await prisma.recipe.findUnique({ where: { id }, select: { name: true, nameRo: true } });
    nameRo = existing?.nameRo ?? null;
    if (!existing || existing.name !== data.name || !nameRo) {
      nameRo = await translateTitleAlt(data.name);
    }
  }
  // Update + wipe + rebuild must be atomic: without a transaction, a failure
  // after deleteMany leaves the recipe with no ingredients/instructions.
  await prisma.$transaction(async (tx) => {
    await tx.recipe.update({
      where: { id },
      data: {
        name: data.name,
        nameRo,
        searchText: buildRecipeSearchText(data.name, nameRo),
        category: data.categories.length > 0 ? data.categories.join(", ") : null,
        servings: data.servings,
        time: data.time,
        difficulty: data.difficulty,
        favorite: data.favorite,
        link: data.link,
        imageUrl: data.imageUrl ?? null,
      },
    });
    await tx.ingredient.deleteMany({ where: { recipeId: id } });
    await tx.instruction.deleteMany({ where: { recipeId: id } });
    await buildIngredientsAndInstructions(tx, id, data);
  }, RECIPE_TX_OPTS);
  revalidatePath("/recipes");
  revalidatePath(`/recipes/${id}`);
}

export async function deleteRecipe(id: string): Promise<void> {
  await prisma.recipe.delete({ where: { id } });
  revalidatePath("/recipes");
}

export async function deleteRecipes(ids: string[]): Promise<void> {
  await prisma.recipe.deleteMany({ where: { id: { in: ids } } });
  revalidatePath("/recipes");
}

export async function toggleFavorite(id: string, favorite: boolean): Promise<void> {
  await prisma.recipe.update({ where: { id }, data: { favorite } });
  revalidatePath(`/recipes/${id}`);
  revalidatePath("/recipes");
}

// ─── Recipes ─────────────────────────────────────────────────────────────────

export async function getRecipes(search?: string, category?: string, favorites?: boolean, sort?: string) {
  const orderBy =
    sort === "date_asc"  ? { createdAt: "asc"  as const } :
    sort === "date_desc" ? { createdAt: "desc" as const } :
                           { name: "asc" as const };

  return prisma.recipe.findMany({
    where: {
      AND: [
        search
          ? {
              OR: [
                { searchText: { contains: normalizeSearch(search) } },
                { name: { contains: search, mode: "insensitive" } },
                { ingredients: { some: { groceryItem: { name:   { contains: search, mode: "insensitive" } } } } },
                { ingredients: { some: { groceryItem: { nameRo: { contains: search, mode: "insensitive" } } } } },
              ],
            }
          : {},
        category ? { category: { contains: category, mode: "insensitive" } } : {},
        favorites ? { favorite: true } : {},
      ],
    },
    orderBy,
    select: {
      id: true,
      name: true,
      category: true,
      time: true,
      servings: true,
      difficulty: true,
      favorite: true,
      imageUrl: true,
    },
  });
}

export async function getRecipe(id: string) {
  return prisma.recipe.findUnique({
    where: { id },
    include: {
      ingredients: {
        include: { groceryItem: true },
        orderBy: [{ groupOrder: "asc" }, { order: "asc" }],
      },
      instructions: {
        orderBy: [{ step: "asc" }],
      },
    },
  });
}

// Recipes that reference a given grocery item (reverse lookup for the ingredient card).
export async function getRecipesUsingGroceryItem(groceryItemId: string) {
  return prisma.recipe.findMany({
    where: { ingredients: { some: { groceryItemId } } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, imageUrl: true },
  });
}

export async function searchRecipesForPlanner(query: string) {
  return prisma.recipe.findMany({
    where: {
      OR: [
        { searchText: { contains: normalizeSearch(query) } },
        { name: { contains: query, mode: "insensitive" } },
        { ingredients: { some: { groceryItem: { name:   { contains: query, mode: "insensitive" } } } } },
        { ingredients: { some: { groceryItem: { nameRo: { contains: query, mode: "insensitive" } } } } },
      ],
    },
    take: 10,
    orderBy: { name: "asc" },
    select: { id: true, name: true, category: true, servings: true, imageUrl: true },
  });
}

export async function getRecipesPanel(search?: string, category?: string, favorites?: boolean) {
  return prisma.recipe.findMany({
    where: {
      AND: [
        search
          ? {
              OR: [
                { searchText: { contains: normalizeSearch(search) } },
                { name: { contains: search, mode: "insensitive" } },
                { ingredients: { some: { groceryItem: { name:   { contains: search, mode: "insensitive" } } } } },
                { ingredients: { some: { groceryItem: { nameRo: { contains: search, mode: "insensitive" } } } } },
              ],
            }
          : {},
        category ? { category: { contains: category, mode: "insensitive" } } : {},
        favorites ? { favorite: true } : {},
      ],
    },
    take: 80,
    orderBy: { name: "asc" },
    select: { id: true, name: true, category: true, servings: true, imageUrl: true, favorite: true },
  });
}

export async function getRecipeCategories(): Promise<string[]> {
  const recipes = await prisma.recipe.findMany({
    where: { category: { not: null } },
    select: { category: true },
  });
  const cats = new Set<string>();
  for (const r of recipes) {
    if (r.category) {
      for (const cat of r.category.split(",")) {
        const t = cat.trim();
        if (t) cats.add(t);
      }
    }
  }
  return Array.from(cats).sort();
}

// ─── Week Plan ────────────────────────────────────────────────────────────────

export async function getWeekPlan(weekStartIso: string) {
  const weekStart = new Date(weekStartIso);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  return prisma.weekPlan.findMany({
    where: {
      weekStart: { gte: weekStart, lt: weekEnd },
    },
    include: {
      recipe: {
        select: { id: true, name: true, category: true, servings: true, imageUrl: true },
      },
    },
  });
}

export async function getWeekNutrition(
  weekStartIso: string
): Promise<Record<number, { kcal: number; carbs: number; fat: number; protein: number }>> {
  const weekStart = new Date(weekStartIso);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const plans = await prisma.weekPlan.findMany({
    where: { weekStart: { gte: weekStart, lt: weekEnd } },
    include: {
      recipe: {
        select: {
          servings: true,
          ingredients: { include: { groceryItem: true } },
        },
      },
    },
  });

  const totals: Record<number, { kcal: number; carbs: number; fat: number; protein: number }> = {};

  for (const plan of plans) {
    const recipeServings = plan.recipe.servings || 1;
    const scale = plan.servings / recipeServings;

    for (const ing of plan.recipe.ingredients) {
      if (!ing.groceryItem || !ing.quantity) continue;
      const gi = ing.groceryItem;
      if (!gi.kcal && !gi.protein) continue;
      const grams = ingredientGrams(ing.quantity, ing.unit, gi);
      if (grams == null) continue;
      const factor = (grams * scale) / 100;
      if (!totals[plan.dayOfWeek]) totals[plan.dayOfWeek] = { kcal: 0, carbs: 0, fat: 0, protein: 0 };
      totals[plan.dayOfWeek].kcal    += (gi.kcal    ?? 0) * factor;
      totals[plan.dayOfWeek].carbs   += (gi.carbs   ?? 0) * factor;
      totals[plan.dayOfWeek].fat     += (gi.fat     ?? 0) * factor;
      totals[plan.dayOfWeek].protein += (gi.protein ?? 0) * factor;
    }
  }

  return totals;
}

export async function addToWeekPlan(data: {
  recipeId: string;
  weekStartIso: string;
  dayOfWeek: number;
  mealType: string;
  servings: number;
}): Promise<{ id: string }> {
  const weekStart = new Date(data.weekStartIso);
  // Guard against 0 / negative / NaN servings and out-of-range days: these feed
  // scale = servings / recipeServings in the grocery list + nutrition, where a bad
  // value silently hides ingredients or produces negative quantities.
  const servings = Math.max(1, Math.round(data.servings || 1));
  const dayOfWeek = Number.isFinite(data.dayOfWeek)
    ? Math.min(6, Math.max(0, Math.round(data.dayOfWeek)))
    : 0;
  const entry = await prisma.weekPlan.create({
    data: {
      recipeId: data.recipeId,
      weekStart,
      dayOfWeek,
      mealType: data.mealType,
      servings,
    },
    select: { id: true },
  });
  revalidatePath("/grocery-list");
  return entry;
}

export async function removeFromWeekPlan(id: string) {
  await prisma.weekPlan.delete({ where: { id } });
  revalidatePath("/planner");
  revalidatePath("/grocery-list");
}

export async function updateWeekPlanServings(id: string, servings: number): Promise<void> {
  const safe = Math.max(1, Math.round(servings || 1));
  await prisma.weekPlan.update({ where: { id }, data: { servings: safe } });
  revalidatePath("/planner");
  revalidatePath("/grocery-list");
}

// Move an existing plan entry to another day/meal slot (drag-and-drop reorder).
// Same clamping as addToWeekPlan: dayOfWeek 0–6, so a bad drop target can't corrupt the row.
export async function moveWeekPlanEntry(
  id: string,
  dayOfWeek: number,
  mealType: string
): Promise<void> {
  const safeDay = Number.isFinite(dayOfWeek)
    ? Math.min(6, Math.max(0, Math.round(dayOfWeek)))
    : 0;
  await prisma.weekPlan.update({
    where: { id },
    data: { dayOfWeek: safeDay, mealType },
  });
  revalidatePath("/planner");
  revalidatePath("/grocery-list");
}

// ─── Grocery List ─────────────────────────────────────────────────────────────

type GroceryEntry = {
  id: string;
  name: string;
  quantity: number;
  unit: string | null;
  category: string;
  // true for hand-added items (GroceryListItem) — the UI shows a delete affordance
  // for these; recipe-derived lines can't be deleted directly. The `id` of a manual
  // entry is `manual::<dbId>` so the client can recover the row id to delete.
  manual?: boolean;
};

export async function getGroceryList(
  weekStartIso: string
): Promise<Record<string, GroceryEntry[]>> {
  const weekStart = new Date(weekStartIso);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const plans = await prisma.weekPlan.findMany({
    where: { weekStart: { gte: weekStart, lt: weekEnd } },
    include: {
      recipe: {
        include: {
          ingredients: {
            include: { groceryItem: true },
          },
        },
      },
    },
  });

  const map = new Map<
    string,
    { name: string; quantity: number; unit: string | null; category: string }
  >();

  for (const plan of plans) {
    const recipeServings = plan.recipe.servings || 1;
    const scale = plan.servings / recipeServings;

    for (const ing of plan.recipe.ingredients) {
      if (!ing.groceryItem) continue;
      const unit = ing.unit ?? ing.groceryItem.unit;
      // Key by item AND unit: never sum incompatible units (e.g. 200 g + 1 cup)
      // into a nonsense total. Same-unit lines still aggregate; mixed-unit ones
      // show as separate lines on the list — correct rather than misleading.
      const key = `${ing.groceryItem.id}::${(unit ?? "").trim().toLowerCase()}`;
      const qty = (ing.quantity || 0) * scale;

      if (map.has(key)) {
        map.get(key)!.quantity += qty;
      } else {
        map.set(key, {
          name: ing.groceryItem.name,
          quantity: qty,
          unit,
          category: ing.groceryItem.category ?? "Other",
        });
      }
    }
  }

  const grouped: Record<string, GroceryEntry[]> = {};
  for (const [id, data] of map) {
    const cat = data.category;
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push({
      id,
      name: data.name,
      quantity: Math.round(data.quantity * 10) / 10,
      unit: data.unit,
      category: cat,
    });
  }

  // Merge in this week's hand-added products.
  const manual = await prisma.groceryListItem.findMany({
    where: { weekStart: { gte: weekStart, lt: weekEnd } },
  });
  for (const m of manual) {
    const cat = m.category || "Other";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push({
      id: `manual::${m.id}`,
      name: m.name,
      quantity: m.quantity ?? 0,
      unit: m.unit,
      category: cat,
      manual: true,
    });
  }

  // Sort items within each category
  for (const cat of Object.keys(grouped)) {
    grouped[cat].sort((a, b) => a.name.localeCompare(b.name));
  }

  return grouped;
}

// Add a product to a specific week's shopping list by hand (not from a recipe).
// Scoped to the week's Monday so it only appears on that week.
export async function addGroceryListItem(
  weekStartIso: string,
  data: { name: string; quantity?: number | null; unit?: string | null; category?: string | null }
): Promise<GroceryEntry> {
  const name = data.name.trim();
  if (!name) throw new Error("The item name is missing");
  const item = await prisma.groceryListItem.create({
    data: {
      weekStart: new Date(weekStartIso),
      name,
      quantity: data.quantity != null && data.quantity > 0 ? data.quantity : null,
      unit: data.unit?.trim() || null,
      category: data.category?.trim() || "Other",
    },
  });
  revalidatePath("/grocery-list");
  return {
    id: `manual::${item.id}`,
    name: item.name,
    quantity: item.quantity ?? 0,
    unit: item.unit,
    category: item.category,
    manual: true,
  };
}

// Delete a hand-added product. `id` is the bare GroceryListItem id (the client
// strips the `manual::` prefix before calling).
export async function deleteGroceryListItem(id: string): Promise<void> {
  await prisma.groceryListItem.delete({ where: { id } });
  revalidatePath("/grocery-list");
}

// ─── Ingredients Page ─────────────────────────────────────────────────────────

export async function createGroceryItem(data: {
  name: string;
  nameRo?: string | null;
  category?: string | null;
  unit?: string | null;
  unit2?: string | null;
  conversion?: number | null;
  kcal?: number | null;
  carbs?: number | null;
  fat?: number | null;
  protein?: number | null;
  unitWeight?: number | null;
}): Promise<{ id: string; name: string; nameRo: string | null; category: string | null; unit: string | null; unit2: string | null; conversion: number | null; kcal: number | null; carbs: number | null; fat: number | null; protein: number | null; unitWeight: number | null }> {
  const item = await prisma.groceryItem.create({ data });
  revalidatePath("/ingredients");
  return { id: item.id, name: item.name, nameRo: item.nameRo, category: item.category, unit: item.unit, unit2: item.unit2, conversion: item.conversion, kcal: item.kcal, carbs: item.carbs, fat: item.fat, protein: item.protein, unitWeight: item.unitWeight };
}

export async function updateGroceryItem(
  id: string,
  data: {
    name?: string;
    nameRo?: string | null;
    category?: string | null;
    unit?: string | null;
    unit2?: string | null;
    conversion?: number | null;
    kcal?: number | null;
    carbs?: number | null;
    fat?: number | null;
    protein?: number | null;
    unitWeight?: number | null;
  }
): Promise<void> {
  await prisma.groceryItem.update({ where: { id }, data });
  // Recipe pages render this item's name/nutrition — refresh them so an edit here
  // (e.g. changing kcal or a unit) isn't stale on the recipe detail / grocery list.
  revalidatePath("/recipes");
  revalidatePath("/grocery-list");
}

// Deleting a grocery item would set groceryItemId = null on every ingredient that
// references it (optional relation → ON DELETE SET NULL). Since an ingredient's name
// comes from its grocery item, that silently turns those rows into nameless orphans in
// recipes — shared between both users. So we refuse to delete an item still in use and
// let the caller tell the user to remove it from the recipes first.
export async function deleteGroceryItem(
  id: string
): Promise<{ ok: true } | { ok: false; usedIn: number }> {
  const usedIn = await prisma.ingredient.count({ where: { groceryItemId: id } });
  if (usedIn > 0) return { ok: false, usedIn };
  await prisma.groceryItem.delete({ where: { id } });
  revalidatePath("/ingredients");
  revalidatePath("/recipes");
  return { ok: true };
}

// Bulk variant: deletes only the unreferenced items, reports the rest as blocked.
export async function deleteGroceryItems(
  ids: string[]
): Promise<{ deleted: string[]; blocked: { id: string; name: string; uses: number }[] }> {
  if (ids.length === 0) return { deleted: [], blocked: [] };

  const refRows = await prisma.ingredient.findMany({
    where: { groceryItemId: { in: ids } },
    select: { groceryItemId: true },
  });
  const useCount = new Map<string, number>();
  for (const row of refRows) {
    if (!row.groceryItemId) continue;
    useCount.set(row.groceryItemId, (useCount.get(row.groceryItemId) ?? 0) + 1);
  }

  const deletableIds = ids.filter((id) => !useCount.has(id));
  const blockedIds = ids.filter((id) => useCount.has(id));

  const blocked: { id: string; name: string; uses: number }[] = [];
  if (blockedIds.length > 0) {
    const items = await prisma.groceryItem.findMany({
      where: { id: { in: blockedIds } },
      select: { id: true, name: true },
    });
    for (const it of items) blocked.push({ id: it.id, name: it.name, uses: useCount.get(it.id) ?? 0 });
  }

  if (deletableIds.length > 0) {
    await prisma.groceryItem.deleteMany({ where: { id: { in: deletableIds } } });
    revalidatePath("/ingredients");
    revalidatePath("/recipes");
  }

  return { deleted: deletableIds, blocked };
}

export async function setGroceryItemsCategory(ids: string[], category: string | null): Promise<void> {
  if (ids.length === 0) return;
  await prisma.groceryItem.updateMany({ where: { id: { in: ids } }, data: { category } });
  revalidatePath("/ingredients");
}

export async function getGroceryCategories(): Promise<string[]> {
  const items = await prisma.groceryItem.findMany({
    select: { category: true },
    distinct: ["category"],
    orderBy: { category: "asc" },
  });
  return items.map((i) => i.category).filter((c): c is string => c != null);
}

export async function getGroceryItems() {
  return prisma.groceryItem.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      nameRo: true,
      category: true,
      unit: true,
      unit2: true,
      conversion: true,
      kcal: true,
      carbs: true,
      fat: true,
      protein: true,
      unitWeight: true,
      createdAt: true,
    },
  });
}

// ─── Unit audit ───────────────────────────────────────────────────────────────
// Surfaces the two systematic import problems that break nutrition:
//  1. grocery items used "by the piece" (non-mass unit) but missing unitWeight —
//     these silently contribute 0 (or wrong) nutrition. Same condition under which
//     ingredientGrams() returns null.
//  2. ingredient rows whose stored unit isn't one of the grocery item's units.

export type MissingUnitWeightRow = {
  id: string;
  name: string;
  nameRo: string | null;
  unit: string | null;
  unit2: string | null;
  conversion: number | null;
  uses: number;
  recipes: number;
  sampleRecipes: string[];
  badUnits: string[]; // the ingredient units that can't be converted to grams
};

export type UnitMismatchRow = {
  ingredientId: string;
  groceryItemId: string;
  recipeId: string;
  recipeName: string;
  itemName: string;
  ingUnit: string | null;
  itemUnit: string | null;
  itemUnit2: string | null;
};

export async function getUnitAudit(): Promise<{
  missingUnitWeight: MissingUnitWeightRow[];
  mismatches: UnitMismatchRow[];
}> {
  const missingUnitWeight = await prisma.$queryRawUnsafe<MissingUnitWeightRow[]>(`
    SELECT g.id, g.name, g."nameRo",
           g.unit, g.unit2, g.conversion,
           COUNT(*)::int AS uses,
           COUNT(DISTINCT i."recipeId")::int AS recipes,
           (ARRAY_AGG(DISTINCT r.name))[1:3] AS "sampleRecipes",
           ARRAY_AGG(DISTINCT COALESCE(i.unit, g.unit)) AS "badUnits"
    FROM "Ingredient" i
    JOIN "GroceryItem" g ON g.id = i."groceryItemId"
    JOIN "Recipe" r ON r.id = i."recipeId"
    WHERE g."unitWeight" IS NULL
      AND i.quantity IS NOT NULL
      -- only items whose nutrition actually matters (mirrors the nutrition skip)
      AND (COALESCE(g.kcal, 0) <> 0 OR COALESCE(g.protein, 0) <> 0)
      AND lower(COALESCE(i.unit, g.unit, '')) NOT IN ('g', 'ml')
      AND NOT (
        g.unit2 IS NOT NULL AND lower(COALESCE(i.unit, '')) = lower(g.unit2)
        AND g.conversion IS NOT NULL AND lower(COALESCE(g.unit, '')) IN ('g', 'ml')
      )
    GROUP BY g.id, g.name, g."nameRo", g.unit, g.unit2, g.conversion
    ORDER BY uses DESC, g.name ASC
  `);

  const mismatches = await prisma.$queryRawUnsafe<UnitMismatchRow[]>(`
    SELECT i.id AS "ingredientId", g.id AS "groceryItemId", i."recipeId", r.name AS "recipeName",
           g.name AS "itemName", i.unit AS "ingUnit",
           g.unit AS "itemUnit", g.unit2 AS "itemUnit2"
    FROM "Ingredient" i
    JOIN "GroceryItem" g ON g.id = i."groceryItemId"
    JOIN "Recipe" r ON r.id = i."recipeId"
    WHERE i.unit IS NOT NULL AND i.unit <> ''
      AND lower(i.unit) <> lower(COALESCE(g.unit, ''))
      AND lower(i.unit) <> lower(COALESCE(g.unit2, ''))
    ORDER BY g.name ASC, r.name ASC
  `);

  return { missingUnitWeight, mismatches };
}

export async function getRecipeWeekPlanServings(
  recipeId: string,
  weekStartIso: string
): Promise<number> {
  const weekStart = new Date(weekStartIso);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const plans = await prisma.weekPlan.findMany({
    where: { recipeId, weekStart: { gte: weekStart, lt: weekEnd } },
    select: { servings: true },
  });
  return plans.reduce((sum, p) => sum + p.servings, 0);
}
