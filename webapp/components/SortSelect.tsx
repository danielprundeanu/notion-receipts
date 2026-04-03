"use client";

import { useRouter } from "next/navigation";
import { ArrowDownAZ, ArrowDownWideNarrow, ArrowUpNarrowWide, LayoutGrid, List } from "lucide-react";
import { useEffect, useState } from "react";

const SORT_OPTIONS = [
  { value: "date_desc", icon: ArrowDownWideNarrow, label: "Newest first" },
  { value: "date_asc",  icon: ArrowUpNarrowWide,  label: "Oldest first" },
  { value: "name_asc",  icon: ArrowDownAZ,         label: "A–Z" },
] as const;

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
  const [view, setView] = useState<"grid" | "list">("grid");

  useEffect(() => {
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
    router.push(`/recipes${qs ? `?${qs}` : ""}`);
  }

  const active = SORT_OPTIONS.find((o) => o.value === current) ?? SORT_OPTIONS[0];
  const Icon = active.icon;

  return (
    <div className="shrink-0 flex items-center gap-1">
      <button
        onClick={() => setView(view === "grid" ? "list" : "grid")}
        className="p-1.5 text-gray-400 dark:text-[#555] hover:text-gray-700 dark:hover:text-[#b8b8b8] transition-colors"
        title={view === "grid" ? "Vizualizare listă" : "Vizualizare grid"}
      >
        {view === "grid" ? <List size={17} /> : <LayoutGrid size={17} />}
      </button>
      <button
        onClick={cycleSort}
        className="p-1.5 text-gray-400 dark:text-[#555] hover:text-gray-700 dark:hover:text-[#b8b8b8] transition-colors"
        title={active.label}
      >
        <Icon size={17} />
      </button>
    </div>
  );
}
