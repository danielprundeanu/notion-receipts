// CLI importer used by the /import-recipe Claude Code skill. It goes through the same
// lib/import.ts code as the import wizard, so imported recipes follow the app's rules
// (units, learned mappings, unit rules, atomic saves).
//
//   npx tsx scripts/import-recipe.mts parse-urls <url...>      scrape + match → JSON
//   npx tsx scripts/import-recipe.mts match <raw.json>         match RawRecipe[] (hand-extracted) → JSON
//   npx tsx scripts/import-recipe.mts items [query]            grocery items (TSV), optionally filtered
//   npx tsx scripts/import-recipe.mts meta                     categories, difficulties, units in use
//   npx tsx scripts/import-recipe.mts check <confirmed.json>   validate a payload, writes nothing
//   npx tsx scripts/import-recipe.mts import <confirmed.json>  check, then save
//
// <confirmed.json> = { "recipes": ConfirmedRecipe[], "newUnitRules"?: NewUnitRule[] }
// (the body the wizard POSTs to /api/import/confirm). Writes go to the DATABASE_URL
// in .env.local — that is the production Neon database.
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const eq = line.indexOf("=");
    if (eq < 0 || line.trim().startsWith("#")) continue;
    const k = line.slice(0, eq).trim(), v = line.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

// lib/db reads DATABASE_URL at import time, so the app modules load (dynamically) after
// the env; type-only imports are erased and don't load anything.
import type { ConfirmedRecipe, NewUnitRule } from "../lib/import";
import type { RawRecipe } from "../lib/recipe-scraper";
const { prisma } = await import("../lib/db");
const { matchRawRecipes, importRecipes, ImportFailure } = await import("../lib/import");
const { parseUrls } = await import("../lib/recipe-scraper");
const { GROCERY_CATEGORIES } = await import("../lib/constants");

const APP_URL = "https://notion-recipe.vercel.app";

const print = (v: unknown) => console.log(JSON.stringify(v, null, 2));
const readJson = <T,>(file: string): T => JSON.parse(readFileSync(resolve(process.cwd(), file), "utf-8")) as T;

// Problems that would import a wrong recipe. Errors block the import; warnings don't.
async function check(payload: { recipes: ConfirmedRecipe[]; newUnitRules?: NewUnitRule[] }) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const recipes = payload.recipes ?? [];
  if (recipes.length === 0) errors.push("No recipes in the payload.");

  const ids = [...new Set(recipes.flatMap((r) => r.ingredients.map((i) => i.groceryItemId).filter(Boolean) as string[]))];
  const items = new Map(
    (await prisma.groceryItem.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, unit: true, unit2: true } }))
      .map((i) => [i.id, i])
  );

  for (const r of recipes) {
    const at = `"${r.name}"`;
    if (!r.name?.trim()) errors.push("A recipe has no name.");
    if (r.ingredients.length === 0) warnings.push(`${at}: no ingredients.`);
    if (r.instructions.length === 0) warnings.push(`${at}: no instructions.`);
    const others = r.replaceRecipeId ? { id: { not: r.replaceRecipeId } } : {};
    if (r.replaceRecipeId) {
      const target = await prisma.recipe.findUnique({ where: { id: r.replaceRecipeId }, select: { name: true } });
      if (!target) errors.push(`${at}: recipe to replace ${r.replaceRecipeId} doesn't exist.`);
      else warnings.push(`${at}: replaces the existing recipe "${target.name}" (${APP_URL}/recipes/${r.replaceRecipeId}).`);
    }
    if (r.link) {
      const dup = await prisma.recipe.findFirst({ where: { link: r.link, ...others }, select: { id: true, name: true } });
      if (dup) warnings.push(`${at}: link already imported as "${dup.name}" (${APP_URL}/recipes/${dup.id}).`);
    }
    const sameName = await prisma.recipe.findFirst({ where: { name: { equals: r.name, mode: "insensitive" }, ...others }, select: { id: true } });
    if (sameName) warnings.push(`${at}: a recipe with this name already exists (${APP_URL}/recipes/${sameName.id}).`);

    for (const ing of r.ingredients) {
      const ingAt = `${at} → "${ing.name}"`;
      if (ing.groceryItemId) {
        const item = items.get(ing.groceryItemId);
        if (!item) { errors.push(`${ingAt}: grocery item ${ing.groceryItemId} doesn't exist.`); continue; }
        // After addUnit2 the recipe unit becomes the item's unit2, so it's allowed.
        const allowed = [item.unit, ing.addUnit2 ? ing.unit : item.unit2].filter(Boolean);
        if (ing.unit && allowed.length > 0 && !allowed.includes(ing.unit)) {
          errors.push(`${ingAt}: unit "${ing.unit}" isn't one of "${item.name}"'s units (${allowed.join(", ")}) — convert the quantity.`);
        }
        if (ing.addUnit2 && item.unit2 && item.unit2 !== ing.unit) {
          errors.push(`${ingAt}: addUnit2 would replace "${item.name}"'s existing unit2 "${item.unit2}".`);
        }
      } else if (ing.newItem) {
        const n = ing.newItem;
        const allowed = [n.unit, n.unit2].filter(Boolean);
        if (ing.unit && !allowed.includes(ing.unit)) errors.push(`${ingAt}: unit "${ing.unit}" isn't one of the new item's units (${allowed.join(", ") || "none"}).`);
        if (n.unit2 && n.conversion == null) warnings.push(`${ingAt}: new item has unit2 "${n.unit2}" but no conversion.`);
        if (!n.category || !GROCERY_CATEGORIES.includes(n.category)) errors.push(`${ingAt}: new item category "${n.category}" isn't one of: ${GROCERY_CATEGORIES.join(", ")}.`);
      } else {
        errors.push(`${ingAt}: not resolved (needs groceryItemId or newItem).`);
      }
      if (ing.qty != null && !(ing.qty > 0)) errors.push(`${ingAt}: quantity ${ing.qty} must be positive.`);
    }

    for (const ref of r.references ?? []) {
      if (ref.refRecipeId) {
        const target = await prisma.recipe.findUnique({ where: { id: ref.refRecipeId }, select: { name: true } });
        if (!target) errors.push(`${at}: referenced recipe ${ref.refRecipeId} doesn't exist.`);
      } else if (ref.refIndex == null || ref.refIndex < 0 || ref.refIndex >= recipes.indexOf(r)) {
        errors.push(`${at}: reference refIndex ${ref.refIndex} must point to an earlier recipe in this payload.`);
      }
      if (!(ref.quantity > 0) || !["serving", "g"].includes(ref.unit)) errors.push(`${at}: reference needs quantity > 0 and unit "serving" or "g".`);
    }
  }
  return { errors, warnings };
}

