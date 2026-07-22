"use client";

import { useState } from "react";
import { X, Star, Loader2 } from "lucide-react";
import { categoryLabel, difficultyLabel } from "@/lib/labels";
import type { RecipeBatchPatch } from "@/lib/actions";

// Same base list as RecipeForm (small domain constant is duplicated by convention,
// like CATEGORY_COLORS across the grid/planner). Extra tags present on the current
// recipes are merged in via `knownCategories`.
const CATEGORIES = [
  "Breakfast", "Lunch", "Dinner", "Snack",
  "Smoothie", "Smoothie Bowl", "Soup", "High Protein", "Receipt", "Extra",
];
const DIFFICULTIES = ["Easy", "Moderate", "Hard"];

type CatMode = "replace" | "add" | "remove";

// A field row: a checkbox that gates whether this field is applied, plus its control.
// Disabled controls are dimmed and excluded from the patch.
function FieldRow({
  label,
  enabled,
  onToggle,
  children,
}: {
  label: string;
  enabled: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="py-3 border-b border-gray-100 dark:border-[#2e2a24] last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2.5 mb-2 group"
      >
        <span
          className={`w-6 h-6 shrink-0 rounded-md border-2 flex items-center justify-center transition-colors ${
            enabled ? "bg-orange-500 border-orange-500" : "border-gray-300 dark:border-[#5c554b]"
          }`}
        >
          {enabled && (
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 10 8">
              <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
        <span className={`text-sm font-medium ${enabled ? "text-gray-900 dark:text-[#eae5de]" : "text-gray-400 dark:text-[#7c756a]"}`}>
          {label}
        </span>
      </button>
      <div className={enabled ? "" : "opacity-40 pointer-events-none"}>{children}</div>
    </div>
  );
}

export default function RecipeBatchEditModal({
  count,
  knownCategories,
  onClose,
  onApply,
}: {
  count: number;
  knownCategories: string[];
  onClose: () => void;
  onApply: (patch: RecipeBatchPatch) => Promise<void>;
}) {
  const [enFav, setEnFav] = useState(false);
  const [favorite, setFavorite] = useState(true);

  const [enTime, setEnTime] = useState(false);
  const [time, setTime] = useState("");

  const [enDiff, setEnDiff] = useState(false);
  const [difficulty, setDifficulty] = useState("Easy");

  const [enCats, setEnCats] = useState(false);
  const [catMode, setCatMode] = useState<CatMode>("add");
  const [cats, setCats] = useState<string[]>([]);

  const [enLink, setEnLink] = useState(false);
  const [link, setLink] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allCats = [...CATEGORIES, ...knownCategories.filter((c) => !CATEGORIES.includes(c))];
  const anyEnabled = enFav || enTime || enDiff || enCats || enLink;

  function toggleCat(c: string) {
    setCats((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  function buildPatch(): RecipeBatchPatch {
    const patch: RecipeBatchPatch = {};
    if (enFav) patch.favorite = favorite;
    if (enTime) {
      const t = parseInt(time, 10);
      patch.time = Number.isFinite(t) && t > 0 ? t : null;
    }
    if (enDiff) patch.difficulty = difficulty || null;
    if (enCats) patch.categories = { mode: catMode, values: cats };
    if (enLink) patch.link = link.trim() || null;
    return patch;
  }

  async function apply() {
    if (!anyEnabled) return;
    setSaving(true);
    setError(null);
    try {
      await onApply(buildPatch());
      onClose();
    } catch {
      // Keep the modal open, show the error, stop the spinner — shared data, no false success.
      setError("Couldn't apply the changes. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full px-3 py-2.5 border border-gray-200 dark:border-[#3a352e] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white dark:bg-[#24211c] text-gray-900 dark:text-[#eae5de] placeholder:text-gray-400 dark:placeholder:text-[#5c554b]";

  return (
    <div
      className="fixed inset-0 bg-black/30 dark:bg-black/50 flex items-end sm:items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <div className="bg-white dark:bg-[#24211c] rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md flex flex-col max-h-[90svh] sm:max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 shrink-0 border-b border-gray-100 dark:border-[#2e2a24]">
          <h3 className="font-semibold text-gray-900 dark:text-[#eae5de]">
            Edit {count} {count === 1 ? "recipe" : "recipes"}
          </h3>
          <button
            onClick={() => !saving && onClose()}
            aria-label="Close"
            className="text-gray-400 dark:text-[#5c554b] hover:text-gray-600 dark:hover:text-[#a49c90] p-3 -mr-2"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4">
          <p className="text-xs text-gray-400 dark:text-[#5c554b] pt-3">
            Only the fields you enable are changed. The rest stay as they are on each recipe.
          </p>

          {/* Favorite */}
          <FieldRow label="Favorite" enabled={enFav} onToggle={() => setEnFav((v) => !v)}>
            <div className="flex gap-2">
              {[{ v: true, l: "★ Favorite" }, { v: false, l: "Not favorite" }].map(({ v, l }) => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => setFavorite(v)}
                  className={`flex-1 px-3 py-2.5 text-sm rounded-lg border transition-colors flex items-center justify-center gap-1.5 ${
                    favorite === v
                      ? "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800/50 text-amber-700 dark:text-amber-300 font-medium"
                      : "border-gray-200 dark:border-[#3a352e] text-gray-600 dark:text-[#a49c90]"
                  }`}
                >
                  {v && <Star size={13} className="fill-amber-400 text-amber-400" />}
                  {l}
                </button>
              ))}
            </div>
          </FieldRow>

          {/* Time */}
          <FieldRow label="Time (min)" enabled={enTime} onToggle={() => setEnTime((v) => !v)}>
            <input
              inputMode="decimal"
              type="number"
              min="1"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              placeholder="e.g. 30 — leave empty to clear"
              style={{ fontSize: "16px" }}
              className={inputCls}
            />
          </FieldRow>

          {/* Difficulty */}
          <FieldRow label="Difficulty" enabled={enDiff} onToggle={() => setEnDiff((v) => !v)}>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              style={{ fontSize: "16px" }}
              className={inputCls}
            >
              <option value="">— (clear)</option>
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>{difficultyLabel(d)}</option>
              ))}
            </select>
          </FieldRow>

          {/* Categories */}
          <FieldRow label="Categories" enabled={enCats} onToggle={() => setEnCats((v) => !v)}>
            <div className="flex gap-1.5 mb-2.5">
              {(["add", "remove", "replace"] as CatMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setCatMode(m)}
                  className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-lg border capitalize transition-colors ${
                    catMode === m
                      ? "bg-orange-500 text-white border-orange-500"
                      : "bg-white dark:bg-[#24211c] border-gray-200 dark:border-[#3a352e] text-gray-600 dark:text-[#a49c90]"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 dark:text-[#5c554b] mb-2">
              {catMode === "add" && "Adds the selected tags, keeping existing ones."}
              {catMode === "remove" && "Removes the selected tags if present."}
              {catMode === "replace" && "Replaces all tags with the selected ones (empty clears them)."}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {allCats.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCat(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    cats.includes(cat)
                      ? "bg-orange-500 text-white"
                      : "bg-gray-100 dark:bg-[#2a2620] text-gray-600 dark:text-[#a49c90] hover:bg-gray-200 dark:hover:bg-[#322e28]"
                  }`}
                >
                  {categoryLabel(cat)}
                </button>
              ))}
            </div>
          </FieldRow>

          {/* Source URL */}
          <FieldRow label="Source URL" enabled={enLink} onToggle={() => setEnLink((v) => !v)}>
            <input
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://…  — leave empty to clear"
              style={{ fontSize: "16px" }}
              className={inputCls}
            />
          </FieldRow>
        </div>

        {/* Footer */}
        {error && (
          <p className="px-4 pt-2 text-xs text-red-600 dark:text-red-400 text-center shrink-0">{error}</p>
        )}
        <div
          className="px-4 pt-3 border-t border-gray-100 dark:border-[#2e2a24] shrink-0 flex items-center gap-3"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <button
            onClick={() => !saving && onClose()}
            className="px-4 py-2.5 text-sm text-gray-600 dark:text-[#a49c90] hover:text-gray-800 dark:hover:text-[#d8d0c4] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={apply}
            disabled={!anyEnabled || saving}
            className="ml-auto px-4 py-2.5 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-40 transition-colors flex items-center gap-1.5"
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            Apply to {count}
          </button>
        </div>
      </div>
    </div>
  );
}
