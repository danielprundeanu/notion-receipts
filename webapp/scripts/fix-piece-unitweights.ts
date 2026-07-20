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

// Grocery items used "by the piece" that are missing `unitWeight` (grams per piece),
// so nutrition can't convert a "1 piece" quantity to grams. Values are best-effort
// medium sizes — adjust as needed (or tweak later on /ingredients → coloana "g/unit").
const FILL: { name: string; unitWeight: number }[] = [
  { name: "Avocado", unitWeight: 150 },
  { name: "Cherry tomatoes", unitWeight: 17 },
  { name: "Sweet Potato", unitWeight: 130 },
  { name: "Yellow Potato", unitWeight: 150 },
  { name: "Kiwi", unitWeight: 75 },
  { name: "Celery Root", unitWeight: 230 },
  { name: "Bok Choy", unitWeight: 100 },
];

// Also used as "piece" without unitWeight, but "piece" looks wrong for them —
// printed for manual review, NOT written automatically.
const REVIEW = ["Tarragon", "Vanilla Sugar"];

async function main() {
  const names = [...FILL.map((f) => f.name), ...REVIEW];
  const items = await prisma.groceryItem.findMany({ where: { name: { in: names } } });
  const byName = new Map(items.map((i) => [i.name, i]));

  const log: string[] = [];
  const P = (s: string) => { console.log(s); log.push(s); };

  try {
    P(`DB host: ${new URL(process.env.DATABASE_URL ?? "").host || "(gol)"}`);
  } catch {
    P("⚠️  DATABASE_URL nu e un URL valid (verifică .env.local)");
  }
  P(`Mod: ${APPLY ? "APPLY (scrie în DB)" : "DRY-RUN (nimic nu se scrie)"}\n`);

  // Backup the items we're about to touch, before any write.
  if (APPLY) {
    const backupPath = resolve(__dirname, "../../data/backup-unitweights-" + Date.now() + ".json");
    writeFileSync(backupPath, JSON.stringify(items, null, 2));
    P(`💾 Backup salvat: ${backupPath}\n`);
  }

  P("═══ COMPLETEZ unitWeight (g/bucată) ═══");
  let updated = 0, skipped = 0, missing = 0;
  for (const f of FILL) {
    const it = byName.get(f.name);
    if (!it) { P(`  ⚠️  negăsit: "${f.name}" (sări peste)`); missing++; continue; }
    if (it.unitWeight != null) {
      P(`  ⏭️  "${f.name}" are deja unitWeight=${it.unitWeight} (nu ating)`);
      skipped++;
      continue;
    }
    P(`  ✏️  "${f.name}": unitWeight ${it.unitWeight ?? "—"} → ${f.unitWeight} g  (unit=${it.unit ?? "—"}, unit2=${it.unit2 ?? "—"})`);
    updated++;
    if (APPLY) {
      await prisma.groceryItem.update({ where: { id: it.id }, data: { unitWeight: f.unitWeight } });
    }
  }

  P("\n═══ DE REVIZUIT MANUAL (nu se scriu) ═══");
  for (const name of REVIEW) {
    const it = byName.get(name);
    if (!it) { P(`  ⚠️  negăsit: "${name}"`); continue; }
    P(`  🔎 "${name}": unit=${it.unit ?? "—"}, unit2=${it.unit2 ?? "—"}, unitWeight=${it.unitWeight ?? "—"} — verifică dacă "piece" e corect`);
  }

  P(`\n${updated} de completat, ${skipped} deja setate, ${missing} negăsite.`);
  P(APPLY ? "✅ Aplicat." : "ℹ️  Dry-run. Rulează cu --apply pentru a scrie.");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
