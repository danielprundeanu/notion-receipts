"use client";

import { useState } from "react";
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
import { Minus, Plus, Search, Star, X } from "lucide-react";
import { categoryLabel, mealLabel } from "@/lib/labels";
import { normalizeSearch } from "@/lib/search";
import { servingsStepOf, stepServings, stepServingsDown } from "@/lib/servings";
import ServingsInput from "@/components/ServingsInput";
import { RecipeThumb, recipeCategories } from "@/components/RecipesGrid";
import { DAY_NAMES, MEALS, byMeal, dateOf, formatKcal, type Macros, type MealType, type PlannerEntry, type PlannerRecipe } from "./shared";

// Desktop week: a meal × day grid you drag recipes onto (from the panel below, or an
// entry from one slot to another), with servings and remove on each card.

type Handlers = {
  onAddRecipe: (recipe: PlannerRecipe, day: number, meal: MealType) => void;
  onMove: (id: string, day: number, meal: MealType) => void;
  onServings: (id: string, n: number) => void;
  onRemove: (id: string) => void;
  onOpenAdd: (day: number, meal: MealType) => void;
};

function EntryCard({ entry, recipe, onServings, onRemove }: {
  entry: PlannerEntry;
  recipe: PlannerRecipe;
  onServings: (n: number) => void;
  onRemove: () => void;
}) {
  const saving = entry.id.startsWith("temp-");
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `entry-${entry.id}`,
    data: { entry },
    disabled: saving,
  });
  const step = servingsStepOf(recipe);
  const round = "w-6 h-6 rounded-full border border-orange-200 dark:border-orange-800/50 flex items-center justify-center hover:bg-orange-100 dark:hover:bg-orange-900/30 text-orange-600 dark:text-orange-400 transition-colors";
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`relative group flex items-center gap-2 bg-orange-50 dark:bg-[#2d1a08] border border-orange-100 dark:border-orange-900/40 rounded-xl px-2.5 py-2 cursor-grab active:cursor-grabbing ${
        isDragging ? "opacity-30" : ""
      } ${saving ? "opacity-60" : ""}`}
    >
      <RecipeThumb recipe={recipe} sizes="32px" className="w-8 h-8 rounded-md shrink-0" initialClass="text-sm" />
      <div className="flex flex-col flex-1 min-w-0 gap-1">
        <Link
          href={`/recipes/${recipe.id}`}
          className="text-xs font-medium text-orange-900 dark:text-orange-300 leading-snug line-clamp-2 hover:underline"
        >
          {recipe.name}
        </Link>
        <div className="flex items-center gap-1.5">
          <button type="button" aria-label="Fewer servings" onClick={() => onServings(stepServingsDown(entry.servings, step))} className={round}>
            <Minus size={10} />
          </button>
          <ServingsInput
            value={entry.servings}
            onCommit={onServings}
            className="w-8 h-6 text-xs font-semibold text-orange-700 dark:text-orange-300"
          />
          <button type="button" aria-label="More servings" onClick={() => onServings(stepServings(entry.servings, 1, step))} className={round}>
            <Plus size={10} />
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${recipe.name}`}
        className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-orange-300 dark:text-orange-600 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/40"
      >
        <X size={13} />
      </button>
    </div>
  );
}

function Slot({ day, meal, entries, recipes, handlers }: {
  day: number;
  meal: MealType;
  entries: PlannerEntry[];
  recipes: Map<string, PlannerRecipe>;
  handlers: Handlers;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${day}::${meal}` });
  return (
    <div
      ref={setNodeRef}
      className={`h-full flex flex-col gap-1.5 rounded-xl p-0.5 transition-all ${
        isOver ? "bg-orange-50 dark:bg-orange-950/40 ring-2 ring-orange-300 dark:ring-orange-700 ring-inset" : ""
      }`}
    >
      {entries.map((e) => {
        const recipe = recipes.get(e.recipeId);
        if (!recipe) return null;
        return (
          <EntryCard
            key={e.id}
            entry={e}
            recipe={recipe}
            onServings={(n) => handlers.onServings(e.id, n)}
            onRemove={() => handlers.onRemove(e.id)}
          />
        );
      })}
      <button
        type="button"
        onClick={() => handlers.onOpenAdd(day, meal)}
        aria-label={`Add to ${DAY_NAMES[day]} ${mealLabel(meal)}`}
        className="flex-1 min-h-[40px] w-full bg-white dark:bg-[#24211c] border border-dashed border-gray-200 dark:border-[#3a352e] rounded-xl flex items-center justify-center hover:border-orange-300 dark:hover:border-orange-800 hover:bg-orange-50 dark:hover:bg-orange-950/20 transition-colors group"
      >
        <Plus size={16} className="text-gray-300 group-hover:text-orange-400" />
      </button>
    </div>
  );
}

