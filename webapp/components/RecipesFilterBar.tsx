"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, Star, X } from "lucide-react";
import SortSelect from "./SortSelect";

const CATEGORIES = [
  "Breakfast", "Lunch", "Dinner", "Snack",
  "Smoothie", "Smoothie Bowl", "Soup", "High Protein",
];

export default function RecipesFilterBar({
  q, cat, fav, sort,
}: { q?: string; cat?: string; fav?: string; sort?: string }) {
  const [stuck, setStuck] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const favOnly = fav === "1";

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const root = el.closest<HTMLElement>("main");
    const io = new IntersectionObserver(
      ([e]) => {
        setStuck(!e.isIntersecting);
        if (e.isIntersecting) setSearchOpen(false);
      },
      { root: root ?? null, threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const chip = "shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors";
  const off  = "bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#3a3a3a] text-gray-700 dark:text-[#b8b8b8]";
  const on   = "bg-orange-500 text-white";

  const stickyBarCls = stuck ? [
    // mobile: sticky bar
    "sticky top-0 z-30 -mx-4 px-4 py-2",
    "bg-white dark:bg-[#191919]",
    "border-b border-gray-100 dark:border-[#2e2e2e] shadow-sm",
    // desktop: reset to normal flow
    "md:static md:top-auto md:z-auto",
    "md:mx-0 md:px-0 md:py-0",
    "md:bg-transparent dark:md:bg-transparent",
    "md:border-none md:shadow-none",
  ].join(" ") : "";

  return (
    <>
      {/* ── Search input — hidden on mobile when sticky ── */}
      <div className={stuck ? "hidden md:block" : undefined}>
        <form className="relative mb-3">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-[#787878]" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search recipes…"
            className="w-full md:max-w-sm pl-9 pr-4 py-2 text-sm bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#3a3a3a] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900 dark:text-[#e3e3e3] placeholder:text-gray-400 dark:placeholder:text-[#555555]"
          />
          {cat && <input type="hidden" name="cat" value={cat} />}
        </form>
      </div>

      {/* ── Sentinel: sticky kicks in when this exits main's viewport ── */}
      <div ref={sentinelRef} className="h-px pointer-events-none" aria-hidden />

      {/* ── Expanded search (mobile, sticky mode) ── */}
      {stuck && searchOpen && (
        <div className="sticky top-0 z-40 -mx-4 px-4 py-2 bg-white dark:bg-[#191919] border-b border-gray-100 dark:border-[#2e2e2e] md:hidden">
          <form className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-[#787878]" />
            <input
              autoFocus
              name="q"
              defaultValue={q}
              placeholder="Search recipes…"
              className="w-full pl-9 pr-8 py-2 text-sm bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#3a3a3a] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-gray-900 dark:text-[#e3e3e3] placeholder:text-gray-400 dark:placeholder:text-[#555555]"
            />
            {cat && <input type="hidden" name="cat" value={cat} />}
            <button
              type="button"
              onClick={() => setSearchOpen(false)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-[#b8b8b8]"
            >
              <X size={14} />
            </button>
          </form>
        </div>
      )}

      {/* ── Filter bar (chips + sort/view) ── */}
      {!(stuck && searchOpen) && (
        <div className={stickyBarCls}>
          {/* Chips */}
          <div className={`flex gap-1.5 overflow-x-auto scrollbar-none flex-nowrap items-center ${stuck ? "" : "mb-2"}`}>

            {/* Search chip — mobile only, sticky only, icon only */}
            {stuck && (
              <button
                onClick={() => setSearchOpen(true)}
                className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors md:hidden ${q ? on : off}`}
                title="Search"
              >
                <Search size={13} />
              </button>
            )}

            <Link href={q ? `?q=${q}` : "/recipes"} className={`${chip} ${!cat && !favOnly ? on : off}`}>
              All
            </Link>

            <Link
              href={`?${q ? `q=${q}&` : ""}fav=1`}
              className={`${chip} flex items-center gap-1 ${favOnly ? "bg-amber-400 text-white" : off}`}
            >
              <Star size={11} className={favOnly ? "fill-white" : "fill-amber-400 text-amber-400"} />
              Favorites
            </Link>

            {CATEGORIES.map((c) => (
              <Link
                key={c}
                href={`?${q ? `q=${q}&` : ""}cat=${encodeURIComponent(c)}`}
                className={`${chip} ${cat === c ? on : off}`}
              >
                {c}
              </Link>
            ))}

            {/* Sort/view at end of sticky row (mobile only) */}
            {stuck && (
              <div className="shrink-0 ml-auto pl-1 md:hidden">
                <SortSelect current={sort || "date_desc"} q={q} cat={cat} fav={fav} />
              </div>
            )}
          </div>

          {/* Sort/view row — normal (non-sticky) state */}
          {!stuck && (
            <div className="flex justify-end mb-4">
              <SortSelect current={sort || "date_desc"} q={q} cat={cat} fav={fav} />
            </div>
          )}
        </div>
      )}
    </>
  );
}
