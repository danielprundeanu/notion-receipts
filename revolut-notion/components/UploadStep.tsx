"use client";

import { useRef, useState } from "react";
import { FileSpreadsheet, ImagePlus, Loader2, X } from "lucide-react";

export type UploadedImage = { name: string; dataUrl: string };

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Nu am putut citi ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Nu am putut citi ${file.name}.`));
    reader.readAsText(file);
  });
}

type Props = {
  images: UploadedImage[];
  onImagesChange: (images: UploadedImage[]) => void;
  csv: { name: string; text: string } | null;
  onCsvChange: (csv: { name: string; text: string } | null) => void;
  onAnalyse: () => void;
  busy: boolean;
};

export default function UploadStep({
  images,
  onImagesChange,
  csv,
  onCsvChange,
  onAnalyse,
  busy,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const csvInput = useRef<HTMLInputElement>(null);

  async function handleImages(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    try {
      const added = await Promise.all(
        Array.from(fileList).map(async (file) => ({
          name: file.name,
          dataUrl: await readAsDataUrl(file),
        })),
      );
      onImagesChange([...images, ...added]);
    } catch (readError) {
      setError((readError as Error).message);
    } finally {
      if (imageInput.current) imageInput.current.value = "";
    }
  }

  async function handleCsv(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setError(null);
    try {
      onCsvChange({ name: file.name, text: await readAsText(file) });
    } catch (readError) {
      setError((readError as Error).message);
    } finally {
      if (csvInput.current) csvInput.current.value = "";
    }
  }

  const canAnalyse = !busy && (images.length > 0 || csv !== null);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="mb-1 font-semibold">1. Screenshot-uri Revolut</h2>
        <p className="mb-4 text-sm text-[var(--muted)]">
          Ecranul <strong>Analytics → Spent</strong> pentru totalurile pe categorii. Poți
          adăuga și capturi din interiorul unei categorii — acelea dau categoria exactă
          pentru fiecare tranzacție.
        </p>

        <input
          ref={imageInput}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          className="sr-only"
          onChange={(event) => handleImages(event.target.files)}
        />
        <button
          type="button"
          onClick={() => imageInput.current?.click()}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border)] px-4 py-3 text-sm font-medium transition-colors hover:border-orange-500 hover:text-orange-500"
        >
          <ImagePlus className="h-4 w-4" aria-hidden />
          Adaugă screenshot-uri
        </button>

        {images.length > 0 && (
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {images.map((image, index) => (
              <li
                key={`${image.name}-${index}`}
                className="relative overflow-hidden rounded-lg border border-[var(--border)]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.dataUrl}
                  alt={image.name}
                  className="h-32 w-full object-cover object-top"
                />
                <button
                  type="button"
                  aria-label={`Elimină ${image.name}`}
                  onClick={() =>
                    onImagesChange(images.filter((_, i) => i !== index))
                  }
                  className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
                <p className="truncate px-2 py-1 text-xs text-[var(--muted)]">
                  {image.name}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="mb-1 font-semibold">
          2. Statement CSV <span className="text-[var(--muted)]">(opțional)</span>
        </h2>
        <p className="mb-4 text-sm text-[var(--muted)]">
          CSV-ul Revolut are sumele și datele exacte, dar nu are categorii. Combinat cu
          screenshot-ul, obții tranzacții individuale categorisite.
        </p>

        <input
          ref={csvInput}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(event) => handleCsv(event.target.files)}
        />
        <button
          type="button"
          onClick={() => csvInput.current?.click()}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border)] px-4 py-3 text-sm font-medium transition-colors hover:border-orange-500 hover:text-orange-500"
        >
          <FileSpreadsheet className="h-4 w-4" aria-hidden />
          {csv ? "Înlocuiește CSV-ul" : "Adaugă CSV"}
        </button>

        {csv && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
            <span className="truncate">{csv.name}</span>
            <button
              type="button"
              aria-label="Elimină CSV-ul"
              onClick={() => onCsvChange(null)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}
      </section>

      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={!canAnalyse}
        onClick={onAnalyse}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {busy ? "Se analizează…" : "Analizează"}
      </button>
    </div>
  );
}
