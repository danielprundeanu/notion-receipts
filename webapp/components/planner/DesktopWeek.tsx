"use client";

import { useEffect, useState } from "react";
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
import { GripVertical, Minus, Plus, Search, Star, X } from "lucide-react";
import { categoryLabel, mealLabel } from "@/lib/labels";
import { normalizeSearch } from "@/lib/search";
import { servingsStepOf, stepServings, stepServingsDown } from "@/lib/servings";
import ServingsInput from "@/components/ServingsInput";
import { RecipeThumb, recipeCategories } from "@/components/RecipesGrid";
import { DAY_NAMES, MEALS, byMeal, dateOf, formatKcal, type Macros, type MealType, type PlannerEntry, type PlannerRecipe } from "./shared";

// Desktop week: a meal × day grid, with the recipes panel beside it (below it on narrower
// screens). A recipe goes in by dragging it onto a slot, by clicking it and then a slot, or
// by clicking a slot and then a recipe. A planned one drags to another slot.

type Handlers = {
  onAddRecipe: (recipe: PlannerRecipe, day: number, meal: MealType) => void;
  onMove: (id: string, day: number, meal: MealType) => void;
  onServings: (id: string, n: number) => void;
  onRemove: (id: string) => void;
};

type Target = { day: number; meal: MealType };

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
  const kcal = recipe.nutrition ? formatKcal(recipe.nutrition.kcal * entry.servings) : null;
  const round = "w-6 h-6 rounded-full flex items-center justify-center text-orange-700 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-500/20 transition-colors";
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`relative group rounded-[10px] bg-orange-50 dark:bg-orange-500/15 px-2 pt-2 pb-1 cursor-grab active:cursor-grabbing ${
        isDragging ? "opacity-30" : ""
      } ${saving ? "opacity-60" : ""}`}
    >
      {/* A strip of the photo across the top; the card underneath stays the drag handle. */}
      <RecipeThumb recipe={recipe} sizes="160px" className="h-10 mb-1.5 rounded-lg pointer-events-none" initialClass="text-lg" />
      <Link
        href={`/recipes/${recipe.id}`}
        className="block text-[13px] font-semibold leading-tight line-clamp-2 text-gray-900 dark:text-[#eae5de] hover:underline"
      >
        {recipe.name}
      </Link>
      <div className="mt-0.5 flex items-center gap-0.5">
        <button type="button" aria-label="Fewer servings" onClick={() => onServings(stepServingsDown(entry.servings, step))} className={round}>
          <Minus size={11} />
        </button>
        <ServingsInput
          value={entry.servings}
          onCommit={onServings}
          className="w-7 h-6 text-xs font-semibold text-orange-800 dark:text-orange-300"
        />
        <button type="button" aria-label="More servings" onClick={() => onServings(stepServings(entry.servings, 1, step))} className={round}>
          <Plus size={11} />
        </button>
      </div>
      {kcal && <p className="text-[11px] text-gray-600 dark:text-[#a49c90] truncate">{kcal}</p>}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${recipe.name}`}
        className="absolute top-[11px] right-[11px] w-5 h-5 flex items-center justify-center rounded-full bg-black/55 text-white hover:bg-red-600 transition-colors"
      >
        <X size={12} />
      </button>
    </div>
  );
}

function Slot({ day, meal, entries, recipes, handlers, picked, target, onSlotClick }: {
  day: number;
  meal: MealType;
  entries: PlannerEntry[];
  recipes: Map<string, PlannerRecipe>;
  handlers: Handlers;
  picked: PlannerRecipe | null;
  target: Target | null;
  onSlotClick: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${day}::${meal}` });
  const isTarget = target?.day === day && target.meal === meal;
  const label = picked
    ? `Add ${picked.name} to ${DAY_NAMES[day]} ${mealLabel(meal)}`
    : `Add to ${DAY_NAMES[day]} ${mealLabel(meal)}`;
  return (
    <div
      ref={setNodeRef}
      className={`h-full min-h-[96px] flex flex-col gap-1 rounded-xl p-1 border transition-colors ${
        isOver || isTarget
          ? "border-orange-500 bg-orange-50 dark:bg-orange-500/10"
          : picked
            ? "border-dashed border-orange-400 dark:border-orange-500/70"
            : "border-gray-200 dark:border-[#3a352e]"
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
        onClick={onSlotClick}
        aria-label={label}
        aria-pressed={isTarget}
        className={`flex-1 min-h-[30px] w-full rounded-[9px] flex items-center justify-center gap-1 text-xs font-semibold transition-colors ${
          picked
            ? "text-orange-700 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-500/10"
            : "text-gray-400 dark:text-[#8f877b] hover:text-orange-700 dark:hover:text-orange-400 hover:bg-gray-50 dark:hover:bg-[#24211c]"
        }`}
      >
        <Plus size={14} aria-hidden />
        {picked && "Add here"}
      </button>
    </div>
  );
}

function PanelRow({ recipe, on, isNew, onPick }: { recipe: PlannerRecipe; on: boolean; isNew: boolean; onPick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `drag-${recipe.id}`, data: { recipe } });
  const cat = recipeCategories(recipe.category)[0];
  const meta = [cat ? categoryLabel(cat) : null, recipe.nutrition ? `${formatKcal(recipe.nutrition.kcal)} / serving` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <button
      type="button"
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onPick}
      aria-pressed={on}
      className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-xl border text-left cursor-grab active:cursor-grabbing select-none transition-colors ${
        on
          ? "border-orange-500 bg-orange-50 dark:bg-orange-500/10"
          : "border-transparent hover:bg-gray-100 dark:hover:bg-[#2e2a24]"
      } ${isDragging ? "opacity-30" : ""}`}
    >
      <RecipeThumb recipe={recipe} sizes="44px" className="w-11 h-11 rounded-[10px] shrink-0" initialClass="text-xl" />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold truncate text-gray-900 dark:text-[#eae5de]">{recipe.name}</span>
        {meta && <span className="block mt-0.5 text-xs text-gray-600 dark:text-[#a49c90] truncate">{meta}</span>}
      </span>
      {isNew && (
        <span className="px-1.5 py-0.5 rounded-md bg-teal-50 dark:bg-teal-500/15 text-[11px] font-bold uppercase tracking-wide text-teal-700 dark:text-teal-300">
          New
        </span>
      )}
      {recipe.favorite && !isNew && <Star size={14} aria-label="Favorite" className="shrink-0 text-orange-600 dark:text-orange-400 fill-current" />}
      <GripVertical size={16} aria-hidden className="shrink-0 text-gray-400 dark:text-[#8f877b]" />
    </button>
  );
}

