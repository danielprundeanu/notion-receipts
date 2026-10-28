"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { X, Loader2, ChevronDown, CopyPlus } from "lucide-react";
import { getPlanHistory, copyWeekPlan, type PlanHistoryEntry } from "@/lib/actions";
import { mealLabel, categoryLabel } from "@/lib/labels";
import {
  SEASONS,
  MONTH_LABELS,
  type SeasonKey,
  getMondayOf,
  mondayFromStored,
  weekKey,
  weekAnchor,
  formatWeekRange,
  seasonOfMonth,
} from "@/lib/weeks";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// WeekPlan.mealType values, in display order.
const MEAL_ORDER = ["Breakfast", "Lunch", "Dinner", "Snack"];

type HistoryRecipe = PlanHistoryEntry["recipe"];

type HistoryWeek = {
  key: string;
  monday: Date;
  year: number;
  month: number;
  season: SeasonKey;
  entries: PlanHistoryEntry[];
};

type RecipeStat = { recipe: HistoryRecipe; count: number; last: Date };

function groupWeeks(rows: PlanHistoryEntry[]): HistoryWeek[] {
  const map = new Map<string, HistoryWeek>();
  for (const r of rows) {
    const monday = mondayFromStored(r.weekStart);
    const key = weekKey(monday);
    let w = map.get(key);
    if (!w) {
      const { year, month } = weekAnchor(monday);
      w = { key, monday, year, month, season: seasonOfMonth(month), entries: [] };
      map.set(key, w);
    }
    w.entries.push(r);
  }
  return [...map.values()].sort((a, b) => b.monday.getTime() - a.monday.getTime());
}

