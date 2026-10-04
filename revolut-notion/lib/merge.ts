import { AMOUNT_TOLERANCE, daysApart, merchantSimilarity } from "./match";
import type {
  CsvTransaction,
  DraftTransaction,
  ParsedScreenshot,
  ReconciliationRow,
} from "./types";

/** A screenshot row may be dated a day or two off the CSV's "started" date. */
const DATE_WINDOW_DAYS = 3;

/** Collect the distinct category names seen across every screenshot. */
export function collectCategories(screenshots: ParsedScreenshot[]): string[] {
  const seen = new Map<string, string>();
  const add = (name: string | null | undefined) => {
    const trimmed = name?.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) seen.set(key, trimmed);
  };

  for (const screenshot of screenshots) {
    for (const total of screenshot.totals) add(total.category);
    add(screenshot.category);
    for (const entry of screenshot.entries) add(entry.category);
  }

  return [...seen.values()];
}

type CategorisedCsv = {
  transaction: CsvTransaction;
  category: string | null;
  /** Comes from the screenshot: the CSV export has no note column. */
  note: string | null;
  source: "screenshot" | "none";
};

/**
 * Match the transactions listed on category drill-down screenshots against CSV
 * rows. Those matches are ground truth: the screenshot states the category
 * outright, so nothing has to be inferred for them.
 */
function matchScreenshotEntries(
  screenshots: ParsedScreenshot[],
  csv: CsvTransaction[],
): {
  assigned: Map<string, { category: string; note: string | null }>;
  unmatched: string[];
} {
  const assigned = new Map<string, { category: string; note: string | null }>();
  const unmatched: string[] = [];
  const used = new Set<string>();

  const entries = screenshots.flatMap((screenshot) =>
    screenshot.entries
      .filter((entry) => entry.category)
      .map((entry) => ({ ...entry, periodStart: screenshot.periodStart })),
  );

  for (const entry of entries) {
    let best: { id: string; score: number } | null = null;

    for (const transaction of csv) {
      if (used.has(transaction.id)) continue;
      if (Math.abs(transaction.amount - entry.amount) > AMOUNT_TOLERANCE) continue;
      if (entry.date && daysApart(entry.date, transaction.date) > DATE_WINDOW_DAYS) {
        continue;
      }

      const score = merchantSimilarity(entry.merchant, transaction.description);
      if (score < 0.35) continue;
      if (!best || score > best.score) best = { id: transaction.id, score };
    }

    if (best) {
      used.add(best.id);
      assigned.set(best.id, {
        category: entry.category as string,
        note: entry.note ?? null,
      });
    } else {
      unmatched.push(`${entry.merchant} (${entry.amount.toFixed(2)})`);
    }
  }

  return { assigned, unmatched };
}

function toDraft(
  transaction: CsvTransaction,
  category: string | null,
  note: string | null,
  source: "screenshot" | "none",
): DraftTransaction {
  return {
    id: transaction.id,
    date: transaction.date,
    description: transaction.description,
    amount: transaction.amount,
    currency: transaction.currency,
    note,
    revolutCategory: category,
    categorySource: source,
    isAggregate: false,
    notionCategoryId: null,
    notionCategoryName: null,
    matchType: "none",
    // Rows the screenshots never showed start excluded: they are reported per
    // month in the Review step and the user decides whether they go in.
    include: source === "screenshot",
  };
}

export type MergeResult = {
  transactions: DraftTransaction[];
  reconciliation: ReconciliationRow[];
  categories: string[];
  warnings: string[];
};

/**
 * Combine screenshots and CSV into the rows that will be written to Notion.
 *
 * **The screenshots decide what gets imported.** The CSV is the authoritative
 * ledger for the rows they cover (exact amounts, dates and merchant strings),
 * but a CSV row no screenshot ever showed is not categorised automatically — it
 * is reported per month and left for the user to rule on. Without a CSV, the
 * screenshots are all we have and are used directly.
 */
export async function mergeSources(
  screenshots: ParsedScreenshot[],
  csv: CsvTransaction[],
): Promise<MergeResult> {
  const warnings: string[] = [];
  const categories = collectCategories(screenshots);

  const transactions: DraftTransaction[] = csv.length
    ? mergeWithCsv(screenshots, csv, warnings)
    : mergeScreenshotsOnly(screenshots, warnings);

  return {
    transactions,
    reconciliation: reconcile(screenshots, transactions),
    categories,
    warnings,
  };
}

