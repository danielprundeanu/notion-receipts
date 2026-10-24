// Week + season helpers shared by the planner and its history view.
//
// A week is identified by its Monday at LOCAL midnight; that's what the client sends as
// `weekStartIso` and what WeekPlan.weekStart stores (e.g. 2026-10-18T21:00Z in Bucharest).
// Grouping therefore has to happen in the browser's timezone, not on the (UTC) server.

export function getMondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Stored weekStart → that week's local Monday. The +12h keeps a DST shift or a different
// timezone (stored 00:00 reading as Sunday 23:00) from landing on the previous week.
export function mondayFromStored(weekStart: string | Date): Date {
  return getMondayOf(new Date(new Date(weekStart).getTime() + 12 * 3600_000));
}

// Stable local key for a Monday, e.g. "2026-10-19".
export function weekKey(monday: Date): string {
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const d = String(monday.getDate()).padStart(2, "0");
  return `${monday.getFullYear()}-${m}-${d}`;
}

export function formatWeekRange(monday: Date): string {
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  return `${monday.toLocaleDateString("en-US", { day: "numeric", month: "short" })} – ${sunday.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}`;
}

// A week belongs to the month (and so the year/season) its Thursday falls in — the day
// the majority of its days share, same rule as ISO week numbering.
export function weekAnchor(monday: Date): { year: number; month: number } {
  const thursday = new Date(monday);
  thursday.setDate(thursday.getDate() + 3);
  return { year: thursday.getFullYear(), month: thursday.getMonth() };
}

export const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Meteorological seasons (month indexes, in season order).
export const SEASONS = [
  { key: "winter", label: "Winter", emoji: "❄️", months: [11, 0, 1] },
  { key: "spring", label: "Spring", emoji: "🌱", months: [2, 3, 4] },
  { key: "summer", label: "Summer", emoji: "☀️", months: [5, 6, 7] },
  { key: "autumn", label: "Autumn", emoji: "🍂", months: [8, 9, 10] },
] as const;

export type SeasonKey = (typeof SEASONS)[number]["key"];

export function seasonOfMonth(month: number): SeasonKey {
  return SEASONS.find((s) => (s.months as readonly number[]).includes(month))!.key;
}
