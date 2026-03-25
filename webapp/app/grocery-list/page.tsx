"use client";

import { useState, useEffect, useCallback } from "react";
import { getGroceryList } from "@/lib/actions";
import { ChevronLeft, ChevronRight, ShoppingCart, Check, Loader2 } from "lucide-react";

const CATEGORY_ICONS: Record<string, string> = {
  "🍎 Fruits": "🍎",
  "🥕 Veg & Legumes": "🥕",
  "🌾 Grains": "🌾",
  "🫙 Pantry": "🫙",
  "🥩 Meat & Alt": "🥩",
  "🥛 Dairy": "🥛",
  "🥫 Canned": "🥫",
  "🫕 Sauces & Condiments": "🫕",
  "🥜 Nuts & Seeds": "🥜",
  "🧂Fresh Herbs & Spices": "🧂",
  "🌵 Dried Herbs & Spices": "🌵",
  "🥑 Healthy Fats": "🥑",
  "🍸 Drinks": "🍸",
  "🥘 Homemade Receipts": "🥘",
  "🧴 Supplies": "🧴",
  Other: "📦",
};

function getMondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatWeekRange(monday: Date): string {
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  return `${monday.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${sunday.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
}

type GroceryEntry = { id: string; name: string; quantity: number; unit: string | null; category: string };

export default function GroceryListPage() {
  const [weekStart, setWeekStart] = useState(() => getMondayOf(new Date()));
  const [grouped, setGrouped] = useState<Record<string, GroceryEntry[]>>({});
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getGroceryList(weekStart.toISOString());
    setGrouped(data);
    setChecked(new Set());
    setLoading(false);
  }, [weekStart]);

  useEffect(() => { load(); }, [load]);

  const toggleCheck = (id: string) =>
    setChecked((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const allItems = Object.values(grouped).flat();
  const totalCount = allItems.length;
  const checkedCount = allItems.filter((i) => checked.has(i.id)).length;

  const sortedCategories = Object.keys(grouped).sort((a, b) => {
    const order = Object.keys(CATEGORY_ICONS);
    return (order.indexOf(a) ?? 99) - (order.indexOf(b) ?? 99);
  });

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-[#e3e3e3]">Grocery List</h1>
          {totalCount > 0 && (
            <p className="text-sm text-gray-500 dark:text-[#787878] mt-0.5">
              {checkedCount}/{totalCount} items checked
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; })}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-[#2a2a2a] rounded-lg text-gray-500 dark:text-[#787878]"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-medium text-gray-700 dark:text-[#b8b8b8] text-center">
            {formatWeekRange(weekStart)}
          </span>
          <button
            onClick={() => setWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; })}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-[#2a2a2a] rounded-lg text-gray-500 dark:text-[#787878]"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="mb-6 h-1.5 bg-gray-100 dark:bg-[#2a2a2a] rounded-full overflow-hidden">
          <div
            className="h-full bg-orange-500 transition-all duration-300"
            style={{ width: `${(checkedCount / totalCount) * 100}%` }}
          />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={20} className="animate-spin text-gray-400" />
        </div>
      ) : totalCount === 0 ? (
        <div className="text-center py-20 text-gray-400 dark:text-[#555555]">
          <ShoppingCart size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No items this week</p>
          <p className="text-sm mt-1">Add recipes to your planner to generate a list</p>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedCategories.map((cat) => {
            const items = grouped[cat];
            const icon = CATEGORY_ICONS[cat] ?? "📦";
            const catName = cat.replace(/^[^\w\s]+\s*/, ""); // strip emoji prefix
            const allCatChecked = items.every((i) => checked.has(i.id));

            return (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-2">
                  <span>{icon}</span>
                  <h2 className={`text-sm font-semibold ${allCatChecked ? "text-gray-300 dark:text-[#444444]" : "text-gray-700 dark:text-[#b8b8b8]"}`}>
                    {catName}
                  </h2>
                  <span className="text-xs text-gray-400 dark:text-[#555555]">({items.length})</span>
                </div>

                <ul className="space-y-1">
                  {items.map((item) => {
                    const done = checked.has(item.id);
                    return (
                      <li key={item.id}>
                        <button
                          onClick={() => toggleCheck(item.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                            done ? "opacity-40" : "hover:bg-gray-50 dark:hover:bg-[#2f2f2f]"
                          }`}
                        >
                          <div
                            className={`w-6 h-6 rounded border flex items-center justify-center shrink-0 transition-colors ${
                              done
                                ? "bg-orange-500 border-orange-500"
                                : "border-gray-300 dark:border-[#4a4a4a]"
                            }`}
                          >
                            {done && <Check size={14} className="text-white" strokeWidth={3} />}
                          </div>
                          <span className={`flex-1 text-[15px] ${done ? "line-through decoration-orange-500 text-gray-400 dark:text-[#555555]" : "text-gray-700 dark:text-[#b8b8b8]"}`}>
                            {item.name}
                          </span>
                          {item.quantity > 0 && (
                            <span className={`text-[15px] font-medium ${done ? "text-gray-300 dark:text-[#444444]" : "text-gray-900 dark:text-[#e3e3e3]"}`}>
                              {item.quantity}
                              {item.unit && ` ${item.unit}`}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