function mergeWithCsv(
  screenshots: ParsedScreenshot[],
  csv: CsvTransaction[],
  warnings: string[],
): DraftTransaction[] {
  const { assigned, unmatched } = matchScreenshotEntries(screenshots, csv);

  if (unmatched.length > 0) {
    warnings.push(
      `${unmatched.length} tranzacții din screenshot nu au putut fi potrivite cu CSV-ul și au fost ignorate ca posibile duplicate: ${unmatched
        .slice(0, 5)
        .join(", ")}${unmatched.length > 5 ? "…" : ""}`,
    );
  }

  const rows: CategorisedCsv[] = csv.map((transaction) => {
    const match = assigned.get(transaction.id);
    return {
      transaction,
      category: match?.category ?? null,
      note: match?.note ?? null,
      source: match ? "screenshot" : "none",
    };
  });

  const uncovered = rows.filter((row) => !row.category).length;
  if (uncovered > 0) {
    warnings.push(
      `${uncovered} tranzacții din CSV nu apar în niciun screenshot. Sunt excluse din import și grupate pe luni în pasul de verificare — decide acolo ce faci cu ele.`,
    );
  }

  return rows.map((row) => toDraft(row.transaction, row.category, row.note, row.source));
}

function mergeScreenshotsOnly(
  screenshots: ParsedScreenshot[],
  warnings: string[],
): DraftTransaction[] {
  const drafts: DraftTransaction[] = [];
  const detailedCategories = new Set<string>();
  let index = 0;

  let undated = 0;

  for (const screenshot of screenshots) {
    for (const entry of screenshot.entries) {
      const category = entry.category?.trim() || null;
      if (category) detailedCategories.add(category.toLowerCase());
      // No date means no date. Stamping today produced a whole import of rows
      // dated the day it ran — plausible-looking and entirely wrong.
      const date = entry.date ?? null;
      if (!date) undated += 1;
      drafts.push({
        id: `shot-${index++}`,
        date: date ?? "",
        description: entry.merchant,
        amount: entry.amount,
        currency: screenshot.currency ?? "RON",
        note: entry.note ?? null,
        revolutCategory: category,
        categorySource: category ? "screenshot" : "none",
        isAggregate: false,
        notionCategoryId: null,
        notionCategoryName: null,
        matchType: "none",
        include: date !== null,
      });
    }
  }

  if (undated > 0) {
    warnings.push(
      `${undated} tranzacții nu au o dată care să poată fi stabilită și sunt excluse din import. Verifică luna aleasă la încărcare sau adaugă statement-ul CSV, care are datele exacte.`,
    );
  }

  // Categories that only ever appeared as a total get one aggregate row each.
  for (const screenshot of screenshots) {
    for (const total of screenshot.totals) {
      if (detailedCategories.has(total.category.toLowerCase())) continue;
      const date = screenshot.periodEnd ?? screenshot.periodStart ?? null;
      drafts.push({
        id: `total-${index++}`,
        date: date ?? "",
        description: `${total.category} — total ${screenshot.periodLabel ?? "perioadă"}`,
        amount: total.amount,
        currency: screenshot.currency ?? "RON",
        note: null,
        revolutCategory: total.category,
        categorySource: "screenshot",
        isAggregate: true,
        notionCategoryId: null,
        notionCategoryName: null,
        matchType: "none",
        include: date !== null,
      });
    }
  }

  if (drafts.some((draft) => draft.isAggregate)) {
    warnings.push(
      "Fără CSV, categoriile care apar doar ca total intră ca un singur rând agregat pe categorie. Încarcă statement-ul CSV pentru tranzacții individuale.",
    );
  }

  return drafts;
}

/** Screenshot totals vs. what was actually assigned — surfaces missed rows. */
function reconcile(
  screenshots: ParsedScreenshot[],
  transactions: DraftTransaction[],
): ReconciliationRow[] {
  const totals = new Map<string, { display: string; amount: number }>();
  for (const screenshot of screenshots) {
    for (const total of screenshot.totals) {
      const key = total.category.toLowerCase();
      const existing = totals.get(key);
      if (existing) existing.amount += total.amount;
      else totals.set(key, { display: total.category, amount: total.amount });
    }
  }

  if (totals.size === 0) return [];

  const assigned = new Map<string, { amount: number; count: number }>();
  for (const transaction of transactions) {
    if (transaction.isAggregate || !transaction.revolutCategory) continue;
    const key = transaction.revolutCategory.toLowerCase();
    const existing = assigned.get(key) ?? { amount: 0, count: 0 };
    existing.amount += transaction.amount;
    existing.count += 1;
    assigned.set(key, existing);
  }

  return [...totals.entries()].map(([key, total]) => {
    const actual = assigned.get(key) ?? { amount: 0, count: 0 };
    return {
      category: total.display,
      screenshotTotal: round(total.amount),
      assignedTotal: round(actual.amount),
      delta: round(actual.amount - total.amount),
      transactionCount: actual.count,
    };
  });
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
