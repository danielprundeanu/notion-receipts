"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Minus, Plus, Trash2 } from "lucide-react";
import { mealLabel } from "@/lib/labels";
import { servingsStepOf, stepServings, stepServingsDown } from "@/lib/servings";
import ServingsInput from "@/components/ServingsInput";
import { RecipeThumb } from "@/components/RecipesGrid";
import { DAY_NAMES, MEALS, dateOf, type MealType, type PlannerEntry, type PlannerRecipe } from "./shared";

// One planned meal: change its servings, move it to another day or meal, or remove it.
// Every change saves at once; Done just closes.
export default function EntrySheet({
  entry, recipe, monday, onServings, onMove, onRemove, onClose,
}: {
  entry: PlannerEntry;
  recipe: PlannerRecipe;
  monday: Date;
  onServings: (n: number) => void;
  onMove: (day: number, meal: MealType) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const step = servingsStepOf(recipe);
  const saving = entry.id.startsWith("temp-"); // not in the database yet — nothing to change
  const pillOff = "border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-gray-600 dark:text-[#a49c90]";
  const pillOn = "border-orange-500 bg-orange-500 text-white";
  const stepBtn = "w-11 h-11 rounded-xl bg-gray-100 dark:bg-[#2e2a24] text-gray-800 dark:text-[#eae5de] flex items-center justify-center disabled:opacity-40";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 dark:bg-black/60 flex flex-col justify-end md:items-center md:justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="entry-title"
        className="w-full md:max-w-md bg-[var(--color-bg-base)] rounded-t-3xl md:rounded-3xl px-4 pt-2.5 shadow-xl"
        style={{ paddingBottom: "max(1.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="w-10 h-[5px] rounded-full bg-gray-200 dark:bg-[#3a352e] mx-auto mb-3.5 md:hidden" aria-hidden />
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

        <p className="mt-4 mb-2 text-[13px] font-semibold text-gray-600 dark:text-[#a49c90]">Move to</p>
        <div className="grid grid-cols-7 gap-1.5">
          {DAY_NAMES.map((name, i) => {
            const on = entry.dayOfWeek === i;
            const date = dateOf(monday, i).getDate();
            return (
              <button
                key={name}
                type="button"
                disabled={saving}
                onClick={() => !on && onMove(i, entry.mealType as MealType)}
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
            const on = entry.mealType === m;
            return (
              <button
                key={m}
                type="button"
                disabled={saving}
                onClick={() => !on && onMove(entry.dayOfWeek, m)}
                aria-pressed={on}
                className={`h-11 rounded-xl border text-sm font-semibold transition-colors disabled:opacity-50 ${on ? pillOn : pillOff}`}
              >
                {mealLabel(m)}
              </button>
            );
          })}
        </div>

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
      </div>
    </div>
  );
}
