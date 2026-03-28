"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { createGroceryItem, updateGroceryItem, getGroceryItemDetails } from "@/lib/actions";

export type GroceryItemResult = {
  id: string;
  name: string;
  unit: string | null;
  unit2: string | null;
};

const GROCERY_CATEGORIES = [
  "🍎 Fruits", "🥕 Vegetables", "🥩 Meat & Alt", "🐟 Fish & Seafood",
  "🥚 Dairy & Eggs", "🌾 Grains & Legumes", "🥜 Nuts & Seeds",
  "🫙 Oils & Fats", "🍯 Sweeteners", "🧂 Spices & Herbs",
  "🥫 Canned & Preserved", "🧊 Frozen", "🥤 Drinks", "🍞 Bakery", "Other",
];

// ─── GroceryItemModal ─────────────────────────────────────────────────────────
// Pass `itemId` to edit an existing item, or `initialName` to create a new one.

export default function GroceryItemModal({
  itemId,
  initialName = "",
  onClose,
  onSaved,
}: {
  itemId?: string;
  initialName?: string;
  onClose: () => void;
  onSaved: (item: GroceryItemResult) => void;
}) {
  const isEdit = !!itemId;

  const [loading, setLoading] = useState(isEdit);
  const [name, setName] = useState(initialName);
  const [nameRo, setNameRo] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("");
  const [unit2, setUnit2] = useState("");
  const [conversion, setConversion] = useState("");
  const [kcal, setKcal] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [protein, setProtein] = useState("");
  const [saving, setSaving] = useState(false);
  const [fetchingNutrition, setFetchingNutrition] = useState(false);
  const [nutritionError, setNutritionError] = useState<string | null>(null);

  async function handleFetchNutrition() {
    const query = name.trim() || nameRo.trim();
    if (!query) return;
    setFetchingNutrition(true);
    setNutritionError(null);
    try {
      const res = await fetch(`/api/nutrition?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok) { setNutritionError(data.error ?? "Nu s-au găsit date"); return; }
      if (data.kcal    != null) setKcal(String(data.kcal));
      if (data.carbs   != null) setCarbs(String(data.carbs));
      if (data.fat     != null) setFat(String(data.fat));
      if (data.protein != null) setProtein(String(data.protein));
    } catch {
      setNutritionError("Eroare la conexiune");
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
      setKcal(data.kcal?.toString() ?? "");
      setCarbs(data.carbs?.toString() ?? "");
      setFat(data.fat?.toString() ?? "");
      setProtein(data.protein?.toString() ?? "");
      setLoading(false);
    });
  }, [itemId]);

  async function handleSave() {
    if (!name.trim() || !unit.trim()) return;
    setSaving(true);

    const payload = {
      name: name.trim(),
      nameRo: nameRo.trim() || null,
      category: category || null,
      unit: unit.trim(),
      unit2: unit2.trim() || null,
      conversion: conversion ? parseFloat(conversion) : null,
      kcal: kcal ? parseFloat(kcal) : null,
      carbs: carbs ? parseFloat(carbs) : null,
      fat: fat ? parseFloat(fat) : null,
      protein: protein ? parseFloat(protein) : null,
    };

    if (isEdit && itemId) {
      await updateGroceryItem(itemId, payload);
      onSaved({ id: itemId, name: payload.name, unit: payload.unit, unit2: payload.unit2 ?? null });
    } else {
      const item = await createGroceryItem(payload);
      onSaved(item);
    }

    setSaving(false);
    onClose();
  }

  const inputCls =
    "w-full px-3 py-2 text-sm bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#3a3a3a] text-gray-900 dark:text-[#e3e3e3] placeholder:text-gray-400 dark:placeholder:text-[#555555] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400";
  const labelCls =
    "text-xs font-semibold text-gray-500 dark:text-[#787878] uppercase tracking-wide block mb-1.5";

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-[#252525] rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-gray-900 dark:text-[#e3e3e3]">
            {isEdit ? "Edit ingredient" : "Ingredient nou"}
          </h3>
          <button onClick={onClose} className="text-gray-400 dark:text-[#555555] hover:text-gray-600 p-1">
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
                <label className={labelCls}>Nume (EN) *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ex: whole wheat flour"
                  className={inputCls}
                  disabled={isEdit}
                />
              </div>
              <div>
                <label className={labelCls}>Nume (RO)</label>
                <input
                  value={nameRo}
                  onChange={(e) => setNameRo(e.target.value)}
                  placeholder="ex: făină integrală"
                  className={inputCls}
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>Categorie</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
                <option value="">— selectează —</option>
                {GROCERY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Unitate principală *</label>
                <input
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="g, ml, piece…"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Unitate secundară</label>
                <input
                  value={unit2}
                  onChange={(e) => setUnit2(e.target.value)}
                  placeholder="cup, tbsp…"
                  className={inputCls}
                />
              </div>
            </div>

            {unit2 && (
              <div>
                <label className={labelCls}>Conversie (1 {unit2} = ? {unit || "unit"})</label>
                <input
                  type="number" step="0.001" min="0"
                  value={conversion}
                  onChange={(e) => setConversion(e.target.value)}
                  placeholder="ex: 240"
                  className={inputCls}
                />
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className={labelCls}>Nutriție (per 100{unit === "ml" ? "ml" : "g"})</span>
                <button
                  type="button"
                  onClick={handleFetchNutrition}
                  disabled={fetchingNutrition || (!name.trim() && !nameRo.trim())}
                  className="flex items-center gap-1 text-xs text-orange-500 hover:text-orange-600 disabled:opacity-40 transition-colors"
                  title="Caută în Open Food Facts"
                >
                  {fetchingNutrition
                    ? <Loader2 size={11} className="animate-spin" />
                    : <span>↓</span>}
                  {fetchingNutrition ? "Se caută..." : "Auto-fill"}
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
                    <span className="text-xs text-gray-400 dark:text-[#555555] block mb-1">{label}</span>
                    <input
                      type="number" step="0.1" min="0"
                      value={value}
                      onChange={(e) => set(e.target.value)}
                      className="w-full px-2 py-1.5 text-sm bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#3a3a3a] text-gray-900 dark:text-[#e3e3e3] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading || !name.trim() || !unit.trim()}
            className="flex-1 py-2.5 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-40 flex items-center justify-center gap-2 transition-colors"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {isEdit ? "Save" : "Creează ingredient"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-sm text-gray-600 dark:text-[#9a9a9a] hover:bg-gray-50 dark:hover:bg-[#2f2f2f] rounded-lg transition-colors"
          >
            Anulează
          </button>
        </div>
      </div>
    </div>
  );
}
