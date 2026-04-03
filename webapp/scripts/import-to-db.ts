/**
 * Import data from Notion export (data/export.json) into the database.
 *
 * Run from the webapp directory:
 *   npx tsx scripts/import-to-db.ts
 *
 * Requires DATABASE_URL set in .env.local (or environment).
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local for local dev
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

const exportPath = resolve(__dirname, "../../data/export.json");

console.log(`📂 Loading export from: ${exportPath}`);
const data = JSON.parse(readFileSync(exportPath, "utf-8"));

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log(`\n📦 Importing ${data.groceryItems.length} grocery items…`);

  const itemFields = (item: (typeof data.groceryItems)[0]) => ({
    name: item.name,
    category: item.category ?? null,
    unit: item.unit ?? null,
    unit2: item.unit2 ?? null,
    conversion: item.conversion ?? null,
    kcal: item.kcal ?? null,
    carbs: item.carbs ?? null,
    fat: item.fat ?? null,
    protein: item.protein ?? null,
    ...(item.createdAt ? { createdAt: new Date(item.createdAt) } : {}),
  });

  for (const item of data.groceryItems) {
    if (!item.notionId || !item.name) continue;
    try {
      await prisma.groceryItem.upsert({
        where: { notionId: item.notionId },
        update: itemFields(item),
        create: { notionId: item.notionId, ...itemFields(item) },
      });
    } catch {
      // Name collision — update the existing record by name, merge notionId
      await prisma.groceryItem.upsert({
        where: { name: item.name },
        update: { notionId: item.notionId, ...itemFields(item) },
        create: { notionId: item.notionId, ...itemFields(item) },
      });
    }
  }

  console.log(`✓ Grocery items done`);
  console.log(`\n🍳 Importing ${data.recipes.length} recipes…`);

  let ok = 0;
  let errors = 0;

  for (const recipe of data.recipes) {
    if (!recipe.notionId || !recipe.name) continue;

    try {
      const dbRecipe = await prisma.recipe.upsert({
        where: { notionId: recipe.notionId },
        update: {
          name: recipe.name,
          servings: recipe.servings ?? null,
          time: recipe.time ?? null,
          difficulty: recipe.difficulty ?? null,
          category: recipe.category ?? null,
          favorite: recipe.favorite ?? false,
          link: recipe.link ?? null,
          imageUrl: recipe.imageUrl ?? null,
        },
        create: {
          notionId: recipe.notionId,
          name: recipe.name,
          servings: recipe.servings ?? null,
          time: recipe.time ?? null,
          difficulty: recipe.difficulty ?? null,
          category: recipe.category ?? null,
          favorite: recipe.favorite ?? false,
          link: recipe.link ?? null,
          imageUrl: recipe.imageUrl ?? null,
          ...(recipe.createdAt ? { createdAt: new Date(recipe.createdAt) } : {}),
        },
      });

      await prisma.ingredient.deleteMany({ where: { recipeId: dbRecipe.id } });
      await prisma.instruction.deleteMany({ where: { recipeId: dbRecipe.id } });

      for (let i = 0; i < (recipe.ingredients ?? []).length; i++) {
        const ing = recipe.ingredients[i];
        let groceryItemId = null;

        if (ing.groceryItemId) {
          const gi = await prisma.groceryItem.findUnique({
            where: { notionId: ing.groceryItemId },
            select: { id: true, unit: true },
          });
          if (gi) groceryItemId = gi.id;
        }

        // Use qty1/unit1 when available; fall back to qty2/unit2 if only unit2 was filled in Notion
        const useUnit2 = ing.quantity == null && ing.quantity2 != null;
        const quantity = useUnit2 ? ing.quantity2 : (ing.quantity ?? null);
        const unit = useUnit2
          ? (ing.groceryItem?.unit2 ?? null)
          : (ing.groceryItem?.unit ?? null);

        await prisma.ingredient.create({
          data: {
            recipeId: dbRecipe.id,
            groceryItemId,
            groupOrder: ing.groupOrder ?? 1,
            quantity,
            unit,
            notes: ing.notes ?? null,
            order: i,
          },
        });
      }

      for (const inst of recipe.instructions ?? []) {
        await prisma.instruction.create({
          data: {
            recipeId: dbRecipe.id,
            step: inst.step ?? 0,
            text: inst.text,
            isSection: inst.isSection ?? false,
          },
        });
      }

      process.stdout.write(`  ✓ ${recipe.name}\n`);
      ok++;
    } catch (err) {
      process.stdout.write(`  ✗ ${recipe.name}: ${err instanceof Error ? err.message : String(err)}\n`);
      errors++;
    }
  }

  console.log(`\n✅ Import complete: ${ok} recipes, ${errors} errors`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
