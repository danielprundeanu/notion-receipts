// Servings stepper math shared by the recipe page, planner and recipe form.
// A recipe's `servingsStep` (null = 1) sets how far −/+ move, snapping to its
// multiples: with step 4, 6 → + → 8 and 6 → − → 4. Typing a value is unrestricted,
// and may have one decimal (1.5 servings).

/** Smallest servings value that can be typed in (a tenth of a serving). */
export const MIN_SERVINGS = 0.1;

/** Round to one decimal, dropping float noise (0.1 + 0.2 → 0.3). */
export function roundServings(n: number): number {
  return Math.round(n * 10) / 10;
}

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

/** − on a stepper that never drops below 1 via the button: a typed 0.5 stays 0.5. */
export function stepServingsDown(cur: number, step: number): number {
  const n = stepServings(cur, -1, step);
  return n >= 1 ? n : Math.min(cur, 1);
}
