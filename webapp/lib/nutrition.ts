// Ingredient → grams conversion, shared by every nutrition consumer
// (getWeekNutrition, RecipeDetail). Nutrition values on GroceryItem are per 100 g.

export type NutritionGrocery = {
  unit: string | null;
  unit2: string | null;
  conversion: number | null;
  unitWeight: number | null;
};

/**
 * Convert an ingredient's (quantity, unit) to grams using the grocery item's
 * unit definitions. Returns null when no conversion is possible (caller skips).
 *
 * Rules (see CLAUDE.md "Data-model semantics"):
 *  - `g` / `ml` are mass units → 1 : 1 grams, regardless of the item's primary unit.
 *  - the item's 2nd unit converts via `conversion` (1 unit2 = conversion × unit),
 *    but only when the primary unit is a mass unit so the product is actually grams.
 *  - any other (piece/count-style) unit converts via `unitWeight` (grams per piece).
 *
 * Crucially this keys off the INGREDIENT's stored unit, not just the grocery
 * item's primary unit — so "1 piece" of a gram-based item is no longer treated
 * as "1 gram".
 */
export function ingredientGrams(
  quantity: number,
  ingredientUnit: string | null,
  gi: NutritionGrocery
): number | null {
  const u = (ingredientUnit ?? gi.unit ?? "").toLowerCase();

  // Mass units are grams directly.
  if (u === "g" || u === "ml") return quantity;

  // Ingredient stored in the item's 2nd unit → it can ONLY become grams via the
  // explicit conversion into a mass primary unit. If that isn't possible, return
  // null (skip) — never fall through to unitWeight, which is grams-per-PIECE and
  // would silently mis-scale a unit2 quantity (e.g. cups) as if it were pieces.
  if (gi.unit2 && u === gi.unit2.toLowerCase()) {
    if (gi.conversion != null && (gi.unit === "g" || gi.unit === "ml")) {
      return quantity * gi.conversion;
    }
    return null;
  }

  // Piece / count-style unit → grams per piece.
  if (gi.unitWeight != null) return quantity * gi.unitWeight;

  return null;
}
