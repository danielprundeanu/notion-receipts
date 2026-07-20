import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { readFileSync, existsSync, writeFileSync } from "fs";
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

const APPLY = process.argv.includes("--apply");
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// (from category → into target category). Values must match the DB exactly (with emoji).
const MERGES: { from: string; into: string }[] = [
  { from: "🥫 Canned",          into: "🥫 Canned & Preserved" },
  { from: "🥛 Dairy",           into: "🥚 Dairy & Eggs" },
  { from: "🥕 Veg & Legumes",   into: "🥕 Vegetables" },
];

async function main() {
  const log: string[] = [];
  const P = (s: string) => { console.log(s); log.push(s); };

  try {
    P(`DB host: ${new URL(process.env.DATABASE_URL ?? "").host || "(gol)"}`);
  } catch {
    P("⚠️  DATABASE_URL nu e un URL valid (verifică .env.local)");
  }
  P(`Mod: ${APPLY ? "APPLY (scrie în DB)" : "DRY-RUN (nimic nu se scrie)"}\n`);

  // Backup all items in any category involved (source or target), before any write.
  if (APPLY) {
    const involved = MERGES.flatMap((m) => [m.from, m.into]);
    const affected = await prisma.groceryItem.findMany({ where: { category: { in: involved } } });
    const backupPath = resolve(__dirname, "../../data/backup-categories-" + Date.now() + ".json");
    writeFileSync(backupPath, JSON.stringify(affected, null, 2));
    P(`💾 Backup salvat: ${backupPath} (${affected.length} produse)\n`);
  }

  P("═══ MERGE CATEGORII ═══");
  let total = 0;
  for (const m of MERGES) {
    const count = await prisma.groceryItem.count({ where: { category: m.from } });
    P(`  "${m.from}" → "${m.into}"  (${count} produse)`);
    total += count;
    if (APPLY && count > 0) {
      await prisma.groceryItem.updateMany({
        where: { category: m.from },
        data: { category: m.into },
      });
    }
  }

  P(`\n${total} produse ${APPLY ? "mutate" : "de mutat"}.`);
  P(APPLY ? "✅ Aplicat." : "ℹ️  Dry-run. Rulează cu --apply pentru a scrie.");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
