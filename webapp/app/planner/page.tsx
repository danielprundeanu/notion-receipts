"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, History, ListChecks, Loader2, Plus } from "lucide-react";
import {
  addToWeekPlan,
  getPlannerData,
  moveWeekPlanEntry,
  removeFromWeekPlan,
  updateWeekPlanServings,
} from "@/lib/actions";
import { mealLabel } from "@/lib/labels";
import { addWeeks, getMondayOf, relativeWeekTitle, shortWeekRange } from "@/lib/weeks";
import PlanHistorySheet from "@/components/PlanHistorySheet";
import { RecipeThumb } from "@/components/RecipesGrid";
import AddMealSheet from "@/components/planner/AddMealSheet";
import EntrySheet from "@/components/planner/EntrySheet";
import DesktopWeek from "@/components/planner/DesktopWeek";
import {
  DAY_NAMES,
  MEALS,
  byMeal,
  dateOf,
  dayTotals,
  formatKcal,
  type MealType,
  type PlannerEntry,
  type PlannerRecipe,
} from "@/components/planner/shared";

type Toast = { text: string; error?: boolean; undo?: () => void };
type Sheet = { kind: "add"; day: number; meal: MealType } | { kind: "entry"; id: string } | null;

export default function PlannerPage() {
  const [monday, setMonday] = useState(() => getMondayOf(new Date()));
  const [entries, setEntries] = useState<PlannerEntry[]>([]);
  const [recipeList, setRecipeList] = useState<PlannerRecipe[] | null>(null);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [loadedWeek, setLoadedWeek] = useState<string | null>(null);
  const [failedWeek, setFailedWeek] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0); // bump to refetch the week
  const [sheet, setSheet] = useState<Sheet>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const hasRecipes = useRef(false);

  const recipes = new Map((recipeList ?? []).map((r) => [r.id, r]));
  const weekIso = monday.toISOString();

  // One request per week: its entries, plus the recipe list on the first load. A
  // superseded request (weeks flicked through quickly) is ignored.
  useEffect(() => {
    let current = true;
    getPlannerData(weekIso, !hasRecipes.current)
      .then((data) => {
        if (!current) return;
        setEntries(data.entries);
        if (data.recipes) {
          hasRecipes.current = true;
          setRecipeList(data.recipes);
        }
        if (data.recentIds) setRecentIds(data.recentIds);
        setLoadedWeek(weekIso);
      })
      .catch(() => {
        if (current) setFailedWeek(weekIso);
      });
    return () => {
      current = false;
    };
  }, [weekIso, attempt]);

  const loadError = failedWeek === weekIso && loadedWeek !== weekIso;
  const loading = loadedWeek !== weekIso && !loadError;
  function reload() {
    setFailedWeek(null);
    setAttempt((a) => a + 1);
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.undo ? 5000 : 3500);
    return () => clearTimeout(t);
  }, [toast]);

  function shiftWeek(weeks: number) {
    setMonday((m) => addWeeks(m, weeks));
  }

  // ── Mutations: optimistic, rolled back with a message if the save fails (shared data) ──

  async function addEntry(recipe: PlannerRecipe, day: number, meal: MealType, servings = recipe.servings ?? 1): Promise<string> {
    const tempId = `temp-${Math.random().toString(36).slice(2)}`;
    setEntries((prev) => [...prev, { id: tempId, dayOfWeek: day, mealType: meal, servings, recipeId: recipe.id }]);
    try {
      const { id } = await addToWeekPlan({ recipeId: recipe.id, weekStartIso: weekIso, dayOfWeek: day, mealType: meal, servings });
      setEntries((prev) => prev.map((e) => (e.id === tempId ? { ...e, id } : e)));
      return id;
    } catch (err) {
      setEntries((prev) => prev.filter((e) => e.id !== tempId));
      throw err;
    }
  }

  async function removeEntry(id: string): Promise<PlannerEntry | undefined> {
    const removed = entries.find((e) => e.id === id);
    if (!removed) return;
    setEntries((prev) => prev.filter((e) => e.id !== id));
    try {
      await removeFromWeekPlan(id);
      return removed;
    } catch (err) {
      setEntries((prev) => [...prev, removed]);
      throw err;
    }
  }

  // Remove with an Undo that puts the same meal back (as a new row).
  async function removeWithUndo(id: string) {
    const recipe = recipes.get(entries.find((e) => e.id === id)?.recipeId ?? "");
    try {
      const removed = await removeEntry(id);
      if (!removed || !recipe) return;
      setToast({
        text: `Removed ${recipe.name}`,
        undo: () => {
          setToast(null);
          addEntry(recipe, removed.dayOfWeek, removed.mealType as MealType, removed.servings).catch(() =>
            setToast({ text: "Couldn't put it back. Add it again from the day.", error: true })
          );
        },
      });
    } catch {
      setToast({ text: "Couldn't remove it. Try again.", error: true });
    }
  }

  async function setServings(id: string, servings: number) {
    const before = entries.find((e) => e.id === id)?.servings;
    if (before === undefined || id.startsWith("temp-")) return;
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, servings } : e)));
    try {
      await updateWeekPlanServings(id, servings);
    } catch {
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, servings: before } : e)));
      setToast({ text: "Couldn't change the servings. Try again.", error: true });
    }
  }

  async function moveEntry(id: string, day: number, meal: MealType) {
    const before = entries.find((e) => e.id === id);
    if (!before || id.startsWith("temp-")) return;
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, dayOfWeek: day, mealType: meal } : e)));
    try {
      await moveWeekPlanEntry(id, day, meal);
    } catch {
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, dayOfWeek: before.dayOfWeek, mealType: before.mealType } : e)));
      setToast({ text: "Couldn't move it. Try again.", error: true });
    }
  }

  function openAdd(day: number, meal?: MealType) {
    // From a day card: the first meal that day doesn't have yet.
    const taken = new Set(entries.filter((e) => e.dayOfWeek === day).map((e) => e.mealType));
    setSheet({ kind: "add", day, meal: meal ?? MEALS.find((m) => !taken.has(m)) ?? "Snack" });
  }

  function jumpToDay(day: number) {
    document.getElementById(`day-${day}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Until the new week arrives, show nothing rather than last week's meals under new dates.
  const shown = loading ? [] : entries;
  const totals = dayTotals(shown, recipes);
  const weekKcal = Object.values(totals).reduce((sum, t) => sum + t.kcal, 0);
  const todayStr = new Date().toDateString();
  const isCurrentWeek = monday.getTime() === getMondayOf(new Date()).getTime();
  const sheetEntry = sheet?.kind === "entry" ? entries.find((e) => e.id === sheet.id) : undefined;
  const sheetRecipe = sheetEntry ? recipes.get(sheetEntry.recipeId) : undefined;

  const headerBtn =
    "h-11 px-3.5 rounded-[14px] border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-gray-600 dark:text-[#a49c90] flex items-center gap-2 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-[#2a2620] transition-colors";
  const navBtn = "w-11 h-11 rounded-xl flex items-center justify-center text-gray-600 dark:text-[#a49c90] hover:bg-gray-100 dark:hover:bg-[#24211c]";

  const body = loadError ? (
    <div className="py-16 text-center">
      <p className="text-[17px] font-semibold text-gray-900 dark:text-[#eae5de]">Couldn&apos;t load the plan</p>
      <p className="mt-1 text-sm text-gray-600 dark:text-[#a49c90]">Check your connection and try again.</p>
      <button
        type="button"
        onClick={reload}
        className="mt-4 h-11 px-5 rounded-xl border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-[15px] font-medium text-gray-900 dark:text-[#eae5de]"
      >
        Try again
      </button>
    </div>
  ) : null;

  return (
    <div className="md:p-6 md:h-full md:flex md:flex-col">
      {/* Header */}
      <div className="px-4 pt-4 md:p-0 md:mb-4 flex items-center justify-between gap-2">
        <h1 className="text-3xl text-gray-900 dark:text-[#eae5de]">Plan</h1>
        <div className="flex items-center gap-2">
          {!isCurrentWeek && (
            <button type="button" onClick={() => setMonday(getMondayOf(new Date()))} className={headerBtn}>
              Today
            </button>
          )}
          <button type="button" onClick={() => setHistoryOpen(true)} aria-label="History: reuse a past week" className={headerBtn}>
            <History size={18} aria-hidden /> History
          </button>
          <Link href="/grocery-list" className={`${headerBtn} hidden! md:flex!`}>
            <ListChecks size={18} aria-hidden /> {isCurrentWeek ? "Shopping list for this week" : "Shopping list"}
          </Link>
        </div>
      </div>

      {/* Week switcher (+ day strip on mobile) — sticky on mobile */}
      <div className="sticky top-0 z-20 bg-[var(--color-bg-base)] pb-3 md:static md:pb-4">
        <div className="px-2 md:px-0 pt-1.5 pb-2 flex items-center justify-between md:justify-start md:gap-2">
          <button type="button" onClick={() => shiftWeek(-1)} aria-label="Previous week" className={navBtn}>
            <ChevronLeft size={20} />
          </button>
          <div className="text-center md:min-w-56">
            <p className="text-base font-bold text-gray-900 dark:text-[#eae5de]">{relativeWeekTitle(monday)}</p>
            <p className="mt-px text-[13px] text-gray-600 dark:text-[#a49c90]">
              {shortWeekRange(monday)} · {loading ? "…" : weekKcal ? formatKcal(weekKcal) : "nothing planned"}
            </p>
          </div>
          <button type="button" onClick={() => shiftWeek(1)} aria-label="Next week" className={navBtn}>
            <ChevronRight size={20} />
          </button>
          {loading && <Loader2 size={18} aria-label="Loading" className="hidden md:block animate-spin text-gray-400" />}
        </div>
        <div className="md:hidden px-4 grid grid-cols-7 gap-1.5">
          {DAY_NAMES.map((name, i) => {
            const date = dateOf(monday, i);
            const isToday = date.toDateString() === todayStr;
            const has = shown.some((e) => e.dayOfWeek === i);
            return (
              <button
                key={name}
                type="button"
                onClick={() => jumpToDay(i)}
                aria-label={`Jump to ${name} ${date.getDate()}`}
                className={`relative h-[58px] rounded-[14px] border flex flex-col items-center justify-center gap-0.5 text-xs font-semibold ${
                  isToday
                    ? "border-orange-500 bg-orange-50 dark:bg-orange-500/15 text-orange-700 dark:text-orange-400"
                    : "border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-gray-600 dark:text-[#a49c90]"
                }`}
              >
                {name.slice(0, 3)}
                <b className="text-[17px] text-gray-900 dark:text-[#eae5de]">{date.getDate()}</b>
                {has && <span aria-hidden className="absolute bottom-1.5 w-[5px] h-[5px] rounded-full bg-orange-500" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Mobile: the whole week as an agenda ── */}
      <div className="md:hidden">
        {body ??
          (loading ? (
            <div className="space-y-3 px-4 animate-pulse" aria-busy="true" aria-label="Loading the plan">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-40 rounded-[20px] bg-gray-100 dark:bg-[#24211c]" />
              ))}
            </div>
          ) : (
            <div>
              {DAY_NAMES.map((name, i) => {
                const date = dateOf(monday, i);
                const isToday = date.toDateString() === todayStr;
                const dayEntries = shown.filter((e) => e.dayOfWeek === i).sort(byMeal);
                const kcal = totals[i]?.kcal;
                return (
                  <section
                    key={name}
                    id={`day-${i}`}
                    aria-labelledby={`day-${i}-title`}
                    className={`scroll-mt-[136px] mx-4 mb-3 rounded-[20px] border overflow-hidden bg-white dark:bg-[#24211c] ${
                      isToday ? "border-orange-500" : "border-gray-100 dark:border-[#3a352e]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 px-3.5 pt-3 pb-2.5">
                      <div className="flex items-center gap-2">
                        <h2 id={`day-${i}-title`} className="text-[17px] font-bold text-gray-900 dark:text-[#eae5de]">
                          {name} {date.getDate()}
                        </h2>
                        {isToday && <span className="px-2 py-0.5 rounded-full bg-orange-500 text-white text-xs font-bold">Today</span>}
                      </div>
                      {kcal ? <span className="text-[13px] text-gray-600 dark:text-[#a49c90]">{formatKcal(kcal)}</span> : null}
                    </div>
                    {dayEntries.map((e) => {
                      const r = recipes.get(e.recipeId);
                      if (!r) return null;
                      return (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => setSheet({ kind: "entry", id: e.id })}
                          aria-label={`${mealLabel(e.mealType)}: ${r.name}, ${e.servings} serving${e.servings === 1 ? "" : "s"}`}
                          className={`w-full min-h-[58px] flex items-center gap-3 px-3.5 py-2 border-t border-gray-100 dark:border-[#3a352e] text-left active:bg-gray-50 dark:active:bg-[#2a2620] ${
                            e.id.startsWith("temp-") ? "opacity-60" : ""
                          }`}
                        >
                          <span className="w-[70px] shrink-0 text-xs font-semibold tracking-[.03em] uppercase text-gray-500 dark:text-[#a49c90]">
                            {mealLabel(e.mealType)}
                          </span>
                          <RecipeThumb recipe={r} sizes="40px" className="w-10 h-10 rounded-[10px] shrink-0" initialClass="text-lg" />
                          <span className="flex-1 min-w-0 truncate text-[15px] font-medium text-gray-900 dark:text-[#eae5de]">{r.name}</span>
                          <span className="shrink-0 text-sm font-semibold text-gray-600 dark:text-[#a49c90]">{e.servings}×</span>
                        </button>
                      );
                    })}
                    {dayEntries.length === 0 && (
                      <p className="px-3.5 pb-3 text-sm text-gray-600 dark:text-[#a49c90]">Nothing planned yet.</p>
                    )}
                    <button
                      type="button"
                      onClick={() => openAdd(i)}
                      className="w-full h-12 flex items-center gap-2 px-3.5 border-t border-gray-100 dark:border-[#3a352e] text-[15px] font-semibold text-orange-700 dark:text-orange-400 active:bg-gray-50 dark:active:bg-[#2a2620]"
                    >
                      <Plus size={18} aria-hidden /> Add meal
                    </button>
                  </section>
                );
              })}
              <Link
                href="/grocery-list"
                className="mx-4 mt-1 mb-4 px-4 py-3.5 rounded-[18px] bg-orange-50 dark:bg-orange-500/15 text-orange-700 dark:text-orange-400 flex items-center justify-between text-[15px] font-bold"
              >
                {isCurrentWeek ? "Shopping list for this week" : "Shopping list"}
                <ChevronRight size={20} aria-hidden />
              </Link>
            </div>
          ))}
      </div>

      {/* ── Desktop: the grid ── */}
      <div className="hidden md:flex md:flex-col md:flex-1 md:min-h-0">
        {body ??
          (recipeList === null ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 size={20} className="animate-spin text-gray-400" />
            </div>
          ) : (
            <DesktopWeek
              monday={monday}
              entries={shown}
              recipes={recipes}
              recipeList={recipeList}
              recentIds={recentIds}
              totals={totals}
              handlers={{
                onAddRecipe: (r, day, meal) =>
                  addEntry(r, day, meal).catch(() => setToast({ text: "Couldn't add it. Try again.", error: true })),
                onMove: moveEntry,
                onServings: setServings,
                onRemove: removeWithUndo,
              }}
            />
          ))}
      </div>

      {toast && (
        <div
          role={toast.error ? "alert" : "status"}
          className={`fixed z-[60] left-4 right-4 md:left-auto md:right-8 md:w-96 bottom-[calc(4rem+env(safe-area-inset-bottom)+0.75rem)] md:bottom-6 flex items-center justify-between gap-2 rounded-[14px] pl-4 pr-2 py-2 min-h-12 text-[15px] font-medium shadow-lg ${
            toast.error ? "bg-red-600 text-white" : "bg-gray-900 dark:bg-[#eae5de] text-white dark:text-[#1a1714]"
          }`}
        >
          <span className="truncate">{toast.text}</span>
          {toast.undo && (
            <button type="button" onClick={toast.undo} className="h-9 px-3 rounded-[10px] font-bold shrink-0">
              Undo
            </button>
          )}
        </div>
      )}

      {sheet?.kind === "add" && recipeList && (
        <AddMealSheet
          title={`Add to ${DAY_NAMES[sheet.day]} ${dateOf(monday, sheet.day).getDate()}`}
          defaultMeal={sheet.meal}
          recipes={recipeList}
          recentIds={recentIds}
          onAdd={(r, meal) => addEntry(r, sheet.day, meal)}
          onRemove={async (id) => { await removeEntry(id); }}
          onClose={() => setSheet(null)}
        />
      )}

      {sheetEntry && sheetRecipe && (
        <EntrySheet
          entry={sheetEntry}
          recipe={sheetRecipe}
          monday={monday}
          onServings={(n) => setServings(sheetEntry.id, n)}
          onMove={(day, meal) => moveEntry(sheetEntry.id, day, meal)}
          onRemove={() => {
            setSheet(null);
            removeWithUndo(sheetEntry.id);
          }}
          onClose={() => setSheet(null)}
        />
      )}

      {historyOpen && (
        <PlanHistorySheet
          targetWeek={monday}
          targetCount={entries.length}
          onClose={() => setHistoryOpen(false)}
          onImported={(copied) => {
            setHistoryOpen(false);
            reload();
            setToast({ text: copied ? `Imported ${copied} meal${copied === 1 ? "" : "s"}.` : "That week had nothing to import." });
          }}
        />
      )}
    </div>
  );
}
