"use client";

import { AlertTriangle, ArrowLeft, ArrowRight } from "lucide-react";
import type { DraftTransaction, ParseResult } from "@/lib/types";

const CATEGORY_SOURCE_LABEL: Record<DraftTransaction["categorySource"], string> = {
  screenshot: "din screenshot",
  inferred: "dedusă",
  none: "lipsă",
};

function formatAmount(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currency}`;
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
  const included = transactions.filter((transaction) => transaction.include);
  const total = included.reduce((sum, transaction) => sum + transaction.amount, 0);

  function toggle(id: string) {
    onTransactionsChange(
      transactions.map((transaction) =>
        transaction.id === id
          ? { ...transaction, include: !transaction.include }
          : transaction,
      ),
    );
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

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="mb-3 font-semibold">Tranzacții</h2>
        <ul className="divide-y divide-[var(--border)]">
          {transactions.map((transaction) => (
            <li key={transaction.id} className="flex items-start gap-3 py-3">
              <input
                type="checkbox"
                checked={transaction.include}
                onChange={() => toggle(transaction.id)}
                aria-label={`Include ${transaction.description}`}
                className="mt-1 h-5 w-5 shrink-0 accent-orange-500"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {transaction.description}
                  {transaction.isAggregate && (
                    <span className="ml-2 rounded bg-black/10 px-1.5 py-0.5 text-xs font-normal dark:bg-white/10">
                      agregat
                    </span>
                  )}
                </p>
                <p className="text-sm text-[var(--muted)]">
                  {transaction.date} ·{" "}
                  {transaction.revolutCategory ?? "fără categorie"}{" "}
                  <span className="opacity-70">
                    ({CATEGORY_SOURCE_LABEL[transaction.categorySource]})
                  </span>
                </p>
                <p className="text-sm">
                  {transaction.notionCategoryName ? (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      → {transaction.notionCategoryName}
                    </span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">
                      → nemapat în Notion
                    </span>
                  )}
                </p>
              </div>
              <span className="shrink-0 tabular-nums">
                {formatAmount(transaction.amount, transaction.currency)}
              </span>
            </li>
          ))}
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
