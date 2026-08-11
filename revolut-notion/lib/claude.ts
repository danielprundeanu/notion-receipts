import Anthropic from "@anthropic-ai/sdk";
import type { CsvTransaction, ParsedScreenshot, ScreenshotKind } from "./types";

const MODEL = "claude-opus-5";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY nu este setat. Adaugă-l în .env.local înainte de a importa.",
    );
  }
  client ??= new Anthropic();
  return client;
}

/** JSON Schema helper: a value that may legitimately be absent. */
const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] } as const;

const SCREENSHOT_SCHEMA = {
  type: "object",
  properties: {
    kind: {
      type: "string",
      enum: ["analytics_overview", "category_detail", "transaction_list", "unknown"],
    },
    period_label: nullableString,
    period_start: nullableString,
    period_end: nullableString,
    currency: nullableString,
    category: nullableString,
    totals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: { type: "string" },
          amount: { type: "number" },
        },
        required: ["category", "amount"],
        additionalProperties: false,
      },
    },
    entries: {
      type: "array",
      items: {
        type: "object",
        properties: {
          merchant: { type: "string" },
          amount: { type: "number" },
          date: nullableString,
          category: nullableString,
        },
        required: ["merchant", "amount", "date", "category"],
        additionalProperties: false,
      },
    },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: [
    "kind",
    "period_label",
    "period_start",
    "period_end",
    "currency",
    "category",
    "totals",
    "entries",
    "warnings",
  ],
  additionalProperties: false,
} as const;

const SCREENSHOT_PROMPT = `You read screenshots from the Revolut mobile app and transcribe exactly what is on screen.

Identify which screen you are looking at and set "kind":
- "analytics_overview" — the Analytics / Spent screen: a donut or bar chart with a list of spending CATEGORIES, each with a total. Fill "totals" with one entry per category; leave "entries" empty.
- "category_detail" — one category opened from Analytics: a header naming the category, then the individual transactions inside it. Set "category" to the header name and fill "entries"; leave "totals" empty.
- "transaction_list" — the plain account feed with individual transactions and no category grouping. Fill "entries"; leave "category" null.
- "unknown" — anything else.

Rules for amounts:
- Report every amount as a POSITIVE number of currency units, however it is displayed ("-45,20 lei", "45.20 RON" and "−45.20" all become 45.2).
- Revolut uses "." as thousands separator and "," as decimals in several locales: "1.234,56" is 1234.56, while "1,234.56" is also 1234.56. Use the surrounding amounts to decide which convention the screenshot uses.
- Skip incoming money (refunds, top-ups, transfers in) — this app records spending only. Note anything you skipped in "warnings".

Other fields:
- "currency" is the ISO code (RON, EUR, GBP, USD). "lei" means RON.
- "period_label" is the period exactly as displayed ("August", "1 Aug – 31 Aug", "This month").
- "period_start" / "period_end" are ISO dates (YYYY-MM-DD) when the screenshot states or clearly implies them; otherwise null. A bare month name with no year implies nothing — leave them null and say so in "warnings".
- "date" on an entry is an ISO date only when the screenshot shows one. Relative labels like "Today" or "Yesterday" are not dates — set null and mention it in "warnings".
- Category names go in verbatim, in the language shown on screen.
- Transcribe only what is legible. If a row is cut off or blurred, leave it out and record it in "warnings" rather than guessing.`;

const CLASSIFY_SCHEMA = {
  type: "object",
  properties: {
    assignments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          category: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["id", "category", "confidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["assignments"],
  additionalProperties: false,
} as const;

const CLASSIFY_PROMPT = `You assign bank transactions to spending categories.

You get a list of transactions (id, date, merchant description, amount) and a closed list of category names taken from the user's own Revolut Analytics screen. Assign every transaction to exactly one category from that list — never invent a category name and never leave one out.

Use the merchant name as the main signal: supermarkets and grocery chains are groceries, restaurants/cafes/delivery are restaurants, fuel stations and ride-hailing are transport, and so on. Where a merchant is genuinely ambiguous, pick the most likely category from the list and mark confidence "low"; use "high" only when the merchant name identifies the category unambiguously.`;

/** data:image/png;base64,AAA… → { mediaType, data } */
function parseDataUrl(dataUrl: string): { mediaType: string; data: string } {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.*)$/s);
  if (!match) throw new Error("Imaginea nu este un data URL base64 valid.");
  return { mediaType: match[1], data: match[2] };
}

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

