"use client";

import { useMemo, useRef, useState } from "react";
import { Loader2, Sparkles, X, ArrowLeft, AlertTriangle } from "lucide-react";
import { groceryCategoryLabel } from "@/lib/labels";
import { categoryIcon } from "@/lib/constants";
import { parseIngredientBlock } from "@/lib/shopping-lines";

// ─── BulkGroceryAdd ──────────────────────────────────────────────────────────
// The "paste a list" half of the shopping list's add-product form: paste a block of
// lines, check what was parsed, add them all to this week in one go. Rendered inline
// (not as a modal) so it sits exactly where the single-product form does.
//
// Quantities parsed off a line ARE stored here — unlike the ingredient catalog, a
// GroceryListItem has quantity + unit.

export type BulkProductRow = {
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string;
};

type Row = {
  key: string;
  raw: string;
  name: string;
  qty: string;
  unit: string;
  category: string;
  aiFilled: boolean;
};

const PLACEHOLDER = `1 x servetele
2 prosop de bucatarie
500 ml lapte
Servetele umede`;

// Matches the server's dedupe key in addGroceryListItems (name + unit, case-folded),
// so a row flagged here is exactly a row the server will skip.
const dupKey = (name: string, unit: string | null | undefined) =>
  `${name.trim().toLowerCase()}::${(unit ?? "").trim().toLowerCase()}`;

