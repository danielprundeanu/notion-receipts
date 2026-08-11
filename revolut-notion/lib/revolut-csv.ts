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
  transactions: CsvTransaction[];
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

function toNumber(value: string): number {
  const cleaned = value.trim().replace(/\s/g, "").replace(/,/g, ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseRevolutCsv(text: string): CsvParseResult {
  const warnings: string[] = [];
  const rows = splitCsv(text);

  if (rows.length < 2) {
    return { transactions: [], currency: null, warnings: ["CSV-ul este gol."] };
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
      currency: null,
      warnings: [
        "CSV-ul nu pare un export Revolut: lipsesc coloanele Amount / Description.",
      ],
    };
  }

  const transactions: CsvTransaction[] = [];
  let skippedIncoming = 0;
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
    // incoming transfer — not something the Analytics "Spent" screen covers.
    if (rawAmount >= 0) {
      skippedIncoming += 1;
      continue;
    }

    const date =
      toIsoDate(get(idx.startedDate)) ?? toIsoDate(get(idx.completedDate));
    if (!date) {
      warnings.push(`Rândul ${i + 1} nu are o dată validă și a fost ignorat.`);
      continue;
    }

    const currency = get(idx.currency).toUpperCase();
    if (currency) currencies.add(currency);

    transactions.push({
      id: `csv-${i}`,
      type: get(idx.type),
      date,
      description: get(idx.description) || "(fără descriere)",
      amount: Math.abs(rawAmount),
      fee: Math.abs(toNumber(get(idx.fee))),
      currency: currency || "RON",
      state: state || "COMPLETED",
    });
  }

  if (skippedIncoming > 0) {
    warnings.push(
      `${skippedIncoming} rânduri au fost ignorate (încasări, top-up-uri sau refund-uri).`,
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

  return { transactions, currency, warnings };
}
