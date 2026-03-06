"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getWeekPlan,
  addToWeekPlan,
  removeFromWeekPlan,
  searchRecipesForPlanner,
} from "@/lib/actions";
import { ChevronLeft, ChevronRight, Plus, X, Search, Loader2 } from "lucide-react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MEALS = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;
type MealType = (typeof MEALS)[number];

type PlanEntry = {
  id: string;
  dayOfWeek: number;
  mealType: string;
  servings: number;
  recipe: { id: string; name: string; category: string | null; servings: number | null };
};

function getMondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
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
  const thisMonday = getMondayOf(new Date());
  return monday.toISOString().slice(0, 10) === thisMonday.toISOString().slice(0, 10);
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
  const [results, setResults] = useState<Array<{ id: string; name: string; category: string | null; servings: number | null }>>([]);
  const [servings, setServings] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<{ id: string; name: string; category: string | null; servings: number | null } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!query.trim()) { setResults([]); return; }
      setLoading(true);
      const r = await searchRecipesForPlanner(query);
      setResults(r);
      setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    await addToWeekPlan({
      recipeId: selected.id,
      weekStartIso: weekStart.toISOString(),
      dayOfWeek: day,
      mealType,
      servings,
    });
    // optimistic: create fake entry
    onSelect({
      id: Math.random().toString(),
      dayOfWeek: day,
      mealType,
      servings,
      recipe: selected,
    });
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">
            Add to {DAYS[day]} · {mealType}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
            placeholder="Search recipe…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>

        {/* Results */}
        {loading && (
          <div className="flex justify-center py-4">
            <Loader2 size={16} className="animate-spin text-gray-400" />
          </div>
        )}

        {!loading && results.length > 0 && !selected && (
          <ul className="border border-gray-100 rounded-lg divide-y divide-gray-50 mb-4 max-h-48 overflow-auto">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  className="w-full text-left px-3 py-2 text-sm hover:bg-orange-50 transition-colors"
                  onClick={() => { setSelected(r); setServings(r.servings ?? 2); }}
                >
                  <span className="font-medium text-gray-900">{r.name}</span>
                  {r.category && (
                    <span className="ml-2 text-gray-400 text-xs">{r.category.split(",")[0]}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Selected */}
        {selected && (
          <div className="bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 mb-4 flex items-center justify-between">
            <span className="text-sm font-medium text-orange-800">{selected.name}</span>
            <button onClick={() => setSelected(null)} className="text-orange-400 hover:text-orange-600">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Servings */}
        <div className="flex items-center gap-3 mb-5">
          <label className="text-sm text-gray-600">Servings</label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setServings((s) => Math.max(1, s - 1))}
              className="w-7 h-7 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center justify-center text-sm"
            >
              −
            </button>
            <span className="w-6 text-center text-sm font-medium">{servings}</span>
            <button
              onClick={() => setServings((s) => s + 1)}
              className="w-7 h-7 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center justify-center text-sm"
            >
              +
            </button>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={!selected || saving}
          className="w-full py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
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

  const loadPlans = useCallback(async () => {
    setLoadingPlans(true);
    const data = await getWeekPlan(weekStart.toISOString());
    setPlans(data as PlanEntry[]);
    setLoadingPlans(false);
  }, [weekStart]);

  useEffect(() => { loadPlans(); }, [loadPlans]);

  function prevWeek() {
    setWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; });
  }

  function nextWeek() {
    setWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; });
  }

  function goToday() {
    setWeekStart(getMondayOf(new Date()));
  }

  function getEntry(day: number, meal: string): PlanEntry | undefined {
    return plans.find((p) => p.dayOfWeek === day && p.mealType === meal);
  }

  async function handleRemove(id: string) {
    setPlans((prev) => prev.filter((p) => p.id !== id));
    await removeFromWeekPlan(id);
  }

  return (
    <div className="p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-semibold text-gray-900">Weekly Planner</h1>
        <div className="flex items-center gap-2">
          {!isThisWeek(weekStart) && (
            <button
              onClick={goToday}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600"
            >
              Today
            </button>
          )}
          <button onClick={prevWeek} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500">
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-medium text-gray-700 w-44 text-center">
            {formatWeekRange(weekStart)}
          </span>
          <button onClick={nextWeek} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        {loadingPlans ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 size={20} className="animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="min-w-[700px]">
            {/* Day headers */}
            <div className="grid grid-cols-[80px_repeat(7,1fr)] gap-2 mb-2">
              <div />
              {DAYS.map((day, i) => {
                const date = new Date(weekStart);
                date.setDate(date.getDate() + i);
                const isToday =
                  date.toLocaleDateString() === new Date().toLocaleDateString();
                return (
                  <div key={day} className="text-center">
                    <span
                      className={`text-xs font-semibold uppercase tracking-wide ${
                        isToday ? "text-orange-600" : "text-gray-400"
                      }`}
                    >
                      {day}
                    </span>
                    <div
                      className={`text-sm font-medium mt-0.5 ${
                        isToday ? "text-orange-600" : "text-gray-600"
                      }`}
                    >
                      {date.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Meal rows */}
            {MEALS.map((meal) => (
              <div key={meal} className="grid grid-cols-[80px_repeat(7,1fr)] gap-2 mb-2">
                <div className="flex items-center">
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                    {meal}
                  </span>
                </div>
                {DAYS.map((_, dayIdx) => {
                  const entry = getEntry(dayIdx, meal);
                  return (
                    <div key={dayIdx} className="min-h-[72px]">
                      {entry ? (
                        <div className="relative bg-orange-50 border border-orange-100 rounded-xl p-2.5 h-full group">
                          <button
                            onClick={() => handleRemove(entry.id)}
                            className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity text-orange-300 hover:text-orange-600"
                          >
                            <X size={13} />
                          </button>
                          <p className="text-xs font-medium text-orange-900 leading-snug line-clamp-2 pr-3">
                            {entry.recipe.name}
                          </p>
                          {entry.servings !== (entry.recipe.servings ?? 1) && (
                            <p className="text-xs text-orange-500 mt-1">
                              {entry.servings} srv
                            </p>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => setModal({ day: dayIdx, meal })}
                          className="w-full h-full min-h-[72px] bg-white border border-dashed border-gray-200 rounded-xl flex items-center justify-center hover:border-orange-300 hover:bg-orange-50 transition-colors group"
                        >
                          <Plus size={16} className="text-gray-300 group-hover:text-orange-400" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <RecipeSelectorModal
          day={modal.day}
          mealType={modal.meal}
          weekStart={weekStart}
          onClose={() => setModal(null)}
          onSelect={(entry) => {
            setPlans((prev) => [...prev, entry]);
            setModal(null);
          }}
        />
      )}
    </div>
  );
}
