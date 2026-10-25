"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { categoryLabel, difficultyLabel } from "@/lib/labels";
import type { RecipeBatchPatch } from "@/lib/actions";
import { Segmented, Sheet } from "@/components/Sheet";

// Same base list as RecipeForm (small domain constant is duplicated by convention).
// Extra tags present on the current recipes are merged in via `knownCategories`.
const CATEGORIES = [
  "Breakfast", "Lunch", "Dinner", "Snack",
  "Smoothie", "Smoothie Bowl", "Soup", "High Protein", "Receipt", "Extra",
];

type CatMode = "add" | "remove" | "replace";
const CAT_HINTS: Record<CatMode, string> = {
  add: "Adds the ones you pick and keeps the rest.",
  remove: "Takes the ones you pick off, if they're there.",
  replace: "Sets exactly the ones you pick. None picked clears them.",
};

// Edit several recipes at once. Every field starts at "As is": only what's changed here is
// written, so each recipe keeps its own value for everything else.
export default function RecipeBatchEditSheet({
  count, knownCategories, onClose, onApply,
}: {
  count: number;
  knownCategories: string[];
  onClose: () => void;
  onApply: (patch: RecipeBatchPatch) => Promise<void>;
}) {
  const [time, setTime] = useState("");
  const [favorite, setFavorite] = useState<"keep" | "yes" | "no">("keep");
  const [difficulty, setDifficulty] = useState<string>("keep");
  const [catMode, setCatMode] = useState<CatMode>("add");
  const [cats, setCats] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allCats = [...CATEGORIES, ...knownCategories.filter((c) => !CATEGORIES.includes(c))];
  const minutes = parseInt(time, 10);

  const patch: RecipeBatchPatch = {};
  if (minutes > 0) patch.time = minutes;
  if (favorite !== "keep") patch.favorite = favorite === "yes";
  if (difficulty !== "keep") patch.difficulty = difficulty;
  if (cats.length > 0 || catMode === "replace") patch.categories = { mode: catMode, values: cats };
  const changed = Object.keys(patch).length > 0;

  async function apply() {
    if (!changed) return;
    setSaving(true);
    setError(null);
    try {
      await onApply(patch);
    } catch {
      // Keep the sheet open with an error — shared data, no false "saved".
      setError("Couldn't apply the changes. Please try again.");
      setSaving(false);
    }
  }

  const label = "block mt-3.5 mb-1.5 text-sm font-semibold text-gray-900 dark:text-[#eae5de]";
  const recipes = `${count} ${count === 1 ? "recipe" : "recipes"}`;

  return (
    <Sheet title={`Edit ${recipes}`} onClose={onClose} escapeCloses={!saving}>
      <p className="mt-1 text-[13px] leading-[1.45] text-gray-600 dark:text-[#a49c90]">
        Only what you change here is applied. The rest stays as each recipe has it.
      </p>

      <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3">
        <div>
          <label className={label} htmlFor="batch-time">Time</label>
          <div className="relative">
            <input
              id="batch-time"
              inputMode="numeric"
              autoComplete="off"
              value={time}
              onChange={(e) => setTime(e.target.value.replace(/\D/g, ""))}
              placeholder="As is"
              className="w-full h-12 pl-3.5 pr-10 rounded-xl border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-base text-gray-900 dark:text-[#eae5de] placeholder:text-gray-500 dark:placeholder:text-[#8f877b] focus:outline-none focus:border-orange-500"
            />
            <span aria-hidden className="absolute right-3 top-3.5 text-[15px] text-gray-600 dark:text-[#a49c90]">min</span>
          </div>
        </div>
        <div className="min-w-0">
          <span className={label}>Favorite</span>
          <Segmented
            label="Favorite"
            options={[{ value: "keep", label: "As is" }, { value: "yes", label: "Yes" }, { value: "no", label: "No" }]}
            value={favorite}
            onChange={(v) => v && setFavorite(v)}
          />
        </div>
      </div>

      <span className={label}>Difficulty</span>
      <Segmented
        label="Difficulty"
        options={[{ value: "keep", label: "As is" }, ...["Easy", "Moderate", "Hard"].map((d) => ({ value: d, label: difficultyLabel(d) }))]}
        value={difficulty}
        onChange={(v) => v && setDifficulty(v)}
      />

      <span className={label}>Categories</span>
      <Segmented
        label="What to do with the categories"
        options={[{ value: "add", label: "Add" }, { value: "remove", label: "Remove" }, { value: "replace", label: "Replace" }]}
        value={catMode}
        onChange={(v) => v && setCatMode(v)}
      />
      <div className="mt-2.5 flex flex-wrap gap-2">
        {allCats.map((c) => {
          const on = cats.includes(c);
          return (
            <button
              key={c}
              type="button"
              aria-pressed={on}
              onClick={() => setCats((prev) => (on ? prev.filter((x) => x !== c) : [...prev, c]))}
              className={`h-10 px-3.5 rounded-full border text-sm font-medium transition-colors ${
                on
                  ? "bg-orange-700 border-orange-700 text-white dark:bg-orange-500 dark:border-orange-500 dark:text-[#1a1714]"
                  : "bg-white dark:bg-[#24211c] border-gray-200 dark:border-[#3a352e] text-gray-600 dark:text-[#a49c90]"
              }`}
            >
              {categoryLabel(c)}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[13px] text-gray-600 dark:text-[#a49c90]">{CAT_HINTS[catMode]}</p>

      {error && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="mt-5 flex gap-2.5">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="h-[52px] px-5 rounded-[14px] border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-[15px] font-bold text-gray-900 dark:text-[#eae5de]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={apply}
          disabled={!changed || saving}
          className="flex-1 h-[52px] rounded-[14px] bg-orange-700 hover:bg-orange-800 text-white dark:bg-orange-500 dark:hover:bg-orange-400 dark:text-[#1a1714] text-base font-bold flex items-center justify-center gap-2 disabled:opacity-45 transition-colors"
        >
          {saving && <Loader2 size={18} className="animate-spin" aria-hidden />}
          {changed ? `Apply to ${count}` : "Nothing changed yet"}
        </button>
      </div>
    </Sheet>
  );
}
