"use server";

import { prisma } from "./db";
import { revalidatePath } from "next/cache";

// ─── Recipe Form Types ────────────────────────────────────────────────────────

export type RecipeFormInput = {
  name: string;
  categories: string[];
  servings: number | null;
  time: number | null;
  difficulty: string | null;
  favorite: boolean;
  link: string | null;
  imageUrl: string | null;
  ingredients: Array<{
    groceryItemName: string;
    quantity: number | null;
    unit: string | null;
    groupOrder: number;
    groupName: string | null;
    order: number;
  }>;
  instructions: Array<{
    text: string;
    isSection: boolean;
    step: number;
    instrType?: string | null;
  }>;
};

// ─── Grocery Item Search ──────────────────────────────────────────────────────

export async function searchGroceryItems(query: string) {
  if (query.trim().length < 2) return [];
  return prisma.groceryItem.findMany({
    where: {
      OR: [
        { name:   { contains: query, mode: "insensitive" } },
        { nameRo: { contains: query, mode: "insensitive" } },
      ],
    },
    take: 10,
    orderBy: { name: "asc" },
    select: { id: true, name: true, nameRo: true, unit: true, unit2: true },
  });
}

export async function getGroceryItemDetails(id: string) {
  return prisma.groceryItem.findUnique({
    where: { id },
    select: {
      id: true, name: true, nameRo: true, category: true, unit: true, unit2: true,
      conversion: true, kcal: true, carbs: true, fat: true, protein: true, unitWeight: true,
    },
  });
}

// ─── Recipe CRUD ──────────────────────────────────────────────────────────────

async function buildIngredientsAndInstructions(
  recipeId: string,
  data: RecipeFormInput
) {
  for (const ing of data.ingredients) {
    if (!ing.groceryItemName.trim()) continue;

    let groceryItem = await prisma.groceryItem.findFirst({
      where: { name: ing.groceryItemName.trim() },
    });
    if (!groceryItem) {
      groceryItem = await prisma.groceryItem.create({
        data: { name: ing.groceryItemName.trim(), unit: ing.unit ?? null },
      });
    }

    await prisma.ingredient.create({
      data: {
        recipeId,
        groceryItemId: groceryItem.id,
        quantity: ing.quantity,
        unit: ing.unit ?? groceryItem.unit,
        groupOrder: ing.groupOrder,
        groupName: ing.groupName ?? null,
        order: ing.order,
      },
    });
  }

  let order = 0;
  for (const inst of data.instructions) {
    if (!inst.text.trim()) continue;
    order++;
    await prisma.instruction.create({
      data: {
        recipeId,
        step: order,
        text: inst.text.trim(),
        isSection: inst.isSection,
        instrType: inst.isSection ? null : (inst.instrType ?? "numbered"),
      },
    });
  }
}

export async function createRecipe(data: RecipeFormInput): Promise<string> {
  const recipe = await prisma.recipe.create({
    data: {
      name: data.name,
      category: data.categories.length > 0 ? data.categories.join(", ") : null,
      servings: data.servings,
      time: data.time,
      difficulty: data.difficulty,
      favorite: data.favorite,
      link: data.link,
      imageUrl: data.imageUrl ?? null,
    },
  });
  await buildIngredientsAndInstructions(recipe.id, data);
  revalidatePath("/recipes");
  return recipe.id;
}

export async function updateRecipe(
  id: string,
  data: RecipeFormInput
): Promise<void> {
  await prisma.recipe.update({
    where: { id },
    data: {
      name: data.name,
      category: data.categories.length > 0 ? data.categories.join(", ") : null,
      servings: data.servings,
      time: data.time,
      difficulty: data.difficulty,
      favorite: data.favorite,
      link: data.link,
      imageUrl: data.imageUrl ?? null,
    },
  });
  await prisma.ingredient.deleteMany({ where: { recipeId: id } });
  await prisma.instruction.deleteMany({ where: { recipeId: id } });
  await buildIngredientsAndInstructions(id, data);
  revalidatePath("/recipes");
  revalidatePath(`/recipes/${id}`);
}

export async function deleteRecipe(id: string): Promise<void> {
  await prisma.recipe.delete({ where: { id } });
  revalidatePath("/recipes");
}

export async function deleteRecipes(ids: string[]): Promise<void> {
  await prisma.recipe.deleteMany({ where: { id: { in: ids } } });
  revalidatePath("/recipes");
}

export async function toggleFavorite(id: string, favorite: boolean): Promise<void> {
  await prisma.recipe.update({ where: { id }, data: { favorite } });
  revalidatePath(`/recipes/${id}`);
  revalidatePath("/recipes");
}

// ─── Recipes ─────────────────────────────────────────────────────────────────

