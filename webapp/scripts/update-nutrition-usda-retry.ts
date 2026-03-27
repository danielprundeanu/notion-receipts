/**
 * Second pass: retry items where kcal is null or unitWeight is missing
 * for non-standard units. Fixes nutrient ID matching (old vs new USDA IDs).
 *
 * Run from the webapp directory:
 *   npx tsx scripts/update-nutrition-usda-retry.ts
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));

const envLocalPath = resolve(__dirname, "../.env.local");
if (existsSync(envLocalPath)) {
  for (const line of readFileSync(envLocalPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const USDA_API_KEY = "IIMqSHW8Rwxu9sx52HD4dtjBfizSSB1zNHxb0sbI";
const USDA_BASE = "https://api.nal.usda.gov/fdc/v1";

const STANDARD_UNIT_WEIGHTS: Record<string, number> = {
  tsp: 5, tbsp: 15, pinch: 0.3,
};
const MASS_UNITS = new Set(["g", "ml"]);
const STANDARD_UNITS = new Set(Object.keys(STANDARD_UNIT_WEIGHTS));

// Non-food items to skip
const NON_FOOD = new Set([
  "Bec", "Bețisoare urechi", "Burete Vase", "Corega", "Detergent Negre",
  "Fairy", "Lavete", "Mouthwash", "Saci de gunoi", "Sanitol", "Shampoo",
  "Tampoane", "Toilet Paper", "Toothpaste", "Vanish Albe", "Wet wipes",
  "Wooden Skewer",
]);

// Override search terms for problematic names
const SEARCH_OVERRIDES: Record<string, string> = {
  "Coconut Milk (full fat) 6%": "coconut milk full fat",
  "Lapte de vacă": "whole milk",
  "Untul cel Laptos": "butter",
  "Bees Wax": "beeswax edible",
  "Gnocchi": "gnocchi potato",
  "Orzo": "orzo pasta",
  "Panko breadcrumb": "panko breadcrumbs",
  "Sultanas": "sultana raisins",
  "Mirin": "mirin rice wine",
  "Mascarpone": "mascarpone cheese",
  "Wholemeal lavash": "lavash bread whole wheat",
  "Romain Lettuce": "romaine lettuce",
  "Small brown onion": "onion brown",
  "Viorica de Purcari": "red wine",
  "Tortilla": "flour tortilla",
  "cher": "chard",
  "red ca": "red cabbage",
};

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function searchFood(query: string): Promise<any[]> {
  const encoded = encodeURIComponent(query);
  const url = `${USDA_BASE}/foods/search?query=${encoded}&dataType=Foundation,SR%20Legacy&pageSize=5&api_key=${USDA_API_KEY}`;
  const result = await fetchJson(url);
  return result.foods ?? [];
}

async function getFoodDetail(fdcId: number): Promise<any> {
  const url = `${USDA_BASE}/food/${fdcId}?api_key=${USDA_API_KEY}`;
  return fetchJson(url);
}

// Supports both old USDA IDs (208/203/204/205) and new FDC IDs (1008/1003/1004/1005)
function extractMacros(nutrients: any[]) {
  const find = (ids: number[], nameFragments: string[]) => {
    for (const id of ids) {
      const n = nutrients.find(
        (n) => n.nutrientId === id || Number(n.nutrientNumber) === id
      );
      if (n?.value != null) return Math.round(n.value * 100) / 100;
    }
    for (const frag of nameFragments) {
      const n = nutrients.find((n) =>
        (n.nutrientName ?? "").toLowerCase().includes(frag)
      );
      if (n?.value != null) return Math.round(n.value * 100) / 100;
    }
    return null;
  };
  return {
    kcal:    find([1008, 208], ["energy"]),
    carbs:   find([1005, 205], ["carbohydrate"]),
    fat:     find([1004, 204], ["total lipid", "fat, total"]),
    protein: find([1003, 203], ["protein"]),
  };
}

function findPortionWeight(portions: any[], unit: string): number | null {
  const u = unit.toLowerCase();

  if (u === "piece") {
    const match = portions.find((p) => {
      const mod = (p.modifier ?? "").toLowerCase();
      const munit = (p.measureUnit?.name ?? "").toLowerCase();
      return mod.includes("medium") || mod.includes("each") ||
             mod.includes("whole") || munit === "each";
    });
    const w = (match ?? portions[0])?.gramWeight;
    return w != null ? Math.round(w) : null;
  }
  if (u === "slice") {
    const match = portions.find((p) => (p.modifier ?? "").toLowerCase().includes("slice"));
    const w = (match ?? portions[0])?.gramWeight;
    return w != null ? Math.round(w) : null;
  }
  if (u === "handful") {
    const cup = portions.find((p) => (p.measureUnit?.name ?? "").toLowerCase().includes("cup"));
    if (cup?.gramWeight) return Math.round(cup.gramWeight / 4);
    return 30;
  }
  if (u === "scoop") {
    const match = portions.find((p) => (p.modifier ?? "").toLowerCase().includes("scoop"));
    return match?.gramWeight != null ? Math.round(match.gramWeight) : null;
  }
  if (u === "bottle") {
    // Standard wine bottle = 750ml ≈ 750g
    return 750;
  }
  return null;
}

async function main() {
  // Fetch only items needing retry
  const allItems = await prisma.groceryItem.findMany({ orderBy: { name: "asc" } });

  const items = allItems.filter((item) => {
    if (NON_FOOD.has(item.name.trim())) return false;
    const unit = item.unit ?? "g";
    const needsMacros = item.kcal == null;
    const needsUnitWeight =
      !MASS_UNITS.has(unit) &&
      !STANDARD_UNITS.has(unit) &&
      item.unitWeight == null;
    return needsMacros || needsUnitWeight;
  });

  console.log(`\nRetrying ${items.length} items...\n`);

  const warnings: string[] = [];
  let updated = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const unit = item.unit ?? "g";
    const prefix = `[${String(i + 1).padStart(3)}/${items.length}]`;
    process.stdout.write(`${prefix} ${item.name} (${unit}) ... `);

    const searchTerm = SEARCH_OVERRIDES[item.name.trim()] ?? item.name.trim();

    let foods: any[];
    try {
      foods = await searchFood(searchTerm);
      await sleep(130);
    } catch (e) {
      console.log("❌ search failed");
      warnings.push(`${item.name}: search error`);
      continue;
    }

    if (foods.length === 0) {
      console.log("⚠️  no match");
      warnings.push(`${item.name}: no match`);
      continue;
    }

    const best =
      foods.find((f) => f.dataType === "Foundation") ??
      foods.find((f) => f.dataType === "SR Legacy") ??
      foods[0];

    const macros = extractMacros(best.foodNutrients ?? []);

    let unitWeight: number | null = item.unitWeight; // keep existing if already set

    if (!MASS_UNITS.has(unit) && !STANDARD_UNITS.has(unit) && unitWeight == null) {
      try {
        const detail = await getFoodDetail(best.fdcId);
        await sleep(130);
        unitWeight = findPortionWeight(detail.foodPortions ?? [], unit);
      } catch (e) {
        console.log("❌ detail error");
        warnings.push(`${item.name}: detail error`);
        continue;
      }
      if (unitWeight == null) {
        warnings.push(`${item.name} (${unit}): portion not found`);
      }
    }

    // Only update macros if null (don't overwrite existing correct values)
    const updateData: Record<string, any> = { unitWeight };
    if (item.kcal == null) {
      updateData.kcal = macros.kcal;
      updateData.carbs = macros.carbs;
      updateData.fat = macros.fat;
      updateData.protein = macros.protein;
    }

    await prisma.groceryItem.update({ where: { id: item.id }, data: updateData });
    updated++;

    const desc = best.description.substring(0, 45).padEnd(45);
    const uw = unitWeight != null ? ` | unit=${unitWeight}g` : "";
    const macroStr = macros.kcal != null ? ` | ${macros.kcal}kcal` : " | ⚠️ kcal=null";
    console.log(`✓ ${desc}${macroStr}${uw}`);
  }

  await prisma.$disconnect();

  console.log(`\n${"─".repeat(60)}`);
  console.log(`✅ Updated: ${updated}`);
  if (warnings.length > 0) {
    console.log(`\nWarnings (${warnings.length}):`);
    warnings.forEach((w) => console.log(`  • ${w}`));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
