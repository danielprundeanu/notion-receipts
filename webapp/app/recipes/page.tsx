import Link from "next/link";
import { getRecipes } from "@/lib/actions";
import { Plus, Download } from "lucide-react";
import RecipesFilterBar from "@/components/RecipesFilterBar";
import RecipesGrid from "@/components/RecipesGrid";

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string; fav?: string; sort?: string }>;
}) {
  const { q, cat, fav, sort } = await searchParams;
  const favOnly = fav === "1";
  const recipes = await getRecipes(q, cat, favOnly, sort ?? "date_desc");

  return (
    <div className="px-4 pt-4 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-[#eae5de]">Recipes</h1>
          <p className="text-sm text-gray-600 dark:text-[#a49c90] mt-0.5">{recipes.length} recipes</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/recipes/import"
            className="p-2 text-gray-500 dark:text-[#7c756a] hover:text-orange-500 dark:hover:text-orange-400 transition-colors"
            title="Import recipes"
          >
            <Download size={18} />
          </Link>
          <Link
            href="/recipes/new"
            aria-label="New recipe"
            title="New recipe"
            className="flex items-center justify-center w-10 h-10 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
          >
            <Plus size={20} />
          </Link>
        </div>
      </div>

      {/* Search + filter chips (sticky on mobile) */}
      <RecipesFilterBar q={q} cat={cat} fav={fav} sort={sort} />

      {/* Scroll anchor — on filter change we scroll here; scroll-margin clears the
          sticky filter bar so the first card lands right beneath it. */}
      <div id="recipes-top" aria-hidden className="scroll-mt-14 md:scroll-mt-4" />

      {/* Content */}
      {recipes.length === 0 ? (
        <div className="text-center py-20 text-gray-500 dark:text-[#7c756a]">
          <p className="text-lg font-semibold">No recipes found</p>
          <p className="text-sm mt-1">
            {q || cat || favOnly ? "Try a different search" : "Add your first recipe"}
          </p>
        </div>
      ) : (
        <RecipesGrid recipes={recipes} />
      )}
    </div>
  );
}
