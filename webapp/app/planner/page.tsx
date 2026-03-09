"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
} from "@dnd-kit/core";
import {
  getWeekPlan,
  addToWeekPlan,
  removeFromWeekPlan,
  updateWeekPlanServings,
  searchRecipesForPlanner,
  getRecipesPanel,
  getRecipeCategories,
} from "@/lib/actions";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Search,
  Loader2,
  Minus,
} from "lucide-react";

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
  return (
    monday.toISOString().slice(0, 10) ===
    getMondayOf(new Date()).toISOString().slice(0, 10)
  );
}

function todayDayIndex(): number {
  const d = new Date().getDay();
  return d === 0 ? 6 : d - 1;
}

// ─── Recipe Thumb ──────────────────────────────────────────────────────────────

function RecipeThumb({
  recipe,
  size = "sm",
}: {
  recipe: RecipeRef;
  size?: "sm" | "md";
}) {
  const dim = size === "md" ? "w-10 h-10" : "w-8 h-8";
  if (recipe.imageUrl) {
    return (
      <img
        src={recipe.imageUrl}
        alt=""
        className={`${dim} rounded-md object-cover shrink-0`}
      />
    );
  }
  const colors = [
    "bg-orange-200",
    "bg-blue-200",
    "bg-green-200",
    "bg-purple-200",
    "bg-pink-200",
    "bg-yellow-200",
  ];
  const color = colors[recipe.name.charCodeAt(0) % colors.length];
  return (
    <div
      className={`${dim} rounded-md ${color} flex items-center justify-center shrink-0`}
    >
      <span className="text-xs font-bold text-gray-700">
        {recipe.name.charAt(0).toUpperCase()}
      </span>
    </div>
  );
}

// ─── Recipe Card (in planner slot) ────────────────────────────────────────────

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
            onClick={(e) => {
              e.stopPropagation();
              onServingsChange(Math.max(1, entry.servings - 1));
            }}
            className="w-4 h-4 rounded-full border border-orange-200 flex items-center justify-center hover:bg-orange-100 text-orange-600 transition-colors"
          >
            <Minus size={8} />
          </button>
          <span className="text-xs font-medium text-orange-700 w-4 text-center">
            {entry.servings}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onServingsChange(entry.servings + 1);
            }}
            className="w-4 h-4 rounded-full border border-orange-200 flex items-center justify-center hover:bg-orange-100 text-orange-600 transition-colors"
          >
            <Plus size={8} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Draggable Recipe (in panel) ──────────────────────────────────────────────

