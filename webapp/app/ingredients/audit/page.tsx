"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Loader2, Sparkles } from "lucide-react";
import {
  getGroceryItems,
  getUnitAudit,
  getCategoryAudit,
  getKnownCategories,
  updateGroceryItem,
  setGroceryItemsCategory,
  type MissingUnitWeightRow,
  type UnitMismatchRow,
  type UncategorizedRow,
} from "@/lib/actions";
import { GROCERY_CATEGORIES, canonicalCategory } from "@/lib/constants";
import { groceryCategoryLabel } from "@/lib/labels";
import { Sheet } from "@/components/Sheet";
import { isHouseholdCategory } from "@/lib/grocery-items";

type Tab = "nutrition" | "categories" | "units";
type NutritionRow = {
  id: string; name: string; nameRo: string | null; unit: string | null; uses: number; category: string | null;
  carbs: number | null; fat: number | null; protein: number | null;
};
type LookState = "busy" | "ok" | "none" | "error";
type CatGroup = { key: string; from: string; target: string | null; rows: UncategorizedRow[] };

const GROUP_NOTES: Record<string, string> = {
  supplies: "Household things, not food. They stay in Other unless there's a category for them.",
  "sauces & condiments": "No category fits sauces yet, so most of these stay in Other.",
};

const cardCls = "rounded-2xl border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c]";
const sectionCls = "text-[13px] font-semibold tracking-[.04em] uppercase text-gray-600 dark:text-[#a49c90]";
const introCls = "text-sm leading-snug text-gray-600 dark:text-[#a49c90]";
const aiBtnCls =
  "shrink-0 h-10 px-3 rounded-xl border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-orange-600 dark:text-orange-400 text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50";
const btn2Cls =
  "flex-1 h-12 rounded-xl border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-[15px] font-semibold text-gray-900 dark:text-[#eae5de] flex items-center justify-center gap-1.5 disabled:opacity-50";
const mainBtnCls =
  "flex-1 h-12 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[15px] font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-colors";
const doneCls = "rounded-2xl px-3.5 py-3.5 bg-orange-50 dark:bg-orange-500/15 text-[15px] font-semibold text-orange-700 dark:text-orange-300";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const label = (c: string | null | undefined) => (c ? groceryCategoryLabel(c) : "Other");

