"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowRight, Upload, Link2, FileText,
  CheckCircle, AlertCircle, PlusCircle, Loader2,
  ChevronDown, ChevronUp, X, Check, Search,
} from "lucide-react";
import type { ParsedRecipe, ReviewIngredient, UnitConflict } from "@/app/api/import/parse/route";

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
  onImageChange,
}: {
  recipe: ParsedRecipe & { error?: string };
  index: number;
  onRemove: () => void;
  onImageChange: (url: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const imgRef = useRef<HTMLInputElement>(null);

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/import/upload-image", { method: "POST", body: form });
      const data = await res.json();
      if (res.ok) onImageChange(data.url);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

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
          {/* Image upload */}
          <button
            onClick={() => imgRef.current?.click()}
            title={recipe.image ? "Schimbă imaginea" : "Adaugă imagine"}
            className={`transition-colors ${recipe.image ? "text-orange-400 hover:text-orange-600" : "text-gray-300 dark:text-[#444] hover:text-orange-400"}`}
          >
            {uploading ? <Loader2 size={16} className="animate-spin" /> : (
              recipe.image
                ? <img src={recipe.image} className="w-5 h-5 rounded object-cover" alt="" />
                : <Upload size={16} />
            )}
          </button>
          <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
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
  const [newName, setNewName] = useState(ing.name);
  const [newUnit, setNewUnit] = useState(ing.unit ?? "g");
  const [newCategory, setNewCategory] = useState("");
  const [selectedId, setSelectedId] = useState(ing.match.groceryItemId ?? "");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ id: string; name: string; unit: string | null }>>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/import/search-items?q=${encodeURIComponent(searchQuery)}`);
        setSearchResults(await res.json());
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const apply = () => {
    if (mode === "map" && selectedId) {
      const candidate = ing.match.candidates?.find((c) => c.id === selectedId)
        ?? searchResults.find((c) => c.id === selectedId);
      onUpdate(recipeIndex, ingIndex, {
        ...ing,
        match: {
          status: "matched",
          groceryItemId: selectedId,
          groceryItemName: candidate?.name ?? selectedId,
          groceryItemUnit: candidate?.unit ?? null,
          // @ts-expect-error – runtime flag for saving mapping
          manuallyMapped: true,
        },
      });
    } else if (mode === "new") {
      onUpdate(recipeIndex, ingIndex, {
        ...ing,
        match: { ...ing.match, status: "new" },
        // @ts-expect-error – newItem is a runtime extension
        newItem: { name: newName.trim() || ing.name, unit: newUnit, category: newCategory || null },
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
          {/* Search input */}
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#555]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Caută în baza de date..."
              className="w-full text-sm pl-8 pr-3 py-1.5 border border-gray-200 dark:border-[#3a3a3a] rounded-lg bg-white dark:bg-[#2a2a2a] text-gray-900 dark:text-[#e3e3e3] placeholder-gray-400 dark:placeholder-[#555] focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            {searching && <Loader2 size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />}
          </div>

          {/* Results: search results take priority, otherwise show candidates */}
          {(() => {
            const list = searchQuery.length >= 2 ? searchResults : (ing.match.candidates ?? []);
            if (list.length === 0) {
              return searchQuery.length >= 2
                ? <p className="text-xs text-gray-400 dark:text-[#555]">Niciun rezultat pentru &ldquo;{searchQuery}&rdquo;.</p>
                : <p className="text-xs text-gray-400 dark:text-[#555]">Nu s-au găsit candidați. Caută sau alege &ldquo;Creează nou&rdquo;.</p>;
            }
            return (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {list.map((c) => (
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
            );
          })()}
        </div>
      )}

      {mode === "new" && (
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-gray-500 dark:text-[#787878] mb-1">Nume ingredient</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full text-sm border border-gray-200 dark:border-[#3a3a3a] rounded-lg px-2 py-1.5 bg-white dark:bg-[#2a2a2a] text-gray-900 dark:text-[#e3e3e3] focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
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

// ─── Unit conflict resolver ───────────────────────────────────────────────────

function UnitConflictRow({
  recipeIndex,
  ingIndex,
  ing,
  recipeName,
  onUpdate,
}: {
  recipeIndex: number;
  ingIndex: number;
  ing: ReviewIngredient;
  recipeName: string;
  onUpdate: (ri: number, ii: number, updated: ReviewIngredient) => void;
}) {
  const conflict = ing.unitConflict!;
  const [targetUnit, setTargetUnit] = useState(conflict.targetUnit ?? conflict.allowedUnits[0]);
  const [factor, setFactor] = useState(conflict.factor?.toString() ?? "");
  const resolved = conflict.autoResolved || (factor !== "" && !isNaN(parseFloat(factor)));

  function apply() {
    const f = parseFloat(factor);
    if (isNaN(f) || f <= 0) return;
    onUpdate(recipeIndex, ingIndex, {
      ...ing,
      unitConflict: { ...conflict, autoResolved: true, targetUnit, factor: f },
    });
  }

  return (
    <div className={`border rounded-xl p-4 space-y-3 ${
      conflict.autoResolved
        ? "border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-950/10"
        : "border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/10"
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-[#e3e3e3]">
            &ldquo;{ing.name}&rdquo;
          </p>
          <p className="text-xs text-gray-500 dark:text-[#787878] mt-0.5">
            {recipeName} · {ing.qty} <strong>{conflict.foreignUnit}</strong>
            {" → "}unități permise: <strong>{conflict.allowedUnits.join(", ")}</strong>
          </p>
        </div>
        {conflict.autoResolved ? (
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400 font-medium shrink-0">
            <Check size={10} /> auto
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 font-medium shrink-0">
            <AlertCircle size={10} /> conversie
          </span>
        )}
      </div>

      {conflict.autoResolved ? (
        <p className="text-xs text-green-700 dark:text-green-400">
          1 {conflict.foreignUnit} = {conflict.factor} {conflict.targetUnit}
          {" · "}rezultat: {ing.qty != null ? +(ing.qty * conflict.factor!).toFixed(4) : "?"} {conflict.targetUnit}
        </p>
      ) : (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 dark:text-[#787878] mb-1">
              1 {conflict.foreignUnit} =
            </label>
            <input
              type="number"
              min="0"
              step="any"
              value={factor}
              onChange={(e) => setFactor(e.target.value)}
              placeholder="ex: 240"
              className="w-full text-sm border border-gray-200 dark:border-[#3a3a3a] rounded-lg px-3 py-1.5 bg-white dark:bg-[#2a2a2a] text-gray-900 dark:text-[#e3e3e3] focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
          <div className="w-28">
            <label className="block text-xs text-gray-500 dark:text-[#787878] mb-1">unitate țintă</label>
            <select
              value={targetUnit}
              onChange={(e) => setTargetUnit(e.target.value)}
              className="w-full text-sm border border-gray-200 dark:border-[#3a3a3a] rounded-lg px-2 py-1.5 bg-white dark:bg-[#2a2a2a] text-gray-900 dark:text-[#e3e3e3]"
            >
              {conflict.allowedUnits.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <button
            onClick={apply}
            disabled={!resolved}
            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors disabled:opacity-40"
          >
            Aplică
          </button>
        </div>
      )}
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

  // ── Update recipe image ────────────────────────────────────────────────────

  function updateImage(ri: number, url: string) {
    setRecipes((prev) =>
      prev.map((r, idx) => idx === ri ? { ...r, image: url } : r)
    );
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
      // Build payload — resolve ingredient references + apply unit conversions
      const newUnitRules: Array<{ name: string; foreignUnit: string; targetUnit: string; factor: number }> = [];

      const payload = recipes.filter((r) => !(r as { error?: string }).error).map((r) => ({
        ...r,
        ingredients: r.ingredients.map((ing) => {
          const ext = ing as ReviewIngredient & {
            newItem?: { name: string; unit: string | null; category: string | null };
          };

          // Apply unit conversion if needed
          let qty = ing.qty;
          let unit = ing.unit;
          const uc = ing.unitConflict;
          if (uc?.targetUnit && uc.factor != null) {
            qty = qty != null ? +(qty * uc.factor).toFixed(6) : null;
            unit = uc.targetUnit;
            // Collect new rules (not previously auto-resolved from file)
            if (!uc.autoResolved) {
              newUnitRules.push({ name: ing.name, foreignUnit: uc.foreignUnit, targetUnit: uc.targetUnit, factor: uc.factor });
            }
          }

          const manuallyMapped = !!(ing.match as { manuallyMapped?: boolean }).manuallyMapped;
          return {
            name: ing.name,
            qty,
            unit,
            groupName: ing.groupName,
            groupOrder: ing.groupOrder,
            order: ing.order,
            groceryItemId: ing.match.status === "matched" || ing.match.status === "similar"
              ? ing.match.groceryItemId
              : null,
            groceryItemName: manuallyMapped ? ing.match.groceryItemName : undefined,
            saveMapping: manuallyMapped || undefined,
            newItem: ing.match.status === "new" ? ext.newItem ?? undefined : undefined,
          };
        }),
      }));

      const res = await fetch("/api/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipes: payload, newUnitRules }),
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
  const unitConflictIngredients: Array<{ ri: number; ii: number; ing: ReviewIngredient }> = [];
  validRecipes.forEach((r, ri) => {
    r.ingredients.forEach((ing, ii) => {
      const ext = ing as ReviewIngredient & { newItem?: unknown };
      if (
        (ing.match.status === "similar" && !ing.match.groceryItemId) ||
        (ing.match.status === "new" && !ext.newItem)
      ) {
        conflictIngredients.push({ ri, ii, ing });
      }
      if (ing.unitConflict && !ing.unitConflict.autoResolved) {
        unitConflictIngredients.push({ ri, ii, ing });
      }
    });
  });
  const totalConflicts = conflictIngredients.length + unitConflictIngredients.length;

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
                    placeholder={"=== Nume Rețetă ===\nServings: 4 Batch: True\nTime: 30\nDifficulty: Easy\nCategories: Dinner, Lunch\nFavorite: No\nLink: https://...\nImage: data/local/img/photo.jpg\n\n# Ingrediente principale\n200g Ciocolată\n1 cup Lapte\n\n# Sosuri\n2 tbsp Ulei de cocos\n\n## Pași\n1. Primul pas\n2. Al doilea pas\n\n## Tips\n- Sfat util\n- Alt sfat"}
                    rows={12}
                    className="w-full text-sm border border-gray-200 dark:border-[#3a3a3a] rounded-lg px-3 py-2 bg-white dark:bg-[#2a2a2a] text-gray-900 dark:text-[#e3e3e3] placeholder-gray-400 dark:placeholder-[#555] focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none font-mono"
                  />
                </div>
                <div className="flex items-center gap-3 flex-wrap">
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
                onImageChange={(url) => updateImage(i, url)}
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
                  onClick={() => setStep(totalConflicts > 0 ? 3 : 4)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-medium text-sm transition-colors"
                >
                  {totalConflicts > 0
                    ? `Rezolvă ${totalConflicts} conflicte`
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
            {conflictIngredients.length > 0 && (
              <>
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
              </>
            )}

            {unitConflictIngredients.length > 0 && (
              <>
                <div>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-[#e3e3e3]">
                    Conversii unități ({unitConflictIngredients.length})
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-[#787878] mt-0.5">
                    Unitatea din rețetă diferă de unitățile permise ale ingredientului. Introdu factorul de conversie — va fi salvat pentru utilizări viitoare.
                  </p>
                </div>
                {unitConflictIngredients.map(({ ri, ii, ing }) => (
                  <UnitConflictRow
                    key={`unit-${ri}-${ii}`}
                    recipeIndex={ri}
                    ingIndex={ii}
                    ing={ing}
                    recipeName={validRecipes[ri]?.name ?? ""}
                    onUpdate={updateIngredient}
                  />
                ))}
              </>
            )}

            {conflictIngredients.length > 0 && (
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400 flex items-start gap-2">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>
                  Mai sunt <strong>{conflictIngredients.length} ingrediente nerezolvate</strong>. Toate ingredientele trebuie să fie mapate la un item existent sau să aibă un item nou creat înainte de import.
                </span>
              </div>
            )}

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
                disabled={loading || conflictIngredients.length > 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
                disabled={loading || conflictIngredients.length > 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
