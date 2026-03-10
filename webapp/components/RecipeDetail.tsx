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

export type RecipeData = {
  id: string;
  name: string;
  servings: number | null;
  time: number | null;
  difficulty: string | null;
  category: string | null;
  favorite: boolean;
  link: string | null;
  notes: string | null;
  imageUrl: string | null;
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
      kcal: number | null;
      carbs: number | null;
      fat: number | null;
      protein: number | null;
    } | null;
  }>;
  instructions: Array<{
    id: string;
    step: number;
    text: string;
    isSection: boolean;
  }>;
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
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

// ─── Add to Planner Modal ─────────────────────────────────────────────────────

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
  const [dayIdx, setDayIdx] = useState(todayDayIndex());
  const [mealServings, setMealServings] = useState<Record<MealType, number>>({
    Breakfast: 0,
    Lunch: 0,
    Dinner: 0,
    Snack: 0,
  });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const totalSelected = Object.values(mealServings).filter((s) => s > 0).length;

  function setMeal(meal: MealType, delta: number) {
    setMealServings((prev) => {
      const next = Math.max(0, prev[meal] + delta);
      // First time activating a meal → default to recipe servings
      const resolved = delta > 0 && prev[meal] === 0 ? defaultServings : next;
      return { ...prev, [meal]: resolved };
    });
  }

  async function handleAdd() {
    const entries = MEALS.filter((m) => mealServings[m] > 0);
    if (entries.length === 0) return;
    setSaving(true);
    for (const meal of entries) {
      await addToWeekPlan({
        recipeId: recipe.id,
        weekStartIso: weekStart.toISOString(),
        dayOfWeek: dayIdx,
        mealType: meal,
        servings: mealServings[meal],
      });
    }
    setDone(true);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-[#252525] rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-gray-900 dark:text-[#e3e3e3]">Add to Planner</h3>
          <button onClick={onClose} className="text-gray-400 dark:text-[#555555] hover:text-gray-600 dark:hover:text-[#9a9a9a] p-1">
            <X size={18} />
          </button>
        </div>

        {done ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-3">
              <CalendarPlus size={20} className="text-green-600 dark:text-green-400" />
            </div>
            <p className="font-medium text-gray-900 dark:text-[#e3e3e3] mb-1">Added!</p>
            <p className="text-sm text-gray-500 dark:text-[#787878]">
              {recipe.name} → {DAYS[dayIdx]}
            </p>
            <button onClick={onClose} className="mt-4 text-sm text-orange-600 dark:text-orange-400 hover:underline">
              Close
            </button>
          </div>
        ) : (
          <>
            {/* Day selector */}
            <div className="mb-5">
              <p className="text-xs font-semibold text-gray-500 dark:text-[#787878] uppercase tracking-wide mb-2">Day</p>
              <div className="grid grid-cols-7 gap-1">
                {DAYS.map((d, i) => {
                  const date = new Date(weekStart);
                  date.setDate(date.getDate() + i);
                  const isToday = date.toLocaleDateString() === today.toLocaleDateString();
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setDayIdx(i)}
                      className={`flex flex-col items-center py-1.5 rounded-lg text-xs transition-colors ${
                        dayIdx === i
                          ? "bg-orange-500 text-white"
                          : isToday
                          ? "border border-orange-200 dark:border-orange-800/50 text-orange-600 dark:text-orange-400"
                          : "hover:bg-gray-50 dark:hover:bg-[#2f2f2f] text-gray-600 dark:text-[#9a9a9a]"
                      }`}
                    >
                      <span className="text-[9px] uppercase tracking-wide">{d}</span>
                      <span className="font-bold text-sm">{date.getDate()}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Meal type + servings */}
            <div className="mb-5">
              <p className="text-xs font-semibold text-gray-500 dark:text-[#787878] uppercase tracking-wide mb-2">Meals & Servings</p>
              <div className="space-y-2">
                {MEALS.map((m) => {
                  const s = mealServings[m];
                  const active = s > 0;
                  return (
                    <div
                      key={m}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                        active
                          ? "border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/30"
                          : "border-gray-200 dark:border-[#3a3a3a] hover:border-gray-300 dark:hover:border-[#4a4a4a]"
                      }`}
                    >
                      <span className={`flex-1 text-sm font-medium ${active ? "text-orange-800 dark:text-orange-300" : "text-gray-600 dark:text-[#9a9a9a]"}`}>
                        {m}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setMeal(m, -1)}
                          className={`w-7 h-7 rounded-full border flex items-center justify-center transition-colors text-sm ${
                            active
                              ? "border-orange-300 dark:border-orange-700 text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/40"
                              : "border-gray-200 dark:border-[#3a3a3a] text-gray-400 dark:text-[#555555] hover:bg-gray-50 dark:hover:bg-[#2f2f2f]"
                          }`}
                        >
                          −
                        </button>
                        <span className={`w-5 text-center text-sm font-bold ${active ? "text-orange-900 dark:text-orange-200" : "text-gray-300 dark:text-[#444444]"}`}>
                          {s === 0 ? "—" : s}
                        </span>
                        <button
                          type="button"
                          onClick={() => setMeal(m, 1)}
                          className={`w-7 h-7 rounded-full border flex items-center justify-center transition-colors text-sm ${
                            active
                              ? "border-orange-300 dark:border-orange-700 text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/40"
                              : "border-gray-200 dark:border-[#3a3a3a] text-gray-400 dark:text-[#555555] hover:bg-gray-50 dark:hover:bg-[#2f2f2f]"
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

            <button
              onClick={handleAdd}
              disabled={saving || totalSelected === 0}
              className="w-full py-2.5 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-40 flex items-center justify-center gap-2 transition-colors"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CalendarPlus size={14} />}
              {totalSelected === 0
                ? "Select at least one meal"
                : `Add to Planner${totalSelected > 1 ? ` (${totalSelected} meals)` : ""}`}
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

  useEffect(() => {
    const weekStart = getMondayOf(new Date());
    getRecipeWeekPlanServings(recipe.id, weekStart.toISOString()).then(setPlannerServings);
  }, [recipe.id]);

  function handleToggleFavorite() {
    const next = !isFavorite;
    setIsFavorite(next);
    startTransition(() => toggleFavorite(recipe.id, next));
  }

  type GroupEntry = { name: string | null; items: typeof recipe.ingredients };
  const groupMap = new Map<number, GroupEntry>();
  for (const ing of recipe.ingredients) {
    const key = ing.groupOrder ?? 1;
    if (!groupMap.has(key)) groupMap.set(key, { name: ing.groupName, items: [] });
    groupMap.get(key)!.items.push(ing);
  }
  const sortedGroups = [...groupMap.entries()].sort((a, b) => a[0] - b[0]);

  let totalKcal = 0, totalCarbs = 0, totalFat = 0, totalProtein = 0;
  let hasNutrition = false;
  for (const ing of recipe.ingredients) {
    if (!ing.groceryItem || !ing.quantity) continue;
    const gi = ing.groceryItem;
    if (!gi.kcal && !gi.protein) continue;
    if (gi.unit !== "g" && gi.unit !== "ml") continue;
    hasNutrition = true;
    const factor = (ing.quantity * scale) / 100;
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
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-[#9a9a9a] hover:text-gray-900 dark:hover:text-[#e3e3e3] transition-colors"
        >
          <ArrowLeft size={15} /> Back to recipes
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPlanner(true)}
            title="Add to Planner"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-[#b8b8b8] border border-gray-200 dark:border-[#3a3a3a] rounded-lg px-3 py-1.5 hover:bg-orange-50 dark:hover:bg-orange-950/20 hover:border-orange-300 dark:hover:border-orange-800 hover:text-orange-700 dark:hover:text-orange-400 transition-colors"
          >
            <CalendarPlus size={13} /> Add to Planner
          </button>
          <Link
            href={`/recipes/${recipe.id}/edit`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-[#b8b8b8] border border-gray-200 dark:border-[#3a3a3a] rounded-lg px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-[#2f2f2f] transition-colors"
          >
            <Pencil size={13} /> Edit
          </Link>
        </div>
      </div>

      {/* Cover image */}
      {recipe.imageUrl && (
        <div className="w-full h-56 md:h-72 rounded-2xl overflow-hidden mb-6 bg-gray-100 dark:bg-[#2a2a2a]">
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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-[#e3e3e3]">{recipe.name}</h1>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleToggleFavorite}
              title={isFavorite ? "Remove from favorites" : "Add to favorites"}
              className="p-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors"
            >
              <Star
                size={20}
                className={isFavorite ? "text-amber-400 fill-amber-400" : "text-gray-300 dark:text-[#444444] hover:text-amber-300"}
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
              {recipe.category}
            </span>
          )}
          {recipe.difficulty && (
            <span className="px-3 py-1 bg-gray-100 dark:bg-[#2a2a2a] text-gray-700 dark:text-[#b8b8b8] rounded-full text-sm font-medium">
              {recipe.difficulty}
            </span>
          )}
          {recipe.time && (
            <span className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-[#9a9a9a] font-medium">
              <Clock size={14} className="text-gray-500 dark:text-[#787878]" /> {recipe.time} min
            </span>
          )}
        </div>

        {recipe.notes && (
          <p className="mt-4 text-gray-700 dark:text-[#b8b8b8] text-sm bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/50 rounded-lg px-4 py-3">
            {recipe.notes}
          </p>
        )}
      </div>

      {/* Servings control */}
      <div className="flex items-center gap-3 mb-6 pb-6 border-b border-gray-100 dark:border-[#2e2e2e] flex-wrap">
        <Users size={15} className="text-gray-500 dark:text-[#787878]" />
        <span className="text-sm font-medium text-gray-700 dark:text-[#b8b8b8]">Servings</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setServings((s) => Math.max(1, s - 1))}
            className="w-7 h-7 rounded-full border border-gray-300 dark:border-[#4a4a4a] flex items-center justify-center hover:bg-gray-50 dark:hover:bg-[#2f2f2f] text-gray-700 dark:text-[#b8b8b8] transition-colors"
          >
            <Minus size={12} />
          </button>
          <span className="w-8 text-center text-sm font-bold text-gray-900 dark:text-[#e3e3e3]">
            {servings}
          </span>
          <button
            onClick={() => setServings((s) => s + 1)}
            className="w-7 h-7 rounded-full border border-gray-300 dark:border-[#4a4a4a] flex items-center justify-center hover:bg-gray-50 dark:hover:bg-[#2f2f2f] text-gray-700 dark:text-[#b8b8b8] transition-colors"
          >
            <Plus size={12} />
          </button>
        </div>
        {servings !== defaultServings && (
          <button
            onClick={() => setServings(defaultServings)}
            className="text-xs text-gray-500 dark:text-[#787878] hover:text-gray-700 dark:hover:text-[#b8b8b8] underline"
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
            <CalendarPlus size={11} /> From Planner ({plannerServings})
          </button>
        )}
      </div>

      {/* Body */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
        {/* Ingredients */}
        <div className="lg:col-span-2">
          <h2 className="text-base font-semibold text-gray-900 dark:text-[#e3e3e3] mb-4">
            Ingredients
          </h2>

          {sortedGroups.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-[#787878]">No ingredients listed</p>
          ) : (
            <div className="space-y-5">
              {sortedGroups.map(([groupOrder, group]) => (
                <div key={groupOrder}>
                  {(sortedGroups.length > 1 || group.name) && (
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-[#787878] mb-2">
                      {group.name ?? `Part ${groupOrder}`}
                    </p>
                  )}
                  <ul className="space-y-2">
                    {group.items.map((ing) => (
                      <li key={ing.id} className="flex items-baseline gap-2 text-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0 mt-[5px]" />
                        <span>
                          {ing.quantity != null && (
                            <span className="font-semibold text-gray-900 dark:text-[#e3e3e3]">
                              {formatQty(ing.quantity, scale)}
                              {ing.unit ? ` ${ing.unit}` : ""}
                            </span>
                          )}{" "}
                          <span className="text-gray-800 dark:text-[#d4d4d4]">
                            {ing.groceryItem?.name ?? "—"}
                          </span>
                          {ing.notes && (
                            <span className="text-gray-500 dark:text-[#787878]"> · {ing.notes}</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {/* Nutrition */}
          {hasNutrition && (
            <div className="mt-6 p-4 bg-gray-50 dark:bg-[#2a2a2a] rounded-xl border border-gray-100 dark:border-[#2e2e2e]">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-[#b8b8b8] mb-3">
                <Flame size={14} className="text-orange-500" />
                Nutrition · {servings} serving{servings !== 1 ? "s" : ""}
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { label: "kcal", value: Math.round(totalKcal) },
                  { label: "carbs", value: `${Math.round(totalCarbs)}g` },
                  { label: "fat", value: `${Math.round(totalFat)}g` },
                  { label: "protein", value: `${Math.round(totalProtein)}g` },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div className="font-bold text-gray-900 dark:text-[#e3e3e3] text-sm">{value}</div>
                    <div className="text-xs text-gray-500 dark:text-[#787878] mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="lg:col-span-3">
          <h2 className="text-base font-semibold text-gray-900 dark:text-[#e3e3e3] mb-4">
            Instructions
          </h2>
          {recipe.instructions.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-[#787878]">No instructions yet</p>
          ) : (
            <div className="space-y-4">
              {recipe.instructions.map((inst, i) =>
                inst.isSection ? (
                  <h3 key={i} className="text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-[#9a9a9a] pt-1">
                    {inst.text}
                  </h3>
                ) : (
                  <div key={i} className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                      {inst.step}
                    </span>
                    <p className="text-sm text-gray-800 dark:text-[#d4d4d4] leading-relaxed">{inst.text}</p>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add to Planner modal */}
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
