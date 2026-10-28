"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Star, Clock, Check } from "lucide-react";
import RecipeCover from "./RecipeCover";
import type { RecipeListItem } from "@/lib/actions";
import { categoryLabel } from "@/lib/labels";

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

// The tick circle a selectable row or card shows in select mode.
function SelectCircle({ on, className = "" }: { on: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={`rounded-full flex items-center justify-center shrink-0 transition-colors ${
        on
          ? "bg-orange-500 text-gray-900"
          : "border-2 border-gray-400 dark:border-[#8f877b]"
      } ${className}`}
    >
      {on && <Check size={16} strokeWidth={3} />}
    </span>
  );
}

// The list or grid of recipes. In select mode a tap toggles the recipe instead of opening it;
// the selection and what to do with it live in RecipesBrowser.
export default function RecipesGrid({
  recipes, layout, selectMode, selected, onToggle,
}: {
  recipes: RecipeListItem[];
  layout: RecipesLayout;
  selectMode: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  function tile(r: RecipeListItem, className: string, children: ReactNode) {
    if (!selectMode) {
      return <Link href={`/recipes/${r.id}`} className={className}>{children}</Link>;
    }
    return (
      <button
        type="button"
        aria-pressed={selected.has(r.id)}
        aria-label={`Select ${r.name}`}
        onClick={() => onToggle(r.id)}
        className={`${className} text-left`}
      >
        {children}
      </button>
    );
  }

  return (
    <div>
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
                    {selectMode && <SelectCircle on={on} className="w-[26px] h-[26px]" />}
                    <RecipeThumb recipe={r} sizes="68px" className="w-[68px] h-[68px] rounded-[14px] shrink-0" initialClass="text-[28px]" />
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
                      {selectMode && (
                        <SelectCircle
                          on={on}
                          className={`absolute top-2 left-2 w-[30px] h-[30px] ${on ? "" : "border-white! bg-black/35"}`}
                        />
                      )}
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

    </div>
  );
}
