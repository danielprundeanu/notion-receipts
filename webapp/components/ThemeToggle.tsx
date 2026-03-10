"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";

interface ThemeToggleProps {
  /** When true, renders a compact icon-only button (for mobile nav) */
  compact?: boolean;
}

export default function ThemeToggle({ compact = false }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  if (compact) {
    return (
      <button
        onClick={toggleTheme}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        className="flex flex-col items-center gap-0.5 py-2.5 px-2 text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
      >
        {isDark ? <Sun size={21} /> : <Moon size={21} />}
        <span className="text-[10px] font-medium">{isDark ? "Light" : "Dark"}</span>
      </button>
    );
  }

  return (
    <div className="flex items-center justify-between px-3 py-2">
      <div className="flex items-center gap-2.5 text-sm font-medium text-gray-600 dark:text-slate-400">
        {isDark ? <Moon size={15} /> : <Sun size={15} />}
        <span>{isDark ? "Dark" : "Light"}</span>
      </div>

      {/* Toggle pill */}
      <button
        role="switch"
        aria-checked={isDark}
        aria-label="Toggle dark mode"
        onClick={toggleTheme}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-800 ${
          isDark ? "bg-orange-500" : "bg-gray-200 dark:bg-slate-600"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ${
            isDark ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
