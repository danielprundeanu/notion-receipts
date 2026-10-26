"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";

// Energy per gram — used to split the calories between the macros.
const KCAL_PER_G = { carbs: 4, protein: 4, fat: 9 } as const;

const MACROS = [
  { key: "carbs", label: "Carbs", stroke: "stroke-[#2a78d6] dark:stroke-[#3987e5]", bg: "bg-[#2a78d6] dark:bg-[#3987e5]" },
  { key: "fat", label: "Fat", stroke: "stroke-[#eb6834] dark:stroke-[#d95926]", bg: "bg-[#eb6834] dark:bg-[#d95926]" },
  { key: "protein", label: "Protein", stroke: "stroke-[#1baf7a] dark:stroke-[#199e70]", bg: "bg-[#1baf7a] dark:bg-[#199e70]" },
] as const;

type MacroKey = (typeof MACROS)[number]["key"];

const R = 70;
const CIRC = 2 * Math.PI * R;
const GAP = 3; // px of surface between segments

// Per-serving macros as a donut of calorie share, plus grams in the legend.
export default function MacrosSheet({
  kcal,
  carbs,
  fat,
  protein,
  onClose,
}: {
  kcal: number;
  carbs: number;
  fat: number;
  protein: number;
  onClose: () => void;
}) {
  const [active, setActive] = useState<MacroKey | null>(null);
  const grams: Record<MacroKey, number> = { carbs, fat, protein };
  const energy = MACROS.map((m) => grams[m.key] * KCAL_PER_G[m.key]);
  const energyTotal = energy.reduce((a, b) => a + b, 0);
  const pct = energy.map((e) => (energyTotal > 0 ? (e / energyTotal) * 100 : 0));
  const shown = MACROS.filter((_, i) => pct[i] > 0).length;

  const lens = pct.map((p) => (p / 100) * CIRC);
  const segments = MACROS.map((m, i) => ({
    ...m,
    len: lens[i],
    offset: lens.slice(0, i).reduce((a, b) => a + b, 0),
  }));

  const activeIdx = active ? MACROS.findIndex((m) => m.key === active) : -1;

  return (
    <Sheet title="Macronutrients" onClose={onClose}>
      <p className="mt-0.5 text-[13px] text-gray-600 dark:text-[#a49c90]">Per serving · share of calories</p>

      {energyTotal === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500 dark:text-[#8f877b]">No macro data for this recipe</p>
      ) : (
        <>
          <div className="relative mx-auto mt-4 w-56 h-56">
            <svg viewBox="0 0 180 180" className="w-full h-full -rotate-90" role="img" aria-label={
              MACROS.map((m, i) => `${m.label} ${Math.round(pct[i])}%`).join(", ")
            }>
              <circle cx="90" cy="90" r={R} fill="none" strokeWidth="26" className="stroke-gray-100 dark:stroke-[#24211c]" />
              {segments.map((s) => {
                if (s.len <= 0) return null;
                const visible = shown > 1 ? Math.max(s.len - GAP, 0.5) : s.len;
                const dim = active != null && active !== s.key;
                return (
                  <circle
                    key={s.key}
                    cx="90"
                    cy="90"
                    r={R}
                    fill="none"
                    strokeWidth={active === s.key ? 30 : 26}
                    strokeDasharray={`${visible} ${CIRC - visible}`}
                    strokeDashoffset={-s.offset}
                    className={`${s.stroke} transition-all cursor-pointer ${dim ? "opacity-35" : ""}`}
                    onMouseEnter={() => setActive(s.key)}
                    onMouseLeave={() => setActive(null)}
                    onClick={() => setActive((a) => (a === s.key ? null : s.key))}
                  />
                );
              })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
              {activeIdx >= 0 ? (
                <>
                  <p className="text-2xl font-bold text-gray-900 dark:text-[#eae5de]">{Math.round(pct[activeIdx])}%</p>
                  <p className="text-xs text-gray-600 dark:text-[#a49c90]">{MACROS[activeIdx].label}</p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold text-gray-900 dark:text-[#eae5de]">{Math.round(kcal)}</p>
                  <p className="text-xs text-gray-600 dark:text-[#a49c90]">kcal</p>
                </>
              )}
            </div>
          </div>

          <ul className="mt-5 space-y-1">
            {MACROS.map((m, i) => (
              <li key={m.key}>
                <button
                  type="button"
                  onClick={() => setActive((a) => (a === m.key ? null : m.key))}
                  aria-pressed={active === m.key}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                    active === m.key ? "bg-gray-100 dark:bg-[#24211c]" : ""
                  }`}
                >
                  <span aria-hidden className={`w-3 h-3 rounded-full shrink-0 ${m.bg}`} />
                  <span className="flex-1 text-[15px] font-medium text-gray-900 dark:text-[#eae5de]">{m.label}</span>
                  <span className="text-[15px] font-semibold text-gray-900 dark:text-[#eae5de] tabular-nums">
                    {Math.round(grams[m.key])} g
                  </span>
                  <span className="w-12 text-right text-sm text-gray-600 dark:text-[#a49c90] tabular-nums">
                    {Math.round(pct[i])}%
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-gray-500 dark:text-[#8f877b]">
            Calorie share uses 4 kcal/g for carbs and protein, 9 kcal/g for fat.
          </p>
        </>
      )}
    </Sheet>
  );
}
