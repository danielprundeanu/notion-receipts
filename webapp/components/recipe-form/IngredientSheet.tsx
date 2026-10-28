"use client";

import { useEffect, useState } from "react";
import { Check, Plus } from "lucide-react";
import { searchGroceryItems } from "@/lib/actions";
import { editableAmount, parseAmount } from "@/lib/quantities";
import GroceryItemModal from "@/components/GroceryItemModal";
import {
  ALL_UNITS, Sheet, fieldCls, hintCls, labelCls, pillCls, pillOff, pillOn, uid,
  type IngredientRow,
} from "./ui";

type ItemOption = { id: string; name: string; unit: string | null; unit2: string | null };

function unitsOf(item: { unit: string | null; unit2: string | null }): string[] | null {
  const u = [item.unit, item.unit2].filter(Boolean) as string[];
  return u.length ? u : null;
}

// Add or edit one ingredient: the item (searched in Ingredients), amount, unit and note.
// The unit is one of the item's own units — a recipe can't store one the item can't convert.
export default function IngredientSheet({
  row,
  groupId,
  groups,
  onSave,
  onRemove,
  onClose,
}: {
  row: IngredientRow | null; // null = adding a new one
  groupId: string;
  groups: { id: string; name: string }[];
  onSave: (row: IngredientRow, groupId: string) => void;
  onRemove?: () => void;
  onClose: () => void;
}) {
  const initialAmount = row?.quantity.trim() ? editableAmount(parseFloat(row.quantity)) : "";
  const [name, setName] = useState(row?.groceryItemName ?? "");
  const [itemId, setItemId] = useState<string | null>(row?.groceryItemId ?? null);
  const [units, setUnits] = useState<string[] | null>(row?.availableUnits ?? null);
  const [amount, setAmount] = useState(initialAmount);
  const [unit, setUnit] = useState(row?.unit || "g");
  const [notes, setNotes] = useState(row?.notes ?? "");
  const [target, setTarget] = useState(groupId);
  const [results, setResults] = useState<ItemOption[]>([]);
  const [searchFailed, setSearchFailed] = useState(false);
  const [itemModal, setItemModal] = useState<"create" | "edit" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = name.trim();
  const searching = !itemId && query.length >= 2;
  useEffect(() => {
    if (!searching) return;
    const t = setTimeout(async () => {
      try {
        setResults(await searchGroceryItems(query));
        setSearchFailed(false);
      } catch {
        setSearchFailed(true);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, searching]);

  const exact = results.find((r) => r.name.toLowerCase() === query.toLowerCase()) ?? null;

  function pick(item: ItemOption) {
    const u = unitsOf(item);
    setName(item.name);
    setItemId(item.id);
    setUnits(u);
    if (u && !u.includes(unit)) setUnit(u[0]);
    setError(null);
  }

  function save() {
    const nm = query;
    if (!nm) {
      setError("Pick an item or type its name.");
      return;
    }
    const q = parseAmount(amount);
    if (q !== null && (isNaN(q) || q < 0)) {
      setError("The amount should be a number, like 2, 1.5 or 1/2. Leave it empty for “to taste”.");
      return;
    }
    let id = itemId;
    let avail = units;
    let u = unit;
    let finalName = nm;
    // Typed the exact name of an existing item without tapping it: link it anyway.
    if (!id && exact) {
      id = exact.id;
      avail = unitsOf(exact);
      finalName = exact.name;
      if (avail && !avail.includes(u)) u = avail[0];
    }
    onSave(
      {
        id: row?.id ?? uid(),
        groceryItemName: finalName,
        groceryItemId: id,
        availableUnits: avail,
        // An untouched amount keeps its stored precision (⅓ shows as "⅓" but is 0.333333).
        quantity: row && amount === initialAmount ? row.quantity : q === null ? "" : String(Number(q.toFixed(6))),
        unit: u,
        notes: notes.trim(),
      },
      target
    );
  }

  const unitOptions = units ?? ALL_UNITS;
  const pills = !unit || unitOptions.includes(unit) ? unitOptions : [unit, ...unitOptions];

  return (
    <>
      <Sheet title={row ? "Edit ingredient" : "Add ingredient"} onClose={onClose} escapeCloses={itemModal === null}>
        {/* Enter (or the keyboard's Go) adds it, like the button */}
        <form onSubmit={(e) => { e.preventDefault(); save(); }}>
          <label className={labelCls} htmlFor="ing-item">Item</label>
          <input
            id="ing-item"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
              if (itemId) {
                setItemId(null);
                setUnits(null);
              }
            }}
            placeholder="Search your ingredients"
            autoComplete="off"
            autoFocus={!row}
            className={fieldCls}
          />
          {itemId ? (
            <p className={`mt-1.5 flex items-center gap-1.5 ${hintCls}`}>
              <Check size={14} className="text-teal-600 dark:text-teal-400" aria-hidden />
              In your ingredients{units ? ` · ${units.join(" / ")}` : ""}
            </p>
          ) : searching ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => pick(r)}
                  className="h-10 px-3 rounded-full border border-dashed border-gray-300 dark:border-[#3a352e] text-sm text-gray-700 dark:text-[#d8d0c4]"
                >
                  {r.name}
                </button>
              ))}
              {!exact && (
                <button
                  type="button"
                  onClick={() => setItemModal("create")}
                  className="h-10 px-3 rounded-full border border-dashed border-orange-300 dark:border-orange-900/70 text-sm font-semibold text-orange-700 dark:text-orange-400 inline-flex items-center gap-1"
                >
                  <Plus size={14} aria-hidden /> New item “{query}”
                </button>
              )}
              {searchFailed && <p className="w-full text-sm text-red-600 dark:text-red-400">Search failed. Keep typing to try again.</p>}
            </div>
          ) : null}

          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3">
            <div>
              <label className={labelCls} htmlFor="ing-amount">Amount</label>
              <input
                id="ing-amount"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setError(null); }}
                placeholder="to taste"
                className={fieldCls}
              />
            </div>
            <div className="min-w-0">
              <span className={labelCls}>Unit</span>
              <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {pills.map((u) => (
                  <button key={u} type="button" onClick={() => setUnit(u)} aria-pressed={unit === u} className={`${pillCls} ${unit === u ? pillOn : pillOff}`}>
                    {u}
                  </button>
                ))}
                {itemId && (
                  <button
                    type="button"
                    onClick={() => setItemModal("edit")}
                    className={`${pillCls} border-dashed border-gray-300 dark:border-[#3a352e] text-orange-700 dark:text-orange-400`}
                  >
                    Other…
                  </button>
                )}
              </div>
            </div>
          </div>

          <label className={labelCls} htmlFor="ing-note">Note</label>
          <input
            id="ing-note"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. roughly chopped"
            autoComplete="off"
            className={fieldCls}
          />

          {groups.length > 1 && (
            <>
              <span className={labelCls}>Group</span>
              <div className="flex flex-wrap gap-1.5">
                {groups.map((g, i) => (
                  <button key={g.id} type="button" onClick={() => setTarget(g.id)} aria-pressed={target === g.id} className={`${pillCls} ${target === g.id ? pillOn : pillOff}`}>
                    {g.name.trim() || `Group ${i + 1}`}
                  </button>
                ))}
              </div>
            </>
          )}

          <p className={`mt-3 ${hintCls}`}>
            Units, nutrition and aisle belong to the item.{" "}
            {itemId ? (
              <button type="button" onClick={() => setItemModal("edit")} className="font-semibold text-orange-700 dark:text-orange-400 underline underline-offset-2 py-2">
                Edit {name.trim() || "the item"}
              </button>
            ) : query ? (
              "A name that isn't in your ingredients is added there when you save."
            ) : null}
          </p>

          {error && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="mt-4 flex gap-2.5">
            {onRemove && (
              <button
                type="button"
                onClick={onRemove}
                className="h-[52px] px-[18px] rounded-[14px] border border-gray-200 dark:border-[#3a352e] bg-white dark:bg-[#24211c] text-[15px] font-bold text-red-600 dark:text-red-400"
              >
                Remove
              </button>
            )}
            <button
              type="submit"
              className="flex-1 h-[52px] rounded-[14px] bg-orange-500 hover:bg-orange-600 text-gray-900 text-base font-bold transition-colors"
            >
              {row ? "Done" : "Add"}
            </button>
          </div>
        </form>
      </Sheet>

      {itemModal && (
        <GroceryItemModal
          itemId={itemModal === "edit" ? itemId ?? undefined : undefined}
          initialName={itemModal === "create" ? query : undefined}
          onClose={() => setItemModal(null)}
          onSaved={pick}
          onDeleted={() => {
            setItemId(null);
            setUnits(null);
            setItemModal(null);
          }}
        />
      )}
    </>
  );
}
