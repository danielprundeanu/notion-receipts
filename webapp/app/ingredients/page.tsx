"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  getGroceryItems,
  updateGroceryItem,
  deleteGroceryItems,
  setGroceryItemsCategory,
} from "@/lib/actions";
import {
  Search, Pencil, ChevronUp, ChevronDown, ChevronsUpDown, Plus, ScanSearch,
  X, Trash2, Sparkles, ListChecks, Loader2, List, Table,
} from "lucide-react";
import GroceryItemModal from "@/components/GroceryItemModal";
import { GROCERY_CATEGORIES } from "@/lib/constants";
import { groceryCategoryLabel } from "@/lib/labels";

type GroceryItem = {
  id: string;
  name: string;
  nameRo: string | null;
  category: string | null;
  unit: string | null;
  unit2: string | null;
  conversion: number | null;
  kcal: number | null;
  carbs: number | null;
  fat: number | null;
  protein: number | null;
  unitWeight: number | null;
  createdAt: Date;
};

type NumField = "conversion" | "kcal" | "carbs" | "fat" | "protein" | "unitWeight";
type TextField = "name" | "nameRo" | "category" | "unit" | "unit2";
type EditableField = TextField | NumField;
type SortField = keyof Omit<GroceryItem, "id">;
type SortDir = "asc" | "desc" | null;

const NUM_FIELDS: NumField[] = ["conversion", "kcal", "carbs", "fat", "protein", "unitWeight"];

function fmt(n: number | null): string {
  if (n == null) return "";
  return (Math.round(n * 10) / 10).toString();
}

function displayNum(n: number | null): string {
  if (n == null) return "—";
  return (Math.round(n * 10) / 10).toString();
}

// ─── Editable Cell (text / number) ─────────────────────────────────────────────

function EditableCell({
  value,
  isNumber,
  align = "left",
  onSave,
  placeholder = "—",
}: {
  value: string | number | null;
  isNumber?: boolean;
  align?: "left" | "right";
  onSave: (val: string) => void;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setDraft(value != null ? String(value) : "");
    setEditing(true);
  }

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commit() {
    setEditing(false);
    onSave(draft.trim());
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") setEditing(false);
  }

  const displayVal = isNumber
    ? displayNum(value as number | null)
    : (value as string | null) ?? placeholder;

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        type={isNumber ? "number" : "text"}
        step={isNumber ? "0.1" : undefined}
        className={`w-full px-1.5 py-0.5 text-sm border border-orange-400 rounded focus:outline-none bg-white dark:bg-[#2a2620] text-gray-900 dark:text-[#eae5de] ${align === "right" ? "text-right" : "text-left"}`}
        style={{ minWidth: 40 }}
      />
    );
  }

  return (
    <span
      onClick={startEdit}
      title="Click to edit"
      className={`block cursor-pointer rounded px-1 py-0.5 -mx-1 hover:bg-orange-50 dark:hover:bg-orange-950/30 hover:text-orange-900 dark:hover:text-orange-300 transition-colors ${
        !value && value !== 0 ? "text-gray-300" : ""
      } ${align === "right" ? "text-right" : ""}`}
    >
      {displayVal}
    </span>
  );
}

// ─── Select Cell (dropdown, e.g. category) ─────────────────────────────────────
// Same click-to-edit behaviour as EditableCell, but commits from a <select>.
// Preserves the current value if it isn't in `options` (nothing gets lost).

