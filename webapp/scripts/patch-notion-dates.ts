/**
 * One-time script: update createdAt for all recipes imported from Notion.
 * Fetches created_time from Notion API for each recipe that has a notionId.
 *
 * Run from the webapp directory:
 *   npx tsx scripts/patch-notion-dates.ts
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

// Load notion.env for NOTION_TOKEN
const notionEnvPath = resolve(__dirname, "../../notion.env");
if (existsSync(notionEnvPath)) {
  for (const line of readFileSync(notionEnvPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().split(/\s+#/)[0].trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

const NOTION_TOKEN = process.env.NOTION_TOKEN;
if (!NOTION_TOKEN) throw new Error("NOTION_TOKEN not set");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function getNotionCreatedTime(notionId: string): Promise<string | null> {
  const res = await fetch(`https://api.notion.com/v1/pages/${notionId}`, {
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": "2022-06-28",
    },
  });
  if (!res.ok) {
    console.warn(`  ⚠ Notion API error ${res.status} for ${notionId}`);
    return null;
  }
  const data = (await res.json()) as { created_time?: string };
  return data.created_time ?? null;
}

async function main() {
  const recipes = await prisma.recipe.findMany({
    where: { notionId: { not: null } },
    select: { id: true, name: true, notionId: true, createdAt: true },
  });

  console.log(`Found ${recipes.length} recipes with notionId\n`);

  let updated = 0;
  let failed = 0;

  for (const recipe of recipes) {
    const notionId = recipe.notionId!;
    const createdTime = await getNotionCreatedTime(notionId);
    if (!createdTime) {
      failed++;
      continue;
    }

    const notionDate = new Date(createdTime);
    const currentDate = recipe.createdAt;

    // Skip if already correct (within 1 minute tolerance)
    if (Math.abs(notionDate.getTime() - currentDate.getTime()) < 60_000) {
      console.log(`  ✓ ${recipe.name} — already correct`);
      continue;
    }

    await prisma.recipe.update({
      where: { id: recipe.id },
      data: { createdAt: notionDate },
    });

    console.log(`  ✅ ${recipe.name}: ${currentDate.toISOString()} → ${notionDate.toISOString()}`);
    updated++;
  }

  console.log(`\nDone: ${updated} updated, ${failed} failed`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
