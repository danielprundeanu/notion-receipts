"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowDownAZ, ArrowDownWideNarrow, ArrowUpNarrowWide, LayoutGrid, List, ListChecks } from "lucide-react";
import type { RecipeListItem } from "@/lib/actions";
import { normalizeSearch } from "@/lib/search";
import RecipesFilterBar from "./RecipesFilterBar";
import RecipesGrid, { RecipeThumb, recipeCategories, recipeMeta, type RecipesLayout } from "./RecipesGrid";

// Preferred display order for the well-known categories; anything else (custom
// categories added to recipes) is appended alphabetically after these.
const PREFERRED_ORDER = [
  "Breakfast", "Lunch", "Dinner", "Snack",
  "Smoothie", "Smoothie Bowl", "Soup", "High Protein",
];

const SORTS = [
  { value: "date_desc", Icon: ArrowDownWideNarrow, label: "Newest first" },
  { value: "date_asc", Icon: ArrowUpNarrowWide, label: "Oldest first" },
  { value: "name_asc", Icon: ArrowDownAZ, label: "A–Z" },
] as const;
type Sort = (typeof SORTS)[number]["value"];

type Filters = { q: string; cats: string[]; fav: boolean; sort: Sort };

function parseFilters(query: string): Filters {
  const p = new URLSearchParams(query);
  const sort = SORTS.find((s) => s.value === p.get("sort"))?.value ?? "date_desc";
  return { q: p.get("q") ?? "", cats: recipeCategories(p.get("cat")), fav: p.get("fav") === "1", sort };
}

function filtersQuery(f: Filters): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.cats.length) p.set("cat", f.cats.join(","));
  if (f.fav) p.set("fav", "1");
  if (f.sort !== "date_desc") p.set("sort", f.sort);
  return p.toString();
}

// The filters last used here, kept across in-app navigation so coming back through the
// Recipes tab (a bare /recipes) shows the list the way it was left. Only effects write it,
// so it stays empty on the server and a full reload starts clean.
let lastQuery = "";

// List/grid choice — an external store (localStorage), so it's right on mount without a
// hydration mismatch.
const LAYOUT_KEY = "recipesLayout";
function subscribeLayout(cb: () => void) {
  window.addEventListener("recipeslayout", cb);
  return () => window.removeEventListener("recipeslayout", cb);
}
function getLayout(): RecipesLayout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === "grid" ? "grid" : "list";
  } catch {
    return "list";
  }
}
function setLayout(layout: RecipesLayout) {
  try {
    localStorage.setItem(LAYOUT_KEY, layout);
  } catch {
    // Storage blocked (private mode): the choice just won't outlive this page.
  }
  window.dispatchEvent(new Event("recipeslayout"));
}

