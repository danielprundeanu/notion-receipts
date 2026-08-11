"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Save, Trash2 } from "lucide-react";
import type { MappingResponse } from "@/app/api/mapping/route";
import type { CategoryRules, NotionMapping } from "@/lib/types";

type TransactionFields = NotionMapping["transactions"];

const EMPTY_FIELDS: TransactionFields = {
  title: "",
  date: "",
  amount: "",
  category: "",
  currency: "",
  source: "",
};

/** Notion property types that can sensibly receive each mapped field. */
const ALLOWED_TYPES: Record<keyof TransactionFields, string[]> = {
  title: ["title"],
  date: ["date"],
  amount: ["number", "formula"],
  category: ["relation"],
  currency: ["select", "rich_text", "multi_select"],
  source: ["select", "rich_text", "multi_select"],
};

const FIELD_LABELS: Record<keyof TransactionFields, string> = {
  title: "Titlu (descriere / comerciant)",
  date: "Dată",
  amount: "Sumă",
  category: "Relație către baza de categorii",
  currency: "Monedă (opțional)",
  source: "Sursă import (opțional)",
};

export default function SettingsPage() {
  const [data, setData] = useState<MappingResponse | null>(null);
  const [transactionsDbId, setTransactionsDbId] = useState("");
  const [categoriesDbId, setCategoriesDbId] = useState("");
  const [fields, setFields] = useState<TransactionFields>(EMPTY_FIELDS);
  const [categoryTitle, setCategoryTitle] = useState("");

  const [rules, setRules] = useState<CategoryRules | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(
    null,
  );

  /** Fetch only — no state writes, so it is safe to call from an effect. */
  const fetchConfig = useCallback(
    async (overrides?: { transactionsDbId: string; categoriesDbId: string }) => {
      const params = new URLSearchParams();
      if (overrides?.transactionsDbId) {
        params.set("transactionsDbId", overrides.transactionsDbId);
      }
      if (overrides?.categoriesDbId) {
        params.set("categoriesDbId", overrides.categoriesDbId);
      }
      const query = params.toString();

      const [mappingResponse, rulesResponse] = await Promise.all([
        fetch(`/api/mapping${query ? `?${query}` : ""}`),
        fetch("/api/rules"),
      ]);

      const mappingData = (await mappingResponse.json()) as MappingResponse;
      if (!mappingResponse.ok) {
        throw new Error(
          (mappingData as unknown as { error?: string }).error ??
            "Nu am putut citi configurarea.",
        );
      }

      const rulesData = rulesResponse.ok
        ? ((await rulesResponse.json()) as CategoryRules)
        : null;

      return { mapping: mappingData, rules: rulesData, overrides };
    },
    [],
  );

  const applyConfig = useCallback(
    ({
      mapping,
      rules: nextRules,
      overrides,
    }: Awaited<ReturnType<typeof fetchConfig>>) => {
      setData(mapping);
      setTransactionsDbId(
        overrides?.transactionsDbId ?? mapping.databaseIds.transactionsDbId,
      );
      setCategoriesDbId(overrides?.categoriesDbId ?? mapping.databaseIds.categoriesDbId);
      setFields({ ...EMPTY_FIELDS, ...(mapping.mapping?.transactions ?? {}) });
      setCategoryTitle(
        mapping.mapping?.categories.title ??
          mapping.categoriesSchema?.properties.find(
            (property) => property.type === "title",
          )?.name ??
          "",
      );
      if (nextRules) setRules(nextRules);
    },
    [],
  );

  const load = useCallback(
    async (overrides?: { transactionsDbId: string; categoriesDbId: string }) => {
      setLoading(true);
      setMessage(null);
      try {
        applyConfig(await fetchConfig(overrides));
      } catch (error) {
        setMessage({ kind: "error", text: (error as Error).message });
      } finally {
        setLoading(false);
      }
    },
    [applyConfig, fetchConfig],
  );

  useEffect(() => {
    let cancelled = false;
    fetchConfig()
      .then((config) => {
        if (!cancelled) applyConfig(config);
      })
      .catch((error: Error) => {
        if (!cancelled) setMessage({ kind: "error", text: error.message });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applyConfig, fetchConfig]);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/mapping", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionsDbId,
          categoriesDbId,
          transactions: fields,
          categories: { title: categoryTitle },
        } satisfies NotionMapping),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Salvarea a eșuat.");
      setMessage({ kind: "ok", text: "Configurarea a fost salvată." });
      await load();
    } catch (error) {
      setMessage({ kind: "error", text: (error as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function removeRule(key: string) {
    const previous = rules;
    // Optimistic update with rollback — a failed delete must not look like it worked.
    setRules((current) =>
      current
        ? {
            ...current,
            rules: Object.fromEntries(
              Object.entries(current.rules).filter(([name]) => name !== key),
            ),
          }
        : current,
    );
    try {
      const response = await fetch("/api/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remove: [key] }),
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error ?? "Ștergerea regulii a eșuat.");
      }
    } catch (error) {
      setRules(previous);
      setMessage({ kind: "error", text: (error as Error).message });
    }
  }

  const transactionProperties = data?.transactionsSchema?.properties ?? [];
  const categoryProperties = data?.categoriesSchema?.properties ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Setări</h1>

      {message && (
        <p
          className={`rounded-lg border px-3 py-2 text-sm ${
            message.kind === "ok"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400"
          }`}
        >
          {message.text}
        </p>
      )}

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="mb-1 font-semibold">Bazele de date Notion</h2>
        <p className="mb-4 text-sm text-[var(--muted)]">
          Lipește link-ul sau ID-ul fiecărei baze. Integrarea Notion trebuie să aibă
          acces la ambele.
        </p>

        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--muted)]">Baza de tranzacții</span>
            <input
              type="text"
              value={transactionsDbId}
              onChange={(event) => setTransactionsDbId(event.target.value)}
              placeholder="https://notion.so/… sau ID"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--muted)]">Baza de categorii</span>
            <input
              type="text"
              value={categoriesDbId}
              onChange={(event) => setCategoriesDbId(event.target.value)}
              placeholder="https://notion.so/… sau ID"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={() => load({ transactionsDbId, categoriesDbId })}
          disabled={loading}
          className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-4 text-sm font-medium disabled:opacity-40"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden />
          )}
          Citește structura
        </button>

        {data?.errors.map((error, index) => (
          <p
            key={index}
            className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400"
          >
            {error}
          </p>
        ))}
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="mb-1 font-semibold">Maparea câmpurilor</h2>
        <p className="mb-4 text-sm text-[var(--muted)]">
          {data?.transactionsSchema
            ? `Proprietățile din „${data.transactionsSchema.title}”.`
            : "Citește mai întâi structura bazelor de date."}
        </p>

        <div className="space-y-3">
          {(Object.keys(FIELD_LABELS) as (keyof TransactionFields)[]).map((field) => {
            const options = transactionProperties.filter((property) =>
              ALLOWED_TYPES[field].includes(property.type),
            );
            return (
              <label key={field} className="block text-sm">
                <span className="mb-1 block text-[var(--muted)]">
                  {FIELD_LABELS[field]}
                </span>
                <select
                  value={fields[field] ?? ""}
                  onChange={(event) =>
                    setFields((current) => ({ ...current, [field]: event.target.value }))
                  }
                  disabled={transactionProperties.length === 0}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 disabled:opacity-50"
                >
                  <option value="">— nefolosit —</option>
                  {options.map((property) => (
                    <option key={property.name} value={property.name}>
                      {property.name} ({property.type})
                    </option>
                  ))}
                </select>
              </label>
            );
          })}

          <label className="block text-sm">
            <span className="mb-1 block text-[var(--muted)]">
              Titlul din baza de categorii
            </span>
            <select
              value={categoryTitle}
              onChange={(event) => setCategoryTitle(event.target.value)}
              disabled={categoryProperties.length === 0}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 disabled:opacity-50"
            >
              <option value="">— alege —</option>
              {categoryProperties
                .filter((property) => property.type === "title")
                .map((property) => (
                  <option key={property.name} value={property.name}>
                    {property.name}
                  </option>
                ))}
            </select>
          </label>
        </div>

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 font-medium text-white disabled:opacity-40"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Save className="h-4 w-4" aria-hidden />
          )}
          Salvează configurarea
        </button>

        {data && data.categories.length > 0 && (
          <p className="mt-3 text-sm text-[var(--muted)]">
            {data.categories.length} categorii găsite:{" "}
            {data.categories
              .slice(0, 8)
              .map((category) => category.name)
              .join(", ")}
            {data.categories.length > 8 ? "…" : ""}
          </p>
        )}
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="mb-1 font-semibold">Reguli de mapare a categoriilor</h2>
        <p className="mb-4 text-sm text-[var(--muted)]">
          Categorie Revolut → categorie Notion. Se completează automat când bifezi „ține
          minte” în pasul de rezolvare.
        </p>

        {!rules || Object.keys(rules.rules).length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Nicio regulă salvată încă.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {Object.entries(rules.rules).map(([key, value]) => (
              <li key={key} className="flex items-center gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  <strong>{key}</strong> → {value.notionCategoryName || value.notionCategoryId}
                </span>
                <button
                  type="button"
                  onClick={() => removeRule(key)}
                  aria-label={`Șterge regula pentru ${key}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-black/5 hover:text-red-500 dark:hover:bg-white/10"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
