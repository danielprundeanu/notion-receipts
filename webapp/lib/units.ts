// Unit pairs that convert the same way for every ingredient (tbsp ↔ tsp, cup → ml, …).
// Anything else (1 cup of flour in grams, 1 onion in grams) depends on the ingredient.
const STANDARD: Record<string, number> = {
  "tsp→tbsp": 1 / 3, "tbsp→tsp": 3,
  "cup→ml": 240, "ml→cup": 1 / 240,
  "cup→l": 0.24, "l→cup": 1 / 0.24,
  "oz→g": 28.35, "g→oz": 1 / 28.35,
  "lb→g": 453.6, "g→lb": 1 / 453.6,
  "lb→kg": 0.4536, "kg→lb": 1 / 0.4536,
  "kg→g": 1000, "g→kg": 1 / 1000,
  "l→ml": 1000, "ml→l": 1 / 1000,
};

/** How many `to` make one `from` (1 tbsp = 3 tsp), or null when it depends on the ingredient. */
export function standardFactor(from: string, to: string): number | null {
  const v = STANDARD[`${from}→${to}`];
  return v == null ? null : Number(v.toFixed(6));
}