export default function RecipesBrowser({
  recipes, cooked,
}: { recipes: RecipeListItem[]; cooked: { season: string; recipeIds: string[] } }) {
  const searchParams = useSearchParams();
  const urlQuery = searchParams.toString();
  const [filters, setFilters] = useState<Filters>(() => parseFilters(urlQuery || lastQuery));
  const layout = useSyncExternalStore(subscribeLayout, getLayout, () => "list" as RecipesLayout);
  const [selectMode, setSelectMode] = useState(false);
  const resultsTopRef = useRef<HTMLDivElement>(null);

  // Mirror the filters into the URL (reload, back from a recipe, a shared link) without a
  // navigation. Debounced because Safari throws past ~100 history calls in 10 s.
  const query = filtersQuery(filters);
  useEffect(() => {
    lastQuery = query;
    if (query === urlQuery) return;
    const t = setTimeout(() => {
      try {
        window.history.replaceState(null, "", query ? `/recipes?${query}` : "/recipes");
      } catch {
        // The list is already filtered; only the address bar lags behind.
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, urlQuery]);

  // After a chip change, if the first results sit under the sticky bar, bring them to just
  // below it (the anchor's scroll-margin is the bar's height). Runs after the click's
  // render has committed.
  function revealResults() {
    requestAnimationFrame(() => {
      const top = resultsTopRef.current;
      if (!top) return;
      if (top.getBoundingClientRect().top < parseFloat(getComputedStyle(top).scrollMarginTop)) {
        top.scrollIntoView({ block: "start" });
      }
    });
  }

  const terms = normalizeSearch(filters.q).split(/\s+/).filter(Boolean);
  const wanted = filters.cats.map((c) => c.toLowerCase());
  const shown = recipes.filter(
    (r) =>
      (!filters.fav || r.favorite) &&
      (wanted.length === 0 || recipeCategories(r.category).some((c) => wanted.includes(c.toLowerCase()))) &&
      terms.every((t) => r.search.includes(t))
  );
  // `recipes` arrives newest first.
  if (filters.sort === "date_asc") shown.reverse();
  else if (filters.sort === "name_asc") shown.sort((a, b) => a.name.localeCompare(b.name));

  // Chips follow the categories recipes actually use (plus any selected via the URL),
  // ordered by PREFERRED_ORDER, extras alphabetically after.
  const present = new Set([...recipes.flatMap((r) => recipeCategories(r.category)), ...filters.cats]);
  const categories = [
    ...PREFERRED_ORDER.filter((c) => present.has(c)),
    ...[...present].filter((c) => !PREFERRED_ORDER.includes(c)).sort(),
  ];

  const filtering = terms.length > 0 || filters.cats.length > 0 || filters.fav;
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const cookedRecipes = cooked.recipeIds.flatMap((id) => byId.get(id) ?? []);

  const sortIdx = SORTS.findIndex((s) => s.value === filters.sort);
  const sort = SORTS[sortIdx];
  const nextSort = SORTS[(sortIdx + 1) % SORTS.length];

  const iconBtn = "w-10 h-10 flex items-center justify-center rounded-xl transition-colors";
  const segBtn = "w-11 h-[38px] flex items-center justify-center rounded-[9px] transition-colors";

  return (
    <>
      <RecipesFilterBar
        q={filters.q}
        onQChange={(q) => setFilters((f) => ({ ...f, q }))}
        cats={filters.cats}
        fav={filters.fav}
        categories={categories}
        onToggleCat={(c) => {
          setFilters((f) => ({ ...f, cats: f.cats.includes(c) ? f.cats.filter((x) => x !== c) : [...f.cats, c] }));
          revealResults();
        }}
        onToggleFav={() => {
          setFilters((f) => ({ ...f, fav: !f.fav }));
          revealResults();
        }}
        onClearChips={() => {
          setFilters((f) => ({ ...f, cats: [], fav: false }));
          revealResults();
        }}
      />

      {/* Scroll anchor for revealResults — the margin clears the minimized sticky bar
          (just the chips), or the full one while a search is typed. */}
      <div
        ref={resultsTopRef}
        aria-hidden
        className={`${filters.q.trim() ? "scroll-mt-28" : "scroll-mt-14"} md:scroll-mt-4`}
      />

      {!filtering && cookedRecipes.length > 0 && (
        <section aria-labelledby="cooked-heading" className="pt-1.5 pb-5">
          <div className="flex items-baseline justify-between gap-3 mb-2.5">
            <h2 id="cooked-heading" className="text-lg font-semibold text-gray-900 dark:text-[#eae5de]">
              Cooked this {cooked.season}
            </h2>
            <span className="text-[13px] text-gray-600 dark:text-[#a49c90]">from your plan history</span>
          </div>
          <ul className="-mx-4 px-4 md:mx-0 md:px-0 flex gap-3 overflow-x-auto scrollbar-none">
            {cookedRecipes.map((r) => {
              const meta = recipeMeta(r);
              return (
                <li key={r.id} className="shrink-0 w-[150px]">
                  <Link href={`/recipes/${r.id}`} className="flex flex-col gap-2 group">
                    <RecipeThumb recipe={r} sizes="150px" className="w-[150px] h-[112px] rounded-2xl" initialClass="text-4xl" />
                    <div>
                      <p className="text-sm font-semibold leading-snug line-clamp-2 text-gray-900 dark:text-[#eae5de] group-hover:text-orange-700 dark:group-hover:text-orange-400 transition-colors">
                        {r.name}
                      </p>
                      {meta && <p className="mt-0.5 text-xs text-gray-600 dark:text-[#a49c90]">{meta}</p>}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {shown.length > 0 ? (
        <>
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-[#eae5de]">
              {filtering ? `${shown.length} ${shown.length === 1 ? "recipe" : "recipes"}` : `All recipes · ${recipes.length}`}
            </h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setFilters((f) => ({ ...f, sort: nextSort.value }))}
                aria-label={`Sort: ${sort.label}. Switch to ${nextSort.label}`}
                title={sort.label}
                className={`${iconBtn} text-gray-600 dark:text-[#a49c90] hover:bg-gray-100 dark:hover:bg-[#24211c]`}
              >
                <sort.Icon size={18} />
              </button>
              <button
                type="button"
                onClick={() => setSelectMode((v) => !v)}
                aria-pressed={selectMode}
                aria-label="Select recipes"
                title="Select"
                className={`${iconBtn} ${
                  selectMode
                    ? "text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/15"
                    : "text-gray-600 dark:text-[#a49c90] hover:bg-gray-100 dark:hover:bg-[#24211c]"
                }`}
              >
                <ListChecks size={18} />
              </button>
              <div
                role="group"
                aria-label="Layout"
                className="flex gap-0.5 p-[3px] rounded-xl bg-white dark:bg-[#24211c] border border-gray-200 dark:border-[#3a352e]"
              >
                {([["list", List, "List view"], ["grid", LayoutGrid, "Grid view"]] as const).map(([value, Icon, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setLayout(value)}
                    aria-pressed={layout === value}
                    aria-label={label}
                    className={`${segBtn} ${
                      layout === value
                        ? "bg-gray-100 dark:bg-[#2e2a24] text-gray-900 dark:text-[#eae5de]"
                        : "text-gray-500 dark:text-[#a49c90]"
                    }`}
                  >
                    <Icon size={18} />
                  </button>
                ))}
              </div>
            </div>
          </div>
          <RecipesGrid recipes={shown} layout={layout} selectMode={selectMode} onExitSelect={() => setSelectMode(false)} />
        </>
      ) : (
        <div className="py-12 px-8 text-center">
          <p className="text-[17px] font-semibold text-gray-900 dark:text-[#eae5de]">
            {recipes.length === 0 ? "No recipes yet" : "No recipes match"}
          </p>
          <p className="mt-1.5 text-sm text-gray-600 dark:text-[#a49c90]">
            {recipes.length === 0 ? "Add your first recipe with the + button." : "Try another word or clear the filters."}
          </p>
          {filtering && (
            <button
              type="button"
              onClick={() => setFilters((f) => ({ ...f, q: "", cats: [], fav: false }))}
              className="mt-4 h-11 px-5 rounded-xl border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-[15px] font-medium text-gray-900 dark:text-[#eae5de]"
            >
              Clear filters
            </button>
          )}
        </div>
      )}
      <div className="h-3" aria-hidden />
    </>
  );
}
