"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  Loader2,
  Star,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Clock,
  Users,
  Minus,
} from "lucide-react";
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

// ─── Live Preview Panel ───────────────────────────────────────────────────────

function RecipePreviewPanel({
  name,
  categories,
  servings,
  time,
  difficulty,
  favorite,
  notes,
  groups,
  instructionsText,
}: {
  name: string;
  categories: string[];
  servings: string;
  time: string;
  difficulty: string;
  favorite: boolean;
  notes: string;
  groups: IngredientGroup[];
  instructionsText: string;
}) {
  const defaultServings = servings ? parseInt(servings) || 1 : 1;
  const [currentServings, setCurrentServings] = useState(defaultServings);

  useEffect(() => {
    setCurrentServings(defaultServings);
  }, [defaultServings]);

  const scale = defaultServings > 0 ? currentServings / defaultServings : 1;

  // Parse instructions text
  const instructions: Array<{ step: number; text: string; isSection: boolean }> = [];
  let stepNum = 0;
  for (const line of instructionsText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("# ")) {
      instructions.push({ step: 0, text: trimmed.slice(2), isSection: true });
    } else {
      stepNum++;
      instructions.push({ step: stepNum, text: trimmed, isSection: false });
    }
  }

  const visibleGroups = groups
    .map((g) => ({ ...g, items: g.ingredients.filter((i) => i.groceryItemName.trim()) }))
    .filter((g) => g.items.length > 0);

  const multiGroup = visibleGroups.length > 1;

  return (
    <div className="p-6 md:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {name || <span className="text-gray-300">Untitled Recipe</span>}
        </h1>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {categories.map((cat) => (
            <span key={cat} className="px-2.5 py-0.5 bg-orange-100 text-orange-800 rounded-full text-xs font-medium">
              {cat}
            </span>
          ))}
          {difficulty && (
            <span className="px-2.5 py-0.5 bg-gray-100 text-gray-700 rounded-full text-xs font-medium">
              {difficulty}
            </span>
          )}
          {time && (
            <span className="flex items-center gap-1 text-xs text-gray-600 font-medium">
              <Clock size={11} className="text-gray-500" /> {time} min
            </span>
          )}
          {favorite && <Star size={14} className="text-amber-400 fill-amber-400" />}
        </div>
        {notes && (
          <p className="mt-3 text-sm text-gray-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5">
            {notes}
          </p>
        )}
      </div>

      {/* Servings control */}
      <div className="flex items-center gap-3 mb-6 pb-5 border-b border-gray-100">
        <Users size={13} className="text-gray-500" />
        <span className="text-xs font-medium text-gray-700">Servings</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentServings((s) => Math.max(1, s - 1))}
            className="w-6 h-6 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50 text-gray-700 transition-colors"
          >
            <Minus size={10} />
          </button>
          <span className="w-6 text-center text-xs font-bold text-gray-900">{currentServings}</span>
          <button
            type="button"
            onClick={() => setCurrentServings((s) => s + 1)}
            className="w-6 h-6 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50 text-gray-700 transition-colors"
          >
            <Plus size={10} />
          </button>
        </div>
        {currentServings !== defaultServings && (
          <button
            type="button"
            onClick={() => setCurrentServings(defaultServings)}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            reset
          </button>
        )}
        {scale !== 1 && (
          <span className="text-xs text-orange-600 font-medium bg-orange-50 px-2 py-0.5 rounded-full">
            ×{Math.round(scale * 100) / 100} scaled
          </span>
        )}
      </div>

      {/* Body */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-8">
        {/* Ingredients */}
        <div className="xl:col-span-2">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Ingredients</h2>
          {visibleGroups.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No ingredients yet</p>
          ) : (
            <div className="space-y-4">
              {visibleGroups.map((group, gi) => (
                <div key={group.id}>
                  {(multiGroup || (group.name && group.name !== "Ingredients")) && (
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                      {group.name || `Part ${gi + 1}`}
                    </p>
                  )}
                  <ul className="space-y-1.5">
                    {group.items.map((ing) => {
                      const rawQty = parseFloat(ing.quantity);
                      const scaledQty = !isNaN(rawQty) ? Math.round(rawQty * scale * 10) / 10 : null;
                      return (
                        <li key={ing.id} className="flex items-baseline gap-1.5 text-sm">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0 mt-[5px]" />
                          <span>
                            {scaledQty != null && (
                              <span className="font-semibold text-gray-900">
                                {scaledQty % 1 === 0 ? scaledQty : scaledQty}
                                {ing.unit ? ` ${ing.unit}` : ""}
                              </span>
                            )}{" "}
                            <span className="text-gray-800">{ing.groceryItemName}</span>
                            {ing.notes && (
                              <span className="text-gray-500"> · {ing.notes}</span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="xl:col-span-3">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Instructions</h2>
          {instructions.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No instructions yet</p>
          ) : (
            <div className="space-y-3">
              {instructions.map((inst, i) =>
                inst.isSection ? (
                  <h3 key={i} className="text-xs font-bold uppercase tracking-wide text-gray-600 pt-1">
                    {inst.text}
                  </h3>
                ) : (
                  <div key={i} className="flex gap-2.5">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                      {inst.step}
                    </span>
                    <p className="text-sm text-gray-800 leading-relaxed">{inst.text}</p>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Form ────────────────────────────────────────────────────────────────

export default function RecipeForm({ initial }: { initial?: InitialRecipeData }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

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

  const formContent = (
    <>
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
            onClick={addGroup}
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg px-2.5 py-1 hover:bg-gray-50 transition-colors"
          >
            <Plus size={13} /> Add group
          </button>
        </div>

        <div className="space-y-4">
          {groups.map((group, groupIdx) => (
            <div key={group.id} className="border border-gray-200 rounded-xl overflow-hidden">
              {/* Group header */}
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
                <input
                  value={group.name}
                  onChange={(e) => updateGroupName(group.id, e.target.value)}
                  placeholder="Group name"
                  className="flex-1 text-xs font-semibold text-gray-700 bg-transparent border-0 focus:outline-none focus:ring-0 uppercase tracking-wide placeholder:normal-case placeholder:font-normal placeholder:tracking-normal"
                />
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => moveGroup(group.id, -1)}
                    disabled={groupIdx === 0}
                    className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-30 transition-colors"
                    title="Move up"
                  >
                    <ChevronUp size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveGroup(group.id, 1)}
                    disabled={groupIdx === groups.length - 1}
                    className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-30 transition-colors"
                    title="Move down"
                  >
                    <ChevronDown size={13} />
                  </button>
                  {groups.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeGroup(group.id)}
                      className="p-0.5 text-gray-300 hover:text-red-500 transition-colors ml-1"
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
                          className="w-16 px-2 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
                        />
                        <select
                          value={ing.unit}
                          onChange={(e) => updateIngredient(group.id, ing.id, { unit: e.target.value })}
                          className="w-20 px-1.5 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white text-gray-800"
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
                          className="flex items-center justify-center p-1.5 text-gray-300 hover:text-red-500 transition-colors shrink-0"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <input
                        value={ing.notes}
                        onChange={(e) => updateIngredient(group.id, ing.id, { notes: e.target.value })}
                        placeholder="Notes (optional)"
                        className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 text-gray-700"
                      />
                    </div>

                    {/* Desktop layout */}
                    <div className="hidden sm:grid grid-cols-[64px_76px_1fr_88px_28px] gap-2 items-center">
                      <input
                        type="number" min="0" step="0.1"
                        value={ing.quantity}
                        onChange={(e) => updateIngredient(group.id, ing.id, { quantity: e.target.value })}
                        placeholder="Qty"
                        className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
                      />
                      <select
                        value={ing.unit}
                        onChange={(e) => updateIngredient(group.id, ing.id, { unit: e.target.value })}
                        className="px-1.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white text-gray-800"
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
                        className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 text-gray-700"
                      />
                      <button
                        type="button"
                        onClick={() => removeIngredient(group.id, ing.id)}
                        className="flex items-center justify-center p-1 text-gray-300 hover:text-red-500 transition-colors"
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
          <h2 className="text-base font-semibold text-gray-900">Instructions</h2>
          <span className="text-xs text-gray-400">Lines starting with <code className="bg-gray-100 px-1 rounded"># </code> become section headers</span>
        </div>
        <textarea
          value={instructionsText}
          onChange={(e) => setInstructionsText(e.target.value)}
          placeholder={"# Prep\nChop the onions and garlic.\nHeat oil in a pan.\n\n# Cook\nAdd onions and cook until soft."}
          rows={12}
          className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400 resize-y font-mono leading-relaxed text-gray-800 placeholder:font-sans placeholder:text-gray-400"
        />
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
    </>
  );

  return (
    <div className={showPreview ? "flex items-start" : ""}>
      {/* Form column */}
      <form
        onSubmit={handleSubmit}
        className={
          showPreview
            ? "w-1/2 shrink-0 px-4 md:px-6 py-6 space-y-7 border-r border-gray-200 sticky top-0 max-h-screen overflow-y-auto"
            : "max-w-3xl mx-auto px-4 md:px-8 py-6 space-y-7"
        }
      >
        {/* Preview toggle */}
        <div className="flex justify-end -mb-3">
          <button
            type="button"
            onClick={() => setShowPreview((p) => !p)}
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
              showPreview
                ? "bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100"
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {showPreview ? <EyeOff size={12} /> : <Eye size={12} />}
            {showPreview ? "Hide preview" : "Preview"}
          </button>
        </div>

        {formContent}
      </form>

      {/* Preview column */}
      {showPreview && (
        <div className="w-1/2 sticky top-0 max-h-screen overflow-y-auto bg-gray-50 border-l border-gray-200">
          <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-2 flex items-center gap-2">
            <Eye size={12} className="text-gray-400" />
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Live Preview</p>
          </div>
          <RecipePreviewPanel
            name={name}
            categories={categories}
            servings={servings}
            time={time}
            difficulty={difficulty}
            favorite={favorite}
            notes={notes}
            groups={groups}
            instructionsText={instructionsText}
          />
        </div>
      )}
    </div>
  );
}
