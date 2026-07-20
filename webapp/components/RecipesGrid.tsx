"use client";

import { useState, useEffect, useTransition, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import { Star, Trash2, Clock, ChevronRight } from "lucide-react";
import { deleteRecipes } from "@/lib/actions";
import { useRouter } from "next/navigation";

type Recipe = {
  id: string;
  name: string;
  category: string | null;
  imageUrl: string | null;
  favorite: boolean;
  servings: number | null;
  time: number | null;
  difficulty: string | null;
};

const CATEGORY_COLORS: Record<string, string> = {
  Breakfast:       "bg-yellow-100 text-yellow-700 dark:bg-[#3f3217] dark:text-yellow-300",
  Lunch:           "bg-green-100  text-green-700  dark:bg-[#1b3725] dark:text-green-300",
  Dinner:          "bg-blue-100   text-blue-700   dark:bg-[#1e2a45] dark:text-blue-300",
  Snack:           "bg-purple-100 text-purple-700 dark:bg-[#342045] dark:text-purple-300",
  Smoothie:        "bg-pink-100   text-pink-700   dark:bg-[#421e2e] dark:text-pink-300",
  "Smoothie Bowl": "bg-pink-100   text-pink-700   dark:bg-[#421e2e] dark:text-pink-300",
  Soup:            "bg-orange-100 text-orange-700 dark:bg-[#452819] dark:text-orange-300",
  "High Protein":  "bg-red-100    text-red-700    dark:bg-[#421e1e] dark:text-red-300",
};

type ViewMode = "grid" | "grid2" | "list";
function subscribeView(cb: () => void) {
  window.addEventListener("viewchange", cb);
  return () => window.removeEventListener("viewchange", cb);
}
function getViewSnapshot(): ViewMode {
  return (localStorage.getItem("recipesView") as ViewMode) || "grid";
}

// next/image throws at render for any remote host not in next.config remotePatterns —
// and since the grid maps every recipe, one bad host would crash the WHOLE list. Local
// paths and Vercel Blob URLs are configured/safe; anything else remote falls back to a
// plain <img> so it renders (unoptimized) instead of taking the page down.
function isOptimizableSrc(url: string): boolean {
  return url.startsWith("/") || url.includes(".public.blob.vercel-storage.com");
}

function RecipeCover({ src, alt, sizes }: { src: string; alt: string; sizes: string }) {
  if (isOptimizableSrc(src)) {
    return <Image src={src} alt={alt} fill sizes={sizes} className="object-cover" loading="lazy" />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />;
}

export default function RecipesGrid({ recipes }: { recipes: Recipe[] }) {
  // View is an external store (localStorage + SortSelect's "viewchange" event), so it's
  // correct on mount without an event-timing race or a hydration mismatch.
  const view = useSyncExternalStore(subscribeView, getViewSnapshot, () => "grid" as ViewMode);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [selectMode, setSelectMode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Select mode is toggled from the filter bar (SortSelect) via a window event.
  // When it turns off, drop the current selection.
  useEffect(() => {
    function onSel(e: Event) {
      const v = (e as CustomEvent<boolean>).detail;
      setSelectMode(v);
      if (!v) { setSelected(new Set()); setConfirmDelete(false); }
    }
    window.addEventListener("selectmodechange", onSel);
    return () => window.removeEventListener("selectmodechange", onSel);
  }, []);

  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === recipes.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(recipes.map((r) => r.id)));
    }
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteRecipes([...selected]);
      setSelected(new Set());
      setConfirmDelete(false);
      router.refresh();
    });
  }

  const isSelecting = selected.size > 0;

  return (
    <div>
      {/* Toolbar — visible in select mode or when items are selected */}
      {(selectMode || isSelecting) && (
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleAll}
              className="text-xs text-gray-500 dark:text-[#7c756a] hover:text-gray-700 dark:hover:text-[#bab2a6] transition-colors"
            >
              {selected.size === recipes.length && recipes.length > 0 ? "Deselectează tot" : `Selectează tot (${recipes.length})`}
            </button>
            <span className="text-xs text-gray-400 dark:text-[#5c554b]">{selected.size} selectate</span>
          </div>
          <div className="flex items-center gap-2">
            {selected.size > 0 && !confirmDelete && (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg transition-colors"
              >
                <Trash2 size={13} /> Șterge {selected.size}
              </button>
            )}
            {selected.size > 0 && confirmDelete && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-[#7c756a]">Ești sigur?</span>
                <button
                  onClick={handleDelete}
                  disabled={isPending}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isPending ? "Se șterge…" : "Șterge definitiv"}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 dark:text-[#7c756a] dark:hover:text-[#bab2a6] transition-colors"
                >
                  Anulează
                </button>
              </div>
            )}
            <button
              onClick={() => { setSelected(new Set()); setConfirmDelete(false); window.dispatchEvent(new CustomEvent("selectmodechange", { detail: false })); }}
              className="text-xs text-gray-400 dark:text-[#5c554b] hover:text-gray-600 dark:hover:text-[#7c756a] transition-colors"
              title="Ieși din selecție"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Grid view — 1 col mobile */}
      {view === "grid" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {recipes.map((recipe) => {
            const cats = (recipe.category ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 3);
            const isSelected = selected.has(recipe.id);
            return (
              <div
                key={recipe.id}
                className={`relative bg-white dark:bg-[#24211c] rounded-xl border transition-all overflow-hidden group ${
                  isSelected
                    ? "border-orange-400 dark:border-orange-500 ring-2 ring-orange-300 dark:ring-orange-700"
                    : "border-gray-100 dark:border-[#2e2a24] hover:shadow-md hover:border-gray-200 dark:hover:border-[#3a352e]"
                }`}
              >
                {(selectMode || isSelected) && (
                  <button
                    onClick={() => toggleSelect(recipe.id)}
                    className={`absolute top-2 left-2 z-10 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                      isSelected
                        ? "bg-orange-500 border-orange-500"
                        : "bg-white/80 dark:bg-black/40 border-gray-300 dark:border-[#5c554b]"
                    }`}
                  >
                    {isSelected && <span className="text-white text-[10px] font-bold">✓</span>}
                  </button>
                )}
                <Link
                  href={`/recipes/${recipe.id}`}
                  className="block"
                  onClick={(e) => { if (selectMode) { e.preventDefault(); toggleSelect(recipe.id); } }}
                >
                  <div className="relative h-36 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-[#2a2620] dark:to-[#24211c] flex items-center justify-center overflow-hidden">
                    {recipe.imageUrl && (recipe.imageUrl.startsWith("/") || recipe.imageUrl.startsWith("http")) ? (
                      <RecipeCover src={recipe.imageUrl} alt={recipe.name} sizes="(max-width: 640px) 100vw, 25vw" />
                    ) : (
                      <span className="text-4xl opacity-20">🍽️</span>
                    )}
                    {cats.length > 0 && (
                      <div className="absolute top-2 right-2 flex flex-row items-center gap-1">
                        {cats.map((c) => {
                          const cls = CATEGORY_COLORS[c] ?? "bg-gray-100 text-gray-600 dark:bg-[#2e2a24] dark:text-[#bab2a6]";
                          return <span key={c} className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls}`}>{c}</span>;
                        })}
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-gray-900 dark:text-[#eae5de] text-sm leading-snug line-clamp-2 group-hover:text-orange-700 dark:group-hover:text-orange-400 transition-colors">
                        {recipe.name}
                      </h3>
                      {recipe.favorite && <Star size={13} className="text-amber-400 fill-amber-400 shrink-0 mt-0.5" />}
                    </div>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      )}

      {/* Grid view — 2 col mobile */}
      {view === "grid2" && (
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {recipes.map((recipe) => {
            const cats = (recipe.category ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 1);
            const isSelected = selected.has(recipe.id);
            return (
              <div
                key={recipe.id}
                className={`relative bg-white dark:bg-[#24211c] rounded-xl border transition-all overflow-hidden group ${
                  isSelected
                    ? "border-orange-400 dark:border-orange-500 ring-2 ring-orange-300 dark:ring-orange-700"
                    : "border-gray-100 dark:border-[#2e2a24] hover:shadow-md hover:border-gray-200 dark:hover:border-[#3a352e]"
                }`}
              >
                {(selectMode || isSelected) && (
                  <button
                    onClick={() => toggleSelect(recipe.id)}
                    className={`absolute top-2 left-2 z-10 w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
                      isSelected
                        ? "bg-orange-500 border-orange-500"
                        : "bg-white/80 dark:bg-black/40 border-gray-300 dark:border-[#5c554b]"
                    }`}
                  >
                    {isSelected && <span className="text-white text-[9px] font-bold">✓</span>}
                  </button>
                )}
                <Link
                  href={`/recipes/${recipe.id}`}
                  className="block"
                  onClick={(e) => { if (selectMode) { e.preventDefault(); toggleSelect(recipe.id); } }}
                >
                  <div className="relative h-28 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-[#2a2620] dark:to-[#24211c] flex items-center justify-center overflow-hidden">
                    {recipe.imageUrl && (recipe.imageUrl.startsWith("/") || recipe.imageUrl.startsWith("http")) ? (
                      <RecipeCover src={recipe.imageUrl} alt={recipe.name} sizes="(max-width: 640px) 50vw, 25vw" />
                    ) : (
                      <span className="text-3xl opacity-20">🍽️</span>
                    )}
                    {cats.length > 0 && (
                      <div className="absolute top-1.5 right-1.5">
                        {cats.map((c) => {
                          const cls = CATEGORY_COLORS[c] ?? "bg-gray-100 text-gray-600 dark:bg-[#2e2a24] dark:text-[#bab2a6]";
                          return <span key={c} className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${cls}`}>{c}</span>;
                        })}
                      </div>
                    )}
                  </div>
                  <div className="p-2">
                    <div className="flex items-start justify-between gap-1">
                      <h3 className="font-semibold text-gray-900 dark:text-[#eae5de] text-xs leading-snug line-clamp-2 group-hover:text-orange-700 dark:group-hover:text-orange-400 transition-colors">
                        {recipe.name}
                      </h3>
                      {recipe.favorite && <Star size={11} className="text-amber-400 fill-amber-400 shrink-0 mt-0.5" />}
                    </div>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      )}

      {/* List view */}
      {view === "list" && (
        <div className="border border-gray-100 dark:border-[#2e2a24] rounded-xl overflow-hidden">
          {/* Header */}
          <div className="hidden sm:grid grid-cols-[24px_40px_1fr_120px_70px_60px_24px] gap-3 px-4 py-2 bg-gray-50 dark:bg-[#24211c] border-b border-gray-100 dark:border-[#2e2a24]">
            <button onClick={toggleAll} className="flex items-center">
              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
                selected.size === recipes.length && recipes.length > 0
                  ? "bg-orange-500 border-orange-500"
                  : "border-gray-300 dark:border-[#5c554b]"
              }`}>
                {selected.size === recipes.length && recipes.length > 0 && <span className="text-white text-[9px] font-bold">✓</span>}
              </div>
            </button>
            <div />
            <span className="text-xs font-semibold text-gray-400 dark:text-[#5c554b] uppercase tracking-wide">Rețetă</span>
            <span className="text-xs font-semibold text-gray-400 dark:text-[#5c554b] uppercase tracking-wide">Categorie</span>
            <span className="text-xs font-semibold text-gray-400 dark:text-[#5c554b] uppercase tracking-wide">Timp</span>
            <span className="text-xs font-semibold text-gray-400 dark:text-[#5c554b] uppercase tracking-wide">Porții</span>
            <div />
          </div>

          {recipes.map((recipe, idx) => {
            const cats = (recipe.category ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 2);
            const isSelected = selected.has(recipe.id);
            return (
              <div
                key={recipe.id}
                className={`flex sm:grid sm:grid-cols-[24px_40px_1fr_120px_70px_60px_24px] gap-3 items-center px-4 py-2.5 transition-colors ${
                  idx > 0 ? "border-t border-gray-100 dark:border-[#2e2a24]" : ""
                } ${isSelected ? "bg-orange-50 dark:bg-orange-950/10" : "bg-white dark:bg-[#201c18] hover:bg-gray-50 dark:hover:bg-[#24211c]"}`}
              >
                {/* Checkbox */}
                <button onClick={() => toggleSelect(recipe.id)} className="shrink-0">
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
                    isSelected ? "bg-orange-500 border-orange-500" : "border-gray-300 dark:border-[#5c554b]"
                  }`}>
                    {isSelected && <span className="text-white text-[9px] font-bold">✓</span>}
                  </div>
                </button>

                {/* Thumbnail — vizibil inline între checkbox și nume pe toate ecranele */}
                <div className="block w-9 h-9 sm:w-10 sm:h-10 rounded-lg overflow-hidden bg-gray-100 dark:bg-[#2a2620] shrink-0 relative">
                  {recipe.imageUrl && (recipe.imageUrl.startsWith("/") || recipe.imageUrl.startsWith("http")) ? (
                    <RecipeCover src={recipe.imageUrl} alt={recipe.name} sizes="40px" />
                  ) : (
                    <span className="flex items-center justify-center w-full h-full text-lg opacity-30">🍽️</span>
                  )}
                </div>

                {/* Name (+ favorite; + category tag on mobile) */}
                <Link
                  href={`/recipes/${recipe.id}`}
                  className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2"
                  onClick={(e) => { if (selectMode) { e.preventDefault(); toggleSelect(recipe.id); } }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium text-gray-900 dark:text-[#eae5de] truncate hover:text-orange-600 dark:hover:text-orange-400 transition-colors">
                      {recipe.name}
                    </span>
                    {recipe.favorite && <Star size={12} className="text-amber-400 fill-amber-400 shrink-0" />}
                  </div>
                  {/* Category tags — mobile only (desktop shows them in the Category column) */}
                  {cats.length > 0 && (
                    <div className="flex sm:hidden items-center gap-1 flex-wrap">
                      {cats.map((c) => {
                        const cls = CATEGORY_COLORS[c] ?? "bg-gray-100 text-gray-600 dark:bg-[#2e2a24] dark:text-[#bab2a6]";
                        return <span key={c} className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls}`}>{c}</span>;
                      })}
                    </div>
                  )}
                </Link>

                {/* Category */}
                <div className="hidden sm:flex items-center gap-1 flex-wrap">
                  {cats.length > 0 ? cats.map((c) => {
                    const cls = CATEGORY_COLORS[c] ?? "bg-gray-100 text-gray-600 dark:bg-[#2e2a24] dark:text-[#bab2a6]";
                    return <span key={c} className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls}`}>{c}</span>;
                  }) : <span className="text-xs text-gray-300 dark:text-[#4a443c]">—</span>}
                </div>

                {/* Time */}
                <div className="hidden sm:flex items-center gap-1 text-xs text-gray-500 dark:text-[#7c756a]">
                  {recipe.time ? <><Clock size={11} />{recipe.time} min</> : <span className="text-gray-300 dark:text-[#4a443c]">—</span>}
                </div>

                {/* Servings */}
                <div className="hidden sm:block text-xs text-gray-500 dark:text-[#7c756a]">
                  {recipe.servings ? `${recipe.servings} porții` : <span className="text-gray-300 dark:text-[#4a443c]">—</span>}
                </div>

                {/* Arrow */}
                <Link href={`/recipes/${recipe.id}`} className="hidden sm:flex text-gray-300 dark:text-[#4a443c] hover:text-orange-400 transition-colors">
                  <ChevronRight size={16} />
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
