import type { CsvTransaction } from "./types";

/**
 * Parser for the Revolut statement CSV export.
 *
 * The export has no category column — that is the whole reason this app exists.
 * Columns (as of the current export format):
 *   Type, Product, Started Date, Completed Date, Description, Amount, Fee,
 *   Currency, State, Balance
 *
 * Header names are matched case-insensitively and by position-independent
 * lookup, so a reordered or slightly renamed export still parses.
 */

export type CsvParseResult = {
  /** Spending only — the rows the import may write. */
  transactions: CsvTransaction[];
  /**
   * Every completed row in file order, incoming ones included.
   *
   * `transactions` is this list filtered to `direction === "out"`, sharing the
   * same objects. Read this one only to reason about what surrounds a payment
   * (pocket inference); anything that ends up in Notion goes through
   * `transactions`, so an incoming row can never be imported as an expense.
   */
  rows: CsvTransaction[];
  currency: string | null;
  warnings: string[];
};

/** Split CSV text into rows of fields, honouring quoted fields and escaped quotes. */
function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function normaliseHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Revolut writes `2026-08-01 12:34:56`; we only keep the date part. */
function toIsoDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // Defensive: some locales export DD/MM/YYYY.
  const slash = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (slash) return `${slash[3]}-${slash[2]}-${slash[1]}`;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

/**
 * `2026-08-14 18:16:23` → `2026-08-14T18:16:23`, null when the cell carries no
 * time. Ordering payments against transfers needs the clock, not just the day.
 */
function toIsoTimestamp(value: string): string | null {
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/);
  return match ? `${match[1]}T${match[2].length === 5 ? `${match[2]}:00` : match[2]}` : null;
}

function toNumber(value: string): number {
  const cleaned = value.trim().replace(/\s/g, "").replace(/,/g, ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseRevolutCsv(text: string): CsvParseResult {
  const warnings: string[] = [];
  const rows = splitCsv(text);

  if (rows.length < 2) {
    return { transactions: [], rows: [], currency: null, warnings: ["CSV-ul este gol."] };
  }

  const header = rows[0].map(normaliseHeader);
  const columnOf = (...names: string[]): number => {
    for (const name of names) {
      const index = header.indexOf(name);
      if (index !== -1) return index;
    }
    return -1;
  };

  const idx = {
    type: columnOf("type"),
    product: columnOf("product", "account"),
    startedDate: columnOf("started date", "date started", "date"),
    completedDate: columnOf("completed date"),
    description: columnOf("description", "merchant", "reference"),
    amount: columnOf("amount"),
    fee: columnOf("fee"),
    currency: columnOf("currency"),
    state: columnOf("state", "status"),
  };

  if (idx.amount === -1 || idx.description === -1) {
    return {
      transactions: [],
      rows: [],
      currency: null,
      warnings: [
        "CSV-ul nu pare un export Revolut: lipsesc coloanele Amount / Description.",
      ],
    };
  }

  const parsed: CsvTransaction[] = [];
  let incoming = 0;
  let skippedPending = 0;
  const currencies = new Set<string>();

  for (let i = 1; i < rows.length; i += 1) {
    const cells = rows[i];
    const get = (index: number) => (index === -1 ? "" : (cells[index] ?? "").trim());

    const state = get(idx.state).toUpperCase();
    if (state && state !== "COMPLETED") {
      skippedPending += 1;
      continue;
    }

    const rawAmount = toNumber(get(idx.amount));
    // Revolut writes spending as negative. Anything else is a top-up, refund or
    // incoming transfer — none of which the Analytics "Spent" screen covers, so
    // none of which is ever imported. They are kept out of `transactions` but
    // stay in `rows`: a transfer out of a pocket lands on the current account as
    // one of these, and that is what tells us the pocket a payment came from.
    const direction = rawAmount < 0 ? "out" : "in";
    if (direction === "in") incoming += 1;

    const started = get(idx.startedDate);
    const date = toIsoDate(started) ?? toIsoDate(get(idx.completedDate));
    if (!date) {
      warnings.push(`Rândul ${i + 1} nu are o dată validă și a fost ignorat.`);
      continue;
    }

    const currency = get(idx.currency).toUpperCase();
    if (currency) currencies.add(currency);

    parsed.push({
      id: `csv-${i}`,
      type: get(idx.type),
      date,
      startedAt: toIsoTimestamp(started),
      product: get(idx.product),
      description: get(idx.description) || "(fără descriere)",
      amount: Math.abs(rawAmount),
      direction,
      fee: Math.abs(toNumber(get(idx.fee))),
      currency: currency || "RON",
      state: state || "COMPLETED",
    });
  }

  const transactions = parsed.filter((row) => row.direction === "out");

  if (incoming > 0) {
    warnings.push(
      `${incoming} rânduri nu se importă (încasări, top-up-uri sau refund-uri).`,
    );
  }
  if (skippedPending > 0) {
    warnings.push(`${skippedPending} rânduri au fost ignorate (nu sunt COMPLETED).`);
  }

  const currency =
    currencies.size === 1 ? [...currencies][0] : currencies.size > 1 ? "MIXT" : null;
  if (currencies.size > 1) {
    warnings.push(
      `CSV-ul conține mai multe monede (${[...currencies].join(", ")}); sumele nu se agregă corect.`,
    );
  }

  return { transactions, rows: parsed, currency, warnings };
}
