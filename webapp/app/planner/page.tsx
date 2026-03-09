"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  getWeekPlan,
  addToWeekPlan,
  removeFromWeekPlan,
  updateWeekPlanServings,
  searchRecipesForPlanner,
} from "@/lib/actions";
import { ChevronLeft, ChevronRight, Plus, X, Search, Loader2, Minus } from "lucide-react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MEALS = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;
type MealType = (typeof MEALS)[number];

type RecipeRef = {
  id: string;
  name: string;
  category: string | null;
  servings: number | null;
  imageUrl: string | null;
};

type PlanEntry = {
  id: string;
  dayOfWeek: number;
  mealType: string;
  servings: number;
  recipe: RecipeRef;
};

function getMondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatWeekRange(monday: Date): string {
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  return `${monday.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${sunday.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
}

function isThisWeek(monday: Date): boolean {
  return monday.toISOString().slice(0, 10) === getMondayOf(new Date()).toISOString().slice(0, 10);
}

function todayDayIndex(): number {
  const d = new Date().getDay();
  return d === 0 ? 6 : d - 1;
}

// ─── Recipe Image ─────────────────────────────────────────────────────────────

function RecipeThumb({ recipe }: { recipe: RecipeRef }) {
  if (recipe.imageUrl) {
    return <img src={recipe.imageUrl} alt="" className="w-8 h-8 rounded-md object-cover shrink-0" />;
  }
  const colors = ["bg-orange-200", "bg-blue-200", "bg-green-200", "bg-purple-200", "bg-pink-200", "bg-yellow-200"];
  const color = colors[recipe.name.charCodeAt(0) % colors.length];
  return (
    <div className={`w-8 h-8 rounded-md ${color} flex items-center justify-center shrink-0`}>
      <span className="text-xs font-bold text-gray-700">{recipe.name.charAt(0).toUpperCase()}</span>
    </div>
  );
}

// ─── Recipe Card ──────────────────────────────────────────────────────────────

function RecipeCard({
  entry,
  onRemove,
  onServingsChange,
}: {
  entry: PlanEntry;
  onRemove: () => void;
  onServingsChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 bg-orange-50 border border-orange-100 rounded-xl p-2 group relative">
      <button
        onClick={onRemove}
        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity text-orange-300 hover:text-orange-600 z-10"
      >
        <X size={11} />
      </button>
      <RecipeThumb recipe={entry.recipe} />
      <div className="flex-1 min-w-0">
        <Link
          href={`/recipes/${entry.recipe.id}`}
          className="text-xs font-medium text-orange-900 leading-snug line-clamp-2 hover:underline block"
        >
          {entry.recipe.name}
        </Link>
        <div className="flex items-center gap-1 mt-1">
          <button
            onClick={(e) => { e.stopPropagation(); onServingsChange(Math.max(1, entry.servings - 1)); }}
            className="w-4 h-4 rounded-full border border-orange-200 flex items-center justify-center hover:bg-orange-100 text-orange-600 transition-colors"
          >
            <Minus size={8} />
          </button>
          <span className="text-xs font-medium text-orange-700 w-4 text-center">{entry.servings}</span>
          <button
            onClick={(e) => { e.stopPropagation(); onServingsChange(entry.servings + 1); }}
            className="w-4 h-4 rounded-full border border-orange-200 flex items-center justify-center hover:bg-orange-100 text-orange-600 transition-colors"
          >
            <Plus size={8} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Recipe Selector Modal ───────────────────────────────────────────────────

function RecipeSelectorModal({
  day,
  mealType,
  weekStart,
  onClose,
  onSelect,
}: {
  day: number;
  mealType: MealType;
  weekStart: Date;
  onClose: () => void;
  onSelect: (entry: PlanEntry) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RecipeRef[]>([]);
  const [servings, setServings] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<RecipeRef | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!query.trim()) { setResults([]); return; }
      setLoading(true);
      const r = await searchRecipesForPlanner(query);
      setResults(r as RecipeRef[]);
      setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    await addToWeekPlan({ recipeId: selected.id, weekStartIso: weekStart.toISOString(), dayOfWeek: day, mealType, servings });
    onSelect({ id: Math.random().toString(), dayOfWeek: day, mealType, servings, recipe: selected });
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">{DAYS[day]} · {mealType}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={18} /></button>
        </div>

        <div className="relative mb-3">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
            placeholder="Search recipe…"
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>

        {loading && <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-gray-400" /></div>}

        {!loading && results.length > 0 && !selected && (
          <ul className="border border-gray-100 rounded-lg divide-y divide-gray-50 mb-4 max-h-52 overflow-auto">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-orange-50 transition-colors flex items-center gap-2.5"
                  onClick={() => { setSelected(r); setServings(r.servings ?? 1); }}
                >
                  <RecipeThumb recipe={r} />
                  <div>
                    <span className="font-medium text-gray-900">{r.name}</span>
                    {r.category && <span className="ml-2 text-gray-400 text-xs">{r.category.split(",")[0]}</span>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        {selected && (
          <div className="bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 mb-4 flex items-center gap-2.5">
            <RecipeThumb recipe={selected} />
            <span className="flex-1 text-sm font-medium text-orange-800">{selected.name}</span>
            <button onClick={() => setSelected(null)} className="text-orange-400 hover:text-orange-600"><X size={14} /></button>
          </div>
        )}

        <div className="flex items-center gap-3 mb-5">
          <label className="text-sm text-gray-600">Servings</label>
          <div className="flex items-center gap-2">
            <button onClick={() => setServings((s) => Math.max(1, s - 1))} className="w-8 h-8 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center justify-center">−</button>
            <span className="w-6 text-center text-sm font-medium">{servings}</span>
            <button onClick={() => setServings((s) => s + 1)} className="w-8 h-8 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center justify-center">+</button>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={!selected || saving}
          className="w-full py-2.5 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          Add to plan
        </button>
      </div>
    </div>
  );
}

// ─── Planner Page ─────────────────────────────────────────────────────────────

export default function PlannerPage() {
  const [weekStart, setWeekStart] = useState(() => getMondayOf(new Date()));
  const [plans, setPlans] = useState<PlanEntry[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [modal, setModal] = useState<{ day: number; meal: MealType } | null>(null);
  const [mobileDay, setMobileDay] = useState(todayDayIndex);

  const loadPlans = useCallback(async () => {
    setLoadingPlans(true);
    const data = await getWeekPlan(weekStart.toISOString());
    setPlans(data as PlanEntry[]);
    setLoadingPlans(false);
  }, [weekStart]);

  useEffect(() => { loadPlans(); }, [loadPlans]);

  function getEntries(day: number, meal: string): PlanEntry[] {
    return plans.filter((p) => p.dayOfWeek === day && p.mealType === meal);
  }

  async function handleRemove(id: string) {
    setPlans((prev) => prev.filter((p) => p.id !== id));
    await removeFromWeekPlan(id);
  }

  async function handleServingsChange(id: string, newServings: number) {
    setPlans((prev) => prev.map((p) => p.id === id ? { ...p, servings: newServings } : p));
    await updateWeekPlanServings(id, newServings);
  }

  const weekNav = (
    <div className="flex items-center gap-1">
      {!isThisWeek(weekStart) && (
        <button onClick={() => setWeekStart(getMondayOf(new Date()))} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
          Today
        </button>
      )}
      <button onClick={() => setWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; })} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500">
        <ChevronLeft size={18} />
      </button>
      <span className="text-sm font-medium text-gray-700 hidden sm:block w-44 text-center">{formatWeekRange(weekStart)}</span>
      <button onClick={() => setWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; })} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500">
        <ChevronRight size={18} />
      </button>
    </div>
  );

  return (
    <div className="p-4 md:p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl md:text-2xl font-semibold text-gray-900">Planner</h1>
        {weekNav}
      </div>

      {/* Week label on mobile */}
      <p className="sm:hidden text-xs text-gray-400 text-center mb-3">{formatWeekRange(weekStart)}</p>

      {loadingPlans ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 size={20} className="animate-spin text-gray-400" />
        </div>
      ) : (
        <>
          {/* ── Mobile view ─────────────────────────────────────── */}
          <div className="md:hidden flex flex-col gap-4">
            {/* Day selector */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
              {DAYS.map((day, i) => {
                const date = new Date(weekStart);
                date.setDate(date.getDate() + i);
                const isToday = date.toLocaleDateString() === new Date().toLocaleDateString();
                const hasEntries = MEALS.some((m) => getEntries(i, m).length > 0);
                return (
                  <button
                    key={i}
                    onClick={() => setMobileDay(i)}
                    className={`flex-shrink-0 flex flex-col items-center px-3 py-2 rounded-xl text-xs font-medium transition-colors min-w-[44px] relative ${
                      mobileDay === i
                        ? "bg-orange-500 text-white"
                        : isToday
                        ? "bg-orange-50 text-orange-600 border border-orange-200"
                        : "bg-white border border-gray-200 text-gray-600"
                    }`}
                  >
                    <span className="uppercase tracking-wide text-[10px]">{day}</span>
                    <span className="font-bold text-sm">{date.getDate()}</span>
                    {hasEntries && mobileDay !== i && (
                      <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-orange-400" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Meals for selected day */}
            <div className="space-y-4">
              {MEALS.map((meal) => {
                const entries = getEntries(mobileDay, meal);
                return (
                  <div key={meal}>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">{meal}</h3>
                    <div className="space-y-2">
                      {entries.map((entry) => (
                        <RecipeCard
                          key={entry.id}
                          entry={entry}
                          onRemove={() => handleRemove(entry.id)}
                          onServingsChange={(n) => handleServingsChange(entry.id, n)}
                        />
                      ))}
                      <button
                        onClick={() => setModal({ day: mobileDay, meal })}
                        className="w-full py-2.5 bg-white border border-dashed border-gray-200 rounded-xl flex items-center justify-center hover:border-orange-300 hover:bg-orange-50 transition-colors group"
                      >
                        <Plus size={15} className="text-gray-300 group-hover:text-orange-400" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Desktop view ────────────────────────────────────── */}
          <div className="hidden md:block flex-1 overflow-auto">
            <div className="min-w-[700px]">
              {/* Day headers */}
              <div className="grid grid-cols-[80px_repeat(7,1fr)] gap-2 mb-2">
                <div />
                {DAYS.map((day, i) => {
                  const date = new Date(weekStart);
                  date.setDate(date.getDate() + i);
                  const isToday = date.toLocaleDateString() === new Date().toLocaleDateString();
                  return (
                    <div key={day} className="text-center">
                      <span className={`text-xs font-semibold uppercase tracking-wide ${isToday ? "text-orange-600" : "text-gray-400"}`}>{day}</span>
                      <div className={`text-sm font-medium mt-0.5 ${isToday ? "text-orange-600" : "text-gray-600"}`}>{date.getDate()}</div>
                    </div>
                  );
                })}
              </div>

              {/* Meal rows */}
              {MEALS.map((meal) => (
                <div key={meal} className="grid grid-cols-[80px_repeat(7,1fr)] gap-2 mb-2">
                  <div className="flex items-start pt-2">
                    <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{meal}</span>
                  </div>
                  {DAYS.map((_, dayIdx) => {
                    const entries = getEntries(dayIdx, meal);
                    return (
                      <div key={dayIdx} className="min-h-[72px] flex flex-col gap-1.5">
                        {entries.map((entry) => (
                          <RecipeCard
                            key={entry.id}
                            entry={entry}
                            onRemove={() => handleRemove(entry.id)}
                            onServingsChange={(n) => handleServingsChange(entry.id, n)}
                          />
                        ))}
                        <button
                          onClick={() => setModal({ day: dayIdx, meal })}
                          className="w-full bg-white border border-dashed border-gray-200 rounded-xl flex items-center justify-center hover:border-orange-300 hover:bg-orange-50 transition-colors group"
                          style={{ minHeight: entries.length === 0 ? "56px" : "28px" }}
                        >
                          <Plus size={entries.length === 0 ? 16 : 12} className="text-gray-300 group-hover:text-orange-400" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {modal && (
        <RecipeSelectorModal
          day={modal.day}
          mealType={modal.meal}
          weekStart={weekStart}
          onClose={() => setModal(null)}
          onSelect={(entry) => { setPlans((prev) => [...prev, entry]); setModal(null); }}
        />
      )}
    </div>
  );
}
