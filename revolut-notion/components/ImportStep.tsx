"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CopyCheck,
  ExternalLink,
  Loader2,
  Upload,
} from "lucide-react";
import type { DuplicatesResponse } from "@/app/api/duplicates/route";
import type { DuplicateMatch } from "@/lib/duplicates";
import type { DraftTransaction, ImportOutcome } from "@/lib/types";

type Props = {
  transactions: DraftTransaction[];
  outcome: ImportOutcome | null;
  error: string | null;
  busy: boolean;
  onImport: (transactions: DraftTransaction[]) => void;
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
  const [found, setFound] = useState<DuplicateMatch[] | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  /** Draft ids the user explicitly wants written even though Notion has them. */
  const [allowed, setAllowed] = useState<Set<string>>(new Set());

  const ready = useMemo(
    () =>
      transactions.filter(
        (transaction) => transaction.include && transaction.notionCategoryId,
      ),
    [transactions],
  );

  useEffect(() => {
    if (outcome || ready.length === 0) return;
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/duplicates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transactions: ready }),
        });
        const data = (await response.json()) as DuplicatesResponse;
        if (!response.ok) throw new Error(data.error ?? "Verificarea a eșuat.");
        if (!cancelled) {
          setFound(data.duplicates);
          setCheckError(null);
        }
      } catch (duplicateError) {
        // Never silently proceed: not knowing is different from knowing there are none.
        if (!cancelled) {
          setFound(null);
          setCheckError((duplicateError as Error).message);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, outcome, retry]);

  // Nothing to import means nothing to collide with — no request needed.
  const duplicates = useMemo(
    () => (ready.length === 0 ? [] : found),
    [ready, found],
  );
  const checking = ready.length > 0 && found === null && checkError === null;

  const duplicateIds = useMemo(
    () => new Set((duplicates ?? []).map((match) => match.draftId)),
    [duplicates],
  );

  const byDraftId = useMemo(
    () => new Map(transactions.map((transaction) => [transaction.id, transaction])),
    [transactions],
  );

  const toImport = ready.filter(
    (transaction) => !duplicateIds.has(transaction.id) || allowed.has(transaction.id),
  );

  const skipped = transactions.filter(
    (transaction) => transaction.include && !transaction.notionCategoryId,
  );
  const total = toImport.reduce((sum, transaction) => sum + transaction.amount, 0);
  const currency = toImport[0]?.currency ?? ready[0]?.currency ?? "";
  const willLearn = new Set(
    toImport
      .filter((transaction) => transaction.saveRule && transaction.revolutCategory)
      .map((transaction) => transaction.revolutCategory as string),
  );

  function toggleAllowed(draftId: string) {
    setAllowed((current) => {
      const next = new Set(current);
      if (next.has(draftId)) next.delete(draftId);
      else next.add(draftId);
      return next;
    });
  }

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
            {outcome.monthsLinked > 0 && (
              <p className="text-sm text-emerald-800 dark:text-emerald-300">
                {outcome.monthsLinked} rânduri legate de pagina lunii lor.
              </p>
            )}
            {outcome.savedRules > 0 && (
              <p className="text-sm text-emerald-800 dark:text-emerald-300">
                {outcome.savedRules} reguli de mapare salvate pentru data viitoare.
              </p>
            )}
          </div>
        </section>

        {outcome.warnings.length > 0 && (
          <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
            <h2 className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
              Atenționări
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-800 dark:text-amber-300">
              {outcome.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </section>
        )}

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
            <span className="text-[var(--foreground)]">{toImport.length}</span> tranzacții
            · {total.toFixed(2)} {currency}
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

      {checking && (
        <p className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Verific în Notion dacă vreuna există deja…
        </p>
      )}

      {checkError && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Nu am putut verifica duplicatele: {checkError}
          </p>
          <button
            type="button"
            onClick={() => {
              setCheckError(null);
              setRetry((count) => count + 1);
            }}
            className="mt-2 min-h-11 rounded-lg border border-red-500/40 px-3 font-medium"
          >
            Încearcă din nou
          </button>
        </div>
      )}

      {duplicates !== null && duplicates.length === 0 && ready.length > 0 && (
        <p className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          <CopyCheck className="h-4 w-4 shrink-0" aria-hidden />
          Niciuna dintre tranzacții nu există deja în Notion.
        </p>
      )}

      {duplicates !== null && duplicates.length > 0 && (
        <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <h2 className="font-semibold text-amber-700 dark:text-amber-400">
            {duplicates.length} tranzacții există deja în Notion
          </h2>
          <p className="mb-3 text-sm text-amber-800 dark:text-amber-300">
            Au aceeași descriere, aceeași dată și aceeași sumă ca rânduri deja existente.
            Sunt <strong>excluse implicit</strong>. Bifează-le doar dacă vrei într-adevăr
            să creezi duplicatul — de exemplu dacă ai cumpărat de două ori același lucru.
          </p>

          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                setAllowed(new Set(duplicates.map((match) => match.draftId)))
              }
              className="min-h-11 rounded-lg border border-amber-500/40 px-3 text-sm font-medium"
            >
              Creează toate duplicatele
            </button>
            <button
              type="button"
              onClick={() => setAllowed(new Set())}
              className="min-h-11 rounded-lg border border-amber-500/40 px-3 text-sm font-medium"
            >
              Nu crea niciunul
            </button>
          </div>

          <ul className="divide-y divide-amber-500/20">
            {duplicates.map((match) => {
              const draft = byDraftId.get(match.draftId);
              if (!draft) return null;
              return (
                <li key={match.draftId} className="flex items-start gap-3 py-3">
                  <input
                    type="checkbox"
                    checked={allowed.has(match.draftId)}
                    onChange={() => toggleAllowed(match.draftId)}
                    aria-label={`Creează oricum ${draft.description}`}
                    className="mt-1 h-5 w-5 shrink-0 accent-orange-500"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{draft.description}</p>
                    <p className="text-sm text-[var(--muted)]">
                      {draft.date} · {draft.amount.toFixed(2)} {draft.currency}
                    </p>
                    {match.existing.url && (
                      <a
                        href={match.existing.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm text-orange-500 underline"
                      >
                        Vezi rândul existent
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

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
          onClick={() => onImport(toImport)}
          disabled={busy || checking || duplicates === null || toImport.length === 0}
          className="flex min-h-12 flex-[2] items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 font-medium text-white disabled:opacity-40"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Upload className="h-4 w-4" aria-hidden />
          )}
          {busy ? "Se scrie în Notion…" : `Importă ${toImport.length} în Notion`}
        </button>
      </div>
    </div>
  );
}
