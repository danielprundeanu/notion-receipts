"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Camera, ChevronDown, ChevronRight, ChevronUp, ImagePlus, Link2, Loader2, Minus, Plus, Trash2 } from "lucide-react";
import { createRecipe, updateRecipe, deleteRecipe, checkRecipeReferences, type RecipeFormInput } from "@/lib/actions";
import { stepServings, stepServingsDown } from "@/lib/servings";
import { categoryLabel, difficultyLabel } from "@/lib/labels";
import { emptySection, parseStepText, sectionsToInstructions, type StepSection } from "@/lib/steps";
import { kitchenFraction } from "@/lib/quantities";
import ServingsInput from "@/components/ServingsInput";
import IngredientRows from "@/components/recipe-form/IngredientRows";
import IngredientSheet from "@/components/recipe-form/IngredientSheet";
import RecipeRefSheet from "@/components/recipe-form/RecipeRefSheet";
import StepsEditor, { type StepsMode } from "@/components/recipe-form/StepsEditor";
import {
  Segmented, Sheet, Switch, cardCls, fieldCls, hintCls, labelCls, sectionCls, uid,
  type IngredientGroup, type IngredientRow, type RecipeRefRow,
} from "@/components/recipe-form/ui";

export type { IngredientGroup, IngredientRow, RecipeRefRow };

const CATEGORIES = [
  "Breakfast", "Lunch", "Dinner", "Snack",
  "Smoothie", "Smoothie Bowl", "Soup", "High Protein", "Receipt", "Extra",
];
const DIFFICULTIES = ["Easy", "Moderate", "Hard"];

export type InitialRecipeData = {
  id: string;
  name: string;
  categories: string[];
  servings: string;
  servingsStep?: string;
  time: string;
  difficulty: string;
  favorite: boolean;
  link: string;
  imageUrl: string;
  groups: IngredientGroup[];
  references?: RecipeRefRow[];
  sections: StepSection[];
};

type FormState = {
  name: string;
  categories: string[];
  servings: string;
  servingsStep: string;
  time: string;
  difficulty: string;
  favorite: boolean;
  link: string;
  imageUrl: string;
  groups: IngredientGroup[];
  refs: RecipeRefRow[];
  sections: StepSection[];
};

// The −/+ step as typed ("0.5", "0,25"); empty or invalid counts as 1.
function parseStep(s: string): number {
  const n = parseFloat(s.replace(",", "."));
  return isFinite(n) && n > 0 ? n : 1;
}

function initForm(initial?: InitialRecipeData): FormState {
  return {
    name: initial?.name ?? "",
    categories: initial?.categories ?? [],
    servings: initial?.servings ?? "",
    servingsStep: initial?.servingsStep ?? "",
    time: initial?.time ?? "",
    difficulty: initial?.difficulty ?? "",
    favorite: initial?.favorite ?? false,
    link: initial?.link ?? "",
    imageUrl: initial?.imageUrl ?? "",
    groups: initial?.groups?.length ? initial.groups : [{ id: uid(), name: "", ingredients: [] }],
    refs: initial?.references ?? [],
    sections: initial?.sections?.length ? initial.sections : [emptySection()],
  };
}

