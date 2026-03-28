"use client";

import { useRouter } from "next/navigation";
import { ArrowUpDown } from "lucide-react";

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

  function handleChange(sort: string) {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (cat) p.set("cat", cat);
    if (fav) p.set("fav", fav);
    if (sort !== "name_asc") p.set("sort", sort);
    const qs = p.toString();
    router.push(`/recipes${qs ? `?${qs}` : ""}`);
  }

  return (
    <div className="shrink-0 flex items-center gap-1.5">
      <ArrowUpDown size={13} className="text-gray-400 dark:text-[#555555]" />
      <select
        value={current}
        onChange={(e) => handleChange(e.target.value)}
        className="text-xs font-semibold text-gray-700 dark:text-[#b8b8b8] bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#3a3a3a] rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-400 cursor-pointer"
      >
        <option value="name_asc">A–Z</option>
        <option value="date_desc">Newest</option>
        <option value="date_asc">Oldest</option>
      </select>
    </div>
  );
}
