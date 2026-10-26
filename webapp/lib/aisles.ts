// Store aisles for the shopping list — a display-only grouping over GroceryItem.category.
// The stored categories still include legacy names ("Veg & Legumes", "🥛 Dairy",
// "Pantry"), so they're matched by label with the emoji stripped, and several
// categories share an aisle: a real week came out in 19 groups by category, ~8 by aisle.

export const AISLES = [
  { key: "produce", emoji: "🥕", title: "Fruit & vegetables", short: "Fruit & veg" },
  { key: "dairy", emoji: "🥚", title: "Dairy & eggs", short: "Dairy" },
  { key: "meat", emoji: "🥩", title: "Meat, fish & tofu", short: "Meat & fish" },
  { key: "grains", emoji: "🌾", title: "Bread, pasta & grains", short: "Grains" },
  { key: "tins", emoji: "🥫", title: "Tins, jars & sauces", short: "Tins & jars" },
  { key: "nuts", emoji: "🥜", title: "Nuts, seeds & dried fruit", short: "Nuts & seeds" },
  { key: "baking", emoji: "🍯", title: "Baking, oils & sweet", short: "Baking" },
  { key: "spices", emoji: "🧂", title: "Spices & herbs", short: "Spices" },
  { key: "frozen", emoji: "🧊", title: "Frozen", short: "Frozen" },
  { key: "drinks", emoji: "🥤", title: "Drinks", short: "Drinks" },
  { key: "other", emoji: "📦", title: "Household & other", short: "Other" },
] as const;

export type AisleKey = (typeof AISLES)[number]["key"];

const BY_LABEL: Record<string, AisleKey> = {
  fruits: "produce", fruit: "produce", vegetables: "produce", vegetable: "produce", veg: "produce",
  "veg & legumes": "produce",
  "dairy & eggs": "dairy", dairy: "dairy", eggs: "dairy",
  "meat & alt": "meat", meat: "meat", "fish & seafood": "meat", fish: "meat", seafood: "meat",
  bakery: "grains", bread: "grains", "grains & legumes": "grains", grains: "grains", legumes: "grains",
  pantry: "grains", // flours, oats, quinoa, noodles
  "canned & preserved": "tins", canned: "tins", preserved: "tins",
  "sauces & condiments": "tins", condiments: "tins",
  "nuts & seeds": "nuts", nuts: "nuts", seeds: "nuts",
  sweeteners: "baking", sugar: "baking",
  "oils & fats": "baking", "healthy fats": "baking", oils: "baking", fats: "baking",
  "spices & herbs": "spices", "fresh herbs & spices": "spices", "dried herbs & spices": "spices",
  herbs: "spices", spices: "spices",
  frozen: "frozen",
  drinks: "drinks",
};

export function aisleOf(category: string | null | undefined): AisleKey {
  const label = (category ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim().toLowerCase();
  return BY_LABEL[label] ?? "other";
}
