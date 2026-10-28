"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Loader2, Sparkles } from "lucide-react";
import {
  createGroceryItem,
  updateGroceryItem,
  deleteGroceryItem,
  getGroceryItemDetails,
  getRecipesUsingGroceryItem,
  getKnownCategories,
} from "@/lib/actions";
import { GROCERY_CATEGORIES, canonicalCategory } from "@/lib/constants";
import { groceryCategoryLabel } from "@/lib/labels";
import { Switch } from "@/components/Sheet";
import { UNIT_CHOICES, energySplit, fmtNum, isMassUnit } from "@/lib/grocery-items";

export type GroceryItemResult = {
  id: string;
  name: string;
  nameRo: string | null;
  category: string | null;
  unit: string | null;
  unit2: string | null;
  conversion: number | null;
  kcal: number | null;
  carbs: number | null;
  fat: number | null;
  protein: number | null;
  unitWeight: number | null;
  pantryStaple: boolean;
};

type Draft = {
  name: string;
  nameRo: string;
  category: string;
  unit: string;
  unit2: string;
  conversion: string;
  unitWeight: string;
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
  pantryStaple: boolean;
};

type Usda = { name: string; kcal: number | null; protein: number | null; carbs: number | null; fat: number | null };
type AiNote = { text: string; error: boolean };

const str = (n: number | null | undefined) => (n == null ? "" : String(n));
const num = (s: string): number | null => {
  const n = parseFloat(s.replace(",", "."));
  return Number.isNaN(n) ? null : n;
};

const sectionCls = "mt-8 mb-2.5 text-[13px] font-semibold tracking-[.04em] uppercase text-gray-600 dark:text-[#a49c90]";
const labelCls = "block mt-4 mb-1.5 text-sm font-semibold text-gray-900 dark:text-[#eae5de]";
const hintCls = "mt-1.5 text-[13px] leading-snug text-gray-600 dark:text-[#a49c90]";
const fieldCls =
  "w-full h-12 px-3.5 rounded-xl border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-base text-gray-900 dark:text-[#eae5de] placeholder:text-gray-400 dark:placeholder:text-[#8f877b] outline-none focus:border-orange-500";
const numCls =
  "h-12 px-2 rounded-xl border border-gray-200 dark:border-[#3a352e] bg-[var(--color-bg-base)] text-base font-semibold text-center text-gray-900 dark:text-[#eae5de] placeholder:text-gray-400 dark:placeholder:text-[#8f877b] outline-none focus:border-orange-500";
const cardCls = "rounded-2xl border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c]";
const aiBtnCls =
  "shrink-0 h-10 px-3 rounded-xl border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-orange-600 dark:text-orange-400 text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50";
const warnCls = "rounded-xl px-3.5 py-3 text-sm leading-snug bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300";

// One-tap unit choices, plus "Other…" for a unit that isn't in the list.
function UnitPicker({
  value,
  onChange,
  options,
  allowNone = false,
  label,
}: {
  value: string;
  onChange: (u: string) => void;
  options: string[];
  allowNone?: boolean;
  label: string;
}) {
  const [typing, setTyping] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const list = value && !options.includes(value) ? [value, ...options] : options;
  // Start with the chosen unit in view (cup can sit past the edge of a phone).
  useEffect(() => {
    const row = rowRef.current;
    const on = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (row && on) row.scrollLeft = Math.max(0, on.offsetLeft - row.offsetLeft - 14);
  }, []);
  const pill = (on: boolean) =>
    `shrink-0 h-10 px-3.5 rounded-[10px] border text-sm font-semibold transition-colors ${
      on
        ? "bg-orange-500 border-orange-500 text-gray-900"
        : "bg-[var(--color-bg-base)] border-gray-200 dark:border-[#3a352e] text-gray-600 dark:text-[#a49c90]"
    }`;
  return (
    <div>
      <div ref={rowRef} role="group" aria-label={label} className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-3.5 px-3.5">
        {allowNone && (
          <button type="button" aria-pressed={!value} onClick={() => { setTyping(false); onChange(""); }} className={pill(!value)}>
            None
          </button>
        )}
        {list.map((u) => (
          <button key={u} type="button" aria-pressed={value === u} onClick={() => { setTyping(false); onChange(u); }} className={pill(value === u)}>
            {u}
          </button>
        ))}
        <button type="button" aria-pressed={typing} onClick={() => setTyping(true)} className={pill(typing)}>
          Other…
        </button>
      </div>
      {typing && (
        <input
          autoFocus
          aria-label={`${label}: type a unit`}
          placeholder="e.g. bunch, scoop, bottle"
          onChange={(e) => onChange(e.target.value.trim())}
          className={`${fieldCls} mt-2`}
        />
      )}
    </div>
  );
}

