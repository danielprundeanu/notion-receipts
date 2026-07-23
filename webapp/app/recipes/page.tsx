import Link from "next/link";
import { getRecipes, getRecipeCategories } from "@/lib/actions";
import { Plus, Download } from "lucide-react";
import RecipesFilterBar from "@/components/RecipesFilterBar";
import RecipesGrid from "@/components/RecipesGrid";

// Preferred display order for the well-known categories; anything else (custom
// categories added to recipes) is appended alphabetically after these.
const PREFERRED_ORDER = [
  "Breakfast", "Lunch", "Dinner", "Snack",
  "Smoothie", "Smoothie Bowl", "Soup", "High Protein",
];

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string; fav?: string; sort?: string }>;
}) {
  const { q, cat, fav, sort } = await searchParams;
  const favOnly = fav === "1";
  const [recipes, dbCategories] = await Promise.all([
    getRecipes(q, cat, favOnly, sort ?? "date_desc"),
    getRecipeCategories(),
  ]);

  // Chips reflect the categories that actually exist on recipes — so any new
  // category shows up automatically — ordered by PREFERRED_ORDER, extras last.
  // Keep the currently-selected category even if the filtered set hid it.
  const present = new Set(dbCategories);
  // `cat` may be a comma-separated multi-select — keep every selected tag visible
  // even if the filtered result set no longer contains it.
  if (cat) for (const c of cat.split(",").map((s) => s.trim()).filter(Boolean)) present.add(c);
  const categories = [
    ...PREFERRED_ORDER.filter((c) => present.has(c)),
    ...[...present].filter((c) => !PREFERRED_ORDER.includes(c)).sort(),
  ];

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
            aria-label="Import recipes"
            title="Import recipes"
            className="inline-flex items-center justify-center w-10 h-10 text-gray-700 dark:text-[#bab2a6] border border-gray-200 dark:border-[#3a352e] rounded-lg hover:bg-orange-50 dark:hover:bg-orange-950/20 hover:border-orange-300 dark:hover:border-orange-800 hover:text-orange-700 dark:hover:text-orange-400 transition-colors"
          >
            <Download size={17} />
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
      <RecipesFilterBar q={q} cat={cat} fav={fav} sort={sort} categories={categories} />

      {/* Scroll anchor — on filter change we scroll here; scroll-margin clears the
          sticky filter bar so the first card lands right beneath it. */}
      <div id="recipes-top" aria-hidden className="scroll-mt-14 md:scroll-mt-4" />

      {/* Content — height follows the actual results. The search bar is a fixed
          header while a query is active (decoupled from scroll), so no min-height
          reservation is needed to keep it stable. */}
      <div>
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
    </div>
  );
}
