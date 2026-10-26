"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Plus, Search, X } from "lucide-react";
import { mealLabel } from "@/lib/labels";
import { normalizeSearch } from "@/lib/search";
import { RecipeThumb, recipeMeta } from "@/components/RecipesGrid";
import { MEALS, type MealType, type PlannerRecipe } from "./shared";

// Bottom sheet for one day: pick a meal, then tap + on as many recipes as you like
// (Cooked recently / Favorites, or search). A tick means it's in the plan; tapping
// the tick takes it out again.
export default function AddMealSheet({
  title, defaultMeal, recipes, recentIds, onAdd, onRemove, onClose,
}: {
  title: string;
  defaultMeal: MealType;
  recipes: PlannerRecipe[];
  recentIds: string[];
  /** Adds the recipe to this day and meal; resolves with the new entry's id. */
  onAdd: (recipe: PlannerRecipe, meal: MealType) => Promise<string>;
  onRemove: (entryId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [meal, setMeal] = useState<MealType>(defaultMeal);
  const [q, setQ] = useState("");
  // "meal:recipeId" → the entry it created ("pending" while saving), so the same recipe can
  // go into two meals of the day.
  const [added, setAdded] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function setEntry(key: string, entryId: string | null) {
    setAdded((prev) => {
      const next = new Map(prev);
      if (entryId) next.set(key, entryId);
      else next.delete(key);
      return next;
    });
  }

  async function toggle(r: PlannerRecipe) {
    const key = `${meal}:${r.id}`;
    const entryId = added.get(key);
    if (entryId === "pending") return;
    setError(null);
    if (entryId) {
      setEntry(key, "pending");
      try {
        await onRemove(entryId);
        setEntry(key, null);
      } catch {
        setEntry(key, entryId);
        setError(`Couldn't take ${r.name} out. Try again.`);
      }
      return;
    }
    setEntry(key, "pending");
    try {
      setEntry(key, await onAdd(r, meal));
    } catch {
      setEntry(key, null);
      setError(`Couldn't add ${r.name}. Try again.`);
    }
  }

  const terms = normalizeSearch(q).split(/\s+/).filter(Boolean);
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const sections: { title: string; items: PlannerRecipe[] }[] = terms.length
    ? [{ title: "Results", items: recipes.filter((r) => terms.every((t) => r.search.includes(t))) }]
    : [
        // Recent first: it's short, and Favorites can run to dozens.
        { title: "Cooked recently", items: recentIds.flatMap((id) => byId.get(id) ?? []) },
        { title: "Favorites", items: recipes.filter((r) => r.favorite).sort((a, b) => a.name.localeCompare(b.name)) },
      ];
  const visible = sections.filter((s) => s.items.length > 0);

  const pill = "h-11 rounded-xl border text-sm font-semibold transition-colors";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 dark:bg-black/60 flex flex-col justify-end md:items-center md:justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-meal-title"
        className="mt-[70px] md:mt-0 flex-1 md:flex-none min-h-0 md:h-[80vh] w-full md:max-w-lg flex flex-col bg-[var(--color-bg-base)] rounded-t-3xl md:rounded-3xl shadow-xl"
      >
        <div className="px-4 pt-2.5 shrink-0">
          <div className="w-10 h-[5px] rounded-full bg-gray-200 dark:bg-[#3a352e] mx-auto mb-3 md:hidden" aria-hidden />
          <div className="flex items-center justify-between gap-3">
            <h2 id="add-meal-title" className="text-xl font-bold text-gray-900 dark:text-[#eae5de]">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-3.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[15px] font-bold transition-colors"
            >
              Done
            </button>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-1.5">
            {MEALS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMeal(m)}
                aria-pressed={meal === m}
                className={`${pill} ${
                  meal === m
                    ? "border-orange-500 bg-orange-500 text-gray-900"
                    : "border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-gray-600 dark:text-[#a49c90]"
                }`}
              >
                {mealLabel(m)}
              </button>
            ))}
          </div>
          <div className="relative mt-3">
            <Search size={18} aria-hidden className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 dark:text-[#a49c90] pointer-events-none" />
            <input
              type="search"
              aria-label="Search recipes"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search all recipes"
              className="w-full h-12 pl-11 pr-11 rounded-[14px] bg-white dark:bg-[#24211c] border border-gray-200 dark:border-[#3a352e] text-gray-900 dark:text-[#eae5de] placeholder:text-gray-500 dark:placeholder:text-[#8f877b] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-orange-500 [&::-webkit-search-cancel-button]:hidden"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                aria-label="Clear search"
                className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-gray-500 dark:text-[#a49c90]"
              >
                <X size={18} />
              </button>
            )}
          </div>
          {error && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pt-1" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
          {visible.length === 0 && (
            <p className="my-6 text-center text-sm text-gray-600 dark:text-[#a49c90]">
              {terms.length ? "No recipe matches that." : "No favorites or recent recipes yet — search above."}
            </p>
          )}
          {visible.map((sec) => (
            <section key={sec.title}>
              <h3 className="mt-3.5 mb-0.5 text-[13px] font-semibold tracking-[.04em] uppercase text-gray-500 dark:text-[#a49c90]">
                {sec.title}
              </h3>
              <ul>
                {sec.items.map((r) => {
                  const entryId = added.get(`${meal}:${r.id}`);
                  const pending = entryId === "pending";
                  const isAdded = !!entryId && !pending;
                  const meta = r.nutrition ? `${Math.round(r.nutrition.kcal)} kcal per serving` : recipeMeta(r) || "Recipe";
                  return (
                    <li key={`${sec.title}-${r.id}`} className="flex items-center gap-3 py-2">
                      <RecipeThumb recipe={r} sizes="48px" className="w-12 h-12 rounded-xl shrink-0" initialClass="text-xl" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-semibold text-gray-900 dark:text-[#eae5de] truncate">{r.name}</p>
                        <p className="mt-0.5 text-[13px] text-gray-600 dark:text-[#a49c90] truncate">{meta}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggle(r)}
                        disabled={pending}
                        aria-label={isAdded ? `Remove ${r.name} from ${mealLabel(meal)}` : `Add ${r.name} to ${mealLabel(meal)}`}
                        aria-pressed={isAdded}
                        className={`w-11 h-11 shrink-0 rounded-xl border flex items-center justify-center transition-colors ${
                          isAdded
                            ? "bg-orange-500 border-orange-500 text-gray-900"
                            : "bg-white dark:bg-[#24211c] border-gray-200 dark:border-[#3a352e] text-orange-600 dark:text-orange-400"
                        }`}
                      >
                        {pending ? <Loader2 size={18} className="animate-spin" /> : isAdded ? <Check size={20} /> : <Plus size={20} />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
