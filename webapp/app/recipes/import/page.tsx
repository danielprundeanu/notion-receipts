"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowRight, Upload, Link2, FileText,
  CheckCircle, AlertCircle, PlusCircle, Loader2,
  ChevronDown, ChevronUp, X, Check,
} from "lucide-react";
import type { ParsedRecipe, ReviewIngredient } from "@/app/api/import/parse/route";

// ─── Constants ────────────────────────────────────────────────────────────────

const UNITS = ["g", "kg", "ml", "l", "cup", "tbsp", "tsp", "oz", "lb", "piece", "handful", "pinch", "slice", "can", "bunch"];
const CATEGORIES = [
  "🍎 Fruits", "🥕 Vegetables", "🥩 Meat & Alt", "🐟 Fish & Seafood",
  "🥚 Dairy & Eggs", "🌾 Grains & Legumes", "🥜 Nuts & Seeds",
  "🫙 Oils & Fats", "🍯 Sweeteners", "🧂 Spices & Herbs",
  "🥫 Canned & Preserved", "🧊 Frozen", "🥤 Drinks", "🍞 Bakery", "Other",
];

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: number }) {
  const steps = ["Input", "Review", "Resolve", "Import"];
  return (
    <div className="flex items-center gap-2">
      {steps.map((label, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
            i + 1 < step
              ? "bg-orange-500 text-white"
              : i + 1 === step
              ? "bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-400 ring-2 ring-orange-400"
              : "bg-gray-100 dark:bg-[#2a2a2a] text-gray-400 dark:text-[#555]"
          }`}>
            {i + 1 < step ? <Check size={12} /> : i + 1}
          </div>
          <span className={`text-xs font-medium hidden sm:block ${
            i + 1 === step ? "text-gray-900 dark:text-[#e3e3e3]" : "text-gray-400 dark:text-[#555]"
          }`}>{label}</span>
          {i < steps.length - 1 && (
            <div className={`w-6 h-px ${i + 1 < step ? "bg-orange-400" : "bg-gray-200 dark:bg-[#2e2e2e]"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Ingredient badge ─────────────────────────────────────────────────────────

function MatchBadge({ status }: { status: ReviewIngredient["match"]["status"] }) {
  if (status === "matched") return (
    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 font-medium">
      <Check size={10} /> matched
    </span>
  );
  if (status === "similar") return (
    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-yellow-50 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-400 font-medium">
      <AlertCircle size={10} /> similar
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 font-medium">
      <PlusCircle size={10} /> new
    </span>
  );
}

// ─── Recipe review card ───────────────────────────────────────────────────────

function RecipeReviewCard({
  recipe,
  index,
  onRemove,
}: {
  recipe: ParsedRecipe & { error?: string };
  index: number;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if ((recipe as { error?: string }).error) {
    return (
      <div className="border border-red-200 dark:border-red-900 rounded-xl p-4 bg-red-50 dark:bg-red-950/20">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertCircle size={16} />
            <span className="font-medium text-sm">Eroare la parsare</span>
          </div>
          <button onClick={onRemove} className="text-gray-400 hover:text-red-500 transition-colors">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-red-600 dark:text-red-400 mt-1">{(recipe as { error?: string }).error}</p>
      </div>
    );
  }

  const matched = recipe.ingredients.filter((i) => i.match.status === "matched").length;
  const similar = recipe.ingredients.filter((i) => i.match.status === "similar").length;
  const isNew = recipe.ingredients.filter((i) => i.match.status === "new").length;
  const total = recipe.ingredients.length;

  return (
    <div className="border border-gray-200 dark:border-[#2e2e2e] rounded-xl overflow-hidden bg-white dark:bg-[#1f1f1f]">
      {/* Header */}
      <div className="px-4 py-3 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900 dark:text-[#e3e3e3] text-sm">{recipe.name}</h3>
            {recipe.category && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400">
                {recipe.category}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-[#787878]">
            {recipe.servings && <span>{recipe.servings} porții</span>}
            {recipe.time && <span>{recipe.time} min</span>}
            {recipe.difficulty && <span>{recipe.difficulty}</span>}
            {recipe.link && (
              <a href={recipe.link} target="_blank" rel="noopener noreferrer"
                className="text-orange-500 hover:underline flex items-center gap-0.5">
                <Link2 size={10} /> sursă
              </a>
            )}
          </div>
          {/* Ingredient stats */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-xs text-gray-400 dark:text-[#555]">{total} ingrediente:</span>
            {matched > 0 && (
              <span className="text-xs text-green-600 dark:text-green-400 font-medium">✓ {matched} matched</span>
            )}
            {similar > 0 && (
              <span className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">⚠ {similar} similar</span>
            )}
            {isNew > 0 && (
              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">+ {isNew} new</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onRemove}
            className="text-gray-300 dark:text-[#444] hover:text-red-500 transition-colors"
            title="Elimină rețeta"
          >
            <X size={16} />
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-[#9a9a9a] transition-colors"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Expanded ingredient list */}
      {expanded && (
        <div className="border-t border-gray-100 dark:border-[#2e2e2e] px-4 py-3 space-y-1">
          {recipe.ingredients.map((ing, i) => (
            <div key={i} className="flex items-center justify-between gap-2 py-0.5">
              <div className="flex items-center gap-2 min-w-0">
                <MatchBadge status={ing.match.status} />
                <span className="text-xs text-gray-700 dark:text-[#c0c0c0] truncate">
                  {ing.qty && `${ing.qty} `}{ing.unit && `${ing.unit} `}{ing.name}
                </span>
              </div>
              {ing.match.groceryItemName && ing.match.groceryItemName !== ing.name && (
                <span className="text-xs text-gray-400 dark:text-[#555] shrink-0">
                  → {ing.match.groceryItemName}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Conflict resolver for a single ingredient ────────────────────────────────

function ConflictRow({
  recipeIndex,
  ingIndex,
  ing,
  recipes,
  onUpdate,
}: {
  recipeIndex: number;
  ingIndex: number;
  ing: ReviewIngredient;
  recipes: ParsedRecipe[];
  onUpdate: (ri: number, ii: number, updated: ReviewIngredient) => void;
}) {
  const [mode, setMode] = useState<"map" | "new">(
    ing.match.status === "similar" ? "map" : "new"
  );
  const [newUnit, setNewUnit] = useState(ing.unit ?? "g");
  const [newCategory, setNewCategory] = useState("");
  const [selectedId, setSelectedId] = useState(ing.match.groceryItemId ?? "");

  const apply = () => {
    if (mode === "map" && selectedId) {
      const candidate = ing.match.candidates?.find((c) => c.id === selectedId);
      onUpdate(recipeIndex, ingIndex, {
        ...ing,
        match: {
          status: "matched",
          groceryItemId: selectedId,
          groceryItemName: candidate?.name ?? selectedId,
          groceryItemUnit: candidate?.unit ?? null,
        },
      });
    } else if (mode === "new") {
      onUpdate(recipeIndex, ingIndex, {
        ...ing,
        match: { ...ing.match, status: "new" },
        // @ts-expect-error – newItem is a runtime extension
        newItem: { name: ing.name, unit: newUnit, category: newCategory || null },
      });
    }
  };

  return (
    <div className="border border-gray-200 dark:border-[#2e2e2e] rounded-xl p-4 bg-white dark:bg-[#1f1f1f] space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-[#e3e3e3]">
            &ldquo;{ing.name}&rdquo;
          </p>
          <p className="text-xs text-gray-400 dark:text-[#555] mt-0.5">
            folosit în: {recipes[recipeIndex]?.name}
            {ing.qty ? ` · ${ing.qty}${ing.unit ? ` ${ing.unit}` : ""}` : ""}
          </p>
        </div>
        <MatchBadge status={ing.match.status} />
      </div>

      {/* Toggle map/new */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode("map")}
          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
            mode === "map"
              ? "bg-orange-500 text-white"
              : "bg-gray-100 dark:bg-[#2a2a2a] text-gray-600 dark:text-[#9a9a9a]"
          }`}
        >
          Mapează la existent
        </button>
        <button
          onClick={() => setMode("new")}
          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
            mode === "new"
              ? "bg-orange-500 text-white"
              : "bg-gray-100 dark:bg-[#2a2a2a] text-gray-600 dark:text-[#9a9a9a]"
          }`}
        >
          Creează nou
        </button>
      </div>

      {mode === "map" && (
        <div className="space-y-2">
          {ing.match.candidates && ing.match.candidates.length > 0 ? (
            <div className="space-y-1">
              {ing.match.candidates.map((c) => (
                <label key={c.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-[#2a2a2a] cursor-pointer">
                  <input
                    type="radio"
                    name={`map-${recipeIndex}-${ingIndex}`}
                    value={c.id}
                    checked={selectedId === c.id}
                    onChange={() => setSelectedId(c.id)}
                    className="text-orange-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-[#c0c0c0]">{c.name}</span>
                  {c.unit && <span className="text-xs text-gray-400 dark:text-[#555]">({c.unit})</span>}
                </label>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 dark:text-[#555]">Nu s-au găsit candidați. Alege &ldquo;Creează nou&rdquo;.</p>
          )}
        </div>
      )}

      {mode === "new" && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-gray-500 dark:text-[#787878] mb-1">Unitate</label>
            <select
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
              className="w-full text-sm border border-gray-200 dark:border-[#3a3a3a] rounded-lg px-2 py-1.5 bg-white dark:bg-[#2a2a2a] text-gray-900 dark:text-[#e3e3e3]"
            >
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-[#787878] mb-1">Categorie</label>
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="w-full text-sm border border-gray-200 dark:border-[#3a3a3a] rounded-lg px-2 py-1.5 bg-white dark:bg-[#2a2a2a] text-gray-900 dark:text-[#e3e3e3]"
            >
              <option value="">— selectează —</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      )}

      <button
        onClick={apply}
        disabled={mode === "map" && !selectedId}
        className="w-full text-sm font-medium py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {mode === "map" ? "Aplică mapare" : "Configurează ingredient nou"}
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  // Step: 1=input, 2=review, 3=resolve, 4=success
  const [step, setStep] = useState(1);
  const [inputMode, setInputMode] = useState<"urls" | "text">("urls");
  const [urlsText, setUrlsText] = useState("");
  const [textContent, setTextContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<ParsedRecipe[]>([]);
  const [importResult, setImportResult] = useState<{
    recipesCreated: number;
    newIngredientsCreated: number;
    recipeIds: string[];
  } | null>(null);

  // ── Step 1 → 2: Parse ──────────────────────────────────────────────────────

  async function handleParse() {
    setError(null);
    setLoading(true);
    try {
      const body =
        inputMode === "urls"
          ? { type: "urls", urls: urlsText.split("\n").map((u) => u.trim()).filter(Boolean) }
          : { type: "text", content: textContent };

      const res = await fetch("/api/import/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Eroare la parsare");

      setRecipes(data.recipes);
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare necunoscută");
    } finally {
      setLoading(false);
    }
  }

  // ── Handle file upload ─────────────────────────────────────────────────────

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setTextContent((ev.target?.result as string) ?? "");
      setInputMode("text");
    };
    reader.readAsText(file, "utf-8");
  }

  // ── Update ingredient resolution ───────────────────────────────────────────

  function updateIngredient(ri: number, ii: number, updated: ReviewIngredient) {
    setRecipes((prev) =>
      prev.map((r, rIdx) =>
        rIdx !== ri
          ? r
          : {
              ...r,
              ingredients: r.ingredients.map((ing, iIdx) =>
                iIdx === ii ? updated : ing
              ),
            }
      )
    );
  }

  // ── Step 3 → 4: Confirm import ─────────────────────────────────────────────

  async function handleImport() {
    setError(null);
    setLoading(true);
    try {
      // Build payload — resolve ingredient references
      const payload = recipes.filter((r) => !(r as { error?: string }).error).map((r) => ({
        ...r,
        ingredients: r.ingredients.map((ing) => {
          const ext = ing as ReviewIngredient & {
            newItem?: { name: string; unit: string | null; category: string | null };
          };
          return {
            name: ing.name,
            qty: ing.qty,
            unit: ing.unit,
            groupName: ing.groupName,
            groupOrder: ing.groupOrder,
            order: ing.order,
            groceryItemId: ing.match.status === "matched" || ing.match.status === "similar"
              ? ing.match.groceryItemId
              : null,
            newItem: ing.match.status === "new" ? (ext.newItem ?? {
              name: ing.name,
              unit: ing.unit ?? "piece",
              category: null,
            }) : undefined,
          };
        }),
      }));

      const res = await fetch("/api/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipes: payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Eroare la import");

      setImportResult(data);
      setStep(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare necunoscută");
    } finally {
      setLoading(false);
    }
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const validRecipes = recipes.filter((r) => !(r as { error?: string }).error);
  const conflictIngredients: Array<{ ri: number; ii: number; ing: ReviewIngredient }> = [];
  validRecipes.forEach((r, ri) => {
    r.ingredients.forEach((ing, ii) => {
      const ext = ing as ReviewIngredient & { newItem?: unknown };
      // Similar without explicit resolution OR new without newItem
      if (
        (ing.match.status === "similar" && !ing.match.groceryItemId) ||
        (ing.match.status === "new" && !ext.newItem)
      ) {
        conflictIngredients.push({ ri, ii, ing });
      }
    });
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#191919]">
      {/* Header */}
      <div className="border-b border-gray-100 dark:border-[#2e2e2e] bg-white dark:bg-[#1f1f1f] px-4 md:px-8 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/recipes"
            className="text-gray-500 dark:text-[#787878] hover:text-gray-700 dark:hover:text-[#9a9a9a] transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <h1 className="text-base font-semibold text-gray-900 dark:text-[#e3e3e3]">
            Import rețete
          </h1>
        </div>
        <StepIndicator step={step} />
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* ── STEP 1: Input ────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            {/* Mode toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => setInputMode("urls")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  inputMode === "urls"
                    ? "bg-orange-500 text-white"
                    : "bg-white dark:bg-[#1f1f1f] border border-gray-200 dark:border-[#2e2e2e] text-gray-600 dark:text-[#9a9a9a]"
                }`}
              >
                <Link2 size={15} /> Linkuri URL
              </button>
              <button
                onClick={() => setInputMode("text")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  inputMode === "text"
                    ? "bg-orange-500 text-white"
                    : "bg-white dark:bg-[#1f1f1f] border border-gray-200 dark:border-[#2e2e2e] text-gray-600 dark:text-[#9a9a9a]"
                }`}
              >
                <FileText size={15} /> Text / Fișier
              </button>
            </div>

            {inputMode === "urls" ? (
              <div className="bg-white dark:bg-[#1f1f1f] border border-gray-200 dark:border-[#2e2e2e] rounded-xl p-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-[#c0c0c0] mb-1">
                    URL-uri rețete (un URL per linie)
                  </label>
                  <textarea
                    value={urlsText}
                    onChange={(e) => setUrlsText(e.target.value)}
                    placeholder={"https://www.jamieoliver.com/recipes/...\nhttps://www.allrecipes.com/recipe/..."}
                    rows={6}
                    className="w-full text-sm border border-gray-200 dark:border-[#3a3a3a] rounded-lg px-3 py-2 bg-white dark:bg-[#2a2a2a] text-gray-900 dark:text-[#e3e3e3] placeholder-gray-400 dark:placeholder-[#555] focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none font-mono"
                  />
                </div>
                <p className="text-xs text-gray-400 dark:text-[#555]">
                  Suportă AllRecipes, Jamie Oliver, BBC Good Food, și alte site-uri cu schema.org/Recipe markup.
                </p>
              </div>
            ) : (
              <div className="bg-white dark:bg-[#1f1f1f] border border-gray-200 dark:border-[#2e2e2e] rounded-xl p-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-[#c0c0c0] mb-1">
                    Text rețetă (format structurat)
                  </label>
                  <textarea
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value)}
                    placeholder={"=== Nume Rețetă ===\nServings: 4\nTime: 30\nDifficulty: Easy\nCategory: Dinner\n\nIngrediente principale\n[500 g] faina\n[2 cup] lapte\n\nSteps:\n1. Pas unu\n2. Pas doi"}
                    rows={12}
                    className="w-full text-sm border border-gray-200 dark:border-[#3a3a3a] rounded-lg px-3 py-2 bg-white dark:bg-[#2a2a2a] text-gray-900 dark:text-[#e3e3e3] placeholder-gray-400 dark:placeholder-[#555] focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none font-mono"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 dark:text-[#555]">sau</span>
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="flex items-center gap-1.5 text-sm text-orange-600 dark:text-orange-400 hover:underline"
                  >
                    <Upload size={14} /> Încarcă fișier .txt
                  </button>
                  <input ref={fileRef} type="file" accept=".txt" className="hidden" onChange={handleFile} />
                  {textContent && (
                    <span className="text-xs text-green-600 dark:text-green-400">
                      ✓ {textContent.split("\n").length} linii încărcate
                    </span>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-xl p-3 text-sm text-red-700 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={handleParse}
                disabled={loading || (inputMode === "urls" ? !urlsText.trim() : !textContent.trim())}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                {loading ? "Se parsează..." : "Parsează rețetele"}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Review ───────────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600 dark:text-[#9a9a9a]">
                {validRecipes.length} rețete găsite · verifică și elimină ce nu dorești
              </p>
            </div>

            {recipes.map((recipe, i) => (
              <RecipeReviewCard
                key={i}
                recipe={recipe as ParsedRecipe & { error?: string }}
                index={i}
                onRemove={() => setRecipes((prev) => prev.filter((_, idx) => idx !== i))}
              />
            ))}

            {recipes.length === 0 && (
              <div className="text-center py-12 text-gray-400 dark:text-[#555]">
                <p className="text-sm">Toate rețetele au fost eliminate.</p>
                <button onClick={() => setStep(1)} className="mt-2 text-orange-500 hover:underline text-sm">
                  Înapoi la input
                </button>
              </div>
            )}

            {recipes.length > 0 && (
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setStep(1)}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-[#787878] dark:hover:text-[#9a9a9a] transition-colors"
                >
                  <ArrowLeft size={14} /> Înapoi
                </button>
                <button
                  onClick={() => setStep(conflictIngredients.length > 0 ? 3 : 4)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-medium text-sm transition-colors"
                >
                  {conflictIngredients.length > 0
                    ? `Rezolvă ${conflictIngredients.length} conflicte`
                    : "Confirmă import"}
                  <ArrowRight size={16} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3: Resolve conflicts ─────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-[#e3e3e3]">
                Ingrediente neclare ({conflictIngredients.length})
              </h2>
              <p className="text-sm text-gray-500 dark:text-[#787878] mt-0.5">
                Pentru fiecare ingredient, alege un item existent sau configurează unul nou.
              </p>
            </div>

            {conflictIngredients.map(({ ri, ii, ing }) => (
              <ConflictRow
                key={`${ri}-${ii}`}
                recipeIndex={ri}
                ingIndex={ii}
                ing={ing}
                recipes={validRecipes}
                onUpdate={updateIngredient}
              />
            ))}

            {error && (
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-xl p-3 text-sm text-red-700 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setStep(2)}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-[#787878] dark:hover:text-[#9a9a9a] transition-colors"
              >
                <ArrowLeft size={14} /> Înapoi la review
              </button>
              <button
                onClick={handleImport}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-medium text-sm transition-colors disabled:opacity-40"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                {loading ? "Se importă..." : `Importă ${validRecipes.length} rețete`}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 4: Success ──────────────────────────────────────────── */}
        {step === 4 && importResult && (
          <div className="text-center py-12 space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-950/40 flex items-center justify-center mx-auto">
              <CheckCircle size={32} className="text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-[#e3e3e3]">Import reușit!</h2>
              <p className="text-sm text-gray-500 dark:text-[#787878] mt-1">
                {importResult.recipesCreated} rețete adăugate
                {importResult.newIngredientsCreated > 0 &&
                  ` · ${importResult.newIngredientsCreated} ingrediente noi create`}
              </p>
            </div>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => {
                  setStep(1);
                  setRecipes([]);
                  setUrlsText("");
                  setTextContent("");
                  setImportResult(null);
                  setError(null);
                }}
                className="px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 dark:border-[#2e2e2e] text-gray-600 dark:text-[#9a9a9a] hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition-colors"
              >
                Import nou
              </button>
              <Link
                href="/recipes"
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-medium text-sm transition-colors"
              >
                Vezi rețetele <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        )}

        {/* Step 4 with no importResult = confirm without conflicts */}
        {step === 4 && !importResult && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-[#e3e3e3]">
                Gata de import
              </h2>
              <p className="text-sm text-gray-500 dark:text-[#787878] mt-0.5">
                {validRecipes.length} rețete · {validRecipes.reduce((s, r) => s + r.ingredients.length, 0)} ingrediente
              </p>
            </div>

            <div className="bg-white dark:bg-[#1f1f1f] border border-gray-200 dark:border-[#2e2e2e] rounded-xl divide-y divide-gray-100 dark:divide-[#2e2e2e]">
              {validRecipes.map((r, i) => (
                <div key={i} className="px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-800 dark:text-[#e3e3e3]">{r.name}</span>
                  <span className="text-xs text-gray-400 dark:text-[#555]">
                    {r.ingredients.length} ingrediente
                  </span>
                </div>
              ))}
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-xl p-3 text-sm text-red-700 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setStep(2)}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-[#787878] dark:hover:text-[#9a9a9a] transition-colors"
              >
                <ArrowLeft size={14} /> Înapoi
              </button>
              <button
                onClick={handleImport}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-medium text-sm transition-colors disabled:opacity-40"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                {loading ? "Se importă..." : `Importă ${validRecipes.length} rețete`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
