import { connection } from "next/server";
import { getRecipeIndex, getCookedThisSeason } from "@/lib/actions";
import RecipesBrowser from "@/components/RecipesBrowser";
import AddRecipesButton from "@/components/add-recipes/AddRecipesButton";

// One server render ships every recipe; search, chips and sort then run in the browser
// (RecipesBrowser keeps them in the URL), so none of them waits on a round-trip.
export default async function RecipesPage() {
  await connection(); // always fresh data, never a build-time snapshot
  const [recipes, cooked] = await Promise.all([getRecipeIndex(), getCookedThisSeason()]);

  return (
    <div className="px-4 pt-4 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl text-gray-900 dark:text-[#eae5de]">Recipes</h1>
        <AddRecipesButton />
      </div>

      <RecipesBrowser recipes={recipes} cooked={cooked} />
    </div>
  );
}
