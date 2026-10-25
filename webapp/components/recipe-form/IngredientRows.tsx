"use client";

import { useRef, useState } from "react";
import { ChevronRight, GripVertical } from "lucide-react";
import { formatAmount } from "@/lib/quantities";
import type { IngredientRow } from "./ui";

export function amountLabel(ing: IngredientRow): string {
  const q = parseFloat(ing.quantity);
  if (!ing.quantity.trim() || isNaN(q)) return "";
  return `${formatAmount(q, ing.unit || null)}${ing.unit && ing.unit !== "piece" ? ` ${ing.unit}` : ""}`;
}

type Drag = { from: number; to: number; dy: number; startY: number; heights: number[] };

// One group's ingredients. A tap opens the row in the sheet; the grip drags it to a new
// place (pointer events, so it works with a finger), and arrow keys move it from the keyboard.
export default function IngredientRows({
  rows,
  onOpen,
  onMove,
}: {
  rows: IngredientRow[];
  onOpen: (row: IngredientRow) => void;
  onMove: (from: number, to: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  function start(e: React.PointerEvent<HTMLButtonElement>, index: number) {
    if (e.button !== 0) return;
    const els = listRef.current?.querySelectorAll<HTMLElement>("[data-ing-row]");
    if (!els) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ from: index, to: index, dy: 0, startY: e.clientY, heights: [...els].map((el) => el.offsetHeight) });
  }

  function move(e: React.PointerEvent) {
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    // Passing the middle of a neighbour swaps with it.
    let to = drag.from;
    let travelled = 0;
    if (dy > 0) {
      while (to < rows.length - 1 && dy > travelled + drag.heights[to + 1] / 2) travelled += drag.heights[++to];
    } else {
      while (to > 0 && -dy > travelled + drag.heights[to - 1] / 2) travelled += drag.heights[--to];
    }
    setDrag({ ...drag, dy, to });
  }

  function end() {
    if (drag && drag.to !== drag.from) onMove(drag.from, drag.to);
    setDrag(null);
  }

  function shiftOf(i: number): number {
    if (!drag || i === drag.from) return 0;
    const h = drag.heights[drag.from];
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return -h;
    if (drag.from > drag.to && i >= drag.to && i < drag.from) return h;
    return 0;
  }

  return (
    <div ref={listRef}>
      {rows.map((ing, i) => {
        const dragging = drag?.from === i;
        const amount = amountLabel(ing);
        return (
          <div
            key={ing.id}
            data-ing-row
            className={`relative flex items-stretch border-t first:border-t-0 border-gray-200 dark:border-[#3a352e] ${
              dragging ? "z-10 bg-white dark:bg-[#2e2a24] shadow-lg rounded-xl" : drag ? "transition-transform duration-150" : ""
            }`}
            style={{ transform: `translateY(${dragging ? drag!.dy : shiftOf(i)}px)` }}
          >
            <button
              type="button"
              aria-label={`Move ${ing.groceryItemName}. Drag, or use the arrow keys`}
              onPointerDown={(e) => start(e, i)}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={() => setDrag(null)}
              onKeyDown={(e) => {
                if (e.key === "ArrowUp" && i > 0) { e.preventDefault(); onMove(i, i - 1); }
                if (e.key === "ArrowDown" && i < rows.length - 1) { e.preventDefault(); onMove(i, i + 1); }
              }}
              className="w-11 shrink-0 flex items-center justify-center text-gray-400 dark:text-[#8f877b] cursor-grab active:cursor-grabbing touch-none"
            >
              <GripVertical size={18} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => onOpen(ing)}
              aria-label={`Edit ${ing.groceryItemName}`}
              className="flex-1 min-w-0 min-h-[54px] flex items-center gap-2.5 py-1.5 pr-3 text-left"
            >
              <span className="flex-1 min-w-0 text-base leading-[1.35] text-gray-900 dark:text-[#eae5de]">
                {amount && <b className="font-bold">{amount} </b>}
                {ing.groceryItemName}
                {(ing.notes || !amount) && (
                  <span className="text-gray-600 dark:text-[#a49c90]"> · {ing.notes || "to taste"}</span>
                )}
                {!ing.groceryItemId && (
                  <span className="ml-1.5 align-[1px] inline-block px-1.5 rounded-md bg-teal-50 dark:bg-teal-500/15 text-[11px] font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">
                    New
                  </span>
                )}
              </span>
              <ChevronRight size={16} className="shrink-0 text-gray-400 dark:text-[#8f877b]" aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}
