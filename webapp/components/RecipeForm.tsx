"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ChevronUp, ChevronDown, Loader2, Star } from "lucide-react";
import {
  createRecipe,
  updateRecipe,
  deleteRecipe,
  searchGroceryItems,
} from "@/lib/actions";

const CATEGORIES = [
  "Breakfast", "Lunch", "Dinner", "Snack",
  "Smoothie", "Smoothie Bowl", "Soup", "High Protein", "Receipt", "Extra",
];
const UNITS = ["g", "ml", "piece", "tsp", "tbsp", "cup", "slice", "handful", "pinch", "scoop", "bottle", "pint"];
const DIFFICULTIES = ["Easy", "Moderate"];

// ─── Types ────────────────────────────────────────────────────────────────────

type IngredientRow = {
  id: string;
  quantity: string;
  unit: string;
  groceryItemName: string;
  notes: string;
  groupOrder: number;
};

type InstructionRow = {
  id: string;
  text: string;
  isSection: boolean;
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
  ingredients: IngredientRow[];
  instructions: InstructionRow[];
};

function uid() {
  return Math.random().toString(36).slice(2);
}

// ─── Grocery Item Autocomplete ─────────────────────────────────────────────

function GroceryItemInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (name: string) => void;
}) {
  const [results, setResults] = useState<Array<{ id: string; name: string; unit: string | null }>>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (value.length < 2) { setResults([]); return; }
      const r = await searchGroceryItems(value);
      setResults(r);
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
        className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
      />
      {open && results.length > 0 && (
        <div className="absolute z-30 top-full mt-0.5 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(r.name); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-orange-50 flex items-center justify-between"
            >
              <span className="text-gray-800">{r.name}</span>
              {r.unit && <span className="text-xs text-gray-500 ml-2">{r.unit}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Field label ─────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">
      {children}
    </label>
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

  const [ingredients, setIngredients] = useState<IngredientRow[]>(
    initial?.ingredients.length ? initial.ingredients : [{ id: uid(), quantity: "", unit: "g", groceryItemName: "", notes: "", groupOrder: 1 }]
  );
  const [instructions, setInstructions] = useState<InstructionRow[]>(
    initial?.instructions.length ? initial.instructions : [{ id: uid(), text: "", isSection: false }]
  );

  function toggleCategory(cat: string) {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }

  function updateIngredient(id: string, patch: Partial<IngredientRow>) {
    setIngredients((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function updateInstruction(id: string, patch: Partial<InstructionRow>) {
    setInstructions((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function moveInstruction(id: string, dir: -1 | 1) {
    setInstructions((rows) => {
      const idx = rows.findIndex((r) => r.id === id);
      if (idx < 0) return rows;
      const next = idx + dir;
      if (next < 0 || next >= rows.length) return rows;
      const arr = [...rows];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Recipe name is required"); return; }
    setSaving(true);
    setError(null);

    const payload = {
      name: name.trim(),
      categories,
      servings: servings ? parseInt(servings) : null,
      time: time ? parseInt(time) : null,
      difficulty: difficulty || null,
      favorite,
      link: link.trim() || null,
      notes: notes.trim() || null,
      ingredients: ingredients
        .filter((i) => i.groceryItemName.trim())
        .map((ing, idx) => ({
          groceryItemName: ing.groceryItemName.trim(),
          quantity: ing.quantity ? parseFloat(ing.quantity) : null,
          unit: ing.unit || null,
          notes: ing.notes.trim() || null,
          groupOrder: ing.groupOrder,
          order: idx,
        })),
      instructions: instructions
        .filter((i) => i.text.trim())
        .map((inst, idx) => ({
          text: inst.text.trim(),
          isSection: inst.isSection,
          step: idx + 1,
        })),
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

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl mx-auto px-8 py-6 space-y-7">
      {/* Name */}
      <div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Recipe name…"
          required
          className="w-full text-2xl font-bold text-gray-900 placeholder:text-gray-300 bg-transparent border-0 border-b-2 border-gray-200 focus:border-orange-500 focus:outline-none pb-2 transition-colors"
        />
      </div>

      {/* Meta */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <Label>Servings</Label>
          <input
            type="number" min="1"
            value={servings}
            onChange={(e) => setServings(e.target.value)}
            placeholder="4"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>
        <div>
          <Label>Time (min)</Label>
          <input
            type="number" min="1"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            placeholder="30"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>
        <div>
          <Label>Difficulty</Label>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white text-gray-800"
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
                ? "bg-amber-50 border-amber-300 text-amber-700 font-medium"
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
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
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
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
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>
        <div>
          <Label>Notes</Label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes…"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>
      </div>

      {/* ── Ingredients ──────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900">Ingredients</h2>
          <button
            type="button"
            onClick={() => setIngredients((rows) => [...rows, { id: uid(), quantity: "", unit: "g", groceryItemName: "", notes: "", groupOrder: 1 }])}
            className="flex items-center gap-1 text-sm font-medium text-orange-600 hover:text-orange-700"
          >
            <Plus size={14} /> Add
          </button>
        </div>

        {/* Column headers */}
        <div className="hidden sm:grid grid-cols-[52px_64px_76px_1fr_88px_28px] gap-2 mb-1 px-0.5">
          {["Group", "Qty", "Unit", "Ingredient", "Notes", ""].map((h) => (
            <span key={h} className="text-xs text-gray-500 font-medium">{h}</span>
          ))}
        </div>

        <div className="space-y-2">
          {ingredients.map((ing) => (
            <div key={ing.id} className="grid grid-cols-[52px_64px_76px_1fr_88px_28px] gap-2 items-center">
              <select
                value={ing.groupOrder}
                onChange={(e) => updateIngredient(ing.id, { groupOrder: parseInt(e.target.value) })}
                className="px-1.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white text-gray-700"
                title="Group"
              >
                {[1, 2, 3, 4].map((g) => <option key={g} value={g}>G{g}</option>)}
              </select>

              <input
                type="number" min="0" step="0.1"
                value={ing.quantity}
                onChange={(e) => updateIngredient(ing.id, { quantity: e.target.value })}
                placeholder="Qty"
                className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
              />

              <select
                value={ing.unit}
                onChange={(e) => updateIngredient(ing.id, { unit: e.target.value })}
                className="px-1.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white text-gray-800"
              >
                <option value="">—</option>
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>

              <GroceryItemInput
                value={ing.groceryItemName}
                onChange={(name) => updateIngredient(ing.id, { groceryItemName: name })}
              />

              <input
                value={ing.notes}
                onChange={(e) => updateIngredient(ing.id, { notes: e.target.value })}
                placeholder="Notes"
                className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 text-gray-700"
              />

              <button
                type="button"
                onClick={() => setIngredients((rows) => rows.filter((r) => r.id !== ing.id))}
                className="flex items-center justify-center p-1 text-gray-300 hover:text-red-500 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Instructions ─────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900">Instructions</h2>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setInstructions((rows) => [...rows, { id: uid(), text: "", isSection: true }])}
              className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800"
            >
              <Plus size={14} /> Section
            </button>
            <button
              type="button"
              onClick={() => setInstructions((rows) => [...rows, { id: uid(), text: "", isSection: false }])}
              className="flex items-center gap-1 text-sm font-medium text-orange-600 hover:text-orange-700"
            >
              <Plus size={14} /> Step
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {instructions.map((inst, idx) => (
            <div key={inst.id} className="flex gap-2 items-start">
              <div
                className={`flex-shrink-0 mt-1.5 ${
                  inst.isSection
                    ? "text-xs font-bold text-gray-500 uppercase tracking-wide w-6 text-center pt-1"
                    : "w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center"
                }`}
              >
                {inst.isSection ? "§" : idx + 1}
              </div>

              <textarea
                value={inst.text}
                onChange={(e) => updateInstruction(inst.id, { text: e.target.value })}
                placeholder={inst.isSection ? "Section name…" : "Describe this step…"}
                rows={inst.isSection ? 1 : 2}
                className={`flex-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none ${
                  inst.isSection ? "font-semibold text-gray-700" : "text-gray-800"
                }`}
              />

              <div className="flex flex-col gap-0.5 shrink-0 mt-1">
                <button
                  type="button"
                  onClick={() => moveInstruction(inst.id, -1)}
                  disabled={idx === 0}
                  className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-30 transition-colors"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => moveInstruction(inst.id, 1)}
                  disabled={idx === instructions.length - 1}
                  className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-30 transition-colors"
                >
                  <ChevronDown size={14} />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setInstructions((rows) => rows.filter((r) => r.id !== inst.id))}
                className="shrink-0 p-1 mt-1.5 text-gray-300 hover:text-red-500 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 px-4 py-3 rounded-lg">
          {error}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
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
          className="px-4 py-2.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          Cancel
        </button>
        {initial?.id && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="ml-auto flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
          >
            {deleting && <Loader2 size={13} className="animate-spin" />}
            Delete recipe
          </button>
        )}
      </div>
    </form>
  );
}
