"use client";

import { useEffect, useId, useRef } from "react";

// Shared sheet primitives: the recipe editor, the recipes list and the add-recipes flow use them.

// Drag a bottom sheet down by its grab bar to close it. Returns a ref for the sheet panel
// and the props for the bar (SheetGrabber). A short or slow pull springs back.
export function useSheetDrag(onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; t: number; dy: number } | null>(null);

  function settle(transform: string, ms: number) {
    const p = panelRef.current;
    if (!p) return;
    p.style.transition = `transform ${ms}ms ease-out`;
    p.style.transform = transform;
  }

  const grabberProps = {
    onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      drag.current = { y: e.clientY, t: e.timeStamp, dy: 0 };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // No live pointer to capture (a synthetic event): the drag still works while over the bar.
      }
      if (panelRef.current) panelRef.current.style.transition = "none";
    },
    onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
      const d = drag.current;
      if (!d) return;
      d.dy = Math.max(0, e.clientY - d.y);
      if (panelRef.current) panelRef.current.style.transform = d.dy ? `translateY(${d.dy}px)` : "";
    },
    onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      const flick = d.dy > 24 && d.dy / Math.max(1, e.timeStamp - d.t) > 0.6;
      if (d.dy < 96 && !flick) return settle("", 200);
      settle("translateY(100%)", 180);
      setTimeout(() => {
        onClose();
        // Still open (it asked to confirm and was kept): slide back up.
        setTimeout(() => {
          if (panelRef.current?.isConnected) settle("", 200);
        }, 0);
      }, 180);
    },
    onPointerCancel() {
      drag.current = null;
      settle("", 200);
    },
  };
  return { panelRef, grabberProps };
}

// The grab bar at the top of a bottom sheet, as a full-width strip you can pull down.
// Phones only, like the sheet shape itself. `className` sets the space under it.
export function SheetGrabber({
  drag,
  className = "pb-3",
}: {
  drag: ReturnType<typeof useSheetDrag>["grabberProps"];
  className?: string;
}) {
  return (
    <div {...drag} aria-hidden className={`md:hidden -mx-4 -mt-2.5 pt-3 flex justify-center touch-none cursor-grab ${className}`}>
      <div className="w-10 h-[5px] rounded-full bg-gray-200 dark:bg-[#3a352e]" />
    </div>
  );
}

// Bottom sheet on phones, centred dialog from md up. Escape and a tap on the dim area close it.
export function Sheet({
  title,
  onClose,
  escapeCloses = true,
  children,
}: {
  title: string;
  onClose: () => void;
  escapeCloses?: boolean;
  children: React.ReactNode;
}) {
  const titleId = useId();
  const { panelRef, grabberProps } = useSheetDrag(onClose);
  useEffect(() => {
    if (!escapeCloses) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, escapeCloses]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 dark:bg-black/60 flex flex-col justify-end md:items-center md:justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-[var(--color-bg-base)] rounded-t-3xl md:rounded-3xl w-full md:max-w-md max-h-[92dvh] overflow-y-auto px-4 pt-2.5 shadow-xl"
        style={{ paddingBottom: "max(1.75rem, env(safe-area-inset-bottom))" }}
      >
        <SheetGrabber drag={grabberProps} />
        <h2 id={titleId} className="text-xl font-bold text-gray-900 dark:text-[#eae5de]">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="h-11 w-14 shrink-0 flex items-center justify-center -mr-1"
    >
      <span className={`relative block w-[52px] h-8 rounded-full transition-colors ${on ? "bg-orange-500" : "bg-gray-200 dark:bg-[#2e2a24]"}`}>
        <span
          className={`absolute top-[3px] left-[3px] w-[26px] h-[26px] rounded-full transition-transform ${
            on ? "translate-x-5 bg-white" : "bg-gray-500 dark:bg-[#a49c90]"
          }`}
        />
      </span>
    </button>
  );
}

// One-of-N toggle. `allowNone` lets a tap on the chosen option clear it.
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  allowNone = false,
  className = "",
  buttonClassName = "flex-1",
}: {
  options: { value: T; label: string }[];
  value: T | "";
  onChange: (v: T | "") => void;
  label: string;
  allowNone?: boolean;
  className?: string;
  buttonClassName?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`flex gap-0.5 p-[3px] rounded-xl bg-white dark:bg-[#24211c] border border-gray-200 dark:border-[#3a352e] ${className}`}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on && allowNone ? "" : o.value)}
            className={`${buttonClassName} h-10 rounded-[10px] text-sm font-semibold transition-colors ${
              on ? "bg-gray-100 dark:bg-[#2e2a24] text-gray-900 dark:text-[#eae5de]" : "text-gray-600 dark:text-[#a49c90]"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