function SelectCell({
  value,
  options,
  onSave,
  placeholder = "—",
}: {
  value: string | null;
  options: string[];
  onSave: (val: string) => void;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  const opts = value && !options.includes(value) ? [value, ...options] : options;

  if (editing) {
    return (
      <select
        ref={ref}
        value={value ?? ""}
        onChange={(e) => { setEditing(false); onSave(e.target.value); }}
        onBlur={() => setEditing(false)}
        className="w-full px-1.5 py-0.5 text-sm border border-orange-400 rounded focus:outline-none bg-white dark:bg-[#2a2620] text-gray-900 dark:text-[#eae5de]"
      >
        <option value="">{placeholder}</option>
        {opts.map((o) => <option key={o} value={o}>{groceryCategoryLabel(o)}</option>)}
      </select>
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      title="Click to edit"
      className={`block cursor-pointer rounded px-1 py-0.5 -mx-1 hover:bg-orange-50 dark:hover:bg-orange-950/30 hover:text-orange-900 dark:hover:text-orange-300 transition-colors ${
        !value ? "text-gray-300" : ""
      }`}
    >
      {value ? groceryCategoryLabel(value) : placeholder}
    </span>
  );
}

// ─── Sort Header ──────────────────────────────────────────────────────────────

function SortTh({
  label,
  field,
  align = "left",
  sortField,
  sortDir,
  onSort,
}: {
  label: string;
  field: SortField;
  align?: "left" | "right";
  sortField: SortField | null;
  sortDir: SortDir;
  onSort: (f: SortField) => void;
}) {
  const active = sortField === field;
  const Icon = active && sortDir === "asc"
    ? ChevronUp
    : active && sortDir === "desc"
    ? ChevronDown
    : ChevronsUpDown;

  return (
    <th
      className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wide cursor-pointer select-none whitespace-nowrap group ${
        align === "right" ? "text-right" : ""
      } ${active ? "text-orange-500 dark:text-orange-400" : "text-gray-500 dark:text-[#7c756a]"}`}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {align === "right" && (
          <Icon
            size={12}
            className={active ? "text-orange-500 dark:text-orange-400" : "text-gray-300 dark:text-[#4a443c] group-hover:text-gray-400"}
          />
        )}
        {label}
        {align === "left" && (
          <Icon
            size={12}
            className={active ? "text-orange-500 dark:text-orange-400" : "text-gray-300 dark:text-[#4a443c] group-hover:text-gray-400"}
          />
        )}
      </span>
    </th>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IngredientsPage() {
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  // List (cards) vs. table view. Overrides the responsive default so the table
  // is reachable on mobile too (it scrolls horizontally there).
  const [view, setView] = useState<"list" | "table">("list");

  // Multi-select
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  // Transient error toast for inline-edit saves that fail (otherwise silent).
  const [toast, setToast] = useState<string | null>(null);
  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  useEffect(() => {
    getGroceryItems().then((data) => {
      setItems(data as GroceryItem[]);
      setLoading(false);
      // Deep link from the audit page (/ingredients?edit=<id>) opens that item's editor.
      const editId = new URLSearchParams(window.location.search).get("edit");
      if (editId) {
        setEditingId(editId);
        window.history.replaceState(null, "", "/ingredients");
      }
    }).catch(() => {
      setLoading(false); // don't leave the page stuck on "Loading…"
      showToast("Couldn't load the ingredient list. Please reload the page.");
    });
  }, []);

  // Restore the saved list/table preference; when none, default by viewport
  // (table on desktop, cards on mobile — matching the old responsive behaviour).
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ingredients-view");
      if (saved === "list" || saved === "table") { setView(saved); return; }
    } catch { /* ignore */ }
    if (window.matchMedia("(min-width: 768px)").matches) setView("table");
  }, []);

  function changeView(v: "list" | "table") {
    setView(v);
    try { localStorage.setItem("ingredients-view", v); } catch { /* non-fatal */ }
  }

  const categories = [...new Set(items.map((i) => i.category).filter(Boolean) as string[])].sort();

  function handleSort(field: SortField) {
    if (sortField !== field) {
      setSortField(field);
      setSortDir("desc");
    } else if (sortDir === "desc") {
      setSortDir("asc");
    } else {
      setSortField(null);
      setSortDir(null);
    }
  }

  const filtered = items.filter((item) => {
    const q = search.toLowerCase();
    const matchSearch = !search
      || item.name.toLowerCase().includes(q)
      || (item.nameRo?.toLowerCase().includes(q) ?? false);
    const matchCat = !category || item.category === category;
    return matchSearch && matchCat;
  });

  const sorted = sortField && sortDir
    ? [...filtered].sort((a, b) => {
        const av = a[sortField];
        const bv = b[sortField];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        const cmp = typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
        return sortDir === "asc" ? cmp : -cmp;
      })
    : filtered;

  async function handleSave(id: string, field: EditableField, raw: string) {
    const isNum = (NUM_FIELDS as string[]).includes(field);
    const value = raw === ""
      ? null
      : isNum ? parseFloat(raw) : raw;

    const prevValue = items.find((it) => it.id === id)?.[field];

    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );

    try {
      await updateGroceryItem(id, { [field]: value } as Parameters<typeof updateGroceryItem>[1]);
    } catch {
      // Revert the optimistic cell edit so the UI doesn't show an unsaved value.
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, [field]: prevValue } : item))
      );
      showToast("Couldn't save the change. Please try again.");
    }
  }

  // ── Multi-select helpers ──────────────────────────────────────────────────
  function toggleSelectMode() {
    setSelectMode((on) => {
      if (on) { setSelectedIds(new Set()); setConfirmBulkDelete(false); setBulkMsg(null); }
      return !on;
    });
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setConfirmBulkDelete(false);
  }

  // Changing the filter/search must drop any selection: a selection made against a
  // different view must never be bulk-acted on while those rows are off-screen.
  function clearSelectionIfAny() {
    if (selectedIds.size === 0) return;
    setSelectedIds(new Set());
    setConfirmBulkDelete(false);
  }
  function changeSearch(v: string) { setSearch(v); clearSelectionIfAny(); }
  function changeCategory(v: string) { setCategory(v); clearSelectionIfAny(); }

  const allVisibleSelected = sorted.length > 0 && sorted.every((i) => selectedIds.has(i.id));
  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) sorted.forEach((i) => next.delete(i.id));
      else sorted.forEach((i) => next.add(i.id));
      return next;
    });
    setConfirmBulkDelete(false);
  }

  const selectedCount = selectedIds.size;

  async function handleBulkCategory(cat: string) {
    if (!cat || selectedCount === 0) return;
    const ids = [...selectedIds];
    setBulkBusy(true);
    setBulkMsg(null);
    try {
      await setGroceryItemsCategory(ids, cat);
      setItems((prev) => prev.map((it) => selectedIds.has(it.id) ? { ...it, category: cat } : it));
      setBulkMsg(`Category set for ${ids.length} ${ids.length === 1 ? "item" : "items"}.`);
    } catch {
      setBulkMsg("Couldn't set the category. Please try again.");
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkDelete() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBulkBusy(true);
    setBulkMsg(null);
    try {
      const res = await deleteGroceryItems(ids);
      const deletedSet = new Set(res.deleted);
      setItems((prev) => prev.filter((it) => !deletedSet.has(it.id)));
      // Keep the blocked (still-used) items selected so the user sees which remained.
      setSelectedIds(new Set(res.blocked.map((b) => b.id)));
      setConfirmBulkDelete(false);
      if (res.blocked.length === 0) {
        setBulkMsg(`${res.deleted.length} ${res.deleted.length === 1 ? "item deleted" : "items deleted"}.`);
      } else if (res.deleted.length === 0) {
        setBulkMsg(`No items deleted — ${res.blocked.length} ${res.blocked.length === 1 ? "is used" : "are used"} in recipes.`);
      } else {
        setBulkMsg(`${res.deleted.length} deleted; ${res.blocked.length} kept (used in recipes).`);
      }
    } catch {
      setBulkMsg("Couldn't delete. Please try again.");
    } finally {
      setBulkBusy(false);
    }
  }

  // Autofill nutrition for selected items — fills only currently-empty macros.
  async function handleBulkAutofill() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBulkBusy(true);
    setBulkMsg(null);
    let filled = 0, skipped = 0;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      setBulkProgress({ done: i, total: ids.length });
      const item = items.find((it) => it.id === id);
      if (!item) { skipped++; continue; }
      const q = item.name?.trim() || item.nameRo?.trim();
      if (!q) { skipped++; continue; }
      try {
        const res = await fetch(`/api/nutrition?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (!res.ok || (data.kcal == null && data.protein == null)) { skipped++; continue; }
        // only fill fields that are currently empty
        const patch: Partial<GroceryItem> = {};
        if (item.kcal == null && data.kcal != null) patch.kcal = data.kcal;
        if (item.carbs == null && data.carbs != null) patch.carbs = data.carbs;
        if (item.fat == null && data.fat != null) patch.fat = data.fat;
        if (item.protein == null && data.protein != null) patch.protein = data.protein;
        if (Object.keys(patch).length === 0) { skipped++; continue; }
        await updateGroceryItem(id, patch as Parameters<typeof updateGroceryItem>[1]);
        setItems((prev) => prev.map((it) => it.id === id ? { ...it, ...patch } : it));
        filled++;
      } catch {
        skipped++;
      }
    }
    setBulkProgress(null);
    setBulkBusy(false);
    setBulkMsg(`Autofill: ${filled} filled, ${skipped} skipped (empty values only).`);
  }

  const sharedThProps = { sortField, sortDir, onSort: handleSort };
  const leadingCols = 1 + (selectMode ? 1 : 0); // edit icon (+ checkbox in select mode)
  const totalCols = leadingCols + 12;

  return (
    <div className="p-4 md:p-6">
      {toast && (
        <div
          role="alert"
          className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-medium shadow-lg max-w-[90vw] text-center"
        >
          {toast}
        </div>
      )}
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-[#eae5de]">Ingredients</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 dark:text-[#7c756a]">{items.length} items</span>
          <Link
            href="/ingredients/audit"
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-900/50 rounded-lg hover:bg-teal-50 dark:hover:bg-teal-950/30 transition-colors"
          >
            <ScanSearch size={15} /> Unit audit
          </Link>
          <button
            onClick={() => setCreatingNew(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-semibold hover:bg-orange-600 transition-colors"
          >
            <Plus size={15} /> New ingredient
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#5c554b]" />
          <input
            value={search}
            onChange={(e) => changeSearch(e.target.value)}
            placeholder="Search ingredient…"
            className="w-full pl-9 pr-9 py-2 text-sm bg-white dark:bg-[#24211c] border border-gray-200 dark:border-[#3a352e] text-gray-900 dark:text-[#eae5de] placeholder:text-gray-400 dark:placeholder:text-[#5c554b] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
          {search && (
            <button
              onClick={() => changeSearch("")}
              title="Clear search"
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 dark:text-[#6e675c] hover:text-gray-600 dark:hover:text-[#a49c90] rounded transition-colors"
            >
              <X size={15} />
            </button>
          )}
        </div>
        <select
          value={category}
          onChange={(e) => changeCategory(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 dark:border-[#3a352e] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white dark:bg-[#24211c] text-gray-800 dark:text-[#d8d0c4]"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{groceryCategoryLabel(c)}</option>
          ))}
        </select>
        <button
          onClick={toggleSelectMode}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
            selectMode
              ? "bg-orange-500 text-white border-orange-500 hover:bg-orange-600"
              : "text-gray-700 dark:text-[#bab2a6] border-gray-200 dark:border-[#3a352e] hover:bg-gray-50 dark:hover:bg-[#2c2822]"
          }`}
        >
          <ListChecks size={15} /> Select
        </button>

        {/* List / table view toggle */}
        <div className="flex items-center rounded-lg border border-gray-200 dark:border-[#3a352e] overflow-hidden">
          <button
            onClick={() => changeView("list")}
            aria-pressed={view === "list"}
            title="List view"
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
              view === "list"
                ? "bg-orange-500 text-white"
                : "text-gray-700 dark:text-[#bab2a6] hover:bg-gray-50 dark:hover:bg-[#2c2822]"
            }`}
          >
            <List size={15} /> <span className="hidden sm:inline">List</span>
          </button>
          <button
            onClick={() => changeView("table")}
            aria-pressed={view === "table"}
            title="Table view"
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
              view === "table"
                ? "bg-orange-500 text-white"
                : "text-gray-700 dark:text-[#bab2a6] hover:bg-gray-50 dark:hover:bg-[#2c2822]"
            }`}
          >
            <Table size={15} /> <span className="hidden sm:inline">Table</span>
          </button>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectMode && (
        <div className="flex flex-wrap items-center gap-3 mb-4 px-3 py-2.5 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/40 rounded-xl">
          <span className="text-sm font-medium text-gray-700 dark:text-[#c4bcb0]">
            {selectedCount > 0 ? `${selectedCount} selected` : "Select rows…"}
          </span>

          {selectedCount > 0 && (
            <>
              <select
                value=""
                disabled={bulkBusy}
                onChange={(e) => handleBulkCategory(e.target.value)}
                className="px-2.5 py-1.5 text-sm border border-gray-200 dark:border-[#3a352e] rounded-lg bg-white dark:bg-[#24211c] text-gray-800 dark:text-[#d8d0c4] focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:opacity-50"
              >
                <option value="">Set category…</option>
                {GROCERY_CATEGORIES.map((c) => <option key={c} value={c}>{groceryCategoryLabel(c)}</option>)}
              </select>

              <button
                onClick={handleBulkAutofill}
                disabled={bulkBusy}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-[#bab2a6] border border-gray-200 dark:border-[#3a352e] rounded-lg hover:bg-white dark:hover:bg-[#2c2822] disabled:opacity-50 transition-colors"
              >
                {bulkBusy && bulkProgress
                  ? <Loader2 size={14} className="animate-spin" />
                  : <Sparkles size={14} />}
                {bulkBusy && bulkProgress ? `Autofill ${bulkProgress.done}/${bulkProgress.total}…` : "Autofill nutrition"}
              </button>

              {confirmBulkDelete ? (
                <span className="flex items-center gap-2">
                  <button
                    onClick={handleBulkDelete}
                    disabled={bulkBusy}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    {bulkBusy && <Loader2 size={14} className="animate-spin" />}
                    Confirm delete ({selectedCount})
                  </button>
                  <button
                    onClick={() => setConfirmBulkDelete(false)}
                    className="px-2 py-1.5 text-sm text-gray-500 dark:text-[#a49c90] hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmBulkDelete(true)}
                  disabled={bulkBusy}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 transition-colors"
                >
                  <Trash2 size={14} /> Delete
                </button>
              )}

              <button
                onClick={() => { setSelectedIds(new Set()); setConfirmBulkDelete(false); }}
                className="ml-auto text-sm text-gray-500 dark:text-[#a49c90] hover:text-gray-700 dark:hover:text-[#c4bcb0]"
              >
                Deselect
              </button>
            </>
          )}

          {bulkMsg && (
            <span className="text-xs text-gray-500 dark:text-[#7c756a] w-full">{bulkMsg}</span>
          )}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
          Loading…
        </div>
      ) : (
        <>
        {/* Card / list view */}
        {view === "list" && (
        <div className="space-y-2">
          {sorted.length === 0 ? (
            <p className="px-4 py-8 text-center text-gray-400 text-sm">No ingredients found</p>
          ) : (
            sorted.map((item) => {
              const isSelected = selectedIds.has(item.id);
              return (
                <div
                  key={item.id}
                  onClick={() => (selectMode ? toggleOne(item.id) : setEditingId(item.id))}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-orange-50 dark:bg-orange-950/20 border-orange-300 dark:border-orange-800/50"
                      : "bg-white dark:bg-[#24211c] border-gray-200 dark:border-[#2e2a24] active:bg-gray-50 dark:active:bg-[#2a2620]"
                  }`}
                >
                  {selectMode && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleOne(item.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="accent-orange-500 shrink-0 w-4 h-4"
                      aria-label={`Select ${item.name}`}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 dark:text-[#eae5de] truncate">{item.name}</div>
                    <div className="text-xs text-gray-500 dark:text-[#7c756a] truncate">
                      {[item.nameRo, groceryCategoryLabel(item.category), item.unit].filter(Boolean).join(" · ") || "—"}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-600 dark:text-[#a49c90]">
                      <span className="font-medium text-gray-700 dark:text-[#bab2a6]">{item.kcal != null ? `${fmt(item.kcal)} kcal` : "— kcal"}</span>
                      <span>P {item.protein != null ? fmt(item.protein) : "—"}</span>
                      <span>C {item.carbs != null ? fmt(item.carbs) : "—"}</span>
                      <span>F {item.fat != null ? fmt(item.fat) : "—"}</span>
                    </div>
                  </div>
                  {!selectMode && <Pencil size={15} className="shrink-0 text-gray-300 dark:text-[#4a443c]" />}
                </div>
              );
            })
          )}
        </div>
        )}

        {/* Table view — scrolls horizontally on small screens */}
        {view === "table" && (
        <div className="overflow-auto rounded-xl border border-gray-200 dark:border-[#2e2a24]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-[#2a2620] text-left">
                {selectMode && (
                  <th className="px-3 py-2.5 w-10">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAllVisible}
                      className="accent-orange-500 cursor-pointer"
                      aria-label="Select all"
                    />
                  </th>
                )}
                <th className="px-2 py-2.5 w-10" />
                <SortTh label="Name (EN)"  field="name"       {...sharedThProps} />
                <SortTh label="Name (RO)"  field="nameRo"     {...sharedThProps} />
                <SortTh label="Category"   field="category"   {...sharedThProps} />
                <SortTh label="Unit"    field="unit"       {...sharedThProps} />
                <SortTh label="Unit 2"     field="unit2"      {...sharedThProps} />
                <SortTh label="Conv."      field="conversion" align="right" {...sharedThProps} />
                <SortTh label="g/unit"     field="unitWeight" align="right" {...sharedThProps} />
                <SortTh label="kcal"       field="kcal"       align="right" {...sharedThProps} />
                <SortTh label="Carbs g"    field="carbs"      align="right" {...sharedThProps} />
                <SortTh label="Fat g"      field="fat"        align="right" {...sharedThProps} />
                <SortTh label="Protein g"  field="protein"    align="right" {...sharedThProps} />
                <SortTh label="Created"    field="createdAt"  {...sharedThProps} />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-[#2e2a24]">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={totalCols} className="px-4 py-8 text-center text-gray-400">
                    No ingredients found
                  </td>
                </tr>
              ) : (
                sorted.map((item) => {
                  const isSelected = selectedIds.has(item.id);
                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors ${
                        isSelected
                          ? "bg-orange-50/60 dark:bg-orange-950/20"
                          : "hover:bg-gray-50/50 dark:hover:bg-[#24211c]"
                      }`}
                    >
                      {selectMode && (
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleOne(item.id)}
                            className="accent-orange-500 cursor-pointer"
                            aria-label={`Select ${item.name}`}
                          />
                        </td>
                      )}
                      <td className="px-2 py-2">
                        <button
                          onClick={() => setEditingId(item.id)}
                          title="Edit ingredient"
                          className="p-1.5 text-gray-400 dark:text-[#6e675c] hover:text-orange-500 dark:hover:text-orange-400 transition-colors rounded"
                        >
                          <Pencil size={14} />
                        </button>
                      </td>
                      <td className="px-4 py-2 font-medium text-gray-900 dark:text-[#eae5de]">
                        <EditableCell value={item.name} onSave={(v) => v && handleSave(item.id, "name", v)} />
                      </td>
                      <td className="px-4 py-2 text-gray-600 dark:text-[#a49c90]">
                        <EditableCell value={item.nameRo} onSave={(v) => handleSave(item.id, "nameRo", v)} placeholder="—" />
                      </td>
                      <td className="px-4 py-2 text-gray-600 dark:text-[#a49c90] min-w-[9rem]">
                        <SelectCell value={item.category} options={GROCERY_CATEGORIES} onSave={(v) => handleSave(item.id, "category", v)} />
                      </td>
                      <td className="px-4 py-2 text-gray-600 dark:text-[#a49c90]">
                        <EditableCell value={item.unit} onSave={(v) => handleSave(item.id, "unit", v)} />
                      </td>
                      <td className="px-4 py-2 text-gray-600 dark:text-[#a49c90]">
                        <EditableCell value={item.unit2} onSave={(v) => handleSave(item.id, "unit2", v)} />
                      </td>
                      <td className="px-4 py-2 text-gray-600 dark:text-[#a49c90]">
                        <EditableCell value={item.conversion} isNumber align="right" onSave={(v) => handleSave(item.id, "conversion", v)} placeholder="—" />
                      </td>
                      <td className="px-4 py-2 text-gray-600 dark:text-[#a49c90]">
                        <EditableCell value={item.unitWeight != null ? fmt(item.unitWeight) : null} isNumber align="right" onSave={(v) => handleSave(item.id, "unitWeight", v)} placeholder="—" />
                      </td>
                      <td className="px-4 py-2 text-gray-700 dark:text-[#bab2a6] font-medium">
                        <EditableCell value={item.kcal} isNumber align="right" onSave={(v) => handleSave(item.id, "kcal", v)} />
                      </td>
                      <td className="px-4 py-2 text-gray-700 dark:text-[#bab2a6]">
                        <EditableCell value={item.carbs != null ? fmt(item.carbs) : null} isNumber align="right" onSave={(v) => handleSave(item.id, "carbs", v)} />
                      </td>
                      <td className="px-4 py-2 text-gray-700 dark:text-[#bab2a6]">
                        <EditableCell value={item.fat != null ? fmt(item.fat) : null} isNumber align="right" onSave={(v) => handleSave(item.id, "fat", v)} />
                      </td>
                      <td className="px-4 py-2 text-gray-700 dark:text-[#bab2a6]">
                        <EditableCell value={item.protein != null ? fmt(item.protein) : null} isNumber align="right" onSave={(v) => handleSave(item.id, "protein", v)} />
                      </td>
                      <td className="px-4 py-2 text-gray-400 dark:text-[#6e675c] whitespace-nowrap text-xs">
                        {new Date(item.createdAt).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        )}
        </>
      )}

      {!loading && sorted.length > 0 && (
        <p className="text-xs text-gray-400 dark:text-[#5c554b] mt-3">
          Showing {sorted.length} of {items.length} · Macros per 100g · g/unit = grams per unit (piece, tsp etc.){view === "table" ? " · Click any cell to edit" : " · Tap a row to edit"}
        </p>
      )}

      {editingId && (
        <GroceryItemModal
          itemId={editingId}
          onClose={() => setEditingId(null)}
          onSaved={(updated) => {
            setItems((prev) =>
              prev.map((item) =>
                item.id === updated.id
                  ? {
                      ...item,
                      name: updated.name,
                      nameRo: updated.nameRo,
                      category: updated.category,
                      unit: updated.unit,
                      unit2: updated.unit2,
                      conversion: updated.conversion,
                      kcal: updated.kcal,
                      carbs: updated.carbs,
                      fat: updated.fat,
                      protein: updated.protein,
                    }
                  : item
              )
            );
            setEditingId(null);
          }}
          onDeleted={() => {
            setItems((prev) => prev.filter((item) => item.id !== editingId));
            setEditingId(null);
          }}
        />
      )}

      {creatingNew && (
        <GroceryItemModal
          onClose={() => setCreatingNew(false)}
          onSaved={(created) => {
            setItems((prev) => [...prev, {
              id: created.id,
              name: created.name,
              nameRo: created.nameRo,
              category: created.category,
              unit: created.unit,
              unit2: created.unit2,
              conversion: created.conversion,
              kcal: created.kcal,
              carbs: created.carbs,
              fat: created.fat,
              protein: created.protein,
              unitWeight: null,
              createdAt: new Date(),
            }]);
            setCreatingNew(false);
          }}
        />
      )}
    </div>
  );
}
