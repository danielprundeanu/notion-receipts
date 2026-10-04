// Servings stepper math shared by the recipe page, planner and recipe form.
// A recipe's `servingsStep` (null = 1) sets how far −/+ move, snapping to its
// multiples: with step 4, 6 → + → 8 and 6 → − → 4. Typing a value is unrestricted.

export function servingsStepOf(recipe: { servingsStep?: number | null }): number {
  const s = recipe.servingsStep ?? 1;
  return s >= 1 ? Math.round(s) : 1;
}

/** Next value up/down from `cur`, snapped to multiples of `step`. May return 0 going down. */
export function stepServings(cur: number, dir: 1 | -1, step: number): number {
  const s = Math.max(1, Math.round(step) || 1);
  return dir > 0
    ? Math.floor(cur / s) * s + s
    : Math.max(0, Math.ceil(cur / s) * s - s);
}
