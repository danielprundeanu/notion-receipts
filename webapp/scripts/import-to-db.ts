/**
 * Import data from Notion export (data/export.json) into the database.
 *
 * Run from the webapp directory:
 *   npx tsx scripts/import-to-db.ts
 *
 * Requires DATABASE_URL set in .env.local (or environment).
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "../app/generated/prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const exportPath = resolve(__dirname, "../../data/export.json");

console.log(`📂 Loading export from: ${exportPath}`);
const data = JSON.parse(readFileSync(exportPath, "utf-8"));

const prisma = new PrismaClient();

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

        await prisma.ingredient.create({
          data: {
            recipeId: dbRecipe.id,
            groceryItemId,
            groupOrder: ing.groupOrder ?? 1,
            quantity: ing.quantity ?? null,
            unit: ing.groceryItem?.unit ?? null,
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