// ─── GroceryItemModal ─────────────────────────────────────────────────────────
// The ingredient screen: full screen on phones, a dialog from md up. Pass `itemId`
// to edit an item, or `initialName` to create one.

export default function GroceryItemModal({
  itemId,
  initialName = "",
  backLabel = "Back",
  onClose,
  onSaved,
  onDeleted,
}: {
  itemId?: string;
  initialName?: string;
  backLabel?: string;
  onClose: () => void;
  onSaved: (item: GroceryItemResult) => void;
  onDeleted?: () => void;
}) {
  const isEdit = !!itemId;
  const titleId = useId();

  const blank: Draft = {
    name: initialName, nameRo: "", category: "", unit: "g", unit2: "", conversion: "", unitWeight: "",
    kcal: "", protein: "", carbs: "", fat: "", pantryStaple: false,
  };
  const [initial, setInitial] = useState<Draft>(blank);
  const [d, setD] = useState<Draft>(blank);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState(false);
  const [categories, setCategories] = useState<string[]>(GROCERY_CATEGORIES);
  const [usedIn, setUsedIn] = useState<Array<{ id: string; name: string }> | null>(null);
  const [showAllRecipes, setShowAllRecipes] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState<"conversion" | "unitWeight" | null>(null);
  const [aiNotes, setAiNotes] = useState<{ conversion?: AiNote; unitWeight?: AiNote }>({});
  const [looking, setLooking] = useState(false);
  const [usda, setUsda] = useState<Usda | null>(null);
  const [lookError, setLookError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const patch = (p: Partial<Draft>) => setD((prev) => ({ ...prev, ...p }));

  useEffect(() => {
    getKnownCategories().then(setCategories).catch(() => { /* keep the built-ins */ });
  }, []);

  useEffect(() => {
    if (!itemId) return;
    let cancelled = false;
    getGroceryItemDetails(itemId)
      .then((data) => {
        if (cancelled) return;
        if (!data) { setLoadError(true); return; }
        const loaded: Draft = {
          name: data.name,
          nameRo: data.nameRo ?? "",
          category: data.category ?? "",
          unit: data.unit ?? "",
          unit2: data.unit2 ?? "",
          conversion: str(data.conversion),
          unitWeight: str(data.unitWeight),
          kcal: str(data.kcal),
          protein: str(data.protein),
          carbs: str(data.carbs),
          fat: str(data.fat),
          pantryStaple: data.pantryStaple,
        };
        setInitial(loaded);
        setD(loaded);
      })
      .catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    getRecipesUsingGroceryItem(itemId)
      .then((rs) => { if (!cancelled) setUsedIn(rs.map((r) => ({ id: r.id, name: r.name }))); })
      .catch(() => { if (!cancelled) setUsedIn([]); });
    return () => { cancelled = true; };
  }, [itemId]);

  // Escape closes this screen only: caught first so a sheet underneath (the recipe
  // editor's ingredient sheet) stays open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const dirty = (Object.keys(d) as (keyof Draft)[]).some((k) => String(d[k]).trim() !== String(initial[k]).trim());
  const canSave = !loading && !loadError && !saving && !!d.name.trim() && !!d.unit.trim() && (!isEdit || dirty);

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    const payload = {
      name: d.name.trim(),
      nameRo: d.nameRo.trim() || null,
      category: d.category || null,
      unit: d.unit.trim(),
      unit2: d.unit2.trim() || null,
      conversion: d.unit2.trim() ? num(d.conversion) : null,
      unitWeight: isMassUnit(d.unit) ? null : num(d.unitWeight),
      kcal: num(d.kcal),
      carbs: num(d.carbs),
      fat: num(d.fat),
      protein: num(d.protein),
      pantryStaple: d.pantryStaple,
    };
    try {
      if (isEdit && itemId) {
        await updateGroceryItem(itemId, payload);
        onSaved({ id: itemId, ...payload });
      } else {
        onSaved(await createGroceryItem(payload));
      }
      onClose();
    } catch {
      setSaveError(
        payload.name !== initial.name.trim()
          ? `Couldn't save. Another ingredient may already be called “${payload.name}”.`
          : "Couldn't save. Check your connection and try again."
      );
    } finally {
      setSaving(false);
    }
  }

  // AI estimate for "1 cup = ? g" (conversion) or "1 piece weighs ? g" (unitWeight).
  async function suggest(field: "conversion" | "unitWeight") {
    const ingredientName = d.name.trim() || d.nameRo.trim();
    const fromUnit = field === "conversion" ? d.unit2.trim() : d.unit.trim();
    const toUnit = field === "conversion" ? d.unit.trim() : "g";
    if (!ingredientName || !fromUnit || !toUnit) return;
    setAiBusy(field);
    setAiNotes((n) => ({ ...n, [field]: undefined }));
    try {
      const res = await fetch("/api/import/suggest-conversion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredientName, fromUnit, toUnit }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.factor == null) {
        setAiNotes((n) => ({ ...n, [field]: { text: data.error ?? `No estimate for 1 ${fromUnit} in ${toUnit}. Fill it in by hand.`, error: true } }));
        return;
      }
      patch({ [field]: String(data.factor) } as Partial<Draft>);
      setAiNotes((n) => ({ ...n, [field]: { text: `AI estimate${data.note ? ` · ${data.note}` : ""}. Check it before saving.`, error: false } }));
    } catch {
      setAiNotes((n) => ({ ...n, [field]: { text: "Couldn't reach the AI. Check your connection.", error: true } }));
    } finally {
      setAiBusy(null);
    }
  }

  async function lookup() {
    const q = d.name.trim() || d.nameRo.trim();
    if (!q) return;
    setLooking(true);
    setLookError(null);
    setUsda(null);
    try {
      const res = await fetch(`/api/nutrition?q=${encodeURIComponent(q)}`);
      const data = await res.json().catch(() => ({}));
      if (res.status === 404) { setLookError(`USDA has no match for “${q}”. Try a simpler name, or type the values in.`); return; }
      if (!res.ok) { setLookError(data.error ?? "Couldn't reach USDA. Please try again."); return; }
      setUsda({ name: data.name ?? q, kcal: data.kcal ?? null, protein: data.protein ?? null, carbs: data.carbs ?? null, fat: data.fat ?? null });
    } catch {
      setLookError("Couldn't reach USDA. Check your connection.");
    } finally {
      setLooking(false);
    }
  }

  function useUsda() {
    if (!usda) return;
    patch({
      kcal: usda.kcal != null ? String(usda.kcal) : d.kcal,
      protein: usda.protein != null ? String(usda.protein) : d.protein,
      carbs: usda.carbs != null ? String(usda.carbs) : d.carbs,
      fat: usda.fat != null ? String(usda.fat) : d.fat,
    });
    setUsda(null);
  }

  async function handleDelete() {
    if (!itemId) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await deleteGroceryItem(itemId);
      if (!res.ok) {
        setDeleteError(`It's used in ${res.usedIn} ${res.usedIn === 1 ? "recipe" : "recipes"}, so it wasn't deleted.`);
        return;
      }
      onClose();
      onDeleted?.();
    } catch {
      setDeleteError("Couldn't delete. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  // ── Derived ──
  const kcal = num(d.kcal);
  const split = energySplit(kcal, num(d.protein), num(d.carbs), num(d.fat));
  const conv = num(d.conversion);
  const uw = num(d.unitWeight);
  const mass = isMassUnit(d.unit);
  const equivalents: string[] = [];
  if (!mass && d.unit && uw != null) {
    equivalents.push(`1 ${d.unit} ≈ ${fmtNum(uw)} g${kcal != null ? ` · ${fmtNum((kcal * uw) / 100)} kcal` : ""}`);
  }
  if (d.unit2 && conv != null) {
    const grams = mass ? conv : uw != null ? conv * uw : null;
    equivalents.push(
      `1 ${d.unit2} = ${fmtNum(conv)} ${d.unit}` +
        (grams != null && !mass ? ` ≈ ${fmtNum(grams)} g` : "") +
        (grams != null && kcal != null ? ` · ${Math.round((kcal * grams) / 100)} kcal` : "")
    );
  }
  const known = categories.includes(d.category.trim());
  const legacy = !!d.category.trim() && !known;
  const suggestedCat = legacy ? canonicalCategory(d.category) : null;
  const showCatBanner = isEdit && d.category === initial.category && (legacy || !d.category);
  const recipes = usedIn ?? [];
  const per = d.unit.trim().toLowerCase() === "ml" ? "100 ml" : "100 g";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 dark:bg-black/60 md:flex md:items-center md:justify-center md:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-0 md:static md:w-full md:max-w-lg md:max-h-[90dvh] md:rounded-3xl bg-[var(--color-bg-base)] flex flex-col overflow-hidden shadow-xl"
      >
        {/* Top bar */}
        <div
          className="shrink-0 flex items-center justify-between gap-2 pl-1 pr-3 pb-2 border-b border-gray-100 dark:border-[#3a352e]"
          style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="h-11 pl-1 pr-3 flex items-center gap-0.5 text-base text-gray-600 dark:text-[#a49c90]"
          >
            <ChevronLeft size={22} aria-hidden /> {backLabel}
          </button>
          <h2 id={titleId} className="sr-only">{isEdit ? `Edit ${d.name || "ingredient"}` : "New ingredient"}</h2>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className={`h-10 min-w-[72px] px-[18px] rounded-xl text-[15px] font-bold flex items-center justify-center gap-1.5 transition-colors ${
              canSave
                ? "bg-orange-500 hover:bg-orange-600 text-white"
                : "bg-gray-100 dark:bg-[#2e2a24] text-gray-500 dark:text-[#a49c90]"
            }`}
          >
            {saving && <Loader2 size={15} className="animate-spin" aria-hidden />}
            {isEdit ? "Save" : "Add"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4" style={{ paddingBottom: "max(2.5rem, env(safe-area-inset-bottom))" }}>
          {loading ? (
            <div className="py-16 flex justify-center" aria-busy="true">
              <Loader2 size={22} className="animate-spin text-gray-400" aria-label="Loading" />
            </div>
          ) : loadError ? (
            <div className="py-16 text-center">
              <p className="text-[17px] font-semibold text-gray-900 dark:text-[#eae5de]">Couldn&apos;t load this ingredient</p>
              <p className="mt-1 text-sm text-gray-600 dark:text-[#a49c90]">Close it and try again.</p>
            </div>
          ) : (
            <>
              {/* Names */}
              <label htmlFor={`${titleId}-name`} className={`${labelCls} !text-gray-600 dark:!text-[#a49c90]`}>Name</label>
              <input
                id={`${titleId}-name`}
                value={d.name}
                autoFocus={!isEdit && !initialName}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="e.g. Buckwheat flour"
                className="w-full h-[52px] bg-transparent border-0 border-b border-gray-200 dark:border-[#3a352e] focus:border-orange-500 outline-none font-[family-name:var(--font-serif)] text-[30px]! text-gray-900 dark:text-[#eae5de] placeholder:text-gray-300 dark:placeholder:text-[#5c554b]"
              />
              {isEdit && (
                <p className={hintCls}>
                  {usedIn == null ? "…" : recipes.length ? `Used in ${recipes.length} ${recipes.length === 1 ? "recipe" : "recipes"}` : "Not used in any recipe yet"}
                </p>
              )}

              <label htmlFor={`${titleId}-ro`} className={labelCls}>Romanian name</label>
              <input
                id={`${titleId}-ro`}
                value={d.nameRo}
                onChange={(e) => patch({ nameRo: e.target.value })}
                placeholder="e.g. făină de hrișcă"
                className={fieldCls}
              />
              <p className={hintCls}>Only used to find it when you search in Romanian.</p>

              {/* Category */}
              <h3 className={sectionCls}>Category</h3>
              {showCatBanner && (
                <p className={`${warnCls} mb-3`}>
                  {legacy
                    ? `Still saved as “${groceryCategoryLabel(d.category)}”, from the old category list, so it shows under ${groceryCategoryLabel(suggestedCat) || "Other"}. Pick where it belongs.`
                    : "No category yet, so it shows under Other on the shopping list. Pick where it belongs."}
                </p>
              )}
              <div role="group" aria-label="Category" className="flex flex-wrap gap-1.5">
                {categories.map((c) => {
                  const on = d.category.trim() === c;
                  const hinted = !on && suggestedCat === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={on}
                      onClick={() => patch({ category: c })}
                      className={`h-10 px-3 rounded-full border text-sm transition-colors ${
                        on
                          ? "bg-orange-500 border-orange-500 text-gray-900 font-semibold"
                          : hinted
                          ? "border-dashed border-orange-500 bg-white dark:bg-[#24211c] text-orange-600 dark:text-orange-400 font-semibold"
                          : "bg-white dark:bg-[#24211c] border-gray-200 dark:border-[#3a352e] text-gray-600 dark:text-[#a49c90] font-medium"
                      }`}
                    >
                      {groceryCategoryLabel(c)}
                    </button>
                  );
                })}
              </div>
              <div className={`${cardCls} mt-3 px-3.5 min-h-[60px] flex items-center justify-between gap-3`}>
                <span className="py-2.5">
                  <span className="block text-base font-medium text-gray-900 dark:text-[#eae5de]">Usually at home</span>
                  <span className="block text-[13px] text-gray-600 dark:text-[#a49c90]">Listed under &ldquo;Probably at home&rdquo; when shopping.</span>
                </span>
                <Switch on={d.pantryStaple} onChange={(on) => patch({ pantryStaple: on })} label="Usually at home" />
              </div>

              {/* Units */}
              <h3 className={sectionCls}>Units</h3>
              <div className={`${cardCls} px-3.5 pb-4`}>
                <span className={labelCls}>Measured in</span>
                <UnitPicker
                  label="Measured in"
                  value={d.unit}
                  options={UNIT_CHOICES}
                  onChange={(u) => patch({ unit: u, unit2: d.unit2 === u ? "" : d.unit2 })}
                />
                <span className={labelCls}>Also measured in</span>
                <UnitPicker
                  label="Also measured in"
                  value={d.unit2}
                  allowNone
                  options={UNIT_CHOICES.filter((u) => u !== d.unit)}
                  onChange={(u) => patch({ unit2: u })}
                />

                {d.unit2 && d.unit && (
                  <>
                    <div className="mt-4 flex items-center gap-2 text-base text-gray-900 dark:text-[#eae5de]">
                      <span>1 {d.unit2} =</span>
                      <input
                        inputMode="decimal"
                        value={d.conversion}
                        onChange={(e) => patch({ conversion: e.target.value })}
                        aria-label={`How many ${d.unit} make 1 ${d.unit2}`}
                        placeholder="?"
                        className={`${numCls} w-[84px]`}
                      />
                      <span className="flex-1 min-w-0 truncate">{d.unit}</span>
                      <button type="button" onClick={() => suggest("conversion")} disabled={aiBusy != null || !d.name.trim()} className={aiBtnCls}>
                        {aiBusy === "conversion" ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Sparkles size={15} aria-hidden />}
                        {aiBusy === "conversion" ? "Asking…" : "Suggest"}
                      </button>
                    </div>
                    {aiNotes.conversion && (
                      <p className={`mt-2 text-[13px] leading-snug ${aiNotes.conversion.error ? "text-amber-700 dark:text-amber-300" : "text-orange-600 dark:text-orange-400"}`}>
                        {aiNotes.conversion.text}
                      </p>
                    )}
                  </>
                )}

                {d.unit && !mass && (
                  <>
                    <div className="mt-4 flex items-center gap-2 text-base text-gray-900 dark:text-[#eae5de]">
                      <span className="shrink-0">1 {d.unit} weighs</span>
                      <input
                        inputMode="decimal"
                        value={d.unitWeight}
                        onChange={(e) => patch({ unitWeight: e.target.value })}
                        aria-label={`Grams in 1 ${d.unit}`}
                        placeholder="?"
                        className={`${numCls} w-[84px]`}
                      />
                      <span className="flex-1">g</span>
                      <button type="button" onClick={() => suggest("unitWeight")} disabled={aiBusy != null || !d.name.trim()} className={aiBtnCls}>
                        {aiBusy === "unitWeight" ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Sparkles size={15} aria-hidden />}
                        {aiBusy === "unitWeight" ? "Asking…" : "Suggest"}
                      </button>
                    </div>
                    {aiNotes.unitWeight && (
                      <p className={`mt-2 text-[13px] leading-snug ${aiNotes.unitWeight.error ? "text-amber-700 dark:text-amber-300" : "text-orange-600 dark:text-orange-400"}`}>
                        {aiNotes.unitWeight.text}
                      </p>
                    )}
                    <p className={hintCls}>Only used to work out nutrition.</p>
                  </>
                )}
              </div>

              {/* Nutrition */}
              <div className="mt-8 mb-2.5 flex items-center justify-between gap-3">
                <h3 className={`${sectionCls} !m-0`}>Nutrition per {per}</h3>
                <button type="button" onClick={lookup} disabled={looking || (!d.name.trim() && !d.nameRo.trim())} className={aiBtnCls}>
                  {looking ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Sparkles size={15} aria-hidden />}
                  {looking ? "Looking up…" : "Check USDA"}
                </button>
              </div>
              {lookError && <p role="alert" className={`${warnCls} mb-3`}>{lookError}</p>}
              {usda && (
                <div className={`${cardCls} !border-orange-500 mb-3 px-3.5 py-3`}>
                  <p className="text-[13px] text-gray-600 dark:text-[#a49c90]">USDA · {usda.name}</p>
                  <p className="mt-1 text-base font-semibold text-gray-900 dark:text-[#eae5de]">
                    {fmtNum(usda.kcal)} kcal · P {fmtNum(usda.protein)} · C {fmtNum(usda.carbs)} · F {fmtNum(usda.fat)}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => setUsda(null)} className="flex-1 h-11 rounded-xl border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-[15px] font-semibold text-gray-900 dark:text-[#eae5de]">
                      Keep mine
                    </button>
                    <button type="button" onClick={useUsda} className="flex-1 h-11 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[15px] font-bold">
                      Use these
                    </button>
                  </div>
                </div>
              )}
              <div className={`${cardCls} p-3.5`}>
                <div className="grid grid-cols-4 gap-2">
                  {([
                    ["kcal", "kcal", "Calories"],
                    ["protein", "Protein", "Protein grams"],
                    ["carbs", "Carbs", "Carb grams"],
                    ["fat", "Fat", "Fat grams"],
                  ] as const).map(([key, label, aria]) => (
                    <label key={key} className="block min-w-0">
                      <span className="block mb-1.5 text-xs font-semibold uppercase tracking-[.04em] text-gray-600 dark:text-[#a49c90]">{label}</span>
                      <input
                        inputMode="decimal"
                        value={d[key]}
                        onChange={(e) => patch({ [key]: e.target.value } as Partial<Draft>)}
                        aria-label={`${aria} per ${per}`}
                        placeholder="—"
                        className={`${numCls} w-full`}
                      />
                    </label>
                  ))}
                </div>
                {split.sum > 0 && (
                  <>
                    <div
                      role="img"
                      aria-label={`Calories: protein ${split.protein}%, carbs ${split.carbs}%, fat ${split.fat}%`}
                      className="mt-4 h-2.5 rounded-full overflow-hidden flex bg-gray-100 dark:bg-[#2e2a24]"
                    >
                      <span className="block h-full bg-orange-500" style={{ width: `${split.protein}%` }} />
                      <span className="block h-full bg-[#e5c9a3] dark:bg-[#e8cfae]" style={{ width: `${split.carbs}%` }} />
                      <span className="block h-full bg-[#5c3620] dark:bg-[#8a5a3c]" style={{ width: `${split.fat}%` }} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-[13px] text-gray-600 dark:text-[#a49c90]">
                      <span className="flex items-center gap-1.5"><i className="block w-2.5 h-2.5 rounded-[3px] bg-orange-500" />Protein {split.protein}%</span>
                      <span className="flex items-center gap-1.5"><i className="block w-2.5 h-2.5 rounded-[3px] bg-[#e5c9a3] dark:bg-[#e8cfae]" />Carbs {split.carbs}%</span>
                      <span className="flex items-center gap-1.5"><i className="block w-2.5 h-2.5 rounded-[3px] bg-[#5c3620] dark:bg-[#8a5a3c]" />Fat {split.fat}%</span>
                    </div>
                    {split.off ? (
                      <p className={`${warnCls} mt-3`}>
                        Protein, carbs and fat add up to {Math.round(split.sum)} kcal, not {fmtNum(kcal)}. One of the four values is probably off.
                      </p>
                    ) : kcal != null ? (
                      <p className={hintCls}>Adds up: 4 × protein + 4 × carbs + 9 × fat ≈ {Math.round(split.sum)} kcal.</p>
                    ) : null}
                  </>
                )}
              </div>
              {equivalents.length > 0 && (
                <div className={`${cardCls} mt-2.5 px-3.5 py-3`}>
                  <span className="block text-xs font-semibold uppercase tracking-[.04em] text-gray-600 dark:text-[#a49c90]">In recipes</span>
                  {equivalents.map((t) => (
                    <p key={t} className="mt-1.5 text-[15px] text-gray-900 dark:text-[#eae5de]">{t}</p>
                  ))}
                </div>
              )}

              {/* Used in + delete (existing items only) */}
              {isEdit && (
                <>
                  <h3 className={sectionCls}>Used in{usedIn ? ` · ${recipes.length}` : ""}</h3>
                  {usedIn == null ? (
                    <p className={hintCls}>Loading…</p>
                  ) : recipes.length === 0 ? (
                    <p className={hintCls}>Not used in any recipe yet.</p>
                  ) : (
                    <div className={`${cardCls} overflow-hidden`}>
                      {(showAllRecipes ? recipes : recipes.slice(0, 5)).map((r, i) => (
                        <Link
                          key={r.id}
                          href={`/recipes/${r.id}`}
                          className={`min-h-[52px] px-3.5 py-1.5 flex items-center gap-2.5 text-base text-gray-900 dark:text-[#eae5de] active:bg-gray-50 dark:active:bg-[#2a2620] ${i ? "border-t border-gray-100 dark:border-[#3a352e]" : ""}`}
                        >
                          <span className="flex-1 min-w-0 truncate">{r.name.trim()}</span>
                          <ChevronRight size={16} className="text-gray-400 dark:text-[#8f877b]" aria-hidden />
                        </Link>
                      ))}
                      {recipes.length > 5 && (
                        <button
                          type="button"
                          onClick={() => setShowAllRecipes((v) => !v)}
                          aria-expanded={showAllRecipes}
                          className="w-full h-12 border-t border-gray-100 dark:border-[#3a352e] text-[15px] font-semibold text-orange-600 dark:text-orange-400"
                        >
                          {showAllRecipes ? "Show fewer" : `Show all ${recipes.length}`}
                        </button>
                      )}
                    </div>
                  )}

                  <h3 className={sectionCls}>Delete</h3>
                  {usedIn == null ? null : recipes.length > 0 ? (
                    <p className={`${cardCls} px-3.5 py-3.5 text-[15px] leading-snug text-gray-600 dark:text-[#a49c90]`}>
                      It&apos;s in {recipes.length} {recipes.length === 1 ? "recipe" : "recipes"}, so it can&apos;t be deleted. Swap it for another ingredient in {recipes.length === 1 ? "that recipe" : "those recipes"} first.
                    </p>
                  ) : confirmDelete ? (
                    <div className="rounded-2xl p-3.5 bg-red-50 dark:bg-red-400/10">
                      <p className="text-[15px] font-semibold text-gray-900 dark:text-[#eae5de]">Delete {d.name || "this ingredient"} for both of you?</p>
                      <p className="mt-1 text-sm text-gray-600 dark:text-[#a49c90]">It isn&apos;t used in any recipe. This can&apos;t be undone.</p>
                      {deleteError && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{deleteError}</p>}
                      <div className="mt-3 flex gap-2">
                        <button type="button" onClick={() => { setConfirmDelete(false); setDeleteError(null); }} className="flex-1 h-12 rounded-xl border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-[15px] font-semibold text-gray-900 dark:text-[#eae5de]">
                          Keep it
                        </button>
                        <button type="button" onClick={handleDelete} disabled={deleting} className="flex-1 h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[15px] font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                          {deleting && <Loader2 size={15} className="animate-spin" aria-hidden />}
                          Delete
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      className="w-full h-[52px] rounded-[14px] border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-base font-semibold text-red-600 dark:text-red-400"
                    >
                      Delete ingredient
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {saveError && (
          <div role="alert" className="absolute md:static left-4 right-4 bottom-6 md:m-4 rounded-[14px] px-4 py-3 bg-red-600 text-white text-[15px] font-medium shadow-lg">
            {saveError}
          </div>
        )}
      </div>
    </div>
  );
}
