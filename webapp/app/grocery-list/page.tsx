"use client";

import { useState, useEffect, useCallback, useRef, type FormEvent } from "react";
import { getGroceryList, addGroceryListItem, deleteGroceryListItem } from "@/lib/actions";
import { groceryCategoryLabel } from "@/lib/labels";
import { ChevronLeft, ChevronRight, ShoppingCart, Loader2, Trash2, Plus } from "lucide-react";

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
  return `${monday.toLocaleDateString("en-US", { day: "numeric", month: "short" })} – ${sunday.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}`;
}

type GroceryEntry = { id: string; name: string; quantity: number; unit: string | null; category: string; manual?: boolean };

const INPUT_CLS =
  "px-3 py-2.5 text-sm bg-white dark:bg-[#24211c] border border-gray-200 dark:border-[#3a352e] text-gray-900 dark:text-[#eae5de] placeholder:text-gray-400 dark:placeholder:text-[#5c554b] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400";

export default function GroceryListPage() {
  const [weekStart, setWeekStart] = useState(() => getMondayOf(new Date()));
  const [grouped, setGrouped] = useState<Record<string, GroceryEntry[]>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [isStuck, setIsStuck] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Hand-added ("manual") products for this week.
  const [newName, setNewName] = useState("");
  const [newQty, setNewQty] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [newCategory, setNewCategory] = useState("Other");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

  const checkedKey = `grocery-checked:${weekStart.toISOString()}`;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await getGroceryList(weekStart.toISOString());
      setGrouped(data);
      // Restore this week's ticked items (persisted per-device) instead of wiping them,
      // so checkmarks survive a refresh or a tab switch mid-shop on mobile.
      try {
        const saved = localStorage.getItem(`grocery-checked:${weekStart.toISOString()}`);
        setChecked(saved ? new Set(JSON.parse(saved) as string[]) : new Set());
      } catch {
        setChecked(new Set());
      }
    } catch {
      setGrouped({});
      setLoadError(true); // show an error + retry instead of a false "no items"
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => { load(); }, [load]);

  // Persist on toggle (keyed to the current week) rather than in an effect: a
  // week-change re-render updates checkedKey before load() flips `loading`, so an
  // effect could write the old week's ticks under the new week's key.
  const toggleCheck = (id: string) =>
    setChecked((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      try { localStorage.setItem(checkedKey, JSON.stringify([...n])); } catch { /* non-fatal */ }
      return n;
    });

  async function handleAddItem(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name || adding) return;
    setAdding(true);
    setAddError(false);
    try {
      const entry = await addGroceryListItem(weekStart.toISOString(), {
        name,
        quantity: newQty ? parseFloat(newQty) : null,
        unit: newUnit.trim() || null,
        category: newCategory || "Other",
      });
      // Insert into the right category, keeping the alphabetical order load() uses.
      setGrouped((prev) => {
        const next = { ...prev };
        const arr = [...(next[entry.category] ?? []), entry].sort((a, b) => a.name.localeCompare(b.name));
        next[entry.category] = arr;
        return next;
      });
      setNewName(""); setNewQty(""); setNewUnit(""); // keep category for repeated adds
    } catch {
      setAddError(true); // no silent failure — keep inputs, show the error
    } finally {
      setAdding(false);
    }
  }

  async function handleDeleteItem(entryId: string) {
    const dbId = entryId.replace(/^manual::/, "");
    const prev = grouped;
    setDeleteError(false);
    // Optimistic removal; drop now-empty categories.
    setGrouped((g) => {
      const next: Record<string, GroceryEntry[]> = {};
      for (const [cat, items] of Object.entries(g)) {
        const filtered = items.filter((i) => i.id !== entryId);
        if (filtered.length) next[cat] = filtered;
      }
      return next;
    });
    try {
      await deleteGroceryListItem(dbId);
    } catch {
      setGrouped(prev); // roll back to the pre-delete list
      setDeleteError(true);
    }
  }

  const allItems = Object.values(grouped).flat();
  const totalCount = allItems.length;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const obs = new IntersectionObserver(([e]) => setIsStuck(!e.isIntersecting), { threshold: 0 });
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [loading, totalCount]);
  const checkedCount = allItems.filter((i) => checked.has(i.id)).length;

  const sortedCategories = Object.keys(grouped).sort((a, b) => {
    const order = Object.keys(CATEGORY_ICONS);
    return (order.indexOf(a) ?? 99) - (order.indexOf(b) ?? 99);
  });

  const addForm = (
    <form onSubmit={handleAddItem} className="space-y-2">
      <input
        value={newName}
        onChange={(e) => { setNewName(e.target.value); if (addError) setAddError(false); }}
        placeholder="Product (e.g. napkins)"
        aria-label="Product name"
        className={`w-full ${INPUT_CLS}`}
      />
      <div className="flex gap-2">
        <input
          value={newQty}
          onChange={(e) => setNewQty(e.target.value)}
          inputMode="decimal" type="number" step="0.1" min="0"
          placeholder="Qty"
          aria-label="Quantity"
          className={`w-20 ${INPUT_CLS}`}
        />
        <input
          value={newUnit}
          onChange={(e) => setNewUnit(e.target.value)}
          placeholder="pcs"
          aria-label="Unit"
          className={`w-20 ${INPUT_CLS}`}
        />
        <select
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          aria-label="Category"
          className={`flex-1 min-w-0 ${INPUT_CLS}`}
        >
          {Object.keys(CATEGORY_ICONS).map((cat) => (
            <option key={cat} value={cat}>
              {CATEGORY_ICONS[cat]} {groceryCategoryLabel(cat)}
            </option>
          ))}
        </select>
      </div>
      {addError && (
        <p className="text-sm text-red-600 dark:text-red-400">Could not add the product. Please try again.</p>
      )}
      <button
        type="submit"
        disabled={adding || !newName.trim()}
        className="w-full py-2.5 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-40 flex items-center justify-center gap-2 transition-colors"
      >
        {adding ? <Loader2 size={15} className="animate-spin" /> : <Plus size={16} />}
        Add product
      </button>
    </form>
  );

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-[#eae5de]">Shopping list</h1>
          {totalCount > 0 && (
            <p className="text-sm text-gray-500 dark:text-[#7c756a] mt-0.5">
              {checkedCount}/{totalCount} items checked
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; })}
            aria-label="Previous week"
            className="p-3 hover:bg-gray-100 dark:hover:bg-[#2a2620] rounded-lg text-gray-500 dark:text-[#7c756a]"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-medium text-gray-700 dark:text-[#bab2a6] text-center">
            {formatWeekRange(weekStart)}
          </span>
          <button
            onClick={() => setWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; })}
            aria-label="Next week"
            className="p-3 hover:bg-gray-100 dark:hover:bg-[#2a2620] rounded-lg text-gray-500 dark:text-[#7c756a]"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {deleteError && (
        <p className="mb-4 text-sm text-red-600 dark:text-red-400">Could not delete the product. Please try again.</p>
      )}

      {/* Sticky: chips + progress bar */}
      {!loading && totalCount > 0 && (
        <>
          {/* Sentinel — triggers isStuck when scrolled past */}
          <div ref={sentinelRef} className="h-0" />

          <div className="sticky-safe-top z-10 -mx-4 md:-mx-8 mb-4" style={{ backgroundColor: "var(--color-bg-base)" }}>
            {/* Progress bar — rounded above chips when not stuck */}
            {!isStuck && (
              <div className="mx-4 md:mx-8 mt-2 mb-2 h-1.5 bg-gray-100 dark:bg-[#2a2620] rounded-full overflow-hidden">
                <div className="h-full bg-orange-500 transition-all duration-300"
                  style={{ width: `${(checkedCount / totalCount) * 100}%` }} />
              </div>
            )}

            {/* Chips row */}
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none px-4 md:px-8 pt-2 pb-2">
              {sortedCategories.map((cat) => {
                const icon = CATEGORY_ICONS[cat] ?? "📦";
                const catName = groceryCategoryLabel(cat);
                const allCatChecked = grouped[cat].every((i) => checked.has(i.id));
                return (
                  <button
                    key={cat}
                    onClick={() => document.getElementById(`cat-${cat}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    className={`shrink-0 flex items-center gap-1 px-2.5 py-2 rounded-full text-xs font-medium border transition-colors ${
                      allCatChecked
                        ? "border-gray-100 dark:border-[#2e2a24] text-gray-300 dark:text-[#4a443c]"
                        : "border-gray-200 dark:border-[#3a352e] text-gray-600 dark:text-[#a49c90] hover:border-orange-300 dark:hover:border-orange-800 hover:text-orange-600 dark:hover:text-orange-400 bg-white dark:bg-[#24211c]"
                    }`}
                  >
                    <span>{icon}</span>
                    {catName}
                  </button>
                );
              })}
            </div>

            {/* Progress bar — thin full-width under chips when stuck */}
            {isStuck && (
              <div className="h-[3px] bg-gray-100 dark:bg-[#2a2620]">
                <div className="h-full bg-orange-500 transition-all duration-300"
                  style={{ width: `${(checkedCount / totalCount) * 100}%` }} />
              </div>
            )}
          </div>
        </>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={20} className="animate-spin text-gray-400" />
        </div>
      ) : loadError ? (
        <div className="text-center py-20 text-gray-500 dark:text-[#7c756a]">
          <p className="font-medium">Could not load the list</p>
          <button
            onClick={() => load()}
            className="mt-3 px-4 py-2 text-sm font-medium bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
          >
            Retry
          </button>
        </div>
      ) : totalCount === 0 ? (
        <div>
          <div className="text-center py-14 text-gray-400 dark:text-[#5c554b]">
            <ShoppingCart size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">No items this week</p>
            <p className="text-sm mt-1">Add recipes to the planner or a product directly below</p>
          </div>
          {addForm}
        </div>
      ) : (
        <div className="space-y-6">
          {sortedCategories.map((cat) => {
            const items = grouped[cat];
            const icon = CATEGORY_ICONS[cat] ?? "📦";
            const catName = groceryCategoryLabel(cat); // strip emoji prefix
            const allCatChecked = items.every((i) => checked.has(i.id));

            return (
              <div key={cat} id={`cat-${cat}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span>{icon}</span>
                  <h2 className={`text-sm font-semibold ${allCatChecked ? "text-gray-300 dark:text-[#4a443c]" : "text-gray-700 dark:text-[#bab2a6]"}`}>
                    {catName}
                  </h2>
                  <span className="text-xs text-gray-400 dark:text-[#5c554b]">({items.length})</span>
                </div>

                <ul className="space-y-1">
                  {items.map((item) => {
                    const done = checked.has(item.id);
                    return (
                      <li key={item.id}>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => toggleCheck(item.id)}
                            className="flex-1 min-w-0 flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors hover:bg-gray-50 dark:hover:bg-[#2c2822] active:bg-orange-50 dark:active:bg-orange-950/20"
                          >
                            {/* Checkbox — matches the recipe ingredient checkbox (RecipeDetail) */}
                            <span
                              className={`w-6 h-6 shrink-0 rounded-md border-2 flex items-center justify-center transition-colors ${
                                done
                                  ? "bg-orange-400 border-orange-400"
                                  : "border-gray-300 dark:border-[#5c554b]"
                              }`}
                            >
                              {done && (
                                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 10 8">
                                  <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </span>
                            <span className={`flex-1 min-w-0 truncate text-base ${done ? "line-through text-gray-400 dark:text-[#ffffff]" : "text-gray-700 dark:text-[#bab2a6]"}`}>
                              {item.name}
                            </span>
                            {item.quantity > 0 && (
                              <span className={`shrink-0 text-base font-medium ${done ? "line-through text-gray-400 dark:text-[#eae5de]" : "text-gray-900 dark:text-[#eae5de]"}`}>
                                {item.quantity}
                                {item.unit && ` ${item.unit}`}
                              </span>
                            )}
                          </button>
                          {item.manual && (
                            <button
                              onClick={() => handleDeleteItem(item.id)}
                              aria-label={`Delete ${item.name}`}
                              className="shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-300 dark:text-[#5c554b] hover:text-red-500 dark:hover:text-red-400 rounded-lg transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}

          {/* Add a product by hand to this week */}
          <div className="border-t border-gray-100 dark:border-[#2a2620] pt-5">
            <p className="text-sm font-semibold text-gray-700 dark:text-[#bab2a6] mb-2.5">Add product</p>
            {addForm}
          </div>
        </div>
      )}
    </div>
  );
}
