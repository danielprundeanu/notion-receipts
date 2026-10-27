// Servings stepper math shared by the recipe page, planner and recipe form.
// A recipe's `servingsStep` (null = 1) sets how far −/+ move, snapping to its
// multiples: with step 4, 6 → + → 8 and 6 → − → 4; with step 0.25, 1.1 → + → 1.25.
// Typing a value is unrestricted, and may have two decimals (1.25 servings).

/** Smallest servings value that can be typed in (a tenth of a serving), and the smallest step. */
export const MIN_SERVINGS = 0.1;

/** Round to two decimals, dropping float noise (0.1 + 0.2 → 0.3). */
export function roundServings(n: number): number {
  return Math.round(n * 100) / 100;
}

export function servingsStepOf(recipe: { servingsStep?: number | null }): number {
  const s = recipe.servingsStep ?? 1;
  return s >= MIN_SERVINGS ? roundServings(s) : 1;
}

/** Next value up/down from `cur`, snapped to multiples of `step`. May return 0 going down. */
export function stepServings(cur: number, dir: 1 | -1, step: number): number {
  const s = step >= MIN_SERVINGS ? step : 1;
  // The nudge keeps float division (0.3 / 0.1 = 2.999…) on the right side of a multiple.
  return dir > 0
    ? roundServings(Math.floor(cur / s + 1e-9) * s + s)
    : Math.max(0, roundServings(Math.ceil(cur / s - 1e-9) * s - s));
}

/** − on a stepper that never drops below 1 via the button (or below one step, when the
 *  step is a fraction such as 0.25): a typed 0.5 stays 0.5. */
export function stepServingsDown(cur: number, step: number): number {
  const floor = Math.min(1, step >= MIN_SERVINGS ? step : 1);
  const n = stepServings(cur, -1, step);
  return n >= floor ? n : Math.min(cur, floor);
}
