"use client";

import Link from "next/link";
import { useState, useTransition, useEffect, useRef } from "react";
import {
  ChevronLeft,
  Star,
  Pencil,
  Minus,
  Plus,
  CalendarPlus,
  ChefHat,
  Check,
  ChevronRight,
  ArrowUpRight,
  Link2,
  PieChart,
} from "lucide-react";
import { toggleFavorite, getRecipeWeekPlanServings, type RecipeRefGroup } from "@/lib/actions";
import ShareButton from "@/components/ShareButton";
import RecipeCover from "@/components/RecipeCover";
import AddToPlanSheet from "@/components/AddToPlanSheet";
import MacrosSheet from "@/components/MacrosSheet";
import ServingsInput from "@/components/ServingsInput";
import { categoryLabel, difficultyLabel } from "@/lib/labels";
import { ingredientGrams } from "@/lib/nutrition";
import { formatAmount, kitchenFraction } from "@/lib/quantities";
import { roundServings, servingsStepOf, stepServings, stepServingsDown } from "@/lib/servings";
import { getMondayOf } from "@/lib/weeks";

export type RecipeData = {
  id: string;
  name: string;
  servings: number | null;
  servingsStep?: number | null;
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
  // Other recipes used in this one, shown as expandable groups.
  refGroups?: RecipeRefGroup[];
  instructions: Array<{
    id: string;
    step: number;
    text: string;
    isSection: boolean;
    instrType?: string | null;
  }>;
};

// "300 g" / "½ serving" — how much of a referenced recipe goes in.
function formatRefQty(qty: number, unit: string, scale: number): string {
  if (unit === "g") return `${formatAmount(qty * scale, "g")} g`;
  const n = qty * scale;
  return `${kitchenFraction(n)} ${n > 0 && n <= 1 ? "serving" : "servings"}`;
}