function PanelCard({ recipe }: { recipe: PlannerRecipe }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `drag-${recipe.id}`, data: { recipe } });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`bg-white dark:bg-[#24211c] rounded-xl border border-gray-100 dark:border-[#2e2a24] overflow-hidden cursor-grab active:cursor-grabbing hover:shadow-md hover:border-orange-200 dark:hover:border-orange-800/50 transition-all select-none ${
        isDragging ? "opacity-30" : ""
      }`}
    >
      <RecipeThumb recipe={recipe} sizes="200px" className="h-28" initialClass="text-4xl" />
      <div className="p-2.5 flex items-start justify-between gap-1">
        <p className="text-xs font-semibold text-gray-900 dark:text-[#eae5de] leading-snug line-clamp-2">{recipe.name}</p>
        {recipe.favorite && <Star size={11} className="text-orange-500 fill-orange-500 shrink-0 mt-0.5" />}
      </div>
    </div>
  );
}

function RecipePanel({ recipes }: { recipes: PlannerRecipe[] }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [favOnly, setFavOnly] = useState(false);

  const categories = [...new Set(recipes.flatMap((r) => recipeCategories(r.category)))].sort();
  const terms = normalizeSearch(q).split(/\s+/).filter(Boolean);
  const shown = recipes
    .filter(
      (r) =>
        (!favOnly || r.favorite) &&
        (!cat || recipeCategories(r.category).includes(cat)) &&
        terms.every((t) => r.search.includes(t))
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const chip = "shrink-0 px-2.5 py-1 text-xs rounded-full border transition-colors";
  const off = "bg-white dark:bg-[#24211c] text-gray-600 dark:text-[#a49c90] border-gray-200 dark:border-[#3a352e] hover:border-orange-300 dark:hover:border-orange-700";
  const on = "bg-orange-500 text-white border-orange-500";

  return (
    <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-gray-100 dark:border-[#2e2a24] shrink-0">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold text-gray-700 dark:text-[#eae5de] shrink-0">Recipes</span>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#7c756a]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            aria-label="Search recipes"
            className="pl-7 pr-3 py-1.5 text-sm bg-white dark:bg-[#24211c] border border-gray-200 dark:border-[#3a352e] text-gray-900 dark:text-[#eae5de] placeholder:text-gray-400 dark:placeholder:text-[#7c756a] rounded-lg w-44 focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>
        <button type="button" onClick={() => setFavOnly((v) => !v)} aria-pressed={favOnly} className={`${chip} flex items-center gap-1 ${favOnly ? on : off}`}>
          <Star size={11} className="fill-current" /> Favorites
        </button>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 flex-1">
          <button type="button" onClick={() => setCat(null)} aria-pressed={cat === null} className={`${chip} ${cat === null ? on : off}`}>
            All
          </button>
          {categories.map((c) => (
            <button key={c} type="button" onClick={() => setCat(cat === c ? null : c)} aria-pressed={cat === c} className={`${chip} ${cat === c ? on : off}`}>
              {categoryLabel(c)}
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-[#8f877b] py-4">No recipes found.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
          {shown.map((r) => <PanelCard key={r.id} recipe={r} />)}
        </div>
      )}
      <p className="text-xs text-gray-500 dark:text-[#8f877b]">
        Drag a recipe onto a day and meal above to add it, or drag a planned one to move it.
      </p>
    </div>
  );
}

export default function DesktopWeek({
  monday, entries, recipes, recipeList, totals, handlers,
}: {
  monday: Date;
  entries: PlannerEntry[];
  recipes: Map<string, PlannerRecipe>;
  recipeList: PlannerRecipe[];
  totals: Record<number, Macros>;
  handlers: Handlers;
}) {
  const [dragging, setDragging] = useState<PlannerRecipe | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const todayStr = new Date().toDateString();

  function handleDragStart(e: DragStartEvent) {
    const data = e.active.data.current;
    setDragging(data?.recipe ?? (data?.entry ? recipes.get((data.entry as PlannerEntry).recipeId) : null) ?? null);
  }

  function handleDragEnd(e: DragEndEvent) {
    setDragging(null);
    if (!e.over) return;
    const [dayStr, meal] = String(e.over.id).split("::");
    const day = parseInt(dayStr);
    if (isNaN(day) || !MEALS.includes(meal as MealType)) return;
    const entry = e.active.data.current?.entry as PlannerEntry | undefined;
    if (entry) {
      if (entry.dayOfWeek !== day || entry.mealType !== meal) handlers.onMove(entry.id, day, meal as MealType);
      return;
    }
    const recipe = e.active.data.current?.recipe as PlannerRecipe | undefined;
    if (recipe) handlers.onAddRecipe(recipe, day, meal as MealType);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-col flex-1 overflow-auto">
        <div className="min-w-[700px]">
          <div className="grid grid-cols-[80px_repeat(7,1fr)] gap-2 mb-2">
            <div />
            {DAY_NAMES.map((name, i) => {
              const date = dateOf(monday, i);
              const isToday = date.toDateString() === todayStr;
              const nut = totals[i];
              return (
                <div key={name} className="text-center">
                  <span className={`text-xs font-semibold uppercase tracking-wide ${isToday ? "text-orange-600 dark:text-orange-400" : "text-gray-500 dark:text-[#8f877b]"}`}>
                    {name.slice(0, 3)}
                  </span>
                  <div className={`text-sm font-medium mt-0.5 ${isToday ? "text-orange-600 dark:text-orange-400" : "text-gray-600 dark:text-[#a49c90]"}`}>
                    {date.getDate()}
                  </div>
                  {nut && (
                    <div className="mt-1 space-y-0.5">
                      <div className="text-[10px] font-semibold text-gray-500 dark:text-[#8f877b]">{formatKcal(nut.kcal)}</div>
                      <div className="text-[9px] text-gray-400 dark:text-[#7c756a] leading-tight">
                        P {Math.round(nut.protein)}g · C {Math.round(nut.carbs)}g · F {Math.round(nut.fat)}g
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {MEALS.map((meal) => (
            <div key={meal} className="grid grid-cols-[80px_repeat(7,1fr)] gap-2 mb-2 items-stretch">
              <div className="flex items-start pt-2">
                <span className="text-xs font-medium text-gray-500 dark:text-[#8f877b] uppercase tracking-wide">{mealLabel(meal)}</span>
              </div>
              {DAY_NAMES.map((_, day) => (
                <Slot
                  key={day}
                  day={day}
                  meal={meal}
                  entries={entries.filter((e) => e.dayOfWeek === day && e.mealType === meal).sort(byMeal)}
                  recipes={recipes}
                  handlers={handlers}
                />
              ))}
            </div>
          ))}
        </div>
        <RecipePanel recipes={recipeList} />
      </div>
      <DragOverlay>
        {dragging && (
          <div className="bg-white dark:bg-[#24211c] rounded-xl border border-orange-300 shadow-2xl w-44 overflow-hidden rotate-1 opacity-95">
            <RecipeThumb recipe={dragging} sizes="176px" className="h-24" initialClass="text-3xl" />
            <p className="p-2 text-xs font-semibold text-gray-800 dark:text-[#eae5de] leading-snug line-clamp-2">{dragging.name}</p>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
