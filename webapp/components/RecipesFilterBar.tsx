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
  const sentinelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);   // in-flow input (top)
  const pinnedInputRef = useRef<HTMLInputElement>(null);   // input inside the pinned bar
  const barRef = useRef<HTMLDivElement>(null);
  const favOnly = fav === "1";
  const router = useRouter();

  // Search as you type (debounced), like the planner's add-recipe panel.
  const [value, setValue] = useState(q ?? "");
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pending, setPending] = useState<string | null>(null); // q value WE last requested
  const [prevQ, setPrevQ] = useState(q);
  const userTypedRef = useRef(false); // distinguish typing-driven pin from a shared ?q= load

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

  // Currently-selected categories (multi-select). `cat` is a comma-separated list.
  const selectedCats = (cat ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  // Build a filter URL via URLSearchParams so q is always encoded (a query with
  // `&` or `#` no longer breaks the URL) and the current sort is preserved.
  function buildHref(nextCats: string[], nextFav: boolean): string {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (nextCats.length) params.set("cat", nextCats.join(","));
    if (nextFav) params.set("fav", "1");
    if (sort) params.set("sort", sort);
    const qs = params.toString();
    return qs ? `/recipes?${qs}` : "/recipes";
  }

  // Category chips toggle: add the tag if it's off, remove it if it's on.
  function toggleCatHref(c: string): string {
    const nextCats = selectedCats.includes(c)
      ? selectedCats.filter((x) => x !== c)
      : [...selectedCats, c];
    return buildHref(nextCats, favOnly);
  }

  // When a toggle lands on a bare /recipes, flag it so the saved-filters restore
  // (see the persistence effect) doesn't immediately bring the filters back.
  function markIfCleared(href: string) {
    if (href === "/recipes") sessionStorage.setItem("recipesFiltersCleared", "1");
  }

  function onSearchInput(next: string) {
    userTypedRef.current = true;
    setValue(next);
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => pushQ(next), 250);
  }

  function clearSearch() {
    setValue("");
    if (debRef.current) clearTimeout(debRef.current);
    pushQ("");
  }

  // Search chip (sticky bar, no active query) → smooth-scroll to the top and focus the
  // in-flow input. focus({ preventScroll }) avoids a competing jump-scroll; focusing
  // inside the click keeps the mobile keyboard opening (iOS only opens it from a gesture).
  function goToSearch() {
    searchInputRef.current?.focus({ preventScroll: true });
    const scroller = searchInputRef.current?.closest<HTMLElement>("main");
    (scroller ?? window).scrollTo({ top: 0, behavior: "smooth" });
  }

  // Whether there's an active search term. When there is, the bar is "pinned" as a
  // fixed header on mobile (input + filters stay together while scrolling); when empty
  // it's a normal sticky row that minimizes to the search icon once scrolled.
  const hasValue = value.trim().length > 0;
  const pinned = hasValue;

  // Measure the bar so a spacer can reserve its height in flow while it's pinned
  // (fixed → out of flow), keeping the grid from jumping up under it.
  const [barH, setBarH] = useState(0);
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const update = () => setBarH(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // When the pin is entered by typing (not a shared ?q= load), move focus to the
  // pinned input so the keyboard stays and typing continues seamlessly.
  useEffect(() => {
    if (pinned && userTypedRef.current) {
      const el = pinnedInputRef.current;
      if (el) {
        el.focus({ preventScroll: true });
        const len = el.value.length;
        try { el.setSelectionRange(len, len); } catch { /* number/date inputs can't */ }
      }
    }
  }, [pinned]);

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
      ([e]) => setStuck(!e.isIntersecting),
      { root: root ?? null, threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // On a category/favorite change, align the first results just under the sticky bar
  // (scroll to #recipes-top). Not on `q`: search happens from the top / the pinned bar.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    document.getElementById("recipes-top")?.scrollIntoView({ block: "start" });
  }, [cat, fav]);

  const chip = "shrink-0 px-3.5 py-1.5 rounded-full text-sm font-semibold transition-colors";
  const off  = "bg-white dark:bg-[#24211c] border border-gray-200 dark:border-[#3a352e] text-gray-700 dark:text-[#bab2a6]";
  const on   = "bg-orange-500 text-white";

  // Opaque (page-bg) so it cleanly covers content behind it. Normally `sticky top-0`;
  // while pinned (active query) it's a `fixed` header on mobile — decoupled from scroll,
  // so nothing shifts as the input stays put. Border/shadow show when stuck or pinned.
  const barCls = [
    "py-2 bg-[var(--color-bg-base)]",
    "border-b transition-[border-color,box-shadow] duration-200 ease-out",
    stuck || pinned ? "border-gray-100 dark:border-[#2e2a24] shadow-sm" : "border-transparent shadow-none",
    pinned
      ? "max-md:fixed max-md:top-0 max-md:inset-x-0 max-md:z-40 max-md:px-4"
      : "sticky top-0 z-30 -mx-4 px-4",
    "md:static md:z-auto md:mx-0 md:px-0 md:py-0 md:mb-4 md:bg-transparent md:border-none md:shadow-none",
  ].join(" ");

  return (
    <>
      {/* ── In-flow search input. Hidden on mobile while pinned (the pinned bar shows
             its own input); always visible on desktop. ── */}
      <form className={`relative mb-3 md:max-w-sm ${pinned ? "max-md:hidden" : ""}`} onSubmit={(e) => { e.preventDefault(); if (debRef.current) clearTimeout(debRef.current); pushQ(value); }}>
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-[#7c756a]" />
        <input
          ref={searchInputRef}
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

      {/* ── Spacer: reserves the pinned (fixed) bar's height in flow so the grid
             doesn't jump up under it (mobile only). ── */}
      {pinned && <div aria-hidden className="md:hidden" style={{ height: barH }} />}

      {/* ── Filter chips bar (sticky, or fixed when pinned) ── */}
      <div ref={barRef} className={barCls}>
        {/* Maximized search input (mobile) — shown while a query is active, so the
            input + filters stay together while scrolling. Clearing it (X) minimizes
            back to the search icon + chips. */}
        {pinned && (
          <form
            className="md:hidden relative mb-2"
            onSubmit={(e) => { e.preventDefault(); if (debRef.current) clearTimeout(debRef.current); pushQ(value); }}
          >
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-[#7c756a]" />
            <input
              ref={pinnedInputRef}
              value={value}
              onChange={(e) => onSearchInput(e.target.value)}
              placeholder="Search recipes…"
              className="w-full pl-9 pr-9 py-2 text-sm bg-white dark:bg-[#24211c] border border-gray-200 dark:border-[#3a352e] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-gray-900 dark:text-[#eae5de] placeholder:text-gray-400 dark:placeholder:text-[#5c554b]"
            />
            <button
              type="button"
              onClick={clearSearch}
              title="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-[#bab2a6]"
            >
              <X size={14} />
            </button>
          </form>
        )}
        <div className="flex items-center">
          {/* Search chip — mobile only; shown when scrolled with no active query.
              Scrolls to the top and focuses the input. */}
          <button
            onClick={goToSearch}
            title="Search"
            aria-hidden={!stuck || pinned}
            tabIndex={stuck && !pinned ? 0 : -1}
            className={`shrink-0 h-8 rounded-full flex items-center justify-center overflow-hidden transition-all duration-200 ease-out md:hidden ${
              stuck && !pinned ? "w-8 opacity-100 mr-1.5" : "w-0 opacity-0 pointer-events-none"
            } ${q ? on : off}`}
          >
            <Search size={13} />
          </button>

          {/* Scrolling chips — categories are multi-select toggles */}
          <div className="flex-1 min-w-0 flex gap-1.5 overflow-x-auto scrollbar-none flex-nowrap items-center">
            {(() => { const href = buildHref([], false); return (
              <Link
                scroll={false}
                href={href}
                onClick={() => markIfCleared(href)}
                className={`${chip} ${selectedCats.length === 0 && !favOnly ? on : off}`}
              >
                All
              </Link>
            ); })()}

            {(() => { const href = buildHref(selectedCats, !favOnly); return (
              <Link
                scroll={false}
                href={href}
                onClick={() => markIfCleared(href)}
                className={`${chip} flex items-center gap-1 ${favOnly ? "bg-amber-400 text-white" : off}`}
              >
                <Star size={11} className={favOnly ? "fill-white" : "fill-amber-400 text-amber-400"} />
                Favorites
              </Link>
            ); })()}

            {categories.map((c) => {
              const active = selectedCats.includes(c);
              const href = toggleCatHref(c);
              return (
                <Link
                  key={c}
                  scroll={false}
                  href={href}
                  onClick={() => markIfCleared(href)}
                  aria-pressed={active}
                  className={`${chip} ${active ? on : off}`}
                >
                  {categoryLabel(c)}
                </Link>
              );
            })}
          </div>

          {/* Sort/view — desktop only, pinned right (outside the scroll, not in the sticky mobile bar) */}
          <div className="hidden md:flex shrink-0 pl-1">
            <SortSelect current={sort || "date_desc"} q={q} cat={cat} fav={fav} />
          </div>
        </div>
      </div>

      {/* ── Sort/view row (mobile 2-row default) — invisible (keeps its space) when
             stuck; hidden entirely while pinned (the fixed bar owns the top). ── */}
      <div className={`justify-end mb-4 md:hidden ${pinned ? "hidden" : stuck ? "invisible" : "flex"}`}>
        <SortSelect current={sort || "date_desc"} q={q} cat={cat} fav={fav} />
      </div>
    </>
  );
}
