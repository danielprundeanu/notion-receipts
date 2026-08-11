import { classifyTransactions } from "./claude";
import type {
  CsvTransaction,
  DraftTransaction,
  ParsedScreenshot,
  ReconciliationRow,
} from "./types";

/** Amounts equal to the cent. */
const AMOUNT_TOLERANCE = 0.011;
/** A screenshot row may be dated a day or two off the CSV's "started" date. */
const DATE_WINDOW_DAYS = 3;

function normaliseMerchant(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function daysApart(a: string, b: string): number {
  const left = Date.parse(a);
  const right = Date.parse(b);
  if (Number.isNaN(left) || Number.isNaN(right)) return 0;
  return Math.abs(left - right) / 86_400_000;
}

/** 0 = no relation, 1 = identical merchant strings. */
function merchantSimilarity(a: string, b: string): number {
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
  source: "screenshot" | "inferred" | "none";
};

/**
 * Match the transactions listed on category drill-down screenshots against CSV
 * rows. Those matches are ground truth: the screenshot states the category
 * outright, so nothing has to be inferred for them.
 */
function matchScreenshotEntries(
  screenshots: ParsedScreenshot[],
  csv: CsvTransaction[],
): { assigned: Map<string, string>; unmatched: string[] } {
  const assigned = new Map<string, string>();
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
      assigned.set(best.id, entry.category as string);
    } else {
      unmatched.push(`${entry.merchant} (${entry.amount.toFixed(2)})`);
    }
  }

  return { assigned, unmatched };
}

function toDraft(
  transaction: CsvTransaction,
  category: string | null,
  source: "screenshot" | "inferred" | "none",
): DraftTransaction {
  return {
    id: transaction.id,
    date: transaction.date,
    description: transaction.description,
    amount: transaction.amount,
    currency: transaction.currency,
    revolutCategory: category,
    categorySource: source,
    isAggregate: false,
    notionCategoryId: null,
    notionCategoryName: null,
    matchType: "none",
    include: true,
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
 * The CSV is the authoritative ledger when present (exact amounts, dates and
 * merchant strings); the screenshots supply the categories the CSV lacks.
 * Without a CSV, the screenshots are all we have and are used directly.
 */
export async function mergeSources(
  screenshots: ParsedScreenshot[],
  csv: CsvTransaction[],
): Promise<MergeResult> {
  const warnings: string[] = [];
  const categories = collectCategories(screenshots);

  const transactions: DraftTransaction[] = csv.length
    ? await mergeWithCsv(screenshots, csv, categories, warnings)
    : mergeScreenshotsOnly(screenshots, warnings);

  return {
    transactions,
    reconciliation: reconcile(screenshots, transactions),
    categories,
    warnings,
  };
}

async function mergeWithCsv(
  screenshots: ParsedScreenshot[],
  csv: CsvTransaction[],
  categories: string[],
  warnings: string[],
): Promise<DraftTransaction[]> {
  const { assigned, unmatched } = matchScreenshotEntries(screenshots, csv);

  if (unmatched.length > 0) {
    warnings.push(
      `${unmatched.length} tranzacții din screenshot nu au putut fi potrivite cu CSV-ul și au fost ignorate ca posibile duplicate: ${unmatched
        .slice(0, 5)
        .join(", ")}${unmatched.length > 5 ? "…" : ""}`,
    );
  }

  const rows: CategorisedCsv[] = csv.map((transaction) => {
    const category = assigned.get(transaction.id) ?? null;
    return {
      transaction,
      category,
      source: category ? "screenshot" : "none",
    };
  });

  const needsInference = rows.filter((row) => !row.category);
  if (needsInference.length > 0 && categories.length > 0) {
    try {
      const assignments = await classifyTransactions(
        needsInference.map((row) => row.transaction),
        categories,
      );
      const byId = new Map(assignments.map((a) => [a.id, a.category]));
      for (const row of needsInference) {
        const category = byId.get(row.transaction.id);
        if (category) {
          row.category = category;
          row.source = "inferred";
        }
      }
    } catch (error) {
      warnings.push(
        `Nu am putut deduce categoriile pentru restul tranzacțiilor: ${(error as Error).message}`,
      );
    }
  } else if (needsInference.length > 0) {
    warnings.push(
      "Niciun screenshot nu a furnizat o listă de categorii, deci tranzacțiile din CSV au rămas necategorisite.",
    );
  }

  const stillMissing = rows.filter((row) => !row.category).length;
  if (stillMissing > 0) {
    warnings.push(
      `${stillMissing} tranzacții au rămas fără categorie — alege-le manual în pasul de rezolvare.`,
    );
  }

  return rows.map((row) => toDraft(row.transaction, row.category, row.source));
}

function mergeScreenshotsOnly(
  screenshots: ParsedScreenshot[],
  warnings: string[],
): DraftTransaction[] {
  const drafts: DraftTransaction[] = [];
  const detailedCategories = new Set<string>();
  let index = 0;

  for (const screenshot of screenshots) {
    for (const entry of screenshot.entries) {
      const category = entry.category?.trim() || null;
      if (category) detailedCategories.add(category.toLowerCase());
      drafts.push({
        id: `shot-${index++}`,
        date: entry.date ?? screenshot.periodStart ?? new Date().toISOString().slice(0, 10),
        description: entry.merchant,
        amount: entry.amount,
        currency: screenshot.currency ?? "RON",
        revolutCategory: category,
        categorySource: category ? "screenshot" : "none",
        isAggregate: false,
        notionCategoryId: null,
        notionCategoryName: null,
        matchType: "none",
        include: true,
      });
      if (!entry.date) {
        warnings.push(
          `"${entry.merchant}" nu avea dată în screenshot; am folosit începutul perioadei.`,
        );
      }
    }
  }

  // Categories that only ever appeared as a total get one aggregate row each.
  for (const screenshot of screenshots) {
    for (const total of screenshot.totals) {
      if (detailedCategories.has(total.category.toLowerCase())) continue;
      drafts.push({
        id: `total-${index++}`,
        date: screenshot.periodEnd ?? screenshot.periodStart ?? new Date().toISOString().slice(0, 10),
        description: `${total.category} — total ${screenshot.periodLabel ?? "perioadă"}`,
        amount: total.amount,
        currency: screenshot.currency ?? "RON",
        revolutCategory: total.category,
        categorySource: "screenshot",
        isAggregate: true,
        notionCategoryId: null,
        notionCategoryName: null,
        matchType: "none",
        include: true,
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