const [cmd, ...args] = process.argv.slice(2);

try {
  switch (cmd) {
    case "parse-urls": {
      if (args.length === 0) throw new Error("usage: parse-urls <url...>");
      print(await matchRawRecipes(await parseUrls(args)));
      break;
    }
    case "match": {
      if (!args[0]) throw new Error("usage: match <raw.json>");
      const raw = readJson<RawRecipe | RawRecipe[]>(args[0]);
      print(await matchRawRecipes(Array.isArray(raw) ? raw : [raw]));
      break;
    }
    case "items": {
      const q = args.join(" ").trim();
      const rows = await prisma.groceryItem.findMany({
        where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { nameRo: { contains: q, mode: "insensitive" } }] } : {},
        select: { id: true, name: true, nameRo: true, unit: true, unit2: true, conversion: true, unitWeight: true, category: true },
        orderBy: { name: "asc" },
      });
      console.log("id\tname\tnameRo\tunit\tunit2\tconversion\tunitWeight\tcategory");
      for (const r of rows) {
        console.log([r.id, r.name, r.nameRo ?? "", r.unit ?? "", r.unit2 ?? "", r.conversion ?? "", r.unitWeight ?? "", r.category ?? ""].join("\t"));
      }
      break;
    }
    case "meta": {
      const recipes = await prisma.recipe.findMany({ select: { category: true, difficulty: true } });
      const count = (vals: string[]) =>
        Object.entries(vals.reduce<Record<string, number>>((acc, v) => ({ ...acc, [v]: (acc[v] ?? 0) + 1 }), {}))
          .sort((a, b) => b[1] - a[1]).map(([v, n]) => `${v} (${n})`);
      const units = await prisma.groceryItem.findMany({ select: { unit: true, unit2: true } });
      print({
        recipeCategories: count(recipes.flatMap((r) => (r.category ?? "").split(",").map((c) => c.trim()).filter(Boolean))),
        difficulties: count(recipes.map((r) => r.difficulty).filter(Boolean) as string[]),
        groceryCategories: GROCERY_CATEGORIES,
        unitsInUse: count(units.flatMap((u) => [u.unit, u.unit2]).filter(Boolean) as string[]),
      });
      break;
    }
    case "check":
    case "import": {
      if (!args[0]) throw new Error(`usage: ${cmd} <confirmed.json>`);
      const payload = readJson<{ recipes: ConfirmedRecipe[]; newUnitRules?: NewUnitRule[] }>(args[0]);
      const { errors, warnings } = await check(payload);
      for (const w of warnings) console.log(`⚠️  ${w}`);
      for (const e of errors) console.log(`❌ ${e}`);
      if (errors.length > 0) { process.exitCode = 1; break; }
      if (cmd === "check") { console.log(`✅ ${payload.recipes.length} recipe(s) ready to import.`); break; }

      const { recipeIds, newIngredientsCreated } = await importRecipes(payload.recipes, payload.newUnitRules ?? []);
      console.log(`✅ Imported ${recipeIds.length} recipe(s), ${newIngredientsCreated} new grocery item(s):`);
      recipeIds.forEach((id, i) => console.log(`- ${payload.recipes[i].name}: ${APP_URL}/recipes/${id}`));
      break;
    }
    default:
      throw new Error("commands: parse-urls | match | items | meta | check | import (see the header of this file)");
  }
} catch (e) {
  if (e instanceof ImportFailure && e.recipeIds.length > 0) {
    console.error(`Imported ${e.recipeIds.length} recipe(s) before failing: ${e.recipeIds.map((id) => `${APP_URL}/recipes/${id}`).join(", ")}`);
  }
  console.error(`❌ ${e instanceof Error ? e.message : e}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
