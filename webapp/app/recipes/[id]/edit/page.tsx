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
  type GroupData = { name: string; ingredients: Array<{ id: string; quantity: string; unit: string; groceryItemName: string; groceryItemId: string | null; availableUnits: string[] | null }> };
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
      groceryItemId: ing.groceryItemId ?? null,
      availableUnits: (() => { const u = [ing.groceryItem?.unit, ing.groceryItem?.unit2].filter(Boolean) as string[]; return u.length ? u : null; })(),
    });
  }
  const groups = [...groupMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, g], idx) => ({ id: `g-${idx}`, ...g }));

  if (groups.length === 0) {
    groups.push({ id: "g-0", name: "Ingredients", ingredients: [] });
  }

  // Serialize instructions to textarea text
  let numCounter = 0;
  const instructionsText = recipe.instructions
    .map((inst) => {
      if (inst.isSection) { numCounter = 0; return `## ${inst.text}`; }
      const type = inst.instrType ?? "numbered";
      if (type === "bullet") return `- ${inst.text}`;
      if (type === "plain") return inst.text;
      numCounter++;
      return `${numCounter}. ${inst.text}`;
    })
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
    imageUrl: recipe.imageUrl ?? "",
    groups,
    instructionsText,
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <Link
          href={`/recipes/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-[#9a9a9a] hover:text-gray-900 dark:hover:text-[#e3e3e3] transition-colors"
        >
          <ArrowLeft size={15} /> Back to recipe
        </Link>
      </div>
      <RecipeForm initial={initial} noWrapper />
    </div>
  );
}
