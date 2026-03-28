/**
 * Translate grocery item names to Romanian using Claude.
 * Run: npx tsx scripts/translate-ingredients-ro.ts
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
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
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function translateBatch(names: string[]): Promise<Record<string, string>> {
  const prompt = `Translate these English grocery/food ingredient names to Romanian.
Return ONLY a JSON object mapping each English name to its Romanian translation.
Use natural Romanian culinary terms. Keep brand names unchanged.

${names.map((n, i) => `${i + 1}. ${n}`).join("\n")}

Respond with only the JSON object, no other text.`;

  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error(`Unexpected response: ${text.slice(0, 200)}`);
  return JSON.parse(json);
}

async function main() {
  const items = await prisma.groceryItem.findMany({
    where: { nameRo: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  if (items.length === 0) {
    console.log("All items already have Romanian names.");
    await prisma.$disconnect();
    return;
  }

  console.log(`Translating ${items.length} items...`);

  const BATCH = 30;
  let done = 0;

  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    try {
      const translations = await translateBatch(batch.map((it) => it.name));
      for (const item of batch) {
        const ro = translations[item.name];
        if (ro && ro !== item.name) {
          await prisma.groceryItem.update({ where: { id: item.id }, data: { nameRo: ro } });
        }
      }
      done += batch.length;
      console.log(`  ${done}/${items.length}`);
    } catch (err) {
      console.error(`Batch ${i}–${i + BATCH} failed:`, err);
    }
    if (i + BATCH < items.length) await new Promise((r) => setTimeout(r, 300));
  }

  console.log("Done.");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
