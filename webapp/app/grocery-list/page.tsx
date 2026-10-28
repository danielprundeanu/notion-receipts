"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Copy, CalendarDays, Eye, EyeOff, Loader2, Plus, Trash2, X } from "lucide-react";
import {
  getGroceryList,
  addGroceryListItems,
  deleteGroceryListItem,
  deleteGroceryListItems,
  type GroceryEntry,
  type ShoppingLine,
} from "@/lib/actions";
import { AISLES, aisleOf } from "@/lib/aisles";
import { mealLabel } from "@/lib/labels";
import { exactAmount, formatShoppingAmounts } from "@/lib/quantities";
import { normalizeSearch } from "@/lib/search";
import { parseIngredientBlock } from "@/lib/shopping-lines";
import { addWeeks, getMondayOf, relativeWeekTitle, shortWeekRange } from "@/lib/weeks";
import { Sheet } from "@/components/Sheet";
import { MEALS, type MealType } from "@/components/planner/shared";

type Group = { key: string; emoji: string; title: string; short: string; items: ShoppingLine[] };
type Toast = { text: string; error?: boolean; undo?: () => void };

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HIDE_KEY = "grocery-hide-ticked";

function manualLine(e: GroceryEntry): ShoppingLine {
  return {
    id: e.id,
    name: e.name,
    category: e.category,
    amounts: e.quantity > 0 ? [{ quantity: e.quantity, unit: e.unit }] : [],
    staple: false,
    manual: true,
    sources: [],
  };
}

// Same key the server de-dupes hand-added products on (name + unit, case-folded).
const dupKey = (name: string, unit: string | null | undefined) =>
  `${name.trim().toLowerCase()}::${(unit ?? "").trim().toLowerCase()}`;

function byName(a: ShoppingLine, b: ShoppingLine): number {
  return a.name.localeCompare(b.name);
}