export default function BulkGroceryAdd({
  categories,
  existing,
  defaultCategory = "Other",
  inputCls,
  onAdd,
}: {
  categories: string[];
  /** This week's hand-added products, to flag rows the server would skip. */
  existing: Array<{ name: string; unit: string | null }>;
  defaultCategory?: string;
  /** Shared with the single-product form so both look identical. */
  inputCls: string;
  /** Returns true when the products were added (the form then resets). */
  onAdd: (rows: BulkProductRow[]) => Promise<boolean>;
}) {
  const [step, setStep] = useState<"paste" | "review">("paste");
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const nextKey = useRef(0);

  const existingKeys = useMemo(
    () => new Set(existing.map((e) => dupKey(e.name, e.unit))),
    [existing]
  );

  // Recomputed on every edit: already in this week, or a repeat of an earlier row.
  const duplicates = useMemo(() => {
    const seen = new Set<string>();
    const out: Record<string, true> = {};
    for (const r of rows) {
      if (!r.name.trim()) continue;
      const key = dupKey(r.name, r.unit);
      if (existingKeys.has(key) || seen.has(key)) out[r.key] = true;
      else seen.add(key);
    }
    return out;
  }, [rows, existingKeys]);

  const previewCount = useMemo(() => parseIngredientBlock(text).length, [text]);

  function goToReview() {
    const parsed = parseIngredientBlock(text);
    if (!parsed.length) return;
    setRows(
      parsed.map((p) => ({
        key: `r${nextKey.current++}`,
        raw: p.raw,
        name: p.name,
        qty: p.qty != null ? String(p.qty) : "",
        unit: p.unit ?? "",
        category: defaultCategory,
        aiFilled: false,
      }))
    );
    setError(null);
    setNotice(null);
    setStep("review");
  }

  function reset() {
    setText("");
    setRows([]);
    setStep("paste");
    setError(null);
    setNotice(null);
  }

  function patchRow(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  const usable = rows.filter((r) => r.name.trim());

  async function handleAiCategorise() {
    if (!usable.length || aiBusy) return;
    setAiBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/suggest-category", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: usable.map((r) => ({ id: r.key, name: r.name.trim() })),
          categories,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.suggestions) {
        setError(
          res.status === 503
            ? "AI suggestions are unavailable (ANTHROPIC_API_KEY is not set)."
            : "Could not get AI suggestions. Please try again."
        );
        return;
      }
      const suggestions = data.suggestions as Record<string, string>;
      const ids = Object.keys(suggestions);
      if (!ids.length) {
        setError("The AI returned no usable suggestions.");
        return;
      }
      setRows((prev) =>
        prev.map((r) => (suggestions[r.key] ? { ...r, category: suggestions[r.key], aiFilled: true } : r))
      );
      setNotice(`AI filed ${ids.length} product${ids.length === 1 ? "" : "s"}. Review before adding.`);
    } catch {
      setError("Could not get AI suggestions. Please try again.");
    } finally {
      setAiBusy(false);
    }
  }

  async function handleSubmit() {
    if (!usable.length || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const ok = await onAdd(
        usable.map((r) => {
          const qty = parseFloat(r.qty.replace(",", "."));
          return {
            name: r.name.trim(),
            quantity: isNaN(qty) ? null : qty,
            unit: r.unit.trim() || null,
            category: r.category || defaultCategory,
          };
        })
      );
      if (ok) reset();
      else setError("Could not add the products. Please try again.");
    } catch {
      setError("Could not add the products. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (step === "paste") {
    return (
      <div className="space-y-2">
        <p className="text-xs text-gray-500 dark:text-[#7c756a]">
          One product per line. Leading quantities and units are picked up —{" "}
          <span className="font-medium">1 x servetele</span>,{" "}
          <span className="font-medium">2 prosop</span>, <span className="font-medium">500 ml lapte</span>.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder={PLACEHOLDER}
          aria-label="Paste your shopping list"
          className={`w-full ${inputCls} font-mono leading-relaxed resize-y min-h-[130px]`}
        />
        <button
          type="button"
          onClick={goToReview}
          disabled={previewCount === 0}
          className="w-full py-2.5 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-40 transition-colors"
        >
          {previewCount > 0 ? `Review ${previewCount} product${previewCount === 1 ? "" : "s"}` : "Review"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setStep("paste")}
          className="flex items-center gap-1.5 px-2.5 py-2 -ml-2.5 text-xs font-medium text-gray-500 dark:text-[#a49c90] hover:text-gray-700 dark:hover:text-[#bab2a6] transition-colors"
        >
          <ArrowLeft size={13} /> Edit the list
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleAiCategorise}
            disabled={aiBusy || saving || usable.length === 0}
            title="Pick a category for each product with AI"
            className="flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium text-gray-500 dark:text-[#a49c90] hover:text-orange-600 dark:hover:text-orange-400 disabled:opacity-40 transition-colors"
          >
            {aiBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {aiBusy ? "Filing…" : "AI categories"}
          </button>
          <select
            value=""
            disabled={aiBusy || saving}
            onChange={(e) => {
              const cat = e.target.value;
              if (cat) setRows((prev) => prev.map((r) => ({ ...r, category: cat, aiFilled: false })));
            }}
            aria-label="Set one category for every product"
            className="px-2 py-2 text-xs border border-gray-200 dark:border-[#3a352e] rounded-lg bg-white dark:bg-[#24211c] text-gray-600 dark:text-[#a49c90] focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:opacity-50"
          >
            <option value="">All to…</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {categoryIcon(c)} {groceryCategoryLabel(c)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <ul className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.key}
            className="rounded-lg border border-gray-200 dark:border-[#2e2a24] bg-white dark:bg-[#24211c] p-2.5 space-y-2"
          >
            <div className="flex items-center gap-1">
              <input
                value={r.name}
                onChange={(e) => patchRow(r.key, { name: e.target.value })}
                aria-label="Product name"
                className={`flex-1 min-w-0 ${inputCls}`}
              />
              <button
                type="button"
                onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                aria-label={`Remove ${r.name}`}
                className="shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-300 dark:text-[#5c554b] hover:text-red-500 dark:hover:text-red-400 rounded-lg transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex gap-2">
              <input
                value={r.qty}
                onChange={(e) => patchRow(r.key, { qty: e.target.value })}
                inputMode="decimal"
                type="number"
                step="0.1"
                min="0"
                placeholder="Qty"
                aria-label="Quantity"
                className={`w-20 ${inputCls}`}
              />
              <input
                value={r.unit}
                onChange={(e) => patchRow(r.key, { unit: e.target.value })}
                placeholder="pcs"
                aria-label="Unit"
                className={`w-20 ${inputCls}`}
              />
              <select
                value={r.category}
                onChange={(e) => patchRow(r.key, { category: e.target.value, aiFilled: false })}
                aria-label="Category"
                className={`flex-1 min-w-0 ${inputCls}`}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {categoryIcon(c)} {groceryCategoryLabel(c)}
                  </option>
                ))}
              </select>
            </div>
            {(duplicates[r.key] || r.aiFilled) && (
              <div className="flex flex-wrap items-center gap-x-3 text-xs">
                {duplicates[r.key] && (
                  <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <AlertTriangle size={12} /> already in this week — will be skipped
                  </span>
                )}
                {r.aiFilled && <span className="text-orange-600/90 dark:text-orange-400/90">category by AI</span>}
              </div>
            )}
          </li>
        ))}
      </ul>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {notice && <p className="text-xs text-gray-500 dark:text-[#7c756a]">{notice}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={saving || aiBusy || usable.length === 0}
        className="w-full py-2.5 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-40 flex items-center justify-center gap-2 transition-colors"
      >
        {saving && <Loader2 size={15} className="animate-spin" />}
        Add {usable.length} product{usable.length === 1 ? "" : "s"}
      </button>
    </div>
  );
}