// What createRecipe / updateRecipe receive. Also compared against the starting point to
// know whether there's anything unsaved. The search alias (nameRo) isn't edited here: the
// server keeps the stored one and translates again when the title changes.
function buildPayload(f: FormState, sections: { title: string; steps: { text: string }[] }[]): RecipeFormInput {
  const ingredients = f.groups.flatMap((group, groupIdx) =>
    group.ingredients
      .filter((i) => i.groceryItemName.trim())
      .map((ing, order) => ({
        groceryItemName: ing.groceryItemName.trim(),
        quantity: ing.quantity.trim() ? parseFloat(ing.quantity) : null,
        unit: ing.unit || null,
        notes: ing.notes.trim() || null,
        groupOrder: groupIdx + 1,
        groupName: group.name.trim() || null,
        order,
      }))
  );
  // Referenced recipes come after the ingredient groups.
  const references = f.refs
    .filter((r) => r.refRecipeId)
    .map((r, i) => ({
      refRecipeId: r.refRecipeId!,
      quantity: parseFloat(r.quantity.replace(",", ".")),
      unit: r.unit,
      groupOrder: f.groups.length + 1 + i,
    }));
  return {
    name: f.name.trim(),
    nameRo: null,
    categories: f.categories,
    servings: f.servings ? parseInt(f.servings) : null,
    servingsStep: parseStep(f.servingsStep) !== 1 ? parseStep(f.servingsStep) : null,
    time: f.time ? parseInt(f.time) : null,
    difficulty: f.difficulty || null,
    favorite: f.favorite,
    link: f.link.trim() || null,
    imageUrl: f.imageUrl || null,
    ingredients,
    references,
    instructions: sectionsToInstructions(sections),
  };
}

