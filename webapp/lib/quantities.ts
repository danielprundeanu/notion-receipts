// How an ingredient amount reads in a recipe. Spoons, cups and pieces get kitchen
// fractions (¼ tsp reads faster than 0.25 tsp, and nobody measures 0.3 cup); grams and
// millilitres stay decimal, whole from 10 up.

const METRIC = new Set(["g", "ml", "kg", "l"]);

const FRACTIONS: [number, string][] = [
  [0, ""], [1 / 8, "⅛"], [1 / 4, "¼"], [1 / 3, "⅓"], [1 / 2, "½"], [2 / 3, "⅔"], [3 / 4, "¾"], [1, ""],
];

function trimDecimal(n: number, digits: number): string {
  return String(Number(n.toFixed(digits)));
}

/** 1.5 → "1½", 0.3 → "⅓", 2 → "2". Amounts below ~⅛ stay decimal rather than be overstated. */
export function kitchenFraction(q: number): string {
  if (q > 0 && q < 0.09) return trimDecimal(q, 2);
  let whole = Math.floor(q + 1e-9);
  const rest = q - whole;
  let best = FRACTIONS[0];
  for (const f of FRACTIONS) if (Math.abs(f[0] - rest) < Math.abs(best[0] - rest)) best = f;
  if (best[0] === 1) {
    whole += 1;
    best = FRACTIONS[0];
  }
  return `${whole || best[1] === "" ? whole : ""}${best[1]}`;
}

/** The number part of an amount in `unit`: "250", "2.5", "1½". */
export function formatAmount(q: number, unit: string | null): string {
  if (unit && METRIC.has(unit)) return q >= 10 ? String(Math.round(q)) : trimDecimal(q, 1);
  return kitchenFraction(q);
}
