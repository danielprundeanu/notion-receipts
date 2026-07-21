"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Trash2, X, Sparkles } from "lucide-react";
import { createGroceryItem, updateGroceryItem, deleteGroceryItem, getGroceryItemDetails, getRecipesUsingGroceryItem } from "@/lib/actions";
import { GROCERY_CATEGORIES } from "@/lib/constants";
import { groceryCategoryLabel } from "@/lib/labels";

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
};


// ─── GroceryItemModal ─────────────────────────────────────────────────────────
// Pass `itemId` to edit an existing item, or `initialName` to create a new one.

export default function GroceryItemModal({
  itemId,
  initialName = "",
  onClose,
  onSaved,
  onDeleted,
}: {
  itemId?: string;
  initialName?: string;
  onClose: () => void;
  onSaved: (item: GroceryItemResult) => void;
  onDeleted?: () => void;
}) {
  const isEdit = !!itemId;

  const [loading, setLoading] = useState(isEdit);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Set when the server refuses a delete because the item is still used in recipes.
  const [deleteBlocked, setDeleteBlocked] = useState<number | null>(null);
  // Set when a save fails, so the modal shows an error instead of a stuck spinner.
  const [saveError, setSaveError] = useState<string | null>(null);
  const [name, setName] = useState(initialName);
  const [nameRo, setNameRo] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("");
  const [unit2, setUnit2] = useState("");
  const [conversion, setConversion] = useState("");
  const [unitWeight, setUnitWeight] = useState("");
  const [kcal, setKcal] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [protein, setProtein] = useState("");
  const [saving, setSaving] = useState(false);
  const [fetchingNutrition, setFetchingNutrition] = useState(false);
  const [nutritionError, setNutritionError] = useState<string | null>(null);
  const [aiConvLoading, setAiConvLoading] = useState(false);
  const [aiConvNote, setAiConvNote] = useState<string | null>(null);
  const [aiConvError, setAiConvError] = useState<string | null>(null);
  const [usedIn, setUsedIn] = useState<Array<{ id: string; name: string }> | null>(null);

  async function handleSuggestConversion() {
    const ingredientName = name.trim() || nameRo.trim();
    if (!ingredientName || !unit.trim() || !unit2.trim()) return;
    setAiConvLoading(true);
    setAiConvNote(null);
    setAiConvError(null);
    try {
      const res = await fetch("/api/import/suggest-conversion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // factor = câte `toUnit` (unit) reprezintă 1 `fromUnit` (unit2) = valoarea `conversion`.
        body: JSON.stringify({ ingredientName, fromUnit: unit2.trim(), toUnit: unit.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setAiConvError(data.error ?? "Couldn't generate a suggestion"); return; }
      if (data.factor != null) {
        setConversion(String(data.factor));
        setAiConvNote(data.note || "");
      }
    } catch {
      setAiConvError("Connection error");
    } finally {
      setAiConvLoading(false);
    }
  }

  async function handleFetchNutrition() {
    const query = name.trim() || nameRo.trim();
    if (!query) return;
    setFetchingNutrition(true);
    setNutritionError(null);
    try {
      const res = await fetch(`/api/nutrition?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok) { setNutritionError(data.error ?? "No data found"); return; }
      if (data.kcal    != null) setKcal(String(data.kcal));
      if (data.carbs   != null) setCarbs(String(data.carbs));
      if (data.fat     != null) setFat(String(data.fat));
      if (data.protein != null) setProtein(String(data.protein));
    } catch {
      setNutritionError("Connection error");
    } finally {
      setFetchingNutrition(false);
    }
  }

  useEffect(() => {
    if (!itemId) return;
    getGroceryItemDetails(itemId).then((data) => {
      if (!data) return;
      setName(data.name);
      setNameRo(data.nameRo ?? "");
      setCategory(data.category ?? "");
      setUnit(data.unit ?? "");
      setUnit2(data.unit2 ?? "");
      setConversion(data.conversion?.toString() ?? "");
      setUnitWeight(data.unitWeight?.toString() ?? "");
      setKcal(data.kcal?.toString() ?? "");
      setCarbs(data.carbs?.toString() ?? "");
      setFat(data.fat?.toString() ?? "");
      setProtein(data.protein?.toString() ?? "");
      setLoading(false);
    });
  }, [itemId]);

  // Recipes that use this ingredient (reverse references).
  useEffect(() => {
    if (!itemId) { setUsedIn(null); return; }
    let cancelled = false;
    getRecipesUsingGroceryItem(itemId)
      .then((rs) => { if (!cancelled) setUsedIn(rs.map((r) => ({ id: r.id, name: r.name }))); })
      .catch(() => { if (!cancelled) setUsedIn([]); });
    return () => { cancelled = true; };
  }, [itemId]);

  async function handleDelete() {
    if (!itemId) return;
    setDeleting(true);
    setDeleteBlocked(null);
    const res = await deleteGroceryItem(itemId);
    setDeleting(false);
    if (!res.ok) {
      // Item is still referenced — surface it instead of silently orphaning ingredients.
      setDeleteBlocked(res.usedIn);
      return;
    }
    onClose();
    onDeleted?.();
  }

  async function handleSave() {
    if (!name.trim() || !unit.trim()) return;
    setSaving(true);
    setSaveError(null);

    const payload = {
      name: name.trim(),
      nameRo: nameRo.trim() || null,
      category: category || null,
      unit: unit.trim(),
      unit2: unit2.trim() || null,
      conversion: conversion ? parseFloat(conversion) : null,
      unitWeight: unitWeight ? parseFloat(unitWeight) : null,
      kcal: kcal ? parseFloat(kcal) : null,
      carbs: carbs ? parseFloat(carbs) : null,
      fat: fat ? parseFloat(fat) : null,
      protein: protein ? parseFloat(protein) : null,
    };

    try {
      if (isEdit && itemId) {
        await updateGroceryItem(itemId, payload);
        onSaved({
          id: itemId,
          name: payload.name,
          nameRo: payload.nameRo,
          category: payload.category,
          unit: payload.unit,
          unit2: payload.unit2 ?? null,
          conversion: payload.conversion,
          unitWeight: payload.unitWeight,
          kcal: payload.kcal,
          carbs: payload.carbs,
          fat: payload.fat,
          protein: payload.protein,
        });
      } else {
        const item = await createGroceryItem(payload);
        onSaved(item);
      }
      onClose();
    } catch {
      setSaveError("Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full px-3 py-2 text-sm bg-white dark:bg-[#24211c] border border-gray-200 dark:border-[#3a352e] text-gray-900 dark:text-[#eae5de] placeholder:text-gray-400 dark:placeholder:text-[#5c554b] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400";
  const labelCls =
    "text-xs font-semibold text-gray-500 dark:text-[#7c756a] uppercase tracking-wide block mb-1.5";

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-[#24211c] rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-gray-900 dark:text-[#eae5de]">
            {isEdit ? "Edit ingredient" : "New ingredient"}
          </h3>
          <button onClick={onClose} className="text-gray-400 dark:text-[#5c554b] hover:text-gray-600 p-1">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={20} className="animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Name (EN) *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. whole wheat flour"
                  className={inputCls}
                  disabled={isEdit}
                />
              </div>
              <div>
                <label className={labelCls}>Name (RO)</label>
                <input
                  value={nameRo}
                  onChange={(e) => setNameRo(e.target.value)}
                  placeholder="e.g. făină integrală"
                  className={inputCls}
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
                <option value="">— select —</option>
                {GROCERY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{groceryCategoryLabel(c)}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Primary unit *</label>
                <input
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="g, ml, pcs…"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Secondary unit</label>
                <input
                  value={unit2}
                  onChange={(e) => { setUnit2(e.target.value); setAiConvNote(null); setAiConvError(null); }}
                  placeholder="cup, tbsp…"
                  className={inputCls}
                />
              </div>
            </div>

            {unit2 && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className={labelCls + " mb-0"}>Conversion (1 {unit2} = ? {unit || "unit"})</span>
                  <button
                    type="button"
                    onClick={handleSuggestConversion}
                    disabled={aiConvLoading || !unit.trim() || (!name.trim() && !nameRo.trim())}
                    className="flex items-center gap-1 text-xs text-orange-500 hover:text-orange-600 disabled:opacity-40 transition-colors"
                    title="Estimate with AI (common cooking values)"
                  >
                    {aiConvLoading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                    {aiConvLoading ? "Searching..." : "AI suggestion"}
                  </button>
                </div>
                <input
                  inputMode="decimal" type="number" step="0.001" min="0"
                  value={conversion}
                  onChange={(e) => { setConversion(e.target.value); if (aiConvNote != null) setAiConvNote(null); }}
                  placeholder="ex: 240"
                  className={inputCls}
                />
                {aiConvNote != null && (
                  <p className="text-xs text-orange-600/90 dark:text-orange-400/90 mt-1">
                    Suggested by AI{aiConvNote ? ` · ${aiConvNote}` : ""}. Review and adjust if it's off.
                  </p>
                )}
                {aiConvError && (
                  <p className="text-xs text-red-500 dark:text-red-400 mt-1">{aiConvError}</p>
                )}
              </div>
            )}

            {unit.trim() && !["g", "ml"].includes(unit.trim().toLowerCase()) && (
              <div>
                <label className={labelCls}>Weight per {unit.trim()} (g)</label>
                <input
                  inputMode="decimal" type="number" step="0.1" min="0"
                  value={unitWeight}
                  onChange={(e) => setUnitWeight(e.target.value)}
                  placeholder="e.g. 60"
                  className={inputCls}
                />
                <p className="text-xs text-gray-400 dark:text-[#5c554b] mt-1">
                  How many grams are in 1 {unit.trim()}. Used only for nutrition calculations.
                </p>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className={labelCls}>Nutrition (per 100{unit === "ml" ? "ml" : "g"})</span>
                <button
                  type="button"
                  onClick={handleFetchNutrition}
                  disabled={fetchingNutrition || (!name.trim() && !nameRo.trim())}
                  className="flex items-center gap-1 text-xs text-orange-500 hover:text-orange-600 disabled:opacity-40 transition-colors"
                  title="Search Open Food Facts"
                >
                  {fetchingNutrition
                    ? <Loader2 size={11} className="animate-spin" />
                    : <span>↓</span>}
                  {fetchingNutrition ? "Searching..." : "Auto-fill"}
                </button>
              </div>
              {nutritionError && (
                <p className="text-xs text-red-500 dark:text-red-400 mb-1.5">{nutritionError}</p>
              )}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "kcal", value: kcal, set: setKcal },
                  { label: "carbs g", value: carbs, set: setCarbs },
                  { label: "fat g", value: fat, set: setFat },
                  { label: "protein g", value: protein, set: setProtein },
                ].map(({ label, value, set }) => (
                  <div key={label}>
                    <span className="text-xs text-gray-400 dark:text-[#5c554b] block mb-1">{label}</span>
                    <input
                      inputMode="decimal" type="number" step="0.1" min="0"
                      value={value}
                      onChange={(e) => set(e.target.value)}
                      className="w-full px-2 py-1.5 text-sm bg-white dark:bg-[#24211c] border border-gray-200 dark:border-[#3a352e] text-gray-900 dark:text-[#eae5de] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                  </div>
                ))}
              </div>
            </div>

            {isEdit && (
              <div>
                <span className={labelCls}>
                  Used in{usedIn ? ` (${usedIn.length})` : ""}
                </span>
                {usedIn === null ? (
                  <p className="text-xs text-gray-400 dark:text-[#5c554b]">Loading…</p>
                ) : usedIn.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-[#5c554b]">Not used in any recipe.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                    {usedIn.map((r) => (
                      <Link
                        key={r.id}
                        href={`/recipes/${r.id}`}
                        className="inline-flex items-center px-2.5 py-1 rounded-full text-xs bg-gray-100 dark:bg-[#2a2620] text-gray-700 dark:text-[#ccc4b8] hover:bg-gray-200 dark:hover:bg-[#322e28] transition-colors"
                      >
                        {r.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {isEdit && confirmDelete && (
          <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900">
            {usedIn && usedIn.length > 0 ? (
              <>
                <p className="text-sm text-red-700 dark:text-red-400 mb-3">
                  Can't delete <strong>{name}</strong> — it's used in {usedIn.length} {usedIn.length === 1 ? "recipe" : "recipes"} (see the list above). Replace or remove it from them first.
                </p>
                <button
                  type="button"
                  onClick={() => { setConfirmDelete(false); setDeleteBlocked(null); }}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-[#a49c90] hover:bg-gray-100 dark:hover:bg-[#2c2822] rounded-lg transition-colors"
                >
                  Got it
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-red-700 dark:text-red-400 mb-3">
                  Permanently delete <strong>{name}</strong>? This action cannot be undone.
                </p>
                {deleteBlocked != null && (
                  <p className="text-sm text-red-700 dark:text-red-400 mb-3">
                    The item is used in {deleteBlocked} {deleteBlocked === 1 ? "recipe" : "recipes"} — it wasn't deleted.
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-40 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    {deleting && <Loader2 size={13} className="animate-spin" />}
                    Delete permanently
                  </button>
                  <button
                    type="button"
                    onClick={() => { setConfirmDelete(false); setDeleteBlocked(null); }}
                    className="px-4 py-2 text-sm text-gray-600 dark:text-[#a49c90] hover:bg-gray-100 dark:hover:bg-[#2c2822] rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {saveError && (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400">{saveError}</p>
        )}

        <div className="flex items-center gap-3 mt-4">
          {isEdit && !confirmDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 px-3 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
              title="Delete ingredient"
            >
              <Trash2 size={15} /> Delete
            </button>
          )}
          <div className="flex gap-3 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm text-gray-600 dark:text-[#a49c90] hover:bg-gray-50 dark:hover:bg-[#2c2822] rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading || !name.trim() || !unit.trim()}
              className="px-5 py-2.5 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-40 flex items-center justify-center gap-2 transition-colors"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {isEdit ? "Save" : "Create ingredient"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