// One row of the "can't be turned into grams" list: grams per unit (or per unit2), with
// an AI estimate the user reviews before saving.
function GramsFix({
  row,
  onSaved,
  onError,
}: {
  row: MissingUnitWeightRow;
  onSaved: (row: MissingUnitWeightRow) => void;
  onError: (msg: string) => void;
}) {
  const offending = (row.badUnits ?? []).filter(Boolean);
  const unit2Lower = row.unit2?.toLowerCase();
  // Used as its second unit (cup, tbsp) → fill the conversion; otherwise grams per piece.
  const convCase = !!unit2Lower && offending.some((u) => u.toLowerCase() === unit2Lower);
  const field: "conversion" | "unitWeight" = convCase ? "conversion" : "unitWeight";
  const fromUnit = convCase ? row.unit2 ?? "" : offending[0] ?? row.unit ?? "piece";
  const toUnit = convCase ? row.unit ?? "g" : "g";

  const [draft, setDraft] = useState("");
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);
  const value = parseFloat(draft.replace(",", "."));

  async function suggest() {
    setAsking(true);
    setNote(null);
    try {
      const res = await fetch("/api/import/suggest-conversion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredientName: row.name, fromUnit, toUnit }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.factor == null) { setNote({ text: data.error ?? "No estimate. Fill it in by hand.", error: true }); return; }
      setDraft(String(data.factor));
      setNote({ text: `AI estimate${data.note ? ` · ${data.note}` : ""}. Check it before saving.`, error: false });
    } catch {
      setNote({ text: "Couldn't reach the AI. Check your connection.", error: true });
    } finally {
      setAsking(false);
    }
  }

  async function save() {
    if (Number.isNaN(value) || value <= 0) return;
    setSaving(true);
    try {
      await updateGroceryItem(row.id, { [field]: value });
      onSaved(row);
    } catch {
      onError(`Couldn't save ${row.name}. Please try again.`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`${cardCls} p-3.5`}>
      <Link href={`/ingredients?edit=${row.id}`} className="block text-base font-semibold text-gray-900 dark:text-[#eae5de]">
        {row.name}
      </Link>
      <p className="mt-0.5 text-[13px] leading-snug text-gray-600 dark:text-[#a49c90]">
        Used as {offending.join(", ") || fromUnit} in {row.sampleRecipes.join(", ")}
        {row.recipes > row.sampleRecipes.length ? ` and ${row.recipes - row.sampleRecipes.length} more` : ""}
      </p>
      <div className="mt-3 flex items-center gap-2 text-base text-gray-900 dark:text-[#eae5de]">
        <span className="shrink-0">1 {fromUnit} =</span>
        <input
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); }}
          aria-label={`${toUnit} in 1 ${fromUnit} of ${row.name}`}
          placeholder="?"
          className="w-[76px] h-12 px-2 rounded-xl border border-gray-200 dark:border-[#3a352e] bg-[var(--color-bg-base)] text-base font-semibold text-center outline-none focus:border-orange-500"
        />
        <span className="flex-1">{toUnit}</span>
        <button type="button" onClick={suggest} disabled={asking} aria-label="Suggest with AI" className={`${aiBtnCls} !w-12 !h-12 !px-0`}>
          {asking ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || Number.isNaN(value) || value <= 0}
          className="shrink-0 h-12 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[15px] font-bold flex items-center gap-1.5 disabled:opacity-50"
        >
          {saving && <Loader2 size={15} className="animate-spin" />}
          Save
        </button>
      </div>
      {note && (
        <p className={`mt-2 text-[13px] leading-snug ${note.error ? "text-amber-700 dark:text-amber-300" : "text-orange-600 dark:text-orange-400"}`}>{note.text}</p>
      )}
    </div>
  );
}

