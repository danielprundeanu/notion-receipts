import Link from "next/link";
import { getRecipes } from "@/lib/actions";
import { Clock, Users, Star, Search, Plus } from "lucide-react";

const CATEGORIES = [
  "Breakfast", "Lunch", "Dinner", "Snack",
  "Smoothie", "Smoothie Bowl", "Soup", "High Protein",
];

const CATEGORY_COLORS: Record<string, string> = {
  Breakfast:        "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  Lunch:            "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  Dinner:           "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  Snack:            "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  Smoothie:         "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",
  "Smoothie Bowl":  "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",
  Soup:             "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  "High Protein":   "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string }>;
}) {
  const { q, cat } = await searchParams;
  const recipes = await getRecipes(q, cat);

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-[#e3e3e3]">Recipes</h1>
          <p className="text-sm text-gray-600 dark:text-[#9a9a9a] mt-0.5">{recipes.length} recipes</p>
        </div>
        <Link
          href="/recipes/new"
          className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-semibold hover:bg-orange-600 transition-colors"
        >
          <Plus size={15} /> New recipe
        </Link>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <form className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-[#787878]" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search recipes…"
            className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#3a3a3a] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900 dark:text-[#e3e3e3] placeholder:text-gray-400 dark:placeholder:text-[#555555]"
          />
          {cat && <input type="hidden" name="cat" value={cat} />}
        </form>

        <div className="flex gap-1.5 flex-wrap">
          <Link
            href={q ? `?q=${q}` : "/recipes"}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              !cat
                ? "bg-orange-500 text-white"
                : "bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#3a3a3a] text-gray-700 dark:text-[#b8b8b8] hover:bg-gray-50 dark:hover:bg-[#2f2f2f]"
            }`}
          >
            All
          </Link>
          {CATEGORIES.map((c) => (
            <Link
              key={c}
              href={`?${q ? `q=${q}&` : ""}cat=${encodeURIComponent(c)}`}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                cat === c
                  ? "bg-orange-500 text-white"
                  : "bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#3a3a3a] text-gray-700 dark:text-[#b8b8b8] hover:bg-gray-50 dark:hover:bg-[#2f2f2f]"
              }`}
            >
              {c}
            </Link>
          ))}
        </div>
      </div>

      {/* Grid */}
      {recipes.length === 0 ? (
        <div className="text-center py-20 text-gray-500 dark:text-[#787878]">
          <p className="text-lg font-semibold">No recipes found</p>
          <p className="text-sm mt-1">
            {q || cat ? "Try a different search" : "Add your first recipe"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {recipes.map((recipe) => {
            const primaryCat = recipe.category?.split(",")[0].trim();
            const colorClass =
              CATEGORY_COLORS[primaryCat ?? ""] ?? "bg-gray-100 text-gray-700 dark:bg-[#2a2a2a] dark:text-[#b8b8b8]";

            return (
              <Link
                key={recipe.id}
                href={`/recipes/${recipe.id}`}
                className="bg-white dark:bg-[#252525] rounded-xl border border-gray-100 dark:border-[#2e2e2e] hover:shadow-md hover:border-gray-200 dark:hover:border-[#3a3a3a] transition-all group overflow-hidden"
              >
                <div className="h-36 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-[#2a2a2a] dark:to-[#252525] flex items-center justify-center overflow-hidden">
                  {recipe.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={recipe.imageUrl}
                      alt={recipe.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-4xl opacity-20">🍽️</span>
                  )}
                </div>

                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-semibold text-gray-900 dark:text-[#e3e3e3] text-sm leading-snug line-clamp-2 group-hover:text-orange-700 dark:group-hover:text-orange-400 transition-colors">
                      {recipe.name}
                    </h3>
                    {recipe.favorite && (
                      <Star size={13} className="text-amber-400 fill-amber-400 shrink-0 mt-0.5" />
                    )}
                  </div>

                  {primaryCat && (
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold mb-3 ${colorClass}`}>
                      {primaryCat}
                    </span>
                  )}

                  <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-[#9a9a9a] font-medium">
                    {recipe.time && (
                      <span className="flex items-center gap-1">
                        <Clock size={11} className="text-gray-500 dark:text-[#787878]" /> {recipe.time} min
                      </span>
                    )}
                    {recipe.servings && (
                      <span className="flex items-center gap-1">
                        <Users size={11} className="text-gray-500 dark:text-[#787878]" /> {recipe.servings}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
