"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  getGroceryItems,
  updateGroceryItem,
  deleteGroceryItems,
  setGroceryItemsCategory,
  getKnownCategories,
  addGroceryCategory,
  createGroceryItem,
  getUnitAudit,
} from "@/lib/actions";
import {
  ArrowUpDown, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsUpDown, ClipboardCheck,
  House, List, Loader2, Pencil, Plus, Search, Sparkles, Table, Tag, Trash2, X,
} from "lucide-react";
import GroceryItemModal from "@/components/GroceryItemModal";
import { Sheet, Switch } from "@/components/Sheet";
import { GROCERY_CATEGORIES } from "@/lib/constants";
import { groceryCategoryLabel } from "@/lib/labels";
import { UNIT_CHOICES, foldText, fmtNum, isHouseholdCategory, listCategory } from "@/lib/grocery-items";

type GroceryItem = Awaited<ReturnType<typeof getGroceryItems>>[number];

type NumField = "conversion" | "kcal" | "carbs" | "fat" | "protein" | "unitWeight";
type TextField = "name" | "nameRo" | "category" | "unit" | "unit2";
type EditableField = TextField | NumField;
type SortField = keyof Omit<GroceryItem, "id">;
type SortDir = "asc" | "desc" | null;

const NUM_FIELDS: NumField[] = ["conversion", "kcal", "carbs", "fat", "protein", "unitWeight"];

// The list's own order (the table keeps its column sort).
type ListSort = "aisle" | "name" | "used" | "new" | "kcal" | "protein" | "carbs" | "fat";
const SORTS: { key: ListSort; label: string; hint: string }[] = [
  { key: "aisle", label: "Aisle", hint: "Grouped like the shopping list" },
  { key: "name", label: "Name", hint: "A to Z" },
  { key: "used", label: "Most used", hint: "In the most recipes first" },
  { key: "new", label: "Recently added", hint: "Newest first" },
  { key: "kcal", label: "Calories", hint: "Highest first, per 100 g" },
  { key: "protein", label: "Protein", hint: "Highest first, per 100 g" },
  { key: "carbs", label: "Carbs", hint: "Highest first, per 100 g" },
  { key: "fat", label: "Fat", hint: "Highest first, per 100 g" },
];
const METRIC: Partial<Record<ListSort, "kcal" | "protein" | "carbs" | "fat">> = { kcal: "kcal", protein: "protein", carbs: "carbs", fat: "fat" };

const NO_CATEGORY = "__none__";

type Toast = { text: string; error?: boolean };
type Sheets = "sort" | "category" | "delete" | "new" | null;

function fmt(n: number | null): string {
  if (n == null) return "";
  return (Math.round(n * 10) / 10).toString();
}

function displayNum(n: number | null): string {
  if (n == null) return "—";
  return (Math.round(n * 10) / 10).toString();
}

// No nutrition and not a household thing (bulbs and sponges never get any).
const needsNutrition = (it: GroceryItem) => it.kcal == null && !isHouseholdCategory(it.category);

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
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
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
      {value ? value : placeholder}
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

// ─── Sheet option row (radio look) ────────────────────────────────────────────

