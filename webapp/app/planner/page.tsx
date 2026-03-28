"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  pointerWithin,
} from "@dnd-kit/core";
import {
  getWeekPlan,
  getWeekNutrition,
  addToWeekPlan,
  removeFromWeekPlan,
  updateWeekPlanServings,
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
  Star,
  Trash2,
} from "lucide-react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MEALS = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;

const CATEGORY_COLORS: Record<string, string> = {
  Breakfast:       "bg-yellow-100 text-yellow-700 dark:bg-[#3f3217] dark:text-yellow-300",
  Lunch:           "bg-green-100  text-green-700  dark:bg-[#1b3725] dark:text-green-300",
  Dinner:          "bg-blue-100   text-blue-700   dark:bg-[#1e2a45] dark:text-blue-300",
  Snack:           "bg-purple-100 text-purple-700 dark:bg-[#342045] dark:text-purple-300",
  Smoothie:        "bg-pink-100   text-pink-700   dark:bg-[#421e2e] dark:text-pink-300",
  "Smoothie Bowl": "bg-pink-100   text-pink-700   dark:bg-[#421e2e] dark:text-pink-300",
  Soup:            "bg-orange-100 text-orange-700 dark:bg-[#452819] dark:text-orange-300",
  "High Protein":  "bg-red-100    text-red-700    dark:bg-[#421e1e] dark:text-red-300",
};
type MealType = (typeof MEALS)[number];

