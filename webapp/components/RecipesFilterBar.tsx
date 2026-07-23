"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Star, X } from "lucide-react";
import SortSelect from "./SortSelect";
import { categoryLabel } from "@/lib/labels";

export default function RecipesFilterBar({
  q, cat, fav, sort, categories,
}: { q?: string; cat?: string; fav?: string; sort?: string; categories: string[] }) {
  const [stuck, setStuck] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const favOnly = fav === "1";
  const router = useRouter();

  // Search as you type (debounced), like the planner's add-recipe panel.
  const [value, setValue] = useState(q ?? "");
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pending, setPending] = useState<string | null>(null); // q value WE last requested
  const [prevQ, setPrevQ] = useState(q);

  // Adjust the box when q changes from outside our own typing (persistence
  // restore / shared ?q= link). setState-during-render is the React pattern.
  if (q !== prevQ) {
    setPrevQ(q);
    if ((q ?? "") !== (pending ?? "")) setValue(q ?? "");
  }

  function pushQ(next: string) {
    const params = new URLSearchParams();
    const t = next.trim();
    setPending(t);
    if (t) params.set("q", t);
    if (cat) params.set("cat", cat);
    if (fav) params.set("fav", fav);
    if (sort) params.set("sort", sort);
    const qs = params.toString();
    if (qs) {
      router.replace(`/recipes?${qs}`, { scroll: false });
    } else {
      // fully cleared — mark it so the saved-filters restore doesn't bring it back
      sessionStorage.setItem("recipesFiltersCleared", "1");
      router.replace("/recipes", { scroll: false });
    }
  }

  // Build a chip href via URLSearchParams so q is always encoded (a query with
  // `&` or `#` no longer breaks the URL) and the current sort is preserved.
  function chipHref(next: { cat?: string; fav?: string }): string {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (next.cat) params.set("cat", next.cat);
    if (next.fav) params.set("fav", next.fav);
    if (sort) params.set("sort", sort);
    const qs = params.toString();
    return qs ? `/recipes?${qs}` : "/recipes";
  }

  function onSearchInput(next: string) {
    setValue(next);
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => pushQ(next), 250);
  }

  function clearSearch() {
    setValue("");
    if (debRef.current) clearTimeout(debRef.current);
    pushQ("");
  }

  // Remember the last-used filters and restore them when landing on a bare
  // /recipes (e.g. via the nav/sidebar or a "back to recipes" link), so a
  // selected filter isn't lost when leaving and returning to the page.
  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (cat) params.set("cat", cat);
    if (fav) params.set("fav", fav);
    if (sort) params.set("sort", sort);
    const qs = params.toString();

    if (qs) {
      sessionStorage.setItem("recipesFilters", qs);
      sessionStorage.removeItem("recipesFiltersCleared");
      return;
    }
    // Bare /recipes. If the user explicitly cleared (clicked "All"), honour it.
    if (sessionStorage.getItem("recipesFiltersCleared")) {
      sessionStorage.removeItem("recipesFiltersCleared");
      sessionStorage.removeItem("recipesFilters");
      return;
    }
    const saved = sessionStorage.getItem("recipesFilters");
    if (saved) router.replace(`/recipes?${saved}`, { scroll: false });
  }, [q, cat, fav, sort, router]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const root = el.closest<HTMLElement>("main");
    const io = new IntersectionObserver(
      ([e]) => {
        setStuck(!e.isIntersecting);
        // Collapse the mobile search overlay back into the in-flow input once we reach
        // the top (the intuitive behaviour). The query is kept — the in-flow box shows it.
        if (e.isIntersecting) setSearchOpen(false);
      },
      { root: root ?? null, threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Keep a ref of `stuck` so the scroll effect reads it without re-subscribing.
  const stuckRef = useRef(stuck);
  stuckRef.current = stuck;

  // On a filter change, align the first results just under the sticky bar (scroll to
  // #recipes-top). Always for category/favorite; for live search only when scrolled
  // down (stuck), so typing at the top isn't disturbed. #recipes-top has a fixed
  // offset, so re-aligning while typing never moves an already-aligned page.
  const isFirstRender = useRef(true);
  const prevFilters = useRef({ cat, fav, q });
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      prevFilters.current = { cat, fav, q };
      return;
    }
    const prev = prevFilters.current;
    const catFavChanged = prev.cat !== cat || prev.fav !== fav;
    const qChanged = prev.q !== q;
    prevFilters.current = { cat, fav, q };
    if (catFavChanged || (qChanged && stuckRef.current)) {
      document.getElementById("recipes-top")?.scrollIntoView({ block: "start" });
    }
  }, [cat, fav, q]);

  const chip = "shrink-0 px-3.5 py-1.5 rounded-full text-sm font-semibold transition-colors";
  const off  = "bg-white dark:bg-[#24211c] border border-gray-200 dark:border-[#3a352e] text-gray-700 dark:text-[#bab2a6]";
  const on   = "bg-orange-500 text-white";

  // Bar is ALWAYS sticky + opaque (page-bg colour, so invisible at rest and it
  // cleanly covers content scrolling behind it). Only the border + shadow fade
  // in when stuck — flow height never changes, so nothing jumps.
  const barCls = [
    "sticky top-0 z-30 -mx-4 px-4 py-2",
    "bg-[var(--color-bg-base)]",
    "border-b transition-[border-color,box-shadow] duration-200 ease-out",
    stuck ? "border-gray-100 dark:border-[#2e2a24] shadow-sm" : "border-transparent shadow-none",
    // desktop: plain static row, no sticky chrome; add a gap before the grid
    "md:static md:z-auto md:mx-0 md:px-0 md:py-0 md:mb-4 md:bg-transparent md:border-none md:shadow-none",
  ].join(" ");

  return (
    <>
      {/* ── Search input (always in flow — scrolls away). When scrolled, the sticky bar's
             chip opens the overlay below; back at the top this is the only search box. ── */}
      <form className="relative mb-3 md:max-w-sm" onSubmit={(e) => { e.preventDefault(); if (debRef.current) clearTimeout(debRef.current); pushQ(value); }}>
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-[#7c756a]" />
        <input
          value={value}
          onChange={(e) => onSearchInput(e.target.value)}
          placeholder="Search recipes…"
          className="w-full pl-9 pr-9 py-2 text-sm bg-white dark:bg-[#24211c] border border-gray-200 dark:border-[#3a352e] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900 dark:text-[#eae5de] placeholder:text-gray-400 dark:placeholder:text-[#5c554b]"
        />
        {value && (
          <button
            type="button"
            onClick={clearSearch}
            title="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-[#bab2a6]"
          >
            <X size={14} />
          </button>
        )}
      </form>

      {/* ── Sentinel: sticky kicks in when this exits main's viewport ── */}
      <div ref={sentinelRef} className="h-px pointer-events-none" aria-hidden />

      {/* ── Expanded search overlay (mobile, sticky mode) — collapses back to the in-flow
             input when you scroll to the top (handled in the IntersectionObserver). ── */}
      {stuck && searchOpen && (
        <div className="fixed inset-x-0 top-0 z-40 px-4 py-2 bg-[var(--color-bg-base)] border-b border-gray-100 dark:border-[#2e2a24] shadow-sm md:hidden">
          <form className="relative" onSubmit={(e) => { e.preventDefault(); if (debRef.current) clearTimeout(debRef.current); pushQ(value); }}>
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-[#7c756a]" />
            <input
              autoFocus
              value={value}
              onChange={(e) => onSearchInput(e.target.value)}
              placeholder="Search recipes…"
              className="w-full pl-9 pr-8 py-2 text-sm bg-white dark:bg-[#24211c] border border-gray-200 dark:border-[#3a352e] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-gray-900 dark:text-[#eae5de] placeholder:text-gray-400 dark:placeholder:text-[#5c554b]"
            />
            <button
              type="button"
              onClick={() => { clearSearch(); setSearchOpen(false); }}
              title="Close"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-[#bab2a6]"
            >
              <X size={14} />
            </button>
          </form>
        </div>
      )}

      {/* ── Filter chips bar (sticky) ── */}
      <div className={barCls}>
        <div className="flex items-center">
          {/* Search chip — mobile only; pinned left, stays fixed while chips scroll */}
          <button
            onClick={() => setSearchOpen(true)}
            title="Search"
            aria-hidden={!stuck}
            tabIndex={stuck ? 0 : -1}
            className={`shrink-0 h-8 rounded-full flex items-center justify-center overflow-hidden transition-all duration-200 ease-out md:hidden ${
              stuck ? "w-8 opacity-100 mr-1.5" : "w-0 opacity-0 pointer-events-none"
            } ${q ? on : off}`}
          >
            <Search size={13} />
          </button>

          {/* Scrolling chips */}
          <div className="flex-1 min-w-0 flex gap-1.5 overflow-x-auto scrollbar-none flex-nowrap items-center">
            <Link
              scroll={false}
              href={chipHref({})}
              onClick={() => sessionStorage.setItem("recipesFiltersCleared", "1")}
              className={`${chip} ${!cat && !favOnly ? on : off}`}
            >
              All
            </Link>

            <Link
              scroll={false}
              href={chipHref({ fav: "1" })}
              className={`${chip} flex items-center gap-1 ${favOnly ? "bg-amber-400 text-white" : off}`}
            >
              <Star size={11} className={favOnly ? "fill-white" : "fill-amber-400 text-amber-400"} />
              Favorites
            </Link>

            {categories.map((c) => (
              <Link
                key={c}
                scroll={false}
                href={chipHref({ cat: c })}
                className={`${chip} ${cat === c ? on : off}`}
              >
                {categoryLabel(c)}
              </Link>
            ))}
          </div>

          {/* Sort/view — desktop only, pinned right (outside the scroll, not in the sticky mobile bar) */}
          <div className="hidden md:flex shrink-0 pl-1">
            <SortSelect current={sort || "date_desc"} q={q} cat={cat} fav={fav} />
          </div>
        </div>
      </div>

      {/* ── Sort/view row (mobile 2-row default) — kept in flow when stuck to avoid
             any layout jump; just hidden from view (it's covered/scrolled anyway) ── */}
      <div className={`justify-end mb-4 md:hidden ${stuck ? "invisible" : "flex"}`}>
        <SortSelect current={sort || "date_desc"} q={q} cat={cat} fav={fav} />
      </div>
    </>
  );
}
