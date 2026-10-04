/**
 * Spotting rows that are already in Notion.
 *
 * The app has no write-side deduplication — running the same import twice
 * creates two sets of pages. Rather than refusing writes (a legitimately
 * repeated purchase must still be importable), it reports what already looks
 * present and lets the user decide.
 *
 * A duplicate means **the same row**: same description, same date, same amount.
 * A different amount or a different date is a different transaction, never a
 * duplicate — resembling merchant names are not enough.
 *
 * Pure: no network, covered by `npm run smoke`.
 */
import type { DraftTransaction } from "./types";

/** A transaction already present in the Notion database. */
export type ExistingTransaction = {
  pageId: string;
  url: string | null;
  title: string;
  /** ISO date, or null when the page has none. */
  date: string | null;
  amount: number | null;
};

export type DuplicateMatch = {
  draftId: string;
  existing: ExistingTransaction;
};

/** Half a cent: floats, not fuzziness. Amounts must be the same amount. */
const CENT_EPSILON = 0.005;

/** Trim and collapse whitespace; case is ignored so "BOLT" still matches "Bolt". */
function normaliseTitle(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Pair drafts against pages already in Notion.
 *
 * Matching is one-to-one on purpose: two genuinely identical purchases on the
 * same day (two coffees at the same price) must not both be flagged when Notion
 * only holds one of them — the second is a real new transaction.
 *
 * The category is deliberately not part of the key. Re-filing a row under a
 * different category in Notion does not make it a different transaction, and
 * including it would let an edited row be imported a second time.
 */
export function findDuplicates(
  drafts: DraftTransaction[],
  existing: ExistingTransaction[],
): DuplicateMatch[] {
  const claimed = new Set<string>();
  const matches: DuplicateMatch[] = [];

  for (const draft of drafts) {
    if (!draft.date) continue;
    const title = normaliseTitle(draft.description);

    const found = existing.find(
      (candidate) =>
        !claimed.has(candidate.pageId) &&
        candidate.date === draft.date &&
        candidate.amount !== null &&
        Math.abs(candidate.amount - draft.amount) < CENT_EPSILON &&
        normaliseTitle(candidate.title) === title,
    );

    if (found) {
      claimed.add(found.pageId);
      matches.push({ draftId: draft.id, existing: found });
    }
  }

  return matches;
}

/** The date span to fetch from Notion — only rows that could possibly collide. */
export function dateRange(
  drafts: DraftTransaction[],
): { start: string; end: string } | null {
  const dates = drafts
    .map((draft) => draft.date)
    .filter((date): date is string => /^\d{4}-\d{2}-\d{2}$/.test(date ?? ""))
    .sort();
  if (dates.length === 0) return null;
  return { start: dates[0], end: dates[dates.length - 1] };
}
