"use client";

import { useState } from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { deleteRecipes, updateRecipesBatch } from "@/lib/actions";
import RecipeBatchEditSheet from "./RecipeBatchEditSheet";

// Edit / Delete for the recipes picked in select mode. On phones it sits over the tab bar
// (a selection is a mode you finish before going elsewhere); from md up it floats at the
// bottom of the list. Delete asks right here first.
export default function RecipesSelectBar({
  ids, knownCategories, onDone,
}: {
  ids: string[];
  knownCategories: string[];
  onDone: (message: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = ids.length;
  const recipes = `${n} ${n === 1 ? "recipe" : "recipes"}`;

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await deleteRecipes(ids);
      if (res.error) {
        setError(res.error);
        return;
      }
      onDone(`${recipes} deleted`);
    } catch {
      setError("Couldn't delete. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  const btn =
    "flex-1 h-[52px] rounded-[14px] border border-gray-200 dark:border-[#3a352e] bg-[var(--color-bg-base)] text-[15px] font-bold flex items-center justify-center gap-2 disabled:opacity-45";

  return (
    <>
      <div
        className="fixed inset-x-0 bottom-0 z-50 px-4 pt-2.5 border-t border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] md:sticky md:bottom-4 md:z-30 md:mt-4 md:ml-auto md:max-w-md md:p-3 md:border md:rounded-2xl md:shadow-lg"
        style={{ paddingBottom: "max(1.375rem, env(safe-area-inset-bottom))" }}
      >
        {confirming && n > 0 ? (
          <div className="p-3.5 rounded-[14px] bg-red-50 dark:bg-red-500/10" role="alertdialog" aria-labelledby="bulk-delete-q">
            <p id="bulk-delete-q" className="text-[15px] font-semibold text-gray-900 dark:text-[#eae5de]">
              Delete {recipes} for both of you?
            </p>
            <p className="mt-1 mb-3 text-sm text-gray-600 dark:text-[#a49c90]">
              They also disappear from every week they were planned in. This can&apos;t be undone.
            </p>
            {error && <p role="alert" className="mb-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setConfirming(false); setError(null); }}
                disabled={deleting}
                className="flex-1 h-12 rounded-xl border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-[15px] font-semibold text-gray-900 dark:text-[#eae5de]"
              >
                Keep them
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[15px] font-bold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {deleting && <Loader2 size={16} className="animate-spin" aria-hidden />}
                Delete {n}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex gap-2.5">
              <button type="button" onClick={() => setEditing(true)} disabled={n === 0} className={`${btn} text-gray-900 dark:text-[#eae5de]`}>
                <Pencil size={18} aria-hidden /> Edit
              </button>
              <button type="button" onClick={() => setConfirming(true)} disabled={n === 0} className={`${btn} text-red-600 dark:text-red-400`}>
                <Trash2 size={18} aria-hidden /> Delete
              </button>
            </div>
            {n === 0 && <p className="mt-2 text-center text-[13px] text-gray-600 dark:text-[#a49c90]">Tap recipes to select them</p>}
          </>
        )}
      </div>

      {editing && n > 0 && (
        <RecipeBatchEditSheet
          count={n}
          knownCategories={knownCategories}
          onClose={() => setEditing(false)}
          onApply={async (patch) => {
            await updateRecipesBatch(ids, patch);
            setEditing(false);
            onDone(`${recipes} updated`);
          }}
        />
      )}
    </>
  );
}
