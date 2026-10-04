import Anthropic from "@anthropic-ai/sdk";
import { periodBounds, resolveEntryDate } from "./dates";
import type { ParsedScreenshot, ScreenshotKind } from "./types";

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
          date_label: nullableString,
          category: nullableString,
          note: nullableString,
        },
        required: ["merchant", "amount", "date", "date_label", "category", "note"],
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

A category drill-down scrolled past its header looks exactly like a plain transaction
list. If no category header is visible on screen, leave "category" null — never infer it
from the transactions themselves. The app knows which category the screenshot belongs to
and will fill it in.

Rules for amounts:
- Report every amount as a POSITIVE number of currency units, however it is displayed ("-45,20 lei", "45.20 RON" and "−45.20" all become 45.2).
- Revolut uses "." as thousands separator and "," as decimals in several locales: "1.234,56" is 1234.56, while "1,234.56" is also 1234.56. Use the surrounding amounts to decide which convention the screenshot uses.
- Skip incoming money (refunds, top-ups, transfers in) — this app records spending only. Note anything you skipped in "warnings".

Other fields:
- "currency" is the ISO code (RON, EUR, GBP, USD). "lei" means RON.
- "period_label" is the period exactly as displayed ("August", "1 Aug – 31 Aug", "This month").
- "period_start" / "period_end" are ISO dates (YYYY-MM-DD) when the screenshot states or clearly implies them; otherwise null. A bare month name with no year implies nothing — leave them null and say so in "warnings".
- "date" on an entry is an ISO date ONLY when the screenshot shows a complete one, year included. Revolut almost never does, so this is usually null. Do not invent a year.
- "date_label" is the day text shown for that transaction, copied VERBATIM and always filled in when anything is visible — from the row itself or from the day heading it sits under ("14 august", "14.08", "Astăzi", "Ieri", "Aug 14"). Keep the original wording and language; do not normalise it. This is how the app recovers the real date, so an entry with a visible day heading must never have "date_label" null.
- "note" is the note the user wrote on that transaction, shown as its own line of plain text under the row, separate from the merchant name and the amount ("Cadou Bianca", "taxi aeroport"). Copy it verbatim and leave it null when the row has none. It is NOT the merchant's second line: the time, the card, the cashback and the account ("18:16 · -9 lei", "Card ·1234", "Current") are never notes.
- Category names go in verbatim, in the language shown on screen.
- Transcribe only what is legible. If a row is cut off or blurred, leave it out and record it in "warnings" rather than guessing.`;

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

export type RawScreenshot = {
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
    /** The day text exactly as shown ("14 august", "Astăzi"), when there is one. */
    date_label: string | null;
    category: string | null;
    /** The note the user wrote on the transaction, when the row shows one. */
    note: string | null;
  }[];
  warnings: string[];
};

/**
 * Shape what Claude read into a `ParsedScreenshot`.
 *
 * `categoryHint` is the label of the group the user dropped this screenshot into.
 * It matters because a category drill-down scrolled past its header is
 * indistinguishable from the plain account feed — the model is told not to guess,
 * so the grouping is what supplies the category. A header actually visible on
 * screen still wins: it is what the screen says, not what the user remembered.
 *
 * `period` ("YYYY-MM") is the month the user said they are importing. Revolut's
 * screens show a day without a year, so this is what turns "14 august" into a
 * real date — and what fills in the period bounds the screen never states.
 *
 * Pure — no network, so `npm run smoke` covers it.
 */
export function toParsedScreenshot(
  raw: RawScreenshot,
  fileName: string,
  categoryHint?: string | null,
  period?: string | null,
): ParsedScreenshot {
  const header = raw.category?.trim() || null;
  const hint = categoryHint?.trim() || null;
  const category = header ?? hint;
  const warnings = [...(raw.warnings ?? [])];

  if (header && hint && header.toLowerCase() !== hint.toLowerCase()) {
    warnings.push(
      `Grupul spune „${hint}", dar pe ecran scrie „${header}". Am folosit ce scrie pe ecran.`,
    );
  }

  const bounds = periodBounds(period);
  const entries = (raw.entries ?? [])
    .filter((entry) => entry.merchant?.trim())
    .map((entry) => ({
      merchant: entry.merchant.trim(),
      amount: Math.abs(entry.amount),
      date: resolveEntryDate(entry.date, entry.date_label, period),
      category: entry.category?.trim() || category,
      note: entry.note?.trim() || null,
    }));

  const undated = entries.filter((entry) => !entry.date).length;
  if (undated > 0) {
    warnings.push(
      period
        ? `${undated} tranzacții nu au o dată lizibilă pe ecran (etichete de tip „Astăzi" nu spun când a fost făcut screenshot-ul).`
        : `${undated} tranzacții nu au dată: ecranul arată ziua fără an. Alege luna importului în pasul de încărcare.`,
    );
  }

  return {
    fileName,
    kind: raw.kind,
    periodLabel: raw.period_label,
    periodStart: raw.period_start ?? bounds?.start ?? null,
    periodEnd: raw.period_end ?? bounds?.end ?? null,
    currency: raw.currency ? raw.currency.toUpperCase() : null,
    category,
    totals: (raw.totals ?? [])
      .filter((total) => total.category?.trim())
      .map((total) => ({
        category: total.category.trim(),
        amount: Math.abs(total.amount),
      })),
    entries,
    warnings,
  };
}

/** Read one Revolut screenshot into structured data. */
export async function extractScreenshot(
  dataUrl: string,
  fileName: string,
  categoryHint?: string | null,
  period?: string | null,
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
  return toParsedScreenshot(raw, fileName, categoryHint, period);
}