/** Pull the single text block out of a structured-output response. */
function readJsonResponse<T>(message: Anthropic.Message): T {
  const text = message.content.find((block) => block.type === "text");
  if (!text || text.type !== "text") {
    if (message.stop_reason === "refusal") {
      throw new Error("Claude a refuzat să proceseze această cerere.");
    }
    throw new Error("Claude nu a returnat niciun conținut text.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error(
      "Răspunsul lui Claude a fost trunchiat. Încearcă cu mai puține tranzacții odată.",
    );
  }
  try {
    return JSON.parse(text.text) as T;
  } catch {
    throw new Error("Claude a returnat un JSON invalid.");
  }
}

type RawScreenshot = {
  kind: ScreenshotKind;
  period_label: string | null;
  period_start: string | null;
  period_end: string | null;
  currency: string | null;
  category: string | null;
  totals: { category: string; amount: number }[];
  entries: {
    merchant: string;
    amount: number;
    date: string | null;
    category: string | null;
  }[];
  warnings: string[];
};

/** Read one Revolut screenshot into structured data. */
export async function extractScreenshot(
  dataUrl: string,
  fileName: string,
): Promise<ParsedScreenshot> {
  const { mediaType, data } = parseDataUrl(dataUrl);
  if (!SUPPORTED_IMAGE_TYPES.has(mediaType)) {
    throw new Error(
      `Format de imagine nesuportat (${mediaType}). Folosește PNG, JPEG, GIF sau WebP.`,
    );
  }

  const stream = getClient().messages.stream({
    model: MODEL,
    max_tokens: 16000,
    system: SCREENSHOT_PROMPT,
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema: SCREENSHOT_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType as "image/png",
              data,
            },
          },
          {
            type: "text",
            text: "Transcrie acest screenshot Revolut conform schemei.",
          },
        ],
      },
    ],
  });

  const raw = readJsonResponse<RawScreenshot>(await stream.finalMessage());

  return {
    fileName,
    kind: raw.kind,
    periodLabel: raw.period_label,
    periodStart: raw.period_start,
    periodEnd: raw.period_end,
    currency: raw.currency ? raw.currency.toUpperCase() : null,
    category: raw.category,
    totals: (raw.totals ?? [])
      .filter((total) => total.category?.trim())
      .map((total) => ({
        category: total.category.trim(),
        amount: Math.abs(total.amount),
      })),
    entries: (raw.entries ?? [])
      .filter((entry) => entry.merchant?.trim())
      .map((entry) => ({
        merchant: entry.merchant.trim(),
        amount: Math.abs(entry.amount),
        date: entry.date,
        category: entry.category?.trim() || raw.category?.trim() || null,
      })),
    warnings: raw.warnings ?? [],
  };
}

export type Assignment = {
  id: string;
  category: string;
  confidence: "high" | "medium" | "low";
};

/**
 * Assign CSV transactions to categories, constrained to the category list read
 * off the Analytics screenshot. This is what fills the gap left by Revolut's
 * category-less CSV export.
 */
export async function classifyTransactions(
  transactions: CsvTransaction[],
  categories: string[],
): Promise<Assignment[]> {
  if (transactions.length === 0 || categories.length === 0) return [];

  const payload = transactions.map((transaction) => ({
    id: transaction.id,
    date: transaction.date,
    merchant: transaction.description,
    amount: transaction.amount,
  }));

  const stream = getClient().messages.stream({
    model: MODEL,
    max_tokens: 32000,
    system: CLASSIFY_PROMPT,
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: CLASSIFY_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: [
          `Categorii disponibile (folosește exact aceste denumiri):\n${categories
            .map((category) => `- ${category}`)
            .join("\n")}`,
          "",
          `Tranzacții:\n${JSON.stringify(payload, null, 2)}`,
        ].join("\n"),
      },
    ],
  });

  const raw = readJsonResponse<{ assignments: Assignment[] }>(
    await stream.finalMessage(),
  );

  const allowed = new Set(categories.map((category) => category.toLowerCase()));
  return (raw.assignments ?? []).filter((assignment) =>
    allowed.has(assignment.category?.toLowerCase() ?? ""),
  );
}
