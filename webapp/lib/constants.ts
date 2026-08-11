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

// Strip the emoji and normalise, so a category is matched by its label alone — this
// alone reconciles values that differ only by emoji (e.g. "🍸 Drinks" → "🥤 Drinks").
const categoryLabelKey = (v: string): string =>
  v.replace(/^[^\p{L}\p{N}]+/u, "").trim().toLowerCase();

const CANONICAL_BY_LABEL: Record<string, string> = Object.fromEntries(
  GROCERY_CATEGORIES.map((c) => [categoryLabelKey(c), c])
);

// Older/narrower category names mapped onto the canonical list, keyed by label so
// the emoji doesn't matter. Used to unify duplicates like "Grains" vs
// "Grains & Legumes", and to pre-select the likely answer in the Audit page.
const CATEGORY_ALIASES: Record<string, string> = {
  "veg & legumes": "🥕 Vegetables",
  "veg": "🥕 Vegetables",
  "vegetable": "🥕 Vegetables",
  "fruit": "🍎 Fruits",
  "grains": "🌾 Grains & Legumes",
  "legumes": "🌾 Grains & Legumes",
  "dairy": "🥚 Dairy & Eggs",
  "eggs": "🥚 Dairy & Eggs",
  "canned": "🥫 Canned & Preserved",
  "preserved": "🥫 Canned & Preserved",
  "meat": "🥩 Meat & Alt",
  "fish": "🐟 Fish & Seafood",
  "seafood": "🐟 Fish & Seafood",
  "bread": "🍞 Bakery",
  "nuts": "🥜 Nuts & Seeds",
  "seeds": "🥜 Nuts & Seeds",
  "fresh herbs & spices": "🧂 Spices & Herbs",
  "dried herbs & spices": "🧂 Spices & Herbs",
  "herbs & spices": "🧂 Spices & Herbs",
  "herbs": "🧂 Spices & Herbs",
  "spices": "🧂 Spices & Herbs",
  "healthy fats": "🫙 Oils & Fats",
  "fats": "🫙 Oils & Fats",
  "oils": "🫙 Oils & Fats",
  "sweeteners": "🍯 Sweeteners",
  "sugar": "🍯 Sweeteners",
  // Generic buckets from the old list with no closer equivalent.
  "pantry": "Other",
  "sauces & condiments": "Other",
  "condiments": "Other",
  "homemade receipts": "Other",
  "homemade recipes": "Other",
  "supplies": "Other",
};

// Resolve any stored category to its canonical form, or null when nothing matches
// (an unknown value that a human has to place). Canonical values pass through.
export function canonicalCategory(category: string | null | undefined): string | null {
  const raw = category?.trim();
  if (!raw) return null;
  if (GROCERY_CATEGORIES.includes(raw)) return raw;
  const key = categoryLabelKey(raw);
  return CANONICAL_BY_LABEL[key] ?? CATEGORY_ALIASES[key] ?? null;
}
