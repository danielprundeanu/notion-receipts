import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getRecipe } from "@/lib/actions";
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
  type GroupData = { name: string; ingredients: Array<{ id: string; quantity: string; unit: string; groceryItemName: string; notes: string; groceryItemId: string | null; availableUnits: string[] | null }> };
  const groupMap = new Map<number, GroupData>();
  for (const ing of recipe.ingredients) {
    const order = ing.groupOrder ?? 1;
    if (!groupMap.has(order)) {
      groupMap.set(order, {
        name: ing.groupName ?? (order === 1 ? "Ingredients" : `Group ${order}`),
        ingredients: [],
      });
    }
    groupMap.get(order)!.ingredients.push({
      id: ing.id,
      quantity: ing.quantity?.toString() ?? "",
      unit: ing.unit ?? "g",
      groceryItemName: ing.groceryItem?.name ?? "",
      notes: ing.notes ?? "",
      groceryItemId: ing.groceryItemId ?? null,
      availableUnits: null,
    });
  }
  const groups = [...groupMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, g], idx) => ({ id: `g-${idx}`, ...g }));

  if (groups.length === 0) {
    groups.push({ id: "g-0", name: "Ingredients", ingredients: [] });
  }

  // Serialize instructions to textarea text
  const instructionsText = recipe.instructions
    .map((inst) => (inst.isSection ? `# ${inst.text}` : inst.text))
    .join("\n");

  const initial: InitialRecipeData = {
    id: recipe.id,
    name: recipe.name,
    categories: recipe.category?.split(", ").filter(Boolean) ?? [],
    servings: recipe.servings?.toString() ?? "",
    time: recipe.time?.toString() ?? "",
    difficulty: recipe.difficulty ?? "",
    favorite: recipe.favorite,
    link: recipe.link ?? "",
    notes: recipe.notes ?? "",
    imageUrl: recipe.imageUrl ?? "",
    groups,
    instructionsText,
  };

  return (
    <div>
      <div className="border-b border-gray-100 dark:border-[#2e2e2e] bg-white dark:bg-[#1f1f1f] px-4 md:px-8 py-3 flex items-center gap-3">
        <Link href={`/recipes/${id}`} className="text-gray-500 dark:text-[#787878] hover:text-gray-700 dark:hover:text-[#9a9a9a] transition-colors">
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-base font-semibold text-gray-900 dark:text-[#e3e3e3]">Edit recipe</h1>
        <span className="text-sm text-gray-500 dark:text-[#787878]">— {recipe.name}</span>
      </div>
      <RecipeForm initial={initial} />
    </div>
  );
}