export async function getRecipes(search?: string, category?: string, favorites?: boolean, sort?: string) {
  const orderBy =
    sort === "date_asc"  ? { createdAt: "asc"  as const } :
    sort === "date_desc" ? { createdAt: "desc" as const } :
                           { name: "asc" as const };

  return prisma.recipe.findMany({
    where: {
      AND: [
        search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { ingredients: { some: { groceryItem: { name:   { contains: search, mode: "insensitive" } } } } },
                { ingredients: { some: { groceryItem: { nameRo: { contains: search, mode: "insensitive" } } } } },
              ],
            }
          : {},
        category ? { category: { contains: category, mode: "insensitive" } } : {},
        favorites ? { favorite: true } : {},
      ],
    },
    orderBy,
    select: {
      id: true,
      name: true,
      category: true,
      time: true,
      servings: true,
      difficulty: true,
      favorite: true,
      imageUrl: true,
    },
  });
}

export async function getRecipe(id: string) {
  return prisma.recipe.findUnique({
    where: { id },
    include: {
      ingredients: {
        include: { groceryItem: true },
        orderBy: [{ groupOrder: "asc" }, { order: "asc" }],
      },
      instructions: {
        orderBy: [{ step: "asc" }],
      },
    },
  });
}

export async function searchRecipesForPlanner(query: string) {
  return prisma.recipe.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { ingredients: { some: { groceryItem: { name:   { contains: query, mode: "insensitive" } } } } },
        { ingredients: { some: { groceryItem: { nameRo: { contains: query, mode: "insensitive" } } } } },
      ],
    },
    take: 10,
    orderBy: { name: "asc" },
    select: { id: true, name: true, category: true, servings: true, imageUrl: true },
  });
}

export async function getRecipesPanel(search?: string, category?: string, favorites?: boolean) {
  return prisma.recipe.findMany({
    where: {
      AND: [
        search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { ingredients: { some: { groceryItem: { name:   { contains: search, mode: "insensitive" } } } } },
                { ingredients: { some: { groceryItem: { nameRo: { contains: search, mode: "insensitive" } } } } },
              ],
            }
          : {},
        category ? { category: { contains: category, mode: "insensitive" } } : {},
        favorites ? { favorite: true } : {},
      ],
    },
    take: 80,
    orderBy: { name: "asc" },
    select: { id: true, name: true, category: true, servings: true, imageUrl: true, favorite: true },
  });
}

export async function getRecipeCategories(): Promise<string[]> {
  const recipes = await prisma.recipe.findMany({
    where: { category: { not: null } },
    select: { category: true },
  });
  const cats = new Set<string>();
  for (const r of recipes) {
    if (r.category) {
      for (const cat of r.category.split(",")) {
        const t = cat.trim();
        if (t) cats.add(t);
      }
    }
  }
  return Array.from(cats).sort();
}

// ─── Week Plan ────────────────────────────────────────────────────────────────

export async function getWeekPlan(weekStartIso: string) {
  const weekStart = new Date(weekStartIso);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  return prisma.weekPlan.findMany({
    where: {
      weekStart: { gte: weekStart, lt: weekEnd },
    },
    include: {
      recipe: {
        select: { id: true, name: true, category: true, servings: true, imageUrl: true },
      },
    },
  });
}

export async function getWeekNutrition(
  weekStartIso: string
): Promise<Record<number, { kcal: number; carbs: number; fat: number; protein: number }>> {
  const weekStart = new Date(weekStartIso);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const plans = await prisma.weekPlan.findMany({
    where: { weekStart: { gte: weekStart, lt: weekEnd } },
    include: {
      recipe: {
        select: {
          servings: true,
          ingredients: { include: { groceryItem: true } },
        },
      },
    },
  });

  const totals: Record<number, { kcal: number; carbs: number; fat: number; protein: number }> = {};

  for (const plan of plans) {
    const recipeServings = plan.recipe.servings || 1;
    const scale = plan.servings / recipeServings;

    for (const ing of plan.recipe.ingredients) {
      if (!ing.groceryItem || !ing.quantity) continue;
      const gi = ing.groceryItem;
      if (!gi.kcal && !gi.protein) continue;
      const isMassUnit = gi.unit === "g" || gi.unit === "ml";
      const gramFactor = isMassUnit ? 1 : gi.unitWeight;
      if (!gramFactor) continue;
      const factor = (ing.quantity * scale * gramFactor) / 100;
      if (!totals[plan.dayOfWeek]) totals[plan.dayOfWeek] = { kcal: 0, carbs: 0, fat: 0, protein: 0 };
      totals[plan.dayOfWeek].kcal    += (gi.kcal    ?? 0) * factor;
      totals[plan.dayOfWeek].carbs   += (gi.carbs   ?? 0) * factor;
      totals[plan.dayOfWeek].fat     += (gi.fat     ?? 0) * factor;
      totals[plan.dayOfWeek].protein += (gi.protein ?? 0) * factor;
    }
  }

  return totals;
}

