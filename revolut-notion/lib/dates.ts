/**
 * Turning what a screenshot shows into a real date.
 *
 * Revolut's mobile screens label transactions with a day and no year — "14
 * august", "14.08", or a relative "Astăzi". That is not enough for an ISO date,
 * so Claude is told to transcribe the label verbatim and leave `date` null; the
 * year comes from the month the user says they are importing.
 *
 * Pure: no network, covered by `npm run smoke`.
 */
import { parseMonth } from "./months";

const FULL_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Labels that only mean something relative to when the screenshot was taken. */
const RELATIVE = /^(azi|astazi|ieri|alaltaieri|today|yesterday|tomorrow)$/;

function normalise(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** "2026-08" → { year, month }, or null when it is not a month key. */
export function parsePeriod(period: string | null | undefined): {
  year: number;
  month: number;
} | null {
  const match = (period ?? "").trim().match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

/**
 * Resolve one entry's date.
 *
 * `iso` is used as-is when Claude could read a complete date off the screen.
 * Otherwise `label` is the verbatim day text and `period` ("YYYY-MM") supplies
 * the missing year. Returns null when the date cannot be established — the
 * caller must surface that rather than substituting today, which is how every
 * row of the first import silently became the day it ran.
 */
export function resolveEntryDate(
  iso: string | null | undefined,
  label: string | null | undefined,
  period: string | null | undefined,
): string | null {
  const trimmedIso = (iso ?? "").trim();
  if (FULL_ISO.test(trimmedIso)) return trimmedIso;

  const parsedPeriod = parsePeriod(period);
  const text = normalise(label ?? "");
  if (!text || !parsedPeriod) return null;
  if (RELATIVE.test(text)) return null;

  let day: number | null = null;
  let month: number | null = null;
  let year: number | null = null;

  for (const word of text.split(/[^a-z0-9]+/).filter(Boolean)) {
    if (/^\d{4}$/.test(word)) {
      // An explicit year on the label beats the period we were given.
      if (year === null) year = Number(word);
      continue;
    }
    if (/^\d{1,2}$/.test(word)) {
      const value = Number(word);
      if (day === null && value >= 1 && value <= 31) day = value;
      else if (month === null && value >= 1 && value <= 12) month = value;
      continue;
    }
    const named = parseMonth(word);
    if (named !== null && month === null) month = named;
  }

  if (day === null) return null;
  if (month === null) month = parsedPeriod.month;

  if (year === null) {
    // A screenshot of January can show December of the year before; it can
    // never show a month that has not happened yet.
    year = month > parsedPeriod.month ? parsedPeriod.year - 1 : parsedPeriod.year;
  }

  if (day > daysInMonth(year, month)) return null;

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** First and last day of a "YYYY-MM" period, for screenshots that state no dates. */
export function periodBounds(
  period: string | null | undefined,
): { start: string; end: string } | null {
  const parsed = parsePeriod(period);
  if (!parsed) return null;
  const month = String(parsed.month).padStart(2, "0");
  const last = daysInMonth(parsed.year, parsed.month);
  return {
    start: `${parsed.year}-${month}-01`,
    end: `${parsed.year}-${month}-${last}`,
  };
}