type RecipeRef = {
  id: string;
  name: string;
  category: string | null;
  servings: number | null;
  imageUrl: string | null;
  favorite?: boolean;
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

const SWIPE_REVEAL_WIDTH = 56;

function RecipeCard({
  entry,
  onRemove,
  onServingsChange,
}: {
  entry: PlanEntry;
  onRemove: () => void;
  onServingsChange: (n: number) => void;
}) {
  const [swipeX, setSwipeX] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const swipeXRef = useRef(0);
  const revealedRef = useRef(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isHorizontal = useRef(false);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    function onTouchStart(e: TouchEvent) {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      isHorizontal.current = false;
    }

    function onTouchMove(e: TouchEvent) {
      const dx = e.touches[0].clientX - touchStartX.current;
      const dy = e.touches[0].clientY - touchStartY.current;
      if (!isHorizontal.current) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        if (Math.abs(dy) >= Math.abs(dx)) return;
        isHorizontal.current = true;
      }
      e.preventDefault();
      const base = revealedRef.current ? -SWIPE_REVEAL_WIDTH : 0;
      const next = Math.min(0, Math.max(-SWIPE_REVEAL_WIDTH - 12, base + dx));
      swipeXRef.current = next;
      setSwipeX(next);
    }

    function onTouchEnd() {
      if (!isHorizontal.current) return;
      const shouldReveal = swipeXRef.current < -(SWIPE_REVEAL_WIDTH / 2);
      revealedRef.current = shouldReveal;
      setRevealed(shouldReveal);
      setSwipeX(shouldReveal ? -SWIPE_REVEAL_WIDTH : 0);
      swipeXRef.current = shouldReveal ? -SWIPE_REVEAL_WIDTH : 0;
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  function collapseSwipe() {
    revealedRef.current = false;
    setRevealed(false);
    setSwipeX(0);
    swipeXRef.current = 0;
  }

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Delete button — mobile only, hidden until swipe */}
      <div
        className="md:hidden absolute right-0 top-0 bottom-0 flex items-center justify-center bg-red-500 rounded-r-xl"
        style={{ width: SWIPE_REVEAL_WIDTH, visibility: swipeX < 0 ? "visible" : "hidden" }}
      >
        <button
          onClick={onRemove}
          className="w-full h-full flex items-center justify-center active:bg-red-600"
        >
          <Trash2 size={18} className="text-white" />
        </button>
      </div>

      {/* Card content */}
      <div
        ref={contentRef}
        style={{ transform: `translateX(${swipeX}px)`, transition: isHorizontal.current ? "none" : "transform 0.2s ease" }}
        onClick={revealed ? collapseSwipe : undefined}
        className="flex items-center gap-2 bg-orange-50 dark:bg-[#2d1a08] border border-orange-100 dark:border-orange-900/40 rounded-xl px-2.5 py-2 group relative"
      >
        <RecipeThumb recipe={entry.recipe} />

        {/* Desktop layout: title + servings below */}
        <div className="hidden md:flex flex-col flex-1 min-w-0 gap-1">
          <Link
            href={`/recipes/${entry.recipe.id}`}
            className="text-xs font-medium text-orange-900 dark:text-orange-300 leading-snug line-clamp-2 hover:underline"
          >
            {entry.recipe.name}
          </Link>
          <div className="flex items-center gap-1.5">
            <button
              onClick={(e) => { e.stopPropagation(); onServingsChange(Math.max(1, entry.servings - 1)); }}
              className="w-6 h-6 rounded-full border border-orange-200 dark:border-orange-800/50 flex items-center justify-center hover:bg-orange-100 dark:hover:bg-orange-900/30 text-orange-600 dark:text-orange-400 transition-colors"
            >
              <Minus size={10} />
            </button>
            <span className="text-xs font-semibold text-orange-700 dark:text-orange-300 w-4 text-center">
              {entry.servings}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onServingsChange(entry.servings + 1); }}
              className="w-6 h-6 rounded-full border border-orange-200 dark:border-orange-800/50 flex items-center justify-center hover:bg-orange-100 dark:hover:bg-orange-900/30 text-orange-600 dark:text-orange-400 transition-colors"
            >
              <Plus size={10} />
            </button>
          </div>
        </div>

        {/* Mobile layout: title + inline servings */}
        <Link
          href={`/recipes/${entry.recipe.id}`}
          onClick={(e) => revealed && e.preventDefault()}
          className="md:hidden flex-1 min-w-0 text-xs font-medium text-orange-900 dark:text-orange-300 leading-snug line-clamp-2 hover:underline"
        >
          {entry.recipe.name}
        </Link>
        <div className="md:hidden flex items-center gap-1.5 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onServingsChange(Math.max(1, entry.servings - 1)); }}
            className="w-7 h-7 rounded-full border border-orange-200 dark:border-orange-800/50 flex items-center justify-center hover:bg-orange-100 dark:hover:bg-orange-900/30 text-orange-600 dark:text-orange-400 transition-colors"
          >
            <Minus size={12} />
          </button>
          <span className="text-sm font-semibold text-orange-700 dark:text-orange-300 w-5 text-center">
            {entry.servings}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onServingsChange(entry.servings + 1); }}
            className="w-7 h-7 rounded-full border border-orange-200 dark:border-orange-800/50 flex items-center justify-center hover:bg-orange-100 dark:hover:bg-orange-900/30 text-orange-600 dark:text-orange-400 transition-colors"
          >
            <Plus size={12} />
          </button>
        </div>

        {/* X — desktop hover only */}
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="hidden md:flex absolute top-1 right-1 w-6 h-6 items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity text-orange-300 dark:text-orange-600 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/40"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Draggable Large Recipe Card (in panel) ───────────────────────────────────

