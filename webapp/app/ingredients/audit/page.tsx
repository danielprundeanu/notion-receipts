"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Check, TriangleAlert } from "lucide-react";
import {
  getUnitAudit,
  updateGroceryItem,
  type MissingUnitWeightRow,
  type UnitMismatchRow,
} from "@/lib/actions";

// Inline editor for a single grocery item's unitWeight (g per piece).
function UnitWeightInput({
  onSaved,
}: {
  onSaved: (grams: number) => void;
}) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    const g = parseFloat(draft);
    if (!draft.trim() || isNaN(g) || g < 0) return;
    setSaving(true);
    onSaved(g);
  }

  return (
    <div className="flex items-center gap-1.5 justify-end">
      <input
        type="number"
        min="0"
        step="1"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); }}
        placeholder="g/buc"
        disabled={saving}
        className="w-20 px-2 py-1.5 text-sm text-right bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#3a3a3a] text-gray-900 dark:text-[#e3e3e3] placeholder:text-gray-300 dark:placeholder:text-[#555555] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
      />
      <button
        type="button"
        onClick={save}
        disabled={saving || !draft.trim()}
        className="p-1.5 rounded-lg text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950/30 disabled:opacity-40 transition-colors"
        aria-label="salvează greutatea"
      >
        {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
      </button>
    </div>
  );
}

export default function UnitAuditPage() {
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState<MissingUnitWeightRow[]>([]);
  const [mismatches, setMismatches] = useState<UnitMismatchRow[]>([]);
  const [savedCount, setSavedCount] = useState(0);

  useEffect(() => {
    getUnitAudit().then((data) => {
      setMissing(data.missingUnitWeight);
      setMismatches(data.mismatches);
      setLoading(false);
    });
  }, []);

  async function handleSaveWeight(id: string, grams: number) {
    // Optimistically drop the row — once unitWeight is set it no longer qualifies.
    setMissing((prev) => prev.filter((r) => r.id !== id));
    setSavedCount((c) => c + 1);
    await updateGroceryItem(id, { unitWeight: grams });
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/ingredients"
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-[#9a9a9a] hover:text-gray-900 dark:hover:text-[#e3e3e3] transition-colors mb-3"
        >
          <ArrowLeft size={15} /> Înapoi la ingrediente
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-[#e3e3e3]">Audit unități</h1>
        <p className="text-sm text-gray-500 dark:text-[#787878] mt-1">
          Probleme sistematice de import care strică nutriția. Completează greutatea pe bucată
          (g/buc) o singură dată — se aplică automat în toate rețetele care folosesc produsul.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
          <Loader2 size={18} className="animate-spin mr-2" /> Se încarcă…
        </div>
      ) : (
        <div className="space-y-8">
          {/* ── Missing unitWeight ─────────────────────────────── */}
          <section>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-[#d4d4d4] mb-3">
              <TriangleAlert size={15} className="text-orange-500" />
              Produse folosite ca bucată, fără greutate
              <span className="text-xs font-normal text-gray-400 dark:text-[#666]">
                ({missing.length})
              </span>
            </h2>

            {missing.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-[#787878] bg-gray-50 dark:bg-[#232323] border border-gray-200 dark:border-[#2e2e2e] rounded-xl px-4 py-6 text-center">
                {savedCount > 0 ? "Gata — toate au greutate acum 🎉" : "Nimic de reparat aici 🎉"}
              </p>
            ) : (
              <div className="overflow-auto rounded-xl border border-gray-200 dark:border-[#2e2e2e]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-[#2a2a2a] text-left text-xs text-gray-500 dark:text-[#787878]">
                      <th className="px-3 py-2 font-medium">Produs</th>
                      <th className="px-3 py-2 font-medium">Unități</th>
                      <th className="px-3 py-2 font-medium text-right">Folosiri</th>
                      <th className="px-3 py-2 font-medium">Exemple rețete</th>
                      <th className="px-3 py-2 font-medium text-right">g / bucată</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missing.map((r) => (
                      <tr key={r.id} className="border-t border-gray-100 dark:border-[#2a2a2a]">
                        <td className="px-3 py-2">
                          <span className="text-gray-900 dark:text-[#e3e3e3]">{r.name}</span>
                          {r.nameRo && (
                            <span className="text-xs text-gray-400 dark:text-[#666] ml-1.5">({r.nameRo})</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-500 dark:text-[#9a9a9a]">
                          {r.unit ?? "—"}{r.unit2 ? ` / ${r.unit2}` : ""}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-500 dark:text-[#9a9a9a]">
                          {r.uses} <span className="text-gray-400 dark:text-[#666]">({r.recipes} rețete)</span>
                        </td>
                        <td className="px-3 py-2 text-gray-500 dark:text-[#787878] text-xs">
                          {r.sampleRecipes.join(", ")}
                        </td>
                        <td className="px-3 py-2">
                          <UnitWeightInput onSaved={(g) => handleSaveWeight(r.id, g)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── Unit mismatches ────────────────────────────────── */}
          <section>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-[#d4d4d4] mb-3">
              <TriangleAlert size={15} className="text-gray-400" />
              Nepotriviri de unitate
              <span className="text-xs font-normal text-gray-400 dark:text-[#666]">
                ({mismatches.length})
              </span>
            </h2>
            <p className="text-xs text-gray-400 dark:text-[#666] mb-3">
              Ingrediente a căror unitate stocată nu e printre unitățile produsului. Deschide rețeta
              și corectează unitatea, sau adaugă unitatea pe produs.
            </p>

            {mismatches.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-[#787878] bg-gray-50 dark:bg-[#232323] border border-gray-200 dark:border-[#2e2e2e] rounded-xl px-4 py-6 text-center">
                Nicio nepotrivire 🎉
              </p>
            ) : (
              <div className="overflow-auto rounded-xl border border-gray-200 dark:border-[#2e2e2e]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-[#2a2a2a] text-left text-xs text-gray-500 dark:text-[#787878]">
                      <th className="px-3 py-2 font-medium">Rețetă</th>
                      <th className="px-3 py-2 font-medium">Produs</th>
                      <th className="px-3 py-2 font-medium">Unitate stocată</th>
                      <th className="px-3 py-2 font-medium">Unitățile produsului</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mismatches.map((m) => (
                      <tr key={m.ingredientId} className="border-t border-gray-100 dark:border-[#2a2a2a]">
                        <td className="px-3 py-2">
                          <Link
                            href={`/recipes/${m.recipeId}/edit`}
                            className="text-orange-600 dark:text-orange-400 hover:underline"
                          >
                            {m.recipeName}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-gray-700 dark:text-[#c0c0c0]">{m.itemName}</td>
                        <td className="px-3 py-2 text-red-600 dark:text-red-400">{m.ingUnit ?? "—"}</td>
                        <td className="px-3 py-2 text-gray-500 dark:text-[#9a9a9a]">
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
