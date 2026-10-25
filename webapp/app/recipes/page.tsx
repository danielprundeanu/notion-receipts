import Link from "next/link";
import { connection } from "next/server";
import { Plus } from "lucide-react";
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
        {/* Import lives under More. Dark icon on orange in dark mode, as in the prototype. */}
        <Link
          href="/recipes/new"
          aria-label="New recipe"
          title="New recipe"
          className="flex items-center justify-center w-11 h-11 rounded-[14px] bg-orange-700 text-white hover:bg-orange-800 dark:bg-orange-500 dark:text-[#1a1714] dark:hover:bg-orange-400 transition-colors"
        >
          <Plus size={22} />
        </Link>
      </div>

      <RecipesBrowser recipes={recipes} cooked={cooked} />
    </div>
  );
}
