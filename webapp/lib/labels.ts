// Romanian DISPLAY labels for values that are stored in / compared against the DB:
// Recipe.category, WeekPlan.mealType, GroceryItem.category. The stored value stays
// English (so filtering, comparisons and existing rows keep working) — only the shown
// label is translated. Unknown values fall back to the raw value.

export const MEAL_LABELS: Record<string, string> = {
  Breakfast: "Mic dejun",
  Lunch: "Prânz",
  Dinner: "Cină",
  Snack: "Gustare",
};

export const CATEGORY_LABELS: Record<string, string> = {
  Breakfast: "Mic dejun",
  Lunch: "Prânz",
  Dinner: "Cină",
  Snack: "Gustare",
  Smoothie: "Smoothie",
  "Smoothie Bowl": "Bol smoothie",
  Soup: "Supă",
  "High Protein": "Bogat în proteine",
  Receipt: "Preparat",
  Extra: "Extra",
};

// Keyed by the full GroceryItem.category value (emoji prefix included).
export const GROCERY_CATEGORY_LABELS: Record<string, string> = {
  "🍎 Fruits": "Fructe",
  "🥕 Veg & Legumes": "Legume și leguminoase",
  "🌾 Grains": "Cereale",
  "🫙 Pantry": "Cămară",
  "🥩 Meat & Alt": "Carne și alternative",
  "🥛 Dairy": "Lactate",
  "🥫 Canned": "Conserve",
  "🫕 Sauces & Condiments": "Sosuri și condimente",
  "🥜 Nuts & Seeds": "Nuci și semințe",
  "🧂Fresh Herbs & Spices": "Ierburi proaspete și mirodenii",
  "🌵 Dried Herbs & Spices": "Ierburi uscate și mirodenii",
  "🥑 Healthy Fats": "Grăsimi sănătoase",
  "🍸 Drinks": "Băuturi",
  "🥘 Homemade Receipts": "Preparate de casă",
  "🧴 Supplies": "Consumabile",
  Other: "Altele",
  // GROCERY_CATEGORIES (lib/constants.ts) — the dropdown/editor taxonomy (distinct set).
  "🍞 Bakery": "Panificație",
  "🥫 Canned & Preserved": "Conserve",
  "🥚 Dairy & Eggs": "Lactate și ouă",
  "🥤 Drinks": "Băuturi",
  "🐟 Fish & Seafood": "Pește și fructe de mare",
  "🧊 Frozen": "Congelate",
  "🌾 Grains & Legumes": "Cereale și leguminoase",
  "🫙 Oils & Fats": "Uleiuri și grăsimi",
  "🧂 Spices & Herbs": "Condimente și ierburi",
  "🍯 Sweeteners": "Îndulcitori",
  "🥕 Vegetables": "Legume",
};

export const groceryCategoryLabel = (v: string | null | undefined): string =>
  v ? GROCERY_CATEGORY_LABELS[v] ?? v : "";

export const DIFFICULTY_LABELS: Record<string, string> = {
  Easy: "Ușor",
  Moderate: "Moderat",
  Hard: "Dificil",
};

export const mealLabel = (v: string): string => MEAL_LABELS[v] ?? v;
export const categoryLabel = (v: string | null | undefined): string =>
  v ? CATEGORY_LABELS[v] ?? v : "";
export const difficultyLabel = (v: string | null | undefined): string =>
  v ? DIFFICULTY_LABELS[v] ?? v : "";
