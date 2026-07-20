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

const cap = (s: string) => {
  const t = s.trim();
  return t ? t[0].toLocaleUpperCase("ro-RO") + t.slice(1) : t;
};

// (loser name, winner name, copyNutrition?, forceRo?)
const MERGES: { loser: string; winner: string; copyNutrition?: boolean; setRo?: string }[] = [
  { loser: "almonds", winner: "Almond" },
  { loser: "kale", winner: " Kale" },
  { loser: "red cabbage", winner: " Red Cabbage" },
  { loser: "parmesan", winner: "Parmesan cheese" },
  { loser: "raspberries", winner: "Raspberry" },
  { loser: "shrimp", winner: "Shrimps" },
  { loser: "Yellow Onion", winner: " Yellow Onion" },
  { loser: "dates", winner: "Date", copyNutrition: true, setRo: "Curmale" },
  { loser: " Peppermint Leaves", winner: "Mint leaves" },
];

// defective name -> existing target (repoint refs, delete source)
const REMAPS: { from: string; to: string }[] = [
  { from: "red ca", to: " Red Bell Pepper" },
];

// broken references to delete (delete ingredient refs, then item)
const DELETE_WITH_REFS = ["cher"];

// pure garbage, uses:0 (delete item; cascade handles mappings)
const DELETE_GARBAGE = ["fasole uscata sau 1", "ingura seminte de chimen", "inguri boia dulce de"];