// 40 → "40 min", 180 → "3 h", 90 → "1 h 30".
function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m}` : `${h} h`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function thisWeekIso(): string {
  return getMondayOf(new Date()).toISOString();
}

const BATCHES: [number, string][] = [[0.5, "½ batch"], [1, "1 batch"], [2, "2 batches"]];

export default function RecipeDetail({ recipe }: { recipe: RecipeData }) {
  const defaultServings = recipe.servings ?? 1;
  const isBatch = defaultServings > 1;
  const servingsStep = servingsStepOf(recipe);
  const [servings, setServings] = useState(defaultServings);
  const scale = defaultServings > 0 ? servings / defaultServings : 1;
  const [isFavorite, setIsFavorite] = useState(recipe.favorite);
  const [, startTransition] = useTransition();
  const [tab, setTab] = useState<"ing" | "steps">("ing");
  const [cook, setCook] = useState(false);
  const [screenKeptOn, setScreenKeptOn] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const [showMacros, setShowMacros] = useState(false);
  const [plannerServings, setPlannerServings] = useState(0);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [doneSteps, setDoneSteps] = useState<Set<string>>(new Set());
  const [expandedRefs, setExpandedRefs] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ text: string; planLink: boolean } | null>(null);
  const [heroBroken, setHeroBroken] = useState(false);
  const tabsAnchorRef = useRef<HTMLDivElement>(null);
  const refGroups = recipe.refGroups ?? [];

  function toggleIn(set: Set<string>, id: string): Set<string> {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  useEffect(() => {
    getRecipeWeekPlanServings(recipe.id, thisWeekIso()).then(setPlannerServings).catch(() => {});
  }, [recipe.id]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Cook mode keeps the screen on. The browser drops the lock whenever the page is hidden,
  // so it's taken again on every return to the page.
  useEffect(() => {
    if (!cook || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let active = true;
    const acquire = () => {
      navigator.wakeLock
        .request("screen")
        .then((l) => {
          if (!active) { l.release().catch(() => {}); return; }
          lock = l;
          setScreenKeptOn(true);
        })
        .catch(() => { if (active) setScreenKeptOn(false); });
    };
    const onVisible = () => { if (document.visibilityState === "visible") acquire(); };
    acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, [cook]);

  // Entering cook mode jumps straight to the steps, wherever the page was scrolled.
  function toggleCook() {
    if (cook) {
      setCook(false);
      setScreenKeptOn(false);
    } else {
      setCook(true);
      selectTab("steps", true);
    }
  }

  // Switching tabs while scrolled into the content brings the new tab's start into view
  // instead of landing mid-way down it.
  function selectTab(next: "ing" | "steps", always = false) {
    setTab(next);
    requestAnimationFrame(() => {
      const anchor = tabsAnchorRef.current;
      if (anchor && (always || anchor.getBoundingClientRect().top < 0)) {
        anchor.scrollIntoView({ block: "start", behavior: always ? "smooth" : "auto" });
      }
    });
  }

  function handleToggleFavorite() {
    const next = !isFavorite;
    setIsFavorite(next);
    startTransition(async () => {
      try {
        await toggleFavorite(recipe.id, next);
      } catch {
        setIsFavorite(!next); // rollback — the toggle didn't persist
        setToast({ text: "Couldn't update favorites. Try again.", planLink: false });
      }
    });
  }

  // ── Ingredient groups ──
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

  // ── Nutrition for the whole batch (as stored), then per serving ──
  let totalKcal = 0, totalCarbs = 0, totalFat = 0, totalProtein = 0;
  let hasNutrition = false;
  const addNutrition = (
    quantity: number,
    unit: string | null,
    gi: NonNullable<RecipeData["ingredients"][number]["groceryItem"]>
  ) => {
    // Skip only items with no macro data at all — an item with just carbs/fat
    // (no kcal) still contributes and must not be dropped from the totals.
    if (!gi.kcal && !gi.carbs && !gi.fat && !gi.protein) return;
    const grams = ingredientGrams(quantity, unit, gi);
    if (grams == null) return;
    hasNutrition = true;
    const factor = grams / 100;
    totalKcal += (gi.kcal ?? 0) * factor;
    totalCarbs += (gi.carbs ?? 0) * factor;
    totalFat += (gi.fat ?? 0) * factor;
    totalProtein += (gi.protein ?? 0) * factor;
  };
  for (const ing of recipe.ingredients) {
    if (ing.groceryItem && ing.quantity) addNutrition(ing.quantity, ing.unit, ing.groceryItem);
  }
  // Referenced recipes count too, scaled by how much of each goes in.
  for (const ref of refGroups) {
    if (ref.factor <= 0) continue;
    for (const ing of ref.ingredients) {
      if (ing.groceryItem && ing.quantity) addNutrition(ing.quantity * ref.factor, ing.unit, ing.groceryItem);
    }
  }
  const perServing = (total: number) => Math.round(total / defaultServings);

  // Ingredient groups and referenced recipes, interleaved by groupOrder.
  type Section =
    | { kind: "group"; order: number; group: GroupEntry }
    | { kind: "ref"; order: number; ref: RecipeRefGroup };
  const sections: Section[] = [
    ...sortedGroups.map(([order, group]) => ({ kind: "group" as const, order, group })),
    ...refGroups.map((ref) => ({ kind: "ref" as const, order: ref.groupOrder, ref })),
  ].sort((a, b) => a.order - b.order);
  const showGroupHeaders = sections.length > 1;
  const ingredientCount = recipe.ingredients.length + refGroups.length;
  const stepCount = recipe.instructions.filter((i) => !i.isSection).length;

  const categories = (recipe.category ?? "").split(",").map((c) => c.trim()).filter(Boolean);
  const stats = [
    hasNutrition && { label: "Per serving", value: `${perServing(totalKcal)} kcal`, onClick: () => setShowMacros(true) },
    recipe.time && { label: "Total time", value: formatMinutes(recipe.time) },
    recipe.difficulty && { label: "Difficulty", value: difficultyLabel(recipe.difficulty) },
  ].filter((s): s is { label: string; value: string; onClick?: () => void } => Boolean(s));
  const statCols = ["", "grid-cols-1", "grid-cols-2", "grid-cols-3"][stats.length];

  const heroSrc = recipe.imageUrl && (recipe.imageUrl.startsWith("/") || recipe.imageUrl.startsWith("http")) && !heroBroken
    ? recipe.imageUrl
    : null;

  function renderIngredient(
    key: string,
    quantity: number | null,
    unit: string | null,
    name: string | null | undefined,
    notes: string | null,
  ) {
    const on = checked.has(key);
    const amount = quantity != null ? formatAmount(quantity * scale, unit) : null;
    return (
      <li key={key}>
        <button
          type="button"
          onClick={() => setChecked((prev) => toggleIn(prev, key))}
          aria-pressed={on}
          className="w-full flex items-start gap-3.5 py-3 border-b border-gray-100 dark:border-[#2e2a24] text-left"
        >
          <span
            aria-hidden
            className={`mt-0.5 w-6 h-6 shrink-0 rounded-lg border-2 flex items-center justify-center transition-colors ${
              on ? "bg-orange-500 border-orange-500 text-white" : "border-gray-300 dark:border-[#3a352e]"
            }`}
          >
            {on && <Check size={14} strokeWidth={3} />}
          </span>
          <span
            className={`${cook ? "text-xl" : "text-[17px]"} leading-snug text-gray-800 dark:text-[#d8d0c4] transition-opacity ${
              on ? "opacity-45 line-through" : ""
            }`}
          >
            {amount && (
              <b className="font-bold text-gray-900 dark:text-[#eae5de]">
                {amount}
                {unit && unit !== "piece" ? ` ${unit}` : ""}
              </b>
            )}{" "}
            {name ?? "—"}
            {notes && <span className="text-gray-500 dark:text-[#8f877b]">, {notes}</span>}
          </span>
        </button>
      </li>
    );
  }

  let stepNo = 0;
  const heroBtn = "w-11 h-11 rounded-full flex items-center justify-center transition-colors";
  const heroBtnTone = heroSrc
    ? "bg-black/55 text-white hover:bg-black/70"
    : "bg-white dark:bg-[#24211c] border border-gray-200 dark:border-[#3a352e] text-gray-800 dark:text-[#eae5de] hover:bg-gray-50 dark:hover:bg-[#2a2620]";
  const stepBtn = "w-11 h-11 rounded-xl bg-gray-100 dark:bg-[#2e2a24] text-gray-800 dark:text-[#eae5de] flex items-center justify-center";

  return (
    // At least a screen tall, so on a short recipe the action bar still sits at the bottom
    // instead of mid-screen.
    <div className="max-w-4xl mx-auto md:p-8 flex flex-col min-h-[100dvh] md:min-h-0">
      {/* ── Hero: cover photo with the actions on top (or the actions alone) ── */}
      <div className={heroSrc ? "relative h-[250px] md:h-80 md:rounded-2xl overflow-hidden bg-gray-100 dark:bg-[#2e2a24]" : ""}>
        {heroSrc && (
          <RecipeCover
            src={heroSrc}
            alt={recipe.name}
            sizes="(max-width: 896px) 100vw, 896px"
            loading="eager"
            onError={() => setHeroBroken(true)}
          />
        )}
        <div
          className={`${heroSrc ? "absolute inset-x-0 top-0" : ""} flex items-center justify-between px-3.5 md:px-4 pb-3.5`}
          style={{ paddingTop: "max(0.875rem, env(safe-area-inset-top))" }}
        >
          <Link href="/recipes" aria-label="Back to recipes" className={`${heroBtn} ${heroBtnTone}`}>
            <ChevronLeft size={22} />
          </Link>
          <div className="flex items-center gap-2">
            <ShareButton id={recipe.id} name={recipe.name} className={`${heroBtn} ${heroBtnTone}`} iconSize={20} />
            <Link href={`/recipes/${recipe.id}/edit`} aria-label="Edit recipe" className={`${heroBtn} ${heroBtnTone}`}>
              <Pencil size={19} />
            </Link>
            <button
              type="button"
              onClick={handleToggleFavorite}
              aria-pressed={isFavorite}
              aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
              className={`${heroBtn} ${heroBtnTone}`}
            >
              <Star size={20} className={isFavorite ? "fill-orange-300 text-orange-300" : ""} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Title, stats, servings ── */}
      <div className={`px-4 md:px-0 ${heroSrc ? "pt-[18px]" : "pt-1"}`}>
        {categories.length > 0 && (
          <p className="mb-1.5 text-[13px] font-semibold tracking-[.04em] uppercase text-orange-600 dark:text-orange-400">
            {categories.map((c) => categoryLabel(c)).join(" · ")}
          </p>
        )}
        <h1 className="text-[30px] leading-[1.12] text-gray-900 dark:text-[#eae5de]">{recipe.name}</h1>

        {stats.length > 0 && (
          <div className={`mt-3.5 grid ${statCols} gap-2`}>
            {stats.map((s) => {
              const body = (
                <>
                  <p className="text-xs text-gray-600 dark:text-[#a49c90]">{s.label}</p>
                  <p className="mt-0.5 text-[17px] font-bold text-gray-900 dark:text-[#eae5de]">{s.value}</p>
                </>
              );
              const tile = "px-3 py-2.5 rounded-[14px] bg-white dark:bg-[#24211c] border border-gray-100 dark:border-transparent";
              return s.onClick ? (
                <button
                  key={s.label}
                  type="button"
                  onClick={s.onClick}
                  aria-label={`${s.value} per serving — show macronutrients`}
                  className={`${tile} text-left flex items-center justify-between gap-2 hover:border-orange-300 dark:hover:bg-[#2e2a24] transition-colors`}
                >
                  <div className="min-w-0">{body}</div>
                  <PieChart size={16} className="shrink-0 text-orange-500" aria-hidden />
                </button>
              ) : (
                <div key={s.label} className={tile}>{body}</div>
              );
            })}
          </div>
        )}

        <div className="mt-3 p-3 pl-3.5 rounded-2xl border border-gray-200 dark:border-[#3a352e]">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-gray-900 dark:text-[#eae5de]">Servings</p>
              {isBatch ? (
                <p className="mt-0.5 text-[13px] text-gray-600 dark:text-[#a49c90]">
                  1 batch = {defaultServings} servings
                  {servings !== defaultServings && ` · making ${kitchenFraction(scale)} ${scale > 1 ? "batches" : "batch"}`}
                </p>
              ) : servings !== defaultServings ? (
                <button
                  type="button"
                  onClick={() => setServings(defaultServings)}
                  className="mt-0.5 text-[13px] text-orange-700 dark:text-orange-400 underline-offset-2 hover:underline"
                >
                  Reset to {defaultServings}
                </button>
              ) : null}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                aria-label="Fewer servings"
                onClick={() => setServings((s) => stepServingsDown(s, servingsStep))}
                className={stepBtn}
              >
                <Minus size={18} />
              </button>
              <ServingsInput
                value={servings}
                onCommit={setServings}
                className="w-12 h-11 text-lg font-bold text-gray-900 dark:text-[#eae5de]"
              />
              <button
                type="button"
                aria-label="More servings"
                onClick={() => setServings((s) => stepServings(s, 1, servingsStep))}
                className={stepBtn}
              >
                <Plus size={18} />
              </button>
            </div>
          </div>
          {isBatch && (
            <div className="mt-2.5 flex gap-1.5">
              {BATCHES.map(([factor, label]) => {
                const target = roundServings(defaultServings * factor);
                const on = servings === target;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setServings(target)}
                    aria-pressed={on}
                    className={`flex-1 h-10 rounded-[10px] border text-sm font-semibold transition-colors ${
                      on
                        ? "bg-orange-50 dark:bg-orange-500/15 border-orange-500 text-orange-700 dark:text-orange-400"
                        : "border-gray-200 dark:border-[#3a352e] text-gray-600 dark:text-[#a49c90]"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
          {plannerServings > 0 && plannerServings !== servings && (
            <button
              type="button"
              onClick={() => setServings(plannerServings)}
              className="mt-2 min-h-10 inline-flex items-center gap-1.5 text-sm font-medium text-orange-700 dark:text-orange-400"
            >
              <CalendarPlus size={15} aria-hidden /> Use this week&apos;s plan · {plannerServings} servings
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs (mobile); side by side from lg up ── */}
      <div ref={tabsAnchorRef} aria-hidden />
      <div className="sticky top-0 z-20 bg-[var(--color-bg-base)] px-4 md:px-0 pt-3 pb-2.5 lg:hidden">
        <div role="tablist" aria-label="Recipe" className="flex gap-1 p-1 rounded-[14px] bg-white dark:bg-[#24211c] border border-gray-100 dark:border-transparent">
          {([["ing", `Ingredients · ${ingredientCount}`], ["steps", `Steps · ${stepCount}`]] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`tab-${key}`}
              aria-selected={tab === key}
              aria-controls={`panel-${key}`}
              onClick={() => selectTab(key)}
              className={`flex-1 h-10 rounded-[10px] text-[15px] font-semibold transition-colors ${
                tab === key ? "bg-gray-100 dark:bg-[#2e2a24] text-gray-900 dark:text-[#eae5de]" : "text-gray-600 dark:text-[#a49c90]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {cook && (
        <div className="mx-4 md:mx-0 mb-1.5 lg:mt-4 flex items-center justify-between gap-2 rounded-[14px] bg-orange-50 dark:bg-orange-500/15 pl-3.5 pr-2 py-1.5">
          <span className="text-sm font-semibold text-orange-700 dark:text-orange-400">
            Cook mode{screenKeptOn ? " · screen stays on" : ""}
          </span>
          <button type="button" onClick={toggleCook} className="h-9 px-3 rounded-[10px] text-sm font-semibold text-orange-700 dark:text-orange-400">
            Exit
          </button>
        </div>
      )}

      <div className="px-4 md:px-0 lg:mt-6 lg:grid lg:grid-cols-5 lg:gap-10">
        {/* Ingredients */}
        <section
          id="panel-ing"
          role="tabpanel"
          aria-labelledby="tab-ing"
          className={`lg:col-span-2 ${tab === "ing" ? "" : "hidden lg:block"}`}
        >
          <h2 className="hidden lg:block text-lg font-semibold text-gray-900 dark:text-[#eae5de] mb-1">Ingredients</h2>
          {sections.length === 0 ? (
            <p className="py-3 text-sm text-gray-500 dark:text-[#8f877b]">No ingredients</p>
          ) : (
            <div className="space-y-4">
              {sections.map((sec) => {
                if (sec.kind === "group") {
                  const group = sec.group;
                  return (
                    <div key={`g-${sec.order}`}>
                      {(showGroupHeaders || group.name) && (
                        <h3 className="mt-3 text-[13px] font-semibold tracking-[.04em] uppercase text-gray-500 dark:text-[#a49c90]">
                          {group.name ?? `Part ${sec.order}`}
                        </h3>
                      )}
                      <ul>
                        {group.items.map((ing) =>
                          renderIngredient(ing.id, ing.quantity, ing.unit, ing.groceryItem?.name, ing.notes)
                        )}
                      </ul>
                    </div>
                  );
                }
                const ref = sec.ref;
                const open = expandedRefs.has(ref.id);
                return (
                  <div key={`r-${ref.id}`} className="mt-3 rounded-2xl border border-orange-200 dark:border-orange-900/50 bg-orange-50/50 dark:bg-orange-950/10">
                    <div className="flex items-center gap-1 pr-1">
                      <button
                        type="button"
                        onClick={() => setExpandedRefs((prev) => toggleIn(prev, ref.id))}
                        aria-expanded={open}
                        className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2.5 text-left"
                      >
                        <ChevronRight size={16} className={`shrink-0 text-orange-500 transition-transform ${open ? "rotate-90" : ""}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-base font-semibold text-gray-900 dark:text-[#eae5de] truncate">{ref.name}</span>
                          <span className="block text-xs text-gray-500 dark:text-[#8f877b]">
                            Recipe · {ref.ingredients.length} ingredient{ref.ingredients.length === 1 ? "" : "s"}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-semibold text-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-950/50 px-2 py-0.5 rounded-full">
                          {formatRefQty(ref.quantity, ref.unit, scale)}
                        </span>
                      </button>
                      <Link
                        href={`/recipes/${ref.refRecipeId}`}
                        aria-label={`Open ${ref.name}`}
                        className="shrink-0 w-10 h-10 flex items-center justify-center rounded-lg text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-950/40 transition-colors"
                      >
                        <ArrowUpRight size={18} />
                      </Link>
                    </div>
                    {open && (
                      <div className="px-3 pb-1 border-t border-orange-100 dark:border-orange-900/40">
                        {ref.factor <= 0 ? (
                          <p className="py-2.5 text-sm text-amber-700 dark:text-amber-400">
                            Can&apos;t work out {formatRefQty(ref.quantity, ref.unit, 1)} of this recipe — none of its ingredients have a weight in grams. Use servings instead.
                          </p>
                        ) : ref.ingredients.length === 0 ? (
                          <p className="py-2.5 text-sm text-gray-500 dark:text-[#8f877b]">No ingredients</p>
                        ) : (
                          <ul>
                            {ref.ingredients.map((ing) =>
                              renderIngredient(
                                `${ref.id}:${ing.id}`,
                                ing.quantity != null ? ing.quantity * ref.factor : null,
                                ing.unit,
                                ing.groceryItem?.name,
                                ing.notes,
                              )
                            )}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {hasNutrition && (
            <p className="mt-3.5 text-[13px] text-gray-600 dark:text-[#a49c90]">
              Per serving: {perServing(totalKcal)} kcal · {perServing(totalCarbs)} g carbs · {perServing(totalFat)} g fat ·{" "}
              {perServing(totalProtein)} g protein
            </p>
          )}
        </section>

        {/* Steps */}
        <section
          id="panel-steps"
          role="tabpanel"
          aria-labelledby="tab-steps"
          className={`lg:col-span-3 ${tab === "steps" ? "" : "hidden lg:block"}`}
        >
          <h2 className="hidden lg:block text-lg font-semibold text-gray-900 dark:text-[#eae5de] mb-1">Steps</h2>
          {stepCount === 0 ? (
            <p className="py-3 text-sm text-gray-500 dark:text-[#8f877b]">No instructions yet</p>
          ) : (
            recipe.instructions.map((inst) => {
              if (inst.isSection) {
                // Section headers already used as ingredient group names would repeat here.
                if (sectionHeaders.includes(inst.text)) return null;
                return (
                  <h3 key={inst.id} className="mt-3.5 text-[13px] font-semibold tracking-[.04em] uppercase text-gray-500 dark:text-[#a49c90]">
                    {inst.text}
                  </h3>
                );
              }
              const textCls = `${cook ? "text-[23px] leading-normal" : "text-lg leading-relaxed"} text-gray-800 dark:text-[#d8d0c4]`;
              const type = inst.instrType ?? "numbered";
              if (type === "plain") {
                return <p key={inst.id} className={`py-2 ${textCls}`}>{inst.text}</p>;
              }
              const done = doneSteps.has(inst.id);
              const n = type === "bullet" ? null : ++stepNo;
              return (
                <button
                  key={inst.id}
                  type="button"
                  onClick={() => setDoneSteps((prev) => toggleIn(prev, inst.id))}
                  aria-pressed={done}
                  className="w-full flex gap-3.5 py-3 text-left"
                >
                  <span
                    aria-hidden={n === null}
                    className={`shrink-0 rounded-full flex items-center justify-center font-bold transition-colors ${
                      n === null ? "w-[30px] h-[30px] text-xl" : "w-[30px] h-[30px] text-[15px]"
                    } ${
                      done
                        ? "bg-orange-500 text-white"
                        : n === null
                          ? "text-gray-400 dark:text-[#8f877b]"
                          : "bg-orange-50 dark:bg-orange-500/15 text-orange-700 dark:text-orange-400"
                    }`}
                  >
                    {n ?? "•"}
                  </span>
                  <span className={`${textCls} transition-opacity ${done ? "opacity-45" : ""}`}>{inst.text}</span>
                </button>
              );
            })
          )}
        </section>
      </div>

      {/* ── Source + date ── */}
      <div className="px-4 md:px-0 pt-5">
        {recipe.link && (
          <a
            href={recipe.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 min-h-14 px-3.5 py-2 rounded-[14px] bg-white dark:bg-[#24211c] border border-gray-200 dark:border-[#3a352e] hover:border-orange-300 dark:hover:border-orange-800 transition-colors"
          >
            <Link2 size={18} aria-hidden className="shrink-0 text-orange-600 dark:text-orange-400" />
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] text-gray-600 dark:text-[#a49c90]">Original recipe</span>
              <span className="block text-[15px] font-semibold text-orange-700 dark:text-orange-400 truncate">{hostOf(recipe.link)}</span>
            </span>
            <ArrowUpRight size={16} aria-hidden className="shrink-0 text-orange-600 dark:text-orange-400" />
          </a>
        )}
        <p className="mt-3 text-xs text-gray-500 dark:text-[#8f877b]">
          Added {new Date(recipe.createdAt).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      <div className="flex-1" aria-hidden />

      {/* ── Action bar: the bottom of the screen on mobile (the page has no tabs) ── */}
      <div className="sticky z-30 bottom-0 mt-5 flex gap-2.5 px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] border-t border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] md:rounded-2xl md:border">
        <button
          type="button"
          onClick={toggleCook}
          aria-pressed={cook}
          className={`h-[52px] px-4 rounded-[14px] border flex items-center gap-2 text-[15px] font-semibold transition-colors ${
            cook
              ? "bg-orange-100 dark:bg-orange-500/15 border-transparent text-orange-700 dark:text-orange-400"
              : "bg-white dark:bg-[#24211c] border-gray-200 dark:border-[#3a352e] text-gray-700 dark:text-[#a49c90]"
          }`}
        >
          <ChefHat size={20} aria-hidden /> Cook
        </button>
        <button
          type="button"
          onClick={() => { setToast(null); setShowPlan(true); }}
          className="flex-1 h-[52px] rounded-[14px] bg-orange-100 hover:bg-orange-200 dark:bg-orange-500/15 dark:hover:bg-orange-500/25 text-orange-700 dark:text-orange-400 text-base font-bold flex items-center justify-center gap-2 transition-colors"
        >
          <CalendarPlus size={20} aria-hidden /> Add to plan
        </button>
      </div>

      {toast && (
        <div
          role="status"
          className="fixed z-40 left-4 right-4 md:left-auto md:right-8 md:w-96 bottom-[calc(4.875rem+1px+max(0.625rem,env(safe-area-inset-bottom)))] md:bottom-28 flex items-center justify-between gap-2 rounded-[14px] bg-gray-900 dark:bg-[#eae5de] text-white dark:text-[#1a1714] pl-4 pr-2 py-2 text-[15px] font-medium shadow-lg"
        >
          <span>{toast.text}</span>
          {toast.planLink && (
            <Link href="/planner" className="h-9 px-3 rounded-[10px] flex items-center font-bold">
              View plan
            </Link>
          )}
        </div>
      )}

      {showMacros && (
        <MacrosSheet
          kcal={totalKcal / defaultServings}
          carbs={totalCarbs / defaultServings}
          fat={totalFat / defaultServings}
          protein={totalProtein / defaultServings}
          onClose={() => setShowMacros(false)}
        />
      )}

      {showPlan && (
        <AddToPlanSheet
          recipe={recipe}
          servings={servings}
          step={servingsStep}
          onClose={() => setShowPlan(false)}
          onAdded={(text) => {
            setShowPlan(false);
            setToast({ text, planLink: true });
            getRecipeWeekPlanServings(recipe.id, thisWeekIso()).then(setPlannerServings).catch(() => {});
          }}
        />
      )}
    </div>
  );
}
