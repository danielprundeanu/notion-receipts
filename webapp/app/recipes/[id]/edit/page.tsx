import { notFound } from "next/navigation";
import { getRecipe } from "@/lib/actions";
import { sectionsFromInstructions } from "@/lib/steps";
import RecipeForm, { type InitialRecipeData } from "@/components/RecipeForm";

export default async function EditRecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const recipe = await getRecipe(id);
  if (!recipe) notFound();

  // Convert flat ingredients list to named groups
  type GroupData = { name: string; ingredients: Array<{ id: string; quantity: string; unit: string; groceryItemName: string; groceryItemId: string | null; availableUnits: string[] | null; notes: string }> };
  const groupMap = new Map<number, GroupData>();
  for (const ing of recipe.ingredients) {
    const order = ing.groupOrder ?? 1;
    // An unnamed group stays unnamed — filling in "Group 2" here would save it to the DB.
    if (!groupMap.has(order)) groupMap.set(order, { name: ing.groupName ?? "", ingredients: [] });
    groupMap.get(order)!.ingredients.push({
      id: ing.id,
      quantity: ing.quantity?.toString() ?? "",
      unit: ing.unit ?? "g",
      groceryItemName: ing.groceryItem?.name ?? "",
      groceryItemId: ing.groceryItemId ?? null,
      availableUnits: (() => { const u = [ing.groceryItem?.unit, ing.groceryItem?.unit2].filter(Boolean) as string[]; return u.length ? u : null; })(),
      notes: ing.notes ?? "",
    });
  }
  const groups = [...groupMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, g], idx) => ({ id: `g-${idx}`, ...g }));

  // Imported recipes name their ingredient groups through "For the …" section headers at the
  // top of the steps, and the recipe page falls back to them for unnamed groups (same rule as
  // RecipeDetail). Give the groups those names and take the headers out of the steps, so the
  // editor shows what the recipe page shows and saving stores the names where they belong.
  let instructions = recipe.instructions;
  const forHeaders = instructions.filter((i) => i.isSection && i.text.trim().toLowerCase().startsWith("for"));
  const unnamed = groups.filter((g) => !g.name);
  if (unnamed.length > 0 && forHeaders.length >= unnamed.length) {
    unnamed.forEach((g, i) => { g.name = forHeaders[i].text; });
    const used = new Set(forHeaders.slice(0, unnamed.length));
    instructions = instructions.filter((i) => !used.has(i));
  }

  if (groups.length === 0) {
    groups.push({ id: "g-0", name: "", ingredients: [] });
  }

  const initial: InitialRecipeData = {
    id: recipe.id,
    name: recipe.name,
    categories: recipe.category?.split(", ").filter(Boolean) ?? [],
    servings: recipe.servings?.toString() ?? "",
    servingsStep: recipe.servingsStep?.toString() ?? "",
    time: recipe.time?.toString() ?? "",
    difficulty: recipe.difficulty ?? "",
    favorite: recipe.favorite,
    link: recipe.link ?? "",
    imageUrl: recipe.imageUrl ?? "",
    groups,
    references: recipe.refGroups.map((r) => ({
      id: r.id,
      refRecipeId: r.refRecipeId,
      name: r.name,
      quantity: String(r.quantity),
      unit: r.unit === "g" ? "g" : "serving",
    })),
    sections: sectionsFromInstructions(instructions),
  };

  return <RecipeForm initial={initial} />;
}
