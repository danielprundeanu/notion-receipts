// USDA FoodData Central lookup: search, then pick the food the name actually means.
// USDA's own order is poor for short names ("Cinnamon" → "Bread, cinnamon" first), so every
// result is scored against the query's words and only an unambiguous match counts as confident.

export type UsdaFood = {
  name: string;
  kcal: number | null;
  carbs: number | null;
  fat: number | null;
  protein: number | null;
};

export type UsdaMatch = UsdaFood & {
  confident: boolean;
  alternatives: UsdaFood[];
};

type RawFood = {
  description: string;
  foodNutrients: Array<{ nutrientId: number; value: number }>;
};

// Foundation foods keep energy under the Atwater ids, not 1008, and some keep carbs and fat
// under the "by summation" / NLEA ids. Reading only the first id skipped the right food.
const NIDS = {
  kcal: [1008, 2048, 2047],
  carbs: [1005, 1050],
  fat: [1004, 1085],
  protein: [1003],
};

// British / shop names → the words USDA uses. Applied to whole words, longest first.
const SYNONYMS: Array<[string, string]> = [
  ["flax seeds", "flaxseed"],
  ["flax seed", "flaxseed"],
  ["butter beans", "lima beans"],
  ["rocket leaves", "arugula"],
  ["rocket", "arugula"],
  ["spring onions", "scallions"],
  ["spring onion", "scallions"],
  ["snow peas", "edible-podded peas"],
  ["bok choy", "pak-choi"],
  ["jasmine rice", "white rice long-grain"],
  ["yellow potato", "potatoes"],
  ["sushi rice", "white rice short-grain"],
  ["tomato passata", "tomato puree"],
  ["passata", "tomato puree"],
  ["romain lettuce", "romaine lettuce"],
  ["panko breadcrumb", "bread crumbs"],
  ["breadcrumbs", "bread crumbs"],
  ["salt-reduced", "low sodium"],
  ["soya plant milk", "soymilk"],
  ["soya", "soy"],
  ["sultanas", "golden raisins"],
  ["beef mince", "ground beef"],
  ["pork mince", "ground pork"],
  ["wholemeal", "whole wheat"],
  ["tinned", "canned"],
  ["yoghurt", "yogurt"],
  ["cacao", "cocoa"],
  ["beetroot", "beets"],
  ["chilli", "chili"],
];

// Words that describe the state of a food. They never count towards "is this the right food",
// but they steer the choice between its forms (raw vs cooked, canned vs dried).
const STATE = new Set([
  "raw", "cooked", "boiled", "frozen", "canned", "dried", "dry", "roasted", "fried", "smoked",
  "ground", "fresh", "prepared", "unprepared", "drained", "toasted", "sweetened", "unsweetened",
  "salted", "unsalted", "whole", "regular", "plain", "enriched", "unenriched", "steamed", "baked",
]);
// Ways a food is made that we never mean unless the name says so.
const UNWANTED = [
  "cooked", "boiled", "fried", "toasted", "microwaved", "sauteed", "prepared", "condensed", "fermented",
  "stuffed", "cube", "cubed", "mix", "babyfood", "infant",
];
// Forms that change the values a lot: only chosen first when the name asks for them.
const UNASKED_STATE = ["dried", "frozen", "canned", "roasted", "sweetened", "salted"];
// A name with one of these states only matches a food in that state ("Dried Cranberries").
const REQUIRED_STATE: Record<string, string[]> = {
  dried: ["dried", "dry", "dehydrated"],
  canned: ["canned"],
  smoked: ["smoked"],
  roasted: ["roasted"],
};
// "Fresh" herbs and roots are never the dried spice.
const NOT_FRESH = ["dried", "dry", "ground", "seed", "powder"];
// Words that make it a different food when the name doesn't have them: "Bacon, turkey",
// "Duck, liver", "Beverages, chocolate syrup", "Snacks, granola bars".
const IDENTITY = new Set([
  "turkey", "chicken", "beef", "pork", "veal", "lamb", "liver", "gizzard", "heart", "giblet",
  "syrup", "juice", "drink", "bar", "chip", "tofu", "chocolate", "meatless", "imitation", "substitute",
]);
// Lighter versions we only mean when the name says so ("Low-fat milk", "Greek Yogurt 2%").
const LIGHTER = ["nonfat", "lowfat", "fat-free", "low fat", "reduced fat", "light", "industrial"];
// USDA puts a category in front of many names: "Spices, cinnamon", "Fish, sardine".
const CATEGORY = new Set([
  "spice", "nut", "seed", "beverage", "alcoholic", "soup", "sauce", "cheese", "fish", "crustacean",
  "mollusk", "cereal", "sweetener", "leavening", "agent", "snack", "vegetable", "fruit", "wine", "table",
]);
const STOP = new Set(["and", "with", "of", "the", "a", "in", "or", "for", "to", "small", "large", "medium", "fresh", "organic"]);
const NEGATE = new Set(["no", "without", "less"]);

function stem(w: string): string {
  if (w.length <= 3 || w.endsWith("ss")) return w;
  if (w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.endsWith("ves")) return w.slice(0, -3) + "f";
  if (/(oes|ches|shes|xes)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith("s")) return w.slice(0, -1);
  return w;
}

function words(s: string): string[] {
  return s.toLowerCase().split(/[^a-z]+/).filter(Boolean).map(stem);
}

/** The query sent to USDA: emoji and brackets dropped, shop names turned into USDA's. */
export function usdaQuery(name: string): string {
  let q = ` ${name.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9%&' -]+/g, " ")} `;
  for (const [from, to] of SYNONYMS) q = q.replace(new RegExp(`(?<=\\s)${from}(?=\\s)`, "g"), to);
  return q.replace(/\s+/g, " ").trim();
}

