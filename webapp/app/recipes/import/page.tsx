"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, Upload, Link2, FileText,
  CheckCircle, AlertCircle, Loader2,
  ChevronDown, ChevronUp, X, Check, Search, Plus, Sparkles,
} from "lucide-react";
import type { ParsedRecipe, ReviewIngredient } from "@/app/api/import/parse/route";
import { getGroceryCategories, getGroceryItemDetails } from "@/lib/actions";
import { GROCERY_CATEGORIES } from "@/lib/constants";

// ─── Constants ────────────────────────────────────────────────────────────────

const UNITS = ["g", "kg", "ml", "l", "cup", "tbsp", "tsp", "oz", "lb", "piece", "handful", "pinch", "slice", "can", "bunch"];

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

function MatchBadge({ status, hasUnitConflict, reviewed }: { status: ReviewIngredient["match"]["status"]; hasUnitConflict?: boolean; reviewed?: boolean }) {
  if (reviewed) return (
    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-medium">
      <Check size={10} /> reviewed
    </span>
  );
  if (status === "matched" && !hasUnitConflict) return (
    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 font-medium">
      <Check size={10} /> matched
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-yellow-50 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-400 font-medium">
      <AlertCircle size={10} /> needs review
    </span>
  );
}

// ─── Recipe review card ───────────────────────────────────────────────────────

function RecipeReviewCard({
  recipe,
  onRemove,
  onImageChange,
  onIngredientToggle,
  onBatchChange,
}: {
  recipe: ParsedRecipe & { error?: string };
  index: number;
  onRemove: () => void;
  onImageChange: (url: string) => void;
  onIngredientToggle: (ingIndex: number) => void;
  onBatchChange: (batch: boolean) => void;
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
          {/* Ingredient stats + batch toggle */}
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
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-gray-500 dark:text-[#787878]">Cantități per:</span>
            <button
              onClick={() => onBatchChange(true)}
              className={`text-xs px-2 py-0.5 rounded font-medium transition-colors ${
                recipe.batch
                  ? "bg-orange-500 text-white"
                  : "bg-gray-100 dark:bg-[#2a2a2a] text-gray-500 dark:text-[#787878] hover:bg-gray-200 dark:hover:bg-[#333]"
              }`}
            >
              batch total
            </button>
            <button
              onClick={() => onBatchChange(false)}
              className={`text-xs px-2 py-0.5 rounded font-medium transition-colors ${
                !recipe.batch
                  ? "bg-orange-500 text-white"
                  : "bg-gray-100 dark:bg-[#2a2a2a] text-gray-500 dark:text-[#787878] hover:bg-gray-200 dark:hover:bg-[#333]"
              }`}
            >
              1 porție
            </button>
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
            <div
              key={i}
              onClick={() => onIngredientToggle(i)}
              title={ing.match.status === "matched" && !ing.unitConflict ? "Click pentru a marca de revizuit" : "Click pentru a marca ca matched"}
              className="flex items-center justify-between gap-2 py-0.5 cursor-pointer rounded hover:bg-gray-50 dark:hover:bg-[#2a2a2a] px-1 -mx-1 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <MatchBadge status={ing.match.status} hasUnitConflict={!!ing.unitConflict} reviewed={(ing as IngredientExt).reviewed} />
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
          <p className="text-xs text-gray-400 dark:text-[#555] pt-1">Click pe un ingredient pentru a-i schimba statusul.</p>
        </div>
      )}
    </div>
  );
}

// ─── Unified review row (ingredient conflict + unit conflict) ─────────────────

type IngredientExt = ReviewIngredient & { skipped?: boolean; reviewed?: boolean; addUnit2?: boolean; unit2Conversion?: number | null; newItem?: { name: string; unit: string | null; category: string | null } };

function getAutoFactor(fu: string, tu: string): string {
  const map: Record<string, number> = {
    "tsp→tbsp": 1 / 3, "tbsp→tsp": 3,
    "cup→ml": 240, "ml→cup": 1 / 240,
    "cup→l": 0.24, "l→cup": 1 / 0.24,
    "oz→g": 28.35, "g→oz": 1 / 28.35,
    "lb→g": 453.6, "g→lb": 1 / 453.6,
    "lb→kg": 0.4536, "kg→lb": 1 / 0.4536,
    "kg→g": 1000, "g→kg": 1 / 1000,
    "l→ml": 1000, "ml→l": 1 / 1000,
  };
  const v = map[`${fu}→${tu}`];
  return v == null ? "" : (+v.toFixed(6)).toString();
}

const fmtNum = (n: number | null) => (n == null || isNaN(n) ? "–" : (+n.toFixed(4)).toString());