export default function DataCheckPage() {
  const [tab, setTab] = useState<Tab>("nutrition");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Nutrition
  const [noNutrition, setNoNutrition] = useState<NutritionRow[]>([]);
  const [look, setLook] = useState<Record<string, LookState>>({});
  const [filledText, setFilledText] = useState<Record<string, string>>({});
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const [showHousehold, setShowHousehold] = useState(false);

  // Categories
  const [catRows, setCatRows] = useState<UncategorizedRow[]>([]);
  const [categories, setCategories] = useState<string[]>(GROCERY_CATEGORIES);
  const [over, setOver] = useState<Record<string, string>>({}); // per-item exception inside a clear move
  const [picks, setPicks] = useState<Record<string, string>>({}); // picks for items that would land in Other
  const [aiPicked, setAiPicked] = useState<Set<string>>(new Set());
  const [filed, setFiled] = useState<Set<string>>(new Set());
  const [movedCount, setMovedCount] = useState(0);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ id: string; name: string; clear: boolean; current: string | null } | null>(null);

  // Units
  const [missing, setMissing] = useState<MissingUnitWeightRow[]>([]);
  const [mismatches, setMismatches] = useState<UnitMismatchRow[]>([]);
  const [gramsSaved, setGramsSaved] = useState(0);

  function showToast(text: string, error = false) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, error });
    toastTimer.current = setTimeout(() => setToast(null), error ? 6000 : 4000);
  }

  function load() {
    setLoading(true);
    setLoadError(false);
    Promise.all([getGroceryItems(), getUnitAudit(), getCategoryAudit(), getKnownCategories()])
      .then(([items, units, cats, known]) => {
        setNoNutrition(
          items
            .filter((it) => it.kcal == null)
            .sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name))
            .map((it) => ({
              id: it.id, name: it.name, nameRo: it.nameRo, unit: it.unit, uses: it.uses, category: it.category,
              carbs: it.carbs, fat: it.fat, protein: it.protein,
            }))
        );
        setMissing(units.missingUnitWeight);
        setMismatches(units.mismatches);
        setCatRows(cats);
        setCategories(known);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  // ── Nutrition ────────────────────────────────────────────────────────────
  const food = noNutrition.filter((r) => !isHouseholdCategory(r.category));
  const household = noNutrition.filter((r) => isHouseholdCategory(r.category));
  const foodLeft = food.filter((r) => look[r.id] !== "ok").length;
  const toLook = food.filter((r) => !look[r.id] || look[r.id] === "error");

  // Look one item up in USDA and fill its empty values. Returns what happened.
  async function lookUp(row: NutritionRow): Promise<LookState> {
    setLook((l) => ({ ...l, [row.id]: "busy" }));
    let state: LookState;
    try {
      const res = await fetch(`/api/nutrition?q=${encodeURIComponent(row.name.trim() || row.nameRo?.trim() || "")}`);
      if (res.status === 404) state = "none";
      else if (!res.ok) state = "error";
      else {
        const data = await res.json();
        // Only fill what's empty: a macro typed in by hand stays.
        await updateGroceryItem(row.id, {
          kcal: data.kcal ?? null,
          ...(row.carbs == null && data.carbs != null ? { carbs: data.carbs } : {}),
          ...(row.fat == null && data.fat != null ? { fat: data.fat } : {}),
          ...(row.protein == null && data.protein != null ? { protein: data.protein } : {}),
        });
        setFilledText((t) => ({ ...t, [row.id]: `${data.kcal ?? "—"} kcal` }));
        state = "ok";
      }
    } catch {
      state = "error";
    }
    setLook((l) => ({ ...l, [row.id]: state }));
    return state;
  }

  async function lookUpOne(row: NutritionRow) {
    const state = await lookUp(row);
    if (state === "error") showToast(`Couldn't look up ${row.name}. Please try again.`, true);
  }

  async function lookUpAll() {
    const todo = [...toLook];
    if (!todo.length || bulk) return;
    let found = 0, none = 0, failed = 0, failsInARow = 0;
    for (let i = 0; i < todo.length; i++) {
      setBulk({ done: i, total: todo.length });
      const state = await lookUp(todo[i]);
      if (state === "ok") found++;
      else if (state === "none") none++;
      else failed++;
      failsInARow = state === "error" ? failsInARow + 1 : 0;
      // USDA or the connection is down: stop instead of failing every row.
      if (failsInARow >= 3) break;
    }
    setBulk(null);
    const parts = [`Filled ${found}`];
    if (none) parts.push(`${none} need a look by hand`);
    if (failed) parts.push(`${failed} failed${failsInARow >= 3 ? ", stopped" : ""}`);
    showToast(parts.join(" · "), failed > 0 && found === 0);
  }

  // ── Categories ───────────────────────────────────────────────────────────
  const groupsByKey = new Map<string, CatGroup>();
  for (const r of catRows) {
    const from = r.category?.trim() ?? "";
    const key = from || "__none__";
    let g = groupsByKey.get(key);
    if (!g) { g = { key, from, target: canonicalCategory(from), rows: [] }; groupsByKey.set(key, g); }
    g.rows.push(r);
  }
  const allGroups = [...groupsByKey.values()].sort((a, b) => b.rows.length - a.rows.length);
  const isClear = (g: CatGroup) => !!g.target && g.target !== "Other";
  const clearGroups = allGroups.filter(isClear).map((g) => ({ ...g, rows: g.rows.filter((r) => !filed.has(r.id)) })).filter((g) => g.rows.length);
  const otherGroups = allGroups.filter((g) => !isClear(g)).map((g) => ({ ...g, rows: g.rows.filter((r) => !filed.has(r.id)) })).filter((g) => g.rows.length);
  const clearCount = clearGroups.reduce((a, g) => a + g.rows.length, 0);
  const otherRows = otherGroups.flatMap((g) => g.rows);
  const pickedOthers = otherRows.filter((r) => picks[r.id]);
  const catLeft = clearCount + otherRows.length;

  // Save each item under its category, one write per category. Nothing is changed
  // locally until the writes succeed.
  async function fileItems(moves: { id: string; category: string }[], key: string): Promise<boolean> {
    const byCat = new Map<string, string[]>();
    for (const m of moves) byCat.set(m.category, [...(byCat.get(m.category) ?? []), m.id]);
    setBusy(key);
    const done: string[] = [];
    try {
      for (const [cat, ids] of byCat) {
        await setGroceryItemsCategory(ids, cat);
        done.push(...ids);
      }
      return true;
    } catch {
      showToast(done.length ? `Saved ${done.length}, then it failed. Please try again.` : "Couldn't save. Please try again.", true);
      return false;
    } finally {
      // Whatever was written is filed, even when a later write failed.
      if (done.length) setFiled((f) => new Set([...f, ...done]));
      setBusy(null);
    }
  }

  async function moveGroups(groups: CatGroup[], key: string) {
    const moves = groups.flatMap((g) => g.rows.map((r) => ({ id: r.id, category: over[r.id] ?? g.target ?? "Other" })));
    const elsewhere = groups.flatMap((g) => g.rows).filter((r) => over[r.id]).length;
    if (await fileItems(moves, key)) {
      setMovedCount((n) => n + moves.length);
      const to = groups.length === 1 ? ` to ${label(groups[0].target)}` : "";
      showToast(`Moved ${plural(moves.length, "item", "items")}${to}${elsewhere ? ` · ${elsewhere} where you picked` : ""}`);
    }
  }

  async function matchWithAi() {
    const pending = otherRows.filter((r) => !picks[r.id]).slice(0, 120);
    if (!pending.length) return;
    setBusy("ai");
    try {
      const res = await fetch("/api/suggest-category", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: pending.map((r) => ({ id: r.id, name: r.name })), categories }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.suggestions) {
        showToast(res.status === 503 ? "AI suggestions are unavailable (ANTHROPIC_API_KEY is not set)." : "Couldn't get AI suggestions. Please try again.", true);
        return;
      }
      const s = data.suggestions as Record<string, string>;
      const better = Object.entries(s).filter(([, c]) => c && c !== "Other");
      setPicks((p) => ({ ...p, ...Object.fromEntries(better) }));
      setAiPicked((prev) => new Set([...prev, ...better.map(([id]) => id)]));
      showToast(`AI found a home for ${better.length} · ${pending.length - better.length} fit nowhere better than Other`);
    } catch {
      showToast("Couldn't get AI suggestions. Please try again.", true);
    } finally {
      setBusy(null);
    }
  }

  async function applyPicks() {
    const moves = pickedOthers.map((r) => ({ id: r.id, category: picks[r.id] }));
    if (!moves.length) return;
    if (await fileItems(moves, "apply")) showToast(`Filed ${plural(moves.length, "item", "items")}`);
  }

  function pickRow(r: UncategorizedRow, clear: boolean, fallback: string | null) {
    const t = clear ? over[r.id] ?? fallback : picks[r.id] ?? null;
    const chosen = clear ? !!over[r.id] : !!picks[r.id];
    return (
      <button
        key={r.id}
        type="button"
        onClick={() => setPicker({ id: r.id, name: r.name, clear, current: t })}
        aria-label={`${r.name}: ${label(t)}. Change`}
        className="w-full min-h-12 py-1 flex items-center gap-2 text-left border-b border-gray-100 dark:border-[#3a352e] last:border-b-0"
      >
        <span className="flex-1 min-w-0 truncate text-[15px] text-gray-900 dark:text-[#eae5de]">{r.name}</span>
        <span className={`shrink-0 text-sm font-semibold ${chosen ? "text-orange-600 dark:text-orange-400" : "text-gray-600 dark:text-[#a49c90]"}`}>
          {label(t)}
          {!clear && aiPicked.has(r.id) && picks[r.id] && <span className="ml-1 font-normal opacity-80">· AI</span>}
        </span>
        <ChevronDown size={16} className="text-gray-400 dark:text-[#8f877b]" aria-hidden />
      </button>
    );
  }

  // ── Units ────────────────────────────────────────────────────────────────
  const unitsLeft = missing.length + mismatches.length;

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "nutrition", label: "Nutrition", count: foodLeft },
    { key: "categories", label: "Categories", count: catLeft },
    { key: "units", label: "Units", count: unitsLeft },
  ];

  return (
    <div className="max-w-2xl mx-auto md:px-8 md:pt-8 pb-10">
      <div className="px-4 pt-2 md:px-0 md:pt-0">
        <Link href="/ingredients" className="-ml-2 h-11 w-fit pr-2 flex items-center gap-0.5 text-base text-gray-600 dark:text-[#a49c90]">
          <ChevronLeft size={22} /> Ingredients
        </Link>
        <h1 className="text-3xl text-gray-900 dark:text-[#eae5de]">Data check</h1>
        <p className="mt-1 text-sm leading-snug text-gray-600 dark:text-[#a49c90]">
          Each fix is saved on the item, so every recipe that uses it picks it up.
        </p>
      </div>

      <div className="sticky top-0 z-20 mt-3 px-4 md:px-0 py-3 bg-[var(--color-bg-base)] border-b border-gray-100 dark:border-[#3a352e]">
        <div role="tablist" aria-label="What to fix" className="flex gap-0.5 p-[3px] rounded-[14px] bg-white dark:bg-[#24211c] border border-gray-200 dark:border-[#3a352e]">
          {tabs.map((t) => {
            const on = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(t.key)}
                className={`flex-1 h-[42px] rounded-[11px] flex items-center justify-center gap-1.5 text-sm font-semibold transition-colors ${
                  on ? "bg-gray-100 dark:bg-[#2e2a24] text-gray-900 dark:text-[#eae5de]" : "text-gray-600 dark:text-[#a49c90]"
                }`}
              >
                {t.label}
                {!loading && <span className="text-xs opacity-75">{t.count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="px-4 md:px-0 pt-6 space-y-3 animate-pulse" aria-busy="true" aria-label="Loading the data check">
          {[70, 55, 65, 50].map((w, i) => (
            <div key={i} className="h-14 rounded-2xl bg-gray-100 dark:bg-[#24211c]" style={{ width: `${w + 30}%` }} />
          ))}
        </div>
      ) : loadError ? (
        <div className="py-16 text-center">
          <p className="text-[17px] font-semibold text-gray-900 dark:text-[#eae5de]">Couldn&apos;t load the data check</p>
          <p className="mt-1 text-sm text-gray-600 dark:text-[#a49c90]">Check your connection and try again.</p>
          <button type="button" onClick={load} className={`${btn2Cls} !flex-none mx-auto mt-4 px-5`}>Try again</button>
        </div>
      ) : (
        <div className="px-4 md:px-0">
          {/* ── Nutrition ── */}
          {tab === "nutrition" && (
            <>
              <p className={`${introCls} pt-4`}>Without nutrition these count as 0 in meal totals. Most used first.</p>
              {food.length > 0 && (
                <div className="mt-3">
                  {bulk ? (
                    <div>
                      <div
                        role="progressbar"
                        aria-valuenow={Math.round((bulk.done / bulk.total) * 100)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        className="h-2 rounded-full bg-gray-100 dark:bg-[#2e2a24] overflow-hidden"
                      >
                        <div className="h-2 rounded-full bg-orange-500 transition-[width]" style={{ width: `${Math.round((bulk.done / bulk.total) * 100)}%` }} />
                      </div>
                      <p className="mt-1.5 text-[13px] text-gray-600 dark:text-[#a49c90]">Looking up {bulk.done + 1} of {bulk.total}…</p>
                    </div>
                  ) : (
                    <button type="button" onClick={lookUpAll} disabled={!toLook.length} className={`${mainBtnCls} w-full`}>
                      {toLook.length ? `Look up all ${toLook.length} in USDA` : "All looked up"}
                    </button>
                  )}
                </div>
              )}
              {food.length === 0 ? (
                <p className={`${doneCls} mt-4`}>Every food item has nutrition.</p>
              ) : (
                <ul className={`${cardCls} mt-3 overflow-hidden`}>
                  {food.map((r, i) => {
                    const st = look[r.id];
                    return (
                      <li key={r.id} className={`min-h-[62px] px-3.5 py-2 flex items-center gap-3 ${i ? "border-t border-gray-100 dark:border-[#3a352e]" : ""}`}>
                        <span className="flex-1 min-w-0">
                          <span className="block truncate text-base font-medium text-gray-900 dark:text-[#eae5de]">{r.name}</span>
                          <span className="block mt-0.5 text-[13px] text-gray-600 dark:text-[#a49c90]">
                            {r.uses ? `In ${plural(r.uses, "recipe", "recipes")}` : "Not used yet"} · {r.unit ?? "—"}
                          </span>
                        </span>
                        {st === "busy" ? (
                          <span className="shrink-0 h-9 px-3 rounded-full flex items-center gap-1.5 text-[13px] font-semibold bg-gray-100 dark:bg-[#2e2a24] text-gray-600 dark:text-[#a49c90]">
                            <Loader2 size={14} className="animate-spin" /> Looking…
                          </span>
                        ) : st === "ok" ? (
                          <span className="shrink-0 h-9 px-3 rounded-full flex items-center text-[13px] font-semibold bg-orange-50 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300">
                            Filled · {filledText[r.id]}
                          </span>
                        ) : st === "none" ? (
                          <Link
                            href={`/ingredients?edit=${r.id}`}
                            aria-label={`No USDA match for ${r.name}, open it`}
                            className="shrink-0 h-9 px-3 rounded-full flex items-center gap-1 text-[13px] font-semibold bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300"
                          >
                            No match <ChevronRight size={14} />
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={() => lookUpOne(r)}
                            disabled={!!bulk}
                            aria-label={`Look up ${r.name} in USDA`}
                            className={aiBtnCls}
                          >
                            {st === "error" ? "Retry" : "Look up"}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {household.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowHousehold((v) => !v)}
                    aria-expanded={showHousehold}
                    className="mt-3 w-full min-h-16 px-3.5 py-2.5 rounded-2xl border border-dashed border-gray-300 dark:border-[#3a352e] flex items-center justify-between gap-3 text-left"
                  >
                    <span>
                      <span className="block text-base font-semibold text-gray-900 dark:text-[#eae5de]">Household items · {household.length}</span>
                      <span className="block mt-0.5 text-[13px] text-gray-600 dark:text-[#a49c90]">Not food, so they need no nutrition. Skipped.</span>
                    </span>
                    <ChevronDown size={18} className={`shrink-0 text-gray-500 dark:text-[#a49c90] transition-transform ${showHousehold ? "rotate-180" : ""}`} />
                  </button>
                  {showHousehold && (
                    <p className="mt-2.5 text-[13px] leading-relaxed text-gray-600 dark:text-[#a49c90]">{household.map((r) => r.name).join(", ")}</p>
                  )}
                </>
              )}
            </>
          )}

          {/* ── Categories ── */}
          {tab === "categories" && (
            <>
              <p className={`${introCls} pt-4`}>
                {catLeft
                  ? `${plural(catLeft, "item is", "items are")} still saved with a category from the old list, or none. They already show under the closest new one; confirming saves it for good.`
                  : "Every item is on a current category."}
              </p>

              <div className="pt-6 flex items-center justify-between gap-3">
                <h2 className={sectionCls}>Clear moves · {clearCount}</h2>
                {clearGroups.length > 0 && (
                  <button type="button" onClick={() => moveGroups(clearGroups, "all")} disabled={!!busy} className={aiBtnCls}>
                    {busy === "all" && <Loader2 size={15} className="animate-spin" />} Move all
                  </button>
                )}
              </div>
              {clearGroups.map((g) => {
                const isOpen = !!open[g.key];
                const names = g.rows.map((r) => r.name);
                const sameName = label(g.from) === label(g.target);
                return (
                  <div key={g.key} className={`${cardCls} mt-2.5 p-3.5`}>
                    <div className="flex flex-wrap items-center gap-2 text-base font-semibold text-gray-900 dark:text-[#eae5de]">
                      <span>{label(g.from)}</span>
                      <ArrowRight size={16} className="text-gray-500 dark:text-[#a49c90]" aria-label="moves to" />
                      <span className="text-orange-600 dark:text-orange-400">{label(g.target)}</span>
                    </div>
                    <p className="mt-1 text-[13px] leading-snug text-gray-600 dark:text-[#a49c90]">
                      {sameName
                        ? `${plural(names.length, "item", "items")} · same name, only the old icon changes`
                        : `${plural(names.length, "item", "items")} · ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` and ${names.length - 3} more` : ""}`}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={() => setOpen((o) => ({ ...o, [g.key]: !isOpen }))} aria-expanded={isOpen} className={btn2Cls}>
                        {isOpen ? "Hide items" : "Check items"}
                      </button>
                      <button type="button" onClick={() => moveGroups([g], g.key)} disabled={!!busy} className={mainBtnCls}>
                        {busy === g.key && <Loader2 size={15} className="animate-spin" />}
                        Move {names.length}
                      </button>
                    </div>
                    {isOpen && <div className="mt-2.5 border-t border-gray-100 dark:border-[#3a352e]">{g.rows.map((r) => pickRow(r, true, g.target))}</div>}
                  </div>
                );
              })}
              {movedCount > 0 && <p className={`${doneCls} mt-2.5`}>Moved {plural(movedCount, "item", "items")} so far.</p>}
              {clearGroups.length === 0 && movedCount === 0 && <p className={`${introCls} mt-2`}>Nothing to move.</p>}

              <div className="pt-7">
                <h2 className={sectionCls}>Would land in Other · {otherRows.length}</h2>
              </div>
              {otherRows.length > 0 ? (
                <>
                  <p className={`${introCls} pt-2`}>
                    Other is a catch-all. Give these a proper home one by one, or let AI suggest. Nothing is saved until you apply.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={matchWithAi} disabled={!!busy} className={`${btn2Cls} !text-orange-600 dark:!text-orange-400`}>
                      {busy === "ai" ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                      {busy === "ai" ? "Matching…" : "Match with AI"}
                    </button>
                    <button type="button" onClick={applyPicks} disabled={!pickedOthers.length || !!busy} className={mainBtnCls}>
                      {busy === "apply" && <Loader2 size={15} className="animate-spin" />}
                      {pickedOthers.length ? `Apply ${pickedOthers.length}` : "Apply"}
                    </button>
                  </div>
                  {otherGroups.map((g) => {
                    const note = GROUP_NOTES[groceryCategoryLabel(g.from).toLowerCase()];
                    return (
                      <div key={g.key} className={`${cardCls} mt-2.5 p-3.5`}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-base font-semibold text-gray-900 dark:text-[#eae5de]">{g.from ? label(g.from) : "No category"}</span>
                          <span className="text-[13px] text-gray-600 dark:text-[#a49c90]">{g.rows.length}</span>
                        </div>
                        {note && <p className="mt-1 text-[13px] leading-snug text-gray-600 dark:text-[#a49c90]">{note}</p>}
                        <div className="mt-2.5 border-t border-gray-100 dark:border-[#3a352e]">{g.rows.map((r) => pickRow(r, false, null))}</div>
                      </div>
                    );
                  })}
                </>
              ) : (
                <p className={`${doneCls} mt-2.5`}>Nothing left in Other by accident.</p>
              )}
            </>
          )}

          {/* ── Units ── */}
          {tab === "units" && (
            <>
              <div className="pt-5">
                <h2 className={sectionCls}>Can&apos;t be turned into grams · {missing.length}</h2>
              </div>
              {missing.length > 0 ? (
                <>
                  <p className={`${introCls} pt-2`}>Where they&apos;re used, their nutrition counts as 0. Only items with nutrition are listed.</p>
                  <div className="mt-3 space-y-2.5">
                    {missing.map((r) => (
                      <GramsFix
                        key={r.id}
                        row={r}
                        onSaved={(row) => {
                          setMissing((m) => m.filter((x) => x.id !== row.id));
                          setGramsSaved((n) => n + 1);
                          showToast(`Saved · ${plural(row.recipes, "recipe", "recipes")} now count its nutrition`);
                        }}
                        onError={(msg) => showToast(msg, true)}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <p className={`${doneCls} mt-2.5`}>{gramsSaved ? "All of them convert to grams now." : "Nothing to fix here."}</p>
              )}

              <div className="pt-7">
                <h2 className={sectionCls}>Unit not on the item · {mismatches.length}</h2>
              </div>
              {mismatches.length > 0 ? (
                <>
                  <p className={`${introCls} pt-2`}>
                    The recipe uses a unit the item doesn&apos;t have, so the amount can&apos;t be converted. Fix it in the recipe, or add that unit to the item.
                  </p>
                  <ul className={`${cardCls} mt-3 overflow-hidden`}>
                    {mismatches.map((m, i) => (
                      <li key={m.ingredientId} className={i ? "border-t border-gray-100 dark:border-[#3a352e]" : ""}>
                        <Link href={`/recipes/${m.recipeId}/edit`} className="min-h-[62px] px-3.5 py-2 flex items-center gap-2.5">
                          <span className="flex-1 min-w-0">
                            <span className="block truncate text-base font-medium text-gray-900 dark:text-[#eae5de]">{m.recipeName}</span>
                            <span className="block mt-0.5 text-[13px] leading-snug text-gray-600 dark:text-[#a49c90]">
                              {m.itemName} in {m.ingUnit || "no unit"} · the item has {[m.itemUnit, m.itemUnit2].filter(Boolean).join(" / ") || "no unit"}
                            </span>
                          </span>
                          <ChevronRight size={16} className="shrink-0 text-gray-400 dark:text-[#8f877b]" aria-hidden />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className={`${doneCls} mt-2.5`}>No mismatches.</p>
              )}
            </>
          )}
        </div>
      )}

      {toast && (
        <div
          role={toast.error ? "alert" : "status"}
          className={`fixed z-[60] left-4 right-4 md:left-auto md:right-8 md:w-96 bottom-[calc(4rem+env(safe-area-inset-bottom)+1rem)] md:bottom-8 rounded-[14px] px-4 py-3 min-h-12 text-[15px] font-medium shadow-lg ${
            toast.error ? "bg-red-600 text-white" : "bg-gray-900 dark:bg-[#eae5de] text-white dark:text-[#1a1714]"
          }`}
        >
          {toast.text}
        </div>
      )}

      {picker && (
        <Sheet title={`File “${picker.name}” under`} onClose={() => setPicker(null)}>
          <div className="mt-2">
            {categories.map((c) => {
              const on = picker.current === c;
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    if (picker.clear) setOver((o) => ({ ...o, [picker.id]: c }));
                    else {
                      setPicks((p) => ({ ...p, [picker.id]: c }));
                      setAiPicked((s) => { const n = new Set(s); n.delete(picker.id); return n; });
                    }
                    setPicker(null);
                  }}
                  className="w-full min-h-[52px] px-1 flex items-center gap-3 text-left text-base text-gray-900 dark:text-[#eae5de]"
                >
                  <span className={`w-[22px] h-[22px] shrink-0 rounded-full border-2 flex items-center justify-center ${on ? "border-orange-500" : "border-gray-300 dark:border-[#3a352e]"}`}>
                    {on && <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />}
                  </span>
                  {groceryCategoryLabel(c)}
                </button>
              );
            })}
          </div>
        </Sheet>
      )}
    </div>
  );
}
