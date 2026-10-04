"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import type { DraftTransaction, NotionCategory } from "@/lib/types";

type Choice = { notionCategoryId: string; saveRule: boolean };

type Props = {
  transactions: DraftTransaction[];
  notionCategories: NotionCategory[];
  onApply: (transactions: DraftTransaction[]) => void;
  onBack: () => void;
};

export default function ResolveStep({
  transactions,
  notionCategories,
  onApply,
  onBack,
}: Props) {
  /** Distinct Revolut categories on included rows that still have no Notion page. */
  const pending = useMemo(() => {
    const seen = new Map<string, { display: string; count: number; total: number }>();
    for (const transaction of transactions) {
      if (!transaction.include || transaction.notionCategoryId) continue;
      const display = transaction.revolutCategory?.trim() || "(fără categorie)";
      const key = display.toLowerCase();
      const existing = seen.get(key) ?? { display, count: 0, total: 0 };
      existing.count += 1;
      existing.total += transaction.amount;
      seen.set(key, existing);
    }
    return [...seen.values()].sort((a, b) => b.total - a.total);
  }, [transactions]);

  const [choices, setChoices] = useState<Record<string, Choice>>({});

  function setChoice(display: string, patch: Partial<Choice>) {
    setChoices((current) => {
      const key = display.toLowerCase();
      const existing: Choice = current[key] ?? { notionCategoryId: "", saveRule: true };
      return { ...current, [key]: { ...existing, ...patch } };
    });
  }

  const resolvedCount = pending.filter(
    (item) => choices[item.display.toLowerCase()]?.notionCategoryId,
  ).length;

  function apply() {
    const byId = new Map(notionCategories.map((category) => [category.id, category]));

    const next = transactions.map((transaction) => {
      if (!transaction.include || transaction.notionCategoryId) return transaction;
      const key = (transaction.revolutCategory?.trim() || "(fără categorie)").toLowerCase();
      const choice = choices[key];
      const category = choice?.notionCategoryId
        ? byId.get(choice.notionCategoryId)
        : undefined;
      if (!category) return transaction;

      return {
        ...transaction,
        notionCategoryId: category.id,
        notionCategoryName: category.name,
        matchType: "manual" as const,
        // Only worth remembering when there is a real Revolut category name to
        // key the rule on.
        saveRule: Boolean(choice.saveRule && transaction.revolutCategory),
      };
    });

    onApply(next);
  }

  if (pending.length === 0) {
    return (
      <div className="space-y-6">
        <section className="flex items-start gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
          <CheckCircle2
            className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400"
            aria-hidden
          />
          <div>
            <h2 className="font-semibold text-emerald-700 dark:text-emerald-400">
              Toate categoriile sunt mapate
            </h2>
            <p className="text-sm text-emerald-800 dark:text-emerald-300">
              Nimic de rezolvat manual — poți trece direct la import.
            </p>
          </div>
        </section>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-4 font-medium"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Înapoi
          </button>
          <button
            type="button"
            onClick={() => onApply(transactions)}
            className="flex min-h-12 flex-[2] items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 font-medium text-white"
          >
            Continuă
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="font-semibold">Categorii nemapate</h2>
        <p className="mb-4 text-sm text-[var(--muted)]">
          Alege categoria Notion corespunzătoare. Cu „ține minte” bifat, alegerea se
          salvează ca regulă și se aplică automat la importurile viitoare.
        </p>

        {notionCategories.length === 0 && (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            Nu am găsit nicio categorie în Notion. Verifică maparea din Setări.
          </p>
        )}

        <ul className="divide-y divide-[var(--border)]">
          {pending.map((item) => {
            const key = item.display.toLowerCase();
            const choice = choices[key];
            return (
              <li key={key} className="py-4">
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <span className="font-medium">{item.display}</span>
                  <span className="shrink-0 text-sm text-[var(--muted)] tabular-nums">
                    {item.count} tranzacții · {item.total.toFixed(2)}
                  </span>
                </div>
                <select
                  value={choice?.notionCategoryId ?? ""}
                  onChange={(event) =>
                    setChoice(item.display, { notionCategoryId: event.target.value })
                  }
                  aria-label={`Categorie Notion pentru ${item.display}`}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                >
                  <option value="">— alege categoria Notion —</option>
                  {notionCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <label className="mt-2 flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={choice?.saveRule ?? true}
                    onChange={(event) =>
                      setChoice(item.display, { saveRule: event.target.checked })
                    }
                    className="h-5 w-5 accent-orange-500"
                  />
                  Ține minte pentru importurile viitoare
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-4 font-medium"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Înapoi
        </button>
        <button
          type="button"
          onClick={apply}
          className="flex min-h-12 flex-[2] items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 font-medium text-white"
        >
          {resolvedCount === pending.length
            ? "Continuă"
            : `Continuă (${pending.length - resolvedCount} rămân nemapate)`}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
