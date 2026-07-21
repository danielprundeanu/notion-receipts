// The UI is English. Recipe.category, WeekPlan.mealType and GroceryItem.category are
// stored as English values in the DB (kept as-is so filtering/comparisons/existing rows
// keep working), so the display label is simply the stored value. The only transform is
// for GroceryItem.category, whose stored value carries an emoji prefix (e.g. "🍎 Fruits") —
// strip it for a clean text label (the emoji is rendered separately where needed).

export const mealLabel = (v: string): string => v;

export const categoryLabel = (v: string | null | undefined): string => v ?? "";

export const difficultyLabel = (v: string | null | undefined): string => v ?? "";

// Strip a leading emoji/symbol prefix from a grocery category value.
// "🍎 Fruits" → "Fruits", "🧂Fresh Herbs & Spices" → "Fresh Herbs & Spices", "Other" → "Other".
export const groceryCategoryLabel = (v: string | null | undefined): string =>
  v ? v.replace(/^[^\w\s]+\s*/, "").trim() : "";