function ReviewRow({
  recipeIndex,
  ingIndex,
  ing,
  recipes,
  onUpdate,
  onSkip,
  onCollapse,
  focused,
  categories,
  sameNameCount = 0,
}: {
  recipeIndex: number;
  ingIndex: number;
  ing: IngredientExt;
  recipes: ParsedRecipe[];
  onUpdate: (ri: number, ii: number, updated: ReviewIngredient) => void;
  onSkip: (ri: number, ii: number) => void;
  onCollapse: () => void;
  focused?: boolean;
  categories: string[];
  sameNameCount?: number;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focused && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focused]);

  const foreign = ing.unit;   // unit detected in the recipe file
  const qty = ing.qty;

  // ── Ingredient selection: an existing grocery item id, or "new" ──
  const [selectedId, setSelectedId] = useState<string>(ing.match.groceryItemId ?? "new");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ id: string; name: string; unit: string | null; unit2?: string | null }>>([]);
  const [searching, setSearching] = useState(false);

  // ── Create-new fields ──
  const [newName, setNewName] = useState(ing.name);
  const [newUnit, setNewUnit] = useState(foreign ?? "g");
  const [newCategory, setNewCategory] = useState("");

  const [obs, setObs] = useState(ing.obs ?? "");

  // ── Selected item details (unit / unit2 / conversion) loaded from DB ──
  const [sel, setSel] = useState<{ name: string; unit: string | null; unit2: string | null; conversion: number | null } | null>(null);
  const [selLoading, setSelLoading] = useState(false);

  // ── Conversion state ──
  const [target, setTarget] = useState<string>("");
  const [factor, setFactor] = useState<string>("");   // 1 foreign = factor × target  (direction A)
  const [addU2, setAddU2] = useState(false);

  // ── AI conversion suggestion state ──
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggested, setAiSuggested] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);

  // Când utilizatorul editează factorul manual, sugestia AI nu mai e „sugestie"
  function handleFactorChange(v: string) {
    setFactor(v);
    if (aiSuggested) { setAiSuggested(false); setAiNote(null); }
  }

  // Debounced DB search
  useEffect(() => {
    if (searchQuery.trim().length < 2) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/import/search-items?q=${encodeURIComponent(searchQuery)}`);
        setSearchResults(await res.json());
      } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load details for the selected grocery item (units + conversion)
  useEffect(() => {
    setAiSuggested(false); setAiNote(null); setAiLoading(false);
    if (selectedId === "new" || !selectedId) { setSel(null); setAddU2(false); return; }
    let cancelled = false;
    setSelLoading(true);
    getGroceryItemDetails(selectedId)
      .then((d) => {
        if (cancelled) return;
        setSelLoading(false);
        setAddU2(false);
        if (!d) { setSel(null); return; }
        setSel({ name: d.name, unit: d.unit, unit2: d.unit2, conversion: d.conversion });
        const us = [d.unit, d.unit2].filter((u): u is string => !!u);
        if (foreign && us.length >= 1 && !us.includes(foreign)) {
          const t = us[0];
          setTarget(t);
          setFactor(getAutoFactor(foreign, t));
        } else {
          setTarget("");
          setFactor("");
        }
      })
      .catch(() => { if (!cancelled) setSelLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // ── Derived scenario ──
  const isNew = selectedId === "new";
  const units = sel ? [sel.unit, sel.unit2].filter((u): u is string => !!u) : [];
  const matches = !!foreign && units.includes(foreign);
  const singleUnit = units.length === 1;
  const needsConversion = !!foreign && units.length >= 1 && !matches;

  // ── AI suggestion: pre-completează factorul pentru conversiile dependente de
  //     ingredient (unde tabelul static getAutoFactor n-are nimic). Doar prima dată —
  //     odată acceptată, regula se salvează în DB și data viitoare vine auto-resolved. ──
  useEffect(() => {
    if (isNew || !foreign || !sel || !needsConversion) return;
    if (factor !== "") return;          // avem deja un factor (standard sau introdus manual)
    const toUnit = target || units[0];
    if (!toUnit) return;
    let cancelled = false;
    setAiLoading(true);
    fetch("/api/import/suggest-conversion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ingredientName: sel.name, fromUnit: foreign, toUnit }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { factor?: number; note?: string } | null) => {
        if (cancelled || !d || !d.factor) return;
        setFactor(String(+Number(d.factor).toFixed(6)));
        setAiSuggested(true);
        setAiNote(d.note || null);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setAiLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsConversion, sel, target, singleUnit]);

  const factorNum = parseFloat(factor);
  const factorValid = factor !== "" && !isNaN(factorNum) && factorNum > 0;

  const canSave = isNew
    ? newName.trim().length > 0
    : !sel ? false
    : !needsConversion ? true
    : (singleUnit && addU2) ? true
    : factorValid;

  // ── Display helpers ──
  const outTarget = needsConversion && !(singleUnit && addU2) && factorValid && qty != null
    ? +(qty * factorNum).toFixed(4)
    : null;

  // Scenario 2: the "other" unit computed from the DB conversion (1 unit2 = conversion × unit1)
  const matchOther = (() => {
    if (!sel || !matches) return null;
    const o = units.find((u) => u !== foreign);
    if (!o) return null;
    let v: number | null = null;
    if (qty != null && sel.conversion) {
      if (foreign === sel.unit && sel.unit2) v = qty / sel.conversion;
      else if (foreign === sel.unit2 && sel.unit) v = qty * sel.conversion;
    }
    return { unit: o, val: v };
  })();

  // Scenario 1: the non-target unit derived from the DB conversion
  const s1Other = (() => {
    if (!sel || singleUnit || !needsConversion) return null;
    const o = units.find((u) => u !== target);
    if (!o) return null;
    let v: number | null = null;
    if (outTarget != null && sel.conversion) {
      v = target === sel.unit ? outTarget / sel.conversion : outTarget * sel.conversion;
    }
    return { unit: o, val: v };
  })();

  function handleSave() {
    if (!canSave) return;
    let updated: IngredientExt;

    if (isNew) {
      updated = {
        ...ing,
        reviewed: true,
        obs: obs.trim() || null,
        unitConflict: undefined,
        addUnit2: undefined,
        unit2Conversion: undefined,
        match: { ...ing.match, status: "new", groceryItemId: undefined, manuallyMapped: true } as ReviewIngredient["match"] & { manuallyMapped?: boolean },
        newItem: { name: newName.trim() || ing.name, unit: newUnit, category: newCategory || null },
      };
    } else {
      let unitConflict: ReviewIngredient["unitConflict"] = undefined;
      let addUnit2Flag: boolean | undefined = undefined;
      let unit2Conversion: number | null | undefined = undefined;

      if (!needsConversion) {
        unitConflict = undefined;                        // scenario 2 / clean match
      } else if (singleUnit && addU2) {
        addUnit2Flag = true;                             // scenario 3 → add foreign as unit2
        unit2Conversion = factorValid ? factorNum : null;
        unitConflict = { foreignUnit: foreign!, allowedUnits: units, autoResolved: true, targetUnit: foreign!, factor: 1 };
      } else {
        unitConflict = { foreignUnit: foreign!, allowedUnits: units, autoResolved: true, targetUnit: target, factor: factorNum };
      }

      updated = {
        ...ing,
        reviewed: true,
        obs: obs.trim() || null,
        newItem: undefined,
        addUnit2: addUnit2Flag,
        unit2Conversion,
        unitConflict,
        match: {
          status: "matched",
          groceryItemId: selectedId,
          groceryItemName: sel!.name,
          groceryItemUnit: sel!.unit,
          groceryItemUnit2: sel!.unit2,
          manuallyMapped: true,
        } as ReviewIngredient["match"] & { manuallyMapped?: boolean },
      };
    }

    onUpdate(recipeIndex, ingIndex, updated as ReviewIngredient);
  }

  const isReviewed = !!ing.reviewed;

  // ── Ingredient candidate list ──
  const baseList = searchQuery.trim().length >= 2 ? searchResults : (ing.match.candidates ?? []);
  const autoId = ing.match.groceryItemId;
  const autoMatch = autoId && !baseList.some((c) => c.id === autoId)
    ? [{ id: autoId, name: ing.match.groceryItemName ?? autoId, unit: ing.match.groceryItemUnit ?? null, unit2: ing.match.groceryItemUnit2 ?? null, isAuto: true }]
    : [];
  const list = [...autoMatch, ...baseList];

  const inputCls = "w-full text-sm border border-gray-200 dark:border-[#3a3a3a] rounded-lg px-2 py-1.5 bg-white dark:bg-[#2a2a2a] text-gray-900 dark:text-[#e3e3e3] focus:outline-none focus:ring-2 focus:ring-orange-400";
  const labelCls = "block text-xs text-gray-500 dark:text-[#787878] mb-1";

  return (
    <div ref={rowRef} className={`border rounded-xl bg-white dark:bg-[#1f1f1f] overflow-hidden transition-shadow ${
      focused ? "border-orange-400 ring-2 ring-orange-300 dark:ring-orange-800"
      : isReviewed ? "border-green-200 dark:border-green-900/50"
      : "border-yellow-200 dark:border-yellow-900/50"
    }`}>
      {/* Header — click to collapse */}
      <div
        className={`px-4 py-3 flex items-start justify-between gap-2 cursor-pointer select-none ${
          isReviewed ? "bg-green-50/40 dark:bg-green-950/10" : "bg-yellow-50/60 dark:bg-yellow-950/10"
        }`}
        onClick={onCollapse}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-[#e3e3e3]">&ldquo;{ing.name}&rdquo;</p>
          <p className="text-xs text-gray-500 dark:text-[#787878] mt-0.5">{recipes[recipeIndex]?.name}</p>
          <p className="text-xs text-gray-500 dark:text-[#787878] mt-0.5 tabular-nums">
            {qty != null ? `${qty} ` : ""}{foreign ?? ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex items-center gap-1.5">
            {isReviewed ? (
              <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 font-medium">
                <Check size={10} /> rezolvat
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-400 font-medium">
                <AlertCircle size={10} /> needs review
              </span>
            )}
            <ChevronUp size={13} className="text-gray-400 dark:text-[#555]" />
          </div>
          {sameNameCount > 0 && (
            <span className="text-[10px] text-blue-500 dark:text-blue-400 font-medium">
              → se aplică și la alte {sameNameCount}
            </span>
          )}
        </div>
      </div>

      <div className="px-4 py-3 space-y-4">
        {/* ── Ingredient — search + pick + create new ── */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 dark:text-[#787878] uppercase tracking-wide">Ingredient</p>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#555]" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Caută în baza de date..."
              className="w-full text-sm pl-8 pr-3 py-1.5 border border-gray-200 dark:border-[#3a3a3a] rounded-lg bg-white dark:bg-[#2a2a2a] text-gray-900 dark:text-[#e3e3e3] placeholder-gray-400 dark:placeholder-[#555] focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            {searching && <Loader2 size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />}
          </div>

          <div className="space-y-1 max-h-56 overflow-y-auto">
            {list.length === 0 && searchQuery.trim().length >= 2 && (
              <p className="text-xs text-gray-400 dark:text-[#555]">Niciun rezultat pentru &ldquo;{searchQuery}&rdquo;.</p>
            )}
            {list.map((c) => {
              const isAuto = (c as { isAuto?: boolean }).isAuto;
              const u2 = (c as { unit2?: string | null }).unit2;
              const uStr = [c.unit, u2].filter(Boolean).join(" / ");
              const selectedThis = selectedId === c.id;
              return (
                <label key={c.id} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer border transition-colors ${
                  selectedThis ? "border-orange-400 bg-orange-50 dark:bg-orange-950/20"
                  : isAuto ? "border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/20 hover:bg-green-100 dark:hover:bg-green-950/30"
                  : "border-transparent hover:bg-gray-50 dark:hover:bg-[#2a2a2a]"
                }`}>
                  <input type="radio" name={`pick-${recipeIndex}-${ingIndex}`} checked={selectedThis}
                    onChange={() => setSelectedId(c.id)} className="accent-orange-500" />
                  <span className="text-sm text-gray-700 dark:text-[#c0c0c0]">{c.name}</span>
                  {uStr && <span className="text-xs text-gray-400 dark:text-[#555] tabular-nums">{uStr}</span>}
                  {isAuto && <span className="ml-auto text-xs text-green-600 dark:text-green-400 font-medium">auto-matched</span>}
                </label>
              );
            })}

            {/* Always-present: create new */}
            <label className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer border transition-colors ${
              isNew ? "border-orange-400 bg-orange-50 dark:bg-orange-950/20" : "border-transparent hover:bg-gray-50 dark:hover:bg-[#2a2a2a]"
            }`}>
              <input type="radio" name={`pick-${recipeIndex}-${ingIndex}`} checked={isNew}
                onChange={() => setSelectedId("new")} className="accent-orange-500" />
              <Plus size={13} className="text-orange-500" />
              <span className="text-sm font-medium text-orange-600 dark:text-orange-400">Crează ingredient nou &ldquo;{ing.name}&rdquo;</span>
            </label>
          </div>

          {/* Create-new fields */}
          {isNew && (
            <div className="mt-1 p-3 rounded-lg border border-dashed border-orange-300 dark:border-orange-800 bg-orange-50/40 dark:bg-orange-950/10 space-y-2">
              <div>
                <label className={labelCls}>Nume ingredient</label>
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>Unitate</label>
                  <select value={newUnit ?? "g"} onChange={(e) => setNewUnit(e.target.value)} className={inputCls}>
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Categorie</label>
                  <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className={inputCls}>
                    <option value="">— selectează —</option>
                    {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Conversion (only for a real item with a foreign unit) ── */}
        {!isNew && foreign && (
          <div className="space-y-2 border-t border-gray-100 dark:border-[#2e2e2e] pt-3">
            <p className="text-xs font-semibold text-gray-500 dark:text-[#787878] uppercase tracking-wide">Conversie unități</p>

            {selLoading || !sel ? (
              <p className="text-xs text-gray-400 dark:text-[#555] flex items-center gap-1.5">
                <Loader2 size={12} className="animate-spin" /> se încarcă unitățile…
              </p>
            ) : units.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-[#787878]">
                Ingredientul nu are unitate setată — se stochează ca <strong>{qty} {foreign}</strong>.
              </p>
            ) : matches ? (
              /* Scenario 2 — foreign matches one of the item's units */
              <div className="space-y-1.5">
                <p className="text-xs text-gray-500 dark:text-[#787878]">Unitatea din fișier se potrivește:</p>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-green-400 dark:border-green-700 bg-green-50 dark:bg-green-950/20 tabular-nums">
                  <span className="text-sm font-medium text-gray-900 dark:text-[#e3e3e3]">{qty ?? ""} {foreign}</span>
                  <span className="ml-auto text-xs text-green-600 dark:text-green-400 font-medium">potrivit cu fișierul</span>
                </div>
                {matchOther && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-[#3a3a3a] bg-gray-50 dark:bg-[#262626] tabular-nums">
                    <span className="text-sm text-gray-500 dark:text-[#9a9a9a]">{fmtNum(matchOther.val)} {matchOther.unit}</span>
                    <span className="ml-auto text-xs text-gray-400 dark:text-[#555]">calculat din DB</span>
                  </div>
                )}
              </div>
            ) : singleUnit ? (
              /* Scenario 3 — item has a single unit; foreign differs */
              <div className="space-y-2">
                <div className="flex items-center gap-2 tabular-nums">
                  <span className="text-sm font-medium text-gray-700 dark:text-[#c0c0c0]">1 {foreign} =</span>
                  <input type="number" min="0" step="any" value={factor} onChange={(e) => handleFactorChange(e.target.value)}
                    placeholder="ex: 240"
                    className="w-24 text-sm text-right border border-gray-200 dark:border-[#3a3a3a] rounded-lg px-2 py-1.5 bg-white dark:bg-[#2a2a2a] text-gray-900 dark:text-[#e3e3e3] focus:outline-none focus:ring-2 focus:ring-orange-400" />
                  <span className="text-sm font-medium text-gray-700 dark:text-[#c0c0c0]">{units[0]}</span>
                </div>
                <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 cursor-pointer">
                  <input type="checkbox" checked={addU2} onChange={(e) => setAddU2(e.target.checked)} className="accent-blue-500" />
                  <span className="text-xs text-blue-600 dark:text-blue-400">
                    Adaugă &ldquo;{foreign}&rdquo; ca a 2-a unitate (unit2) pe &ldquo;{sel.name}&rdquo;
                  </span>
                </label>
              </div>
            ) : (
              /* Scenario 1 — item has two units; foreign matches neither */
              <div className="space-y-1.5">
                <span className="text-sm font-medium text-gray-700 dark:text-[#c0c0c0]">1 {foreign} =</span>
                {units.map((u) => {
                  const isTarget = target === u;
                  const derived = s1Other && s1Other.unit === u ? s1Other.val : null;
                  return (
                    <label key={u} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer tabular-nums ${
                      isTarget ? "border-orange-400 bg-orange-50 dark:bg-orange-950/20" : "border-gray-200 dark:border-[#3a3a3a] bg-gray-50 dark:bg-[#262626]"
                    }`}>
                      <input type="radio" name={`target-${recipeIndex}-${ingIndex}`} checked={isTarget}
                        onChange={() => { setTarget(u); setFactor(getAutoFactor(foreign, u)); setAiSuggested(false); setAiNote(null); }}
                        className="accent-orange-500" />
                      {isTarget ? (
                        <input type="number" min="0" step="any" value={factor} onChange={(e) => handleFactorChange(e.target.value)}
                          placeholder="ex: 240"
                          className="w-24 text-sm text-right border border-gray-200 dark:border-[#3a3a3a] rounded-lg px-2 py-1 bg-white dark:bg-[#2a2a2a] text-gray-900 dark:text-[#e3e3e3] focus:outline-none focus:ring-2 focus:ring-orange-400" />
                      ) : (
                        <span className="w-24 text-right text-sm text-gray-400 dark:text-[#666]">{fmtNum(derived)}</span>
                      )}
                      <span className="text-sm font-medium text-gray-700 dark:text-[#c0c0c0]">{u}</span>
                      <span className="ml-auto text-xs font-medium">{isTarget ? <span className="text-orange-600 dark:text-orange-400">țintă</span> : <span className="text-gray-400 dark:text-[#555]">derivat din DB</span>}</span>
                    </label>
                  );
                })}
              </div>
            )}

            {/* AI conversion suggestion status */}
            {aiLoading && (
              <p className="text-xs text-purple-500 dark:text-purple-400 flex items-center gap-1.5">
                <Loader2 size={12} className="animate-spin" /> AI caută o conversie potrivită…
              </p>
            )}
            {aiSuggested && !aiLoading && (
              <div className="flex items-start gap-1.5 text-xs text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/50 rounded-lg px-2.5 py-1.5">
                <Sparkles size={12} className="mt-0.5 shrink-0" />
                <span>
                  <strong>Sugerat de AI</strong>{aiNote ? ` · ${aiNote}` : ""}. Verifică și ajustează dacă nu e corect.
                </span>
              </div>
            )}

            {/* Result preview */}
            {sel && units.length > 0 && (
              <div className={`text-xs px-3 py-1.5 rounded-lg tabular-nums ${
                canSave ? "bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-900/50"
                : "bg-gray-50 dark:bg-[#262626] text-gray-500 dark:text-[#787878] border border-gray-200 dark:border-[#3a3a3a]"
              }`}>
                {matches
                  ? <>✓ se stochează ca <strong>{qty} {foreign}</strong></>
                  : singleUnit && addU2
                    ? <>✓ &ldquo;{foreign}&rdquo; devine unit2 pe &ldquo;{sel.name}&rdquo;{factorValid ? <> · 1 {foreign} = {factorNum} {units[0]}</> : <> (fără conversie)</>}</>
                    : factorValid
                      ? <>✓ <strong>{qty} {foreign}</strong> → <strong>{outTarget} {target}</strong></>
                      : <>Introdu factorul de conversie pentru a continua</>}
              </div>
            )}
          </div>
        )}

        {/* ── Observații (last in hierarchy) ── */}
        <div className="space-y-2 border-t border-gray-100 dark:border-[#2e2e2e] pt-3">
          <p className="text-xs font-semibold text-gray-500 dark:text-[#787878] uppercase tracking-wide">Observații</p>
          <input
            type="text"
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder="ex: roughly chopped, la temperatura camerei"
            className="w-full text-sm border border-gray-200 dark:border-[#3a3a3a] rounded-lg px-2 py-1.5 bg-white dark:bg-[#2a2a2a] text-gray-700 dark:text-[#c0c0c0] placeholder-gray-300 dark:placeholder-[#444] focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>

        {/* Footer — single Save + skip */}
        <div className="flex items-center gap-3 pt-1">
          {!isReviewed && (
            <button onClick={() => onSkip(recipeIndex, ingIndex)}
              className="text-xs text-gray-400 dark:text-[#555] hover:text-gray-600 dark:hover:text-[#787878] transition-colors">
              Sare peste
            </button>
          )}
          <button onClick={handleSave} disabled={!canSave}
            className="ml-auto text-sm font-semibold py-2 px-6 rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {isReviewed ? "Actualizează" : "Salvează"}
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── Main page ────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);

  // Step: 1=input, 2=review, 3=resolve, 4=preview
  const [step, setStep] = useState(1);
  const [focusIngredientKey, setFocusIngredientKey] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<"urls" | "text">("urls");
  const [urlsText, setUrlsText] = useState("");
  const [textContent, setTextContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groceryCategories, setGroceryCategories] = useState<string[]>(GROCERY_CATEGORIES);

  useEffect(() => {
    getGroceryCategories().then(setGroceryCategories).catch(() => {});
  }, []);
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

  function updateBatch(ri: number, batch: boolean) {
    setRecipes((prev) =>
      prev.map((r, idx) => idx === ri ? { ...r, batch } : r)
    );
  }

  // ── Update ingredient resolution (with cross-recipe propagation) ─────────────

  function updateIngredient(ri: number, ii: number, updated: ReviewIngredient) {
    const ext = updated as IngredientExt;
    const isReviewed = !!ext.reviewed;

    setRecipes((prev) =>
      prev.map((r, rIdx) => ({
        ...r,
        ingredients: r.ingredients.map((ing, iIdx) => {
          // Always apply the exact update to the target ingredient
          if (rIdx === ri && iIdx === ii) return updated;

          // Skip already-reviewed or skipped ingredients
          const ingExt = ing as IngredientExt;
          if (ingExt.reviewed || ingExt.skipped) return ing;

          // Only propagate if the update is a reviewed resolution
          if (!isReviewed) return ing;

          // Same ingredient name (case-insensitive)
          if (ing.name.toLowerCase() !== updated.name.toLowerCase()) return ing;

          // ── Propagate unit conversion ──────────────────────────────────────
          if (
            updated.unitConflict?.autoResolved &&
            updated.unitConflict.factor != null &&
            updated.unitConflict.targetUnit != null &&
            ing.unitConflict &&
            !ing.unitConflict.autoResolved &&
            ing.unitConflict.foreignUnit === updated.unitConflict.foreignUnit &&
            ing.unit === updated.unit
          ) {
            return {
              ...ing,
              reviewed: true,
              unitConflict: {
                ...ing.unitConflict,
                autoResolved: true,
                targetUnit: updated.unitConflict.targetUnit,
                factor: updated.unitConflict.factor,
              },
            } as ReviewIngredient;
          }

          // ── Propagate ingredient mapping ───────────────────────────────────
          if (
            ext.newItem == null && // not a "create new" resolution
            updated.match.groceryItemId &&
            (ing.match.status === "similar" || ing.match.status === "new")
          ) {
            // If the target ingredient also has a unit conflict for the same foreignUnit,
            // propagate just the match but keep the unit conflict unresolved
            if (ing.unitConflict && !ing.unitConflict.autoResolved) {
              return {
                ...ing,
                match: {
                  ...updated.match,
                  manuallyMapped: true,
                },
              } as ReviewIngredient;
            }
            // No unit conflict — fully resolve
            return {
              ...ing,
              reviewed: true,
              match: {
                ...updated.match,
                manuallyMapped: true,
              },
            } as ReviewIngredient;
          }

          return ing;
        }),
      }))
    );
  }

  // ── Toggle ingredient status în review (matched ↔ similar/to_resolve) ──────

  function handleIngredientToggle(ri: number, ii: number) {
    setRecipes((prev) =>
      prev.map((r, rIdx) => {
        if (rIdx !== ri) return r;
        return {
          ...r,
          ingredients: r.ingredients.map((ing, iIdx) => {
            if (iIdx !== ii) return ing;
            // matched → forțat similar (va apărea la resolve)
            // similar/new → matched (marcat ca ok)
            if (ing.match.status === "matched") {
              return { ...ing, match: { ...ing.match, status: "similar" as const } };
            } else {
              return { ...ing, match: { ...ing.match, status: "matched" as const } };
            }
          }),
        };
      })
    );
  }

  // ── Skip ingredient (scos din lista de conflicte, ignorat la import) ────────

  function handleSkipIngredient(ri: number, ii: number) {
    setRecipes((prev) =>
      prev.map((r, rIdx) => {
        if (rIdx !== ri) return r;
        return {
          ...r,
          ingredients: r.ingredients.map((ing, iIdx) => {
            if (iIdx !== ii) return ing;
            const ext = ing as ReviewIngredient & { skipped?: boolean };
            return { ...ext, skipped: true, match: { ...ing.match, status: "matched" as const } };
          }),
        };
      })
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
        ingredients: r.ingredients.filter((ing) => !(ing as IngredientExt).skipped).map((ing) => {
          const ext = ing as IngredientExt;

          // Apply unit conversion if needed
          let qty = ing.qty;
          let unit = ing.unit;
          const uc = ing.unitConflict;
          if (uc?.targetUnit && uc.factor != null) {
            // If addUnit2, keep original unit (foreignUnit becomes unit2 on the item)
            if (!ext.addUnit2) {
              qty = qty != null ? +(qty * uc.factor).toFixed(6) : null;
              unit = uc.targetUnit;
            }
            // Collect new rules (not previously auto-resolved from file, not unit2 additions)
            if (!uc.autoResolved && !ext.addUnit2) {
              newUnitRules.push({ name: ing.name, foreignUnit: uc.foreignUnit, targetUnit: uc.targetUnit, factor: uc.factor });
            }
          }

          const manuallyMapped = !!(ing.match as { manuallyMapped?: boolean }).manuallyMapped;
          return {
            name: ing.name,
            qty,
            unit,
            obs: ing.obs ?? null,
            groupName: ing.groupName,
            groupOrder: ing.groupOrder,
            order: ing.order,
            groceryItemId: ing.match.status === "matched" || ing.match.status === "similar"
              ? ing.match.groceryItemId
              : null,
            groceryItemName: manuallyMapped ? ing.match.groceryItemName : undefined,
            saveMapping: manuallyMapped || undefined,
            addUnit2: ext.addUnit2 || undefined,
            unit2Conversion: ext.addUnit2 ? (ext.unit2Conversion ?? undefined) : undefined,
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

  // All ingredients flat (for step 3 editor)
  const allIngredients: Array<{ ri: number; ii: number; ing: ReviewIngredient }> = [];
  validRecipes.forEach((r, ri) => {
    r.ingredients.forEach((ing, ii) => {
      allIngredients.push({ ri, ii, ing });
    });
  });

  // Conflict counts for navigation guard
  const conflictIngredients: Array<{ ri: number; ii: number; ing: ReviewIngredient }> = [];
  const unitConflictIngredients: Array<{ ri: number; ii: number; ing: ReviewIngredient }> = [];
  validRecipes.forEach((r, ri) => {
    r.ingredients.forEach((ing, ii) => {
      const ext = ing as IngredientExt;
      if (!ext.skipped) {
        if (
          (ing.match.status === "similar" && !ing.match.groceryItemId) ||
          (ing.match.status === "new" && !ext.newItem)
        ) {
          conflictIngredients.push({ ri, ii, ing });
        }
        if (ing.unitConflict && !ing.unitConflict.autoResolved) {
          unitConflictIngredients.push({ ri, ii, ing });
        }
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
                onIngredientToggle={(ii) => handleIngredientToggle(i, ii)}
                onBatchChange={(batch) => updateBatch(i, batch)}
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
                  {totalConflicts > 0 ? `Rezolvă ${totalConflicts} conflicte` : "Preview & import"}
                  <ArrowRight size={16} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3: All ingredients editor ───────────────────────────── */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-[#e3e3e3]">
                Verifică ingrediente
              </h2>
              <p className="text-sm text-gray-500 dark:text-[#787878] mt-0.5">
                {allIngredients.length} ingrediente · {totalConflicts > 0 ? `${totalConflicts} necesită atenție` : "toate rezolvate"}
              </p>
            </div>

            {allIngredients.map(({ ri, ii, ing }) => {
              const ext = ing as IngredientExt;
              const key = `${ri}-${ii}`;
              const isResolved = ext.skipped || ext.reviewed ||
                (ing.match.status === "matched" && (!ing.unitConflict || ing.unitConflict.autoResolved));

              // Matched + resolved → compact row (no full editor)
              if (isResolved && focusIngredientKey !== key) {
                const uc = ing.unitConflict;
                const dispQty = uc?.factor != null && ing.qty != null ? +(ing.qty * uc.factor).toFixed(4) : ing.qty;
                const dispUnit = uc?.targetUnit ?? ing.unit;
                const dispName = ext.newItem?.name ?? ing.match.groceryItemName ?? ing.name;
                return (
                  <div
                    key={key}
                    onClick={() => setFocusIngredientKey(focusIngredientKey === key ? null : key)}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-gray-100 dark:border-[#2a2a2a] bg-white dark:bg-[#1f1f1f] cursor-pointer hover:border-orange-300 dark:hover:border-orange-800 transition-colors select-none"
                  >
                    <span className="text-sm text-gray-700 dark:text-[#c0c0c0] min-w-0 truncate">
                      {dispQty != null && `${dispQty} `}{dispUnit && `${dispUnit} `}{dispName}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      {ext.skipped
                        ? <span className="text-xs text-gray-400 dark:text-[#555] line-through">skipped</span>
                        : <MatchBadge status={ing.match.status} reviewed={ext.reviewed} hasUnitConflict={!!uc && !uc.autoResolved} />
                      }
                      <ChevronDown size={13} className="text-gray-300 dark:text-[#444]" />
                    </div>
                  </div>
                );
              }

              // Needs review or focused → full editor
              // Count how many OTHER unresolved ingredients share the same name
              const sameNameCount = allIngredients.filter(({ ri: ri2, ii: ii2, ing: other }) => {
                if (ri2 === ri && ii2 === ii) return false;
                const otherExt = other as IngredientExt;
                if (otherExt.reviewed || otherExt.skipped) return false;
                return other.name.toLowerCase() === ing.name.toLowerCase();
              }).length;

              return (
                <ReviewRow
                  key={key}
                  recipeIndex={ri}
                  ingIndex={ii}
                  ing={ext}
                  recipes={validRecipes}
                  onUpdate={(ri2, ii2, updated) => {
                    updateIngredient(ri2, ii2, updated);
                    setFocusIngredientKey(null);
                  }}
                  onSkip={(ri2, ii2) => {
                    handleSkipIngredient(ri2, ii2);
                    setFocusIngredientKey(null);
                  }}
                  onCollapse={() => setFocusIngredientKey(null)}
                  focused={focusIngredientKey === key}
                  categories={groceryCategories}
                  sameNameCount={sameNameCount}
                />
              );
            })}

            {conflictIngredients.length > 0 && (
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-400 flex items-start gap-2">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>
                  Mai sunt <strong>{conflictIngredients.length} ingrediente nerezolvate</strong>. Mapează sau sari peste ele înainte de import.
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
                onClick={() => setStep(4)}
                disabled={conflictIngredients.length > 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Preview & import <ArrowRight size={16} />
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

        {/* Step 4: Preview + confirm */}
        {step === 4 && !importResult && (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-[#e3e3e3]">
                Preview rețete
              </h2>
              <p className="text-sm text-gray-500 dark:text-[#787878] mt-0.5">
                {validRecipes.length} rețete · {validRecipes.reduce((s, r) => s + r.ingredients.length, 0)} ingrediente · click pe ingredient pentru a edita
              </p>
            </div>

            {validRecipes.map((r, i) => (
              <div key={i} className="border border-gray-200 dark:border-[#2e2e2e] rounded-xl overflow-hidden bg-white dark:bg-[#1f1f1f]">
                {/* Recipe header */}
                <div className="px-4 py-3 bg-gray-50 dark:bg-[#252525] flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-sm text-gray-900 dark:text-[#e3e3e3]">{r.name}</h3>
                      {r.category && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400">{r.category}</span>
                      )}
                      {r.favorite && <span className="text-xs text-yellow-500">★</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-[#787878]">
                      {r.servings && <span>{r.servings} porții</span>}
                      {r.time && <span>{r.time} min</span>}
                      {r.difficulty && <span>{r.difficulty}</span>}
                      <span className={`px-1.5 py-0.5 rounded font-medium ${r.batch ? "bg-orange-100 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400" : "bg-gray-100 dark:bg-[#2a2a2a] text-gray-500 dark:text-[#787878]"}`}>
                        {r.batch ? "batch" : "per porție"}
                      </span>
                      {r.link && (
                        <a href={r.link} target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:underline flex items-center gap-0.5">
                          <Link2 size={10} /> sursă
                        </a>
                      )}
                    </div>
                  </div>
                  {r.image && (
                    <img src={r.image} className="w-12 h-12 rounded-lg object-cover shrink-0" alt="" />
                  )}
                </div>

                {/* Ingredients grouped */}
                {(() => {
                  const groups: Record<string, Array<{ ing: typeof r.ingredients[0]; ii: number }>> = {};
                  r.ingredients.forEach((ing, ii) => {
                    const key = ing.groupName ?? "Ingrediente";
                    (groups[key] = groups[key] ?? []).push({ ing, ii });
                  });
                  return (
                    <div className="px-4 py-3 space-y-3">
                      {/* Column headers: original din text vs. ce se importă */}
                      <div className="grid grid-cols-2 gap-2 pb-1.5 border-b border-gray-100 dark:border-[#2e2e2e]">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-[#555]">Din text</span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-[#555]">Se importă</span>
                      </div>
                      {Object.entries(groups).map(([gName, items]) => (
                        <div key={gName}>
                          <p className="text-xs font-semibold text-gray-500 dark:text-[#787878] uppercase tracking-wide mb-1">{gName}</p>
                          <div className="space-y-0.5">
                            {items.map(({ ing, ii }) => {
                              const ext = ing as IngredientExt;
                              const uc = ing.unitConflict;
                              // Apply unit conversion factor first, then batch/servings factor
                              const convertedQty = uc?.factor != null && ing.qty != null ? +(ing.qty * uc.factor).toFixed(4) : ing.qty;
                              const servingsDivisor = !r.batch && (r.servings ?? 1) > 1 ? (r.servings ?? 1) : 1;
                              const dispQty = convertedQty != null ? +(convertedQty / servingsDivisor).toFixed(4) : null;
                              const dispUnit = uc?.targetUnit ?? ing.unit;
                              const dispName = ext.newItem?.name ?? ing.match.groceryItemName ?? ing.name;
                              const needsReview = (ing.match.status !== "matched" || (!!uc && !uc.autoResolved)) && !ext.skipped && !ext.reviewed;
                              // Orice ingredient (inclusiv matched) poate fi deschis pentru ajustări
                              const canEdit = !ext.skipped;
                              // Diferențe între ce era în text și ce se importă
                              const qtyChanged = dispQty !== ing.qty;
                              const unitChanged = (dispUnit ?? null) !== (ing.unit ?? null);
                              const nameChanged = dispName.toLowerCase() !== ing.name.toLowerCase();
                              return (
                                <div
                                  key={ii}
                                  onClick={canEdit ? () => {
                                    setFocusIngredientKey(`${i}-${ii}`);
                                    setStep(3);
                                  } : undefined}
                                  className={`grid grid-cols-2 gap-2 items-center text-xs py-1 rounded px-1.5 -mx-1 ${ext.skipped ? "opacity-40 line-through" : ""} ${canEdit ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition-colors" : ""}`}
                                  title={canEdit ? "Click pentru a edita" : undefined}
                                >
                                  {/* Din text (original) */}
                                  <span className="min-w-0 truncate text-gray-400 dark:text-[#666] tabular-nums">
                                    {ing.qty != null && `${ing.qty} `}{ing.unit && `${ing.unit} `}
                                    <span className="text-gray-500 dark:text-[#787878]">{ing.name}</span>
                                    {ing.obs && <span className="text-gray-300 dark:text-[#555]"> · {ing.obs}</span>}
                                  </span>
                                  {/* Se importă (rezultat) */}
                                  <div className="min-w-0 flex items-center justify-between gap-2">
                                    <span className="min-w-0 truncate text-gray-700 dark:text-[#c0c0c0]">
                                      <span className={`tabular-nums ${qtyChanged || unitChanged ? "text-orange-600 dark:text-orange-400 font-medium" : ""}`}>
                                        {dispQty != null && `${dispQty} `}{dispUnit && `${dispUnit} `}
                                      </span>
                                      <span className={nameChanged ? "text-orange-600 dark:text-orange-400 font-medium" : needsReview ? "text-yellow-600 dark:text-yellow-400" : ""}>{dispName}</span>
                                    </span>
                                    {!ext.skipped && <MatchBadge status={ing.match.status} hasUnitConflict={!!uc && !uc.autoResolved} reviewed={ext.reviewed} />}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Instructions preview */}
                {r.instructions.length > 0 && (
                  <div className="border-t border-gray-100 dark:border-[#2e2e2e] px-4 py-3">
                    <p className="text-xs font-semibold text-gray-500 dark:text-[#787878] uppercase tracking-wide mb-2">Instrucțiuni</p>
                    <div className="space-y-1">
                      {r.instructions.slice(0, 4).map((inst, j) => (
                        inst.isSection
                          ? <p key={j} className="text-xs font-semibold text-gray-700 dark:text-[#c0c0c0] pt-1">{inst.text}</p>
                          : <p key={j} className="text-xs text-gray-600 dark:text-[#9a9a9a] leading-relaxed">{inst.text}</p>
                      ))}
                      {r.instructions.length > 4 && (
                        <p className="text-xs text-gray-400 dark:text-[#555]">... și încă {r.instructions.length - 4} pași</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {error && (
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-xl p-3 text-sm text-red-700 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setStep(totalConflicts > 0 ? 3 : 2)}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-[#787878] dark:hover:text-[#9a9a9a] transition-colors"
              >
                <ArrowLeft size={14} /> Înapoi
              </button>
              <button
                onClick={handleImport}
                disabled={loading}
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
