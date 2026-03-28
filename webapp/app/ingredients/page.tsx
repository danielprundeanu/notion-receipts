"use client";

import { useEffect, useRef, useState } from "react";
import { getGroceryItems, updateGroceryItem } from "@/lib/actions";
import { Search, Pencil, ChevronUp, ChevronDown, ChevronsUpDown, Plus } from "lucide-react";
import GroceryItemModal from "@/components/GroceryItemModal";

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

// ─── Editable Cell ────────────────────────────────────────────────────────────

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
        className={`w-full px-1.5 py-0.5 text-sm border border-orange-400 rounded focus:outline-none bg-white dark:bg-[#2a2a2a] text-gray-900 dark:text-[#e3e3e3] ${align === "right" ? "text-right" : "text-left"}`}
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
      } ${active ? "text-orange-500 dark:text-orange-400" : "text-gray-500 dark:text-[#787878]"}`}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {align === "right" && (
          <Icon
            size={12}
            className={active ? "text-orange-500 dark:text-orange-400" : "text-gray-300 dark:text-[#444] group-hover:text-gray-400"}
          />
        )}
        {label}
        {align === "left" && (
          <Icon
            size={12}
            className={active ? "text-orange-500 dark:text-orange-400" : "text-gray-300 dark:text-[#444] group-hover:text-gray-400"}
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

  useEffect(() => {
    getGroceryItems().then((data) => {
      setItems(data as GroceryItem[]);
      setLoading(false);
    });
  }, []);

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

    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );

    await updateGroceryItem(id, { [field]: value } as Parameters<typeof updateGroceryItem>[1]);
  }

  const sharedThProps = { sortField, sortDir, onSort: handleSort };

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-[#e3e3e3]">Ingredients</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 dark:text-[#787878]">{items.length} items</span>
          <button
            onClick={() => setCreatingNew(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-semibold hover:bg-orange-600 transition-colors"
          >
            <Plus size={15} /> New ingredient
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#555555]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ingredient…"
            className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#3a3a3a] text-gray-900 dark:text-[#e3e3e3] placeholder:text-gray-400 dark:placeholder:text-[#555555] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 dark:border-[#3a3a3a] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white dark:bg-[#252525] text-gray-800 dark:text-[#d4d4d4]"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
          Loading…
        </div>
      ) : (
        <div className="overflow-auto rounded-xl border border-gray-200 dark:border-[#2e2e2e]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-[#2a2a2a] text-left">
                <SortTh label="Name (EN)"  field="name"       {...sharedThProps} />
                <SortTh label="Name (RO)"  field="nameRo"     {...sharedThProps} />
                <SortTh label="Category"   field="category"   {...sharedThProps} />
                <SortTh label="Unit"       field="unit"       {...sharedThProps} />
                <SortTh label="Unit 2"     field="unit2"      {...sharedThProps} />
                <SortTh label="Conv."      field="conversion" align="right" {...sharedThProps} />
                <SortTh label="g/unit"     field="unitWeight" align="right" {...sharedThProps} />
                <SortTh label="kcal"       field="kcal"       align="right" {...sharedThProps} />
                <SortTh label="Carbs g"    field="carbs"      align="right" {...sharedThProps} />
                <SortTh label="Fat g"      field="fat"        align="right" {...sharedThProps} />
                <SortTh label="Protein g"  field="protein"    align="right" {...sharedThProps} />
                <th className="px-2 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-[#2e2e2e]">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-gray-400">
                    No ingredients found
                  </td>
                </tr>
              ) : (
                sorted.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-[#252525] transition-colors">
                    <td className="px-4 py-2 font-medium text-gray-900 dark:text-[#e3e3e3]">
                      <EditableCell value={item.name} onSave={(v) => v && handleSave(item.id, "name", v)} />
                    </td>
                    <td className="px-4 py-2 text-gray-600 dark:text-[#9a9a9a]">
                      <EditableCell value={item.nameRo} onSave={(v) => handleSave(item.id, "nameRo", v)} placeholder="—" />
                    </td>
                    <td className="px-4 py-2 text-gray-600 dark:text-[#9a9a9a]">
                      <EditableCell value={item.category} onSave={(v) => handleSave(item.id, "category", v)} />
                    </td>
                    <td className="px-4 py-2 text-gray-600 dark:text-[#9a9a9a]">
                      <EditableCell value={item.unit} onSave={(v) => handleSave(item.id, "unit", v)} />
                    </td>
                    <td className="px-4 py-2 text-gray-600 dark:text-[#9a9a9a]">
                      <EditableCell value={item.unit2} onSave={(v) => handleSave(item.id, "unit2", v)} />
                    </td>
                    <td className="px-4 py-2 text-gray-600 dark:text-[#9a9a9a]">
                      <EditableCell value={item.conversion} isNumber align="right" onSave={(v) => handleSave(item.id, "conversion", v)} placeholder="—" />
                    </td>
                    <td className="px-4 py-2 text-gray-600 dark:text-[#9a9a9a]">
                      <EditableCell value={item.unitWeight != null ? fmt(item.unitWeight) : null} isNumber align="right" onSave={(v) => handleSave(item.id, "unitWeight", v)} placeholder="—" />
                    </td>
                    <td className="px-4 py-2 text-gray-700 dark:text-[#b8b8b8] font-medium">
                      <EditableCell value={item.kcal} isNumber align="right" onSave={(v) => handleSave(item.id, "kcal", v)} />
                    </td>
                    <td className="px-4 py-2 text-gray-700 dark:text-[#b8b8b8]">
                      <EditableCell value={item.carbs != null ? fmt(item.carbs) : null} isNumber align="right" onSave={(v) => handleSave(item.id, "carbs", v)} />
                    </td>
                    <td className="px-4 py-2 text-gray-700 dark:text-[#b8b8b8]">
                      <EditableCell value={item.fat != null ? fmt(item.fat) : null} isNumber align="right" onSave={(v) => handleSave(item.id, "fat", v)} />
                    </td>
                    <td className="px-4 py-2 text-gray-700 dark:text-[#b8b8b8]">
                      <EditableCell value={item.protein != null ? fmt(item.protein) : null} isNumber align="right" onSave={(v) => handleSave(item.id, "protein", v)} />
                    </td>
                    <td className="px-2 py-2">
                      <button
                        onClick={() => setEditingId(item.id)}
                        title="Edit ingredient"
                        className="p-1.5 text-gray-300 dark:text-[#444444] hover:text-orange-500 dark:hover:text-orange-400 transition-colors rounded"
                      >
                        <Pencil size={13} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && sorted.length > 0 && (
        <p className="text-xs text-gray-400 dark:text-[#555555] mt-3">
          Showing {sorted.length} of {items.length} · Macros per 100g · g/unit = grame per unitate (piece, tsp etc.) · Click any cell to edit
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
                  ? { ...item, name: updated.name, unit: updated.unit, unit2: updated.unit2 }
                  : item
              )
            );
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
              nameRo: null,
              category: null,
              unit: created.unit,
              unit2: created.unit2,
              conversion: null,
              kcal: null,
              carbs: null,
              fat: null,
              protein: null,
              unitWeight: null,
            }]);
            setCreatingNew(false);
          }}
        />
      )}
    </div>
  );
}
