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
    ingredients: recipe.ingredients.map((ing) => ({
      id: ing.id,
      quantity: ing.quantity?.toString() ?? "",
      unit: ing.unit ?? "g",
      groceryItemName: ing.groceryItem?.name ?? "",
      notes: ing.notes ?? "",
      groupOrder: ing.groupOrder ?? 1,
    })),
    instructions: recipe.instructions.map((inst) => ({
      id: inst.id,
      text: inst.text,
      isSection: inst.isSection,
    })),
  };

  return (
    <div>
      <div className="border-b border-gray-100 bg-white px-8 py-3 flex items-center gap-3">
        <Link href={`/recipes/${id}`} className="text-gray-500 hover:text-gray-700 transition-colors">
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-base font-semibold text-gray-900">Edit recipe</h1>
        <span className="text-sm text-gray-500">— {recipe.name}</span>
      </div>
      <RecipeForm initial={initial} />
    </div>
  );
}
