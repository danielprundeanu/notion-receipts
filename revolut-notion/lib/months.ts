/**
 * Working out which month page a transaction belongs to.
 *
 * The months database belongs to the user, not to us — the only safe assumption
 * is that each page identifies one month *somehow*. We read that in priority
 * order (properties named "month"/"lună" and "year"/"an", then a date property,
 * then the title as a month name) instead of scanning every number on the page,
 * so an unrelated numeric property can never be mistaken for a month.
 *
 * Pure: no Notion client here, so `npm run smoke` can cover it offline.
 */

/** One Notion property flattened to plain text, for month detection. */
export type PropertyText = {
  name: string;
  type: string;
  /** Property value as readable text ("08", "August", "2026-08-01", …). */
  text: string;
};

const MONTH_WORDS: Record<string, number> = {
  // Romanian
  ianuarie: 1, februarie: 2, martie: 3, aprilie: 4, mai: 5, iunie: 6,
  iulie: 7, august: 8, septembrie: 9, octombrie: 10, noiembrie: 11, decembrie: 12,
  // English
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, september: 9, october: 10, november: 11, december: 12,
};

/** Strip diacritics and case so "Lună" and "luna" hash the same. */
function normalise(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/** "August", "aug", "08", "8" → 8. Anything else → null. */
export function parseMonth(value: string): number | null {
  const text = normalise(value);
  if (!text) return null;

  const numeric = text.match(/^(\d{1,2})$/);
  if (numeric) {
    const month = Number(numeric[1]);
    return month >= 1 && month <= 12 ? month : null;
  }

  // First word only, so "August 2026" still resolves.
  const word = text.split(/[\s/._-]+/)[0];
  if (MONTH_WORDS[word]) return MONTH_WORDS[word];

  if (word.length >= 3) {
    const prefix = word.slice(0, 3);
    for (const [name, month] of Object.entries(MONTH_WORDS)) {
      if (name.startsWith(prefix)) return month;
    }
  }
  return null;
}

function parseYear(value: string): number | null {
  const match = normalise(value).match(/\b((?:19|20)\d{2})\b/);
  return match ? Number(match[1]) : null;
}

/** "2026-08-03" (or an ISO timestamp) → "2026-08". */
export function monthKeyFromDate(isoDate: string): string | null {
  const match = isoDate.trim().match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : null;
}

// Matched against already-normalised names, so no diacritics here.
const MONTH_PROPERTY = /^(month|luna|lunile)$/;
const YEAR_PROPERTY = /^(year|an|anul)$/;

/**
 * Derive a "YYYY-MM" key for one month page, or null when the page does not
 * identify a month clearly enough to link against.
 */
export function deriveMonthKey(properties: PropertyText[]): string | null {
  let month: number | null = null;
  let year: number | null = null;

  // 1. Properties whose *name* says what they hold — the page stating its own
  //    month outright.
  for (const property of properties) {
    if (!property.text) continue;
    const name = normalise(property.name);
    if (month === null && MONTH_PROPERTY.test(name)) month = parseMonth(property.text);
    if (year === null && YEAR_PROPERTY.test(name)) year = parseYear(property.text);
  }

  // 2. A date property, but only for what the page has not already said. Such a
  //    date is not always the month itself: a real months database turned out to
  //    carry a "Last Day" that ends the *cycle*, ten days into the next month —
  //    trusting it first filed every one of those pages one month late.
  for (const property of properties) {
    if (property.type !== "date" || !property.text) continue;
    const key = monthKeyFromDate(property.text);
    if (!key) continue;
    const [dateYear, dateMonth] = key.split("-").map(Number);

    if (month === null) {
      // Nothing named a month: the date decides the whole key, month and year
      // together, since the two cannot contradict each other.
      return `${dateYear}-${String(dateMonth).padStart(2, "0")}`;
    }
    // The page named a month, so the date only fills in a missing year — and
    // only while the two agree. Otherwise it is a boundary date, not the month.
    if (year === null && dateMonth === month) year = dateYear;
    break;
  }

  // 3. Fall back to the title ("August"), which is how most month pages are named.
  if (month === null) {
    const title = properties.find((property) => property.type === "title");
    if (title?.text) month = parseMonth(title.text);
  }

  // 4. A bare four-digit value elsewhere is the year, but only once we already
  //    know the month — on its own it is far too weak a signal.
  if (month !== null && year === null) {
    for (const property of properties) {
      if (!["select", "multi_select", "rich_text", "title", "number", "formula"].includes(property.type)) {
        continue;
      }
      if (/^(?:19|20)\d{2}$/.test(property.text.trim())) {
        year = Number(property.text.trim());
        break;
      }
    }
  }

  if (month === null || year === null) return null;
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * Month key → page id, keeping the first page per month. Pages that do not
 * resolve to a month are skipped rather than guessed at.
 */
export function buildMonthIndex(
  pages: { id: string; properties: PropertyText[] }[],
): Map<string, string> {
  const index = new Map<string, string>();
  for (const page of pages) {
    const key = deriveMonthKey(page.properties);
    if (key && !index.has(key)) index.set(key, page.id);
  }
  return index;
}

/** One month page, as offered in the upload step's year/month pickers. */
export type MonthPageOption = {
  id: string;
  /** "YYYY-MM". */
  key: string;
  /** The page's own title ("August"), empty when it has none. */
  title: string;
};

/**
 * The month pages the user can import into, newest first.
 *
 * First page wins per month, exactly as in `buildMonthIndex` — so the month the
 * user picks here is the very page the import will link the rows to.
 */
export function monthPageOptions(
  pages: { id: string; properties: PropertyText[] }[],
): MonthPageOption[] {
  const byKey = new Map<string, MonthPageOption>();
  for (const page of pages) {
    const key = deriveMonthKey(page.properties);
    if (!key || byKey.has(key)) continue;
    const title = page.properties.find((property) => property.type === "title")?.text ?? "";
    byKey.set(key, { id: page.id, key, title: title.trim() });
  }
  return [...byKey.values()].sort((a, b) => b.key.localeCompare(a.key));
}