function shortDate(d: Date): string {
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function Thumb({ recipe, className }: { recipe: HistoryRecipe; className: string }) {
  if (recipe.imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={recipe.imageUrl} alt="" className={`${className} rounded-md object-cover shrink-0`} />;
  }
  return (
    <div className={`${className} rounded-md shrink-0 bg-orange-100 dark:bg-[#2e2a24] flex items-center justify-center text-[10px] font-semibold text-orange-700 dark:text-orange-300`}>
      {recipe.name.charAt(0)}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 h-10 px-3.5 text-xs font-medium rounded-full border transition-colors flex items-center gap-1 ${
        active
          ? "bg-orange-100 border-orange-300 text-orange-800 dark:bg-orange-500/15 dark:border-orange-500/50 dark:text-orange-300"
          : "bg-white dark:bg-[#24211c] border-gray-200 dark:border-[#3a352e] text-gray-600 dark:text-[#a49c90]"
      }`}
    >
      {children}
    </button>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center -mr-4">
      <span className="w-14 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-[#5c554b]">
        {label}
      </span>
      <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto scrollbar-none pr-4">
        {children}
      </div>
    </div>
  );
}

function WeekCard({
  week,
  open,
  onToggle,
  targetLabel,
  targetCount,
  onImport,
}: {
  week: HistoryWeek;
  open: boolean;
  onToggle: () => void;
  targetLabel: string;
  targetCount: number;
  onImport: (mode: "add" | "replace") => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const distinct = useMemo(() => {
    const seen = new Map<string, HistoryRecipe>();
    for (const e of week.entries) seen.set(e.recipe.id, e.recipe);
    return [...seen.values()];
  }, [week]);

  const byDay = useMemo(() => {
    const days = new Map<number, PlanHistoryEntry[]>();
    for (const e of week.entries) days.set(e.dayOfWeek, [...(days.get(e.dayOfWeek) ?? []), e]);
    for (const list of days.values()) {
      list.sort((a, b) => MEAL_ORDER.indexOf(a.mealType) - MEAL_ORDER.indexOf(b.mealType));
    }
    return [...days.entries()].sort((a, b) => a[0] - b[0]);
  }, [week]);

  async function run(mode: "add" | "replace") {
    setImporting(true);
    setError(null);
    try {
      await onImport(mode);
    } catch {
      setError("Couldn't import this week. Please try again.");
    } finally {
      setImporting(false);
    }
  }

  const season = SEASONS.find((s) => s.key === week.season)!;

  return (
    <div className="rounded-xl border border-gray-100 dark:border-[#2e2a24] bg-white dark:bg-[#24211c] overflow-hidden">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-gray-50 dark:hover:bg-[#2c2822] transition-colors"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-[#eae5de]">
            {formatWeekRange(week.monday)}
          </p>
          <p className="text-xs text-gray-400 dark:text-[#7c756a] mt-0.5">
            {season.emoji} {plural(week.entries.length, "meal")} · {plural(distinct.length, "recipe")}
          </p>
        </div>
        <div className="flex -space-x-2 shrink-0">
          {distinct.slice(0, 4).map((r) => (
            <Thumb key={r.id} recipe={r} className="w-8 h-8 ring-2 ring-white dark:ring-[#24211c]" />
          ))}
        </div>
        <ChevronDown
          size={16}
          className={`shrink-0 text-gray-400 dark:text-[#5c554b] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="px-3 pb-3 border-t border-gray-100 dark:border-[#2e2a24]">
          <div className="py-3 space-y-3">
            {byDay.map(([day, entries]) => {
              const date = new Date(week.monday);
              date.setDate(date.getDate() + day);
              return (
                <div key={day}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-[#5c554b] mb-1.5">
                    {DAYS[day]} · {shortDate(date)}
                  </p>
                  <ul className="space-y-1.5">
                    {entries.map((e, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <Thumb recipe={e.recipe} className="w-7 h-7" />
                        <span className="text-sm text-gray-800 dark:text-[#eae5de] truncate flex-1 min-w-0">
                          {e.recipe.name}
                        </span>
                        <span className="text-[11px] text-gray-400 dark:text-[#7c756a] shrink-0">
                          {mealLabel(e.mealType)} · {e.servings}×
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {error && <p className="text-xs text-red-600 dark:text-red-400 mb-2">{error}</p>}

          {confirming ? (
            <div className="rounded-lg bg-orange-50 dark:bg-[#2d1a08] border border-orange-100 dark:border-orange-900/40 p-3">
              <p className="text-xs text-gray-700 dark:text-[#bab2a6] mb-2.5">
                {targetLabel.charAt(0).toUpperCase() + targetLabel.slice(1)} already has{" "}
                {plural(targetCount, "meal")}. Keep them and add these, or replace them?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => run("add")}
                  disabled={importing}
                  className="flex-1 h-10 rounded-lg bg-orange-500 text-gray-900 text-sm font-medium hover:bg-orange-600 disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5"
                >
                  {importing && <Loader2 size={13} className="animate-spin" />}
                  Keep &amp; add
                </button>
                <button
                  onClick={() => run("replace")}
                  disabled={importing}
                  className="flex-1 h-10 rounded-lg border border-orange-300 dark:border-orange-800/60 text-orange-700 dark:text-orange-300 text-sm font-medium hover:bg-orange-100 dark:hover:bg-orange-950/40 disabled:opacity-40 transition-colors"
                >
                  Replace
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  disabled={importing}
                  className="h-10 px-3 rounded-lg text-sm text-gray-500 dark:text-[#7c756a] hover:bg-gray-100 dark:hover:bg-[#2c2822] disabled:opacity-40"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => (targetCount > 0 ? setConfirming(true) : run("add"))}
              disabled={importing}
              className="w-full h-11 rounded-lg bg-orange-500 text-gray-900 text-sm font-medium hover:bg-orange-600 disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5"
            >
              {importing ? <Loader2 size={14} className="animate-spin" /> : <CopyPlus size={15} />}
              Import into {targetLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function PlanHistorySheet({
  targetWeek,
  targetCount,
  onClose,
  onImported,
}: {
  // The week the planner is showing — imports land here.
  targetWeek: Date;
  // Meals already planned in the target week (decides whether to ask add vs replace).
  targetCount: number;
  onClose: () => void;
  onImported: (copied: number) => void;
}) {
  const [rows, setRows] = useState<PlanHistoryEntry[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [year, setYear] = useState<number | null>(null);
  const [season, setSeason] = useState<SeasonKey | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [tab, setTab] = useState<"weeks" | "recipes">("weeks");
  const [openWeek, setOpenWeek] = useState<string | null>(null);

  const fetchHistory = useCallback(() => {
    // History = up to and including the current calendar week; weeks planned ahead aren't history.
    const nextMonday = getMondayOf(new Date());
    nextMonday.setDate(nextMonday.getDate() + 7);
    getPlanHistory(nextMonday.toISOString()).then(setRows, () => setLoadError(true));
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  function retry() {
    setLoadError(false);
    setRows(null);
    fetchHistory();
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const targetKey = weekKey(targetWeek);
  const isCurrentWeek = targetKey === weekKey(getMondayOf(new Date()));
  const targetLabel = isCurrentWeek ? "this week" : formatWeekRange(targetWeek);

  // The target week itself is left out — importing a week into itself makes no sense.
  const weeks = useMemo(
    () => groupWeeks(rows ?? []).filter((w) => w.key !== targetKey),
    [rows, targetKey]
  );
  const years = useMemo(() => [...new Set(weeks.map((w) => w.year))].sort((a, b) => b - a), [weeks]);
  const inYear = weeks.filter((w) => year === null || w.year === year);
  const inSeason = inYear.filter((w) => season === null || w.season === season);
  const visible = inSeason.filter((w) => month === null || w.month === month);

  // A season shows its own three months; otherwise only months that have weeks.
  const monthOptions: number[] = season
    ? [...SEASONS.find((s) => s.key === season)!.months]
    : [...new Set([...inYear.map((w) => w.month), ...(month !== null ? [month] : [])])].sort((a, b) => a - b);

  const stats = new Map<string, RecipeStat>();
  for (const w of visible) {
    for (const e of w.entries) {
      const s = stats.get(e.recipe.id);
      if (s) {
        s.count++;
        if (w.monday > s.last) s.last = w.monday;
      } else {
        stats.set(e.recipe.id, { recipe: e.recipe, count: 1, last: w.monday });
      }
    }
  }
  const recipeStats = [...stats.values()].sort(
    (a, b) => b.count - a.count || b.last.getTime() - a.last.getTime()
  );

  const filtered = year !== null || season !== null || month !== null;
  function clearFilters() {
    setYear(null);
    setSeason(null);
    setMonth(null);
  }

  async function handleImport(week: HistoryWeek, mode: "add" | "replace") {
    const { copied } = await copyWeekPlan(week.monday.toISOString(), targetWeek.toISOString(), mode);
    onImported(copied);
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/30 dark:bg-black/50 flex justify-end"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Plan history"
        className="bg-[#fbfaf8] dark:bg-[#1a1714] w-full md:max-w-xl h-full flex flex-col shadow-xl"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between pl-4 pr-1 pb-2 shrink-0"
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
        >
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-[#eae5de]">History</h2>
            <p className="text-xs text-gray-400 dark:text-[#7c756a] truncate">
              Imports go into {isCurrentWeek ? `this week (${formatWeekRange(targetWeek)})` : targetLabel}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close history"
            className="p-3 text-gray-400 dark:text-[#5c554b] hover:text-gray-600 dark:hover:text-[#a49c90]"
          >
            <X size={18} />
          </button>
        </div>

        {/* Filters */}
        <div className="px-4 pb-3 space-y-1.5 shrink-0">
          <FilterRow label="Year">
            <Chip active={year === null} onClick={() => setYear(null)}>All</Chip>
            {years.map((y) => (
              <Chip key={y} active={year === y} onClick={() => setYear(year === y ? null : y)}>
                {y}
              </Chip>
            ))}
          </FilterRow>
          <FilterRow label="Season">
            <Chip active={season === null} onClick={() => { setSeason(null); setMonth(null); }}>All</Chip>
            {SEASONS.map((s) => {
              const n = inYear.filter((w) => w.season === s.key).length;
              return (
                <Chip
                  key={s.key}
                  active={season === s.key}
                  onClick={() => { setSeason(season === s.key ? null : s.key); setMonth(null); }}
                >
                  <span aria-hidden>{s.emoji}</span> {s.label}
                  <span className={season === s.key ? "opacity-80" : "opacity-50"}>{n}</span>
                </Chip>
              );
            })}
          </FilterRow>
          <FilterRow label="Month">
            <Chip active={month === null} onClick={() => setMonth(null)}>All</Chip>
            {monthOptions.map((m) => (
              <Chip key={m} active={month === m} onClick={() => setMonth(month === m ? null : m)}>
                {MONTH_LABELS[m]}
              </Chip>
            ))}
          </FilterRow>
        </div>

        {/* Tabs */}
        <div className="px-4 pb-3 shrink-0">
          <div className="flex p-1 bg-gray-100 dark:bg-[#24211c] rounded-lg">
            {(["weeks", "recipes"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                aria-pressed={tab === t}
                className={`flex-1 h-9 text-sm font-medium rounded-md transition-colors ${
                  tab === t
                    ? "bg-white dark:bg-[#3a352e] text-gray-900 dark:text-[#eae5de] shadow-sm"
                    : "text-gray-500 dark:text-[#7c756a]"
                }`}
              >
                {t === "weeks" ? `Weeks · ${visible.length}` : `Recipes · ${recipeStats.length}`}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div
          className="flex-1 overflow-y-auto px-4"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          {loadError ? (
            <div className="text-center py-10">
              <p className="text-sm text-gray-500 dark:text-[#a49c90] mb-3">Couldn&apos;t load the history.</p>
              <button
                onClick={retry}
                className="px-4 h-10 text-sm rounded-lg border border-gray-200 dark:border-[#3a352e] text-gray-700 dark:text-[#bab2a6] hover:bg-gray-50 dark:hover:bg-[#2c2822]"
              >
                Retry
              </button>
            </div>
          ) : rows === null ? (
            <div className="flex justify-center py-10">
              <Loader2 size={18} className="animate-spin text-gray-400" />
            </div>
          ) : weeks.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-[#7c756a] text-center py-10">
              No past weeks yet. Planned weeks show up here.
            </p>
          ) : visible.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-sm text-gray-400 dark:text-[#7c756a] mb-3">No weeks match these filters.</p>
              <button
                onClick={clearFilters}
                className="px-4 h-10 text-sm rounded-lg border border-gray-200 dark:border-[#3a352e] text-gray-700 dark:text-[#bab2a6] hover:bg-gray-50 dark:hover:bg-[#2c2822]"
              >
                Clear filters
              </button>
            </div>
          ) : tab === "weeks" ? (
            <div className="space-y-2">
              {visible.map((w) => (
                <WeekCard
                  key={w.key}
                  week={w}
                  open={openWeek === w.key}
                  onToggle={() => setOpenWeek(openWeek === w.key ? null : w.key)}
                  targetLabel={targetLabel}
                  targetCount={targetCount}
                  onImport={(mode) => handleImport(w, mode)}
                />
              ))}
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-400 dark:text-[#7c756a] mb-2">
                {filtered ? "Cooked in this period" : "Cooked so far"}, most planned first.
              </p>
              <ul className="space-y-0.5">
                {recipeStats.map(({ recipe, count, last }) => {
                  const firstCat = recipe.category?.split(",")[0]?.trim();
                  return (
                    <li key={recipe.id}>
                      <Link
                        href={`/recipes/${recipe.id}`}
                        className="flex items-center gap-3 px-2 py-2.5 -mx-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[#24211c] transition-colors"
                      >
                        <Thumb recipe={recipe} className="w-11 h-11" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-[#eae5de] truncate">
                            {recipe.name}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-[#7c756a] truncate">
                            {firstCat ? `${categoryLabel(firstCat)} · ` : ""}last {shortDate(last)}{" "}
                            {last.getFullYear()}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs font-semibold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 rounded-full px-2 py-0.5">
                          {count}×
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
