"use client";

import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, Upload } from "lucide-react";
import type { DraftTransaction, ImportOutcome } from "@/lib/types";

type Props = {
  transactions: DraftTransaction[];
  outcome: ImportOutcome | null;
  error: string | null;
  busy: boolean;
  onImport: () => void;
  onBack: () => void;
  onReset: () => void;
};

export default function ImportStep({
  transactions,
  outcome,
  error,
  busy,
  onImport,
  onBack,
  onReset,
}: Props) {
  const ready = transactions.filter(
    (transaction) => transaction.include && transaction.notionCategoryId,
  );
  const skipped = transactions.filter(
    (transaction) => transaction.include && !transaction.notionCategoryId,
  );
  const total = ready.reduce((sum, transaction) => sum + transaction.amount, 0);
  const currency = ready[0]?.currency ?? "";
  const willLearn = new Set(
    ready
      .filter((transaction) => transaction.saveRule && transaction.revolutCategory)
      .map((transaction) => transaction.revolutCategory as string),
  );

  if (outcome) {
    return (
      <div className="space-y-6">
        <section className="flex items-start gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
          <CheckCircle2
            className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400"
            aria-hidden
          />
          <div>
            <h2 className="font-semibold text-emerald-700 dark:text-emerald-400">
              {outcome.created} tranzacții scrise în Notion
            </h2>
            {outcome.savedRules > 0 && (
              <p className="text-sm text-emerald-800 dark:text-emerald-300">
                {outcome.savedRules} reguli de mapare salvate pentru data viitoare.
              </p>
            )}
          </div>
        </section>

        {outcome.failed.length > 0 && (
          <section className="rounded-xl border border-red-500/40 bg-red-500/10 p-4">
            <h2 className="font-semibold text-red-600 dark:text-red-400">
              {outcome.failed.length} rânduri au eșuat
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-700 dark:text-red-300">
              {outcome.failed.map((failure, index) => (
                <li key={index}>
                  <strong>{failure.description}</strong>: {failure.error}
                </li>
              ))}
            </ul>
          </section>
        )}

        <button
          type="button"
          onClick={onReset}
          className="min-h-12 w-full rounded-lg bg-orange-500 px-4 font-medium text-white"
        >
          Import nou
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="font-semibold">Gata de import</h2>
        <ul className="mt-2 space-y-1 text-sm text-[var(--muted)]">
          <li>
            <span className="text-[var(--foreground)]">{ready.length}</span> tranzacții ·{" "}
            {total.toFixed(2)} {currency}
          </li>
          {willLearn.size > 0 && (
            <li>{willLearn.size} reguli noi de mapare vor fi salvate.</li>
          )}
          {skipped.length > 0 && (
            <li className="text-amber-600 dark:text-amber-400">
              {skipped.length} tranzacții selectate nu au categorie Notion și vor fi
              omise.
            </li>
          )}
        </ul>
      </section>

      {error && (
        <p className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-4 font-medium disabled:opacity-40"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Înapoi
        </button>
        <button
          type="button"
          onClick={onImport}
          disabled={busy || ready.length === 0}
          className="flex min-h-12 flex-[2] items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 font-medium text-white disabled:opacity-40"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Upload className="h-4 w-4" aria-hidden />
          )}
          {busy ? "Se scrie în Notion…" : "Importă în Notion"}
        </button>
      </div>
    </div>
  );
}
