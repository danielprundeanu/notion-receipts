"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  MessageSquare,
} from "lucide-react";
import { assignCategory } from "@/lib/rules";
import type { DraftTransaction, ParseResult } from "@/lib/types";

const CATEGORY_SOURCE_LABEL: Record<DraftTransaction["categorySource"], string> = {
  screenshot: "din screenshot",
  none: "lipsă",
};

/**
 * Stands in for "these rows point at different categories". A real value is
 * needed — with an empty one, picking "fără categorie" would not fire a change.
 */
const MIXED = "__mixed__";

const NO_CATEGORY = "(fără categorie)";

function formatAmount(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currency}`;
}

/** "2026-08" → "august 2026" */
function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  if (!year || !month) return key;
  return new Date(year, month - 1, 1).toLocaleDateString("ro-RO", {
    month: "long",
    year: "numeric",
  });
}

type Props = {
  result: ParseResult;
  transactions: DraftTransaction[];
  onTransactionsChange: (transactions: DraftTransaction[]) => void;
  onBack: () => void;
  onNext: () => void;
};

export default function ReviewStep({
  result,
  transactions,
  onTransactionsChange,
  onBack,
  onNext,
}: Props) {
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set());

  const included = transactions.filter((transaction) => transaction.include);
  const total = included.reduce((sum, transaction) => sum + transaction.amount, 0);

  // Rows the screenshots never showed. They are the ones the user rules on.
  const covered = useMemo(
    () =>
      transactions.filter(
        (transaction) => transaction.isAggregate || transaction.categorySource !== "none",
      ),
    [transactions],
  );

  const categoryById = useMemo(
    () => new Map(result.notionCategories.map((category) => [category.id, category])),
    [result.notionCategories],
  );

  /**
   * The screenshot rows, grouped by their Revolut category — the unit the user
   * retargets in bulk. Rows keep their own picker for one-off exceptions.
   */
  const screenshotGroups = useMemo(() => {
    const groups = new Map<string, DraftTransaction[]>();
    for (const transaction of covered) {
      const key = transaction.revolutCategory?.trim().toLowerCase() ?? "";
      const existing = groups.get(key);
      if (existing) existing.push(transaction);
      else groups.set(key, [transaction]);
    }

    return [...groups.entries()]
      .map(([key, rows]) => {
        const assigned = new Set(rows.map((row) => row.notionCategoryId ?? ""));
        const uniqueId = assigned.size === 1 ? [...assigned][0] : null;
        return {
          key,
          display: rows[0].revolutCategory?.trim() || NO_CATEGORY,
          rows,
          total: rows.reduce((sum, row) => sum + row.amount, 0),
          /** null when the rows disagree — the picker then shows "mixte". */
          uniqueCategoryId: uniqueId,
          canSaveRule: Boolean(rows[0].revolutCategory && uniqueId),
          saveRule: rows.every((row) => row.saveRule === true),
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [covered]);

  const months = useMemo(() => {
    const groups = new Map<string, DraftTransaction[]>();
    for (const transaction of transactions) {
      if (transaction.isAggregate || transaction.categorySource !== "none") continue;
      const key = transaction.date.slice(0, 7);
      const existing = groups.get(key);
      if (existing) existing.push(transaction);
      else groups.set(key, [transaction]);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, rows]) => ({
        key,
        rows,
        total: rows.reduce((sum, row) => sum + row.amount, 0),
        includedCount: rows.filter((row) => row.include).length,
      }));
  }, [transactions]);

  function toggle(id: string) {
    onTransactionsChange(
      transactions.map((transaction) =>
        transaction.id === id
          ? { ...transaction, include: !transaction.include }
          : transaction,
      ),
    );
  }

  function setMany(ids: Set<string>, include: boolean) {
    onTransactionsChange(
      transactions.map((transaction) =>
        ids.has(transaction.id) ? { ...transaction, include } : transaction,
      ),
    );
  }

  function setCategory(ids: Set<string>, categoryId: string, saveRule: boolean) {
    const category = categoryId ? (categoryById.get(categoryId) ?? null) : null;
    onTransactionsChange(assignCategory(transactions, ids, category, saveRule));
  }

  function toggleMonthOpen(key: string) {
    setOpenMonths((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="font-semibold">Ce am citit</h2>
        <ul className="mt-2 space-y-1 text-sm text-[var(--muted)]">
          {result.screenshots.map((screenshot) => (
            <li key={screenshot.fileName}>
              <span className="text-[var(--foreground)]">{screenshot.fileName}</span> —{" "}
              {screenshot.kind}
              {screenshot.category ? ` · ${screenshot.category}` : ""}
              {screenshot.periodLabel ? ` · ${screenshot.periodLabel}` : ""}
              {screenshot.totals.length > 0
                ? ` · ${screenshot.totals.length} categorii`
                : ""}
              {screenshot.entries.length > 0
                ? ` · ${screenshot.entries.length} tranzacții`
                : ""}
            </li>
          ))}
          <li>
            {included.length} tranzacții selectate ·{" "}
            {formatAmount(total, result.currency)}
          </li>
        </ul>
      </section>

      {result.warnings.length > 0 && (
        <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <h2 className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            Atenționări
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-800 dark:text-amber-300">
            {result.warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </section>
      )}

      {result.reconciliation.length > 0 && (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <h2 className="font-semibold">Reconciliere cu totalurile din screenshot</h2>
          <p className="mb-3 text-sm text-[var(--muted)]">
            Diferența arată cât din totalul afișat de Revolut a fost acoperit de
            tranzacțiile identificate.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-sm">
              <thead className="text-left text-[var(--muted)]">
                <tr>
                  <th className="py-1 pr-3 font-medium">Categorie</th>
                  <th className="py-1 pr-3 text-right font-medium">Screenshot</th>
                  <th className="py-1 pr-3 text-right font-medium">Alocat</th>
                  <th className="py-1 text-right font-medium">Diferență</th>
                </tr>
              </thead>
              <tbody>
                {result.reconciliation.map((row) => (
                  <tr key={row.category} className="border-t border-[var(--border)]">
                    <td className="py-2 pr-3">{row.category}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {row.screenshotTotal.toFixed(2)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {row.assignedTotal.toFixed(2)} ({row.transactionCount})
                    </td>
                    <td
                      className={`py-2 text-right tabular-nums ${
                        Math.abs(row.delta) < 0.01
                          ? "text-[var(--muted)]"
                          : "text-amber-600 dark:text-amber-400"
                      }`}
                    >
                      {row.delta > 0 ? "+" : ""}
                      {row.delta.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {months.length > 0 && (
        <section className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
          <h2 className="font-semibold">Nu apar în screenshot-uri</h2>
          <p className="mb-3 text-sm text-[var(--muted)]">
            Tranzacții din CSV pe care niciun screenshot nu le-a arătat. Sunt{" "}
            <strong>excluse implicit</strong> — include-le pe cele pe care le vrei
            oricum în Notion, iar categoria le-o alegi în pasul următor.
          </p>

          <ul className="divide-y divide-[var(--border)]">
            {months.map((month) => {
              const ids = new Set(month.rows.map((row) => row.id));
              const isOpen = openMonths.has(month.key);
              const allIncluded = month.includedCount === month.rows.length;
              return (
                <li key={month.key} className="py-2">
                  <button
                    type="button"
                    onClick={() => toggleMonthOpen(month.key)}
                    aria-expanded={isOpen}
                    className="flex min-h-11 w-full items-center gap-2 text-left"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
                    )}
                    <span className="font-medium capitalize">
                      {monthLabel(month.key)}
                    </span>
                    <span className="ml-auto shrink-0 text-sm tabular-nums text-[var(--muted)]">
                      {month.rows.length} ·{" "}
                      {formatAmount(month.total, result.currency)}
                    </span>
                  </button>

                  <div className="flex items-center gap-3 pl-6">
                    <span className="text-sm text-[var(--muted)] tabular-nums">
                      {month.includedCount} din {month.rows.length} incluse
                    </span>
                    <button
                      type="button"
                      onClick={() => setMany(ids, !allIncluded)}
                      className="ml-auto flex min-h-11 items-center rounded-lg border border-[var(--border)] px-3 text-sm font-medium"
                    >
                      {allIncluded ? "Exclude luna" : "Include luna"}
                    </button>
                  </div>

                  {isOpen && (
                    <ul className="mt-2 divide-y divide-[var(--border)] pl-6">
                      {month.rows.map((row) => (
                        <li key={row.id} className="flex items-start gap-3 py-2">
                          <input
                            type="checkbox"
                            checked={row.include}
                            onChange={() => toggle(row.id)}
                            aria-label={`Include ${row.description}`}
                            className="mt-1 h-5 w-5 shrink-0 accent-orange-500"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {row.description}
                            </p>
                            <p className="text-sm text-[var(--muted)]">{row.date}</p>
                          </div>
                          <span className="shrink-0 text-sm tabular-nums">
                            {formatAmount(row.amount, row.currency)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="font-semibold">
          Tranzacții din screenshot-uri{" "}
          <span className="font-normal text-[var(--muted)]">({covered.length})</span>
        </h2>
        <p className="mb-3 text-sm text-[var(--muted)]">
          Categoria Notion o poți schimba pentru toată categoria Revolut deodată sau
          doar pentru o tranzacție.
        </p>

        {result.notionCategories.length === 0 && (
          <p className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            Nu am găsit nicio categorie în Notion. Verifică maparea din Setări.
          </p>
        )}

        <ul className="divide-y divide-[var(--border)]">
          {screenshotGroups.map((group) => {
            const ids = new Set(group.rows.map((row) => row.id));
            const isMixed = group.uniqueCategoryId === null;
            return (
              <li key={group.key} className="py-3">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-medium">{group.display}</span>
                  <span className="text-sm text-[var(--muted)] tabular-nums">
                    {group.rows.length} ·{" "}
                    {formatAmount(group.total, result.currency)}
                  </span>
                </div>

                <select
                  value={isMixed ? MIXED : (group.uniqueCategoryId ?? "")}
                  onChange={(event) =>
                    setCategory(ids, event.target.value, group.saveRule)
                  }
                  aria-label={`Categorie Notion pentru toate tranzacțiile din ${group.display}`}
                  className={`mt-2 min-h-11 w-full rounded-lg border bg-[var(--background)] px-3 text-sm ${
                    isMixed || group.uniqueCategoryId
                      ? "border-[var(--border)]"
                      : "border-amber-500/50"
                  }`}
                >
                  {isMixed && (
                    <option value={MIXED}>— mixte, alege ca să le unifici —</option>
                  )}
                  <option value="">— fără categorie —</option>
                  {result.notionCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>

                {group.canSaveRule && (
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={group.saveRule}
                      onChange={(event) =>
                        setCategory(
                          ids,
                          group.uniqueCategoryId ?? "",
                          event.target.checked,
                        )
                      }
                      className="h-5 w-5 accent-orange-500"
                    />
                    Ține minte pentru importurile viitoare
                  </label>
                )}

                <ul className="mt-1 divide-y divide-[var(--border)]">
                  {group.rows.map((row) => (
                    <li key={row.id} className="flex items-start gap-3 py-3">
                      <input
                        type="checkbox"
                        checked={row.include}
                        onChange={() => toggle(row.id)}
                        aria-label={`Include ${row.description}`}
                        className="mt-1 h-5 w-5 shrink-0 accent-orange-500"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {row.description}
                          {row.isAggregate && (
                            <span className="ml-2 rounded bg-black/10 px-1.5 py-0.5 text-xs font-normal dark:bg-white/10">
                              agregat
                            </span>
                          )}
                        </p>
                        <p className="text-sm text-[var(--muted)]">
                          {row.date}{" "}
                          <span className="opacity-70">
                            ({CATEGORY_SOURCE_LABEL[row.categorySource]})
                          </span>
                        </p>
                        {row.note && (
                          <p className="flex items-start gap-1.5 text-sm text-[var(--muted)]">
                            <MessageSquare
                              className="mt-0.5 h-3.5 w-3.5 shrink-0"
                              aria-hidden
                            />
                            <span className="italic">{row.note}</span>
                          </p>
                        )}
                        <select
                          value={row.notionCategoryId ?? ""}
                          // Never a rule: the key is the Revolut category, so one
                          // row's exception would be applied to all of them next time.
                          onChange={(event) =>
                            setCategory(new Set([row.id]), event.target.value, false)
                          }
                          aria-label={`Categorie Notion pentru ${row.description}`}
                          className={`mt-1 min-h-11 w-full rounded-lg border bg-[var(--background)] px-3 text-sm ${
                            row.notionCategoryId
                              ? "border-[var(--border)]"
                              : "border-amber-500/50"
                          }`}
                        >
                          <option value="">— nemapat în Notion —</option>
                          {result.notionCategories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <span className="shrink-0 tabular-nums">
                        {formatAmount(row.amount, row.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
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
          onClick={onNext}
          disabled={included.length === 0}
          className="flex min-h-12 flex-[2] items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 font-medium text-white disabled:opacity-40"
        >
          Continuă
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
