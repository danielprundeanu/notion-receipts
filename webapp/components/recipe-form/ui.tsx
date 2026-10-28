"use client";

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
export const pillOn = "bg-orange-100 border-orange-300 text-orange-800 dark:bg-orange-500/15 dark:border-orange-500/50 dark:text-orange-300";

export { Sheet, Switch, Segmented } from "@/components/Sheet";