function hostOf(url: string): string {
  const m = url.trim().match(/^https?:\/\/([^/?#]+)/i);
  return m ? m[1].replace(/^www\./, "") : "";
}

// 6-decimal precision so fine fractional quantities (e.g. 0.0625) survive rescaling.
function fmtQty(n: number): string {
  return Number(n.toFixed(6)).toString();
}

type SheetState =
  | { kind: "ingredient"; groupId: string; row: IngredientRow | null }
  | { kind: "ref"; row: RecipeRefRow | null }
  | { kind: "discard" }
  | null;

export default function RecipeForm({ initial }: { initial?: InitialRecipeData }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => initForm(initial));
  const [baseline] = useState(() => {
    const f = initForm(initial);
    return JSON.stringify(buildPayload(f, f.sections));
  });
  const [stepsMode, setStepsMode] = useState<StepsMode>("steps");
  const [stepsText, setStepsText] = useState("");
  const [sheet, setSheet] = useState<SheetState>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [addingTag, setAddingTag] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Batch / per-serving
  const [mode, setMode] = useState<"batch" | "single">(() => (parseInt(initial?.servings ?? "") > 1 ? "batch" : "single"));
  const [scaleQty, setScaleQty] = useState(true);
  const [lastBatch, setLastBatch] = useState<number>(() => {
    const n = parseInt(initial?.servings ?? "");
    return n > 1 ? n : 2;
  });

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));
  const setGroups = (fn: (gs: IngredientGroup[]) => IngredientGroup[]) => setForm((f) => ({ ...f, groups: fn(f.groups) }));

  const currentSections = stepsMode === "text" ? parseStepText(stepsText).map((s) => ({ title: s.title, steps: s.steps.map((text) => ({ text })) })) : form.sections;
  const payload = buildPayload(form, currentSections);
  const dirty = JSON.stringify(payload) !== baseline;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // ── Categories ──
  function toggleCategory(cat: string) {
    set({ categories: form.categories.includes(cat) ? form.categories.filter((c) => c !== cat) : [...form.categories, cat] });
  }
  // Commas are stripped — they're the delimiter categories are stored with, so a tag can't contain one.
  function addNewTag() {
    const t = newTag.replace(/,/g, "").trim();
    setNewTag("");
    if (!t) return;
    const exists = [...CATEGORIES, ...form.categories].some((c) => c.toLowerCase() === t.toLowerCase());
    if (!exists) set({ categories: [...form.categories, t] });
  }

  // ── Servings (batch ↔ per serving) ──
  const curServings = parseInt(form.servings) || 1;
  // A batch is a whole number of servings, so a fractional step (0.5) only moves the servings
  // steppers on the recipe page and in the plan; here it counts in ones.
  const stepN = parseStep(form.servingsStep) >= 1 ? Math.round(parseStep(form.servingsStep)) : 1;

  // Set servings to newN, rescaling every amount from oldN when scaling is on.
  function applyServings(newN: number, oldN: number) {
    newN = Math.max(1, Math.round(newN || 1));
    const factor = newN / oldN;
    setForm((f) => ({
      ...f,
      servings: String(newN),
      groups:
        scaleQty && newN !== oldN && isFinite(factor) && factor > 0
          ? f.groups.map((g) => ({
              ...g,
              ingredients: g.ingredients.map((ing) => {
                const q = parseFloat(ing.quantity);
                return ing.quantity.trim() === "" || isNaN(q) ? ing : { ...ing, quantity: fmtQty(q * factor) };
              }),
            }))
          : f.groups,
    }));
    if (newN > 1) setLastBatch(newN);
  }

  function pickMode(m: "batch" | "single") {
    if (m === mode) return;
    setMode(m);
    applyServings(m === "batch" ? (curServings > 1 ? curServings : lastBatch) : 1, curServings);
  }

  // ── Cover photo ──
  async function handleImageFile(file: File) {
    setError(null);
    if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(file.type)) {
      setError("Accepted formats: JPG, PNG or WebP.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Image is too large (max 10MB).");
      return;
    }
    setImageUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/upload-recipe-image", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.path) set({ imageUrl: data.path });
      else setError(data.error ?? `Upload failed (${res.status}).`);
    } catch {
      setError("Couldn't upload the photo. Check the connection and try again.");
    } finally {
      setImageUploading(false);
    }
  }

  const imageDragProps = {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragActive(true); },
    onDragEnter: (e: React.DragEvent) => { e.preventDefault(); setDragActive(true); },
    onDragLeave: (e: React.DragEvent) => { e.preventDefault(); setDragActive(false); },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const f = e.dataTransfer.files?.[0];
      if (f) handleImageFile(f);
    },
  };

  // ── Ingredient groups ──
  function moveGroup(idx: number, dir: -1 | 1) {
    setGroups((gs) => {
      const next = idx + dir;
      if (next < 0 || next >= gs.length) return gs;
      const arr = [...gs];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });
  }

  function removeGroup(group: IngredientGroup) {
    const n = group.ingredients.length;
    if (n > 0 && !window.confirm(`Remove ${group.name.trim() ? `“${group.name.trim()}”` : "this group"} and its ${n} ${n === 1 ? "ingredient" : "ingredients"}?`)) return;
    setGroups((gs) => gs.filter((g) => g.id !== group.id));
  }

  function moveIngredient(groupId: string, from: number, to: number) {
    setGroups((gs) =>
      gs.map((g) => {
        if (g.id !== groupId) return g;
        const arr = [...g.ingredients];
        const [row] = arr.splice(from, 1);
        arr.splice(to, 0, row);
        return { ...g, ingredients: arr };
      })
    );
  }

  // Saving a row from the sheet; it may also have moved to another group.
  function saveIngredient(row: IngredientRow, groupId: string) {
    setGroups((gs) => {
      const existing = gs.find((g) => g.ingredients.some((i) => i.id === row.id));
      if (existing && existing.id === groupId) {
        return gs.map((g) => (g.id === groupId ? { ...g, ingredients: g.ingredients.map((i) => (i.id === row.id ? row : i)) } : g));
      }
      return gs.map((g) => {
        const without = g.ingredients.filter((i) => i.id !== row.id);
        return g.id === groupId ? { ...g, ingredients: [...without, row] } : { ...g, ingredients: without };
      });
    });
    setSheet(null);
  }

  function removeIngredient(rowId: string) {
    setGroups((gs) => gs.map((g) => ({ ...g, ingredients: g.ingredients.filter((i) => i.id !== rowId) })));
    setSheet(null);
  }

  // ── Save / delete / leave ──
  async function handleSave() {
    if (!payload.name) {
      setError("Give the recipe a name.");
      nameRef.current?.focus();
      return;
    }
    const badRef = form.refs.find((r) => r.refRecipeId && !(parseFloat(r.quantity.replace(",", ".")) > 0));
    if (badRef) {
      setError(`Set how much of “${badRef.name}” goes in.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const refProblem = await checkRecipeReferences(initial?.id ?? null, (payload.references ?? []).map((r) => r.refRecipeId));
      if (refProblem) {
        setError(refProblem);
        setSaving(false);
        return;
      }
      if (initial?.id) {
        await updateRecipe(initial.id, payload);
        router.push(`/recipes/${initial.id}`);
        router.refresh();
      } else {
        const id = await createRecipe(payload);
        router.push(`/recipes/${id}`);
      }
      // `saving` stays on until the page changes, so Save can't be pressed twice.
    } catch {
      // Server-action messages are masked in production; the reference check above already
      // turned the one error worth explaining into a message.
      setError("Couldn't save the recipe. Check the connection and try again.");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initial?.id) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await deleteRecipe(initial.id);
      if (res.error) {
        setDeleteError(res.error);
        setDeleting(false);
        return;
      }
      router.push("/recipes");
      router.refresh();
    } catch {
      setDeleteError("Couldn't delete the recipe. Please try again.");
      setDeleting(false);
    }
  }

  function leave() {
    if (window.history.length > 1) router.back();
    else router.push(initial?.id ? `/recipes/${initial.id}` : "/recipes");
  }

  const ingCount = form.groups.reduce((n, g) => n + g.ingredients.length, 0) + form.refs.length;
  const multiGroup = form.groups.length > 1;
  const linkHost = hostOf(form.link);
  const difficulties = [...DIFFICULTIES, ...(form.difficulty && !DIFFICULTIES.includes(form.difficulty) ? [form.difficulty] : [])];
  const allCategories = [...CATEGORIES, ...form.categories.filter((c) => !CATEGORIES.includes(c))];
  const chip = "h-10 px-3.5 rounded-full border text-sm font-medium transition-colors";
  const stepBtn = "w-11 h-11 rounded-xl bg-gray-100 dark:bg-[#2e2a24] text-gray-800 dark:text-[#eae5de] flex items-center justify-center disabled:opacity-40";
  const ghostRow = "w-full h-12 flex items-center gap-2 px-3.5 border-t border-gray-200 dark:border-[#3a352e] text-[15px] font-semibold text-orange-700 dark:text-orange-400";
  const secondaryChip = "flex-1 h-10 rounded-full border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-sm font-semibold text-gray-900 dark:text-[#eae5de]";
  const refAmount = (r: RecipeRefRow) => {
    const q = parseFloat(r.quantity.replace(",", "."));
    if (r.unit === "g") return `${r.quantity} g`;
    return `${kitchenFraction(q)} ${q > 1 ? "servings" : "serving"}`;
  };

  return (
    <>
      <form
        onSubmit={(e) => { e.preventDefault(); handleSave(); }}
        noValidate
        className="min-h-full bg-[var(--color-bg-base)]"
      >
        {/* ── Top bar ── */}
        <div className="sticky top-0 z-30 bg-[var(--color-bg-base)] border-b border-gray-200 dark:border-[#3a352e]">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-2 pl-1 pr-2 md:px-4 py-2.5">
            <button
              type="button"
              onClick={() => (dirty ? setSheet({ kind: "discard" }) : leave())}
              className="h-11 px-3 text-base text-gray-600 dark:text-[#a49c90]"
            >
              Cancel
            </button>
            <h1 className="[font-family:inherit]! text-[17px] font-bold text-gray-900 dark:text-[#eae5de]">
              {initial ? "Edit recipe" : "New recipe"}
            </h1>
            <button
              type="submit"
              disabled={saving || imageUploading}
              className="h-10 px-[18px] rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[15px] font-bold flex items-center gap-1.5 disabled:opacity-60 transition-colors"
            >
              {saving && <Loader2 size={15} className="animate-spin" aria-hidden />}
              {imageUploading ? "Uploading…" : "Save"}
            </button>
          </div>
          {error && (
            <p role="alert" className="max-w-2xl mx-auto px-4 pb-2.5 text-sm text-red-700 dark:text-red-300">
              {error}
            </p>
          )}
        </div>

        <div className="max-w-2xl mx-auto px-4 md:px-6 pb-8">
          {/* ── Cover photo ── */}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImageFile(file);
              e.target.value = "";
            }}
          />
          {form.imageUrl ? (
            <div {...imageDragProps} className={`relative mt-4 rounded-2xl overflow-hidden bg-gray-100 dark:bg-[#24211c] ${dragActive ? "ring-2 ring-orange-400" : ""}`}>
              {/* Plain <img>: imported recipes keep the source site's image URL (see UX_CONVENTIONS) */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={form.imageUrl} alt="Current cover photo" className="w-full h-[170px] md:h-56 object-cover block" />
              {(imageUploading || dragActive) && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white text-sm font-semibold">
                  {imageUploading ? <Loader2 size={22} className="animate-spin" aria-label="Uploading" /> : "Drop to replace"}
                </div>
              )}
              <div className="absolute left-2.5 bottom-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={imageUploading}
                  className="h-10 px-3.5 rounded-xl bg-black/60 text-white text-sm font-semibold flex items-center gap-2"
                >
                  <Camera size={16} aria-hidden /> Change photo
                </button>
                <button
                  type="button"
                  onClick={() => set({ imageUrl: "" })}
                  disabled={imageUploading}
                  aria-label="Remove photo"
                  className="w-10 h-10 rounded-xl bg-black/60 text-white flex items-center justify-center"
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={imageUploading}
              {...imageDragProps}
              className={`mt-4 w-full h-[120px] rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-1.5 transition-colors ${
                dragActive ? "border-orange-400 bg-orange-50 dark:bg-orange-500/10" : "border-gray-200 dark:border-[#3a352e]"
              }`}
            >
              {imageUploading ? (
                <Loader2 size={22} className="animate-spin text-gray-500" aria-label="Uploading" />
              ) : (
                <>
                  <ImagePlus size={22} className="text-gray-500 dark:text-[#a49c90]" aria-hidden />
                  <span className="text-[15px] font-semibold text-gray-700 dark:text-[#d8d0c4]">{dragActive ? "Drop to upload" : "Add a photo"}</span>
                </>
              )}
            </button>
          )}

          {/* ── Basics ── */}
          <label className={labelCls} htmlFor="recipe-name">Name</label>
          <input
            id="recipe-name"
            ref={nameRef}
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="What's it called?"
            autoComplete="off"
            className={fieldCls}
          />

          <label className={labelCls} htmlFor="recipe-link">Source link</label>
          <div className="relative">
            <Link2 size={18} className="absolute left-3.5 top-[15px] text-gray-500 dark:text-[#a49c90]" aria-hidden />
            <input
              id="recipe-link"
              type="url"
              inputMode="url"
              value={form.link}
              onChange={(e) => set({ link: e.target.value })}
              placeholder="Paste the page you got it from"
              autoComplete="off"
              className={`${fieldCls} pl-[42px]`}
            />
          </div>
          <p className={`mt-1.5 ${hintCls}`}>{linkHost ? `Shown on the recipe as ${linkHost}` : "Optional. The recipe page links back to it."}</p>

          <span className={labelCls}>Categories</span>
          <div className="flex flex-wrap gap-2">
            {allCategories.map((cat) => {
              const on = form.categories.includes(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  aria-pressed={on}
                  className={`${chip} ${
                    on ? "bg-orange-500 border-orange-500 text-gray-900" : "bg-white dark:bg-[#24211c] border-gray-200 dark:border-[#3a352e] text-gray-600 dark:text-[#a49c90]"
                  }`}
                >
                  {categoryLabel(cat)}
                </button>
              );
            })}
            {addingTag ? (
              <input
                autoFocus
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); addNewTag(); }
                  else if (e.key === "Escape") { setNewTag(""); setAddingTag(false); }
                }}
                onBlur={() => { addNewTag(); setAddingTag(false); }}
                placeholder="New category"
                aria-label="New category"
                maxLength={30}
                className="w-36 h-10 px-3.5 rounded-full border border-orange-500 bg-white dark:bg-[#24211c] text-sm text-gray-900 dark:text-[#eae5de] focus:outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => setAddingTag(true)}
                className={`${chip} border-dashed border-gray-300 dark:border-[#3a352e] text-orange-700 dark:text-orange-400`}
              >
                + New
              </button>
            )}
          </div>

          <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
            <div>
              <label className={labelCls} htmlFor="recipe-time">Time</label>
              <div className="relative">
                <input
                  id="recipe-time"
                  inputMode="numeric"
                  autoComplete="off"
                  value={form.time}
                  onChange={(e) => set({ time: e.target.value.replace(/\D/g, "") })}
                  placeholder="30"
                  className={`${fieldCls} pr-11`}
                />
                <span className="absolute right-3.5 top-3.5 text-[15px] text-gray-600 dark:text-[#a49c90]" aria-hidden>min</span>
              </div>
            </div>
            <div className="min-w-0">
              <span className={labelCls}>Difficulty</span>
              <Segmented
                label="Difficulty"
                options={difficulties.map((d) => ({ value: d, label: difficultyLabel(d) }))}
                value={form.difficulty}
                onChange={(v) => set({ difficulty: v })}
                allowNone
              />
            </div>
          </div>

          <div className="mt-3.5 min-h-12 flex items-center justify-between">
            <span className="text-[15px] font-semibold text-gray-900 dark:text-[#eae5de]">Favorite</span>
            <Switch on={form.favorite} onChange={(on) => set({ favorite: on })} label="Favorite" />
          </div>

          {/* ── Servings ── */}
          <h2 className={`${sectionCls} mt-6 mb-2`}>Servings</h2>
          <div className={`${cardCls} p-3`}>
            <Segmented
              label="Amounts are for"
              options={[{ value: "batch", label: "Batch" }, { value: "single", label: "1 serving" }]}
              value={mode}
              onChange={(v) => v && pickMode(v)}
              className="bg-[var(--color-bg-base)]! dark:bg-[var(--color-bg-base)]! border-transparent! dark:border-transparent!"
            />
            {mode === "batch" && (
              <>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-[15px] text-gray-900 dark:text-[#eae5de]">Makes</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="Fewer servings"
                      disabled={curServings <= 1}
                      onClick={() => applyServings(stepServingsDown(curServings, stepN), curServings)}
                      className={stepBtn}
                    >
                      <Minus size={18} />
                    </button>
                    <ServingsInput
                      value={curServings}
                      min={1}
                      onCommit={(v) => applyServings(v, curServings)}
                      ariaLabel="Servings the batch makes"
                      className="w-11 h-11 text-lg font-bold text-gray-900 dark:text-[#eae5de]"
                    />
                    <button
                      type="button"
                      aria-label="More servings"
                      onClick={() => applyServings(stepServings(curServings, 1, stepN), curServings)}
                      className={stepBtn}
                    >
                      <Plus size={18} />
                    </button>
                    <span className="ml-1 text-[15px] text-gray-600 dark:text-[#a49c90]">servings</span>
                  </div>
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-600 dark:text-[#a49c90]">Scale the amounts when I change this</span>
                  <Switch on={scaleQty} onChange={setScaleQty} label="Scale the amounts when servings change" />
                </div>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <label htmlFor="servings-step" className="text-sm text-gray-600 dark:text-[#a49c90]">
                    − / + count in steps of
                  </label>
                  <input
                    id="servings-step"
                    inputMode="decimal"
                    autoComplete="off"
                    value={form.servingsStep}
                    onChange={(e) => set({ servingsStep: e.target.value.replace(/[^\d.,]/g, "") })}
                    placeholder="1"
                    className="w-14 h-11 rounded-xl border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-center text-base text-gray-900 dark:text-[#eae5de] placeholder:text-gray-500 dark:placeholder:text-[#8f877b] focus:outline-none focus:border-orange-500"
                  />
                </div>
              </>
            )}
            <p className={`mt-3 ${hintCls}`}>
              {mode === "batch"
                ? `The amounts below are for the whole batch of ${curServings} servings.`
                : "The amounts below are for one serving."}
            </p>
          </div>

          {/* ── Ingredients ── */}
          <div className="mt-6 flex items-baseline justify-between">
            <h2 className={sectionCls}>Ingredients · {ingCount}</h2>
            {ingCount > 0 && <span className={hintCls}>Tap to edit</span>}
          </div>
          {form.groups.map((group, gi) => (
            <div key={group.id} className={`${cardCls} mt-2 overflow-hidden`}>
              {multiGroup && (
                <div className="flex items-center gap-0.5 pl-3.5 pr-1 border-b border-gray-200 dark:border-[#3a352e] bg-gray-50 dark:bg-[#2a2620]">
                  <input
                    value={group.name}
                    onChange={(e) => setGroups((gs) => gs.map((g) => (g.id === group.id ? { ...g, name: e.target.value } : g)))}
                    aria-label={`Group ${gi + 1} name`}
                    placeholder={`Group ${gi + 1} name`}
                    className="flex-1 min-w-0 h-11 bg-transparent text-[15px] font-bold text-gray-900 dark:text-[#eae5de] placeholder:font-normal placeholder:text-gray-500 dark:placeholder:text-[#8f877b] focus:outline-none"
                  />
                  <button type="button" onClick={() => moveGroup(gi, -1)} disabled={gi === 0} aria-label="Move group up" className="w-10 h-10 flex items-center justify-center text-gray-500 dark:text-[#a49c90] disabled:opacity-30">
                    <ChevronUp size={18} />
                  </button>
                  <button type="button" onClick={() => moveGroup(gi, 1)} disabled={gi === form.groups.length - 1} aria-label="Move group down" className="w-10 h-10 flex items-center justify-center text-gray-500 dark:text-[#a49c90] disabled:opacity-30">
                    <ChevronDown size={18} />
                  </button>
                  <button type="button" onClick={() => removeGroup(group)} aria-label="Remove group" className="w-10 h-10 flex items-center justify-center text-gray-500 dark:text-[#a49c90]">
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
              <IngredientRows
                rows={group.ingredients}
                onOpen={(row) => setSheet({ kind: "ingredient", groupId: group.id, row })}
                onMove={(from, to) => moveIngredient(group.id, from, to)}
              />
              <button
                type="button"
                onClick={() => setSheet({ kind: "ingredient", groupId: group.id, row: null })}
                className={`${ghostRow} ${group.ingredients.length === 0 ? "border-t-0" : ""}`}
              >
                <Plus size={18} aria-hidden /> Add ingredient
              </button>
            </div>
          ))}

          {form.refs.length > 0 && (
            <div className={`${cardCls} mt-2 overflow-hidden`}>
              {form.refs.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSheet({ kind: "ref", row: r })}
                  aria-label={`Edit ${r.name}`}
                  className="w-full min-h-[54px] flex items-center gap-2.5 pl-3.5 pr-3 py-1.5 text-left border-t first:border-t-0 border-gray-200 dark:border-[#3a352e]"
                >
                  <BookOpen size={18} className="shrink-0 text-orange-600 dark:text-orange-400" aria-hidden />
                  <span className="flex-1 min-w-0 text-base leading-[1.35] text-gray-900 dark:text-[#eae5de]">
                    <b className="font-bold">{refAmount(r)}</b> {r.name}
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-gray-400 dark:text-[#8f877b]" aria-hidden />
                </button>
              ))}
            </div>
          )}

          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setGroups((gs) => [...gs, { id: uid(), name: "", ingredients: [] }])}
              className={secondaryChip}
            >
              + Group
            </button>
            <button type="button" onClick={() => setSheet({ kind: "ref", row: null })} className={secondaryChip}>
              + Another recipe
            </button>
          </div>

          {/* ── Steps ── */}
          <StepsEditor
            sections={form.sections}
            onSections={(sections) => set({ sections })}
            mode={stepsMode}
            onMode={setStepsMode}
            text={stepsText}
            onText={setStepsText}
          />

          {/* ── Delete ── */}
          {initial?.id && (
            <>
              <h2 className={`${sectionCls} mt-7 mb-2`}>Danger zone</h2>
              {confirmDelete ? (
                <div className="p-3.5 rounded-[14px] bg-red-50 dark:bg-red-500/10" role="alertdialog" aria-labelledby="delete-q">
                  <p id="delete-q" className="text-[15px] font-semibold text-gray-900 dark:text-[#eae5de]">Delete this recipe for both of you?</p>
                  <p className="mt-1 mb-3 text-sm text-gray-600 dark:text-[#a49c90]">
                    It also disappears from every week it was planned in. This can&apos;t be undone.
                  </p>
                  {deleteError && <p role="alert" className="mb-3 text-sm text-red-700 dark:text-red-300">{deleteError}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setConfirmDelete(false); setDeleteError(null); }}
                      disabled={deleting}
                      className="flex-1 h-12 rounded-xl border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-[15px] font-semibold text-gray-900 dark:text-[#eae5de]"
                    >
                      Keep it
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="flex-1 h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[15px] font-bold flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      {deleting && <Loader2 size={16} className="animate-spin" aria-hidden />}
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
                  Delete recipe
                </button>
              )}
            </>
          )}
        </div>
      </form>

      {/* Sheets sit outside the <form> so Enter in their fields doesn't save the recipe. */}
      {sheet?.kind === "ingredient" && (
        <IngredientSheet
          key={sheet.row?.id ?? "new"}
          row={sheet.row}
          groupId={sheet.groupId}
          groups={form.groups.map((g) => ({ id: g.id, name: g.name }))}
          onSave={saveIngredient}
          onRemove={sheet.row ? () => removeIngredient(sheet.row!.id) : undefined}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === "ref" && (
        <RecipeRefSheet
          row={sheet.row}
          excludeIds={[...(initial?.id ? [initial.id] : []), ...form.refs.filter((x) => x.refRecipeId && x.id !== sheet.row?.id).map((x) => x.refRecipeId!)]}
          onSave={(row) => {
            set({ refs: sheet.row ? form.refs.map((r) => (r.id === row.id ? row : r)) : [...form.refs, row] });
            setSheet(null);
          }}
          onRemove={sheet.row ? () => { set({ refs: form.refs.filter((r) => r.id !== sheet.row!.id) }); setSheet(null); } : undefined}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === "discard" && (
        <Sheet title="Discard your changes?" onClose={() => setSheet(null)}>
          <p className={`mt-1 ${hintCls}`}>What you changed here hasn&apos;t been saved.</p>
          <div className="mt-5 flex gap-2.5">
            <button
              type="button"
              onClick={() => setSheet(null)}
              className="flex-1 h-[52px] rounded-[14px] border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-[15px] font-bold text-gray-900 dark:text-[#eae5de]"
            >
              Keep editing
            </button>
            <button
              type="button"
              onClick={() => { setSheet(null); leave(); }}
              className="flex-1 h-[52px] rounded-[14px] bg-red-600 hover:bg-red-700 text-white text-[15px] font-bold"
            >
              Discard
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
