"use client";

import Link from "next/link";
import { useState, useTransition, useEffect } from "react";
import {
  ArrowLeft,
  Clock,
  ExternalLink,
  Star,
  Flame,
  Pencil,
  Minus,
  Plus,
  Users,
  CalendarPlus,
  X,
  Loader2,
} from "lucide-react";
import { toggleFavorite, addToWeekPlan, getRecipeWeekPlanServings } from "@/lib/actions";
import ShareButton from "@/components/ShareButton";
import { mealLabel, categoryLabel, difficultyLabel } from "@/lib/labels";
import { ingredientGrams } from "@/lib/nutrition";

export type RecipeData = {
  id: string;
  name: string;
  servings: number | null;
  time: number | null;
  difficulty: string | null;
  category: string | null;
  favorite: boolean;
  link: string | null;
  imageUrl: string | null;
  createdAt: Date;
  ingredients: Array<{
    id: string;
    quantity: number | null;
    unit: string | null;
    notes: string | null;
    groupOrder: number;
    groupName: string | null;
    groceryItem: {
      name: string;
      unit: string | null;
      unit2: string | null;
      conversion: number | null;
      kcal: number | null;
      carbs: number | null;
      fat: number | null;
      protein: number | null;
      unitWeight: number | null;
    } | null;
  }>;
  instructions: Array<{
    id: string;
    step: number;
    text: string;
    isSection: boolean;
    instrType?: string | null;
  }>;
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Stored/compared as WeekPlan.mealType — keep the English values; show mealLabel() for display.
const MEALS = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;
type MealType = (typeof MEALS)[number];

function getMondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function todayDayIndex(): number {
  const d = new Date().getDay();
  return d === 0 ? 6 : d - 1;
}

function formatQty(qty: number, scale: number): string {
  const scaled = qty * scale;
  const s = (Math.round(scaled * 10) / 10).toString();
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

// ─── Adaugă în planner Modal ─────────────────────────────────────────────────────

function AddToPlannerModal({
  recipe,
  onClose,
}: {
  recipe: { id: string; name: string; servings: number | null };
  onClose: () => void;
}) {
  const today = new Date();
  const weekStart = getMondayOf(today);
  const defaultServings = recipe.servings ?? 1;
  const todayIdx = todayDayIndex();

  const emptyMeals = (): Record<MealType, number> => ({
    Breakfast: 0, Lunch: 0, Dinner: 0, Snack: 0,
  });

  const [activeDayIdx, setActiveDayIdx] = useState(todayIdx);
  const [dayMealServings, setDayMealServings] = useState<Record<number, Record<MealType, number>>>(
    { [todayIdx]: emptyMeals() }
  );
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const selectedDays = Object.keys(dayMealServings).map(Number).sort((a, b) => a - b);
  const activeMeals = dayMealServings[activeDayIdx] ?? emptyMeals();
  const totalEntries = selectedDays.reduce(
    (sum, d) => sum + MEALS.filter((m) => (dayMealServings[d]?.[m] ?? 0) > 0).length,
    0
  );

  function handleDayClick(i: number) {
    if (dayMealServings[i] !== undefined) {
      // Zi deja selectată: activează panoul ei
      setActiveDayIdx(i);
    } else {
      // Zi nouă: adaugă și activează
      setDayMealServings((prev) => ({ ...prev, [i]: emptyMeals() }));
      setActiveDayIdx(i);
    }
  }

  function removeDay(i: number) {
    if (selectedDays.length <= 1) return;
    setDayMealServings((prev) => {
      const next = { ...prev };
      delete next[i];
      return next;
    });
    if (activeDayIdx === i) {
      const remaining = selectedDays.filter((d) => d !== i);
      setActiveDayIdx(remaining[0]);
    }
  }

  function setMeal(meal: MealType, delta: number) {
    setDayMealServings((prev) => {
      const cur = prev[activeDayIdx] ?? emptyMeals();
      const next = Math.max(0, cur[meal] + delta);
      const resolved = delta > 0 && cur[meal] === 0 ? defaultServings : next;
      return { ...prev, [activeDayIdx]: { ...cur, [meal]: resolved } };
    });
  }

  async function handleAdd() {
    if (totalEntries === 0) return;
    setSaving(true);
    setAddError(null);
    try {
      for (const dayIdx of selectedDays) {
        const meals = dayMealServings[dayIdx];
        for (const meal of MEALS) {
          if ((meals?.[meal] ?? 0) > 0) {
            await addToWeekPlan({
              recipeId: recipe.id,
              weekStartIso: weekStart.toISOString(),
              dayOfWeek: dayIdx,
              mealType: meal,
              servings: meals[meal],
            });
          }
        }
      }
      setDone(true);
    } catch {
      setAddError("Couldn't add to the planner. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-[#24211c] rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-gray-900 dark:text-[#eae5de]">Add to planner</h3>
          <button onClick={onClose} className="text-gray-400 dark:text-[#5c554b] hover:text-gray-600 dark:hover:text-[#a49c90] p-3">
            <X size={18} />
          </button>
        </div>

        {done ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-3">
              <CalendarPlus size={20} className="text-green-600 dark:text-green-400" />
            </div>
            <p className="font-medium text-gray-900 dark:text-[#eae5de] mb-1">Added!</p>
            <p className="text-sm text-gray-500 dark:text-[#7c756a]">
              {totalEntries} slot{totalEntries !== 1 ? "s" : ""} added across{" "}
              {selectedDays.length} {selectedDays.length !== 1 ? "days" : "day"}
            </p>
            <button onClick={onClose} className="mt-4 text-sm text-orange-600 dark:text-orange-400 hover:underline">
              Close
            </button>
          </div>
        ) : (
          <>
            {/* Day selector */}
            <div className="mb-5">
              <p className="text-xs font-semibold text-gray-500 dark:text-[#7c756a] uppercase tracking-wide mb-2">Days</p>
              <div className="grid grid-cols-7 gap-1">
                {DAYS.map((d, i) => {
                  const date = new Date(weekStart);
                  date.setDate(date.getDate() + i);
                  const isToday = date.toLocaleDateString() === today.toLocaleDateString();
                  const isSelected = dayMealServings[i] !== undefined;
                  const isActive = activeDayIdx === i;
                  const hasMeals = isSelected && MEALS.some((m) => (dayMealServings[i]?.[m] ?? 0) > 0);
                  return (
                    <div key={i} className="relative flex flex-col items-center">
                      <button
                        type="button"
                        onClick={() => handleDayClick(i)}
                        className={`w-full flex flex-col items-center py-1.5 rounded-lg text-xs transition-colors ${
                          isActive
                            ? "bg-orange-500 text-white"
                            : isSelected
                            ? "border-2 border-orange-400 dark:border-orange-500 text-orange-600 dark:text-orange-400"
                            : isToday
                            ? "border border-orange-200 dark:border-orange-800/50 text-orange-600 dark:text-orange-400"
                            : "hover:bg-gray-50 dark:hover:bg-[#2c2822] text-gray-600 dark:text-[#a49c90]"
                        }`}
                      >
                        <span className="text-[9px] uppercase tracking-wide">{d}</span>
                        <span className="font-bold text-sm">{date.getDate()}</span>
                      </button>
                      {/* Dot indicator: has meals configured */}
                      {hasMeals && (
                        <span className={`absolute bottom-0.5 w-1 h-1 rounded-full ${isActive ? "bg-white/70" : "bg-orange-400 dark:bg-orange-500"}`} />
                      )}
                      {/* Remove button for selected non-active days */}
                      {isSelected && !isActive && selectedDays.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); removeDay(i); }}
                          className="absolute -top-1 -right-1 w-3.5 h-3.5 before:content-[''] before:absolute before:-inset-2 rounded-full bg-gray-400 dark:bg-[#5c554b] text-white flex items-center justify-center text-[8px] leading-none hover:bg-red-400 transition-colors"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Meal type + servings — per active day */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500 dark:text-[#7c756a] uppercase tracking-wide">
                  Meals & servings
                </p>
                <span className="text-xs text-orange-500 dark:text-orange-400 font-medium">
                  {DAYS[activeDayIdx]}
                </span>
              </div>
              <div className="space-y-2">
                {MEALS.map((m) => {
                  const s = activeMeals[m];
                  const active = s > 0;
                  return (
                    <div
                      key={m}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                        active
                          ? "border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/30"
                          : "border-gray-200 dark:border-[#3a352e] hover:border-gray-300 dark:hover:border-[#46403a]"
                      }`}
                    >
                      <span className={`flex-1 text-sm font-medium ${active ? "text-orange-800 dark:text-orange-300" : "text-gray-600 dark:text-[#a49c90]"}`}>
                        {mealLabel(m)}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setMeal(m, -1)}
                          className={`w-10 h-10 rounded-full border flex items-center justify-center transition-colors text-sm ${
                            active
                              ? "border-orange-300 dark:border-orange-700 text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/40"
                              : "border-gray-200 dark:border-[#3a352e] text-gray-400 dark:text-[#5c554b] hover:bg-gray-50 dark:hover:bg-[#2c2822]"
                          }`}
                        >
                          −
                        </button>
                        <span className={`w-5 text-center text-sm font-bold ${active ? "text-orange-900 dark:text-orange-200" : "text-gray-300 dark:text-[#4a443c]"}`}>
                          {s === 0 ? "—" : s}
                        </span>
                        <button
                          type="button"
                          onClick={() => setMeal(m, 1)}
                          className={`w-10 h-10 rounded-full border flex items-center justify-center transition-colors text-sm ${
                            active
                              ? "border-orange-300 dark:border-orange-700 text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/40"
                              : "border-gray-200 dark:border-[#3a352e] text-gray-400 dark:text-[#5c554b] hover:bg-gray-50 dark:hover:bg-[#2c2822]"
                          }`}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {addError && (
              <p className="mb-2 text-sm text-red-600 dark:text-red-400 text-center">{addError}</p>
            )}
            <button
              onClick={handleAdd}
              disabled={saving || totalEntries === 0}
              className="w-full py-2.5 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-40 flex items-center justify-center gap-2 transition-colors"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CalendarPlus size={14} />}
              {totalEntries === 0
                ? "Select at least one meal"
                : `Add to planner${totalEntries > 1 ? ` (${totalEntries} slots)` : ""}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Recipe Detail ────────────────────────────────────────────────────────────

export default function RecipeDetail({ recipe }: { recipe: RecipeData }) {
  const defaultServings = recipe.servings ?? 1;
  const [servings, setServings] = useState(defaultServings);
  const scale = defaultServings > 0 ? servings / defaultServings : 1;
  const [isFavorite, setIsFavorite] = useState(recipe.favorite);
  const [, startTransition] = useTransition();
  const [showPlanner, setShowPlanner] = useState(false);
  const [plannerServings, setPlannerServings] = useState(0);
  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(new Set());

  function toggleIngredient(id: string) {
    setCheckedIngredients((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  useEffect(() => {
    const weekStart = getMondayOf(new Date());
    getRecipeWeekPlanServings(recipe.id, weekStart.toISOString()).then(setPlannerServings);
  }, [recipe.id]);

  function handleToggleFavorite() {
    const next = !isFavorite;
    setIsFavorite(next);
    startTransition(async () => {
      try {
        await toggleFavorite(recipe.id, next);
      } catch {
        setIsFavorite(!next); // rollback — the toggle didn't persist
      }
    });
  }

  type GroupEntry = { name: string | null; items: typeof recipe.ingredients };
  const groupMap = new Map<number, GroupEntry>();
  for (const ing of recipe.ingredients) {
    const key = ing.groupOrder ?? 1;
    if (!groupMap.has(key)) groupMap.set(key, { name: ing.groupName, items: [] });
    groupMap.get(key)!.items.push(ing);
  }
  const sortedGroups = [...groupMap.entries()].sort((a, b) => a[0] - b[0]);

  // If groups have no names (null), replace "Part N" fallback with meaningful section headers from instructions.
  // Only use headers that start with "For" (e.g. "For the Pancakes") — skip generic ones like "Steps", "Ingredients".
  const sectionHeaders = recipe.instructions
    .filter((i) => i.isSection && i.text.trim().toLowerCase().startsWith("for"))
    .map((i) => i.text);
  const unnamedGroups = sortedGroups.filter(([, g]) => g.name === null);
  if (unnamedGroups.length > 0 && sectionHeaders.length >= unnamedGroups.length) {
    unnamedGroups.forEach(([key], idx) => {
      groupMap.get(key)!.name = sectionHeaders[idx];
    });
  }

  let totalKcal = 0, totalCarbs = 0, totalFat = 0, totalProtein = 0;
  let hasNutrition = false;
  for (const ing of recipe.ingredients) {
    if (!ing.groceryItem || !ing.quantity) continue;
    const gi = ing.groceryItem;
    // Skip only items with no macro data at all — an item with just carbs/fat
    // (no kcal) still contributes and must not be dropped from the totals.
    if (!gi.kcal && !gi.carbs && !gi.fat && !gi.protein) continue;
    const grams = ingredientGrams(ing.quantity, ing.unit, gi);
    if (grams == null) continue;
    hasNutrition = true;
    const factor = (grams * scale) / 100;
    totalKcal += (gi.kcal ?? 0) * factor;
    totalCarbs += (gi.carbs ?? 0) * factor;
    totalFat += (gi.fat ?? 0) * factor;
    totalProtein += (gi.protein ?? 0) * factor;
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8">
      {/* Nav */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/recipes"
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-[#a49c90] hover:text-gray-900 dark:hover:text-[#eae5de] transition-colors"
        >
          <ArrowLeft size={15} /> Back to recipes
        </Link>
        <div className="flex items-center gap-2">
          <ShareButton name={recipe.name} />
          <button
            onClick={() => setShowPlanner(true)}
            title="Add to planner"
            aria-label="Add to planner"
            className="inline-flex items-center justify-center w-10 h-10 text-gray-700 dark:text-[#bab2a6] border border-gray-200 dark:border-[#3a352e] rounded-lg hover:bg-orange-50 dark:hover:bg-orange-950/20 hover:border-orange-300 dark:hover:border-orange-800 hover:text-orange-700 dark:hover:text-orange-400 transition-colors"
          >
            <CalendarPlus size={17} />
          </button>
          <Link
            href={`/recipes/${recipe.id}/edit`}
            title="Edit"
            aria-label="Edit"
            className="inline-flex items-center justify-center w-10 h-10 text-gray-700 dark:text-[#bab2a6] border border-gray-200 dark:border-[#3a352e] rounded-lg hover:bg-gray-50 dark:hover:bg-[#2c2822] transition-colors"
          >
            <Pencil size={16} />
          </Link>
        </div>
      </div>

      {/* Cover image */}
      {recipe.imageUrl && (
        <div className="w-full h-56 md:h-72 rounded-2xl overflow-hidden mb-6 bg-gray-100 dark:bg-[#2a2620]">
          <img
            src={recipe.imageUrl}
            alt={recipe.name}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-[#eae5de]">{recipe.name}</h1>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleToggleFavorite}
              title={isFavorite ? "Remove from favorites" : "Add to favorites"}
              className="p-3 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors"
            >
              <Star
                size={20}
                className={isFavorite ? "text-amber-400 fill-amber-400" : "text-gray-300 dark:text-[#4a443c] hover:text-amber-300"}
              />
            </button>
            {recipe.link && (
              <a
                href={recipe.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
              >
                <ExternalLink size={14} /> Source
              </a>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-4">
          {recipe.category && (
            <span className="px-3 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 rounded-full text-sm font-medium">
              {categoryLabel(recipe.category)}
            </span>
          )}
          {recipe.difficulty && (
            <span className="px-3 py-1 bg-gray-100 dark:bg-[#2a2620] text-gray-700 dark:text-[#bab2a6] rounded-full text-sm font-medium">
              {difficultyLabel(recipe.difficulty)}
            </span>
          )}
          {recipe.time && (
            <span className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-[#a49c90] font-medium">
              <Clock size={14} className="text-gray-500 dark:text-[#7c756a]" /> {recipe.time} min
            </span>
          )}
        </div>

      </div>

      {/* Servings control */}
      <div className="flex items-center gap-3 mb-6 pb-6 border-b border-gray-100 dark:border-[#2e2a24] flex-wrap">
        <Users size={15} className="text-gray-500 dark:text-[#7c756a]" />
        <span className="text-sm font-medium text-gray-700 dark:text-[#bab2a6]">Servings</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setServings((s) => Math.max(1, s - 1))}
            className="w-10 h-10 rounded-full border border-gray-300 dark:border-[#46403a] flex items-center justify-center hover:bg-gray-50 dark:hover:bg-[#2c2822] text-gray-700 dark:text-[#bab2a6] transition-colors"
          >
            <Minus size={12} />
          </button>
          <span className="w-8 text-center text-sm font-bold text-gray-900 dark:text-[#eae5de]">
            {servings}
          </span>
          <button
            onClick={() => setServings((s) => s + 1)}
            className="w-10 h-10 rounded-full border border-gray-300 dark:border-[#46403a] flex items-center justify-center hover:bg-gray-50 dark:hover:bg-[#2c2822] text-gray-700 dark:text-[#bab2a6] transition-colors"
          >
            <Plus size={12} />
          </button>
        </div>
        {servings !== defaultServings && (
          <button
            onClick={() => setServings(defaultServings)}
            className="text-xs text-gray-500 dark:text-[#7c756a] hover:text-gray-700 dark:hover:text-[#bab2a6] underline"
          >
            reset
          </button>
        )}
        {scale !== 1 && (
          <span className="text-xs text-orange-600 dark:text-orange-400 font-medium bg-orange-50 dark:bg-orange-950/40 px-2 py-0.5 rounded-full">
            ×{Math.round(scale * 100) / 100} scaled
          </span>
        )}
        {plannerServings > 0 && (
          <button
            onClick={() => setServings(plannerServings)}
            className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-800/50 bg-orange-50 dark:bg-orange-950/30 px-2.5 py-1 rounded-full hover:bg-orange-100 dark:hover:bg-orange-950/50 transition-colors"
          >
            <CalendarPlus size={11} /> From planner ({plannerServings})
          </button>
        )}
      </div>

      {/* Servings callout */}
      {defaultServings > 1 && (
        <div className="flex items-center gap-2.5 px-4 py-3 mb-6 rounded-xl bg-orange-50 dark:bg-orange-950/30 border border-orange-100 dark:border-orange-900/50 text-orange-800 dark:text-orange-300">
          <span className="text-base">🍽️</span>
          <span className="text-sm">
            1 batch = <strong>{defaultServings} servings</strong>
          </span>
        </div>
      )}

      {/* Body */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
        {/* Ingredients */}
        <div className="lg:col-span-2">
          {sortedGroups.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-[#7c756a]">No ingredients</p>
          ) : (
            <div className="space-y-5">
              {sortedGroups.map(([groupOrder, group]) => (
                <div key={groupOrder}>
                  {(sortedGroups.length > 1 || group.name) && (
                    <h2 className="text-base font-semibold text-gray-900 dark:text-[#eae5de] mb-2">
                      {group.name ?? `Part ${groupOrder}`}
                    </h2>
                  )}
                  <ul className="space-y-1">
                    {group.items.map((ing) => {
                      const checked = checkedIngredients.has(ing.id);
                      return (
                        <li
                          key={ing.id}
                          className="flex items-start gap-3 text-base leading-7 cursor-pointer select-none py-2.5 px-2 -mx-2 rounded-lg active:bg-orange-50 dark:active:bg-orange-950/20 transition-colors"
                          onClick={() => toggleIngredient(ing.id)}
                        >
                          <span className={`w-6 h-6 shrink-0 rounded-md border-2 flex items-center justify-center transition-colors ${checked ? "bg-orange-400 border-orange-400" : "border-gray-300 dark:border-[#5c554b]"}`}>
                            {checked && (
                              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 10 8">
                                <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </span>
                          <span className={checked ? "line-through text-gray-400 dark:text-[#ffffff]" : ""}>
                            {ing.quantity != null && (
                              <span className={`font-semibold ${checked ? "" : "text-gray-900 dark:text-[#eae5de]"}`}>
                                {formatQty(ing.quantity, scale)}
                                {ing.unit ? ` ${ing.unit}` : ""}
                              </span>
                            )}{" "}
                            <span className={checked ? "" : "text-gray-800 dark:text-[#d8d0c4]"}>
                              {ing.groceryItem?.name ?? "—"}
                            </span>
                            {ing.notes && (
                              <span className="text-gray-400 dark:text-[#5c554b]">, {ing.notes}</span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {/* Nutrition */}
          {hasNutrition && (
            <div className="mt-6 p-4 bg-gray-50 dark:bg-[#2a2620] rounded-xl border border-gray-100 dark:border-[#2e2a24]">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-[#bab2a6] mb-3">
                <Flame size={14} className="text-orange-500" />
                Nutrition · {servings} servings
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { label: "kcal", value: Math.round(totalKcal) },
                  { label: "carbs", value: `${Math.round(totalCarbs)}g` },
                  { label: "fat", value: `${Math.round(totalFat)}g` },
                  { label: "protein", value: `${Math.round(totalProtein)}g` },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div className="font-bold text-gray-900 dark:text-[#eae5de] text-sm">{value}</div>
                    <div className="text-xs text-gray-500 dark:text-[#7c756a] mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="mt-4 text-[11px] text-gray-400 dark:text-[#5c554b]">
            Added {new Date(recipe.createdAt).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>

        {/* Instructions */}
        <div className="lg:col-span-3">
          {recipe.instructions.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-[#7c756a]">No instructions yet</p>
          ) : (
            <div className="space-y-4">
              {(() => {
                let numCounter = 0;
                return recipe.instructions.map((inst, i) => {
                  if (inst.isSection) {
                    numCounter = 0;
                    // Skip section headers already used as ingredient group names
                    if (sectionHeaders.includes(inst.text)) return null;
                    return (
                      <h3 key={i} className="text-base font-semibold text-gray-900 dark:text-[#eae5de] pt-2">
                        {inst.text}
                      </h3>
                    );
                  }
                  const type = inst.instrType ?? "numbered";
                  if (type === "bullet") {
                    return (
                      <div key={i} className="flex gap-3 items-start">
                        <span className="flex-shrink-0 w-6 text-center text-gray-400 dark:text-[#5c554b] font-bold mt-0.5">•</span>
                        <p className="text-base text-gray-800 dark:text-[#d8d0c4] leading-relaxed">{inst.text}</p>
                      </div>
                    );
                  }
                  if (type === "plain") {
                    return (
                      <p key={i} className="text-sm text-gray-800 dark:text-[#d8d0c4] leading-relaxed">{inst.text}</p>
                    );
                  }
                  // numbered (default)
                  numCounter++;
                  return (
                    <div key={i} className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                        {numCounter}
                      </span>
                      <p className="text-base text-gray-800 dark:text-[#d8d0c4] leading-relaxed">{inst.text}</p>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Adaugă în planner modal */}
      {showPlanner && (
        <AddToPlannerModal
          recipe={recipe}
          onClose={() => {
            setShowPlanner(false);
            const weekStart = getMondayOf(new Date());
            getRecipeWeekPlanServings(recipe.id, weekStart.toISOString()).then(setPlannerServings);
          }}
        />
      )}
    </div>
  );
}
