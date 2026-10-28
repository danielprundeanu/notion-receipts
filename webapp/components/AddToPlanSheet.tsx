"use client";

import { useEffect, useState } from "react";
import { Loader2, Minus, Plus } from "lucide-react";
import { addToWeekPlan } from "@/lib/actions";
import { mealLabel } from "@/lib/labels";
import { stepServings, stepServingsDown } from "@/lib/servings";
import { formatWeekRange, getMondayOf } from "@/lib/weeks";
import ServingsInput from "./ServingsInput";
import { SheetGrabber, useSheetDrag } from "./Sheet";

// Stored/compared as WeekPlan.mealType — keep the English values; show mealLabel() for display.
const MEALS = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;
type Meal = (typeof MEALS)[number];
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function todayIndex(): number {
  const d = new Date().getDay();
  return d === 0 ? 6 : d - 1;
}

// Bottom sheet: pick this week or next, one or more days, a meal and the servings, then add.
// Several days at once covers a batch eaten over the week.
export default function AddToPlanSheet({
  recipe, servings: initialServings, step, onClose, onAdded,
}: {
  recipe: { id: string; category: string | null };
  servings: number;
  step: number;
  onClose: () => void;
  onAdded: (summary: string) => void;
}) {
  const thisMonday = getMondayOf(new Date());
  const [nextWeek, setNextWeek] = useState(false);
  const [days, setDays] = useState<number[]>([todayIndex()]);
  // Default to the recipe's own meal type when it has one.
  const firstMeal = MEALS.find((m) => (recipe.category ?? "").split(",").map((c) => c.trim()).includes(m));
  const [meal, setMeal] = useState<Meal>(firstMeal ?? "Dinner");
  const [servings, setServings] = useState(initialServings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { panelRef, grabberProps } = useSheetDrag(onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const monday = new Date(thisMonday);
  if (nextWeek) monday.setDate(monday.getDate() + 7);

  function pickWeek(next: boolean) {
    setNextWeek(next);
    setDays([next ? 0 : todayIndex()]);
  }

  function toggleDay(i: number) {
    setDays((prev) => (prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i].sort((a, b) => a - b)));
  }

  const dateOf = (i: number) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  };
  const dayLabel = days.length === 1
    ? `${DAY_NAMES[days[0]].slice(0, 3)} ${dateOf(days[0]).getDate()}`
    : `${days.length} days`;

  async function handleAdd() {
    if (days.length === 0) return;
    setSaving(true);
    setError(null);
    let added = 0;
    try {
      // One at a time: Next runs server actions sequentially anyway, and a failure then
      // says exactly how far it got.
      for (const day of days) {
        await addToWeekPlan({
          recipeId: recipe.id,
          weekStartIso: monday.toISOString(),
          dayOfWeek: day,
          mealType: meal,
          servings,
        });
        added++;
      }
      onAdded(
        days.length === 1
          ? `Added to ${DAY_NAMES[days[0]]} · ${mealLabel(meal)}`
          : `Added to ${days.length} days · ${mealLabel(meal)}`
      );
    } catch {
      setError(
        added > 0
          ? `Added ${added} of ${days.length} days, then it failed. Check the plan before trying again.`
          : "Couldn't add to the plan. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  const seg = "flex-1 h-10 rounded-[10px] text-[15px] font-semibold transition-colors";
  const pill = "h-11 rounded-xl border text-sm font-semibold transition-colors";
  const pillOff = "border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-gray-600 dark:text-[#a49c90]";
  const pillOn = "bg-orange-100 border-orange-300 text-orange-800 dark:bg-orange-500/15 dark:border-orange-500/50 dark:text-orange-300";
  const stepBtn = "w-11 h-11 rounded-xl bg-gray-100 dark:bg-[#2e2a24] text-gray-800 dark:text-[#eae5de] flex items-center justify-center";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 dark:bg-black/60 flex flex-col justify-end md:items-center md:justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-to-plan-title"
        className="bg-[var(--color-bg-base)] rounded-t-3xl md:rounded-3xl w-full md:max-w-md px-4 pt-2.5 shadow-xl"
        style={{ paddingBottom: "max(1.75rem, env(safe-area-inset-bottom))" }}
      >
        <SheetGrabber drag={grabberProps} className="pb-3.5" />
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="add-to-plan-title" className="text-xl font-bold text-gray-900 dark:text-[#eae5de]">Add to plan</h2>
          <span className="text-sm text-gray-600 dark:text-[#a49c90]">{formatWeekRange(monday)}</span>
        </div>

        <div className="mt-3 flex gap-1 p-1 rounded-[14px] bg-white dark:bg-[#24211c] border border-gray-100 dark:border-transparent">
          {([false, true] as const).map((next) => (
            <button
              key={String(next)}
              type="button"
              onClick={() => pickWeek(next)}
              aria-pressed={nextWeek === next}
              className={`${seg} ${
                nextWeek === next ? "bg-gray-100 dark:bg-[#2e2a24] text-gray-900 dark:text-[#eae5de]" : "text-gray-600 dark:text-[#a49c90]"
              }`}
            >
              {next ? "Next week" : "This week"}
            </button>
          ))}
        </div>

        <p className="mt-4 mb-2 text-[13px] font-semibold text-gray-600 dark:text-[#a49c90]">Days</p>
        <div className="grid grid-cols-7 gap-1.5">
          {DAY_NAMES.map((name, i) => {
            const on = days.includes(i);
            const date = dateOf(i);
            return (
              <button
                key={name}
                type="button"
                onClick={() => toggleDay(i)}
                aria-pressed={on}
                aria-label={`${name} ${date.getDate()}`}
                className={`h-14 rounded-xl border flex flex-col items-center justify-center gap-px text-xs font-semibold transition-colors ${on ? pillOn : pillOff}`}
              >
                {name.slice(0, 3)}
                <b className={`text-base ${on ? "" : "text-gray-900 dark:text-[#eae5de]"}`}>{date.getDate()}</b>
              </button>
            );
          })}
        </div>

        <p className="mt-4 mb-2 text-[13px] font-semibold text-gray-600 dark:text-[#a49c90]">Meal</p>
        <div className="grid grid-cols-4 gap-1.5">
          {MEALS.map((m) => (
            <button key={m} type="button" onClick={() => setMeal(m)} aria-pressed={meal === m} className={`${pill} ${meal === m ? pillOn : pillOff}`}>
              {mealLabel(m)}
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-[15px] font-semibold text-gray-900 dark:text-[#eae5de]">Servings</span>
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Fewer servings" onClick={() => setServings((s) => stepServingsDown(s, step))} className={stepBtn}>
              <Minus size={18} />
            </button>
            <ServingsInput
              value={servings}
              onCommit={setServings}
              ariaLabel="Servings to plan"
              className="w-12 h-11 text-lg font-bold text-gray-900 dark:text-[#eae5de]"
            />
            <button type="button" aria-label="More servings" onClick={() => setServings((s) => stepServings(s, 1, step))} className={stepBtn}>
              <Plus size={18} />
            </button>
          </div>
        </div>

        {error && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <button
          type="button"
          onClick={handleAdd}
          disabled={saving || days.length === 0}
          className="mt-4 w-full h-[54px] rounded-[14px] bg-orange-500 text-gray-900 text-base font-bold flex items-center justify-center gap-2 hover:bg-orange-600 disabled:opacity-50 transition-colors"
        >
          {saving && <Loader2 size={18} className="animate-spin" />}
          {days.length === 0 ? "Pick a day" : `Add to ${dayLabel} · ${mealLabel(meal)}`}
        </button>
      </div>
    </div>
  );
}
