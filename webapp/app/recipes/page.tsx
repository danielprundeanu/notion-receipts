import Link from "next/link";
import { connection } from "next/server";
import { Plus, Download } from "lucide-react";
import { getRecipeIndex, getCookedThisSeason } from "@/lib/actions";
import RecipesBrowser from "@/components/RecipesBrowser";

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
        <div className="flex items-center gap-2">
          <Link
            href="/recipes/import"
            aria-label="Import recipes"
            title="Import recipes"
            className="inline-flex items-center justify-center w-11 h-11 text-gray-700 dark:text-[#bab2a6] border border-gray-200 dark:border-[#3a352e] rounded-[14px] hover:bg-orange-50 dark:hover:bg-orange-950/20 hover:border-orange-300 dark:hover:border-orange-800 hover:text-orange-700 dark:hover:text-orange-400 transition-colors"
          >
            <Download size={19} />
          </Link>
          <Link
            href="/recipes/new"
            aria-label="New recipe"
            title="New recipe"
            className="flex items-center justify-center w-11 h-11 bg-orange-500 text-white rounded-[14px] hover:bg-orange-600 transition-colors"
          >
            <Plus size={22} />
          </Link>
        </div>
      </div>

      <RecipesBrowser recipes={recipes} cooked={cooked} />
    </div>
  );
}
