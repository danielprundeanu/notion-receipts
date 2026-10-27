"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Minus, Plus, Trash2 } from "lucide-react";
import { mealLabel } from "@/lib/labels";
import { servingsStepOf, stepServings, stepServingsDown } from "@/lib/servings";
import ServingsInput from "@/components/ServingsInput";
import { RecipeThumb } from "@/components/RecipesGrid";
import { Segmented, SheetGrabber, useSheetDrag } from "@/components/Sheet";
import { DAY_NAMES, MEALS, dateOf, type MealType, type PlannerEntry, type PlannerRecipe } from "./shared";

type Slot = { day: number; meal: MealType };

// One planned meal: change its servings, move it to another day or meal, copy it to several
// days and meals, or remove it. Servings and moves save at once; Done just closes.
export default function EntrySheet({
  entry, recipe, monday, onServings, onMove, onCopy, onRemove, onClose,
}: {
  entry: PlannerEntry;
  recipe: PlannerRecipe;
  monday: Date;
  onServings: (n: number) => void;
  onMove: (day: number, meal: MealType) => void;
  /** Adds a copy (same servings) to each slot; rejects if the save failed. */
  onCopy: (slots: Slot[]) => Promise<void>;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"move" | "copy">("move");
  const [copyDays, setCopyDays] = useState<number[]>([]);
  const [copyMeals, setCopyMeals] = useState<MealType[]>([entry.mealType as MealType]);
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const { panelRef, grabberProps } = useSheetDrag(onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Every picked day × meal, except the slot this meal already sits in.
  const slots: Slot[] = copyDays.flatMap((day) =>
    MEALS.filter((m) => copyMeals.includes(m) && !(day === entry.dayOfWeek && m === entry.mealType)).map((meal) => ({ day, meal }))
  );

  function toggle<T>(list: T[], v: T, keepOne = false): T[] {
    if (!list.includes(v)) return [...list, v];
    return keepOne && list.length === 1 ? list : list.filter((x) => x !== v);
  }

  async function copy() {
    if (slots.length === 0 || copying) return;
    setCopying(true);
    setCopyError(null);
    try {
      await onCopy(slots);
    } catch {
      setCopyError("Couldn't copy it. Try again.");
    } finally {
      setCopying(false);
    }
  }

  const step = servingsStepOf(recipe);
  const saving = entry.id.startsWith("temp-"); // not in the database yet — nothing to change
  const pillOff = "border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-gray-600 dark:text-[#a49c90]";
  const pillOn = "border-orange-500 bg-orange-500 text-gray-900";
  const stepBtn = "w-11 h-11 rounded-xl bg-gray-100 dark:bg-[#2e2a24] text-gray-800 dark:text-[#eae5de] flex items-center justify-center disabled:opacity-40";

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
        aria-labelledby="entry-title"
        className="w-full md:max-w-md bg-[var(--color-bg-base)] rounded-t-3xl md:rounded-3xl px-4 pt-2.5 shadow-xl"
        style={{ paddingBottom: "max(1.75rem, env(safe-area-inset-bottom))" }}
      >
        <SheetGrabber drag={grabberProps} className="pb-3.5" />
        <div className="flex items-center gap-3">
          <RecipeThumb recipe={recipe} sizes="56px" className="w-14 h-14 rounded-[14px] shrink-0" initialClass="text-2xl" />
          <div className="flex-1 min-w-0">
            <p id="entry-title" className="text-[17px] font-bold leading-snug text-gray-900 dark:text-[#eae5de]">{recipe.name}</p>
            <Link
              href={`/recipes/${recipe.id}`}
              className="inline-flex items-center h-8 text-sm font-semibold text-orange-700 dark:text-orange-400"
            >
              Open recipe
            </Link>
          </div>
        </div>

        <div className="mt-3.5 flex items-center justify-between">
          <span className="text-[15px] font-semibold text-gray-900 dark:text-[#eae5de]">Servings</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Fewer servings"
              disabled={saving}
              onClick={() => onServings(stepServingsDown(entry.servings, step))}
              className={stepBtn}
            >
              <Minus size={18} />
            </button>
            <ServingsInput
              value={entry.servings}
              onCommit={onServings}
              ariaLabel="Servings"
              className="w-12 h-11 text-lg font-bold text-gray-900 dark:text-[#eae5de]"
            />
            <button
              type="button"
              aria-label="More servings"
              disabled={saving}
              onClick={() => onServings(stepServings(entry.servings, 1, step))}
              className={stepBtn}
            >
              <Plus size={18} />
            </button>
          </div>
        </div>

        <Segmented
          options={[
            { value: "move", label: "Move to" },
            { value: "copy", label: "Copy to" },
          ]}
          value={mode}
          onChange={(v) => {
            if (!v) return;
            setMode(v);
            setCopyError(null);
          }}
          label="Move or copy this meal"
          className="mt-4 mb-2"
        />
        <div className="grid grid-cols-7 gap-1.5">
          {DAY_NAMES.map((name, i) => {
            const on = mode === "move" ? entry.dayOfWeek === i : copyDays.includes(i);
            const date = dateOf(monday, i).getDate();
            return (
              <button
                key={name}
                type="button"
                disabled={saving || copying}
                onClick={() => {
                  if (mode === "copy") setCopyDays((d) => toggle(d, i).sort((a, b) => a - b));
                  else if (!on) onMove(i, entry.mealType as MealType);
                }}
                aria-pressed={on}
                aria-label={`${name} ${date}`}
                className={`h-14 rounded-xl border flex flex-col items-center justify-center gap-px text-xs font-semibold transition-colors disabled:opacity-50 ${on ? pillOn : pillOff}`}
              >
                {name.slice(0, 3)}
                <b className={`text-base ${on ? "text-white" : "text-gray-900 dark:text-[#eae5de]"}`}>{date}</b>
              </button>
            );
          })}
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {MEALS.map((m) => {
            const on = mode === "move" ? entry.mealType === m : copyMeals.includes(m);
            return (
              <button
                key={m}
                type="button"
                disabled={saving || copying}
                onClick={() => {
                  if (mode === "copy") setCopyMeals((ms) => toggle(ms, m, true));
                  else if (!on) onMove(entry.dayOfWeek, m);
                }}
                aria-pressed={on}
                className={`h-11 rounded-xl border text-sm font-semibold transition-colors disabled:opacity-50 ${on ? pillOn : pillOff}`}
              >
                {mealLabel(m)}
              </button>
            );
          })}
        </div>

        {mode === "copy" ? (
          <>
            {copyError && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{copyError}</p>}
            <button
              type="button"
              disabled={saving || copying || slots.length === 0}
              onClick={copy}
              className="mt-[18px] w-full h-[52px] rounded-[14px] bg-orange-500 hover:bg-orange-600 text-white text-base font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              {copying && <Loader2 size={18} className="animate-spin" aria-hidden />}
              {slots.length === 0 ? "Pick days to copy to" : `Add ${slots.length} ${slots.length === 1 ? "copy" : "copies"}`}
            </button>
          </>
        ) : (
          <div className="mt-[18px] flex gap-2.5">
            <button
              type="button"
              disabled={saving}
              onClick={onRemove}
              className="h-[52px] px-[18px] rounded-[14px] border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-red-700 dark:text-red-400 text-[15px] font-bold flex items-center gap-2 disabled:opacity-50"
            >
              <Trash2 size={18} aria-hidden /> Remove
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-[52px] rounded-[14px] bg-orange-500 hover:bg-orange-600 text-white text-base font-bold transition-colors"
            >
              {saving ? "Saving…" : "Done"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
