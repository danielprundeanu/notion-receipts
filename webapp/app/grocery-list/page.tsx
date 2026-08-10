"use client";

import { useState, useEffect, useCallback, useRef, type FormEvent } from "react";
import {
  getGroceryList,
  addGroceryListItem,
  deleteGroceryListItem,
  copyGroceryListItems,
  deleteGroceryListItems,
} from "@/lib/actions";
import { groceryCategoryLabel } from "@/lib/labels";
import { ChevronLeft, ChevronRight, ShoppingCart, Loader2, Trash2, Plus, Copy, ClipboardPaste, X } from "lucide-react";

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

// Copy/paste of hand-added products between weeks. The clipboard is app-internal
// (localStorage) rather than the OS clipboard: reading the system clipboard needs a
// user gesture and prompts on iOS, so a "Paste" button couldn't appear reliably —
// and an unrelated copy elsewhere would silently lose the list. Kept per-device, it
// also survives a refresh and can be pasted into several weeks in a row.
const CLIPBOARD_KEY = "grocery-clipboard";
const COPYABLE_CATEGORY = "Other";

type ClipItem = { name: string; quantity: number; unit: string | null; category: string };

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

  // ── Copy / paste of hand-added products between weeks ──
  const [selectMode, setSelectMode] = useState(false);
  const [selectedForCopy, setSelectedForCopy] = useState<Set<string>>(new Set());
  const [clipboard, setClipboard] = useState<ClipItem[]>([]);
  const [pasting, setPasting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; error?: boolean; undo?: () => void } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string, opts?: { error?: boolean; undo?: () => void }) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, error: opts?.error, undo: opts?.undo });
    // Undo needs longer to be reachable than a plain confirmation.
    toastTimer.current = setTimeout(() => setToast(null), opts?.undo ? 8000 : 3500);
  }

  // Restore the clipboard once on mount (kept across weeks and reloads).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CLIPBOARD_KEY);
      if (saved) setClipboard(JSON.parse(saved) as ClipItem[]);
    } catch { /* ignore a corrupt payload */ }
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  // Leaving select mode whenever the week changes avoids acting on a stale selection.
  useEffect(() => {
    setSelectMode(false);
    setSelectedForCopy(new Set());
  }, [weekStart]);

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

  // Only hand-added products can be copied — recipe-derived lines are computed from
  // the planner, so copying them would create duplicates that double up once the
  // recipe is planned in the target week too.
  const copyableItems = (grouped[COPYABLE_CATEGORY] ?? []).filter((i) => i.manual);

  function handleCopy() {
    // No explicit selection → copy the whole category (the "copy before select" case).
    const source = selectMode && selectedForCopy.size > 0
      ? copyableItems.filter((i) => selectedForCopy.has(i.id))
      : copyableItems;
    if (!source.length) {
      showToast("There are no hand-added products to copy", { error: true });
      return;
    }
    const payload: ClipItem[] = source.map(({ name, quantity, unit, category }) => ({ name, quantity, unit, category }));
    setClipboard(payload);
    try {
      localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(payload));
    } catch { /* quota/private mode — the in-memory copy still works this session */ }
    setSelectMode(false);
    setSelectedForCopy(new Set());
    // "Undo" here discards the copy — the only way to make the Paste button go away
    // once you're done carrying products over.
    showToast(
      `${payload.length} product${payload.length === 1 ? "" : "s"} copied — open another week to paste`,
      { undo: () => { clearClipboard(); setToast(null); } }
    );
  }

  function clearClipboard() {
    setClipboard([]);
    try { localStorage.removeItem(CLIPBOARD_KEY); } catch { /* non-fatal */ }
  }

  async function handlePaste() {
    if (!clipboard.length || pasting) return;
    setPasting(true);
    try {
      const { added, skipped } = await copyGroceryListItems(weekStart.toISOString(), clipboard);
      if (added.length) {
        setGrouped((prev) => {
          const next = { ...prev };
          for (const entry of added) {
            next[entry.category] = [...(next[entry.category] ?? []), entry]
              .sort((a, b) => a.name.localeCompare(b.name));
          }
          return next;
        });
      }
      const parts = [`${added.length} added`];
      if (skipped) parts.push(`${skipped} already here`);
      showToast(
        added.length ? parts.join(" · ") : "All of them were already in this week",
        added.length ? { undo: () => undoPaste(added.map((e) => e.id)) } : undefined
      );
    } catch {
      showToast("Could not paste the products. Please try again.", { error: true });
    } finally {
      setPasting(false);
    }
  }

  async function undoPaste(entryIds: string[]) {
    const prev = grouped;
    const ids = new Set(entryIds);
    setToast(null);
    setGrouped((g) => {
      const next: Record<string, GroceryEntry[]> = {};
      for (const [cat, items] of Object.entries(g)) {
        const filtered = items.filter((i) => !ids.has(i.id));
        if (filtered.length) next[cat] = filtered;
      }
      return next;
    });
    try {
      await deleteGroceryListItems(entryIds.map((id) => id.replace(/^manual::/, "")));
    } catch {
      setGrouped(prev); // roll back the rollback — the products are still there
      showToast("Could not undo. The products are still in the list.", { error: true });
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

  // With something copied, always show the target category — otherwise a week that
  // has no "Other" items yet would offer nowhere to paste.
  const visibleCategories = clipboard.length && !sortedCategories.includes(COPYABLE_CATEGORY)
    ? [...sortedCategories, COPYABLE_CATEGORY]
    : sortedCategories;

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
      {/* Copy/paste feedback — sits above the bottom nav on mobile */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 pl-4 pr-2 py-2.5 rounded-lg shadow-lg text-sm font-medium max-w-[92vw] ${
            toast.error ? "bg-red-600 text-white" : "bg-gray-900 dark:bg-[#3a352e] text-white"
          }`}
        >
          <span className="min-w-0">{toast.msg}</span>
          {toast.undo && (
            <button
              onClick={toast.undo}
              className="shrink-0 px-2.5 py-1 rounded-md font-semibold text-orange-300 hover:text-orange-200 hover:bg-white/10 transition-colors"
            >
              Undo
            </button>
          )}
          <button
            onClick={() => setToast(null)}
            aria-label="Dismiss"
            className="shrink-0 p-1 rounded-md text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

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
            {/* An empty week has no category rows, so surface the paste here too. */}
            {clipboard.length > 0 && (
              <button
                onClick={handlePaste}
                disabled={pasting}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-900 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-950/20 disabled:opacity-40 transition-colors"
              >
                {pasting ? <Loader2 size={15} className="animate-spin" /> : <ClipboardPaste size={15} />}
                Paste {clipboard.length} copied product{clipboard.length === 1 ? "" : "s"}
              </button>
            )}
          </div>
          {addForm}
        </div>
      ) : (
        <div className="space-y-6">
          {visibleCategories.map((cat) => {
            const items = grouped[cat] ?? [];
            const icon = CATEGORY_ICONS[cat] ?? "📦";
            const catName = groceryCategoryLabel(cat); // strip emoji prefix
            const allCatChecked = items.length > 0 && items.every((i) => checked.has(i.id));
            const isCopyable = cat === COPYABLE_CATEGORY;
            const allCopySelected = copyableItems.length > 0 && copyableItems.every((i) => selectedForCopy.has(i.id));

            return (
              <div key={cat} id={`cat-${cat}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span>{icon}</span>
                  <h2 className={`text-sm font-semibold ${allCatChecked ? "text-gray-300 dark:text-[#4a443c]" : "text-gray-700 dark:text-[#bab2a6]"}`}>
                    {catName}
                  </h2>
                  <span className="text-xs text-gray-400 dark:text-[#5c554b]">({items.length})</span>

                  {/* Copy / paste of hand-added products — right-aligned on this category */}
                  {isCopyable && (
                    <div className="ml-auto flex items-center gap-0.5">
                      {selectMode ? (
                        <>
                          <button
                            onClick={() =>
                              setSelectedForCopy(allCopySelected ? new Set() : new Set(copyableItems.map((i) => i.id)))
                            }
                            className="px-2 py-1.5 text-xs font-medium text-gray-500 dark:text-[#a49c90] hover:text-gray-700 dark:hover:text-[#bab2a6] transition-colors"
                          >
                            {allCopySelected ? "None" : "All"}
                          </button>
                          <button
                            onClick={() => { setSelectMode(false); setSelectedForCopy(new Set()); }}
                            className="px-2 py-1.5 text-xs font-medium text-gray-400 dark:text-[#5c554b] hover:text-gray-600 dark:hover:text-[#a49c90] transition-colors"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        copyableItems.length > 0 && (
                          <button
                            onClick={() => setSelectMode(true)}
                            className="px-2 py-1.5 text-xs font-medium text-gray-500 dark:text-[#a49c90] hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
                          >
                            Select
                          </button>
                        )
                      )}

                      {copyableItems.length > 0 && (
                        <button
                          onClick={handleCopy}
                          aria-label={
                            selectMode && selectedForCopy.size > 0
                              ? `Copy ${selectedForCopy.size} selected products`
                              : `Copy all ${copyableItems.length} products`
                          }
                          title={
                            selectMode && selectedForCopy.size > 0
                              ? `Copy ${selectedForCopy.size} selected`
                              : `Copy all ${copyableItems.length}`
                          }
                          className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-gray-400 dark:text-[#5c554b] hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/20 transition-colors"
                        >
                          <Copy size={16} />
                        </button>
                      )}

                      {clipboard.length > 0 && (
                        <button
                          onClick={handlePaste}
                          disabled={pasting}
                          aria-label={`Paste ${clipboard.length} copied products`}
                          title={`Paste ${clipboard.length} copied`}
                          className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-orange-500 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/20 disabled:opacity-40 transition-colors"
                        >
                          {pasting ? <Loader2 size={16} className="animate-spin" /> : <ClipboardPaste size={16} />}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <ul className="space-y-1">
                  {items.map((item) => {
                    const done = checked.has(item.id);
                    // In select mode this category's hand-added rows pick items for
                    // copying instead of ticking them off the shopping list.
                    const selectable = isCopyable && selectMode && !!item.manual;
                    const picked = selectedForCopy.has(item.id);
                    if (selectable) {
                      return (
                        <li key={item.id}>
                          <button
                            onClick={() =>
                              setSelectedForCopy((prev) => {
                                const n = new Set(prev);
                                if (n.has(item.id)) n.delete(item.id); else n.add(item.id);
                                return n;
                              })
                            }
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                              picked ? "bg-orange-50 dark:bg-orange-950/20" : "hover:bg-gray-50 dark:hover:bg-[#2c2822]"
                            }`}
                          >
                            {/* Round checkbox — signals "selecting to copy", not "bought" */}
                            <span
                              className={`w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ${
                                picked ? "bg-orange-500 border-orange-500" : "border-gray-300 dark:border-[#5c554b]"
                              }`}
                            >
                              {picked && (
                                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 10 8">
                                  <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </span>
                            <span className="flex-1 min-w-0 truncate text-base text-gray-700 dark:text-[#bab2a6]">
                              {item.name}
                            </span>
                            {item.quantity > 0 && (
                              <span className="shrink-0 text-base font-medium text-gray-900 dark:text-[#eae5de]">
                                {item.quantity}
                                {item.unit && ` ${item.unit}`}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    }
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
