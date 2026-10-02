"use client";

import { useRef, useState } from "react";

/**
 * Editable servings number shown between −/+ steppers. Typing is kept as a local
 * draft and only committed on blur / Enter, so a half-typed value ("1" on the way
 * to "12") never triggers a save or a rescale. Invalid input reverts to `value`.
 */
export default function ServingsInput({
  value,
  onCommit,
  min = 1,
  className = "",
  ariaLabel = "Servings",
}: {
  value: number;
  onCommit: (n: number) => void;
  min?: number;
  className?: string;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);

  function commit() {
    if (draft === null) return;
    if (cancelled.current) { cancelled.current = false; setDraft(null); return; }
    const n = Math.round(parseFloat(draft.replace(",", ".")));
    setDraft(null);
    if (!isFinite(n) || n < min || n === value) return;
    onCommit(n);
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={ariaLabel}
      value={draft ?? String(value)}
      onFocus={(e) => { setDraft(String(value)); e.target.select(); }}
      onChange={(e) => setDraft(e.target.value.replace(/[^\d.,]/g, ""))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
        if (e.key === "Escape") { cancelled.current = true; (e.target as HTMLInputElement).blur(); }
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className={`text-center bg-transparent rounded-md select-text focus:outline-none focus:ring-2 focus:ring-orange-400 ${className}`}
    />
  );
}
