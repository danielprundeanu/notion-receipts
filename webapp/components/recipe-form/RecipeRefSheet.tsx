"use client";

import { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { searchRecipesForPlanner } from "@/lib/actions";
import { Sheet, fieldCls, hintCls, labelCls, pillCls, pillOff, pillOn, uid, type RecipeRefRow } from "./ui";

// Add or edit another recipe used inside this one (a pesto in a pasta): which one and how much.
export default function RecipeRefSheet({
  row,
  excludeIds,
  onSave,
  onRemove,
  onClose,
}: {
  row: RecipeRefRow | null; // null = adding a new one
  excludeIds: string[];
  onSave: (row: RecipeRefRow) => void;
  onRemove?: () => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(
    row?.refRecipeId ? { id: row.refRecipeId, name: row.name } : null
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string }[] | null>(null);
  const [searchFailed, setSearchFailed] = useState(false);
  const [amount, setAmount] = useState(row?.quantity ?? "1");
  const [unit, setUnit] = useState<RecipeRefRow["unit"]>(row?.unit ?? "serving");
  const [error, setError] = useState<string | null>(null);

  const q = query.trim();
  const searching = !picked && q.length > 0;
  useEffect(() => {
    if (!searching) return;
    const t = setTimeout(async () => {
      try {
        const r = await searchRecipesForPlanner(q);
        setResults(r.filter((x) => !excludeIds.includes(x.id)));
        setSearchFailed(false);
      } catch {
        setSearchFailed(true);
      }
    }, 250);
    return () => clearTimeout(t);
    // excludeIds is rebuilt on every render of the form; the query drives the search
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, searching]);

  function save() {
    if (!picked) {
      setError("Pick the recipe first.");
      return;
    }
    if (!(parseFloat(amount.replace(",", ".")) > 0)) {
      setError(`Set how much of “${picked.name}” goes in.`);
      return;
    }
    onSave({ id: row?.id ?? uid(), refRecipeId: picked.id, name: picked.name, quantity: amount, unit });
  }

  return (
    <Sheet title={row ? "Recipe used here" : "Add another recipe"} onClose={onClose}>
      {/* Enter (or the keyboard's Go) adds it, like the button */}
      <form onSubmit={(e) => { e.preventDefault(); save(); }}>
        <p className={`mt-1 ${hintCls}`}>Its ingredients count towards this one: a pesto in a pasta, a dressing in a salad.</p>

        <span className={labelCls}>Recipe</span>
        {picked ? (
          <div className="flex items-center gap-2 min-h-12 px-3.5 rounded-xl border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c]">
            <span className="flex-1 min-w-0 truncate text-base font-semibold text-gray-900 dark:text-[#eae5de]">{picked.name}</span>
            <button
              type="button"
              onClick={() => { setPicked(null); setQuery(""); setResults(null); }}
              className="h-11 px-2 -mr-2 text-sm font-semibold text-orange-700 dark:text-orange-400"
            >
              Change
            </button>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 dark:text-[#a49c90]" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your recipes"
                aria-label="Search your recipes"
                autoComplete="off"
                autoFocus
                className={`${fieldCls} pl-11`}
              />
            </div>
            {searching && (
              <div className="mt-2 rounded-xl border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] max-h-56 overflow-y-auto">
                {searchFailed ? (
                  <p className="px-3.5 py-3 text-sm text-red-600 dark:text-red-400">Search failed. Keep typing to try again.</p>
                ) : results === null ? (
                  <p className="px-3.5 py-3 text-sm text-gray-500 dark:text-[#a49c90] flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" aria-hidden /> Searching…
                  </p>
                ) : results.length === 0 ? (
                  <p className="px-3.5 py-3 text-sm text-gray-500 dark:text-[#a49c90]">No recipes found</p>
                ) : (
                  results.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => { setPicked(r); setError(null); }}
                      className="w-full text-left px-3.5 py-3 text-[15px] text-gray-800 dark:text-[#d8d0c4] border-t first:border-t-0 border-gray-100 dark:border-[#2e2a24]"
                    >
                      {r.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </>
        )}

        <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3">
          <div>
            <label className={labelCls} htmlFor="ref-amount">Amount</label>
            <input
              id="ref-amount"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => { setAmount(e.target.value.replace(/[^\d.,]/g, "")); setError(null); }}
              placeholder={unit === "g" ? "300" : "1"}
              className={fieldCls}
            />
          </div>
          <div>
            <span className={labelCls}>Unit</span>
            <div className="flex gap-1.5">
              {(["serving", "g"] as const).map((u) => (
                <button key={u} type="button" onClick={() => setUnit(u)} aria-pressed={unit === u} className={`${pillCls} ${unit === u ? pillOn : pillOff}`}>
                  {u === "serving" ? "servings" : "g"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="mt-5 flex gap-2.5">
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="h-[52px] px-[18px] rounded-[14px] border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-[15px] font-bold text-red-600 dark:text-red-400"
            >
              Remove
            </button>
          )}
          <button
            type="submit"
            className="flex-1 h-[52px] rounded-[14px] bg-orange-500 hover:bg-orange-600 text-white text-base font-bold transition-colors"
          >
            {row ? "Done" : "Add"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
