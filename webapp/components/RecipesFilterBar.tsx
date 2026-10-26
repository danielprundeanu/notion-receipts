"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Star, X } from "lucide-react";
import { categoryLabel } from "@/lib/labels";

// Search box + filter chips. Controlled by RecipesBrowser, which filters in memory, so
// every keystroke and tap applies at once.
export default function RecipesFilterBar({
  q, onQChange, cats, fav, categories, onToggleCat, onToggleFav, onClearChips,
}: {
  q: string;
  onQChange: (q: string) => void;
  cats: string[];
  fav: boolean;
  categories: string[];
  onToggleCat: (c: string) => void;
  onToggleFav: () => void;
  onClearChips: () => void;
}) {
  const [stuck, setStuck] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const root = el.closest<HTMLElement>("main");
    // Stuck: the section reached the top. Chrome (border/shadow) turns on here.
    const io = new IntersectionObserver(
      ([e]) => setStuck(!e.isIntersecting),
      { root: root ?? null, threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const chip = "shrink-0 h-10 px-4 rounded-full text-sm font-medium flex items-center gap-1.5 border transition-colors";
  const off = "bg-white dark:bg-[#24211c] border-gray-200 dark:border-[#3a352e] text-gray-700 dark:text-[#bab2a6]";
  const on = "bg-orange-500 border-orange-500 text-white";
  const noChips = cats.length === 0 && !fav;

  // The WHOLE section (search input + filter chips) is one sticky unit. It sticks as
  // a block when the sentinel above it scrolls out of view. Opaque (page-bg) so it
  // covers content behind it; border/shadow fade in when stuck. Desktop: plain row.
  const sectionCls = [
    "sticky top-0 z-30 -mx-4 px-4 py-2 bg-[var(--color-bg-base)]",
    "border-b transition-[border-color,box-shadow] duration-200 ease-out",
    stuck ? "border-gray-100 dark:border-[#2e2a24] shadow-sm" : "border-transparent shadow-none",
    "md:static md:z-auto md:mx-0 md:px-0 md:py-0 md:mb-4 md:bg-transparent md:border-none md:shadow-none",
  ].join(" ");

  return (
    <>
      {/* ── Sentinel: the section below sticks as a block once this scrolls away ── */}
      <div ref={sentinelRef} className="h-px pointer-events-none" aria-hidden />

      <div className={sectionCls}>
        {/* Enter just closes the keyboard: results are already filtered. */}
        <form
          role="search"
          className="relative md:max-w-md mb-2 md:mb-3"
          onSubmit={(e) => { e.preventDefault(); searchInputRef.current?.blur(); }}
        >
          <Search size={20} aria-hidden className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 dark:text-[#a49c90] pointer-events-none" />
          <input
            ref={searchInputRef}
            type="search"
            enterKeyHint="search"
            aria-label="Search recipes"
            value={q}
            onChange={(e) => onQChange(e.target.value)}
            placeholder="Search recipes or ingredients"
            className="w-full h-12 pl-11 pr-12 bg-white dark:bg-[#24211c] border border-gray-200 dark:border-[#3a352e] rounded-2xl focus:outline-none focus:ring-2 focus:ring-inset focus:ring-orange-500 focus:border-transparent text-gray-900 dark:text-[#eae5de] placeholder:text-gray-500 dark:placeholder:text-[#8f877b] [&::-webkit-search-cancel-button]:hidden"
          />
          {q && (
            <button
              type="button"
              onClick={() => { onQChange(""); searchInputRef.current?.focus(); }}
              aria-label="Clear search"
              className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl flex items-center justify-center text-gray-500 dark:text-[#a49c90] hover:text-gray-700 dark:hover:text-[#eae5de]"
            >
              <X size={18} />
            </button>
          )}
        </form>

        {/* Scrolling chips — categories are multi-select toggles */}
        <div className="flex gap-2 overflow-x-auto scrollbar-none flex-nowrap items-center">
          <button type="button" onClick={onClearChips} aria-pressed={noChips} className={`${chip} ${noChips ? on : off}`}>
            All
          </button>
          <button type="button" onClick={onToggleFav} aria-pressed={fav} className={`${chip} ${fav ? on : off}`}>
            <Star size={15} aria-hidden className="fill-current" />
            Favorites
          </button>
          {categories.map((c) => {
            const active = cats.includes(c);
            return (
              <button key={c} type="button" onClick={() => onToggleCat(c)} aria-pressed={active} className={`${chip} ${active ? on : off}`}>
                {categoryLabel(c)}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