function RecipePanel({ recipes, recentIds, newIds, picked, target, onPick, onCancel, onAddRecipes }: {
  recipes: PlannerRecipe[];
  recentIds: string[];
  newIds: string[];
  picked: PlannerRecipe | null;
  target: Target | null;
  onPick: (r: PlannerRecipe) => void;
  onCancel: () => void;
  onAddRecipes?: () => void;
}) {
  const [q, setQ] = useState("");
  const [chip, setChip] = useState<string | null>(null);

  const categories = [...new Set(recipes.flatMap((r) => recipeCategories(r.category)))].sort();
  const terms = normalizeSearch(q).split(/\s+/).filter(Boolean);
  const recent = new Set(recentIds);
  const fresh = new Set(newIds);
  const shown = recipes
    .filter(
      (r) =>
        (chip !== "Favorites" || r.favorite) &&
        (chip !== "Recent" || recent.has(r.id)) &&
        (!chip || chip === "Favorites" || chip === "Recent" || recipeCategories(r.category).includes(chip)) &&
        terms.every((t) => r.search.includes(t))
    )
    // Just-added recipes first, then A–Z.
    .sort((a, b) => Number(fresh.has(b.id)) - Number(fresh.has(a.id)) || a.name.trim().localeCompare(b.name.trim(), "en", { sensitivity: "base" }));

  const chipCls = (on: boolean) =>
    `shrink-0 h-[34px] px-3 rounded-full border text-[13px] font-medium flex items-center gap-1.5 transition-colors ${
      on
        ? "bg-orange-100 border-orange-300 text-orange-800 dark:bg-orange-500/15 dark:border-orange-500/50 dark:text-orange-300"
        : "bg-white dark:bg-[#1a1714] border-gray-200 dark:border-[#3a352e] text-gray-600 dark:text-[#a49c90]"
    }`;
  const busy = picked || target;
  const hint = target
    ? `Pick a recipe for ${DAY_NAMES[target.day]} ${mealLabel(target.meal).toLowerCase()}.`
    : picked
      ? `Now click a slot to add ${picked.name}.`
      : "Drag a recipe onto a day, or click it and then a slot.";

  return (
    <aside
      aria-labelledby="panel-title"
      className="flex flex-col min-h-0 mt-4 pt-4 border-t border-gray-200 dark:border-[#3a352e] lg:mt-0 lg:pt-4 lg:w-[340px] lg:shrink-0 lg:border lg:rounded-2xl lg:px-3 lg:bg-white lg:dark:bg-[#24211c]"
    >
      <div className="flex items-center justify-between gap-2 lg:px-1">
        <h2 id="panel-title" className="text-lg font-bold text-gray-900 dark:text-[#eae5de]">Recipes</h2>
        {onAddRecipes && (
          <button
            type="button"
            onClick={onAddRecipes}
            className="h-10 px-3.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-gray-900 text-sm font-bold flex items-center gap-1.5 transition-colors"
          >
            <Plus size={17} aria-hidden /> Add recipes
          </button>
        )}
      </div>
      <div className="relative mt-3 lg:mx-1">
        <Search size={16} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-[#a49c90]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search recipes"
          aria-label="Search recipes"
          className="w-full h-[42px] pl-9 pr-3 rounded-xl border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#1a1714] text-sm text-gray-900 dark:text-[#eae5de] placeholder:text-gray-500 dark:placeholder:text-[#8f877b] focus:outline-none focus:border-orange-500"
        />
      </div>
      <div className="mt-2.5 flex gap-1.5 overflow-x-auto scrollbar-none lg:px-1">
        {recentIds.length > 0 && (
          <button type="button" onClick={() => setChip(chip === "Recent" ? null : "Recent")} aria-pressed={chip === "Recent"} className={chipCls(chip === "Recent")}>
            Recent
          </button>
        )}
        <button type="button" onClick={() => setChip(chip === "Favorites" ? null : "Favorites")} aria-pressed={chip === "Favorites"} className={chipCls(chip === "Favorites")}>
          <Star size={12} className="fill-current" aria-hidden /> Favorites
        </button>
        {categories.map((c) => (
          <button key={c} type="button" onClick={() => setChip(chip === c ? null : c)} aria-pressed={chip === c} className={chipCls(chip === c)}>
            {categoryLabel(c)}
          </button>
        ))}
      </div>
      <div className={`mt-2.5 min-h-10 px-2.5 py-2 rounded-xl flex items-center gap-2 ${busy ? "bg-orange-50 dark:bg-orange-500/15" : ""}`}>
        <p aria-live="polite" className={`flex-1 text-[13px] leading-snug ${busy ? "text-gray-900 dark:text-[#eae5de]" : "text-gray-600 dark:text-[#a49c90]"}`}>
          {hint}
        </p>
        {busy && (
          <button type="button" onClick={onCancel} className="h-8 px-2.5 rounded-lg text-[13px] font-semibold text-orange-700 dark:text-orange-400">
            Cancel
          </button>
        )}
      </div>
      {shown.length === 0 ? (
        <p className="py-4 px-1 text-sm text-gray-600 dark:text-[#a49c90]">No recipes found.</p>
      ) : (
        <div className="mt-1 flex-1 min-h-0 overflow-y-auto pb-3 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] lg:flex lg:flex-col gap-0.5">
          {shown.map((r) => (
            <PanelRow key={r.id} recipe={r} on={picked?.id === r.id} isNew={fresh.has(r.id)} onPick={() => onPick(r)} />
          ))}
        </div>
      )}
    </aside>
  );
}

export default function DesktopWeek({
  monday, entries, recipes, recipeList, recentIds, newIds = [], totals, handlers, onAddRecipes,
}: {
  monday: Date;
  entries: PlannerEntry[];
  recipes: Map<string, PlannerRecipe>;
  recipeList: PlannerRecipe[];
  recentIds: string[];
  newIds?: string[];
  totals: Record<number, Macros>;
  handlers: Handlers;
  onAddRecipes?: () => void;
}) {
  const [dragging, setDragging] = useState<PlannerRecipe | null>(null);
  const [picked, setPicked] = useState<PlannerRecipe | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const todayStr = new Date().toDateString();

  // Escape drops a half-made pick.
  useEffect(() => {
    if (!picked && !target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPicked(null);
        setTarget(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picked, target]);

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
    if (recipe) {
      handlers.onAddRecipe(recipe, day, meal as MealType);
      setPicked(null);
      setTarget(null);
    }
  }

  function clickSlot(day: number, meal: MealType) {
    if (picked) {
      handlers.onAddRecipe(picked, day, meal);
      setPicked(null);
      return;
    }
    setTarget(target?.day === day && target.meal === meal ? null : { day, meal });
  }

  function pickRecipe(r: PlannerRecipe) {
    if (target) {
      handlers.onAddRecipe(r, target.day, target.meal);
      setTarget(null);
      return;
    }
    setPicked(picked?.id === r.id ? null : r);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-col lg:flex-row lg:gap-5 flex-1 min-h-0">
        <div className="flex-1 min-w-0 overflow-auto">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-[72px_repeat(7,minmax(0,1fr))] gap-1.5 mb-1.5">
              <div />
              {DAY_NAMES.map((name, i) => {
                const date = dateOf(monday, i);
                const isToday = date.toDateString() === todayStr;
                const nut = totals[i];
                return (
                  <div key={name} className={`text-center rounded-xl py-1.5 ${isToday ? "bg-orange-50 dark:bg-orange-500/15" : ""}`}>
                    <span className={`text-xs font-semibold uppercase tracking-wide ${isToday ? "text-orange-700 dark:text-orange-400" : "text-gray-600 dark:text-[#a49c90]"}`}>
                      {isToday ? "Today" : name.slice(0, 3)}
                    </span>
                    <div className="text-lg font-bold leading-tight text-gray-900 dark:text-[#eae5de]">{date.getDate()}</div>
                    <div className="text-[11px] font-semibold text-gray-600 dark:text-[#a49c90]">{nut ? formatKcal(nut.kcal) : "—"}</div>
                  </div>
                );
              })}
            </div>
            {MEALS.map((meal) => (
              <div key={meal} className="grid grid-cols-[72px_repeat(7,minmax(0,1fr))] gap-1.5 mb-1.5 items-stretch">
                <div className="pt-2.5 text-[13px] font-semibold text-gray-600 dark:text-[#a49c90]">{mealLabel(meal)}</div>
                {DAY_NAMES.map((_, day) => (
                  <Slot
                    key={day}
                    day={day}
                    meal={meal}
                    entries={entries.filter((e) => e.dayOfWeek === day && e.mealType === meal).sort(byMeal)}
                    recipes={recipes}
                    handlers={handlers}
                    picked={picked}
                    target={target}
                    onSlotClick={() => clickSlot(day, meal)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <RecipePanel
          recipes={recipeList}
          recentIds={recentIds}
          newIds={newIds}
          picked={picked}
          target={target}
          onPick={pickRecipe}
          onCancel={() => { setPicked(null); setTarget(null); }}
          onAddRecipes={onAddRecipes}
        />
      </div>
      <DragOverlay>
        {dragging && (
          <div className="flex items-center gap-2.5 w-60 p-1.5 rounded-xl bg-white dark:bg-[#24211c] border border-orange-400 shadow-2xl rotate-1">
            <RecipeThumb recipe={dragging} sizes="40px" className="w-10 h-10 rounded-lg shrink-0" initialClass="text-lg" />
            <p className="text-[13px] font-semibold leading-snug line-clamp-2 text-gray-900 dark:text-[#eae5de]">{dragging.name}</p>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
