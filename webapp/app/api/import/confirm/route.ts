import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

// ─── Types ────────────────────────────────────────────────────────────────────

type ConfirmedIngredient = {
  name: string;
  qty: number | null;
  unit: string | null;
  groupName: string | null;
  groupOrder: number;
  order: number;
  // Resolved match info
  groceryItemId?: string | null;   // existing item
  newItem?: {                       // new item to create
    name: string;
    unit: string | null;
    unit2?: string | null;
    category: string | null;
  };
};

type ConfirmedRecipe = {
  name: string;
  servings: number | null;
  time: number | null;
  difficulty: string | null;
  category: string | null;
  link: string | null;
  image: string | null;
  favorite: boolean;
  ingredients: ConfirmedIngredient[];
  instructions: Array<{ text: string; isSection: boolean }>;
};

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { recipes } = (await req.json()) as { recipes: ConfirmedRecipe[] };

    if (!Array.isArray(recipes) || recipes.length === 0) {
      return NextResponse.json({ error: "Nu sunt rețete de importat" }, { status: 400 });
    }

    const created: string[] = [];
    const newIngredientCount: number[] = [];

    for (const recipeData of recipes) {
      // Create recipe
      const recipe = await prisma.recipe.create({
        data: {
          name: recipeData.name,
          servings: recipeData.servings,
          time: recipeData.time,
          difficulty: recipeData.difficulty,
          category: recipeData.category,
          favorite: recipeData.favorite,
          link: recipeData.link,
          imageUrl: recipeData.image ?? null,
        },
      });

      let newItemsCreated = 0;

      // Create ingredients
      const sortedIngredients = [...recipeData.ingredients].sort(
        (a, b) => a.groupOrder - b.groupOrder || a.order - b.order
      );

      for (const ing of sortedIngredients) {
        let groceryItemId: string | null = ing.groceryItemId ?? null;

        // Create new GroceryItem if needed
        if (!groceryItemId && ing.newItem) {
          const existing = await prisma.groceryItem.findFirst({
            where: { name: { equals: ing.newItem.name, mode: "insensitive" } },
          });

          if (existing) {
            groceryItemId = existing.id;
          } else {
            const created = await prisma.groceryItem.create({
              data: {
                name: ing.newItem.name,
                unit: ing.newItem.unit,
                unit2: ing.newItem.unit2 ?? null,
                category: ing.newItem.category,
              },
            });
            groceryItemId = created.id;
            newItemsCreated++;
          }
        }

        await prisma.ingredient.create({
          data: {
            recipeId: recipe.id,
            groceryItemId,
            quantity: ing.qty,
            unit: ing.unit,
            groupName: ing.groupName,
            groupOrder: ing.groupOrder,
            order: ing.order,
          },
        });
      }

      // Create instructions
      let stepCounter = 0;
      for (const inst of recipeData.instructions) {
        if (!inst.text.trim()) continue;
        if (!inst.isSection) stepCounter++;
        await prisma.instruction.create({
          data: {
            recipeId: recipe.id,
            step: inst.isSection ? 0 : stepCounter,
            text: inst.text.trim(),
            isSection: inst.isSection,
          },
        });
      }

      created.push(recipe.id);
      newIngredientCount.push(newItemsCreated);
    }

    revalidatePath("/recipes");
    revalidatePath("/ingredients");

    return NextResponse.json({
      success: true,
      recipeIds: created,
      recipesCreated: created.length,
      newIngredientsCreated: newIngredientCount.reduce((a, b) => a + b, 0),
    });
  } catch (err) {
    console.error("[import/confirm] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Eroare internă" },
      { status: 500 }
    );
  }
}
