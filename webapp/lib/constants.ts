export const GROCERY_CATEGORIES = [
  "🍞 Bakery",
  "🥫 Canned & Preserved",
  "🥚 Dairy & Eggs",
  "🥤 Drinks",
  "🐟 Fish & Seafood",
  "🧊 Frozen",
  "🍎 Fruits",
  "🌾 Grains & Legumes",
  "🥩 Meat & Alt",
  "🥜 Nuts & Seeds",
  "🫙 Oils & Fats",
  "Other",
  "🧂 Spices & Herbs",
  "🍯 Sweeteners",
  "🥕 Vegetables",
];

// A category's emoji lives inside the stored value ("🍎 Fruits"). This pulls it out
// for places that render the icon separately from the label (chips, section headers).
// "Other" — and any legacy value without an emoji — falls back to the box.
export function categoryIcon(category: string | null | undefined): string {
  if (!category) return "📦";
  const m = category.trim().match(/^([^\p{L}\p{N}\s]+)/u);
  return m ? m[1] : "📦";
}

// True for a category value that is still one of the canonical ones. Items failing
// this (legacy values left over from before the list was standardised, or no value
// at all) are surfaced in the Audit page so they can be re-mapped.
export function isCanonicalCategory(category: string | null | undefined): boolean {
  return !!category && GROCERY_CATEGORIES.includes(category.trim());
}
