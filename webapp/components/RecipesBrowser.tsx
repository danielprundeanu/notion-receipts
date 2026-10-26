"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpDown, Check, ChevronDown, CircleCheck, LayoutGrid, List } from "lucide-react";
import type { RecipeListItem } from "@/lib/actions";
import { normalizeSearch } from "@/lib/search";
import RecipesFilterBar from "./RecipesFilterBar";
import RecipesGrid, { RecipeThumb, recipeCategories, recipeMeta, type RecipesLayout } from "./RecipesGrid";
import RecipesSelectBar from "./RecipesSelectBar";
import { Sheet } from "./Sheet";

// Preferred display order for the well-known categories; anything else (custom
// categories added to recipes) is appended alphabetically after these.
const PREFERRED_ORDER = [
  "Breakfast", "Lunch", "Dinner", "Snack",
  "Smoothie", "Smoothie Bowl", "Soup", "High Protein",
];

const SORTS = [
  { value: "date_desc", label: "Newest first", hint: "Recently added on top" },
  { value: "date_asc", label: "Oldest first", hint: "The ones you added first" },
  { value: "name_asc", label: "A–Z", hint: "By name" },
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortOpen, setSortOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const resultsTopRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  function startSelect() {
    setSelected(new Set());
    setSelectMode(true);
  }
  function stopSelect() {
    setSelectMode(false);
    setSelected(new Set());
  }
  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
  // Some imported names carry stray spaces; A–Z ignores them and capitals.
  else if (filters.sort === "name_asc") shown.sort((a, b) => a.name.trim().localeCompare(b.name.trim(), "en", { sensitivity: "base" }));

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

  const sort = SORTS.find((s) => s.value === filters.sort) ?? SORTS[0];
  // Actions apply to what's selected and still on screen, so a filter change can't
  // quietly include recipes you no longer see.
  const selectedIds = shown.filter((r) => selected.has(r.id)).map((r) => r.id);
  const allShownSelected = shown.length > 0 && selectedIds.length === shown.length;
  const knownCategories = [...new Set(recipes.flatMap((r) => recipeCategories(r.category)))];

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

      {/* Scroll anchor for revealResults — the margin clears the sticky bar (search + chips). */}
      <div ref={resultsTopRef} aria-hidden className="scroll-mt-28 md:scroll-mt-4" />

      {!filtering && !selectMode && cookedRecipes.length > 0 && (
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
          {selectMode ? (
            <div className="min-h-[50px] flex items-center justify-between gap-2 mb-2">
              <h2 aria-live="polite" className="text-lg font-semibold text-gray-900 dark:text-[#eae5de]">
                {selectedIds.length ? `${selectedIds.length} selected` : "Select recipes"}
              </h2>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setSelected(allShownSelected ? new Set() : new Set(shown.map((r) => r.id)))}
                  className="h-11 px-3 rounded-xl text-[15px] font-semibold text-orange-700 dark:text-orange-400"
                >
                  {allShownSelected ? "Deselect all" : "Select all"}
                </button>
                <button
                  type="button"
                  onClick={stopSelect}
                  className="h-10 px-4 rounded-xl bg-orange-700 hover:bg-orange-800 text-white dark:bg-orange-500 dark:hover:bg-orange-400 dark:text-[#1a1714] text-[15px] font-bold transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold whitespace-nowrap text-gray-900 dark:text-[#eae5de]">
                  {filtering ? `${shown.length} ${shown.length === 1 ? "recipe" : "recipes"}` : `All recipes · ${recipes.length}`}
                </h2>
                <button
                  type="button"
                  onClick={() => setSortOpen(true)}
                  aria-haspopup="dialog"
                  aria-label={`Sort: ${sort.label}. Change order`}
                  className="-ml-2 -mt-0.5 h-10 px-2 inline-flex items-center gap-1.5 whitespace-nowrap rounded-[10px] text-sm font-medium text-gray-600 dark:text-[#a49c90] hover:bg-gray-100 dark:hover:bg-[#24211c] transition-colors"
                >
                  <ArrowUpDown size={16} aria-hidden />
                  {sort.label}
                  <ChevronDown size={14} aria-hidden />
                </button>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={startSelect}
                  className="h-11 px-3.5 inline-flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-sm font-semibold text-gray-900 dark:text-[#eae5de]"
                >
                  <CircleCheck size={16} aria-hidden /> Select
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
          )}
          <RecipesGrid recipes={shown} layout={layout} selectMode={selectMode} selected={selected} onToggle={toggleSelected} />
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

      {selectMode && (
        <>
          {/* The bar over the tab bar is taller than the tab bar; keep the last rows reachable. */}
          <div className="h-10 md:hidden" aria-hidden />
          <RecipesSelectBar
            ids={selectedIds}
            knownCategories={knownCategories}
            onDone={(message) => {
              stopSelect();
              setToast(message);
              router.refresh();
            }}
          />
        </>
      )}

      {sortOpen && (
        <Sheet title="Sort by" onClose={() => setSortOpen(false)}>
          <div className="mt-1.5">
            {SORTS.map((o) => {
              const on = o.value === filters.sort;
              return (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setFilters((f) => ({ ...f, sort: o.value }));
                    setSortOpen(false);
                  }}
                  className="w-full min-h-[60px] flex items-center gap-3 px-1 py-1.5 border-t first:border-t-0 border-gray-200 dark:border-[#3a352e] text-left"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-base font-semibold text-gray-900 dark:text-[#eae5de]">{o.label}</span>
                    <span className="block mt-0.5 text-[13px] text-gray-600 dark:text-[#a49c90]">{o.hint}</span>
                  </span>
                  {on && <Check size={20} strokeWidth={2.5} className="text-orange-700 dark:text-orange-400" aria-label="Current order" />}
                </button>
              );
            })}
          </div>
        </Sheet>
      )}

      {toast && (
        <div
          role="status"
          className="fixed z-50 left-4 right-4 md:left-auto md:right-8 md:w-96 bottom-[calc(4rem+1px+env(safe-area-inset-bottom)+0.75rem)] md:bottom-8 rounded-[14px] bg-gray-900 dark:bg-[#eae5de] text-white dark:text-[#1a1714] px-4 py-3 text-[15px] font-medium shadow-lg"
        >
          {toast}
        </div>
      )}
    </>
  );
}
