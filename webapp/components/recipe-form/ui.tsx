"use client";

import { useEffect, useId } from "react";

// Building blocks shared by the recipe form and its sheets.

export type IngredientRow = {
  id: string;
  quantity: string;
  unit: string;
  groceryItemName: string;
  groceryItemId: string | null;
  availableUnits: string[] | null; // null = any of ALL_UNITS
  notes: string;
};

export type IngredientGroup = {
  id: string;
  name: string;
  ingredients: IngredientRow[];
};

// Another recipe used inside this one: how much of it goes in (servings or grams).
export type RecipeRefRow = {
  id: string;
  refRecipeId: string | null;
  name: string;
  quantity: string;
  unit: "serving" | "g";
};

export const ALL_UNITS = ["g", "ml", "piece", "tsp", "tbsp", "cup", "slice", "handful", "pinch", "scoop", "bottle", "pint"];

export function uid() {
  return Math.random().toString(36).slice(2);
}

export const fieldCls =
  "w-full h-12 px-3.5 rounded-xl border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-base text-gray-900 dark:text-[#eae5de] placeholder:text-gray-500 dark:placeholder:text-[#8f877b] focus:outline-none focus:border-orange-500 dark:focus:border-orange-500";
export const labelCls = "block mt-3.5 mb-1.5 text-sm font-semibold text-gray-900 dark:text-[#eae5de]";
export const sectionCls = "text-[13px] font-semibold tracking-[.04em] uppercase text-gray-600 dark:text-[#a49c90]";
export const cardCls = "rounded-2xl bg-white dark:bg-[#24211c] border border-gray-200 dark:border-[#3a352e]";
export const hintCls = "text-[13px] text-gray-600 dark:text-[#a49c90]";
export const pillCls = "h-10 px-3.5 shrink-0 rounded-[10px] border text-sm font-semibold transition-colors";
export const pillOff = "border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-gray-600 dark:text-[#a49c90]";
export const pillOn = "border-orange-500 bg-orange-500 text-white";

// Bottom sheet on phones, centred dialog from md up. Escape and a tap on the dim area close it.
export function Sheet({
  title,
  onClose,
  escapeCloses = true,
  children,
}: {
  title: string;
  onClose: () => void;
  escapeCloses?: boolean;
  children: React.ReactNode;
}) {
  const titleId = useId();
  useEffect(() => {
    if (!escapeCloses) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, escapeCloses]);

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
        aria-labelledby={titleId}
        className="bg-[var(--color-bg-base)] rounded-t-3xl md:rounded-3xl w-full md:max-w-md max-h-[92dvh] overflow-y-auto px-4 pt-2.5 shadow-xl"
        style={{ paddingBottom: "max(1.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="w-10 h-[5px] rounded-full bg-gray-200 dark:bg-[#3a352e] mx-auto mb-3 md:hidden" aria-hidden />
        <h2 id={titleId} className="text-xl font-bold text-gray-900 dark:text-[#eae5de]">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="h-11 w-14 shrink-0 flex items-center justify-center -mr-1"
    >
      <span className={`relative block w-[52px] h-8 rounded-full transition-colors ${on ? "bg-orange-500" : "bg-gray-200 dark:bg-[#2e2a24]"}`}>
        <span
          className={`absolute top-[3px] left-[3px] w-[26px] h-[26px] rounded-full transition-transform ${
            on ? "translate-x-5 bg-white" : "bg-gray-500 dark:bg-[#a49c90]"
          }`}
        />
      </span>
    </button>
  );
}

// One-of-N toggle. `allowNone` lets a tap on the chosen option clear it.
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  allowNone = false,
  className = "",
  buttonClassName = "flex-1",
}: {
  options: { value: T; label: string }[];
  value: T | "";
  onChange: (v: T | "") => void;
  label: string;
  allowNone?: boolean;
  className?: string;
  buttonClassName?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`flex gap-0.5 p-[3px] rounded-xl bg-white dark:bg-[#24211c] border border-gray-200 dark:border-[#3a352e] ${className}`}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on && allowNone ? "" : o.value)}
            className={`${buttonClassName} h-10 rounded-[10px] text-sm font-semibold transition-colors ${
              on ? "bg-gray-100 dark:bg-[#2e2a24] text-gray-900 dark:text-[#eae5de]" : "text-gray-600 dark:text-[#a49c90]"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