function nutrient(f: RawFood, ids: number[]): number | null {
  for (const id of ids) {
    const n = f.foodNutrients.find((x) => x.nutrientId === id);
    if (n != null && Number.isFinite(n.value)) return Math.round(n.value * 10) / 10;
  }
  return null;
}

function toFood(f: RawFood): UsdaFood {
  return {
    name: f.description,
    kcal: nutrient(f, NIDS.kcal),
    carbs: nutrient(f, NIDS.carbs),
    fat: nutrient(f, NIDS.fat),
    protein: nutrient(f, NIDS.protein),
  };
}

type Scored = { food: UsdaFood; score: number; confident: boolean };

function score(query: string, description: string, rank: number): Omit<Scored, "food"> {
  const qWords = words(query);
  const qLower = query.toLowerCase();
  const wanted = new Set(qWords.filter((w) => !STATE.has(w) && !STOP.has(w)));
  const qState = new Set(qWords.filter((w) => STATE.has(w)));
  // What's in brackets is a gloss ("Vegetables, mixed (corn, lima beans, peas…)"), not the food.
  const plain = description.replace(/\([^)]*\)/g, " ");
  const lower = plain.toLowerCase();
  const dWords = words(lower);
  const segments = plain.split(",");
  // "Spices, cinnamon": the category is only a prefix, the food is the next part.
  const headCount = segments[0] && words(segments[0]).every((w) => CATEGORY.has(w)) ? 2 : 1;

  const found = new Set<string>();
  let headExtra = 0;
  let nearExtra = 0;
  let farExtra = 0;
  let otherFood = false;
  segments.forEach((segment, i) => {
    let negated = false;
    let madeOf = false;
    for (const w of words(segment)) {
      if (NEGATE.has(w)) { negated = true; continue; }
      if (w === "made") { madeOf = true; continue; }
      if (wanted.has(w)) { if (!negated) found.add(w); continue; }
      if (STATE.has(w) || STOP.has(w) || CATEGORY.has(w) || negated) continue;
      if (IDENTITY.has(w) || madeOf) otherFood = true;
      if (i < headCount) headExtra++;
      else if (i === headCount) nearExtra++;
      else farExtra++;
    }
  });

  const missing = [...wanted].filter((w) => !found.has(w)).length;
  const brand = /[A-Z]{3,}/.test(plain.replace(/\bNFS\b/g, ""));
  const stateMissing = Object.entries(REQUIRED_STATE).some(([st, forms]) => qState.has(st) && !forms.some((f) => dWords.includes(f)));
  const notFresh = qWords.includes("fresh") && NOT_FRESH.some((f) => dWords.includes(f));
  const asksLighter = /%|\blow\b|light|reduced|skim/.test(qLower);
  const lighter = !asksLighter && LIGHTER.some((l) => lower.includes(l));

  let s = found.size * 3 - missing * 3 - headExtra * 2 - nearExtra - farExtra * 0.3 - rank * 0.05;
  if (brand) s -= 3;
  if (otherFood) s -= 2;
  if (stateMissing) s -= 2;
  if (notFresh) s -= 3;
  if (lighter) s -= 1.5;
  let unwanted = false;
  for (const u of UNWANTED) {
    if (qWords.includes(u) || !dWords.includes(u)) continue;
    // "commercially prepared" is shop-bought; "raw, prepared with nigari" is how tofu is made.
    if (u === "prepared" && (lower.includes("commercially prepared") || dWords.includes("raw"))) continue;
    unwanted = true;
    s -= 1.5;
  }
  for (const u of UNASKED_STATE) if (!qWords.includes(u) && dWords.includes(u)) s -= 1;
  // SR Legacy's traditional foods ("Tortilla, blue corn, Sakwavikaviki (Hopi)") are never the shop item.
  const traditional = /\((Hopi|Navajo|Apache|Shoshone|Bannock|Southwest)\)|Alaska Native|Northern Plains Indians/.test(description);
  if (traditional) s -= 3;
  if (lower.includes("fast food") || lower.includes("restaurant")) s -= 5;
  if (qState.size === 0 && /\braw\b|ready-to-serve|unprepared/.test(lower)) s += 1;
  for (const st of qState) if (dWords.includes(st)) s += 1;

  const confident = wanted.size > 0 && missing === 0 && headExtra === 0
    && !brand && !otherFood && !stateMissing && !notFresh && !lighter && !unwanted && !traditional;
  return { score: s, confident };
}

/** Rank USDA results for a query. The best one is confident only when every word of the name
 *  is in it and nothing else leads its description ("Bread, cinnamon" never is for "Cinnamon"). */
export function rankFoods(query: string, foods: RawFood[]): UsdaMatch | null {
  const seen = new Set<string>();
  const scored: Scored[] = [];
  foods.forEach((f, rank) => {
    const food = toFood(f);
    if (food.kcal == null || seen.has(food.name.toLowerCase())) return;
    seen.add(food.name.toLowerCase());
    scored.push({ food, ...score(query, f.description, rank) });
  });
  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score);
  const [best, ...rest] = scored;
  return { ...best.food, confident: best.confident, alternatives: rest.slice(0, 4).map((r) => r.food) };
}

export async function searchUsda(name: string, apiKey: string): Promise<UsdaMatch | null> {
  const query = usdaQuery(name);
  const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
  url.searchParams.set("query", query);
  url.searchParams.set("pageSize", "25");
  url.searchParams.set("dataType", "Foundation,SR Legacy");
  url.searchParams.set("api_key", apiKey);
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`USDA API ${res.status}`);
  const data = (await res.json()) as { foods?: RawFood[] };
  return rankFoods(query, data.foods ?? []);
}
