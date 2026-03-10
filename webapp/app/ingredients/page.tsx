"use client";

import { useEffect, useRef, useState } from "react";
import { getGroceryItems, updateGroceryItem } from "@/lib/actions";
import { Search } from "lucide-react";

type GroceryItem = {
  id: string;
  name: string;
  category: string | null;
  unit: string | null;
  unit2: string | null;
  conversion: number | null;
  kcal: number | null;
  carbs: number | null;
  fat: number | null;
  protein: number | null;
};

type NumField = "conversion" | "kcal" | "carbs" | "fat" | "protein";
type TextField = "name" | "category" | "unit" | "unit2";
type EditableField = TextField | NumField;

const NUM_FIELDS: NumField[] = ["conversion", "kcal", "carbs", "fat", "protein"];

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IngredientsPage() {
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getGroceryItems().then((data) => {
      setItems(data as GroceryItem[]);
      setLoading(false);
    });
  }, []);

  const categories = [...new Set(items.map((i) => i.category).filter(Boolean) as string[])].sort();

  const filtered = items.filter((item) => {
    const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = !category || item.category === category;
    return matchSearch && matchCat;
  });

  async function handleSave(id: string, field: EditableField, raw: string) {
    const isNum = (NUM_FIELDS as string[]).includes(field);
    const value = raw === ""
      ? null
      : isNum ? parseFloat(raw) : raw;

    // Optimistic update
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );

    await updateGroceryItem(id, { [field]: value } as Parameters<typeof updateGroceryItem>[1]);
  }

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-[#e3e3e3]">Ingredients</h1>
        <span className="text-sm text-gray-500 dark:text-[#787878]">{items.length} items</span>
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
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-[#787878] uppercase tracking-wide">Name</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-[#787878] uppercase tracking-wide">Category</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-[#787878] uppercase tracking-wide">Unit</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-[#787878] uppercase tracking-wide">Unit 2</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-[#787878] uppercase tracking-wide text-right">Conv.</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-[#787878] uppercase tracking-wide text-right">kcal</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-[#787878] uppercase tracking-wide text-right">Carbs g</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-[#787878] uppercase tracking-wide text-right">Fat g</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-[#787878] uppercase tracking-wide text-right">Protein g</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-[#2e2e2e]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                    No ingredients found
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-[#252525] transition-colors">
                    <td className="px-4 py-2 font-medium text-gray-900 dark:text-[#e3e3e3]">
                      <EditableCell
                        value={item.name}
                        onSave={(v) => v && handleSave(item.id, "name", v)}
                      />
                    </td>
                    <td className="px-4 py-2 text-gray-600 dark:text-[#9a9a9a]">
                      <EditableCell
                        value={item.category}
                        onSave={(v) => handleSave(item.id, "category", v)}
                      />
                    </td>
                    <td className="px-4 py-2 text-gray-600 dark:text-[#9a9a9a]">
                      <EditableCell
                        value={item.unit}
                        onSave={(v) => handleSave(item.id, "unit", v)}
                      />
                    </td>
                    <td className="px-4 py-2 text-gray-600 dark:text-[#9a9a9a]">
                      <EditableCell
                        value={item.unit2}
                        onSave={(v) => handleSave(item.id, "unit2", v)}
                      />
                    </td>
                    <td className="px-4 py-2 text-gray-600 dark:text-[#9a9a9a]">
                      <EditableCell
                        value={item.conversion}
                        isNumber
                        align="right"
                        onSave={(v) => handleSave(item.id, "conversion", v)}
                        placeholder="—"
                      />
                    </td>
                    <td className="px-4 py-2 text-gray-700 dark:text-[#b8b8b8] font-medium">
                      <EditableCell
                        value={item.kcal}
                        isNumber
                        align="right"
                        onSave={(v) => handleSave(item.id, "kcal", v)}
                      />
                    </td>
                    <td className="px-4 py-2 text-gray-700 dark:text-[#b8b8b8]">
                      <EditableCell
                        value={item.carbs != null ? fmt(item.carbs) : null}
                        isNumber
                        align="right"
                        onSave={(v) => handleSave(item.id, "carbs", v)}
                      />
                    </td>
                    <td className="px-4 py-2 text-gray-700 dark:text-[#b8b8b8]">
                      <EditableCell
                        value={item.fat != null ? fmt(item.fat) : null}
                        isNumber
                        align="right"
                        onSave={(v) => handleSave(item.id, "fat", v)}
                      />
                    </td>
                    <td className="px-4 py-2 text-gray-700 dark:text-[#b8b8b8]">
                      <EditableCell
                        value={item.protein != null ? fmt(item.protein) : null}
                        isNumber
                        align="right"
                        onSave={(v) => handleSave(item.id, "protein", v)}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <p className="text-xs text-gray-400 dark:text-[#555555] mt-3">
          Showing {filtered.length} of {items.length} · Macros per 100g/ml · Click any cell to edit
        </p>
      )}
    </div>
  );
}
