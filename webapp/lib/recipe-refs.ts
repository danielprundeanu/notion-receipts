// Recipe references ("a recipe inside a recipe"): loading the reference graph and
// flattening a recipe into the grocery-item ingredients it really needs.
// Server-only (uses prisma) — imported by lib/actions.ts.

import { prisma } from "@/lib/db";
import { ingredientGrams } from "@/lib/nutrition";
import type { GroceryItem } from "@/app/generated/prisma/client";

export type RefUnit = "serving" | "g";
export const REF_UNITS: RefUnit[] = ["serving", "g"];

// Nested references deeper than this are ignored (also a backstop against cycles).
const MAX_DEPTH = 5;

export type FlatIngredient = {
  id: string;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
  groceryItem: GroceryItem | null;
};

type GraphRecipe = {
  id: string;
  name: string;
  servings: number | null;
  imageUrl: string | null;
  ingredients: FlatIngredient[];
  references: Array<{ id: string; refRecipeId: string; quantity: number; unit: string; groupOrder: number }>;
};

export type RecipeGraph = Map<string, GraphRecipe>;

/** Load the given recipes plus every recipe they (transitively) reference. */
export async function loadRecipeGraph(rootIds: string[]): Promise<RecipeGraph> {
  const graph: RecipeGraph = new Map();
  let pending = [...new Set(rootIds)];
  for (let depth = 0; pending.length > 0 && depth <= MAX_DEPTH + 1; depth++) {
    const rows = await prisma.recipe.findMany({
      where: { id: { in: pending } },
      select: {
        id: true, name: true, servings: true, imageUrl: true,
        ingredients: {
          select: { id: true, quantity: true, unit: true, notes: true, groceryItem: true },
          orderBy: [{ groupOrder: "asc" }, { order: "asc" }],
        },
        references: {
          select: { id: true, refRecipeId: true, quantity: true, unit: true, groupOrder: true },
          orderBy: { groupOrder: "asc" },
        },
      },
    });
    for (const r of rows) graph.set(r.id, r);
    pending = [...new Set(rows.flatMap((r) => r.references.map((x) => x.refRecipeId)))]
      .filter((id) => !graph.has(id));
  }
  return graph;
}

/** Total grams of a list of ingredients (only the ones convertible to grams). */
export function totalGrams(ings: FlatIngredient[]): number {
  let sum = 0;
  for (const ing of ings) {
    if (!ing.groceryItem || !ing.quantity) continue;
    const g = ingredientGrams(ing.quantity, ing.unit, ing.groceryItem);
    if (g != null) sum += g;
  }
  return sum;
}

/**
 * Multiplier applied to the referenced recipe's ingredients (as stored, i.e. for
 * its own `servings`) to get "quantity × unit" of it. 0 when it can't be computed
 * (grams requested but none of its ingredients convert to grams).
 */
export function referenceFactor(
  quantity: number,
  unit: string,
  ref: { servings: number | null },
  refIngredients: FlatIngredient[]
): number {
  if (!(quantity > 0)) return 0;
  if (unit === "g") {
    const total = totalGrams(refIngredients);
    return total > 0 ? quantity / total : 0;
  }
  return quantity / (ref.servings && ref.servings > 0 ? ref.servings : 1);
}

/**
 * A recipe's ingredients with every referenced recipe expanded in, scaled by its
 * reference quantity — i.e. the full list for the recipe's own `servings`.
 */
export function flattenRecipe(
  id: string,
  graph: RecipeGraph,
  memo = new Map<string, FlatIngredient[]>(),
  stack: string[] = []
): FlatIngredient[] {
  const cached = memo.get(id);
  if (cached) return cached;
  const r = graph.get(id);
  if (!r || stack.includes(id) || stack.length > MAX_DEPTH) return [];
  const out = [...r.ingredients];
  for (const ref of r.references) {
    const child = graph.get(ref.refRecipeId);
    if (!child) continue;
    const childIngs = flattenRecipe(child.id, graph, memo, [...stack, id]);
    const factor = referenceFactor(ref.quantity, ref.unit, child, childIngs);
    if (factor <= 0) continue;
    for (const ing of childIngs) {
      out.push({ ...ing, id: `${ref.id}:${ing.id}`, quantity: ing.quantity != null ? ing.quantity * factor : null });
    }
  }
  memo.set(id, out);
  return out;
}

/** Load + flatten several recipes at once (planner grocery list / nutrition). */
export async function flattenRecipes(ids: string[]): Promise<Map<string, FlatIngredient[]>> {
  const graph = await loadRecipeGraph(ids);
  const memo = new Map<string, FlatIngredient[]>();
  const out = new Map<string, FlatIngredient[]>();
  for (const id of new Set(ids)) out.set(id, flattenRecipe(id, graph, memo));
  return out;
}

/** True if `fromId` (transitively) references `targetId` — used to refuse cycles. */
export async function referencesRecipe(fromId: string, targetId: string): Promise<boolean> {
  if (fromId === targetId) return true;
  const graph = await loadRecipeGraph([fromId]);
  return graph.has(targetId);
}
