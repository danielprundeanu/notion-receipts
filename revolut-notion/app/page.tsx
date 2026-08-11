"use client";

import { useState } from "react";
import ImportStep from "@/components/ImportStep";
import ResolveStep from "@/components/ResolveStep";
import ReviewStep from "@/components/ReviewStep";
import UploadStep, { type UploadedImage } from "@/components/UploadStep";
import type { DraftTransaction, ImportOutcome, ParseResult } from "@/lib/types";

const STEPS = ["Încarcă", "Verifică", "Rezolvă", "Importă"] as const;
type Step = 0 | 1 | 2 | 3;

export default function HomePage() {
  const [step, setStep] = useState<Step>(0);

  const [images, setImages] = useState<UploadedImage[]>([]);
  const [csv, setCsv] = useState<{ name: string; text: string } | null>(null);

  const [result, setResult] = useState<ParseResult | null>(null);
  const [transactions, setTransactions] = useState<DraftTransaction[]>([]);

  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyse() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images, csv: csv?.text ?? null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Analiza a eșuat.");

      const parsed = data as ParseResult;
      setResult(parsed);
      setTransactions(parsed.transactions);
      setStep(1);
    } catch (analysisError) {
      setError((analysisError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function importToNotion() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Importul a eșuat.");
      setOutcome(data as ImportOutcome);
    } catch (importError) {
      setError((importError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep(0);
    setImages([]);
    setCsv(null);
    setResult(null);
    setTransactions([]);
    setOutcome(null);
    setError(null);
  }

  return (
    <div className="space-y-6">
      <ol className="flex items-center gap-2 text-sm" aria-label="Pașii importului">
        {STEPS.map((label, index) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                index === step
                  ? "bg-orange-500 text-white"
                  : index < step
                    ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                    : "bg-black/5 text-[var(--muted)] dark:bg-white/10"
              }`}
              aria-current={index === step ? "step" : undefined}
            >
              {index + 1}
            </span>
            <span
              className={`hidden truncate sm:inline ${
                index === step ? "font-medium" : "text-[var(--muted)]"
              }`}
            >
              {label}
            </span>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <>
          {error && (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <UploadStep
            images={images}
            onImagesChange={setImages}
            csv={csv}
            onCsvChange={setCsv}
            onAnalyse={analyse}
            busy={busy}
          />
        </>
      )}

      {step === 1 && result && (
        <ReviewStep
          result={result}
          transactions={transactions}
          onTransactionsChange={setTransactions}
          onBack={() => setStep(0)}
          onNext={() => setStep(2)}
        />
      )}

      {step === 2 && result && (
        <ResolveStep
          transactions={transactions}
          notionCategories={result.notionCategories}
          onApply={(next) => {
            setTransactions(next);
            setStep(3);
          }}
          onBack={() => setStep(1)}
        />
      )}

      {step === 3 && (
        <ImportStep
          transactions={transactions}
          outcome={outcome}
          error={error}
          busy={busy}
          onImport={importToNotion}
          onBack={() => setStep(2)}
          onReset={reset}
        />
      )}
    </div>
  );
}