function OptionRow({ on, label, hint, right, onClick }: { on: boolean; label: string; hint?: string; right?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className="w-full min-h-14 py-1.5 px-1 flex items-center gap-3 text-left">
      <span className={`w-[22px] h-[22px] shrink-0 rounded-full border-2 flex items-center justify-center ${on ? "border-orange-500" : "border-gray-300 dark:border-[#3a352e]"}`}>
        {on && <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-base font-medium text-gray-900 dark:text-[#eae5de]">{label}</span>
        {hint && <span className="block text-[13px] text-gray-600 dark:text-[#a49c90]">{hint}</span>}
      </span>
      {right && <span className="text-[13px] text-gray-600 dark:text-[#a49c90]">{right}</span>}
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IngredientsPage() {
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [listSort, setListSort] = useState<ListSort>("aisle");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState<{ name: string } | null>(null);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  // List vs. table. The table (inline cell edits) is a desktop tool; phones always get the list.
  const [view, setView] = useState<"list" | "table">("list");
  const [knownCategories, setKnownCategories] = useState<string[]>(GROCERY_CATEGORIES);
  const [unitIssues, setUnitIssues] = useState<number | null>(null);
  const [sheet, setSheet] = useState<Sheets>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Multi-select
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [newCatName, setNewCatName] = useState("");

  // Quick add
  const [nd, setNd] = useState({ name: "", unit: "g", category: "", categoryPicked: false, autofill: true, home: false });
  const [ndSuggested, setNdSuggested] = useState<string | null>(null);
  const [ndSaving, setNdSaving] = useState(false);
  const [ndError, setNdError] = useState<string | null>(null);

  function showToast(text: string, error = false) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, error });
    toastTimer.current = setTimeout(() => setToast(null), error ? 6000 : 4000);
  }

  function load() {
    setLoading(true);
    setLoadError(false);
    getGroceryItems()
      .then((data) => {
        setItems(data);
        // Deep link from the Data check page (/ingredients?edit=<id>) opens that item.
        const editId = new URLSearchParams(window.location.search).get("edit");
        if (editId) {
          setEditingId(editId);
          window.history.replaceState(null, "", "/ingredients");
        }
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    getKnownCategories().then(setKnownCategories).catch(() => { /* keep the built-ins */ });
    getUnitAudit()
      .then((u) => setUnitIssues(u.missingUnitWeight.length + u.mismatches.length))
      .catch(() => { /* the Data check card just leaves the units out */ });
    try {
      const saved = localStorage.getItem("ingredients-view");
      if (saved === "list" || saved === "table") setView(saved);
      else if (window.matchMedia("(min-width: 768px)").matches) setView("table");
      const s = localStorage.getItem("ingredients-sort");
      if (s && SORTS.some((o) => o.key === s)) setListSort(s as ListSort);
    } catch { /* ignore */ }
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  function changeView(v: "list" | "table") {
    setView(v);
    try { localStorage.setItem("ingredients-view", v); } catch { /* non-fatal */ }
  }
  function changeListSort(s: ListSort) {
    setListSort(s);
    setSheet(null);
    try { localStorage.setItem("ingredients-sort", s); } catch { /* non-fatal */ }
  }

  // AI category suggestion for the quick-add name, once typing pauses.
  useEffect(() => {
    if (sheet !== "new" || nd.categoryPicked || nd.name.trim().length < 3) { setNdSuggested(null); return; }
    const name = nd.name.trim();
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch("/api/suggest-category", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ id: "new", name }], categories: knownCategories }),
        signal: ctrl.signal,
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => setNdSuggested(data?.suggestions?.new ?? null))
        .catch(() => { /* only a suggestion */ });
    }, 600);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [sheet, nd.name, nd.categoryPicked, knownCategories]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const catOf = (it: GroceryItem) => listCategory(it.category, knownCategories);
  const q = foldText(search.trim());
  const shown = items.filter((it) => {
    if (filter === "missing" && !needsNutrition(it)) return false;
    if (filter === "home" && !it.pantryStaple) return false;
    if (filter.startsWith("cat:")) {
      const c = catOf(it);
      if ((c ?? NO_CATEGORY) !== filter.slice(4)) return false;
    }
    if (q && !foldText(it.name).includes(q) && !foldText(it.nameRo).includes(q)) return false;
    return true;
  });

  const metric = METRIC[listSort];
  const byName = (a: GroceryItem, b: GroceryItem) => a.name.localeCompare(b.name);
  const listed = [...shown].sort((a, b) => {
    if (metric) {
      const x = a[metric], y = b[metric];
      if (x == null) return y == null ? byName(a, b) : 1;
      if (y == null) return -1;
      return y - x || byName(a, b);
    }
    if (listSort === "used") return b.uses - a.uses || byName(a, b);
    if (listSort === "new") return +new Date(b.createdAt) - +new Date(a.createdAt);
    return byName(a, b);
  });

  const categoryOrder = [...knownCategories];
  const groups: { key: string; title: string; rows: GroceryItem[] }[] = [];
  if (listSort === "aisle") {
    for (const c of categoryOrder) {
      const rows = listed.filter((it) => catOf(it) === c);
      if (rows.length) groups.push({ key: c, title: groceryCategoryLabel(c), rows });
    }
    const none = listed.filter((it) => !catOf(it));
    if (none.length) groups.push({ key: NO_CATEGORY, title: "No category", rows: none });
  } else if (listed.length) {
    groups.push({ key: "all", title: "", rows: listed });
  }

  const perCat = new Map<string, number>();
  for (const it of items) {
    const k = catOf(it) ?? NO_CATEGORY;
    perCat.set(k, (perCat.get(k) ?? 0) + 1);
  }
  const missingCount = items.filter(needsNutrition).length;
  const chips: { key: string; label: string; count: number }[] = [
    { key: "all", label: "All", count: items.length },
    { key: "missing", label: "No nutrition", count: missingCount },
    { key: "home", label: "At home", count: items.filter((it) => it.pantryStaple).length },
    ...categoryOrder.filter((c) => perCat.get(c)).map((c) => ({ key: `cat:${c}`, label: groceryCategoryLabel(c), count: perCat.get(c) ?? 0 })),
    ...(perCat.get(NO_CATEGORY) ? [{ key: `cat:${NO_CATEGORY}`, label: "No category", count: perCat.get(NO_CATEGORY) ?? 0 }] : []),
  ];
  const oldCategoryCount = items.filter((it) => !it.category?.trim() || !knownCategories.includes(it.category.trim())).length;
  const checkParts = [
    missingCount ? `${missingCount} without nutrition` : null,
    oldCategoryCount ? `${oldCategoryCount} on old categories` : null,
    unitIssues ? `${unitIssues} unit ${unitIssues === 1 ? "issue" : "issues"}` : null,
  ].filter(Boolean);
  const sortRow = SORTS.find((s) => s.key === listSort) ?? SORTS[0];

  // ── Table edits ───────────────────────────────────────────────────────────
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

  const tableRows = sortField && sortDir
    ? [...shown].sort((a, b) => {
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
    : shown;

  async function handleSave(id: string, field: EditableField, raw: string) {
    const isNum = (NUM_FIELDS as string[]).includes(field);
    const value = raw === "" ? null : isNum ? parseFloat(raw) : raw;
    const prevValue = items.find((it) => it.id === id)?.[field];
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
    try {
      await updateGroceryItem(id, { [field]: value } as Parameters<typeof updateGroceryItem>[1]);
    } catch {
      // Revert the optimistic cell edit so the UI doesn't show an unsaved value.
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: prevValue } : item)));
      showToast("Couldn't save the change. Please try again.", true);
    }
  }

  async function handleToggleStaple(id: string) {
    const prev = items.find((it) => it.id === id)?.pantryStaple ?? false;
    setItems((all) => all.map((it) => (it.id === id ? { ...it, pantryStaple: !prev } : it)));
    try {
      await updateGroceryItem(id, { pantryStaple: !prev });
    } catch {
      setItems((all) => all.map((it) => (it.id === id ? { ...it, pantryStaple: prev } : it)));
      showToast("Couldn't save the change. Please try again.", true);
    }
  }

  // ── Select mode ───────────────────────────────────────────────────────────
  function startSelect() { setSelectMode(true); setSelectedIds(new Set()); }
  function stopSelect() { setSelectMode(false); setSelectedIds(new Set()); }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // A selection made against another filter must never be acted on while those rows
  // are off-screen, so changing the filter or the search drops it.
  function changeSearch(v: string) { setSearch(v); setSelectedIds(new Set()); }
  function changeFilter(v: string) { setFilter(v); setSelectedIds(new Set()); }

  const allVisibleSelected = shown.length > 0 && shown.every((i) => selectedIds.has(i.id));
  function toggleSelectAllVisible() {
    setSelectedIds(allVisibleSelected ? new Set() : new Set(shown.map((i) => i.id)));
  }

  const selected = items.filter((it) => selectedIds.has(it.id));
  const selectedCount = selected.length;
  const deletable = selected.filter((it) => it.uses === 0);
  const blocked = selected.filter((it) => it.uses > 0);

  async function applyCategory(cat: string) {
    const ids = selected.map((it) => it.id);
    if (!ids.length || bulkBusy) return;
    setBulkBusy(true);
    try {
      await setGroceryItemsCategory(ids, cat);
      setItems((prev) => prev.map((it) => (selectedIds.has(it.id) ? { ...it, category: cat } : it)));
      setSheet(null);
      showToast(`Moved ${ids.length} ${ids.length === 1 ? "item" : "items"} to ${groceryCategoryLabel(cat)}`);
    } catch {
      showToast("Couldn't change the category. Please try again.", true);
    } finally {
      setBulkBusy(false);
    }
  }

  async function addCategoryAndApply() {
    const name = newCatName.trim();
    if (!name || bulkBusy) return;
    try {
      setKnownCategories(await addGroceryCategory(name));
      setNewCatName("");
      await applyCategory(name);
    } catch {
      showToast("Couldn't add the category. Please try again.", true);
    }
  }

  async function handleBulkDelete() {
    const ids = selected.map((it) => it.id);
    if (!ids.length || bulkBusy) return;
    setBulkBusy(true);
    try {
      const res = await deleteGroceryItems(ids);
      const gone = new Set(res.deleted);
      setItems((prev) => prev.filter((it) => !gone.has(it.id)));
      // Keep the blocked (still used) items selected so it's clear which stayed.
      setSelectedIds(new Set(res.blocked.map((b) => b.id)));
      setSheet(null);
      showToast(
        res.blocked.length
          ? `${res.deleted.length} deleted · ${res.blocked.length} kept, used in recipes`
          : `${res.deleted.length} deleted`
      );
    } catch {
      showToast("Couldn't delete. Please try again.", true);
    } finally {
      setBulkBusy(false);
    }
  }

  // Fill nutrition from USDA for the selected items, only where it's empty.
  async function handleBulkAutofill() {
    const todo = selected.filter(needsNutrition);
    const had = selectedCount - todo.length;
    if (!todo.length) { showToast(`All ${selectedCount} already have nutrition. Nothing changed.`); return; }
    setBulkBusy(true);
    let filled = 0, noMatch = 0, failed = 0, failsInARow = 0;
    for (let i = 0; i < todo.length; i++) {
      setBulkProgress({ done: i, total: todo.length });
      const it = todo[i];
      try {
        const res = await fetch(`/api/nutrition?q=${encodeURIComponent(it.name.trim() || it.nameRo?.trim() || "")}`);
        if (res.status === 404) { noMatch++; failsInARow = 0; continue; }
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        const patch: Partial<Pick<GroceryItem, "kcal" | "carbs" | "fat" | "protein">> = {};
        if (it.kcal == null && data.kcal != null) patch.kcal = data.kcal;
        if (it.carbs == null && data.carbs != null) patch.carbs = data.carbs;
        if (it.fat == null && data.fat != null) patch.fat = data.fat;
        if (it.protein == null && data.protein != null) patch.protein = data.protein;
        if (Object.keys(patch).length) {
          await updateGroceryItem(it.id, patch);
          setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, ...patch } : x)));
          filled++;
        } else noMatch++;
        failsInARow = 0;
      } catch {
        failed++;
        // USDA or the connection is down: stop instead of failing every row.
        if (++failsInARow >= 3) break;
      }
    }
    setBulkProgress(null);
    setBulkBusy(false);
    const parts = [`Filled ${filled}`];
    if (noMatch) parts.push(`${noMatch} no match`);
    if (had) parts.push(`${had} already had it`);
    if (failed) parts.push(`${failed} failed`);
    showToast(parts.join(" · "), failed > 0 && filled === 0);
  }

  // ── Quick add ─────────────────────────────────────────────────────────────
  function openNew(name = "") {
    setNd({ name, unit: "g", category: "", categoryPicked: false, autofill: true, home: false });
    setNdSuggested(null);
    setNdError(null);
    setSheet("new");
  }
  const ndCategory = nd.categoryPicked ? nd.category : ndSuggested ?? "";
  const ndDuplicate = nd.name.trim() ? items.find((it) => foldText(it.name) === foldText(nd.name.trim())) : undefined;

  async function handleCreate() {
    const name = nd.name.trim();
    if (!name || ndDuplicate || ndSaving) return;
    setNdSaving(true);
    setNdError(null);
    let created: GroceryItem;
    try {
      const item = await createGroceryItem({ name, unit: nd.unit, category: ndCategory || null, pantryStaple: nd.home });
      created = { ...item, createdAt: new Date(), uses: 0 };
      setItems((prev) => [...prev, created]);
    } catch {
      setNdError("Couldn't add it. Please try again.");
      setNdSaving(false);
      return;
    }
    setSheet(null);
    setNdSaving(false);
    if (!nd.autofill) { showToast(`Added ${name}`); return; }
    try {
      const res = await fetch(`/api/nutrition?q=${encodeURIComponent(name)}`);
      if (res.status === 404) { showToast(`Added ${name} · no USDA match, add nutrition by hand`); return; }
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      const patch = { kcal: data.kcal ?? null, carbs: data.carbs ?? null, fat: data.fat ?? null, protein: data.protein ?? null };
      await updateGroceryItem(created.id, patch);
      setItems((prev) => prev.map((x) => (x.id === created.id ? { ...x, ...patch } : x)));
      showToast(`Added ${name} · nutrition from USDA “${data.name}”`);
    } catch {
      showToast(`Added ${name}, but the nutrition lookup failed. Fill it in on the ingredient.`, true);
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────────
  function rowRight(it: GroceryItem) {
    if (listSort === "used") {
      return (
        <span className="shrink-0 text-right leading-tight">
          <b className="block text-base font-semibold text-gray-900 dark:text-[#eae5de]">{it.uses}</b>
          <small className="block text-xs text-gray-600 dark:text-[#a49c90]">{it.uses === 1 ? "recipe" : "recipes"}</small>
        </span>
      );
    }
    if (needsNutrition(it)) {
      return (
        <span className="shrink-0 h-[26px] px-2.5 rounded-full text-xs font-semibold flex items-center bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300">
          No nutrition
        </span>
      );
    }
    const key = metric ?? "kcal";
    if (it[key] == null) return null;
    return (
      <span className="shrink-0 text-right leading-tight">
        <b className="block text-base font-semibold text-gray-900 dark:text-[#eae5de]">{fmtNum(it[key])}</b>
        <small className="block text-xs text-gray-600 dark:text-[#a49c90]">{key === "kcal" ? "kcal" : `g ${key}`}</small>
      </span>
    );
  }

  const headerBtn =
    "h-11 px-4 rounded-[14px] border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-[15px] font-semibold text-gray-900 dark:text-[#eae5de]";
  const sheetBtn =
    "flex-1 h-12 rounded-[14px] border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-[15px] font-semibold text-gray-900 dark:text-[#eae5de] flex items-center justify-center";
  const sheetMainBtn =
    "flex-1 h-12 rounded-[14px] bg-orange-500 hover:bg-orange-600 text-white text-base font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-colors";
  const showList = view === "list" ? "" : "md:hidden";

  return (
    <div className={`max-w-2xl mx-auto md:px-8 md:pt-8 pb-8 ${view === "table" ? "md:max-w-none" : ""}`}>
      {/* Header */}
      {selectMode ? (
        <div className="px-1 md:px-0 pt-2 md:pt-0 flex items-center justify-between gap-2">
          <button type="button" onClick={stopSelect} className="h-11 px-3 text-base text-gray-600 dark:text-[#a49c90]">Cancel</button>
          <h1 className="text-[17px] font-bold font-[family-name:var(--font-sans)]! text-gray-900 dark:text-[#eae5de]">
            {selectedCount ? `${selectedCount} selected` : "Select items"}
          </h1>
          <button type="button" onClick={toggleSelectAllVisible} className="h-11 px-3 text-[15px] font-semibold text-orange-600 dark:text-orange-400">
            {allVisibleSelected ? "Clear" : "Select all"}
          </button>
        </div>
      ) : (
        <div className="px-4 pt-2 md:px-0 md:pt-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/more" aria-label="Back to More" className="md:hidden -ml-2.5 w-11 h-11 flex items-center justify-center text-gray-600 dark:text-[#a49c90]">
              <ChevronLeft size={24} />
            </Link>
            <h1 className="order-last md:order-first basis-full md:basis-auto text-3xl text-gray-900 dark:text-[#eae5de]">Ingredients</h1>
            <div className="ml-auto flex items-center gap-2">
              <div className="hidden md:flex items-center rounded-[14px] border border-gray-200 dark:border-[#3a352e] overflow-hidden h-11" role="group" aria-label="View">
                {(["list", "table"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => changeView(v)}
                    aria-pressed={view === v}
                    className={`h-full px-3.5 flex items-center gap-1.5 text-sm font-semibold transition-colors ${
                      view === v ? "bg-orange-500 text-gray-900" : "bg-white dark:bg-[#24211c] text-gray-600 dark:text-[#a49c90]"
                    }`}
                  >
                    {v === "list" ? <List size={15} /> : <Table size={15} />} {v === "list" ? "List" : "Table"}
                  </button>
                ))}
              </div>
              <button type="button" onClick={startSelect} className={headerBtn}>Select</button>
              <button
                type="button"
                onClick={() => openNew()}
                aria-label="New ingredient"
                className="w-11 h-11 rounded-[14px] bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center transition-colors"
              >
                <Plus size={22} />
              </button>
            </div>
          </div>
          <p className="mt-1 text-sm text-gray-600 dark:text-[#a49c90]">{items.length} items · nutrition per 100 g</p>
        </div>
      )}

      {/* Sticky search + filters */}
      <div className="sticky top-0 z-20 mt-2 bg-[var(--color-bg-base)] border-b border-gray-100 dark:border-[#3a352e]">
        <div className="px-4 md:px-0 pt-3 flex gap-2">
          <div className="relative flex-1 md:max-w-sm">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 dark:text-[#a49c90] pointer-events-none" />
            <input
              value={search}
              onChange={(e) => changeSearch(e.target.value)}
              placeholder="Search in English or Romanian"
              aria-label="Search ingredients"
              className="w-full h-12 pl-[42px] pr-11 rounded-[14px] border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-base text-gray-900 dark:text-[#eae5de] placeholder:text-gray-400 dark:placeholder:text-[#8f877b] outline-none focus:border-orange-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => changeSearch("")}
                aria-label="Clear search"
                className="absolute right-0.5 top-0.5 w-11 h-11 flex items-center justify-center text-gray-500 dark:text-[#a49c90]"
              >
                <X size={18} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSheet("sort")}
            aria-label={`Sort: ${sortRow.label}`}
            className={`${view === "table" ? "md:hidden" : ""} w-12 h-12 shrink-0 rounded-[14px] border bg-white dark:bg-[#24211c] flex items-center justify-center ${
              listSort === "aisle"
                ? "border-gray-200 dark:border-[#3a352e] text-gray-600 dark:text-[#a49c90]"
                : "border-orange-500 text-orange-600 dark:text-orange-400"
            }`}
          >
            <ArrowUpDown size={20} />
          </button>
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-none px-4 md:px-0 py-3">
          {chips.map((c) => {
            const on = filter === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => changeFilter(c.key)}
                aria-pressed={on}
                className={`shrink-0 h-10 px-3.5 rounded-full border flex items-center gap-1.5 text-sm font-semibold transition-colors ${
                  on
                    ? "bg-orange-500 border-orange-500 text-gray-900"
                    : "bg-white dark:bg-[#24211c] border-gray-200 dark:border-[#3a352e] text-gray-600 dark:text-[#a49c90]"
                }`}
              >
                {c.label}
                <span className={`text-xs ${on ? "opacity-85" : "opacity-70"}`}>{c.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="px-4 md:px-0 pt-5 space-y-4 animate-pulse" aria-busy="true" aria-label="Loading ingredients">
          {[55, 70, 45, 65, 50, 60].map((w, i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <div className="flex-1 space-y-1.5">
                <div className="h-4 rounded bg-gray-100 dark:bg-[#24211c]" style={{ width: `${w}%` }} />
                <div className="h-3 rounded bg-gray-100 dark:bg-[#24211c]" style={{ width: `${w - 20}%` }} />
              </div>
              <div className="w-10 h-6 rounded bg-gray-100 dark:bg-[#24211c]" />
            </div>
          ))}
        </div>
      ) : loadError ? (
        <div className="py-16 text-center">
          <p className="text-[17px] font-semibold text-gray-900 dark:text-[#eae5de]">Couldn&apos;t load the ingredients</p>
          <p className="mt-1 text-sm text-gray-600 dark:text-[#a49c90]">Check your connection and try again.</p>
          <button type="button" onClick={load} className={`${headerBtn} mt-4`}>Try again</button>
        </div>
      ) : (
        <>
          {/* ── List ── */}
          <div className={showList}>
            {!selectMode && filter === "all" && !q && checkParts.length > 0 && (
              <Link
                href="/ingredients/audit"
                className="mx-4 md:mx-0 mt-3.5 flex items-center gap-3.5 px-3.5 py-3 rounded-[18px] border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c]"
              >
                <span className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300">
                  <ClipboardCheck size={20} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-base font-semibold text-gray-900 dark:text-[#eae5de]">Data check</span>
                  <span className="block mt-0.5 text-[13px] leading-snug text-gray-600 dark:text-[#a49c90]">{checkParts.join(" · ")}</span>
                </span>
                <ChevronRight size={18} className="text-gray-500 dark:text-[#a49c90]" />
              </Link>
            )}
            {listSort !== "aisle" && listed.length > 0 && (
              <p className="px-4 md:px-0 pt-3 text-[13px] text-gray-600 dark:text-[#a49c90]">
                {sortRow.label} · {sortRow.hint.toLowerCase()} · {listed.length} {listed.length === 1 ? "item" : "items"}
              </p>
            )}

            {groups.map((g) => (
              <section key={g.key}>
                {g.title && (
                  <h2 className="px-4 md:px-0 pt-5 pb-1.5 flex justify-between text-[13px] font-semibold tracking-[.04em] uppercase text-gray-600 dark:text-[#a49c90]">
                    <span>{g.title}</span>
                    <span>{g.rows.length}</span>
                  </h2>
                )}
                <ul>
                  {g.rows.map((it) => {
                    const on = selectedIds.has(it.id);
                    const sub = [
                      it.nameRo && foldText(it.nameRo) !== foldText(it.name) ? it.nameRo : null,
                      it.unit2 ? `${it.unit ?? "—"} / ${it.unit2}` : it.unit ?? "—",
                    ].filter(Boolean).join(" · ");
                    return (
                      <li key={it.id}>
                        <button
                          type="button"
                          onClick={() => (selectMode ? toggleOne(it.id) : setEditingId(it.id))}
                          aria-pressed={selectMode ? on : undefined}
                          className={`w-full min-h-[62px] px-4 md:px-3 py-2 flex items-center gap-3 text-left md:rounded-xl transition-colors ${
                            on
                              ? "bg-orange-50 dark:bg-orange-500/15"
                              : "active:bg-gray-50 dark:active:bg-[#24211c] md:hover:bg-gray-50 md:dark:hover:bg-[#24211c]"
                          }`}
                        >
                          {selectMode && (
                            <span
                              aria-hidden
                              className={`w-[26px] h-[26px] shrink-0 rounded-full border-2 flex items-center justify-center ${
                                on ? "bg-orange-500 border-orange-500 text-white" : "border-gray-300 dark:border-[#3a352e]"
                              }`}
                            >
                              {on && <Check size={14} strokeWidth={3} />}
                            </span>
                          )}
                          <span className="flex-1 min-w-0">
                            <span className="block truncate text-base font-medium text-gray-900 dark:text-[#eae5de]">{it.name}</span>
                            <span className="mt-0.5 flex items-center gap-1.5 min-w-0 text-[13px] text-gray-600 dark:text-[#a49c90]">
                              {it.pantryStaple && <House size={13} className="shrink-0" aria-label="Usually at home" />}
                              <span className="truncate">{sub}</span>
                            </span>
                          </span>
                          {rowRight(it)}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}

            {groups.length === 0 && (
              <div className="px-6 pt-12 text-center">
                <p className="text-[17px] font-semibold text-gray-900 dark:text-[#eae5de]">
                  {q ? `No ingredient called “${search.trim()}”` : "Nothing here"}
                </p>
                <p className="mt-1.5 text-sm text-gray-600 dark:text-[#a49c90]">
                  {q ? "Check the spelling, or add it." : "No ingredients match this filter."}
                </p>
                {q && (
                  <button
                    type="button"
                    onClick={() => openNew(search.trim().charAt(0).toUpperCase() + search.trim().slice(1))}
                    className={`${headerBtn} mt-4 text-orange-600 dark:text-orange-400`}
                  >
                    Add “{search.trim()}” as an ingredient
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Table (desktop) ── */}
          {view === "table" && (
          <div className="hidden md:block">
            <div className="mt-4 overflow-auto rounded-xl border border-gray-200 dark:border-[#2e2a24]">
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
                    <SortTh label="Name (EN)" field="name" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="Name (RO)" field="nameRo" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="At home" field="pantryStaple" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="Category" field="category" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="Unit" field="unit" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="Unit 2" field="unit2" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="Conv." field="conversion" align="right" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="g/unit" field="unitWeight" align="right" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="kcal" field="kcal" align="right" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="Carbs g" field="carbs" align="right" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="Fat g" field="fat" align="right" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="Protein g" field="protein" align="right" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="Uses" field="uses" align="right" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    <SortTh label="Created" field="createdAt" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-[#2e2a24]">
                  {tableRows.length === 0 ? (
                    <tr>
                      <td colSpan={selectMode ? 16 : 15} className="px-4 py-8 text-center text-gray-400">
                        No ingredients found
                      </td>
                    </tr>
                  ) : (
                    tableRows.map((item) => {
                      const isSelected = selectedIds.has(item.id);
                      return (
                        <tr
                          key={item.id}
                          className={`transition-colors ${
                            isSelected ? "bg-orange-50/60 dark:bg-orange-950/20" : "hover:bg-gray-50/50 dark:hover:bg-[#24211c]"
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
                              aria-label={`Edit ${item.name}`}
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
                          <td className="px-4 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={item.pantryStaple}
                              onChange={() => handleToggleStaple(item.id)}
                              className="accent-orange-500 w-4 h-4 cursor-pointer"
                              aria-label={`${item.name} is usually at home`}
                              title="Usually at home — listed under “Probably at home” on the shopping list"
                            />
                          </td>
                          <td className="px-4 py-2 text-gray-600 dark:text-[#a49c90] min-w-[9rem]">
                            <SelectCell value={item.category} options={knownCategories} onSave={(v) => handleSave(item.id, "category", v)} />
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
                          <td className="px-4 py-2 text-right text-gray-600 dark:text-[#a49c90]">{item.uses}</td>
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
            <p className="text-xs text-gray-500 dark:text-[#7c756a] mt-3">
              Showing {tableRows.length} of {items.length} · Macros per 100 g · g/unit = grams per unit (piece, tsp etc.) · Click any cell to edit
            </p>
          </div>
          )}
        </>
      )}

      {/* Select mode actions, floating above the bottom nav */}
      {selectMode && (
        <div className="sticky z-20 bottom-[calc(4rem+1px+env(safe-area-inset-bottom)+0.75rem)] md:bottom-6 mt-4 px-4 md:px-0 pointer-events-none">
          <div className="pointer-events-auto mx-auto max-w-md flex gap-1 p-1.5 rounded-[20px] border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] shadow-lg">
            <button
              type="button"
              onClick={() => { setNewCatName(""); setSheet("category"); }}
              disabled={!selectedCount || bulkBusy}
              className="flex-1 h-14 rounded-[14px] flex flex-col items-center justify-center gap-1 text-[13px] font-semibold text-gray-900 dark:text-[#eae5de] disabled:opacity-40"
            >
              <Tag size={20} /> Category
            </button>
            <button
              type="button"
              onClick={handleBulkAutofill}
              disabled={!selectedCount || bulkBusy}
              className="flex-1 h-14 rounded-[14px] flex flex-col items-center justify-center gap-1 text-[13px] font-semibold text-gray-900 dark:text-[#eae5de] disabled:opacity-40"
            >
              {bulkProgress ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />}
              {bulkProgress ? `Filling ${bulkProgress.done + 1} of ${bulkProgress.total}` : "Nutrition"}
            </button>
            <button
              type="button"
              onClick={() => setSheet("delete")}
              disabled={!selectedCount || bulkBusy}
              className="flex-1 h-14 rounded-[14px] flex flex-col items-center justify-center gap-1 text-[13px] font-semibold text-red-600 dark:text-red-400 disabled:opacity-40"
            >
              <Trash2 size={20} /> Delete
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div
          role={toast.error ? "alert" : "status"}
          className={`fixed z-[60] left-4 right-4 md:left-auto md:right-8 md:w-96 ${
            selectMode ? "bottom-[calc(4rem+env(safe-area-inset-bottom)+6rem)]" : "bottom-[calc(4rem+env(safe-area-inset-bottom)+1rem)]"
          } md:bottom-24 rounded-[14px] px-4 py-3 min-h-12 text-[15px] font-medium shadow-lg ${
            toast.error ? "bg-red-600 text-white" : "bg-gray-900 dark:bg-[#eae5de] text-white dark:text-[#1a1714]"
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* ── Sheets ── */}
      {sheet === "sort" && (
        <Sheet title="Sort ingredients" onClose={() => setSheet(null)}>
          <div className="mt-2">
            {SORTS.map((s) => (
              <OptionRow key={s.key} on={listSort === s.key} label={s.label} hint={s.hint} onClick={() => changeListSort(s.key)} />
            ))}
          </div>
        </Sheet>
      )}

      {sheet === "category" && (
        <Sheet title={`Move ${selectedCount} ${selectedCount === 1 ? "item" : "items"} to…`} onClose={() => setSheet(null)}>
          <p className="mt-1.5 text-[15px] text-gray-600 dark:text-[#a49c90]">It moves them on the shopping list too.</p>
          <div className="mt-2">
            {knownCategories.map((c) => (
              <OptionRow
                key={c}
                on={false}
                label={groceryCategoryLabel(c)}
                right={String(perCat.get(c) ?? 0)}
                onClick={() => applyCategory(c)}
              />
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addCategoryAndApply(); }}
              placeholder="Or a new category"
              aria-label="New category name"
              className="flex-1 min-w-0 h-12 px-3.5 rounded-[14px] border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-base text-gray-900 dark:text-[#eae5de] placeholder:text-gray-400 dark:placeholder:text-[#8f877b] outline-none focus:border-orange-500"
            />
            <button type="button" onClick={addCategoryAndApply} disabled={!newCatName.trim() || bulkBusy} className="h-12 px-4 rounded-[14px] bg-orange-500 text-white text-[15px] font-bold disabled:opacity-50">
              {bulkBusy ? <Loader2 size={16} className="animate-spin" /> : "Add"}
            </button>
          </div>
        </Sheet>
      )}

      {sheet === "delete" && (
        <Sheet
          title={deletable.length ? `Delete ${deletable.length} ${deletable.length === 1 ? "ingredient" : "ingredients"}?` : `Can't delete ${blocked.length === 1 ? "it" : "these"}`}
          onClose={() => setSheet(null)}
        >
          <p className="mt-1.5 text-[15px] leading-snug text-gray-600 dark:text-[#a49c90]">
            {!deletable.length
              ? `${blocked.length === 1 ? "It is" : "They are all"} used in recipes, so nothing can be deleted. Swap them out in those recipes first.`
              : blocked.length
              ? `${blocked.length} of them ${blocked.length === 1 ? "is" : "are"} used in recipes and will stay. The other ${deletable.length === 1 ? "one isn't" : `${deletable.length} aren't`} used anywhere. This can't be undone.`
              : `${deletable.length === 1 ? "It isn't" : "None of them are"} used in any recipe. This can't be undone.`}
          </p>
          <div className="mt-5 flex gap-2">
            <button type="button" onClick={() => setSheet(null)} className={sheetBtn}>{deletable.length ? "Keep" : "Got it"}</button>
            {deletable.length > 0 && (
              <button
                type="button"
                onClick={handleBulkDelete}
                disabled={bulkBusy}
                className="flex-1 h-12 rounded-[14px] bg-red-600 hover:bg-red-700 text-white text-base font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {bulkBusy && <Loader2 size={16} className="animate-spin" />}
                Delete {deletable.length}
              </button>
            )}
          </div>
        </Sheet>
      )}

      {sheet === "new" && (
        <Sheet title="New ingredient" onClose={() => setSheet(null)}>
          <label htmlFor="nw-name" className="block mt-4 mb-1.5 text-sm font-semibold text-gray-900 dark:text-[#eae5de]">Name</label>
          <input
            id="nw-name"
            autoFocus
            value={nd.name}
            onChange={(e) => setNd((p) => ({ ...p, name: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
            placeholder="e.g. Buckwheat flour"
            className="w-full h-12 px-3.5 rounded-[14px] border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-base text-gray-900 dark:text-[#eae5de] placeholder:text-gray-400 dark:placeholder:text-[#8f877b] outline-none focus:border-orange-500"
          />
          {ndDuplicate && (
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
              Already in your list as{" "}
              <button type="button" onClick={() => { setSheet(null); setEditingId(ndDuplicate.id); }} className="font-semibold underline underline-offset-2">
                {ndDuplicate.name}
              </button>
              .
            </p>
          )}

          <span className="block mt-4 mb-1.5 text-sm font-semibold text-gray-900 dark:text-[#eae5de]">Measured in</span>
          <div role="group" aria-label="Measured in" className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-4 px-4">
            {UNIT_CHOICES.map((u) => (
              <button
                key={u}
                type="button"
                aria-pressed={nd.unit === u}
                onClick={() => setNd((p) => ({ ...p, unit: u }))}
                className={`shrink-0 h-10 px-3.5 rounded-[10px] border text-sm font-semibold ${
                  nd.unit === u
                    ? "bg-orange-500 border-orange-500 text-gray-900"
                    : "bg-white dark:bg-[#24211c] border-gray-200 dark:border-[#3a352e] text-gray-600 dark:text-[#a49c90]"
                }`}
              >
                {u}
              </button>
            ))}
          </div>

          <div className="mt-4 mb-1.5 flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-gray-900 dark:text-[#eae5de]">Category</span>
            {!nd.categoryPicked && ndSuggested && <span className="text-[13px] text-orange-600 dark:text-orange-400">Suggested from the name</span>}
          </div>
          <div role="group" aria-label="Category" className="flex flex-wrap gap-1.5">
            {knownCategories.map((c) => {
              const on = ndCategory === c;
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setNd((p) => ({ ...p, category: on ? "" : c, categoryPicked: true }))}
                  className={`h-10 px-3 rounded-full border text-sm ${
                    on
                      ? "bg-orange-500 border-orange-500 text-gray-900 font-semibold"
                      : "bg-white dark:bg-[#24211c] border-gray-200 dark:border-[#3a352e] text-gray-600 dark:text-[#a49c90] font-medium"
                  }`}
                >
                  {groceryCategoryLabel(c)}
                </button>
              );
            })}
          </div>

          <div className="mt-3 min-h-12 flex items-center justify-between gap-3">
            <span>
              <span className="block text-base font-medium text-gray-900 dark:text-[#eae5de]">Fill nutrition from USDA</span>
              <span className="block text-[13px] text-gray-600 dark:text-[#a49c90]">Per 100 g. Check it on the ingredient after.</span>
            </span>
            <Switch on={nd.autofill} onChange={(on) => setNd((p) => ({ ...p, autofill: on }))} label="Fill nutrition from USDA" />
          </div>
          <div className="mt-1 min-h-12 flex items-center justify-between gap-3">
            <span>
              <span className="block text-base font-medium text-gray-900 dark:text-[#eae5de]">Usually at home</span>
              <span className="block text-[13px] text-gray-600 dark:text-[#a49c90]">Listed under &ldquo;Probably at home&rdquo; when shopping.</span>
            </span>
            <Switch on={nd.home} onChange={(on) => setNd((p) => ({ ...p, home: on }))} label="Usually at home" />
          </div>

          {ndError && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{ndError}</p>}
          <div className="mt-5 flex gap-2">
            <button type="button" onClick={() => { setSheet(null); setCreating({ name: nd.name.trim() }); }} className={sheetBtn}>
              All details
            </button>
            <button type="button" onClick={handleCreate} disabled={!nd.name.trim() || !!ndDuplicate || ndSaving} className={sheetMainBtn}>
              {ndSaving && <Loader2 size={16} className="animate-spin" />}
              Add ingredient
            </button>
          </div>
        </Sheet>
      )}

      {editingId && (
        <GroceryItemModal
          itemId={editingId}
          backLabel="Ingredients"
          onClose={() => setEditingId(null)}
          onSaved={(updated) => {
            setItems((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
            setEditingId(null);
          }}
          onDeleted={() => {
            setItems((prev) => prev.filter((item) => item.id !== editingId));
            setEditingId(null);
          }}
        />
      )}

      {creating && (
        <GroceryItemModal
          initialName={creating.name}
          backLabel="Ingredients"
          onClose={() => setCreating(null)}
          onSaved={(created) => {
            setItems((prev) => [...prev, { ...created, createdAt: new Date(), uses: 0 }]);
            setCreating(null);
          }}
        />
      )}
    </div>
  );
}
