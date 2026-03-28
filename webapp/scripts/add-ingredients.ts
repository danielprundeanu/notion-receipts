/**
 * Adds up to 100 common ingredients missing from the DB.
 * Fetches nutrition from USDA FoodData Central (free, no key needed).
 *
 * Run from webapp/:
 *   npx tsx scripts/add-ingredients.ts
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim(), v = line.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

const USDA_KEY = process.env.USDA_API_KEY ?? "DEMO_KEY";

// ─── Curated list of 100 ingredients ──────────────────────────────────────────
// Format: [name_en, name_ro, category, unit, usda_query]

type IngredientDef = {
  name: string;
  nameRo: string;
  category: string;
  unit: string;
  usdaQuery: string;
};

const INGREDIENTS: IngredientDef[] = [
  // 🥕 Vegetables
  { name: "zucchini",           nameRo: "dovlecel",            category: "🥕 Vegetables",       unit: "g",  usdaQuery: "zucchini raw" },
  { name: "eggplant",           nameRo: "vânătă",              category: "🥕 Vegetables",       unit: "g",  usdaQuery: "eggplant raw" },
  { name: "leek",               nameRo: "praz",                category: "🥕 Vegetables",       unit: "g",  usdaQuery: "leek raw" },
  { name: "broccoli",           nameRo: "broccoli",            category: "🥕 Vegetables",       unit: "g",  usdaQuery: "broccoli raw" },
  { name: "cauliflower",        nameRo: "conopidă",            category: "🥕 Vegetables",       unit: "g",  usdaQuery: "cauliflower raw" },
  { name: "spinach",            nameRo: "spanac",              category: "🥕 Vegetables",       unit: "g",  usdaQuery: "spinach raw" },
  { name: "kale",               nameRo: "kale",                category: "🥕 Vegetables",       unit: "g",  usdaQuery: "kale raw" },
  { name: "red cabbage",        nameRo: "varză roșie",         category: "🥕 Vegetables",       unit: "g",  usdaQuery: "red cabbage raw" },
  { name: "green beans",        nameRo: "fasole verde",        category: "🥕 Vegetables",       unit: "g",  usdaQuery: "green beans raw" },
  { name: "asparagus",          nameRo: "sparanghel",          category: "🥕 Vegetables",       unit: "g",  usdaQuery: "asparagus raw" },
  { name: "brussels sprouts",   nameRo: "varză de Bruxelles",  category: "🥕 Vegetables",       unit: "g",  usdaQuery: "brussels sprouts raw" },
  { name: "sweet potato",       nameRo: "cartof dulce",        category: "🥕 Vegetables",       unit: "g",  usdaQuery: "sweet potato raw" },
  { name: "butternut squash",   nameRo: "dovleac butternut",   category: "🥕 Vegetables",       unit: "g",  usdaQuery: "butternut squash raw" },
  { name: "artichoke",          nameRo: "anghinare",           category: "🥕 Vegetables",       unit: "g",  usdaQuery: "artichoke raw" },
  { name: "corn",               nameRo: "porumb",              category: "🥕 Vegetables",       unit: "g",  usdaQuery: "sweet corn raw" },

  // 🍎 Fruits
  { name: "mango",              nameRo: "mango",               category: "🍎 Fruits",           unit: "g",  usdaQuery: "mango raw" },
  { name: "pineapple",          nameRo: "ananas",              category: "🍎 Fruits",           unit: "g",  usdaQuery: "pineapple raw" },
  { name: "kiwi",               nameRo: "kiwi",                category: "🍎 Fruits",           unit: "g",  usdaQuery: "kiwi fruit raw" },
  { name: "pomegranate",        nameRo: "rodie",               category: "🍎 Fruits",           unit: "g",  usdaQuery: "pomegranate raw" },
  { name: "grapefruit",         nameRo: "grapefruit",          category: "🍎 Fruits",           unit: "g",  usdaQuery: "grapefruit raw" },
  { name: "peach",              nameRo: "piersică",            category: "🍎 Fruits",           unit: "g",  usdaQuery: "peach raw" },
  { name: "plum",               nameRo: "prună",               category: "🍎 Fruits",           unit: "g",  usdaQuery: "plum raw" },
  { name: "cherries",           nameRo: "cireșe",              category: "🍎 Fruits",           unit: "g",  usdaQuery: "cherries raw" },
  { name: "raspberries",        nameRo: "zmeură",              category: "🍎 Fruits",           unit: "g",  usdaQuery: "raspberries raw" },
  { name: "blackberries",       nameRo: "mure",                category: "🍎 Fruits",           unit: "g",  usdaQuery: "blackberries raw" },
  { name: "pear",               nameRo: "pară",                category: "🍎 Fruits",           unit: "g",  usdaQuery: "pear raw" },
  { name: "apricot",            nameRo: "caisă",               category: "🍎 Fruits",           unit: "g",  usdaQuery: "apricot raw" },
  { name: "dates",              nameRo: "curmale",             category: "🍎 Fruits",           unit: "g",  usdaQuery: "dates medjool" },
  { name: "coconut",            nameRo: "cocos",               category: "🍎 Fruits",           unit: "g",  usdaQuery: "coconut meat raw" },
  { name: "fig",                nameRo: "smochină",            category: "🍎 Fruits",           unit: "g",  usdaQuery: "figs raw" },

  // 🥩 Meat & Alt
  { name: "turkey breast",      nameRo: "piept de curcan",     category: "🥩 Meat & Alt",       unit: "g",  usdaQuery: "turkey breast raw" },
  { name: "duck",               nameRo: "rață",                category: "🥩 Meat & Alt",       unit: "g",  usdaQuery: "duck meat raw" },
  { name: "lamb",               nameRo: "miel",                category: "🥩 Meat & Alt",       unit: "g",  usdaQuery: "lamb meat raw" },
  { name: "veal",               nameRo: "vițel",               category: "🥩 Meat & Alt",       unit: "g",  usdaQuery: "veal raw" },
  { name: "bacon",              nameRo: "bacon",               category: "🥩 Meat & Alt",       unit: "g",  usdaQuery: "bacon cooked" },
  { name: "ham",                nameRo: "șuncă",               category: "🥩 Meat & Alt",       unit: "g",  usdaQuery: "ham cured" },
  { name: "prosciutto",         nameRo: "prosciutto",          category: "🥩 Meat & Alt",       unit: "g",  usdaQuery: "prosciutto" },
  { name: "beef liver",         nameRo: "ficat de vită",       category: "🥩 Meat & Alt",       unit: "g",  usdaQuery: "beef liver raw" },
  { name: "chicken liver",      nameRo: "ficat de pui",        category: "🥩 Meat & Alt",       unit: "g",  usdaQuery: "chicken liver raw" },
  { name: "sausage",            nameRo: "cârnați",             category: "🥩 Meat & Alt",       unit: "g",  usdaQuery: "pork sausage" },

  // 🐟 Fish & Seafood
  { name: "salmon",             nameRo: "somon",               category: "🐟 Fish & Seafood",   unit: "g",  usdaQuery: "salmon raw" },
  { name: "tuna",               nameRo: "ton",                 category: "🐟 Fish & Seafood",   unit: "g",  usdaQuery: "tuna raw" },
  { name: "shrimp",             nameRo: "creveți",             category: "🐟 Fish & Seafood",   unit: "g",  usdaQuery: "shrimp raw" },
  { name: "cod",                nameRo: "cod",                 category: "🐟 Fish & Seafood",   unit: "g",  usdaQuery: "cod raw" },
  { name: "mackerel",           nameRo: "macrou",              category: "🐟 Fish & Seafood",   unit: "g",  usdaQuery: "mackerel raw" },
  { name: "sardines",           nameRo: "sardine",             category: "🐟 Fish & Seafood",   unit: "g",  usdaQuery: "sardines canned" },
  { name: "trout",              nameRo: "păstrăv",             category: "🐟 Fish & Seafood",   unit: "g",  usdaQuery: "trout raw" },
  { name: "carp",               nameRo: "crap",                category: "🐟 Fish & Seafood",   unit: "g",  usdaQuery: "carp raw" },
  { name: "mussels",            nameRo: "midii",               category: "🐟 Fish & Seafood",   unit: "g",  usdaQuery: "mussels raw" },
  { name: "squid",              nameRo: "calmar",              category: "🐟 Fish & Seafood",   unit: "g",  usdaQuery: "squid raw" },

  // 🥚 Dairy & Eggs
  { name: "heavy cream",        nameRo: "smântână de gătit",   category: "🥚 Dairy & Eggs",     unit: "ml", usdaQuery: "heavy cream" },
  { name: "sour cream",         nameRo: "smântână fermentată", category: "🥚 Dairy & Eggs",     unit: "ml", usdaQuery: "sour cream" },
  { name: "ricotta",            nameRo: "ricotta",             category: "🥚 Dairy & Eggs",     unit: "g",  usdaQuery: "ricotta cheese" },
  { name: "mozzarella",         nameRo: "mozzarella",          category: "🥚 Dairy & Eggs",     unit: "g",  usdaQuery: "mozzarella cheese" },
  { name: "parmesan",           nameRo: "parmezan",            category: "🥚 Dairy & Eggs",     unit: "g",  usdaQuery: "parmesan cheese" },
  { name: "cream cheese",       nameRo: "cremă de brânză",     category: "🥚 Dairy & Eggs",     unit: "g",  usdaQuery: "cream cheese" },
  { name: "kefir",              nameRo: "kefir",               category: "🥚 Dairy & Eggs",     unit: "ml", usdaQuery: "kefir" },
  { name: "condensed milk",     nameRo: "lapte condensat",     category: "🥚 Dairy & Eggs",     unit: "ml", usdaQuery: "sweetened condensed milk" },
  { name: "evaporated milk",    nameRo: "lapte evaporat",      category: "🥚 Dairy & Eggs",     unit: "ml", usdaQuery: "evaporated milk" },
  { name: "whipped cream",      nameRo: "frișcă",              category: "🥚 Dairy & Eggs",     unit: "ml", usdaQuery: "whipped cream" },

  // 🌾 Grains & Legumes
  { name: "chickpeas",          nameRo: "năut",                category: "🌾 Grains & Legumes", unit: "g",  usdaQuery: "chickpeas raw" },
  { name: "lentils",            nameRo: "linte",               category: "🌾 Grains & Legumes", unit: "g",  usdaQuery: "lentils raw" },
  { name: "quinoa",             nameRo: "quinoa",              category: "🌾 Grains & Legumes", unit: "g",  usdaQuery: "quinoa raw" },
  { name: "brown rice",         nameRo: "orez brun",           category: "🌾 Grains & Legumes", unit: "g",  usdaQuery: "brown rice raw" },
  { name: "barley",             nameRo: "orz",                 category: "🌾 Grains & Legumes", unit: "g",  usdaQuery: "barley raw" },
  { name: "bulgur",             nameRo: "bulgur",              category: "🌾 Grains & Legumes", unit: "g",  usdaQuery: "bulgur raw" },
  { name: "couscous",           nameRo: "cuscus",              category: "🌾 Grains & Legumes", unit: "g",  usdaQuery: "couscous" },
  { name: "black beans",        nameRo: "fasole neagră",       category: "🌾 Grains & Legumes", unit: "g",  usdaQuery: "black beans raw" },
  { name: "corn flour",         nameRo: "mălai",               category: "🌾 Grains & Legumes", unit: "g",  usdaQuery: "cornmeal" },
  { name: "breadcrumbs",        nameRo: "pesmet",              category: "🌾 Grains & Legumes", unit: "g",  usdaQuery: "breadcrumbs" },

  // 🥜 Nuts & Seeds
  { name: "almonds",            nameRo: "migdale",             category: "🥜 Nuts & Seeds",     unit: "g",  usdaQuery: "almonds raw" },
  { name: "walnuts",            nameRo: "nuci",                category: "🥜 Nuts & Seeds",     unit: "g",  usdaQuery: "walnuts raw" },
  { name: "cashews",            nameRo: "caju",                category: "🥜 Nuts & Seeds",     unit: "g",  usdaQuery: "cashews raw" },
  { name: "pistachios",         nameRo: "fistic",              category: "🥜 Nuts & Seeds",     unit: "g",  usdaQuery: "pistachios raw" },
  { name: "hazelnuts",          nameRo: "alune de pădure",     category: "🥜 Nuts & Seeds",     unit: "g",  usdaQuery: "hazelnuts raw" },
  { name: "peanuts",            nameRo: "arahide",             category: "🥜 Nuts & Seeds",     unit: "g",  usdaQuery: "peanuts raw" },
  { name: "chia seeds",         nameRo: "semințe chia",        category: "🥜 Nuts & Seeds",     unit: "g",  usdaQuery: "chia seeds" },
  { name: "flax seeds",         nameRo: "semințe de in",       category: "🥜 Nuts & Seeds",     unit: "g",  usdaQuery: "flax seeds raw" },
  { name: "pumpkin seeds",      nameRo: "semințe de dovleac",  category: "🥜 Nuts & Seeds",     unit: "g",  usdaQuery: "pumpkin seeds raw" },
  { name: "hemp seeds",         nameRo: "semințe de cânepă",   category: "🥜 Nuts & Seeds",     unit: "g",  usdaQuery: "hemp seeds" },
  { name: "pine nuts",          nameRo: "semințe de pin",      category: "🥜 Nuts & Seeds",     unit: "g",  usdaQuery: "pine nuts raw" },
  { name: "peanut butter",      nameRo: "unt de arahide",      category: "🥜 Nuts & Seeds",     unit: "g",  usdaQuery: "peanut butter" },
  { name: "almond butter",      nameRo: "unt de migdale",      category: "🥜 Nuts & Seeds",     unit: "g",  usdaQuery: "almond butter" },
  { name: "tahini",             nameRo: "tahini",              category: "🥜 Nuts & Seeds",     unit: "g",  usdaQuery: "tahini" },

  // 🫙 Oils & Fats
  { name: "coconut oil",        nameRo: "ulei de cocos",       category: "🫙 Oils & Fats",      unit: "ml", usdaQuery: "coconut oil" },
  { name: "avocado oil",        nameRo: "ulei de avocado",     category: "🫙 Oils & Fats",      unit: "ml", usdaQuery: "avocado oil" },
  { name: "sesame oil",         nameRo: "ulei de susan",       category: "🫙 Oils & Fats",      unit: "ml", usdaQuery: "sesame oil" },
  { name: "ghee",               nameRo: "ghee",                category: "🫙 Oils & Fats",      unit: "ml", usdaQuery: "ghee" },
  { name: "lard",               nameRo: "untură",              category: "🫙 Oils & Fats",      unit: "g",  usdaQuery: "lard" },

  // 🍯 Sweeteners
  { name: "maple syrup",        nameRo: "sirop de arțar",      category: "🍯 Sweeteners",       unit: "ml", usdaQuery: "maple syrup" },
  { name: "agave syrup",        nameRo: "sirop de agave",      category: "🍯 Sweeteners",       unit: "ml", usdaQuery: "agave syrup" },
  { name: "stevia",             nameRo: "stevie",              category: "🍯 Sweeteners",       unit: "g",  usdaQuery: "stevia" },
  { name: "molasses",           nameRo: "melasă",              category: "🍯 Sweeteners",       unit: "ml", usdaQuery: "molasses" },
  { name: "brown sugar",        nameRo: "zahăr brun",          category: "🍯 Sweeteners",       unit: "g",  usdaQuery: "brown sugar" },
  { name: "powdered sugar",     nameRo: "zahăr pudră",         category: "🍯 Sweeteners",       unit: "g",  usdaQuery: "powdered sugar" },

  // 🧂 Spices & Herbs
  { name: "turmeric",           nameRo: "turmeric",            category: "🧂 Spices & Herbs",   unit: "g",  usdaQuery: "turmeric ground" },
  { name: "cumin",              nameRo: "chimen",              category: "🧂 Spices & Herbs",   unit: "g",  usdaQuery: "cumin ground" },
  { name: "coriander",          nameRo: "coriandru",           category: "🧂 Spices & Herbs",   unit: "g",  usdaQuery: "coriander ground" },
  { name: "smoked paprika",     nameRo: "boia afumată",        category: "🧂 Spices & Herbs",   unit: "g",  usdaQuery: "smoked paprika" },
  { name: "cayenne pepper",     nameRo: "cayenne",             category: "🧂 Spices & Herbs",   unit: "g",  usdaQuery: "cayenne pepper" },
  { name: "cardamom",           nameRo: "cardamom",            category: "🧂 Spices & Herbs",   unit: "g",  usdaQuery: "cardamom ground" },
  { name: "nutmeg",             nameRo: "nucșoară",            category: "🧂 Spices & Herbs",   unit: "g",  usdaQuery: "nutmeg ground" },
  { name: "cloves",             nameRo: "cuișoare",            category: "🧂 Spices & Herbs",   unit: "g",  usdaQuery: "cloves ground" },
  { name: "basil",              nameRo: "busuioc",             category: "🧂 Spices & Herbs",   unit: "g",  usdaQuery: "basil dried" },
  { name: "oregano",            nameRo: "oregano",             category: "🧂 Spices & Herbs",   unit: "g",  usdaQuery: "oregano dried" },
  { name: "rosemary",           nameRo: "rozmarin",            category: "🧂 Spices & Herbs",   unit: "g",  usdaQuery: "rosemary dried" },
  { name: "thyme",              nameRo: "cimbru",              category: "🧂 Spices & Herbs",   unit: "g",  usdaQuery: "thyme dried" },
  { name: "ginger",             nameRo: "ghimbir",             category: "🧂 Spices & Herbs",   unit: "g",  usdaQuery: "ginger ground" },
  { name: "star anise",         nameRo: "anason stelat",       category: "🧂 Spices & Herbs",   unit: "g",  usdaQuery: "star anise" },

  // 🥫 Canned & Preserved
  { name: "tomato paste",       nameRo: "pastă de tomate",     category: "🥫 Canned & Preserved", unit: "g",  usdaQuery: "tomato paste" },
  { name: "tomato sauce",       nameRo: "sos de roșii",        category: "🥫 Canned & Preserved", unit: "ml", usdaQuery: "tomato sauce canned" },
  { name: "diced tomatoes",     nameRo: "roșii decojite",      category: "🥫 Canned & Preserved", unit: "g",  usdaQuery: "tomatoes canned diced" },
  { name: "coconut milk",       nameRo: "lapte de cocos",      category: "🥫 Canned & Preserved", unit: "ml", usdaQuery: "coconut milk canned" },
  { name: "soy sauce",          nameRo: "sos de soia",         category: "🥫 Canned & Preserved", unit: "ml", usdaQuery: "soy sauce" },
  { name: "worcestershire sauce", nameRo: "sos worcestershire", category: "🥫 Canned & Preserved", unit: "ml", usdaQuery: "worcestershire sauce" },
  { name: "fish sauce",         nameRo: "sos de pește",        category: "🥫 Canned & Preserved", unit: "ml", usdaQuery: "fish sauce" },
  { name: "balsamic vinegar",   nameRo: "oțet balsamic",       category: "🥫 Canned & Preserved", unit: "ml", usdaQuery: "balsamic vinegar" },
  { name: "capers",             nameRo: "capere",              category: "🥫 Canned & Preserved", unit: "g",  usdaQuery: "capers" },
  { name: "olives",             nameRo: "măsline",             category: "🥫 Canned & Preserved", unit: "g",  usdaQuery: "olives" },
];

// ─── USDA fetch ────────────────────────────────────────────────────────────────

type USDAFood = {
  description: string;
  foodNutrients: Array<{ nutrientId: number; value: number }>;
};

async function fetchNutrition(query: string): Promise<{ kcal: number | null; carbs: number | null; fat: number | null; protein: number | null }> {
  try {
    const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
    url.searchParams.set("query", query);
    url.searchParams.set("pageSize", "3");
    url.searchParams.set("dataType", "SR Legacy,Foundation");
    url.searchParams.set("api_key", USDA_KEY);
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { kcal: null, carbs: null, fat: null, protein: null };
    const data = (await res.json()) as { foods: USDAFood[] };
    const food = data.foods?.find(f => f.foodNutrients.some(n => n.nutrientId === 1008));
    if (!food) return { kcal: null, carbs: null, fat: null, protein: null };
    const get = (id: number) => {
      const n = food.foodNutrients.find(n => n.nutrientId === id);
      return n ? Math.round(n.value * 10) / 10 : null;
    };
    return { kcal: get(1008), carbs: get(1005), fat: get(1004), protein: get(1003) };
  } catch {
    return { kcal: null, carbs: null, fat: null, protein: null };
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  // Get existing names (case-insensitive)
  const existing = await prisma.groceryItem.findMany({ select: { name: true } });
  const existingNames = new Set(existing.map(i => i.name.toLowerCase()));

  const toAdd = INGREDIENTS.filter(i => !existingNames.has(i.name.toLowerCase()));
  console.log(`\nExisting: ${existing.length} items`);
  console.log(`To add: ${toAdd.length} items (${INGREDIENTS.length - toAdd.length} already exist)\n`);

  let added = 0;
  let skipped = 0;

  for (const ing of toAdd) {
    process.stdout.write(`  ${ing.name} (${ing.nameRo})... `);
    const nut = await fetchNutrition(ing.usdaQuery);

    await prisma.groceryItem.create({
      data: {
        name: ing.name,
        nameRo: ing.nameRo,
        category: ing.category,
        unit: ing.unit,
        kcal: nut.kcal,
        carbs: nut.carbs,
        fat: nut.fat,
        protein: nut.protein,
      },
    });

    const nutStr = nut.kcal ? `${nut.kcal} kcal, C${nut.carbs} F${nut.fat} P${nut.protein}` : "no nutrition";
    console.log(`✅  ${nutStr}`);
    added++;

    // Small delay to avoid USDA rate limits (30 req/min with DEMO_KEY)
    await new Promise(r => setTimeout(r, 200));
  }

  if (INGREDIENTS.length - toAdd.length > 0) {
    console.log(`\n  (${INGREDIENTS.length - toAdd.length} already in DB, skipped)`);
  }

  console.log(`\nDone: ${added} added, ${skipped} skipped`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