function DraggableLargeCard({ recipe }: { recipe: RecipeRef }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: `drag-${recipe.id}`, data: { recipe } });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const cats = (recipe.category ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 2);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`bg-white dark:bg-[#252525] rounded-xl border border-gray-100 dark:border-[#2e2e2e] overflow-hidden cursor-grab active:cursor-grabbing hover:shadow-md hover:border-orange-200 dark:hover:border-orange-800/50 transition-all select-none ${
        isDragging ? "opacity-30" : ""
      }`}
    >
      <div className="relative h-32 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-[#2a2a2a] dark:to-[#252525] overflow-hidden">
        {recipe.imageUrl ? (
          <Image
            src={recipe.imageUrl}
            alt={recipe.name}
            fill
            sizes="200px"
            className="object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-3xl opacity-20">🍽️</span>
          </div>
        )}
        {cats.length > 0 && (
          <div className="absolute top-1.5 right-1.5 flex gap-1">
            {cats.map((c) => {
              const cls = CATEGORY_COLORS[c] ?? "bg-gray-100 text-gray-600 dark:bg-[#2e2e2e] dark:text-[#b8b8b8]";
              return (
                <span key={c} className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${cls}`}>
                  {c}
                </span>
              );
            })}
          </div>
        )}
      </div>
      <div className="p-2.5 flex items-start justify-between gap-1">
        <p className="text-xs font-semibold text-gray-900 dark:text-[#e3e3e3] leading-snug line-clamp-2">
          {recipe.name}
        </p>
        {recipe.favorite && (
          <Star size={11} className="text-amber-400 fill-amber-400 shrink-0 mt-0.5" />
        )}
      </div>
    </div>
  );
}

// ─── Drag Overlay Card ────────────────────────────────────────────────────────

function DragOverlayCard({ recipe }: { recipe: RecipeRef }) {
  return (
    <div className="bg-white dark:bg-[#252525] rounded-xl border border-orange-300 shadow-2xl w-44 overflow-hidden rotate-1 opacity-95">
      <div className="relative h-28 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-[#2a2a2a] dark:to-[#252525] overflow-hidden">
        {recipe.imageUrl ? (
          <Image src={recipe.imageUrl} alt={recipe.name} fill sizes="176px" className="object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-2xl opacity-20">🍽️</span>
          </div>
        )}
      </div>
      <div className="p-2">
        <p className="text-xs font-semibold text-gray-800 dark:text-[#e3e3e3] leading-snug line-clamp-2">
          {recipe.name}
        </p>
      </div>
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
      className={`h-full flex flex-col gap-1.5 rounded-xl p-0.5 transition-all ${
        isOver
          ? "bg-orange-50 dark:bg-orange-950/40 ring-2 ring-orange-300 dark:ring-orange-700 ring-inset"
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
        className="flex-1 min-h-[40px] w-full bg-white dark:bg-[#252525] border border-dashed border-gray-200 dark:border-[#3a3a3a] rounded-xl flex items-center justify-center hover:border-orange-300 dark:hover:border-orange-800 hover:bg-orange-50 dark:hover:bg-orange-950/20 transition-colors group"
      >
        <Plus
          size={16}
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
  const [favOnly, setFavOnly] = useState(false);
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
        activeCategory || undefined,
        favOnly || undefined
      );
      setRecipes(r as RecipeRef[]);
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [search, activeCategory, favOnly]);

  return (
    <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-gray-100 dark:border-[#2e2e2e] shrink-0">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold text-gray-700 dark:text-[#e3e3e3] shrink-0">
          Recipes
        </span>
        <div className="relative">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#555555]"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="pl-7 pr-3 py-1.5 text-sm bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#3a3a3a] text-gray-900 dark:text-[#e3e3e3] placeholder:text-gray-400 dark:placeholder:text-[#555555] rounded-lg w-44 focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>
        <button
          onClick={() => setFavOnly((v) => !v)}
          className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border transition-colors shrink-0 ${
            favOnly
              ? "bg-amber-400 text-white border-amber-400"
              : "bg-white dark:bg-[#252525] border-gray-200 dark:border-[#3a3a3a] text-gray-600 dark:text-[#9a9a9a] hover:border-amber-300 dark:hover:border-amber-700"
          }`}
        >
          <Star size={11} className={favOnly ? "fill-white" : "fill-amber-400 text-amber-400"} />
          Favorites
        </button>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 flex-1">
          <button
            onClick={() => setActiveCategory(null)}
            className={`shrink-0 px-2.5 py-1 text-xs rounded-full border transition-colors ${
              activeCategory === null
                ? "bg-orange-500 text-white border-orange-500"
                : "bg-white dark:bg-[#252525] text-gray-600 dark:text-[#9a9a9a] border-gray-200 dark:border-[#3a3a3a] hover:border-orange-300 dark:hover:border-orange-700"
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
                  : "bg-white dark:bg-[#252525] text-gray-600 dark:text-[#9a9a9a] border-gray-200 dark:border-[#3a3a3a] hover:border-orange-300 dark:hover:border-orange-700"
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
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
          {recipes.map((recipe) => (
            <DraggableLargeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400 dark:text-[#555555]">
        Drag a recipe onto a day / meal slot above to add it to the plan.
      </p>
    </div>
  );
}

// ─── Recipe Selector Modal ────────────────────────────────────────────────────

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
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [favOnly, setFavOnly] = useState(false);
  const [results, setResults] = useState<RecipeRef[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [servings, setServings] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<RecipeRef | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getRecipeCategories().then(setCategories);
  }, []);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      const r = await getRecipesPanel(
        query || undefined,
        activeCategory || undefined,
        favOnly || undefined
      );
      setResults(r as RecipeRef[]);
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query, activeCategory, favOnly]);

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    const { id: realId } = await addToWeekPlan({
      recipeId: selected.id,
      weekStartIso: weekStart.toISOString(),
      dayOfWeek: day,
      mealType,
      servings,
    });
    onSelect({ id: realId, dayOfWeek: day, mealType, servings, recipe: selected });
    setSaving(false);
  }

  return (
    <div
      className="fixed inset-0 bg-black/30 dark:bg-black/50 flex items-end sm:items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-[#252525] rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg flex flex-col h-[88svh] sm:h-auto sm:max-h-[80vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 shrink-0">
          <h3 className="font-semibold text-gray-900 dark:text-[#e3e3e3]">
            {DAYS[day]} · {mealType}
          </h3>
          <button onClick={onClose} className="text-gray-400 dark:text-[#555555] hover:text-gray-600 dark:hover:text-[#9a9a9a] p-1">
            <X size={18} />
          </button>
        </div>

        {/* Search — 16px font prevents iOS zoom */}
        <div className="px-4 pb-2 shrink-0">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#555555]" />
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
              placeholder="Search recipe…"
              style={{ fontSize: "16px" }}
              className="w-full pl-9 pr-3 py-2.5 bg-gray-50 dark:bg-[#2a2a2a] border border-gray-200 dark:border-[#3a3a3a] text-gray-900 dark:text-[#e3e3e3] placeholder:text-gray-400 dark:placeholder:text-[#555555] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>

        {/* Filters */}
        <div className="px-4 pb-3 shrink-0">
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            <button
              onClick={() => { setFavOnly((v) => !v); setSelected(null); }}
              className={`flex items-center gap-1 shrink-0 px-2.5 py-1 text-xs rounded-full border transition-colors ${
                favOnly
                  ? "bg-amber-400 text-white border-amber-400"
                  : "bg-white dark:bg-[#2a2a2a] border-gray-200 dark:border-[#3a3a3a] text-gray-600 dark:text-[#9a9a9a]"
              }`}
            >
              <Star size={10} className={favOnly ? "fill-white" : "fill-amber-400 text-amber-400"} />
              Fav
            </button>
            <button
              onClick={() => { setActiveCategory(null); setSelected(null); }}
              className={`shrink-0 px-2.5 py-1 text-xs rounded-full border transition-colors ${
                activeCategory === null
                  ? "bg-orange-500 text-white border-orange-500"
                  : "bg-white dark:bg-[#2a2a2a] border-gray-200 dark:border-[#3a3a3a] text-gray-600 dark:text-[#9a9a9a]"
              }`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => { setActiveCategory(activeCategory === cat ? null : cat); setSelected(null); }}
                className={`shrink-0 px-2.5 py-1 text-xs rounded-full border transition-colors ${
                  activeCategory === cat
                    ? "bg-orange-500 text-white border-orange-500"
                    : "bg-white dark:bg-[#2a2a2a] border-gray-200 dark:border-[#3a3a3a] text-gray-600 dark:text-[#9a9a9a]"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Recipe list — scrollable */}
        <div className="flex-1 overflow-y-auto px-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 size={18} className="animate-spin text-gray-400" />
            </div>
          ) : results.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No recipes found.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pb-2">
              {results.map((r) => (
                <button
                  key={r.id}
                  onClick={() => { setSelected(r); setServings(r.servings ?? 1); }}
                  className={`flex flex-col rounded-xl overflow-hidden border text-left transition-all ${
                    selected?.id === r.id
                      ? "border-orange-400 ring-2 ring-orange-400/40"
                      : "border-gray-100 dark:border-[#2e2e2e] hover:border-orange-200 dark:hover:border-orange-800/50"
                  }`}
                >
                  <div className="h-20 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-[#2a2a2a] dark:to-[#252525] overflow-hidden">
                    {r.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.imageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-2xl opacity-20">🍽️</span>
                      </div>
                    )}
                  </div>
                  <div className="px-2 py-1.5 bg-white dark:bg-[#252525]">
                    <p className="text-xs font-medium text-gray-800 dark:text-[#e3e3e3] leading-snug line-clamp-2">
                      {r.name}
                    </p>
                    {r.category && (
                      <p className="text-[10px] text-gray-400 dark:text-[#555555] mt-0.5 truncate">
                        {r.category.split(",")[0]}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer — servings + add */}
        <div className="px-4 pt-3 border-t border-gray-100 dark:border-[#2e2e2e] shrink-0 flex items-center gap-3" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
          {selected && (
            <div className="flex items-center gap-1.5 mr-auto min-w-0">
              <RecipeThumb recipe={selected} size="sm" />
              <span className="text-xs font-medium text-gray-700 dark:text-[#b8b8b8] truncate">{selected.name}</span>
            </div>
          )}
          {!selected && (
            <span className="text-xs text-gray-400 dark:text-[#555555] mr-auto">Select a recipe above</span>
          )}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setServings((s) => Math.max(1, s - 1))}
              className="w-7 h-7 rounded-full border border-gray-200 dark:border-[#3a3a3a] text-gray-600 dark:text-[#9a9a9a] hover:bg-gray-50 dark:hover:bg-[#2f2f2f] flex items-center justify-center text-sm"
            >−</button>
            <span className="w-5 text-center text-sm font-semibold text-gray-800 dark:text-[#e3e3e3]">{servings}</span>
            <button
              onClick={() => setServings((s) => s + 1)}
              className="w-7 h-7 rounded-full border border-gray-200 dark:border-[#3a3a3a] text-gray-600 dark:text-[#9a9a9a] hover:bg-gray-50 dark:hover:bg-[#2f2f2f] flex items-center justify-center text-sm"
            >+</button>
          </div>
          <button
            onClick={handleSave}
            disabled={!selected || saving}
            className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-40 transition-colors flex items-center gap-1.5 shrink-0"
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            Add
          </button>
        </div>

      </div>
    </div>
  );
}

// ─── Planner Page ─────────────────────────────────────────────────────────────

export default function PlannerPage() {
  const [weekStart, setWeekStart] = useState(() => getMondayOf(new Date()));
  const [plans, setPlans] = useState<PlanEntry[]>([]);
  const [dayNutrition, setDayNutrition] = useState<Record<number, { kcal: number; carbs: number; fat: number; protein: number }>>({});
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [modal, setModal] = useState<{ day: number; meal: MealType } | null>(
    null
  );
  const [mobileDay, setMobileDay] = useState(todayDayIndex);
  const [dragActive, setDragActive] = useState<RecipeRef | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const loadPlans = useCallback(async () => {
    setLoadingPlans(true);
    const [data, nutrition] = await Promise.all([
      getWeekPlan(weekStart.toISOString()),
      getWeekNutrition(weekStart.toISOString()),
    ]);
    setPlans(data as PlanEntry[]);
    setDayNutrition(nutrition);
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
    getWeekNutrition(weekStart.toISOString()).then(setDayNutrition);
  }

  async function handleServingsChange(id: string, newServings: number) {
    setPlans((prev) =>
      prev.map((p) => (p.id === id ? { ...p, servings: newServings } : p))
    );
    await updateWeekPlanServings(id, newServings);
    getWeekNutrition(weekStart.toISOString()).then(setDayNutrition);
  }

  function handleDragStart(event: DragStartEvent) {
    setDragActive(event.active.data.current?.recipe ?? null);
    // Haptic feedback when card "locks in" to drag
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(12);
    }
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

    const { id: realId } = await addToWeekPlan({
      recipeId: recipe.id,
      weekStartIso: weekStart.toISOString(),
      dayOfWeek: dayIdx,
      mealType: meal,
      servings,
    });

    // Replace temp ID with real DB id (no full reload)
    setPlans((prev) =>
      prev.map((p) => (p.id === tempId ? { ...p, id: realId } : p))
    );
    getWeekNutrition(weekStart.toISOString()).then(setDayNutrition);
  }

  const weekNav = (
    <div className="flex items-center gap-1">
      {!isThisWeek(weekStart) && (
        <button
          onClick={() => setWeekStart(getMondayOf(new Date()))}
          className="px-3 py-1.5 text-sm border border-gray-200 dark:border-[#3a3a3a] rounded-lg hover:bg-gray-50 dark:hover:bg-[#2f2f2f] text-gray-600 dark:text-[#9a9a9a]"
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
        className="p-1.5 hover:bg-gray-100 dark:hover:bg-[#2a2a2a] rounded-lg text-gray-500 dark:text-[#787878]"
      >
        <ChevronLeft size={18} />
      </button>
      <span className="text-sm font-medium text-gray-700 dark:text-[#b8b8b8] hidden sm:block w-44 text-center">
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
        className="p-1.5 hover:bg-gray-100 dark:hover:bg-[#2a2a2a] rounded-lg text-gray-500 dark:text-[#787878]"
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
          <h1 className="text-xl md:text-2xl font-semibold text-gray-900 dark:text-[#e3e3e3]">
            Planner
          </h1>
          {weekNav}
        </div>

        {/* Week label on mobile */}
        <p className="sm:hidden text-xs text-gray-400 dark:text-[#555555] text-center mb-3">
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
                          ? "bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-800/50"
                          : "bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#3a3a3a] text-gray-600 dark:text-[#9a9a9a]"
                      }`}
                    >
                      <span className="uppercase tracking-wide text-[10px]">
                        {day}
                      </span>
                      <span className="font-bold text-sm">{date.getDate()}</span>
                      {dayNutrition[i] && (
                        <span className="text-[9px] font-medium opacity-80 leading-tight">
                          {Math.round(dayNutrition[i].kcal)}
                        </span>
                      )}
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
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-[#555555] mb-2">
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
                          className="w-full py-2.5 bg-white dark:bg-[#252525] border border-dashed border-gray-200 dark:border-[#3a3a3a] rounded-xl flex items-center justify-center hover:border-orange-300 dark:hover:border-orange-800 hover:bg-orange-50 dark:hover:bg-orange-950/20 transition-colors group"
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
                    const nut = dayNutrition[i];
                    return (
                      <div key={day} className="text-center">
                        <span
                          className={`text-xs font-semibold uppercase tracking-wide ${
                            isToday ? "text-orange-600 dark:text-orange-400" : "text-gray-400 dark:text-[#555555]"
                          }`}
                        >
                          {day}
                        </span>
                        <div
                          className={`text-sm font-medium mt-0.5 ${
                            isToday ? "text-orange-600 dark:text-orange-400" : "text-gray-600 dark:text-[#9a9a9a]"
                          }`}
                        >
                          {date.getDate()}
                        </div>
                        {nut && (
                          <div className="mt-1 space-y-0.5">
                            <div className="text-[10px] font-semibold text-gray-500 dark:text-[#787878]">
                              {Math.round(nut.kcal)} kcal
                            </div>
                            <div className="text-[9px] text-gray-400 dark:text-[#555555] leading-tight">
                              P {Math.round(nut.protein)}g · C {Math.round(nut.carbs)}g · F {Math.round(nut.fat)}g
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Meal rows */}
                {MEALS.map((meal) => (
                  <div
                    key={meal}
                    className="grid grid-cols-[80px_repeat(7,1fr)] gap-2 mb-2 items-stretch"
                  >
                    <div className="flex items-start pt-2">
                      <span className="text-xs font-medium text-gray-400 dark:text-[#555555] uppercase tracking-wide">
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
              getWeekNutrition(weekStart.toISOString()).then(setDayNutrition);
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
