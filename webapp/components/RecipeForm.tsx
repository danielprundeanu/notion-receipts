"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2, Star, ChevronDown, ChevronUp } from "lucide-react";
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
  groups: IngredientGroup[];
  instructionsText: string;
};

function uid() {
  return Math.random().toString(36).slice(2);
}

function emptyIngredient(): IngredientRow {
  return { id: uid(), quantity: "", unit: "g", groceryItemName: "", notes: "" };
}

function defaultGroup(name = "Ingredients"): IngredientGroup {
  return { id: uid(), name, ingredients: [emptyIngredient()] };
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
        className="w-full px-2.5 py-1.5 text-sm bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#3a3a3a] text-gray-900 dark:text-[#e3e3e3] placeholder:text-gray-400 dark:placeholder:text-[#555555] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
      />
      {open && results.length > 0 && (
        <div className="absolute z-30 top-full mt-0.5 left-0 right-0 bg-white dark:bg-[#2a2a2a] border border-gray-200 dark:border-[#3a3a3a] rounded-lg shadow-lg overflow-hidden">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(r.name); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-orange-50 dark:hover:bg-orange-950/30 flex items-center justify-between"
            >
              <span className="text-gray-800 dark:text-[#d4d4d4]">{r.name}</span>
              {r.unit && <span className="text-xs text-gray-500 dark:text-[#787878] ml-2">{r.unit}</span>}
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
    <label className="text-xs font-semibold text-gray-600 dark:text-[#9a9a9a] uppercase tracking-wide block mb-1.5">
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

  const [groups, setGroups] = useState<IngredientGroup[]>(
    initial?.groups?.length ? initial.groups : [defaultGroup()]
  );
  const [instructionsText, setInstructionsText] = useState(initial?.instructionsText ?? "");

  function toggleCategory(cat: string) {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
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

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Recipe name is required"); return; }
    setSaving(true);
    setError(null);

    // Flatten groups to ingredients list
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

    // Parse instructions textarea
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

      {/* Meta */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <Label>Servings</Label>
          <input
            type="number" min="1"
            value={servings}
            onChange={(e) => setServings(e.target.value)}
            placeholder="4"
            className="w-full px-3 py-2 text-sm bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#3a3a3a] text-gray-900 dark:text-[#e3e3e3] placeholder:text-gray-400 dark:placeholder:text-[#555555] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>
        <div>
          <Label>Time (min)</Label>
          <input
            type="number" min="1"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            placeholder="30"
            className="w-full px-3 py-2 text-sm bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#3a3a3a] text-gray-900 dark:text-[#e3e3e3] placeholder:text-gray-400 dark:placeholder:text-[#555555] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
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
            className="w-full px-3 py-2 text-sm bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#3a3a3a] text-gray-900 dark:text-[#e3e3e3] placeholder:text-gray-400 dark:placeholder:text-[#555555] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>
        <div>
          <Label>Notes</Label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes…"
            className="w-full px-3 py-2 text-sm bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#3a3a3a] text-gray-900 dark:text-[#e3e3e3] placeholder:text-gray-400 dark:placeholder:text-[#555555] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
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
                  <button
                    type="button"
                    onClick={() => moveGroup(group.id, -1)}
                    disabled={groupIdx === 0}
                    className="p-0.5 text-gray-300 dark:text-[#444444] hover:text-gray-600 dark:hover:text-[#9a9a9a] disabled:opacity-30 transition-colors"
                    title="Move up"
                  >
                    <ChevronUp size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveGroup(group.id, 1)}
                    disabled={groupIdx === groups.length - 1}
                    className="p-0.5 text-gray-300 dark:text-[#444444] hover:text-gray-600 dark:hover:text-[#9a9a9a] disabled:opacity-30 transition-colors"
                    title="Move down"
                  >
                    <ChevronDown size={13} />
                  </button>
                  {groups.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeGroup(group.id)}
                      className="p-0.5 text-gray-300 dark:text-[#444444] hover:text-red-500 transition-colors ml-1"
                      title="Remove group"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>

              {/* Ingredient rows */}
              <div className="p-3 space-y-2">
                {/* Column headers — desktop only */}
                <div className="hidden sm:grid grid-cols-[64px_76px_1fr_88px_28px] gap-2 mb-1 px-0.5">
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
                        <select
                          value={ing.unit}
                          onChange={(e) => updateIngredient(group.id, ing.id, { unit: e.target.value })}
                          className="w-20 px-1.5 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white dark:bg-[#252525] text-gray-800 dark:text-[#d4d4d4]"
                        >
                          <option value="">—</option>
                          {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                        <GroceryItemInput
                          value={ing.groceryItemName}
                          onChange={(name) => updateIngredient(group.id, ing.id, { groceryItemName: name })}
                        />
                        <button
                          type="button"
                          onClick={() => removeIngredient(group.id, ing.id)}
                          className="flex items-center justify-center p-1.5 text-gray-300 dark:text-[#444444] hover:text-red-500 transition-colors shrink-0"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <input
                        value={ing.notes}
                        onChange={(e) => updateIngredient(group.id, ing.id, { notes: e.target.value })}
                        placeholder="Notes (optional)"
                        className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 text-gray-700 dark:text-[#b8b8b8] bg-white dark:bg-[#252525] dark:border-[#3a3a3a]"
                      />
                    </div>

                    {/* Desktop layout */}
                    <div className="hidden sm:grid grid-cols-[64px_76px_1fr_88px_28px] gap-2 items-center">
                      <input
                        type="number" min="0" step="0.1"
                        value={ing.quantity}
                        onChange={(e) => updateIngredient(group.id, ing.id, { quantity: e.target.value })}
                        placeholder="Qty"
                        className="px-2 py-1.5 text-sm bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#3a3a3a] text-gray-900 dark:text-[#e3e3e3] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
                      />
                      <select
                        value={ing.unit}
                        onChange={(e) => updateIngredient(group.id, ing.id, { unit: e.target.value })}
                        className="px-1.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white dark:bg-[#252525] text-gray-800 dark:text-[#d4d4d4]"
                      >
                        <option value="">—</option>
                        {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                      <GroceryItemInput
                        value={ing.groceryItemName}
                        onChange={(name) => updateIngredient(group.id, ing.id, { groceryItemName: name })}
                      />
                      <input
                        value={ing.notes}
                        onChange={(e) => updateIngredient(group.id, ing.id, { notes: e.target.value })}
                        placeholder="Notes"
                        className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 text-gray-700 dark:text-[#b8b8b8] bg-white dark:bg-[#252525] dark:border-[#3a3a3a]"
                      />
                      <button
                        type="button"
                        onClick={() => removeIngredient(group.id, ing.id)}
                        className="flex items-center justify-center p-1 text-gray-300 dark:text-[#444444] hover:text-red-500 transition-colors"
                      >
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
    </form>
  );
}
