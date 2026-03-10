"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2, Star, ChevronDown, ChevronUp, X, ImageIcon } from "lucide-react";
import {
  createRecipe,
  updateRecipe,
  deleteRecipe,
  searchGroceryItems,
  getGroceryItemDetails,
  updateGroceryItem,
} from "@/lib/actions";

const CATEGORIES = [
  "Breakfast", "Lunch", "Dinner", "Snack",
  "Smoothie", "Smoothie Bowl", "Soup", "High Protein", "Receipt", "Extra",
];
const ALL_UNITS = ["g", "ml", "piece", "tsp", "tbsp", "cup", "slice", "handful", "pinch", "scoop", "bottle", "pint"];
const DIFFICULTIES = ["Easy", "Moderate"];

// ─── Types ────────────────────────────────────────────────────────────────────

type IngredientRow = {
  id: string;
  quantity: string;
  unit: string;
  groceryItemName: string;
  notes: string;
  groceryItemId: string | null;
  availableUnits: string[] | null; // null = show all ALL_UNITS
};

type IngredientGroup = {
  id: string;
  name: string;
  ingredients: IngredientRow[];
};

export type InitialRecipeData = {
  id: string;
  name: string;
  categories: string[];
  servings: string;
  time: string;
  difficulty: string;
  favorite: boolean;
  link: string;
  notes: string;
  imageUrl: string;
  groups: IngredientGroup[];
  instructionsText: string;
};

function uid() {
  return Math.random().toString(36).slice(2);
}

function emptyIngredient(): IngredientRow {
  return { id: uid(), quantity: "", unit: "g", groceryItemName: "", notes: "", groceryItemId: null, availableUnits: null };
}

function defaultGroup(name = "Ingredients"): IngredientGroup {
  return { id: uid(), name, ingredients: [emptyIngredient()] };
}

// ─── Grocery Item Autocomplete ──────────────────────────────────────────────

type GroceryItemOption = { id: string; name: string; unit: string | null; unit2: string | null };

