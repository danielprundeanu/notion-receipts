/**
 * Fills in missing nutrition (kcal=null) for ingredients that have a USDA query defined.
 * Run from webapp/:  npx tsx scripts/patch-nutrition.ts
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

// Map: ingredient name → USDA search query (same as add-ingredients.ts)
const USDA_QUERIES: Record<string, string> = {
  "zucchini": "zucchini raw", "eggplant": "eggplant raw", "leek": "leek raw",
  "broccoli": "broccoli raw", "cauliflower": "cauliflower raw", "spinach": "spinach raw",
  "kale": "kale raw", "red cabbage": "red cabbage raw", "green beans": "green beans raw",
  "asparagus": "asparagus raw", "brussels sprouts": "brussels sprouts raw",
  "sweet potato": "sweet potato raw", "butternut squash": "butternut squash raw",
  "artichoke": "artichoke raw", "corn": "sweet corn raw",
  "mango": "mango raw", "pineapple": "pineapple raw", "kiwi": "kiwi fruit raw",
  "pomegranate": "pomegranate raw", "grapefruit": "grapefruit raw",
  "peach": "peach raw", "plum": "plum raw", "cherries": "cherries raw",
  "raspberries": "raspberries raw", "blackberries": "blackberries raw",
  "pear": "pear raw", "apricot": "apricot raw", "dates": "dates medjool",
  "coconut": "coconut meat raw", "fig": "figs raw",
  "turkey breast": "turkey breast raw", "duck": "duck meat raw",
  "lamb": "lamb meat raw", "veal": "veal raw", "bacon": "bacon cooked",
  "ham": "ham cured", "prosciutto": "prosciutto", "beef liver": "beef liver raw",
  "chicken liver": "chicken liver raw", "sausage": "pork sausage",
  "salmon": "salmon raw", "tuna": "tuna raw", "shrimp": "shrimp raw",
  "cod": "cod raw", "mackerel": "mackerel raw", "sardines": "sardines canned",
  "trout": "trout raw", "carp": "carp raw", "mussels": "mussels raw", "squid": "squid raw",
  "heavy cream": "heavy cream", "sour cream": "sour cream", "ricotta": "ricotta cheese",
  "mozzarella": "mozzarella cheese", "parmesan": "parmesan cheese",
  "cream cheese": "cream cheese", "kefir": "kefir",
  "condensed milk": "sweetened condensed milk", "evaporated milk": "evaporated milk",
  "whipped cream": "whipped cream",
  "chickpeas": "chickpeas raw", "lentils": "lentils raw", "quinoa": "quinoa raw",
  "brown rice": "brown rice raw", "barley": "barley raw", "bulgur": "bulgur raw",
  "couscous": "couscous", "black beans": "black beans raw",
  "corn flour": "cornmeal", "breadcrumbs": "breadcrumbs",
  "almonds": "almonds raw", "walnuts": "walnuts raw", "cashews": "cashews raw",
  "pistachios": "pistachios raw", "hazelnuts": "hazelnuts raw",
  "peanuts": "peanuts raw", "chia seeds": "chia seeds", "flax seeds": "flax seeds raw",
  "pumpkin seeds": "pumpkin seeds raw", "hemp seeds": "hemp seeds",
  "pine nuts": "pine nuts raw", "peanut butter": "peanut butter",
  "almond butter": "almond butter", "tahini": "tahini",
  "coconut oil": "coconut oil", "avocado oil": "avocado oil",
  "sesame oil": "sesame oil", "ghee": "ghee", "lard": "lard",
  "maple syrup": "maple syrup", "agave syrup": "agave syrup",
  "stevia": "stevia", "molasses": "molasses",
  "brown sugar": "brown sugar", "powdered sugar": "powdered sugar",
  "turmeric": "turmeric ground", "cumin": "cumin ground",
  "coriander": "coriander ground", "smoked paprika": "smoked paprika",
  "cayenne pepper": "cayenne pepper", "cardamom": "cardamom ground",
  "nutmeg": "nutmeg ground", "cloves": "cloves ground",
  "basil": "basil dried", "oregano": "oregano dried",
  "rosemary": "rosemary dried", "thyme": "thyme dried",
  "ginger": "ginger ground", "star anise": "star anise",
  "tomato paste": "tomato paste", "tomato sauce": "tomato sauce canned",
  "diced tomatoes": "tomatoes canned diced", "coconut milk": "coconut milk canned",
  "soy sauce": "soy sauce", "worcestershire sauce": "worcestershire sauce",
  "fish sauce": "fish sauce", "balsamic vinegar": "balsamic vinegar",
  "capers": "capers", "olives": "olives",
};

type USDAFood = {
  foodNutrients: Array<{ nutrientId: number; value: number }>;
};

async function fetchNutrition(query: string) {
  const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
  url.searchParams.set("query", query);
  url.searchParams.set("pageSize", "3");
  url.searchParams.set("dataType", "SR Legacy,Foundation");
  url.searchParams.set("api_key", USDA_KEY);
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return null;
  const data = (await res.json()) as { foods: USDAFood[] };
  const food = data.foods?.find(f => f.foodNutrients.some(n => n.nutrientId === 1008));
  if (!food) return null;
  const get = (id: number) => {
    const n = food.foodNutrients.find(n => n.nutrientId === id);
    return n ? Math.round(n.value * 10) / 10 : null;
  };
  return { kcal: get(1008), carbs: get(1005), fat: get(1004), protein: get(1003) };
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const missing = await prisma.groceryItem.findMany({
    where: { kcal: null, name: { in: Object.keys(USDA_QUERIES) } },
    select: { id: true, name: true },
  });

  console.log(`\nIngrediente fără nutriție: ${missing.length}\n`);

  let updated = 0;
  let notFound = 0;

  for (const item of missing) {
    const query = USDA_QUERIES[item.name];
    process.stdout.write(`  ${item.name}... `);
    const nut = await fetchNutrition(query);
    if (!nut || nut.kcal == null) {
      console.log("⚠ nu s-au găsit date");
      notFound++;
    } else {
      await prisma.groceryItem.update({
        where: { id: item.id },
        data: { kcal: nut.kcal, carbs: nut.carbs, fat: nut.fat, protein: nut.protein },
      });
      console.log(`✅ ${nut.kcal} kcal | C${nut.carbs} F${nut.fat} P${nut.protein}`);
      updated++;
    }
    await new Promise(r => setTimeout(r, 120)); // ~8 req/s, well within 1000/hr
  }

  console.log(`\nDone: ${updated} actualizate, ${notFound} fără date USDA`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