export async function addToWeekPlan(data: {
  recipeId: string;
  weekStartIso: string;
  dayOfWeek: number;
  mealType: string;
  servings: number;
}): Promise<{ id: string }> {
  const weekStart = new Date(data.weekStartIso);
  const entry = await prisma.weekPlan.create({
    data: {
      recipeId: data.recipeId,
      weekStart,
      dayOfWeek: data.dayOfWeek,
      mealType: data.mealType,
      servings: data.servings,
    },
    select: { id: true },
  });
  revalidatePath("/grocery-list");
  return entry;
}

export async function removeFromWeekPlan(id: string) {
  await prisma.weekPlan.delete({ where: { id } });
  revalidatePath("/planner");
  revalidatePath("/grocery-list");
}

export async function updateWeekPlanServings(id: string, servings: number): Promise<void> {
  await prisma.weekPlan.update({ where: { id }, data: { servings } });
  revalidatePath("/planner");
  revalidatePath("/grocery-list");
}

// ─── Grocery List ─────────────────────────────────────────────────────────────

type GroceryEntry = {
  id: string;
  name: string;
  quantity: number;
  unit: string | null;
  category: string;
};

export async function getGroceryList(
  weekStartIso: string
): Promise<Record<string, GroceryEntry[]>> {
  const weekStart = new Date(weekStartIso);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const plans = await prisma.weekPlan.findMany({
    where: { weekStart: { gte: weekStart, lt: weekEnd } },
    include: {
      recipe: {
        include: {
          ingredients: {
            include: { groceryItem: true },
          },
        },
      },
    },
  });

  const map = new Map<
    string,
    { name: string; quantity: number; unit: string | null; category: string }
  >();

  for (const plan of plans) {
    const recipeServings = plan.recipe.servings || 1;
    const scale = plan.servings / recipeServings;

    for (const ing of plan.recipe.ingredients) {
      if (!ing.groceryItem) continue;
      const key = ing.groceryItem.id;
      const qty = (ing.quantity || 0) * scale;

      if (map.has(key)) {
        map.get(key)!.quantity += qty;
      } else {
        map.set(key, {
          name: ing.groceryItem.name,
          quantity: qty,
          unit: ing.unit ?? ing.groceryItem.unit,
          category: ing.groceryItem.category ?? "Other",
        });
      }
    }
  }

  const grouped: Record<string, GroceryEntry[]> = {};
  for (const [id, data] of map) {
    const cat = data.category;
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push({
      id,
      name: data.name,
      quantity: Math.round(data.quantity * 10) / 10,
      unit: data.unit,
      category: cat,
    });
  }

  // Sort items within each category
  for (const cat of Object.keys(grouped)) {
    grouped[cat].sort((a, b) => a.name.localeCompare(b.name));
  }

  return grouped;
}

// ─── Ingredients Page ─────────────────────────────────────────────────────────

export async function createGroceryItem(data: {
  name: string;
  nameRo?: string | null;
  category?: string | null;
  unit?: string | null;
  unit2?: string | null;
  conversion?: number | null;
  kcal?: number | null;
  carbs?: number | null;
  fat?: number | null;
  protein?: number | null;
}): Promise<{ id: string; name: string; nameRo: string | null; category: string | null; unit: string | null; unit2: string | null; conversion: number | null; kcal: number | null; carbs: number | null; fat: number | null; protein: number | null }> {
  const item = await prisma.groceryItem.create({ data });
  revalidatePath("/ingredients");
  return { id: item.id, name: item.name, nameRo: item.nameRo, category: item.category, unit: item.unit, unit2: item.unit2, conversion: item.conversion, kcal: item.kcal, carbs: item.carbs, fat: item.fat, protein: item.protein };
}

export async function updateGroceryItem(
  id: string,
  data: {
    name?: string;
    nameRo?: string | null;
    category?: string | null;
    unit?: string | null;
    unit2?: string | null;
    conversion?: number | null;
    kcal?: number | null;
    carbs?: number | null;
    fat?: number | null;
    protein?: number | null;
    unitWeight?: number | null;
  }
): Promise<void> {
  await prisma.groceryItem.update({ where: { id }, data });
}

export async function deleteGroceryItem(id: string): Promise<void> {
  await prisma.groceryItem.delete({ where: { id } });
  revalidatePath("/ingredients");
  revalidatePath("/recipes");
}

export async function getGroceryItems() {
  return prisma.groceryItem.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      nameRo: true,
      category: true,
      unit: true,
      unit2: true,
      conversion: true,
      kcal: true,
      carbs: true,
      fat: true,
      protein: true,
      unitWeight: true,
      createdAt: true,
    },
  });
}

export async function getRecipeWeekPlanServings(
  recipeId: string,
  weekStartIso: string
): Promise<number> {
  const weekStart = new Date(weekStartIso);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const plans = await prisma.weekPlan.findMany({
    where: { recipeId, weekStart: { gte: weekStart, lt: weekEnd } },
    select: { servings: true },
  });
  return plans.reduce((sum, p) => sum + p.servings, 0);
}