// The recipes a line comes from, each with the meals it's planned for and how much
// that meal needs. Opened by tapping the line's amount.
function SourceRecipes({ line }: { line: ShoppingLine }) {
  const sources = [...line.sources].sort(
    (a, b) => a.dayOfWeek - b.dayOfWeek || MEALS.indexOf(a.mealType as MealType) - MEALS.indexOf(b.mealType as MealType)
  );
  const recipes: { id: string; name: string; meals: { when: string; amount: string }[] }[] = [];
  for (const s of sources) {
    let r = recipes.find((x) => x.id === s.recipeId);
    if (!r) {
      r = { id: s.recipeId, name: s.recipeName, meals: [] };
      recipes.push(r);
    }
    r.meals.push({
      when: `${DAYS[s.dayOfWeek] ?? ""} · ${mealLabel(s.mealType).toLowerCase()}`,
      amount: s.quantity > 0 ? exactAmount(s.quantity, s.unit) : "to taste",
    });
  }
  const qty = formatShoppingAmounts(line.amounts) || "To taste";
  const forWhat = recipes.length === 1 ? "1 recipe" : `${recipes.length} recipes`;
  return (
    <>
      <p className="mt-1 text-[15px] text-gray-600 dark:text-[#a49c90]">
        {qty} this week, for {forWhat}
        {sources.length > recipes.length ? ` in ${sources.length} meals` : ""}.
      </p>
      <ul>
        {recipes.map((r) => (
          <li key={r.id}>
            <Link
              href={`/recipes/${r.id}`}
              className="mt-2.5 block rounded-2xl border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] px-3.5 py-3 active:bg-gray-50 dark:active:bg-[#2e2a24]"
            >
              <span className="flex items-center gap-2">
                <span className="flex-1 min-w-0 text-base font-semibold leading-snug text-gray-900 dark:text-[#eae5de]">{r.name}</span>
                <ChevronRight size={16} className="shrink-0 text-gray-400 dark:text-[#8f877b]" />
              </span>
              {r.meals.map((m, i) => (
                <span key={i} className="mt-1.5 flex justify-between gap-3 text-sm">
                  <span className="text-gray-600 dark:text-[#a49c90]">{m.when}</span>
                  <span className="font-semibold text-gray-900 dark:text-[#eae5de]">{m.amount}</span>
                </span>
              ))}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

// "Next week" / "In 3 weeks" / "2 weeks ago" — relative to the week on screen.
function weekOffsetLabel(from: Date, to: Date): string {
  const weeks = Math.round((to.getTime() - from.getTime()) / (7 * 24 * 3600_000));
  if (weeks === 0) return "The week you are viewing";
  if (weeks === 1) return "Next week";
  if (weeks === -1) return "Last week";
  return weeks > 0 ? `In ${weeks} weeks` : `${Math.abs(weeks)} weeks ago`;
}

export default function GroceryListPage() {
  const [monday, setMonday] = useState(() => getMondayOf(new Date()));
  const weekIso = monday.toISOString();
  const [lines, setLines] = useState<ShoppingLine[]>([]);
  const [meals, setMeals] = useState(0);
  const [loadedWeek, setLoadedWeek] = useState<string | null>(null);
  const [failedWeek, setFailedWeek] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Ticked = got it. A ticked line stays where it is, crossed out (or hidden). Kept per
  // device and per week, so ticks survive a reload mid-shop.
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [hideTicked, setHideTicked] = useState(false);
  const [showStaples, setShowStaples] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  // The line whose recipes are open in a sheet.
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addText, setAddText] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  // Selecting hand-added products to copy them to another week, or delete them.
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copyTarget, setCopyTarget] = useState<Date | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const jumpingUntil = useRef(0);

  const checkedKey = `grocery-checked:${weekIso}`;

  useEffect(() => {
    let current = true;
    getGroceryList(weekIso)
      .then((data) => {
        if (!current) return;
        setLines(data.lines);
        setMeals(data.meals);
        try {
          const saved = localStorage.getItem(`grocery-checked:${weekIso}`);
          setChecked(saved ? new Set(JSON.parse(saved) as string[]) : new Set());
        } catch {
          setChecked(new Set());
        }
        setLoadedWeek(weekIso);
      })
      .catch(() => {
        if (current) setFailedWeek(weekIso);
      });
    return () => {
      current = false;
    };
  }, [weekIso, attempt]);

  const loadError = failedWeek === weekIso && loadedWeek !== weekIso;
  const loading = loadedWeek !== weekIso && !loadError;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.undo ? 8000 : 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Hiding ticked lines is a per-device preference, like the ticks themselves.
  useEffect(() => {
    try {
      setHideTicked(localStorage.getItem(HIDE_KEY) === "1");
    } catch {
      // Storage blocked: ticked lines simply start visible.
    }
  }, []);

  function toggleHideTicked() {
    setHideTicked((on) => {
      try {
        localStorage.setItem(HIDE_KEY, on ? "0" : "1");
      } catch {
        // Not remembered, but it still applies until the page reloads.
      }
      return !on;
    });
  }

  function shiftWeek(weeks: number) {
    setMonday((m) => addWeeks(m, weeks));
    setSelectMode(false);
    setSelected(new Set());
    setConfirmDelete(false);
    setActive(null);
    setSourceId(null);
  }

  // Persist on change (keyed to this week) rather than in an effect, so a week change
  // can never write one week's ticks under another week's key.
  function setTicked(id: string, on: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      try {
        localStorage.setItem(checkedKey, JSON.stringify([...next]));
      } catch {
        // Storage blocked: the tick still shows, it just won't survive a reload.
      }
      return next;
    });
  }

  function tick(line: ShoppingLine) {
    const on = !checked.has(line.id);
    setTicked(line.id, on);
    // With ticked lines hidden the row vanishes, so offer a way back.
    if (on && hideTicked) {
      setToast({ text: `${line.name} ticked`, undo: () => { setToast(null); setTicked(line.id, false); } });
    }
  }

  // ── Sections ──
  const isTicked = (l: ShoppingLine) => checked.has(l.id);
  const listed = (l: ShoppingLine) => !(hideTicked && isTicked(l));
  const left = (items: ShoppingLine[]) => items.filter((l) => !isTicked(l)).length;
  const countable = lines.filter((l) => !l.staple);
  const added = countable.filter((l) => l.manual && listed(l));
  const groups: Group[] = [
    ...(added.length ? [{ key: "added", emoji: "✍️", title: "Added by you", short: "Added", items: added }] : []),
    ...AISLES.map((a) => ({
      key: a.key as string,
      emoji: a.emoji as string,
      title: a.title as string,
      short: a.short as string,
      items: countable.filter((l) => !l.manual && aisleOf(l.category) === a.key && listed(l)),
    })),
  ].filter((g) => g.items.length > 0);
  const staples = lines.filter((l) => l.staple && listed(l));
  const done = countable.filter(isTicked).length;
  const tickedCount = lines.filter(isTicked).length;
  const chips = [
    ...groups.map((g) => ({ key: g.key, emoji: g.emoji, label: g.short, count: left(g.items) })),
    ...(staples.length ? [{ key: "home", emoji: "🏠", label: "At home", count: left(staples) }] : []),
  ];
  const activeKey = active ?? chips[0]?.key ?? null;
  const manualLines = lines.filter((l) => l.manual);
  const selectedLines = manualLines.filter((l) => selected.has(l.id));
  const sourceLine = sourceId ? lines.find((l) => l.id === sourceId) ?? null : null;

  // What the add sheet would add: one row per line typed or pasted.
  const existingKeys = new Set(manualLines.map((l) => dupKey(l.name, l.amounts[0]?.unit)));
  const seenKeys = new Set<string>();
  const preview = parseIngredientBlock(addText).map((p, i) => {
    const key = dupKey(p.name, p.unit);
    const onList = existingKeys.has(key);
    const twice = !onList && seenKeys.has(key);
    seenKeys.add(key);
    const fromRecipes = lines.find((l) => !l.manual && normalizeSearch(l.name) === normalizeSearch(p.name));
    const note = onList
      ? "Already on the list. It will be skipped."
      : twice
        ? "Listed twice. It's added once."
        : fromRecipes
          ? `Also on the list from recipes (${formatShoppingAmounts(fromRecipes.amounts) || "to taste"}).`
          : null;
    return { ...p, i, note, skip: onList || twice };
  });
  const toAdd = preview.filter((p) => !p.skip);

  // ── Scroll-spy: the chip of the section under the sticky bar lights up ──
  const hasBar = !loading && !loadError && lines.length > 0;
  useEffect(() => {
    const bar = barRef.current;
    const scroller = bar?.closest("main");
    if (!bar || !scroller) return;
    let frame = 0;
    const onScroll = () => {
      // While a chip tap is smooth-scrolling, keep that chip lit instead of flickering
      // through every section it passes — each scroll event extends the hold.
      if (Date.now() < jumpingUntil.current) {
        jumpingUntil.current = Date.now() + 150;
        return;
      }
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const limit = bar.getBoundingClientRect().bottom + 8;
        let current: string | null = null;
        for (const el of scroller.querySelectorAll<HTMLElement>("[data-section]")) {
          if (el.getBoundingClientRect().top <= limit) current = el.dataset.section ?? null;
        }
        setActive(current);
      });
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [loadedWeek, hasBar]);

  // Keep the lit chip visible in the chip row.
  useEffect(() => {
    const row = chipsRef.current;
    const chip = row?.querySelector<HTMLElement>(`[data-chip="${activeKey}"]`);
    if (row && chip) row.scrollTo({ left: Math.max(0, chip.offsetLeft - 16), behavior: "smooth" });
  }, [activeKey]);

  function jumpTo(key: string) {
    if (key === "home") setShowStaples(true);
    setActive(key);
    jumpingUntil.current = Date.now() + 800;
    // A section's header doesn't move when it expands (its rows open below it), so the
    // target can be measured right away. Land it under the bar where the bar will be
    // once stuck (top of the scroller) — near the top of the page it hasn't stuck yet.
    const el = document.getElementById(`shop-${key}`);
    const bar = barRef.current;
    const scroller = bar?.closest("main");
    if (!el || !bar || !scroller) return;
    scroller.scrollTo({
      top: scroller.scrollTop + el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - bar.offsetHeight,
      behavior: "smooth",
    });
  }

  // ── Hand-added products ──
  function openAdd() {
    setAddError(null);
    setAddOpen(true);
  }

  async function addItems() {
    if (!toAdd.length || adding) return;
    setAdding(true);
    setAddError(null);
    try {
      const res = await addGroceryListItems(
        weekIso,
        toAdd.map((p) => ({ name: p.name, quantity: p.qty, unit: p.unit, category: "Other" }))
      );
      if (res.added.length) setLines((prev) => [...prev, ...res.added.map(manualLine)].sort(byName));
      setAddOpen(false);
      setAddText("");
      const n = res.added.length;
      setToast({
        text: n
          ? `${n === 1 ? res.added[0].name : `${n} items`} added${res.skipped ? ` · ${res.skipped} already here` : ""}`
          : "All of them were already on this week's list",
        undo: n ? () => removeManual(res.added.map((a) => a.id), "Couldn't undo. They're still on the list.") : undefined,
      });
    } catch {
      // Keep the sheet and what was typed, so nothing has to be retyped.
      setAddError("Couldn't add them. Check your connection and try again.");
    } finally {
      setAdding(false);
    }
  }

  // Optimistic delete of hand-added rows; put them back with a message if it fails.
  async function removeManual(ids: string[], failText: string): Promise<boolean> {
    const removed = lines.filter((l) => ids.includes(l.id));
    setToast(null);
    setLines((prev) => prev.filter((l) => !ids.includes(l.id)));
    try {
      const dbIds = ids.map((id) => id.replace(/^manual::/, ""));
      if (dbIds.length === 1) await deleteGroceryListItem(dbIds[0]);
      else await deleteGroceryListItems(dbIds);
      return true;
    } catch {
      setLines((prev) => [...prev, ...removed].sort(byName));
      setToast({ text: failText, error: true });
      return false;
    }
  }

  async function deleteSelected() {
    setBusy(true);
    const n = selectedLines.length;
    const ok = await removeManual(selectedLines.map((l) => l.id), "Couldn't delete them. Try again.");
    setBusy(false);
    setConfirmDelete(false);
    if (ok) {
      setSelectMode(false);
      setSelected(new Set());
      setToast({ text: `${n} product${n === 1 ? "" : "s"} deleted` });
    }
  }

  async function copySelected() {
    if (!copyTarget || !selectedLines.length) return;
    setBusy(true);
    try {
      const payload = selectedLines.map((l) => ({
        name: l.name,
        quantity: l.amounts[0]?.quantity ?? null,
        unit: l.amounts[0]?.unit ?? null,
        category: l.category,
      }));
      const res = await addGroceryListItems(copyTarget.toISOString(), payload);
      const sameWeek = copyTarget.getTime() === monday.getTime();
      if (sameWeek && res.added.length) setLines((prev) => [...prev, ...res.added.map(manualLine)].sort(byName));
      const where = shortWeekRange(copyTarget);
      setCopyTarget(null);
      setSelectMode(false);
      setSelected(new Set());
      setToast({
        text: res.added.length
          ? `${res.added.length} copied to ${where}${res.skipped ? ` · ${res.skipped} already there` : ""}`
          : `All of them were already in ${where}`,
        undo: res.added.length
          ? async () => {
              setToast(null);
              try {
                await deleteGroceryListItems(res.added.map((a) => a.id.replace(/^manual::/, "")));
                if (sameWeek) setLines((prev) => prev.filter((l) => !res.added.some((a) => a.id === l.id)));
              } catch {
                setToast({ text: "Couldn't undo. The copies are still there.", error: true });
              }
            }
          : undefined,
      });
    } catch {
      setToast({ text: "Couldn't copy the products. Try again.", error: true });
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    const text = [
      `Shopping list · ${shortWeekRange(monday)}`,
      ...groups.flatMap((g) => {
        const items = g.items.filter((l) => !isTicked(l));
        return items.length
          ? [
              "",
              `${g.emoji} ${g.title.toUpperCase()}`,
              ...items.map((l) => {
                const q = formatShoppingAmounts(l.amounts);
                return `• ${l.name}${q ? ` — ${q}` : ""}`;
              }),
            ]
          : [];
      }),
    ].join("\n");
    if (navigator.share) {
      try {
        await navigator.share({ title: "Shopping list", text });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setToast({ text: "List copied" });
    } catch {
      setToast({ text: "Couldn't share the list.", error: true });
    }
  }

  // ── Rendering ──
  function row(line: ShoppingLine, opts: { onDelete?: () => void } = {}) {
    const ticked = isTicked(line);
    // A line every recipe leaves "to taste" has no amount, but its recipes still open.
    const qty = formatShoppingAmounts(line.amounts) || (line.sources.length ? "to taste" : "");
    const picking = selectMode && !!line.manual;
    const picked = selected.has(line.id);
    const qtyCls = `text-[15px] font-semibold text-gray-600 dark:text-[#a49c90] ${ticked ? "opacity-45 line-through" : ""}`;
    return (
      <li key={line.id} className="flex items-stretch">
        <button
          type="button"
          onClick={() =>
            picking
              ? setSelected((prev) => {
                  const next = new Set(prev);
                  if (next.has(line.id)) next.delete(line.id);
                  else next.add(line.id);
                  return next;
                })
              : tick(line)
          }
          aria-pressed={picking ? picked : ticked}
          className={`flex-1 min-w-0 min-h-[52px] flex items-center gap-3.5 pl-4 pr-2 py-1.5 text-left transition-colors ${
            picking && picked ? "bg-orange-50 dark:bg-orange-500/10" : "active:bg-gray-50 dark:active:bg-[#24211c]"
          }`}
        >
          <span
            aria-hidden
            className={`w-[26px] h-[26px] shrink-0 border-2 flex items-center justify-center transition-colors ${
              picking ? "rounded-md" : "rounded-full"
            } ${
              (picking ? picked : ticked)
                ? "bg-orange-500 border-orange-500 text-white"
                : "border-gray-300 dark:border-[#3a352e]"
            }`}
          >
            {(picking ? picked : ticked) && <Check size={14} strokeWidth={3} />}
          </span>
          <span className={`flex-1 min-w-0 text-base leading-snug text-gray-900 dark:text-[#eae5de] ${ticked ? "opacity-45 line-through" : ""}`}>
            {line.name}
          </span>
        </button>
        {/* The amount opens the recipes it comes from; the rest of the row ticks. */}
        {qty && line.sources.length > 0 && !picking ? (
          <button
            type="button"
            onClick={() => setSourceId(line.id)}
            aria-label={`${qty} ${line.name}: show the recipes it's for`}
            className="shrink-0 min-w-14 pl-2 pr-4 flex items-center justify-end text-right active:bg-gray-50 dark:active:bg-[#24211c] transition-colors"
          >
            <span className={qtyCls}>{qty}</span>
          </button>
        ) : (
          qty && <span className={`shrink-0 pl-2 flex items-center text-right ${opts.onDelete && !selectMode ? "" : "pr-4"} ${qtyCls}`}>{qty}</span>
        )}
        {opts.onDelete && !selectMode && (
          <button
            type="button"
            onClick={opts.onDelete}
            aria-label={`Delete ${line.name}`}
            className="w-11 h-11 my-auto mr-2 shrink-0 flex items-center justify-center rounded-xl text-gray-400 dark:text-[#7c756a] hover:text-red-600 dark:hover:text-red-400"
          >
            <Trash2 size={16} />
          </button>
        )}
      </li>
    );
  }

  const sectionHead = "scroll-mt-4 flex items-center justify-between gap-2 px-4 pt-4 pb-1.5 text-[13px] font-semibold tracking-[.04em] uppercase text-gray-500 dark:text-[#a49c90]";
  const toggleRow = "w-full h-[52px] flex items-center justify-between px-4 border-t border-gray-100 dark:border-[#3a352e] text-[15px] font-semibold text-gray-900 dark:text-[#eae5de]";
  const smallBtn = "h-9 px-2.5 rounded-lg text-xs font-semibold normal-case tracking-normal";
  const sheetBtn = "flex-1 h-12 rounded-[14px] border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-[15px] font-semibold text-gray-900 dark:text-[#eae5de]";
  const sheetMainBtn = "flex-1 h-12 rounded-[14px] bg-orange-500 hover:bg-orange-600 text-white text-base font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-colors";

  return (
    <div className="max-w-2xl mx-auto md:px-8 md:pt-8 flex flex-col min-h-[calc(100dvh-5rem-env(safe-area-inset-bottom))] md:min-h-dvh">
      {/* Header */}
      <div className="px-4 pt-4 md:px-0 md:pt-0">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-3xl text-gray-900 dark:text-[#eae5de]">Shopping list</h1>
          <button
            type="button"
            onClick={share}
            disabled={done === countable.length}
            aria-label="Share the list"
            className="w-11 h-11 rounded-[14px] border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-gray-600 dark:text-[#a49c90] flex items-center justify-center disabled:opacity-40"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
            </svg>
          </button>
        </div>
        <div className="mt-1 -ml-2.5 flex items-center gap-0.5">
          <button type="button" onClick={() => shiftWeek(-1)} aria-label="Previous week" className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-600 dark:text-[#a49c90] hover:bg-gray-100 dark:hover:bg-[#24211c]">
            <ChevronLeft size={18} />
          </button>
          <p className="text-sm text-gray-600 dark:text-[#a49c90]">
            <span className="font-semibold text-gray-900 dark:text-[#eae5de]">{relativeWeekTitle(monday)}</span> · {shortWeekRange(monday)}
            {!loading && meals > 0 && ` · from ${meals} planned meal${meals === 1 ? "" : "s"}`}
          </p>
          <button type="button" onClick={() => shiftWeek(1)} aria-label="Next week" className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-600 dark:text-[#a49c90] hover:bg-gray-100 dark:hover:bg-[#24211c]">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Sticky progress + section chips */}
      {hasBar && (
        <div ref={barRef} className="sticky top-0 z-20 mt-2 bg-[var(--color-bg-base)] border-b border-gray-100 dark:border-[#3a352e]">
          <div className="px-4 md:px-0 pt-3 flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-[#2e2a24] overflow-hidden">
              <div
                className="h-2 rounded-full bg-orange-500 transition-[width] duration-300"
                style={{ width: `${countable.length ? Math.round((done / countable.length) * 100) : 0}%` }}
              />
            </div>
            <span className="text-sm font-semibold text-gray-900 dark:text-[#eae5de]">
              {done} of {countable.length}
            </span>
          </div>
          <div ref={chipsRef} className="relative flex gap-2 overflow-x-auto scrollbar-none px-4 md:px-0 py-3">
            {chips.map((c) => {
              const on = c.key === activeKey;
              return (
                <button
                  key={c.key}
                  type="button"
                  data-chip={c.key}
                  onClick={() => jumpTo(c.key)}
                  aria-pressed={on}
                  className={`shrink-0 h-10 px-3.5 rounded-full border flex items-center gap-1.5 text-sm font-semibold transition-colors ${
                    on
                      ? "bg-orange-500 border-orange-500 text-gray-900"
                      : "bg-white dark:bg-[#24211c] border-gray-200 dark:border-[#3a352e] text-gray-600 dark:text-[#a49c90]"
                  }`}
                >
                  <span aria-hidden>{c.emoji}</span>
                  {c.label}
                  <span className={`text-xs ${on ? "opacity-85" : "opacity-70"}`}>{c.count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* List */}
      <div className="flex-1">
        {loading ? (
          <div className="px-4 md:px-0 pt-5 space-y-3 animate-pulse" aria-busy="true" aria-label="Loading the list">
            {[60, 75, 50, 70, 55, 65].map((w, i) => (
              <div key={i} className="flex items-center gap-3.5">
                <div className="w-[26px] h-[26px] rounded-full bg-gray-100 dark:bg-[#24211c]" />
                <div className="h-4 rounded bg-gray-100 dark:bg-[#24211c]" style={{ width: `${w}%` }} />
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="py-16 text-center">
            <p className="text-[17px] font-semibold text-gray-900 dark:text-[#eae5de]">Couldn&apos;t load the list</p>
            <p className="mt-1 text-sm text-gray-600 dark:text-[#a49c90]">Check your connection and try again.</p>
            <button
              type="button"
              onClick={() => { setFailedWeek(null); setAttempt((a) => a + 1); }}
              className="mt-4 h-11 px-5 rounded-xl border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-[15px] font-medium text-gray-900 dark:text-[#eae5de]"
            >
              Try again
            </button>
          </div>
        ) : lines.length === 0 ? (
          <div className="py-14 px-8 text-center">
            <p className="text-[17px] font-semibold text-gray-900 dark:text-[#eae5de]">Nothing to buy this week</p>
            <p className="mt-1.5 text-sm text-gray-600 dark:text-[#a49c90]">Plan some meals, or add something with +.</p>
          </div>
        ) : (
          <>
            {groups.map((g) => (
              <section key={g.key} aria-labelledby={`shop-${g.key}`}>
                <h2 id={`shop-${g.key}`} data-section={g.key} className={sectionHead}>
                  <span><span aria-hidden>{g.emoji}</span> {g.title}</span>
                  {g.key === "added" ? (
                    <span className="flex items-center gap-1">
                      {selectMode ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setSelected(selectedLines.length === added.length ? new Set() : new Set(added.map((l) => l.id)))}
                            className={`${smallBtn} text-gray-600 dark:text-[#a49c90]`}
                          >
                            {selectedLines.length === added.length ? "None" : "All"}
                          </button>
                          {selectedLines.length > 0 && !confirmDelete && (
                            <>
                              <button
                                type="button"
                                onClick={() => setCopyTarget(addWeeks(monday, 1))}
                                aria-label={`Copy ${selectedLines.length} to another week`}
                                className="w-9 h-9 rounded-lg flex items-center justify-center text-orange-600 dark:text-orange-400"
                              >
                                <Copy size={16} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDelete(true)}
                                aria-label={`Delete ${selectedLines.length}`}
                                className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-500 dark:text-[#a49c90] hover:text-red-600"
                              >
                                <Trash2 size={16} />
                              </button>
                            </>
                          )}
                          {confirmDelete && (
                            <button type="button" onClick={deleteSelected} disabled={busy} className={`${smallBtn} bg-red-600 text-white disabled:opacity-50`}>
                              {busy ? "Deleting…" : `Delete ${selectedLines.length}`}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => { setSelectMode(false); setSelected(new Set()); setConfirmDelete(false); }}
                            className={`${smallBtn} text-gray-500 dark:text-[#a49c90]`}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button type="button" onClick={() => setSelectMode(true)} className={`${smallBtn} text-orange-700 dark:text-orange-400`}>
                          Select
                        </button>
                      )}
                    </span>
                  ) : (
                    <span>{left(g.items)}</span>
                  )}
                </h2>
                <ul>
                  {g.items.map((l) =>
                    row(l, l.manual ? { onDelete: () => removeManual([l.id], `Couldn't delete ${l.name}. Try again.`) } : {})
                  )}
                </ul>
              </section>
            ))}

            {groups.length === 0 && countable.length > 0 && (
              <div className="py-8 px-6 text-center">
                <p className="text-lg font-bold text-gray-900 dark:text-[#eae5de]">Everything is ticked off</p>
                <p className="mt-1.5 text-sm text-gray-600 dark:text-[#a49c90]">Nice. Staples below, if you need any.</p>
              </div>
            )}

            {staples.length > 0 && (
              <section className="mt-2">
                <button
                  type="button"
                  id="shop-home"
                  data-section="home"
                  onClick={() => setShowStaples((v) => !v)}
                  aria-expanded={showStaples}
                  className={`${toggleRow} scroll-mt-4`}
                >
                  <span><span aria-hidden>🏠</span> Probably at home · {staples.length}</span>
                  <span className="flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-[#a49c90]">
                    {showStaples ? "Hide" : "Show"}
                    <ChevronDown size={18} className={`transition-transform ${showStaples ? "rotate-180" : ""}`} />
                  </span>
                </button>
                {showStaples && <ul>{staples.map((l) => row(l))}</ul>}
              </section>
            )}

            {/* Room for the last sections to scroll up under the bar, so their chips can light up. */}
            <div className="h-[45dvh]" aria-hidden />
          </>
        )}
      </div>

      {/* Floating over the list, above the bottom nav on mobile: hide/show ticked, and + to add */}
      {!loading && !loadError && (
        <div className="sticky z-20 bottom-[calc(4rem+1px+env(safe-area-inset-bottom)+0.75rem)] md:bottom-6 px-4 md:px-0 flex items-center gap-3 pointer-events-none">
          {tickedCount > 0 && (
            <button
              type="button"
              onClick={toggleHideTicked}
              aria-pressed={hideTicked}
              className="pointer-events-auto h-12 pl-3 pr-3.5 rounded-full border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] shadow-lg flex items-center gap-2 text-[15px] font-semibold text-gray-900 dark:text-[#eae5de]"
            >
              {hideTicked ? <Eye size={20} /> : <EyeOff size={20} />}
              {hideTicked ? "Show ticked" : "Hide ticked"}
              <span className="min-w-6 h-6 px-1.5 rounded-full bg-orange-500 text-gray-900 text-[13px] font-bold flex items-center justify-center">
                {tickedCount}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={openAdd}
            aria-label="Add items to the list"
            className="pointer-events-auto ml-auto w-14 h-14 rounded-[20px] bg-orange-500 hover:bg-orange-600 text-white shadow-lg flex items-center justify-center transition-colors"
          >
            <Plus size={26} strokeWidth={2.4} />
          </button>
        </div>
      )}

      {toast && (
        <div
          role={toast.error ? "alert" : "status"}
          className={`fixed z-[60] left-4 right-4 md:left-auto md:right-8 md:w-96 bottom-[calc(4rem+env(safe-area-inset-bottom)+5rem)] md:bottom-24 flex items-center justify-between gap-2 rounded-[14px] pl-4 pr-2 py-2 min-h-12 text-[15px] font-medium shadow-lg ${
            toast.error ? "bg-red-600 text-white" : "bg-gray-900 dark:bg-[#eae5de] text-white dark:text-[#1a1714]"
          }`}
        >
          <span className="min-w-0">{toast.text}</span>
          {toast.undo && (
            <button type="button" onClick={toast.undo} className="h-9 px-3 rounded-[10px] font-bold shrink-0">
              Undo
            </button>
          )}
        </div>
      )}

      {/* Where a line comes from: its recipes, by day and meal */}
      {sourceLine && (
        <Sheet title={sourceLine.name} onClose={() => setSourceId(null)}>
          <SourceRecipes line={sourceLine} />
          <div className="mt-5 flex gap-2">
            <button type="button" onClick={() => setSourceId(null)} className={sheetBtn}>
              Close
            </button>
            <button
              type="button"
              onClick={() => { tick(sourceLine); setSourceId(null); }}
              className={sheetMainBtn}
            >
              {isTicked(sourceLine) ? "Untick" : "Tick off"}
            </button>
          </div>
        </Sheet>
      )}

      {/* Add: one item typed, or a whole list pasted */}
      {addOpen && (
        <Sheet title="Add to this week" onClose={() => setAddOpen(false)}>
          <p className="mt-1 text-[15px] text-gray-600 dark:text-[#a49c90]">One per line. Type one thing, or paste a whole list.</p>
          <textarea
            value={addText}
            onChange={(e) => setAddText(e.target.value)}
            autoFocus
            rows={4}
            aria-label="Items to add, one per line"
            placeholder={"2 lemons\n500 ml milk\nDish sponges"}
            className="mt-3 w-full min-h-[120px] px-3.5 py-3 rounded-[14px] border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-base leading-relaxed text-gray-900 dark:text-[#eae5de] placeholder:text-gray-500 dark:placeholder:text-[#8f877b] resize-none focus:outline-none focus:ring-2 focus:ring-inset focus:ring-orange-500"
          />
          {preview.length > 0 && (
            <>
              <p className="mt-4 mb-1 text-[13px] font-semibold tracking-[.04em] uppercase text-gray-500 dark:text-[#a49c90]">
                Will add · {toAdd.length}
              </p>
              <ul>
                {preview.map((p) => (
                  <li key={p.i} className="flex items-center gap-2.5 min-h-12 border-t border-gray-100 dark:border-[#3a352e]">
                    <span className="flex-1 min-w-0 py-1.5">
                      <span className={`block text-base text-gray-900 dark:text-[#eae5de] ${p.skip ? "opacity-50 line-through" : ""}`}>{p.name}</span>
                      {p.note && (
                        <span className={`block text-[13px] ${p.skip ? "text-gray-500 dark:text-[#a49c90]" : "text-amber-700 dark:text-amber-400"}`}>
                          {p.note}
                        </span>
                      )}
                    </span>
                    {p.qty != null && (
                      <span className="shrink-0 text-[15px] font-semibold text-gray-600 dark:text-[#a49c90]">{exactAmount(p.qty, p.unit)}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => setAddText(preview.filter((x) => x.i !== p.i).map((x) => x.raw).join("\n"))}
                      aria-label={`Don't add ${p.name}`}
                      className="w-11 h-11 -mr-2.5 shrink-0 flex items-center justify-center text-gray-400 dark:text-[#8f877b]"
                    >
                      <X size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {addError && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{addError}</p>}
          <div className="mt-5 flex gap-2">
            <button type="button" onClick={() => setAddOpen(false)} className={sheetBtn}>
              Cancel
            </button>
            <button type="button" onClick={addItems} disabled={adding || toAdd.length === 0} className={sheetMainBtn}>
              {adding && <Loader2 size={18} className="animate-spin" />}
              {toAdd.length > 1 ? `Add ${toAdd.length} items` : toAdd.length === 1 ? "Add 1 item" : "Add"}
            </button>
          </div>
        </Sheet>
      )}

      {/* Copy selected products to another week */}
      {copyTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 dark:bg-black/60 flex items-end sm:items-center justify-center p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="copy-title" className="w-full sm:max-w-sm bg-white dark:bg-[#24211c] rounded-2xl shadow-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 id="copy-title" className="font-semibold text-gray-900 dark:text-[#eae5de]">
                Copy {selectedLines.length} product{selectedLines.length === 1 ? "" : "s"} to…
              </h3>
              <button type="button" onClick={() => setCopyTarget(null)} aria-label="Close" className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-[#a49c90]">
                <X size={18} />
              </button>
            </div>
            <div className="flex items-center justify-between gap-2 mb-4">
              <button type="button" onClick={() => setCopyTarget((d) => d && addWeeks(d, -1))} aria-label="Previous week" className="w-11 h-11 rounded-lg flex items-center justify-center text-gray-500 dark:text-[#a49c90] hover:bg-gray-100 dark:hover:bg-[#2a2620]">
                <ChevronLeft size={18} />
              </button>
              <div className="flex-1 text-center">
                <div className="flex items-center justify-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-[#eae5de]">
                  <CalendarDays size={15} className="text-orange-500" />
                  {shortWeekRange(copyTarget)}
                </div>
                <p className="text-xs text-gray-500 dark:text-[#8f877b] mt-0.5">{weekOffsetLabel(monday, copyTarget)}</p>
              </div>
              <button type="button" onClick={() => setCopyTarget((d) => d && addWeeks(d, 1))} aria-label="Next week" className="w-11 h-11 rounded-lg flex items-center justify-center text-gray-500 dark:text-[#a49c90] hover:bg-gray-100 dark:hover:bg-[#2a2620]">
                <ChevronRight size={18} />
              </button>
            </div>
            <button
              type="button"
              onClick={copySelected}
              disabled={busy}
              className="w-full h-11 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 disabled:opacity-40 flex items-center justify-center gap-2 transition-colors"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Copy size={15} />}
              Copy here
            </button>
            <p className="mt-2 text-center text-xs text-gray-500 dark:text-[#8f877b]">Products already in that week are skipped.</p>
          </div>
        </div>
      )}
    </div>
  );
}
