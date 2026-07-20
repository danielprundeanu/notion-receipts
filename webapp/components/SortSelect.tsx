"use client";

import { useRouter } from "next/navigation";
import { ArrowDownAZ, ArrowDownWideNarrow, ArrowUpNarrowWide, LayoutGrid, Grid2X2, List, ListChecks } from "lucide-react";
import { useEffect, useState } from "react";

const SORT_OPTIONS = [
  { value: "date_desc", icon: ArrowDownWideNarrow, label: "Newest first" },
  { value: "date_asc",  icon: ArrowUpNarrowWide,  label: "Oldest first" },
  { value: "name_asc",  icon: ArrowDownAZ,         label: "A–Z" },
] as const;

type ViewMode = "grid" | "grid2" | "list";

const VIEW_OPTIONS: { value: ViewMode; icon: React.ElementType; title: string }[] = [
  { value: "grid",  icon: LayoutGrid, title: "Grid (1 coloană mobile)" },
  { value: "grid2", icon: Grid2X2,    title: "Grid (2 coloane mobile)" },
  { value: "list",  icon: List,        title: "Listă" },
];

export default function SortSelect({
  current,
  q,
  cat,
  fav,
}: {
  current: string;
  q?: string;
  cat?: string;
  fav?: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "grid";
    return (localStorage.getItem("recipesView") as ViewMode) ?? "grid";
  });

  useEffect(() => {
    localStorage.setItem("recipesView", view);
    window.dispatchEvent(new CustomEvent("viewchange", { detail: view }));
  }, [view]);

  // Keep multiple SortSelect instances (e.g. sticky bar + 2-row default) in sync.
  useEffect(() => {
    function onViewChange(e: Event) {
      const v = (e as CustomEvent<ViewMode>).detail;
      setView((prev) => (prev === v ? prev : v));
    }
    window.addEventListener("viewchange", onViewChange);
    return () => window.removeEventListener("viewchange", onViewChange);
  }, []);

  // ── Multi-select mode (coordinated with RecipesGrid via a window event,
  //    same pattern as viewchange — works across all SortSelect instances) ──
  const [selectMode, setSelectMode] = useState(false);
  useEffect(() => {
    function onSel(e: Event) {
      const v = (e as CustomEvent<boolean>).detail;
      setSelectMode((prev) => (prev === v ? prev : v));
    }
    window.addEventListener("selectmodechange", onSel);
    return () => window.removeEventListener("selectmodechange", onSel);
  }, []);
  function toggleSelect() {
    const v = !selectMode;
    setSelectMode(v);
    window.dispatchEvent(new CustomEvent("selectmodechange", { detail: v }));
  }

  function cycleSort() {
    const idx = SORT_OPTIONS.findIndex((o) => o.value === current);
    const next = SORT_OPTIONS[(idx + 1) % SORT_OPTIONS.length];
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (cat) p.set("cat", cat);
    if (fav) p.set("fav", fav);
    if (next.value !== "date_desc") p.set("sort", next.value);
    const qs = p.toString();
    router.push(`/recipes${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  const active = SORT_OPTIONS.find((o) => o.value === current) ?? SORT_OPTIONS[0];
  const SortIcon = active.icon;

  return (
    <div className="shrink-0 flex items-center gap-1">
      {VIEW_OPTIONS.map(({ value, icon: Icon, title }) => (
        <button
          key={value}
          onClick={() => setView(value)}
          title={title}
          className={`p-1.5 rounded transition-colors ${
            view === value
              ? "text-orange-500 dark:text-orange-400"
              : "text-gray-400 dark:text-[#5c554b] hover:text-gray-700 dark:hover:text-[#bab2a6]"
          }`}
        >
          <Icon size={17} />
        </button>
      ))}
      <button
        onClick={cycleSort}
        className="p-1.5 text-gray-400 dark:text-[#5c554b] hover:text-gray-700 dark:hover:text-[#bab2a6] transition-colors"
        title={active.label}
      >
        <SortIcon size={17} />
      </button>
      <button
        onClick={toggleSelect}
        aria-pressed={selectMode}
        className={`p-1.5 rounded transition-colors ${
          selectMode
            ? "text-orange-500 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30"
            : "text-gray-400 dark:text-[#5c554b] hover:text-gray-700 dark:hover:text-[#bab2a6]"
        }`}
        title={selectMode ? "Ieși din selecție" : "Selectează"}
      >
        <ListChecks size={17} />
      </button>
    </div>
  );
}
