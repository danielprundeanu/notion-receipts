/**
 * One-time seed: migrate the legacy JSON files into the DB tables added in v0.10.
 *   - data/ingredient_name_mappings.json  → IngredientNameMapping
 *   - data/unit_choices.json              → UnitRule
 *
 * Run from the webapp directory:
 *   npx tsx scripts/seed-import-mappings.ts
 *
 * Idempotent (upsert by unique key). Skips mappings whose grocery item no longer exists.
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local for local dev (Neon), same pattern as import-to-db.ts
const envLocalPath = resolve(__dirname, "../.env.local");
if (existsSync(envLocalPath)) {
  for (const line of readFileSync(envLocalPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
  }
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const MAPPINGS_PATH = resolve(__dirname, "../../data/ingredient_name_mappings.json");
const CHOICES_PATH = resolve(__dirname, "../../data/unit_choices.json");

function readJson(p: string): Record<string, unknown> {
  try { return JSON.parse(readFileSync(p, "utf-8")); } catch { return {}; }
}

async function main() {
  // 1. Ingredient name mappings
  const mappings = readJson(MAPPINGS_PATH);
  const ids = new Set((await prisma.groceryItem.findMany({ select: { id: true } })).map((g) => g.id));
  let mAdded = 0, mSkipped = 0;
  for (const [rawName, val] of Object.entries(mappings)) {
    const v = val as { groceryItemId?: string; groceryItemName?: string };
    if (!v.groceryItemId || !ids.has(v.groceryItemId)) { mSkipped++; continue; }
    await prisma.ingredientNameMapping.upsert({
      where: { rawName },
      update: { groceryItemId: v.groceryItemId, groceryItemName: v.groceryItemName ?? "" },
      create: { rawName, groceryItemId: v.groceryItemId, groceryItemName: v.groceryItemName ?? "" },
    });
    mAdded++;
  }
  console.log(`Ingredient mappings: ${mAdded} upserted, ${mSkipped} skipped (missing grocery item)`);

  // 2. Unit rules
  const choices = readJson(CHOICES_PATH);
  let uAdded = 0, uSkipped = 0;
  for (const [key, val] of Object.entries(choices)) {
    const c = val as { action?: string; unit?: string; rate?: number; from_unit?: string | null };
    if (c.action !== "use_unit" || !c.unit || c.rate == null) { uSkipped++; continue; }
    await prisma.unitRule.upsert({
      where: { key },
      update: { targetUnit: c.unit, rate: c.rate, foreignUnit: c.from_unit ?? null },
      create: { key, targetUnit: c.unit, rate: c.rate, foreignUnit: c.from_unit ?? null },
    });
    uAdded++;
  }
  console.log(`Unit rules: ${uAdded} upserted, ${uSkipped} skipped`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
