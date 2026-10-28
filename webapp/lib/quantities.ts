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

// ── Typing an amount (recipe form) ──

const TYPED_FRACTIONS: Record<string, number> = { "⅛": 1 / 8, "¼": 1 / 4, "⅓": 1 / 3, "½": 1 / 2, "⅔": 2 / 3, "¾": 3 / 4 };

/** "2", "1,5", "1/2", "1 1/2", "1½", "⅓" → a number. "" → null (no amount, to taste); unreadable → NaN. */
export function parseAmount(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (!t) return null;
  const m = t.match(/^(\d+(?:\.\d+)?)?\s*(?:([⅛¼⅓½⅔¾])|(\d+)\s*\/\s*(\d+))?$/);
  if (!m || (!m[1] && !m[2] && !m[3])) return NaN;
  let n = m[1] ? parseFloat(m[1]) : 0;
  if (m[2]) n += TYPED_FRACTIONS[m[2]];
  if (m[3]) {
    const den = parseInt(m[4]);
    if (!den) return NaN;
    n += parseInt(m[3]) / den;
  }
  return n;
}

/** An amount as the amount field shows it: decimals, except thirds, which no decimal writes exactly. */
export function editableAmount(q: number): string {
  const whole = Math.floor(q + 1e-9);
  const rest = q - whole;
  for (const [v, s] of [[1 / 3, "⅓"], [2 / 3, "⅔"]] as const) {
    if (Math.abs(rest - v) < 0.002) return `${whole || ""}${s}`;
  }
  return trimDecimal(q, 3);
}

// ── Shopping list ──
// What you buy whole (onions, cans, garlic cloves) is rounded UP to what the shop
// sells: ⅓ of an onion is still one onion. Spoons and cups stay kitchen fractions.

const COUNTED = new Set(["piece", "can", "slice", "clove", "bunch", "pack", "bottle", "jar", "bag", "sachet"]);
const PLURAL: Record<string, string> = {
  cup: "cups", can: "cans", slice: "slices", clove: "cloves", pinch: "pinches", handful: "handfuls",
  scoop: "scoops", bunch: "bunches", pack: "packs", bottle: "bottles", jar: "jars", bag: "bags", sachet: "sachets",
};

function shoppingAmount(q: number, unit: string | null): string {
  const u = unit?.trim().toLowerCase() || null;
  if (!u || COUNTED.has(u)) {
    const n = Math.max(1, Math.ceil(q - 1e-6));
    if (!u || u === "piece") return String(n);
    return `${n} ${n > 1 ? PLURAL[u] ?? u : u}`;
  }
  const num = formatAmount(q, u);
  return `${num} ${q > 1 && PLURAL[u] ? PLURAL[u] : u}`;
}

/** One recipe's own amount, not rounded up: "¾", "2 cups", "220 g". */
export function exactAmount(q: number, unit: string | null): string {
  const u = unit?.trim().toLowerCase() || null;
  const num = formatAmount(q, u);
  if (!u || u === "piece") return num;
  return `${num} ${q > 1 && PLURAL[u] ? PLURAL[u] : u}`;
}

/** "5", "2½ cups + 180 g", "3 cans" — every unit an item is needed in, joined. */
export function formatShoppingAmounts(amounts: { quantity: number; unit: string | null }[]): string {
  return amounts.filter((a) => a.quantity > 0).map((a) => shoppingAmount(a.quantity, a.unit)).join(" + ");
}