async function main() {
  const all = await prisma.groceryItem.findMany();
  const byName = new Map(all.map((i) => [i.name, i]));
  const log: string[] = [];
  const P = (s: string) => { console.log(s); log.push(s); };

  // Backup
  const backupPath = resolve(__dirname, "../../data/backup-grocery-items-" + Date.now() + ".json");
  if (APPLY) {
    writeFileSync(backupPath, JSON.stringify(all, null, 2));
    P(`💾 Backup salvat: ${backupPath}\n`);
  }

  P(`Mod: ${APPLY ? "APPLY (scrie în DB)" : "DRY-RUN (nimic nu se scrie)"}\n`);

  // Sanity: verify all referenced names exist
  const need = [
    ...MERGES.flatMap((m) => [m.loser, m.winner]),
    ...REMAPS.flatMap((r) => [r.from, r.to]),
    ...DELETE_WITH_REFS, ...DELETE_GARBAGE,
  ];
  const missing = need.filter((n) => !byName.has(n));
  if (missing.length) {
    P(`⚠️  Nume negăsite (abort): ${missing.map((m) => `"${m}"`).join(", ")}`);
    await prisma.$disconnect();
    return;
  }

  // ── 1. MERGES ──────────────────────────────────────────────
  P("═══ 1. UNIRI ═══");
  for (const m of MERGES) {
    const loser = byName.get(m.loser)!, winner = byName.get(m.winner)!;
    const refs = await prisma.ingredient.count({ where: { groceryItemId: loser.id } });
    const maps = await prisma.ingredientNameMapping.count({ where: { groceryItemId: loser.id } });
    P(`  "${m.loser}" → "${m.winner}"  (repoint ${refs} ingr, ${maps} mapping${m.copyNutrition ? ", copiez nutriția" : ""}${m.setRo ? `, RO→"${m.setRo}"` : ""})`);
    if (APPLY) {
      await prisma.ingredient.updateMany({ where: { groceryItemId: loser.id }, data: { groceryItemId: winner.id } });
      await prisma.ingredientNameMapping.updateMany({ where: { groceryItemId: loser.id }, data: { groceryItemId: winner.id, groceryItemName: cap(winner.name) } });
      if (m.copyNutrition || m.setRo) {
        await prisma.groceryItem.update({
          where: { id: winner.id },
          data: {
            ...(m.copyNutrition ? { kcal: loser.kcal, carbs: loser.carbs, fat: loser.fat, protein: loser.protein } : {}),
            ...(m.setRo ? { nameRo: m.setRo } : {}),
          },
        });
      }
      await prisma.groceryItem.delete({ where: { id: loser.id } });
    }
  }

  // ── 2. REMAPS ──────────────────────────────────────────────
  P("\n═══ 2. RE-MAPĂRI (nume defect → ingredient real) ═══");
  for (const r of REMAPS) {
    const from = byName.get(r.from)!, to = byName.get(r.to)!;
    const refs = await prisma.ingredient.count({ where: { groceryItemId: from.id } });
    P(`  "${r.from}" → "${r.to}"  (repoint ${refs} ingr, șterg "${r.from}")`);
    if (APPLY) {
      await prisma.ingredient.updateMany({ where: { groceryItemId: from.id }, data: { groceryItemId: to.id } });
      await prisma.ingredientNameMapping.updateMany({ where: { groceryItemId: from.id }, data: { groceryItemId: to.id, groceryItemName: cap(to.name) } });
      await prisma.groceryItem.delete({ where: { id: from.id } });
    }
  }

  // ── 3. DELETE broken refs ──────────────────────────────────
  P("\n═══ 3. REFERINȚE DEFECTE ȘTERSE ═══");
  for (const name of DELETE_WITH_REFS) {
    const it = byName.get(name)!;
    const refs = await prisma.ingredient.count({ where: { groceryItemId: it.id } });
    P(`  "${name}"  (șterg ${refs} referință/e din rețete + ingredientul)`);
    if (APPLY) {
      await prisma.ingredient.deleteMany({ where: { groceryItemId: it.id } });
      await prisma.groceryItem.delete({ where: { id: it.id } });
    }
  }

  // ── 4. DELETE garbage ──────────────────────────────────────
  P("\n═══ 4. GARBAGE ȘTERS (uses:0) ═══");
  for (const name of DELETE_GARBAGE) {
    P(`  "${name}"`);
    if (APPLY) await prisma.groceryItem.delete({ where: { id: byName.get(name)!.id } });
  }

  // ── 5. TRIM + CAPITALIZE survivors ─────────────────────────
  P("\n═══ 5. TRIM + CAPITALIZARE ═══");
  const removed = new Set([...MERGES.map((m) => m.loser), ...REMAPS.map((r) => r.from), ...DELETE_WITH_REFS, ...DELETE_GARBAGE]);
  const survivors = all.filter((i) => !removed.has(i.name));

  // collision guard on final EN names
  const finalNames = new Map<string, string[]>();
  for (const i of survivors) {
    const fn = cap(i.name);
    if (!finalNames.has(fn)) finalNames.set(fn, []);
    finalNames.get(fn)!.push(i.name);
  }
  const collisions = [...finalNames].filter(([, v]) => v.length > 1);
  if (collisions.length) {
    P("  ⚠️  COLIZIUNI de nume (nu capitalizez acestea):");
    for (const [fn, orig] of collisions) P(`      "${fn}" ← ${orig.map((o) => `"${o}"`).join(", ")}`);
  }
  const colliding = new Set(collisions.flatMap(([, v]) => v));

  let renamedEn = 0, renamedRo = 0;
  for (const i of survivors) {
    if (colliding.has(i.name)) continue;
    const newName = cap(i.name);
    const newRo = i.nameRo && i.nameRo.trim() ? cap(i.nameRo) : i.nameRo;
    const changed = newName !== i.name || newRo !== i.nameRo;
    if (!changed) continue;
    if (newName !== i.name) renamedEn++;
    if (newRo !== i.nameRo) renamedRo++;
    if (APPLY) {
      await prisma.groceryItem.update({ where: { id: i.id }, data: { name: newName, nameRo: newRo } });
    }
  }
  P(`  → ${renamedEn} nume EN + ${renamedRo} nume RO modificate`);

  // ── 6. sync mapping names ──────────────────────────────────
  if (APPLY) {
    const maps = await prisma.ingredientNameMapping.findMany({ include: { groceryItem: { select: { name: true } } } });
    for (const mp of maps) {
      if (mp.groceryItemName !== mp.groceryItem.name) {
        await prisma.ingredientNameMapping.update({ where: { id: mp.id }, data: { groceryItemName: mp.groceryItem.name } });
      }
    }
  }

  P(`\n${APPLY ? "✅ Aplicat." : "ℹ️  Dry-run. Rulează cu --apply pentru a scrie."}`);
  await prisma.$disconnect();
}

main();
