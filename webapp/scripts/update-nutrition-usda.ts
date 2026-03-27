/**
 * Update GroceryItem nutrition data from USDA FoodData Central.
 *
 * Sets kcal, carbs, fat, protein per 100g and unitWeight (grams per unit)
 * for items with non-gram units (piece, tsp, tbsp, handful, etc.).
 *
 * Run from the webapp directory:
 *   npx tsx scripts/update-nutrition-usda.ts
 *
 * Requires DATABASE_URL set in .env.local (or environment).
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local
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

// ─── USDA API ─────────────────────────────────────────────────────────────────

const USDA_API_KEY = "IIMqSHW8Rwxu9sx52HD4dtjBfizSSB1zNHxb0sbI";
const USDA_BASE = "https://api.nal.usda.gov/fdc/v1";

// Standard gram weights for volume/small units (no USDA lookup needed)
const STANDARD_UNIT_WEIGHTS: Record<string, number> = {
  tsp: 5,
  tbsp: 15,
  pinch: 0.3,
};

const MASS_UNITS = new Set(["g", "ml"]);
const STANDARD_UNITS = new Set(Object.keys(STANDARD_UNIT_WEIGHTS));

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function searchFood(name: string): Promise<any[]> {
  const query = encodeURIComponent(name);
  const url = `${USDA_BASE}/foods/search?query=${query}&dataType=Foundation,SR%20Legacy&pageSize=5&api_key=${USDA_API_KEY}`;
  const result = await fetchJson(url);
  return result.foods ?? [];
}

async function getFoodDetail(fdcId: number): Promise<any> {
  const url = `${USDA_BASE}/food/${fdcId}?api_key=${USDA_API_KEY}`;
  return fetchJson(url);
}

// Nutrient IDs in USDA
const NUTRIENT_IDS = {
  kcal: [1008],
  carbs: [1005],
  fat: [1004],
  protein: [1003],
};

function extractMacros(nutrients: any[]) {
  const find = (ids: number[]) => {
    for (const id of ids) {
      const n = nutrients.find(
        (n) => n.nutrientId === id || Number(n.nutrientNumber) === id
      );
      if (n?.value != null) return Math.round(n.value * 100) / 100;
    }
    return null;
  };
  return {
    kcal: find(NUTRIENT_IDS.kcal),
    carbs: find(NUTRIENT_IDS.carbs),
    fat: find(NUTRIENT_IDS.fat),
    protein: find(NUTRIENT_IDS.protein),
  };
}

function findPortionWeight(portions: any[], unit: string): number | null {
  const u = unit.toLowerCase();

  if (u === "piece") {
    const match = portions.find((p) => {
      const mod = (p.modifier ?? "").toLowerCase();
      const munit = (p.measureUnit?.name ?? "").toLowerCase();
      return (
        mod.includes("medium") ||
        mod.includes("each") ||
        mod.includes("whole") ||
        munit === "each"
      );
    });
    const w = (match ?? portions[0])?.gramWeight;
    return w != null ? Math.round(w) : null;
  }

  if (u === "slice") {
    const match = portions.find((p) =>
      (p.modifier ?? "").toLowerCase().includes("slice")
    );
    const w = (match ?? portions[0])?.gramWeight;
    return w != null ? Math.round(w) : null;
  }

  if (u === "handful") {
    const cup = portions.find((p) =>
      (p.measureUnit?.name ?? "").toLowerCase().includes("cup")
    );
    // Handful ≈ ¼ cup as a rough estimate
    if (cup?.gramWeight) return Math.round(cup.gramWeight / 4);
    return 30; // generic fallback
  }

  if (u === "scoop") {
    const match = portions.find((p) =>
      (p.modifier ?? "").toLowerCase().includes("scoop")
    );
    return match?.gramWeight != null ? Math.round(match.gramWeight) : null;
  }

  if (u === "bottle") {
    const match = portions.find((p) =>
      (p.modifier ?? "").toLowerCase().includes("bottle")
    );
    return match?.gramWeight != null ? Math.round(match.gramWeight) : null;
  }

  return null;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const items = await prisma.groceryItem.findMany({ orderBy: { name: "asc" } });
  console.log(`\nProcessing ${items.length} grocery items from USDA...\n`);

  const warnings: string[] = [];
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const unit = item.unit ?? "g";
    const prefix = `[${String(i + 1).padStart(3)}/${items.length}]`;
    process.stdout.write(`${prefix} ${item.name} (${unit}) ... `);

    // Search USDA
    let foods: any[];
    try {
      foods = await searchFood(item.name.trim());
      await sleep(130);
    } catch (e) {
      console.log("❌ search failed");
      warnings.push(`${item.name}: search error`);
      skipped++;
      continue;
    }

    if (foods.length === 0) {
      console.log("⚠️  no USDA match");
      warnings.push(`${item.name}: no match found`);
      skipped++;
      continue;
    }

    // Prefer Foundation > SR Legacy > anything else
    const best =
      foods.find((f) => f.dataType === "Foundation") ??
      foods.find((f) => f.dataType === "SR Legacy") ??
      foods[0];

    const macros = extractMacros(best.foodNutrients ?? []);

    // Determine unitWeight
    let unitWeight: number | null = null;

    if (MASS_UNITS.has(unit)) {
      unitWeight = null; // already per-100g, no conversion needed
    } else if (STANDARD_UNITS.has(unit)) {
      unitWeight = STANDARD_UNIT_WEIGHTS[unit];
    } else {
      // Fetch detail for portion data
      try {
        const detail = await getFoodDetail(best.fdcId);
        await sleep(130);
        unitWeight = findPortionWeight(detail.foodPortions ?? [], unit);
      } catch (e) {
        console.log("❌ detail fetch failed");
        warnings.push(`${item.name}: detail error`);
        skipped++;
        continue;
      }

      if (unitWeight == null) {
        warnings.push(`${item.name} (${unit}): portion not found, unitWeight=null`);
      }
    }

    await prisma.groceryItem.update({
      where: { id: item.id },
      data: { ...macros, unitWeight },
    });

    updated++;
    const desc = best.description.substring(0, 45).padEnd(45);
    const uw = unitWeight != null ? ` | unit=${unitWeight}g` : "";
    console.log(`✓ ${desc}${uw}`);
  }

  await prisma.$disconnect();

  console.log(`\n${"─".repeat(60)}`);
  console.log(`✅ Updated: ${updated}  ⚠️  Skipped: ${skipped}`);

  if (warnings.length > 0) {
    console.log(`\nWarnings (${warnings.length}):`);
    warnings.forEach((w) => console.log(`  • ${w}`));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
