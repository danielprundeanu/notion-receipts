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

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const norm = (s: string | null | undefined) =>
  (s ?? "").trim().toLocaleLowerCase("ro-RO")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/s$/, ""); // crude singular (drop trailing s)

async function main() {
  const items = await prisma.groceryItem.findMany({
    select: { id: true, name: true, nameRo: true, category: true, kcal: true, _count: { select: { ingredients: true } } },
    orderBy: { name: "asc" },
  });

  console.log(`Total grocery items: ${items.length}\n`);

  // Group by normalized RO name (best signal for true duplicates)
  console.log("═══ DUPLICATE după NUME RO (normalizat, fără diacritice/plural) ═══");
  const byRo = new Map<string, typeof items>();
  for (const i of items) {
    if (!i.nameRo || !i.nameRo.trim()) continue;
    const k = norm(i.nameRo);
    if (!byRo.has(k)) byRo.set(k, []);
    byRo.get(k)!.push(i);
  }
  let ro = 0;
  for (const [k, grp] of [...byRo].sort()) {
    if (grp.length > 1) {
      ro++;
      console.log(`  [${k}]`);
      for (const i of grp)
        console.log(`      · EN "${i.name}"  RO "${i.nameRo}"  (uses:${i._count.ingredients}, kcal:${i.kcal ?? "—"})`);
    }
  }
  console.log(`  → ${ro} grupuri RO-duplicate\n`);

  // Group by normalized EN name
  console.log("═══ DUPLICATE după NUME EN (normalizat, fără diacritice/plural) ═══");
  const byEn = new Map<string, typeof items>();
  for (const i of items) {
    const k = norm(i.name);
    if (!byEn.has(k)) byEn.set(k, []);
    byEn.get(k)!.push(i);
  }
  let en = 0;
  for (const [k, grp] of [...byEn].sort()) {
    if (grp.length > 1) {
      en++;
      console.log(`  [${k}]`);
      for (const i of grp)
        console.log(`      · EN "${i.name}"  RO "${i.nameRo}"  (uses:${i._count.ingredients}, kcal:${i.kcal ?? "—"})`);
    }
  }
  console.log(`  → ${en} grupuri EN-duplicate\n`);

  // Garbage names & their recipe references
  console.log("═══ NUME GARBAGE / DEFECTE — cu referințe la rețete ═══");
  const suspects = items.filter((i) =>
    /\bsau\b|\bde\b$|^ingur|^inguri|\b1\b|^red ca$|^cher$/i.test(i.name.trim()) ||
    i.name.trim().split(/\s+/).length >= 4
  );
  for (const i of suspects) {
    const ings = await prisma.ingredient.findMany({
      where: { groceryItemId: i.id },
      select: { quantity: true, unit: true, recipe: { select: { name: true } } },
    });
    console.log(`  · "${i.name}" (uses:${i._count.ingredients})`);
    for (const ing of ings)
      console.log(`        └ rețetă "${ing.recipe.name}"  ${ing.quantity ?? ""} ${ing.unit ?? ""}`);
  }
  console.log();

  await prisma.$disconnect();
}

main();
