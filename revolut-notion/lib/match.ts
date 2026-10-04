/**
 * Deciding whether two transaction rows describe the same purchase.
 *
 * Used twice with different inputs: screenshot rows against CSV rows when
 * merging, and rows about to be imported against rows already in Notion when
 * checking for duplicates.
 *
 * Pure: no network, covered by `npm run smoke`.
 */

/** Amounts equal to the cent. */
export const AMOUNT_TOLERANCE = 0.011;

export function normaliseMerchant(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function daysApart(a: string, b: string): number {
  const left = Date.parse(a);
  const right = Date.parse(b);
  if (Number.isNaN(left) || Number.isNaN(right)) return 0;
  return Math.abs(left - right) / 86_400_000;
}

/** 0 = no relation, 1 = identical merchant strings. */
export function merchantSimilarity(a: string, b: string): number {
  const left = normaliseMerchant(a);
  const right = normaliseMerchant(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.8;

  const leftTokens = new Set(left.split(" ").filter((token) => token.length > 2));
  const rightTokens = right.split(" ").filter((token) => token.length > 2);
  if (leftTokens.size === 0 || rightTokens.length === 0) return 0;

  const shared = rightTokens.filter((token) => leftTokens.has(token)).length;
  return (shared / Math.max(leftTokens.size, rightTokens.length)) * 0.7;
}
