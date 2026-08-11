"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Check, TriangleAlert, Sparkles, Tags } from "lucide-react";
import {
  getUnitAudit,
  getCategoryAudit,
  updateGroceryItem,
  type MissingUnitWeightRow,
  type UnitMismatchRow,
  type UncategorizedRow,
} from "@/lib/actions";
import { GROCERY_CATEGORIES, canonicalCategory } from "@/lib/constants";

// Inline category picker for an item that has none (or a legacy value). Saving is
// a single write on the item and propagates everywhere it's used. When the legacy
// value has a known modern equivalent it comes pre-selected, so the common case
// ("Grains" → "Grains & Legumes") is a single confirmation.
function CategoryFix({
  suggested,
  onSave,
}: {
  suggested: string | null;
  onSave: (category: string) => void;
}) {
  const [value, setValue] = useState(suggested ?? "");
  const [saving, setSaving] = useState(false);

  return (
    <div className="flex items-center gap-1.5 justify-end">
      <select
        value={value}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Set category"
        className="w-full md:w-52 px-2 py-1.5 text-sm bg-white dark:bg-[#24211c] border border-gray-200 dark:border-[#3a352e] text-gray-900 dark:text-[#eae5de] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:opacity-50"
      >
        <option value="">Set category…</option>
        {GROCERY_CATEGORIES.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => { if (!value) return; setSaving(true); onSave(value); }}
        disabled={saving || !value}
        aria-label="Apply category"
        className="p-1.5 rounded-lg text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950/30 disabled:opacity-40 transition-colors"
      >
        {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
      </button>
    </div>
  );
}

// Inline numeric fix (grams-per-unit conversion, or grams-per-piece weight),
// with an optional AI estimate button (fills the draft, user reviews then saves).
function FixInput({
  placeholder,
  aiParams,
  onSave,
}: {
  placeholder: string;
  aiParams?: { ingredientName: string; fromUnit: string; toUnit: string };
  onSave: (value: number) => void;
}) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErr, setAiErr] = useState(false);

  async function suggest() {
    if (!aiParams || !aiParams.fromUnit || !aiParams.toUnit) return;
    setAiLoading(true);
    setAiErr(false);
    try {
      const res = await fetch("/api/import/suggest-conversion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aiParams),
      });
      const data = await res.json();
      if (res.ok && data.factor != null) setDraft(String(data.factor));
      else setAiErr(true);
    } catch {
      setAiErr(true);
    } finally {
      setAiLoading(false);
    }
  }

  function save() {
    const g = parseFloat(draft);
    if (!draft.trim() || isNaN(g) || g < 0) return;
    setSaving(true);
    onSave(g);
  }

  return (
    <div className="flex items-center gap-1.5 justify-end">
      {aiParams && (
        <button
          type="button"
          onClick={suggest}
          disabled={aiLoading}
          title={aiErr ? "AI couldn't estimate — try again or fill it in manually" : "Estimate with AI"}
          aria-label="AI suggestion"
          className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${
            aiErr
              ? "text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
              : "text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950/30"
          }`}
        >
          {aiLoading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
        </button>
      )}
      <input
        type="number"
        min="0"
        step="1"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); }}
        placeholder={placeholder}
        disabled={saving}
        className="w-24 px-2 py-1.5 text-sm text-right bg-white dark:bg-[#24211c] border border-gray-200 dark:border-[#3a352e] text-gray-900 dark:text-[#eae5de] placeholder:text-gray-300 dark:placeholder:text-[#5c554b] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
      />
      <button
        type="button"
        onClick={save}
        disabled={saving || !draft.trim()}
        className="p-1.5 rounded-lg text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950/30 disabled:opacity-40 transition-colors"
        aria-label="save"
      >
        {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
      </button>
    </div>
  );
}

export default function AuditPage() {
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState<MissingUnitWeightRow[]>([]);
  const [mismatches, setMismatches] = useState<UnitMismatchRow[]>([]);
  const [uncategorized, setUncategorized] = useState<UncategorizedRow[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const [catSavedCount, setCatSavedCount] = useState(0);
  const [catError, setCatError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getUnitAudit(), getCategoryAudit()]).then(([units, cats]) => {
      setMissing(units.missingUnitWeight);
      setMismatches(units.mismatches);
      setUncategorized(cats);
      setLoading(false);
    });
  }, []);

  async function handleFix(id: string, field: "conversion" | "unitWeight", value: number) {
    // Optimistically drop — the fix resolves the flag for this item.
    setMissing((prev) => prev.filter((r) => r.id !== id));
    setSavedCount((c) => c + 1);
    await updateGroceryItem(id, { [field]: value } as Parameters<typeof updateGroceryItem>[1]);
  }

  async function handleCategoryFix(row: UncategorizedRow, category: string) {
    const prev = uncategorized;
    setCatError(null);
    setUncategorized((rows) => rows.filter((r) => r.id !== row.id));
    setCatSavedCount((c) => c + 1);
    try {
      await updateGroceryItem(row.id, { category });
    } catch {
      // Put the row back — a silently dropped row would look fixed when it isn't.
      setUncategorized(prev);
      setCatSavedCount((c) => Math.max(0, c - 1));
      setCatError(`Could not set the category for “${row.name}”. Please try again.`);
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/ingredients"
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-[#a49c90] hover:text-gray-900 dark:hover:text-[#eae5de] transition-colors mb-3"
        >
          <ArrowLeft size={15} /> Back to ingredients
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-[#eae5de]">Audit</h1>
        <p className="text-sm text-gray-500 dark:text-[#7c756a] mt-1">
          Systematic data issues — units that break nutrition, and items left without a
          category. Each fix is applied once per item and automatically propagates to
          every recipe that uses it.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
          <Loader2 size={18} className="animate-spin mr-2" /> Loading…
        </div>
      ) : (
        <div className="space-y-8">
          {/* ── Categories ─────────────────────────────────────── */}
          <section>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-[#d8d0c4] mb-1">
              <Tags size={15} className="text-teal-600 dark:text-teal-400" />
              Items without a category
              <span className="text-xs font-normal text-gray-400 dark:text-[#6e675c]">
                ({uncategorized.length})
              </span>
            </h2>
            <p className="text-xs text-gray-400 dark:text-[#6e675c] mb-3">
              Items with no category, or with one left over from before the list was
              standardised — they all fall under <strong>Other</strong> on the shopping
              list. Pick the matching category to file them correctly.
            </p>

            {catError && (
              <p className="mb-3 text-sm text-red-600 dark:text-red-400">{catError}</p>
            )}

            {uncategorized.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-[#7c756a] bg-gray-50 dark:bg-[#201c18] border border-gray-200 dark:border-[#2e2a24] rounded-xl px-4 py-6 text-center">
                {catSavedCount > 0 ? "Done — everything is categorised now 🎉" : "Everything is categorised 🎉"}
              </p>
            ) : (
              <>
                {/* Mobile: cards — in a table the picker sat in the last column of a
                    horizontally scrolling row, so it was off-screen and unreachable. */}
                <ul className="md:hidden space-y-2">
                  {uncategorized.map((r) => (
                    <li
                      key={r.id}
                      className="rounded-xl border border-gray-200 dark:border-[#2e2a24] bg-white dark:bg-[#24211c] px-3 py-3"
                    >
                      <Link
                        href={`/ingredients?edit=${r.id}`}
                        className="font-medium text-teal-700 dark:text-teal-400 hover:underline"
                      >
                        {r.name}
                      </Link>
                      {r.nameRo && (
                        <span className="text-xs text-gray-400 dark:text-[#6e675c] ml-1.5">({r.nameRo})</span>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs">
                        {r.category?.trim() ? (
                          <span className="text-orange-600 dark:text-orange-400">{r.category}</span>
                        ) : (
                          <span className="text-gray-400 dark:text-[#5c554b]">no category</span>
                        )}
                        <span className="text-gray-400 dark:text-[#6e675c]">
                          · {r.uses} uses ({r.recipes} recipes)
                        </span>
                      </div>
                      <div className="mt-2.5">
                        <CategoryFix suggested={canonicalCategory(r.category)} onSave={(c) => handleCategoryFix(r, c)} />
                      </div>
                    </li>
                  ))}
                </ul>

                {/* Desktop: full table with the usage context */}
                <div className="hidden md:block overflow-auto rounded-xl border border-gray-200 dark:border-[#2e2a24]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-[#2a2620] text-left text-xs text-gray-500 dark:text-[#7c756a]">
                        <th className="px-3 py-2 font-medium">Item</th>
                        <th className="px-3 py-2 font-medium">Current</th>
                        <th className="px-3 py-2 font-medium text-right">Uses</th>
                        <th className="px-3 py-2 font-medium">Example recipes</th>
                        <th className="px-3 py-2 font-medium text-right">Category</th>
                      </tr>
                    </thead>
                    <tbody>
                      {uncategorized.map((r) => (
                        <tr key={r.id} className="border-t border-gray-100 dark:border-[#2a2620]">
                          <td className="px-3 py-2">
                            <Link
                              href={`/ingredients?edit=${r.id}`}
                              className="text-teal-700 dark:text-teal-400 hover:underline"
                            >
                              {r.name}
                            </Link>
                            {r.nameRo && (
                              <span className="text-xs text-gray-400 dark:text-[#6e675c] ml-1.5">({r.nameRo})</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {r.category?.trim() ? (
                              // The legacy value, kept visible so the right replacement is obvious.
                              <span className="text-orange-600 dark:text-orange-400">{r.category}</span>
                            ) : (
                              <span className="text-gray-300 dark:text-[#4a443c]">— none —</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-500 dark:text-[#a49c90]">
                            {r.uses} <span className="text-gray-400 dark:text-[#6e675c]">({r.recipes} recipes)</span>
                          </td>
                          <td className="px-3 py-2 text-gray-500 dark:text-[#7c756a] text-xs">
                            {r.sampleRecipes.join(", ")}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex justify-end">
                              <CategoryFix suggested={canonicalCategory(r.category)} onSave={(c) => handleCategoryFix(r, c)} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          {/* ── Non-convertible units ──────────────────────────── */}
          <section>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-[#d8d0c4] mb-1">
              <TriangleAlert size={15} className="text-orange-500" />
              Units that cannot be converted to grams
              <span className="text-xs font-normal text-gray-400 dark:text-[#6e675c]">
                ({missing.length})
              </span>
            </h2>
            <p className="text-xs text-gray-400 dark:text-[#6e675c] mb-3">
              The quantity cannot be converted to grams, so nutrition comes out as 0. For volume units
              (cup, tbsp) fill in the <strong>conversion</strong> (1 cup = ? g); for pieces,
              the <strong>weight per piece</strong>. Only items with nutrition are listed.
            </p>

            {missing.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-[#7c756a] bg-gray-50 dark:bg-[#201c18] border border-gray-200 dark:border-[#2e2a24] rounded-xl px-4 py-6 text-center">
                {savedCount > 0 ? "Done — everything can be converted now 🎉" : "Nothing to fix here 🎉"}
              </p>
            ) : (
              <div className="overflow-auto rounded-xl border border-gray-200 dark:border-[#2e2a24]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-[#2a2620] text-left text-xs text-gray-500 dark:text-[#7c756a]">
                      <th className="px-3 py-2 font-medium">Item</th>
                      <th className="px-3 py-2 font-medium">Units</th>
                      <th className="hidden md:table-cell px-3 py-2 font-medium text-right">Uses</th>
                      <th className="hidden md:table-cell px-3 py-2 font-medium">Example recipes</th>
                      <th className="px-3 py-2 font-medium text-right">Fix</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missing.map((r) => {
                      const offending = (r.badUnits ?? []).filter(Boolean);
                      const unit2Lower = r.unit2?.toLowerCase();
                      const convCase = !!unit2Lower && offending.some((u) => u.toLowerCase() === unit2Lower);
                      const field: "conversion" | "unitWeight" = convCase ? "conversion" : "unitWeight";
                      const badUnit = offending[0] ?? "pcs";
                      const hint = convCase
                        ? `1 ${r.unit2} = ? ${r.unit ?? "g"}`
                        : `? g / ${badUnit}`;
                      const ph = convCase ? `g/${r.unit2}` : `g/${badUnit}`;
                      return (
                        <tr key={r.id} className="border-t border-gray-100 dark:border-[#2a2620]">
                          <td className="px-3 py-2">
                            <Link
                              href={`/ingredients?edit=${r.id}`}
                              className="text-teal-700 dark:text-teal-400 hover:underline"
                            >
                              {r.name}
                            </Link>
                            {r.nameRo && (
                              <span className="text-xs text-gray-400 dark:text-[#6e675c] ml-1.5">({r.nameRo})</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-500 dark:text-[#a49c90]">
                            {r.unit ?? "—"}{r.unit2 ? ` / ${r.unit2}` : ""}
                            <span className="block text-[11px] text-orange-500/80">
                              used as: {offending.join(", ")}
                            </span>
                          </td>
                          <td className="hidden md:table-cell px-3 py-2 text-right text-gray-500 dark:text-[#a49c90]">
                            {r.uses} <span className="text-gray-400 dark:text-[#6e675c]">({r.recipes} recipes)</span>
                          </td>
                          <td className="hidden md:table-cell px-3 py-2 text-gray-500 dark:text-[#7c756a] text-xs">
                            {r.sampleRecipes.join(", ")}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-[11px] text-gray-400 dark:text-[#6e675c]">{hint}</span>
                              <FixInput
                                placeholder={ph}
                                aiParams={{
                                  ingredientName: r.name,
                                  fromUnit: convCase ? (r.unit2 ?? "") : badUnit,
                                  toUnit: convCase ? (r.unit ?? "g") : "g",
                                }}
                                onSave={(v) => handleFix(r.id, field, v)}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── Unit mismatches ────────────────────────────────── */}
          <section>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-[#d8d0c4] mb-3">
              <TriangleAlert size={15} className="text-gray-400" />
              Unit mismatches
              <span className="text-xs font-normal text-gray-400 dark:text-[#6e675c]">
                ({mismatches.length})
              </span>
            </h2>
            <p className="text-xs text-gray-400 dark:text-[#6e675c] mb-3">
              Ingredients whose stored unit is not among the item units. Open the recipe
              and correct the unit, or add the unit to the item.
            </p>

            {mismatches.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-[#7c756a] bg-gray-50 dark:bg-[#201c18] border border-gray-200 dark:border-[#2e2a24] rounded-xl px-4 py-6 text-center">
                No mismatches 🎉
              </p>
            ) : (
              <div className="overflow-auto rounded-xl border border-gray-200 dark:border-[#2e2a24]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-[#2a2620] text-left text-xs text-gray-500 dark:text-[#7c756a]">
                      <th className="px-3 py-2 font-medium">Recipe</th>
                      <th className="px-3 py-2 font-medium">Item</th>
                      <th className="px-3 py-2 font-medium">Stored unit</th>
                      <th className="hidden md:table-cell px-3 py-2 font-medium">Item units</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mismatches.map((m) => (
                      <tr key={m.ingredientId} className="border-t border-gray-100 dark:border-[#2a2620]">
                        <td className="px-3 py-2">
                          <Link
                            href={`/recipes/${m.recipeId}/edit`}
                            className="text-teal-700 dark:text-teal-400 hover:underline"
                          >
                            {m.recipeName}
                          </Link>
                        </td>
                        <td className="px-3 py-2">
                          <Link
                            href={`/ingredients?edit=${m.groceryItemId}`}
                            className="text-gray-700 dark:text-[#c4bcb0] hover:text-teal-700 dark:hover:text-teal-400 hover:underline"
                          >
                            {m.itemName}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-red-600 dark:text-red-400">{m.ingUnit ?? "—"}</td>
                        <td className="hidden md:table-cell px-3 py-2 text-gray-500 dark:text-[#a49c90]">
                          {m.itemUnit ?? "—"}{m.itemUnit2 ? ` / ${m.itemUnit2}` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
