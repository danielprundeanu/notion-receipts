import type { Macros, PlannerEntry, PlannerRecipe } from "@/lib/actions";

// Stored/compared as WeekPlan.mealType — keep the English values; show mealLabel() for display.
export const MEALS = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;
export type MealType = (typeof MEALS)[number];

export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export type { Macros, PlannerEntry, PlannerRecipe };

// Entries in a day, Breakfast → Snack, then in the order they were added.
export function byMeal(a: PlannerEntry, b: PlannerEntry): number {
  return MEALS.indexOf(a.mealType as MealType) - MEALS.indexOf(b.mealType as MealType);
}

/** Sum of each entry's per-serving macros × its servings, per day (0–6). */
export function dayTotals(entries: PlannerEntry[], recipes: Map<string, PlannerRecipe>): Record<number, Macros> {
  const totals: Record<number, Macros> = {};
  for (const e of entries) {
    const n = recipes.get(e.recipeId)?.nutrition;
    if (!n) continue;
    const t = (totals[e.dayOfWeek] ??= { kcal: 0, carbs: 0, fat: 0, protein: 0 });
    t.kcal += n.kcal * e.servings;
    t.carbs += n.carbs * e.servings;
    t.fat += n.fat * e.servings;
    t.protein += n.protein * e.servings;
  }
  return totals;
}

export function formatKcal(kcal: number): string {
  return `${Math.round(kcal).toLocaleString("en-US")} kcal`;
}

export function dateOf(monday: Date, day: number): Date {
  const d = new Date(monday);
  d.setDate(d.getDate() + day);
  return d;
}