function GroceryItemInput({
  value,
  onChange,
  onItemSelect,
}: {
  value: string;
  onChange: (name: string) => void;
  onItemSelect?: (item: GroceryItemOption) => void;
}) {
  const [results, setResults] = useState<GroceryItemOption[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (value.length < 2) { setResults([]); return; }
      const r = await searchGroceryItems(value);
      setResults(r as GroceryItemOption[]);
      if (r.length > 0) setOpen(true);
    }, 250);
    return () => clearTimeout(t);
  }, [value]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative flex-1 min-w-0">
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        placeholder="Ingredient name"
        className="w-full px-2.5 py-1.5 text-sm bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#3a3a3a] text-gray-900 dark:text-[#e3e3e3] placeholder:text-gray-400 dark:placeholder:text-[#555555] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
      />
      {open && results.length > 0 && (
        <div className="absolute z-30 top-full mt-0.5 left-0 right-0 bg-white dark:bg-[#2a2a2a] border border-gray-200 dark:border-[#3a3a3a] rounded-lg shadow-lg overflow-hidden">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(r.name);
                onItemSelect?.(r);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-orange-50 dark:hover:bg-orange-950/30 flex items-center justify-between"
            >
              <span className="text-gray-800 dark:text-[#d4d4d4]">{r.name}</span>
              {r.unit && (
                <span className="text-xs text-gray-500 dark:text-[#787878] ml-2">
                  {r.unit}{r.unit2 ? ` / ${r.unit2}` : ""}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Grocery Item Edit Modal ──────────────────────────────────────────────────

function GroceryItemEditModal({
  itemId,
  onClose,
  onSaved,
}: {
  itemId: string;
  onClose: () => void;
  onSaved: (unit: string | null, unit2: string | null) => void;
}) {
  const [item, setItem] = useState<{
    name: string; unit: string | null; unit2: string | null;
    conversion: number | null; kcal: number | null; carbs: number | null;
    fat: number | null; protein: number | null;
  } | null>(null);
  const [unit2, setUnit2] = useState("");
  const [conversion, setConversion] = useState("");
  const [kcal, setKcal] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [protein, setProtein] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getGroceryItemDetails(itemId).then((data) => {
      if (!data) return;
      setItem(data);
      setUnit2(data.unit2 ?? "");
      setConversion(data.conversion?.toString() ?? "");
      setKcal(data.kcal?.toString() ?? "");
      setCarbs(data.carbs?.toString() ?? "");
      setFat(data.fat?.toString() ?? "");
      setProtein(data.protein?.toString() ?? "");
    });
  }, [itemId]);

  async function handleSave() {
    setSaving(true);
    const u2 = unit2.trim() || null;
    await updateGroceryItem(itemId, {
      unit2: u2,
      conversion: conversion ? parseFloat(conversion) : null,
      kcal: kcal ? parseFloat(kcal) : null,
      carbs: carbs ? parseFloat(carbs) : null,
      fat: fat ? parseFloat(fat) : null,
      protein: protein ? parseFloat(protein) : null,
    });
    onSaved(item?.unit ?? null, u2);
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-[#252525] rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-gray-900 dark:text-[#e3e3e3]">
            {item ? item.name : "Loading…"}
          </h3>
          <button onClick={onClose} className="text-gray-400 dark:text-[#555555] hover:text-gray-600 dark:hover:text-[#9a9a9a] p-1">
            <X size={18} />
          </button>
        </div>

        {!item ? (
          <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-gray-400" /></div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs font-semibold text-gray-500 dark:text-[#787878] uppercase tracking-wide block mb-1.5">Primary unit</span>
                <div className="px-3 py-2 text-sm bg-gray-50 dark:bg-[#2a2a2a] border border-gray-200 dark:border-[#3a3a3a] rounded-lg text-gray-500 dark:text-[#787878]">
                  {item.unit ?? "—"}
                </div>
              </div>
              <div>
                <span className="text-xs font-semibold text-gray-500 dark:text-[#787878] uppercase tracking-wide block mb-1.5">2nd unit</span>
                <input
                  value={unit2}
                  onChange={(e) => setUnit2(e.target.value)}
                  placeholder="cup, tbsp…"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#3a3a3a] text-gray-900 dark:text-[#e3e3e3] placeholder:text-gray-400 dark:placeholder:text-[#555555] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
            </div>

            <div>
              <span className="text-xs font-semibold text-gray-500 dark:text-[#787878] uppercase tracking-wide block mb-1.5">
                Conversion (1 {unit2 || "2nd unit"} = ? {item.unit ?? "primary"})
              </span>
              <input
                type="number" step="0.001" min="0"
                value={conversion}
                onChange={(e) => setConversion(e.target.value)}
                placeholder={`e.g. 240 if 1 cup = 240 ${item.unit ?? "g"}`}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#3a3a3a] text-gray-900 dark:text-[#e3e3e3] placeholder:text-gray-400 dark:placeholder:text-[#555555] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>

            <div>
              <span className="text-xs font-semibold text-gray-500 dark:text-[#787878] uppercase tracking-wide block mb-1.5">
                Nutrition (per 100{item.unit === "ml" ? "ml" : "g"})
              </span>
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
            disabled={saving || !item}
            className="flex-1 py-2.5 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-40 flex items-center justify-center gap-2 transition-colors"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Save
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-sm text-gray-600 dark:text-[#9a9a9a] hover:bg-gray-50 dark:hover:bg-[#2f2f2f] rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Field label ─────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-xs font-semibold text-gray-600 dark:text-[#9a9a9a] uppercase tracking-wide block mb-1.5">
      {children}
    </label>
  );
}

// ─── Unit Select ──────────────────────────────────────────────────────────────

function UnitSelect({
  value,
  availableUnits,
  groceryItemId,
  onChange,
  onAddUnit,
  className,
}: {
  value: string;
  availableUnits: string[] | null;
  groceryItemId: string | null;
  onChange: (v: string) => void;
  onAddUnit: () => void;
  className?: string;
}) {
  const units = availableUnits ?? ALL_UNITS;
  const showAddUnit = groceryItemId !== null && availableUnits !== null && availableUnits.length < 2;

  return (
    <select
      value={value}
      onChange={(e) => {
        if (e.target.value === "__add_unit__") { onAddUnit(); return; }
        onChange(e.target.value);
      }}
      className={className}
    >
      <option value="">—</option>
      {units.map((u) => <option key={u} value={u}>{u}</option>)}
      {showAddUnit && <option value="__add_unit__">+ Add unit…</option>}
    </select>
  );
}

// ─── Main Form ────────────────────────────────────────────────────────────────

export default function RecipeForm({ initial }: { initial?: InitialRecipeData }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(initial?.name ?? "");
  const [categories, setCategories] = useState<string[]>(initial?.categories ?? []);
  const [servings, setServings] = useState(initial?.servings ?? "");
  const [time, setTime] = useState(initial?.time ?? "");
  const [difficulty, setDifficulty] = useState(initial?.difficulty ?? "");
  const [favorite, setFavorite] = useState(initial?.favorite ?? false);
  const [link, setLink] = useState(initial?.link ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [imageUploading, setImageUploading] = useState(false);

  const [groups, setGroups] = useState<IngredientGroup[]>(
    initial?.groups?.length ? initial.groups : [defaultGroup()]
  );
  const [instructionsText, setInstructionsText] = useState(initial?.instructionsText ?? "");

  // For the "Add unit" modal
  const [editingUnit, setEditingUnit] = useState<{
    groupId: string; ingId: string; groceryItemId: string;
  } | null>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);

  function toggleCategory(cat: string) {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }

  // ── Image upload ──────────────────────────────────────────────────────────

  async function handleImageFile(file: File) {
    setImageUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/upload-recipe-image", { method: "POST", body: fd });
      const data = await res.json();
      if (data.path) setImageUrl(data.path);
      else setError(data.error ?? "Upload failed");
    } catch {
      setError("Image upload failed");
    }
    setImageUploading(false);
  }

  // ── Group operations ──────────────────────────────────────────────────────

  function addGroup() {
    setGroups((gs) => [...gs, defaultGroup(`Group ${gs.length + 1}`)]);
  }

  function removeGroup(groupId: string) {
    setGroups((gs) => gs.filter((g) => g.id !== groupId));
  }

  function updateGroupName(groupId: string, name: string) {
    setGroups((gs) => gs.map((g) => g.id === groupId ? { ...g, name } : g));
  }

  function moveGroup(groupId: string, dir: -1 | 1) {
    setGroups((gs) => {
      const idx = gs.findIndex((g) => g.id === groupId);
      if (idx < 0) return gs;
      const next = idx + dir;
      if (next < 0 || next >= gs.length) return gs;
      const arr = [...gs];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });
  }

  // ── Ingredient operations ─────────────────────────────────────────────────

  function addIngredient(groupId: string) {
    setGroups((gs) =>
      gs.map((g) =>
        g.id === groupId
          ? { ...g, ingredients: [...g.ingredients, emptyIngredient()] }
          : g
      )
    );
  }

  function removeIngredient(groupId: string, ingId: string) {
    setGroups((gs) =>
      gs.map((g) =>
        g.id === groupId
          ? { ...g, ingredients: g.ingredients.filter((i) => i.id !== ingId) }
          : g
      )
    );
  }

  function updateIngredient(groupId: string, ingId: string, patch: Partial<IngredientRow>) {
    setGroups((gs) =>
      gs.map((g) =>
        g.id === groupId
          ? { ...g, ingredients: g.ingredients.map((i) => i.id === ingId ? { ...i, ...patch } : i) }
          : g
      )
    );
  }

  function handleItemSelect(groupId: string, ingId: string, item: { id: string; unit: string | null; unit2: string | null }) {
    const units = [item.unit, item.unit2].filter(Boolean) as string[];
    setGroups((gs) =>
      gs.map((g) =>
        g.id === groupId
          ? {
              ...g,
              ingredients: g.ingredients.map((i) => {
                if (i.id !== ingId) return i;
                const newUnit = units.length > 0 && !units.includes(i.unit) ? units[0] : i.unit;
                return {
                  ...i,
                  groceryItemId: item.id,
                  availableUnits: units.length > 0 ? units : null,
                  unit: newUnit,
                };
              }),
            }
          : g
      )
    );
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Recipe name is required"); return; }
    setSaving(true);
    setError(null);

    const ingredients = groups.flatMap((group, groupIdx) =>
      group.ingredients
        .filter((i) => i.groceryItemName.trim())
        .map((ing, order) => ({
          groceryItemName: ing.groceryItemName.trim(),
          quantity: ing.quantity ? parseFloat(ing.quantity) : null,
          unit: ing.unit || null,
          notes: ing.notes.trim() || null,
          groupOrder: groupIdx + 1,
          groupName: group.name.trim() || null,
          order,
        }))
    );

    const instructions: Array<{ text: string; isSection: boolean; step: number }> = [];
    let stepNum = 0;
    for (const line of instructionsText.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith("# ")) {
        instructions.push({ text: trimmed.slice(2).trim(), isSection: true, step: 0 });
      } else {
        stepNum++;
        instructions.push({ text: trimmed, isSection: false, step: stepNum });
      }
    }

    const payload = {
      name: name.trim(),
      categories,
      servings: servings ? parseInt(servings) : null,
      time: time ? parseInt(time) : null,
      difficulty: difficulty || null,
      favorite,
      link: link.trim() || null,
      notes: notes.trim() || null,
      imageUrl: imageUrl || null,
      ingredients,
      instructions,
    };

    try {
      if (initial?.id) {
        await updateRecipe(initial.id, payload);
        router.push(`/recipes/${initial.id}`);
        router.refresh();
      } else {
        const id = await createRecipe(payload);
        router.push(`/recipes/${id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initial?.id) return;
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setDeleting(true);
    await deleteRecipe(initial.id);
    router.push("/recipes");
    router.refresh();
  }

  const inputCls = "w-full px-3 py-2 text-sm bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#3a3a3a] text-gray-900 dark:text-[#e3e3e3] placeholder:text-gray-400 dark:placeholder:text-[#555555] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400";
  const unitSelectCls = "px-1.5 py-1.5 text-sm border border-gray-200 dark:border-[#3a3a3a] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white dark:bg-[#252525] text-gray-800 dark:text-[#d4d4d4]";

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl mx-auto px-4 md:px-8 py-6 space-y-7">
      {/* Name */}
      <div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Recipe name…"
          required
          className="w-full text-2xl font-bold text-gray-900 dark:text-[#e3e3e3] placeholder:text-gray-300 dark:placeholder:text-[#444444] bg-transparent border-0 border-b-2 border-gray-200 dark:border-[#3a3a3a] focus:border-orange-500 focus:outline-none pb-2 transition-colors"
        />
      </div>

      {/* Cover image */}
      <div>
        <Label>Cover image</Label>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImageFile(file);
          }}
        />
        {imageUrl ? (
          <div className="relative w-full h-48 rounded-xl overflow-hidden bg-gray-100 dark:bg-[#2a2a2a] group">
            <img src={imageUrl} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100">
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="px-4 py-2 bg-white rounded-lg text-sm font-medium text-gray-800 shadow"
              >
                Change
              </button>
              <button
                type="button"
                onClick={() => setImageUrl("")}
                className="px-4 py-2 bg-red-500 rounded-lg text-sm font-medium text-white shadow"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={imageUploading}
            className="w-full h-32 rounded-xl border-2 border-dashed border-gray-200 dark:border-[#3a3a3a] flex flex-col items-center justify-center gap-2 hover:border-orange-300 dark:hover:border-orange-800 hover:bg-orange-50 dark:hover:bg-orange-950/20 transition-colors group disabled:opacity-50"
          >
            {imageUploading ? (
              <Loader2 size={20} className="animate-spin text-gray-400" />
            ) : (
              <>
                <ImageIcon size={20} className="text-gray-300 dark:text-[#444444] group-hover:text-orange-400" />
                <span className="text-sm text-gray-400 dark:text-[#555555] group-hover:text-orange-500">Upload cover image</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Meta */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <Label>Servings</Label>
          <input
            type="number" min="1"
            value={servings}
            onChange={(e) => setServings(e.target.value)}
            placeholder="1"
            className={inputCls}
          />
        </div>
        <div>
          <Label>Time (min)</Label>
          <input
            type="number" min="1"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            placeholder="30"
            className={inputCls}
          />
        </div>
        <div>
          <Label>Difficulty</Label>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-[#3a3a3a] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white dark:bg-[#252525] text-gray-800 dark:text-[#d4d4d4]"
          >
            <option value="">—</option>
            {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="flex flex-col">
          <Label>Favourite</Label>
          <button
            type="button"
            onClick={() => setFavorite((f) => !f)}
            className={`flex-1 px-3 py-2 text-sm border rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
              favorite
                ? "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800/50 text-amber-700 dark:text-amber-300 font-medium"
                : "border-gray-200 dark:border-[#3a3a3a] text-gray-600 dark:text-[#9a9a9a] hover:bg-gray-50 dark:hover:bg-[#2f2f2f]"
            }`}
          >
            <Star size={13} className={favorite ? "fill-amber-400 text-amber-400" : "text-gray-400"} />
            {favorite ? "Yes" : "No"}
          </button>
        </div>
      </div>

      {/* Categories */}
      <div>
        <Label>Categories</Label>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => toggleCategory(cat)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                categories.includes(cat)
                  ? "bg-orange-500 text-white"
                  : "bg-gray-100 dark:bg-[#2a2a2a] text-gray-600 dark:text-[#9a9a9a] hover:bg-gray-200 dark:hover:bg-[#333333]"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Link + Notes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Source URL</Label>
          <input
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://…"
            className={inputCls}
          />
        </div>
        <div>
          <Label>Notes</Label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes…"
            className={inputCls}
          />
        </div>
      </div>

      {/* ── Ingredients ──────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900 dark:text-[#e3e3e3]">Ingredients</h2>
          <button
            type="button"
            onClick={addGroup}
            className="flex items-center gap-1 text-sm text-gray-600 dark:text-[#9a9a9a] hover:text-gray-900 dark:hover:text-[#e3e3e3] border border-gray-200 dark:border-[#3a3a3a] rounded-lg px-2.5 py-1 hover:bg-gray-50 dark:hover:bg-[#2f2f2f] transition-colors"
          >
            <Plus size={13} /> Add group
          </button>
        </div>

        <div className="space-y-4">
          {groups.map((group, groupIdx) => (
            <div key={group.id} className="border border-gray-200 dark:border-[#3a3a3a] rounded-xl overflow-hidden">
              {/* Group header */}
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-[#2a2a2a] border-b border-gray-200 dark:border-[#3a3a3a]">
                <input
                  value={group.name}
                  onChange={(e) => updateGroupName(group.id, e.target.value)}
                  placeholder="Group name"
                  className="flex-1 text-xs font-semibold text-gray-700 dark:text-[#b8b8b8] bg-transparent border-0 focus:outline-none focus:ring-0 uppercase tracking-wide placeholder:normal-case placeholder:font-normal placeholder:tracking-normal dark:placeholder:text-[#555555]"
                />
                <div className="flex items-center gap-0.5 shrink-0">
                  <button type="button" onClick={() => moveGroup(group.id, -1)} disabled={groupIdx === 0}
                    className="p-0.5 text-gray-300 dark:text-[#444444] hover:text-gray-600 dark:hover:text-[#9a9a9a] disabled:opacity-30 transition-colors">
                    <ChevronUp size={13} />
                  </button>
                  <button type="button" onClick={() => moveGroup(group.id, 1)} disabled={groupIdx === groups.length - 1}
                    className="p-0.5 text-gray-300 dark:text-[#444444] hover:text-gray-600 dark:hover:text-[#9a9a9a] disabled:opacity-30 transition-colors">
                    <ChevronDown size={13} />
                  </button>
                  {groups.length > 1 && (
                    <button type="button" onClick={() => removeGroup(group.id)}
                      className="p-0.5 text-gray-300 dark:text-[#444444] hover:text-red-500 transition-colors ml-1">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>

              {/* Ingredient rows */}
              <div className="p-3 space-y-2">
                {/* Column headers — desktop only */}
                <div className="hidden sm:grid grid-cols-[64px_80px_1fr_88px_28px] gap-2 mb-1 px-0.5">
                  {["Qty", "Unit", "Ingredient", "Notes", ""].map((h) => (
                    <span key={h} className="text-xs text-gray-400 font-medium">{h}</span>
                  ))}
                </div>

                {group.ingredients.map((ing) => (
                  <div key={ing.id}>
                    {/* Mobile layout */}
                    <div className="sm:hidden space-y-1.5">
                      <div className="flex gap-2 items-center">
                        <input
                          type="number" min="0" step="0.1"
                          value={ing.quantity}
                          onChange={(e) => updateIngredient(group.id, ing.id, { quantity: e.target.value })}
                          placeholder="Qty"
                          className="w-16 px-2 py-2 text-sm bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#3a3a3a] text-gray-900 dark:text-[#e3e3e3] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
                        />
                        <UnitSelect
                          value={ing.unit}
                          availableUnits={ing.availableUnits}
                          groceryItemId={ing.groceryItemId}
                          onChange={(v) => updateIngredient(group.id, ing.id, { unit: v })}
                          onAddUnit={() => ing.groceryItemId && setEditingUnit({ groupId: group.id, ingId: ing.id, groceryItemId: ing.groceryItemId })}
                          className="w-24 px-1.5 py-2 text-sm border border-gray-200 dark:border-[#3a3a3a] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white dark:bg-[#252525] text-gray-800 dark:text-[#d4d4d4]"
                        />
                        <GroceryItemInput
                          value={ing.groceryItemName}
                          onChange={(n) => updateIngredient(group.id, ing.id, { groceryItemName: n })}
                          onItemSelect={(item) => handleItemSelect(group.id, ing.id, item)}
                        />
                        <button type="button" onClick={() => removeIngredient(group.id, ing.id)}
                          className="flex items-center justify-center p-1.5 text-gray-300 dark:text-[#444444] hover:text-red-500 transition-colors shrink-0">
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <input
                        value={ing.notes}
                        onChange={(e) => updateIngredient(group.id, ing.id, { notes: e.target.value })}
                        placeholder="Notes (optional)"
                        className="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-[#3a3a3a] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 text-gray-700 dark:text-[#b8b8b8] bg-white dark:bg-[#252525]"
                      />
                    </div>

                    {/* Desktop layout */}
                    <div className="hidden sm:grid grid-cols-[64px_80px_1fr_88px_28px] gap-2 items-center">
                      <input
                        type="number" min="0" step="0.1"
                        value={ing.quantity}
                        onChange={(e) => updateIngredient(group.id, ing.id, { quantity: e.target.value })}
                        placeholder="Qty"
                        className="px-2 py-1.5 text-sm bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#3a3a3a] text-gray-900 dark:text-[#e3e3e3] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
                      />
                      <UnitSelect
                        value={ing.unit}
                        availableUnits={ing.availableUnits}
                        groceryItemId={ing.groceryItemId}
                        onChange={(v) => updateIngredient(group.id, ing.id, { unit: v })}
                        onAddUnit={() => ing.groceryItemId && setEditingUnit({ groupId: group.id, ingId: ing.id, groceryItemId: ing.groceryItemId })}
                        className={unitSelectCls}
                      />
                      <GroceryItemInput
                        value={ing.groceryItemName}
                        onChange={(n) => updateIngredient(group.id, ing.id, { groceryItemName: n })}
                        onItemSelect={(item) => handleItemSelect(group.id, ing.id, item)}
                      />
                      <input
                        value={ing.notes}
                        onChange={(e) => updateIngredient(group.id, ing.id, { notes: e.target.value })}
                        placeholder="Notes"
                        className="px-2 py-1.5 text-xs border border-gray-200 dark:border-[#3a3a3a] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 text-gray-700 dark:text-[#b8b8b8] bg-white dark:bg-[#252525]"
                      />
                      <button type="button" onClick={() => removeIngredient(group.id, ing.id)}
                        className="flex items-center justify-center p-1 text-gray-300 dark:text-[#444444] hover:text-red-500 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => addIngredient(group.id)}
                  className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 font-medium mt-1"
                >
                  <Plus size={12} /> Add ingredient
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Instructions ─────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-semibold text-gray-900 dark:text-[#e3e3e3]">Instructions</h2>
          <span className="text-xs text-gray-400 dark:text-[#555555]">Lines starting with <code className="bg-gray-100 dark:bg-[#2a2a2a] px-1 rounded"># </code> become section headers</span>
        </div>
        <textarea
          value={instructionsText}
          onChange={(e) => setInstructionsText(e.target.value)}
          placeholder={"# Prep\nChop the onions and garlic.\nHeat oil in a pan.\n\n# Cook\nAdd onions and cook until soft."}
          rows={12}
          className="w-full px-3 py-2.5 text-sm bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#3a3a3a] rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400 resize-y font-mono leading-relaxed text-gray-800 dark:text-[#d4d4d4] placeholder:font-sans placeholder:text-gray-400 dark:placeholder:text-[#555555]"
        />
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 px-4 py-3 rounded-lg">
          {error}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2 border-t border-gray-100 dark:border-[#2e2e2e]">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white rounded-lg text-sm font-semibold hover:bg-orange-600 disabled:opacity-50 transition-colors"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          {initial?.id ? "Save changes" : "Create recipe"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2.5 text-sm text-gray-600 dark:text-[#9a9a9a] hover:text-gray-900 dark:hover:text-[#e3e3e3] transition-colors"
        >
          Cancel
        </button>
        {initial?.id && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="ml-auto flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors disabled:opacity-50"
          >
            {deleting && <Loader2 size={13} className="animate-spin" />}
            Delete recipe
          </button>
        )}
      </div>

      {/* Grocery item edit modal */}
      {editingUnit && (
        <GroceryItemEditModal
          itemId={editingUnit.groceryItemId}
          onClose={() => setEditingUnit(null)}
          onSaved={(unit, unit2) => {
            const newUnits = [unit, unit2].filter(Boolean) as string[];
            updateIngredient(editingUnit.groupId, editingUnit.ingId, {
              availableUnits: newUnits.length > 0 ? newUnits : null,
              unit: unit2 ?? unit ?? "",
            });
            setEditingUnit(null);
          }}
        />
      )}
    </form>
  );
}
