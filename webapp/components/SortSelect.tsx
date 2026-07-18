"use client";

import { useRouter } from "next/navigation";
import { ArrowDownAZ, ArrowDownWideNarrow, ArrowUpNarrowWide, LayoutGrid, Grid2X2, List } from "lucide-react";
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
              : "text-gray-400 dark:text-[#555] hover:text-gray-700 dark:hover:text-[#b8b8b8]"
          }`}
        >
          <Icon size={17} />
        </button>
      ))}
      <button
        onClick={cycleSort}
        className="p-1.5 text-gray-400 dark:text-[#555] hover:text-gray-700 dark:hover:text-[#b8b8b8] transition-colors"
        title={active.label}
      >
        <SortIcon size={17} />
      </button>
    </div>
  );
}
