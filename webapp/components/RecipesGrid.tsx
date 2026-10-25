"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Star, Trash2, Clock, Pencil, Check, X } from "lucide-react";
import RecipeCover from "./RecipeCover";
import { deleteRecipes, updateRecipesBatch, type RecipeBatchPatch, type RecipeListItem } from "@/lib/actions";
import { categoryLabel } from "@/lib/labels";
import RecipeBatchEditModal from "./RecipeBatchEditModal";

export type RecipesLayout = "list" | "grid";

type Recipe = Pick<RecipeListItem, "id" | "name" | "category" | "imageUrl" | "favorite" | "time">;

export function recipeCategories(category: string | null): string[] {
  return (category ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

// "Lunch · 25 min" — the first category and the time, whichever exist.
export function recipeMeta(r: Recipe): string {
  const cat = recipeCategories(r.category)[0];
  return [cat ? categoryLabel(cat) : null, r.time ? `${r.time} min` : null].filter(Boolean).join(" · ");
}

// Cover photo, or the recipe's initial on a tinted tile when it has none. Sized by `className`.
export function RecipeThumb({
  recipe, sizes, className, initialClass,
}: { recipe: Recipe; sizes: string; className: string; initialClass: string }) {
  const src = recipe.imageUrl;
  const [broken, setBroken] = useState(false);
  return (
    <div className={`relative overflow-hidden bg-gray-100 dark:bg-[#2e2a24] ${className}`}>
      {src && !broken && (src.startsWith("/") || src.startsWith("http")) ? (
        <RecipeCover src={src} alt="" sizes={sizes} onError={() => setBroken(true)} />
      ) : (
        <span
          aria-hidden
          className={`absolute inset-0 flex items-center justify-center font-[family-name:var(--font-serif)] text-orange-600 dark:text-orange-400 ${initialClass}`}
        >
          {recipe.name.charAt(0)}
        </span>
      )}
    </div>
  );
}

function SelectBadge({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`absolute top-1.5 left-1.5 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
        on ? "bg-orange-500 border-orange-500 text-white" : "bg-black/30 border-white"
      }`}
    >
      {on && <Check size={14} strokeWidth={3} />}
    </span>
  );
}

export default function RecipesGrid({
  recipes, layout, selectMode, onExitSelect,
}: { recipes: RecipeListItem[]; layout: RecipesLayout; selectMode: boolean; onExitSelect: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Leaving select mode drops the selection (adjusting state during render, not in an effect).
  if (!selectMode && (selected.size > 0 || confirmDelete || showEdit)) {
    setSelected(new Set());
    setConfirmDelete(false);
    setShowEdit(false);
  }

  // Category tags on the current list — merged with the defaults in the batch modal so its
  // chip picker offers what's actually in use.
  const knownCategories = [...new Set(recipes.flatMap((r) => recipeCategories(r.category)))];

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(selected.size === recipes.length ? new Set() : new Set(recipes.map((r) => r.id)));
  }

  function handleDelete() {
    setDeleteError(null);
    startTransition(async () => {
      try {
        const res = await deleteRecipes([...selected]);
        if (res.error) { setDeleteError(res.error); return; }
        setSelected(new Set());
        setConfirmDelete(false);
        router.refresh();
      } catch {
        setDeleteError("Couldn't delete. Please try again.");
      }
    });
  }

  // Runs inside the modal's try/catch — it rethrows on failure so the modal keeps
  // itself open and shows an error (shared data → no false "saved").
  async function handleBatchApply(patch: RecipeBatchPatch) {
    await updateRecipesBatch([...selected], patch);
    onExitSelect();
    router.refresh();
  }

  // In select mode a tap toggles the recipe instead of opening it.
  function tile(r: RecipeListItem, className: string, children: ReactNode) {
    if (!selectMode) {
      return <Link href={`/recipes/${r.id}`} className={className}>{children}</Link>;
    }
    return (
      <button type="button" aria-pressed={selected.has(r.id)} onClick={() => toggleSelect(r.id)} className={`${className} text-left`}>
        {children}
      </button>
    );
  }

  const toolBtn = "h-10 px-3 inline-flex items-center gap-1.5 text-sm font-medium rounded-xl border transition-colors";

  return (
    <div>
      {selectMode && (
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleAll}
              className="h-10 text-sm font-medium text-orange-700 dark:text-orange-400"
            >
              {selected.size === recipes.length && recipes.length > 0 ? "Deselect all" : `Select all (${recipes.length})`}
            </button>
            <span className="text-sm text-gray-500 dark:text-[#a49c90]">{selected.size} selected</span>
          </div>
          <div className="flex items-center gap-2">
            {selected.size > 0 && !confirmDelete && (
              <>
                <button
                  type="button"
                  onClick={() => setShowEdit(true)}
                  className={`${toolBtn} text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900`}
                >
                  <Pencil size={14} /> Edit {selected.size}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className={`${toolBtn} text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900`}
                >
                  <Trash2 size={14} /> Delete {selected.size}
                </button>
              </>
            )}
            {selected.size > 0 && confirmDelete && (
              <>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isPending}
                  className={`${toolBtn} text-white bg-red-600 hover:bg-red-700 border-red-600 disabled:opacity-50`}
                >
                  {isPending ? "Deleting…" : `Delete ${selected.size} for good`}
                </button>
                <button
                  type="button"
                  onClick={() => { setConfirmDelete(false); setDeleteError(null); }}
                  className="h-10 px-2 text-sm text-gray-600 dark:text-[#a49c90]"
                >
                  Cancel
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onExitSelect}
              aria-label="Exit selection"
              className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-500 dark:text-[#a49c90] hover:bg-gray-100 dark:hover:bg-[#2a2620]"
            >
              <X size={18} />
            </button>
          </div>
          {deleteError && <p className="w-full text-sm text-red-600 dark:text-red-400">{deleteError}</p>}
        </div>
      )}

      {layout === "list" ? (
        <ul className="md:grid md:grid-cols-2 xl:grid-cols-3 md:gap-x-6">
          {recipes.map((r) => {
            const on = selected.has(r.id);
            const cat = recipeCategories(r.category)[0];
            return (
              <li key={r.id}>
                {tile(
                  r,
                  `w-[calc(100%+1rem)] flex items-center gap-3.5 -mx-2 px-2 py-2.5 rounded-2xl transition-colors ${
                    on ? "bg-orange-50 dark:bg-orange-500/10" : "hover:bg-gray-50 active:bg-gray-100 dark:hover:bg-[#24211c] dark:active:bg-[#24211c]"
                  }`,
                  <>
                    <div className="relative shrink-0">
                      <RecipeThumb recipe={r} sizes="68px" className="w-[68px] h-[68px] rounded-[14px]" initialClass="text-[28px]" />
                      {selectMode && <SelectBadge on={on} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-semibold leading-snug line-clamp-2 text-gray-900 dark:text-[#eae5de]">{r.name}</p>
                      {(cat || r.time) && (
                        <p className="mt-1 flex items-center gap-3 text-[13px] text-gray-600 dark:text-[#a49c90]">
                          {cat && <span className="truncate">{categoryLabel(cat)}</span>}
                          {r.time ? (
                            <span className="flex items-center gap-1 shrink-0">
                              <Clock size={14} aria-hidden /> {r.time} min
                            </span>
                          ) : null}
                        </p>
                      )}
                    </div>
                    {r.favorite && (
                      <>
                        <Star size={18} aria-hidden className="shrink-0 text-orange-600 dark:text-orange-400 fill-current" />
                        <span className="sr-only">Favorite</span>
                      </>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-3 gap-y-[18px]">
          {recipes.map((r) => {
            const on = selected.has(r.id);
            const meta = recipeMeta(r);
            return (
              <li key={r.id} className="min-w-0">
                {tile(
                  r,
                  "w-full flex flex-col gap-2 group",
                  <>
                    <div className={`relative rounded-[18px] ${on ? "ring-2 ring-orange-500 ring-offset-2 ring-offset-[var(--color-bg-base)]" : ""}`}>
                      <RecipeThumb
                        recipe={r}
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                        className="w-full h-[168px] rounded-[18px]"
                        initialClass="text-5xl"
                      />
                      {r.favorite && (
                        <span className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 text-orange-300 flex items-center justify-center">
                          <Star size={16} aria-hidden className="fill-current" />
                          <span className="sr-only">Favorite</span>
                        </span>
                      )}
                      {selectMode && <SelectBadge on={on} />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold leading-snug line-clamp-2 text-gray-900 dark:text-[#eae5de] group-hover:text-orange-700 dark:group-hover:text-orange-400 transition-colors">
                        {r.name}
                      </p>
                      {meta && <p className="mt-1 text-xs text-gray-600 dark:text-[#a49c90]">{meta}</p>}
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {showEdit && selected.size > 0 && (
        <RecipeBatchEditModal
          count={selected.size}
          knownCategories={knownCategories}
          onClose={() => setShowEdit(false)}
          onApply={handleBatchApply}
        />
      )}
    </div>
  );
}
