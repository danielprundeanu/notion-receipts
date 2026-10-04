"use client";

import { useEffect, useRef, useState } from "react";
import { FileSpreadsheet, ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";
import type { MonthsResponse } from "@/app/api/months/route";
import type { MonthPageOption } from "@/lib/months";

export type UploadedImage = { name: string; dataUrl: string };

/** "2026-08" → "august" — used when a month page has no title of its own. */
function monthName(key: string): string {
  const [year, month] = key.split("-").map(Number);
  if (!year || !month) return key;
  return new Date(year, month - 1, 1).toLocaleDateString("ro-RO", { month: "long" });
}

/**
 * One batch of screenshots the user says belong together.
 *
 * `label` is the Revolut category these shots were taken from. It exists because
 * a category drill-down scrolled past its header looks exactly like the plain
 * account feed — several screenshots are needed to cover a month, and only the
 * first one shows the category name. Grouping is how the rest get theirs.
 * Leave it empty for Analytics overview shots, which name their own categories.
 */
export type ScreenshotGroup = {
  id: string;
  label: string;
  images: UploadedImage[];
};

let nextGroupId = 0;

/** Module-level counter rather than a UUID, so SSR and the client agree. */
export function createGroup(): ScreenshotGroup {
  nextGroupId += 1;
  return { id: `group-${nextGroupId}`, label: "", images: [] };
}

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

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

/** True when the pointer actually left the zone, not just crossed onto a child. */
function leftZone(event: React.DragEvent<HTMLElement>): boolean {
  const next = event.relatedTarget;
  return !(next instanceof Node) || !event.currentTarget.contains(next);
}

type Props = {
  groups: ScreenshotGroup[];
  onGroupsChange: (groups: ScreenshotGroup[]) => void;
  period: string;
  onPeriodChange: (period: string) => void;
  csv: { name: string; text: string } | null;
  onCsvChange: (csv: { name: string; text: string } | null) => void;
  onAnalyse: () => void;
  busy: boolean;
};

export default function UploadStep({
  groups,
  onGroupsChange,
  period,
  onPeriodChange,
  csv,
  onCsvChange,
  onAnalyse,
  busy,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const imageInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const csvInput = useRef<HTMLInputElement>(null);

  /** null while the months database is still being read. */
  const [monthPages, setMonthPages] = useState<MonthPageOption[] | null>(null);
  const [monthsError, setMonthsError] = useState<string | null>(null);
  /** Escape hatch: a month with no page in Notion can still be typed in. */
  const [freeMonth, setFreeMonth] = useState(false);
  /** Kept apart from `period`, which only exists once a month is picked too. */
  const [year, setYear] = useState(() => period.slice(0, 4));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/months");
        const data = (await response.json()) as MonthsResponse;
        if (cancelled) return;
        setMonthPages(data.months ?? []);
        setMonthsError(data.error ?? null);
      } catch (fetchError) {
        if (cancelled) return;
        setMonthPages([]);
        setMonthsError((fetchError as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const years = [...new Set((monthPages ?? []).map((page) => page.key.slice(0, 4)))].sort(
    (a, b) => b.localeCompare(a),
  );
  const monthsOfYear = (monthPages ?? [])
    .filter((page) => page.key.startsWith(`${year}-`))
    .sort((a, b) => a.key.localeCompare(b.key));
  /** The month select only shows a value while it agrees with the chosen year. */
  const selectedMonth = period.startsWith(`${year}-`) ? period.slice(5, 7) : "";

  function pickYear(nextYear: string) {
    setYear(nextYear);
    // Keep the month across a year change when the new year has that page too.
    const sameMonth = `${nextYear}-${selectedMonth}`;
    const kept = (monthPages ?? []).some((page) => page.key === sameMonth);
    onPeriodChange(nextYear && selectedMonth && kept ? sameMonth : "");
  }

  const usePickers = monthPages !== null && monthPages.length > 0 && !freeMonth;

  const totalImages = groups.reduce((sum, group) => sum + group.images.length, 0);

  function patchGroup(id: string, patch: Partial<ScreenshotGroup>) {
    onGroupsChange(
      groups.map((group) => (group.id === id ? { ...group, ...patch } : group)),
    );
  }

  async function addImages(groupId: string, files: File[]) {
    const images = files.filter((file) => IMAGE_TYPES.includes(file.type));
    if (images.length === 0) {
      setError(
        files.length > 0
          ? "Niciun fișier imagine valid (acceptate: PNG, JPEG, GIF, WebP)."
          : null,
      );
      return;
    }
    setError(null);

    try {
      const added = await Promise.all(
        images.map(async (file) => ({
          name: file.name,
          dataUrl: await readAsDataUrl(file),
        })),
      );
      // Read from the live prop, not a stale closure copy of the group.
      const current = groups.find((group) => group.id === groupId);
      if (!current) return;
      patchGroup(groupId, { images: [...current.images, ...added] });
    } catch (readError) {
      setError((readError as Error).message);
    } finally {
      const input = imageInputs.current[groupId];
      if (input) input.value = "";
    }
  }

  async function handleCsvFiles(files: File[]) {
    const file = files[0];
    if (!file) return;
    if (files.length > 1) {
      setError("Poți încărca un singur CSV; l-am folosit pe primul.");
    } else {
      setError(null);
    }
    try {
      onCsvChange({ name: file.name, text: await readAsText(file) });
    } catch (readError) {
      setError((readError as Error).message);
    } finally {
      if (csvInput.current) csvInput.current.value = "";
    }
  }

  const canAnalyse = !busy && (totalImages > 0 || csv !== null);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="mb-1 font-semibold">1. Luna importului</h2>
        <p className="mb-3 text-sm text-[var(--muted)]">
          Revolut arată ziua fără an ({"„14 august”"}), deci fără luna asta nu se poate
          construi o dată reală — tranzacțiile ar fi importate fără dată. Alegerea e
          dintre paginile bazei de luni din Notion, aceleași de care se leagă
          cheltuielile la import.
        </p>

        {monthPages === null && (
          <p className="flex min-h-11 items-center gap-2 text-sm text-[var(--muted)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Se citesc lunile din Notion…
          </p>
        )}

        {usePickers && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={year}
              onChange={(event) => pickYear(event.target.value)}
              aria-label="Anul din care sunt screenshot-urile"
              className="min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm sm:w-40"
            >
              <option value="">— an —</option>
              {years.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select
              value={selectedMonth}
              disabled={!year}
              onChange={(event) =>
                onPeriodChange(event.target.value ? `${year}-${event.target.value}` : "")
              }
              aria-label="Luna din care sunt screenshot-urile"
              className="min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm disabled:opacity-50 sm:w-56"
            >
              <option value="">— lună —</option>
              {monthsOfYear.map((page) => (
                <option key={page.key} value={page.key.slice(5, 7)}>
                  {page.title || monthName(page.key)}
                </option>
              ))}
            </select>
          </div>
        )}

        {monthPages !== null && !usePickers && (
          <input
            type="month"
            value={period}
            onChange={(event) => {
              onPeriodChange(event.target.value);
              setYear(event.target.value.slice(0, 4));
            }}
            aria-label="Luna din care sunt screenshot-urile"
            className="min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm sm:w-56"
          />
        )}

        {monthsError && (
          <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
            {monthsError} Scrie luna de mână — importul merge, dar rândurile nu se vor
            lega de o pagină de lună.
          </p>
        )}

        {monthPages !== null && monthPages.length > 0 && (
          <button
            type="button"
            onClick={() => setFreeMonth((current) => !current)}
            className="mt-1 flex min-h-11 items-center text-sm text-[var(--muted)] underline underline-offset-4"
          >
            {freeMonth ? "Alege dintre lunile din Notion" : "Luna nu e în listă?"}
          </button>
        )}

        {!period && totalImages > 0 && (
          <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
            Fără lună aleasă, tranzacțiile din screenshot-uri rămân fără dată și vor fi
            excluse din import.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="mb-1 font-semibold">2. Screenshot-uri Revolut</h2>
        <p className="mb-4 text-sm text-[var(--muted)]">
          Trage fișierele direct în zonele de mai jos sau apasă pe ele. Pune într-un grup
          capturile din aceeași categorie și scrie-i numele — așa capturile derulate, fără
          header, primesc categoria corectă. Lasă numele gol pentru capturile din{" "}
          <strong>Analytics → Spent</strong>, care își conțin singure categoriile.
        </p>

        <div className="space-y-4">
          {groups.map((group, index) => {
            const isDragOver = dragOver === group.id;
            return (
              <div
                key={group.id}
                className="rounded-lg border border-[var(--border)] p-3"
              >
                <div className="mb-3 flex items-center gap-2">
                  <input
                    type="text"
                    value={group.label}
                    onChange={(event) =>
                      patchGroup(group.id, { label: event.target.value })
                    }
                    placeholder={
                      index === 0
                        ? "Fără categorie (ex. Analytics → Spent)"
                        : "Categoria din Revolut, ex. 🥗 Food"
                    }
                    aria-label={`Categoria grupului ${index + 1}`}
                    className="min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
                  />
                  {groups.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Șterge grupul ${index + 1}`}
                      onClick={() =>
                        onGroupsChange(groups.filter((item) => item.id !== group.id))
                      }
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-black/5 hover:text-red-500 dark:hover:bg-white/10"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                </div>

                <input
                  ref={(element) => {
                    imageInputs.current[group.id] = element;
                  }}
                  type="file"
                  accept={IMAGE_TYPES.join(",")}
                  multiple
                  className="sr-only"
                  onChange={(event) =>
                    addImages(group.id, Array.from(event.target.files ?? []))
                  }
                />
                <button
                  type="button"
                  onClick={() => imageInputs.current[group.id]?.click()}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOver(group.id);
                  }}
                  onDragLeave={(event) => {
                    if (leftZone(event)) setDragOver(null);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragOver(null);
                    addImages(group.id, Array.from(event.dataTransfer.files));
                  }}
                  className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm font-medium transition-colors ${
                    isDragOver
                      ? "border-orange-500 bg-orange-500/10 text-orange-500"
                      : "border-[var(--border)] hover:border-orange-500 hover:text-orange-500"
                  }`}
                >
                  <ImagePlus className="h-4 w-4" aria-hidden />
                  {isDragOver ? "Dă drumul aici" : "Trage aici sau alege screenshot-uri"}
                </button>

                {group.images.length > 0 && (
                  <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {group.images.map((image, imageIndex) => (
                      <li
                        key={`${image.name}-${imageIndex}`}
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
                            patchGroup(group.id, {
                              images: group.images.filter((_, i) => i !== imageIndex),
                            })
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
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => onGroupsChange([...groups, createGroup()])}
          className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-4 text-sm font-medium transition-colors hover:border-orange-500 hover:text-orange-500"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Adaugă un grup nou
        </button>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="mb-1 font-semibold">
          3. Statement CSV <span className="text-[var(--muted)]">(opțional)</span>
        </h2>
        <p className="mb-4 text-sm text-[var(--muted)]">
          CSV-ul Revolut are sumele și datele exacte, dar nu are categorii. Tranzacțiile
          din screenshot-uri sunt potrivite cu el; restul îți sunt raportate pe luni, ca
          să decizi tu ce faci cu ele.
        </p>

        <input
          ref={csvInput}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(event) => handleCsvFiles(Array.from(event.target.files ?? []))}
        />
        <button
          type="button"
          onClick={() => csvInput.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver("csv");
          }}
          onDragLeave={(event) => {
            if (leftZone(event)) setDragOver(null);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(null);
            handleCsvFiles(Array.from(event.dataTransfer.files));
          }}
          className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm font-medium transition-colors ${
            dragOver === "csv"
              ? "border-orange-500 bg-orange-500/10 text-orange-500"
              : "border-[var(--border)] hover:border-orange-500 hover:text-orange-500"
          }`}
        >
          <FileSpreadsheet className="h-4 w-4" aria-hidden />
          {dragOver === "csv"
            ? "Dă drumul aici"
            : csv
              ? "Înlocuiește CSV-ul"
              : "Trage aici sau alege CSV-ul"}
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