function DraggableRecipeItem({ recipe }: { recipe: RecipeRef }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: `drag-${recipe.id}`, data: { recipe } });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-2 p-2 bg-white border border-gray-100 rounded-xl cursor-grab active:cursor-grabbing hover:border-orange-200 hover:bg-orange-50 transition-colors select-none ${
        isDragging ? "opacity-30" : ""
      }`}
    >
      <RecipeThumb recipe={recipe} size="md" />
      <span className="text-xs font-medium text-gray-700 leading-snug line-clamp-2">
        {recipe.name}
      </span>
    </div>
  );
}

// ─── Drag Overlay Card ────────────────────────────────────────────────────────

function DragOverlayCard({ recipe }: { recipe: RecipeRef }) {
  return (
    <div className="flex items-center gap-2 p-2 bg-white border border-orange-300 rounded-xl shadow-xl w-44 rotate-1">
      <RecipeThumb recipe={recipe} size="md" />
      <span className="text-xs font-medium text-gray-800 leading-snug line-clamp-2">
        {recipe.name}
      </span>
    </div>
  );
}

// ─── Droppable Meal Slot ──────────────────────────────────────────────────────

function DroppableMealSlot({
  dayIdx,
  meal,
  entries,
  onRemove,
  onServingsChange,
  onAddClick,
}: {
  dayIdx: number;
  meal: MealType;
  entries: PlanEntry[];
  onRemove: (id: string) => void;
  onServingsChange: (id: string, n: number) => void;
  onAddClick: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${dayIdx}::${meal}` });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[72px] flex flex-col gap-1.5 rounded-xl p-0.5 transition-all ${
        isOver
          ? "bg-orange-50 ring-2 ring-orange-300 ring-inset"
          : ""
      }`}
    >
      {entries.map((entry) => (
        <RecipeCard
          key={entry.id}
          entry={entry}
          onRemove={() => onRemove(entry.id)}
          onServingsChange={(n) => onServingsChange(entry.id, n)}
        />
      ))}
      <button
        onClick={onAddClick}
        className="w-full bg-white border border-dashed border-gray-200 rounded-xl flex items-center justify-center hover:border-orange-300 hover:bg-orange-50 transition-colors group"
        style={{ minHeight: entries.length === 0 ? "56px" : "28px" }}
      >
        <Plus
          size={entries.length === 0 ? 16 : 12}
          className="text-gray-300 group-hover:text-orange-400"
        />
      </button>
    </div>
  );
}

// ─── Recipe Panel ─────────────────────────────────────────────────────────────

function RecipePanel() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<RecipeRef[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRecipeCategories().then(setCategories);
  }, []);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      const r = await getRecipesPanel(
        search || undefined,
        activeCategory || undefined
      );
      setRecipes(r as RecipeRef[]);
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [search, activeCategory]);

  return (
    <div className="hidden md:flex flex-col gap-3 mt-4 pt-4 border-t border-gray-100 shrink-0">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold text-gray-700 shrink-0">
          Recipes
        </span>
        <div className="relative">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="pl-7 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg w-44 focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 flex-1">
          <button
            onClick={() => setActiveCategory(null)}
            className={`shrink-0 px-2.5 py-1 text-xs rounded-full border transition-colors ${
              activeCategory === null
                ? "bg-orange-500 text-white border-orange-500"
                : "bg-white text-gray-600 border-gray-200 hover:border-orange-300"
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() =>
                setActiveCategory(activeCategory === cat ? null : cat)
              }
              className={`shrink-0 px-2.5 py-1 text-xs rounded-full border transition-colors ${
                activeCategory === cat
                  ? "bg-orange-500 text-white border-orange-500"
                  : "bg-white text-gray-600 border-gray-200 hover:border-orange-300"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Recipe grid */}
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 size={16} className="animate-spin text-gray-400" />
        </div>
      ) : recipes.length === 0 ? (
        <p className="text-sm text-gray-400 py-4">No recipes found.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(172px,1fr))] gap-2 max-h-52 overflow-y-auto pr-1">
          {recipes.map((recipe) => (
            <DraggableRecipeItem key={recipe.id} recipe={recipe} />
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400">
        Drag a recipe onto a day / meal slot above to add it to the plan.
      </p>
    </div>
  );
}

// ─── Recipe Selector Modal (mobile + desktop + button) ────────────────────────

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
      if (!query.trim()) {
        setResults([]);
        return;
      }
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
    await addToWeekPlan({
      recipeId: selected.id,
      weekStartIso: weekStart.toISOString(),
      dayOfWeek: day,
      mealType,
      servings,
    });
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
    <div className="fixed inset-0 bg-black/30 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">
            {DAYS[day]} · {mealType}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1"
          >
            <X size={18} />
          </button>
        </div>

        <div className="relative mb-3">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
            }}
            placeholder="Search recipe…"
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>

        {loading && (
          <div className="flex justify-center py-4">
            <Loader2 size={16} className="animate-spin text-gray-400" />
          </div>
        )}

        {!loading && results.length > 0 && !selected && (
          <ul className="border border-gray-100 rounded-lg divide-y divide-gray-50 mb-4 max-h-52 overflow-auto">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-orange-50 transition-colors flex items-center gap-2.5"
                  onClick={() => {
                    setSelected(r);
                    setServings(r.servings ?? 1);
                  }}
                >
                  <RecipeThumb recipe={r} />
                  <div>
                    <span className="font-medium text-gray-900">{r.name}</span>
                    {r.category && (
                      <span className="ml-2 text-gray-400 text-xs">
                        {r.category.split(",")[0]}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        {selected && (
          <div className="bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 mb-4 flex items-center gap-2.5">
            <RecipeThumb recipe={selected} />
            <span className="flex-1 text-sm font-medium text-orange-800">
              {selected.name}
            </span>
            <button
              onClick={() => setSelected(null)}
              className="text-orange-400 hover:text-orange-600"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <div className="flex items-center gap-3 mb-5">
          <label className="text-sm text-gray-600">Servings</label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setServings((s) => Math.max(1, s - 1))}
              className="w-8 h-8 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center justify-center"
            >
              −
            </button>
            <span className="w-6 text-center text-sm font-medium">
              {servings}
            </span>
            <button
              onClick={() => setServings((s) => s + 1)}
              className="w-8 h-8 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center justify-center"
            >
              +
            </button>
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
  const [modal, setModal] = useState<{ day: number; meal: MealType } | null>(
    null
  );
  const [mobileDay, setMobileDay] = useState(todayDayIndex);
  const [dragActive, setDragActive] = useState<RecipeRef | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const loadPlans = useCallback(async () => {
    setLoadingPlans(true);
    const data = await getWeekPlan(weekStart.toISOString());
    setPlans(data as PlanEntry[]);
    setLoadingPlans(false);
  }, [weekStart]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  function getEntries(day: number, meal: string): PlanEntry[] {
    return plans.filter((p) => p.dayOfWeek === day && p.mealType === meal);
  }

  async function handleRemove(id: string) {
    setPlans((prev) => prev.filter((p) => p.id !== id));
    await removeFromWeekPlan(id);
  }

  async function handleServingsChange(id: string, newServings: number) {
    setPlans((prev) =>
      prev.map((p) => (p.id === id ? { ...p, servings: newServings } : p))
    );
    await updateWeekPlanServings(id, newServings);
  }

  function handleDragStart(event: DragStartEvent) {
    setDragActive(event.active.data.current?.recipe ?? null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setDragActive(null);
    const { active, over } = event;
    if (!over) return;

    const recipe = active.data.current?.recipe as RecipeRef | undefined;
    if (!recipe) return;

    const parts = (over.id as string).split("::");
    if (parts.length !== 2) return;
    const dayIdx = parseInt(parts[0]);
    const meal = parts[1] as MealType;
    if (isNaN(dayIdx) || !MEALS.includes(meal)) return;

    const servings = recipe.servings ?? 1;
    const tempId = `temp-${Math.random()}`;

    // Optimistic update
    setPlans((prev) => [
      ...prev,
      { id: tempId, dayOfWeek: dayIdx, mealType: meal, servings, recipe },
    ]);

    await addToWeekPlan({
      recipeId: recipe.id,
      weekStartIso: weekStart.toISOString(),
      dayOfWeek: dayIdx,
      mealType: meal,
      servings,
    });

    // Reload to get real DB id
    loadPlans();
  }

  const weekNav = (
    <div className="flex items-center gap-1">
      {!isThisWeek(weekStart) && (
        <button
          onClick={() => setWeekStart(getMondayOf(new Date()))}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600"
        >
          Today
        </button>
      )}
      <button
        onClick={() =>
          setWeekStart((d) => {
            const n = new Date(d);
            n.setDate(n.getDate() - 7);
            return n;
          })
        }
        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500"
      >
        <ChevronLeft size={18} />
      </button>
      <span className="text-sm font-medium text-gray-700 hidden sm:block w-44 text-center">
        {formatWeekRange(weekStart)}
      </span>
      <button
        onClick={() =>
          setWeekStart((d) => {
            const n = new Date(d);
            n.setDate(n.getDate() + 7);
            return n;
          })
        }
        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="p-4 md:p-6 h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl md:text-2xl font-semibold text-gray-900">
            Planner
          </h1>
          {weekNav}
        </div>

        {/* Week label on mobile */}
        <p className="sm:hidden text-xs text-gray-400 text-center mb-3">
          {formatWeekRange(weekStart)}
        </p>

        {loadingPlans ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 size={20} className="animate-spin text-gray-400" />
          </div>
        ) : (
          <>
            {/* ── Mobile view ─────────────────────────────────────── */}
            <div className="md:hidden flex flex-col gap-4">
              <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
                {DAYS.map((day, i) => {
                  const date = new Date(weekStart);
                  date.setDate(date.getDate() + i);
                  const isToday =
                    date.toLocaleDateString() ===
                    new Date().toLocaleDateString();
                  const hasEntries = MEALS.some(
                    (m) => getEntries(i, m).length > 0
                  );
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
                      <span className="uppercase tracking-wide text-[10px]">
                        {day}
                      </span>
                      <span className="font-bold text-sm">{date.getDate()}</span>
                      {hasEntries && mobileDay !== i && (
                        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-orange-400" />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="space-y-4">
                {MEALS.map((meal) => {
                  const entries = getEntries(mobileDay, meal);
                  return (
                    <div key={meal}>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                        {meal}
                      </h3>
                      <div className="space-y-2">
                        {entries.map((entry) => (
                          <RecipeCard
                            key={entry.id}
                            entry={entry}
                            onRemove={() => handleRemove(entry.id)}
                            onServingsChange={(n) =>
                              handleServingsChange(entry.id, n)
                            }
                          />
                        ))}
                        <button
                          onClick={() => setModal({ day: mobileDay, meal })}
                          className="w-full py-2.5 bg-white border border-dashed border-gray-200 rounded-xl flex items-center justify-center hover:border-orange-300 hover:bg-orange-50 transition-colors group"
                        >
                          <Plus
                            size={15}
                            className="text-gray-300 group-hover:text-orange-400"
                          />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Desktop view ────────────────────────────────────── */}
            <div className="hidden md:flex flex-col flex-1 overflow-auto">
              <div className="min-w-[700px]">
                {/* Day headers */}
                <div className="grid grid-cols-[80px_repeat(7,1fr)] gap-2 mb-2">
                  <div />
                  {DAYS.map((day, i) => {
                    const date = new Date(weekStart);
                    date.setDate(date.getDate() + i);
                    const isToday =
                      date.toLocaleDateString() ===
                      new Date().toLocaleDateString();
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
                  <div
                    key={meal}
                    className="grid grid-cols-[80px_repeat(7,1fr)] gap-2 mb-2"
                  >
                    <div className="flex items-start pt-2">
                      <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                        {meal}
                      </span>
                    </div>
                    {DAYS.map((_, dayIdx) => (
                      <DroppableMealSlot
                        key={dayIdx}
                        dayIdx={dayIdx}
                        meal={meal}
                        entries={getEntries(dayIdx, meal)}
                        onRemove={handleRemove}
                        onServingsChange={handleServingsChange}
                        onAddClick={() => setModal({ day: dayIdx, meal })}
                      />
                    ))}
                  </div>
                ))}
              </div>

              {/* Recipe panel */}
              <RecipePanel />
            </div>
          </>
        )}

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

      <DragOverlay>
        {dragActive && <DragOverlayCard recipe={dragActive} />}
      </DragOverlay>
    </DndContext>
  );
}
