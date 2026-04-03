import Link from "next/link";
import { getRecipes } from "@/lib/actions";
import { Star, Search, Plus, Download } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import SortSelect from "@/components/SortSelect";
import RecipesGrid from "@/components/RecipesGrid";

const CATEGORIES = [
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
  const recipes = await getRecipes(q, cat, favOnly, sort ?? "date_desc");

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-[#e3e3e3]">Recipes</h1>
          <p className="text-sm text-gray-600 dark:text-[#9a9a9a] mt-0.5">{recipes.length} recipes</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="md:hidden">
            <ThemeToggle compact />
          </div>
          <Link
            href="/recipes/import"
            className="p-2 text-gray-500 dark:text-[#787878] hover:text-orange-500 dark:hover:text-orange-400 transition-colors"
            title="Import rețete"
          >
            <Download size={18} />
          </Link>
          <Link
            href="/recipes/new"
            className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-semibold hover:bg-orange-600 transition-colors"
          >
            <Plus size={15} /> New recipe
          </Link>
        </div>
      </div>

      {/* Search */}
      <form className="relative mb-3">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-[#787878]" />
        <input
          name="q"
          defaultValue={q}
          placeholder="Search recipes…"
          className="w-full md:max-w-sm pl-9 pr-4 py-2 text-sm bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#3a3a3a] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900 dark:text-[#e3e3e3] placeholder:text-gray-400 dark:placeholder:text-[#555555]"
        />
        {cat && <input type="hidden" name="cat" value={cat} />}
      </form>

      {/* Filters row + Sort dropdown */}
      <div className="flex items-center gap-2 mb-6">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none flex-1 min-w-0">
          <Link
            href={q ? `?q=${q}` : "/recipes"}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              !cat && !favOnly ? "bg-orange-500 text-white" : "bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#3a3a3a] text-gray-700 dark:text-[#b8b8b8]"
            }`}
          >All</Link>
          <Link
            href={`?${q ? `q=${q}&` : ""}fav=1`}
            className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              favOnly ? "bg-amber-400 text-white" : "bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#3a3a3a] text-gray-700 dark:text-[#b8b8b8]"
            }`}
          >
            <Star size={11} className={favOnly ? "fill-white" : "fill-amber-400 text-amber-400"} />
            Favorites
          </Link>
          {CATEGORIES.map((c) => (
            <Link
              key={c}
              href={`?${q ? `q=${q}&` : ""}cat=${encodeURIComponent(c)}`}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                cat === c ? "bg-orange-500 text-white" : "bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#3a3a3a] text-gray-700 dark:text-[#b8b8b8]"
              }`}
            >{c}</Link>
          ))}
        </div>
        <SortSelect current={sort || "date_desc"} q={q} cat={cat} fav={fav} />
      </div>

      {/* Content */}
      {recipes.length === 0 ? (
        <div className="text-center py-20 text-gray-500 dark:text-[#787878]">
          <p className="text-lg font-semibold">No recipes found</p>
          <p className="text-sm mt-1">
            {q || cat ? "Try a different search" : "Add your first recipe"}
          </p>
        </div>
      ) : (
        <RecipesGrid recipes={recipes} />
      )}
    </div>
  );
}
