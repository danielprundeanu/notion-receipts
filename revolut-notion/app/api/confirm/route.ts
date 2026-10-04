import { NextResponse } from "next/server";
import { createTransactionPage, getDatabaseSchema, loadMonthIndex } from "@/lib/notion";
import { monthKeyFromDate } from "@/lib/months";
import { loadMapping, upsertRules } from "@/lib/store";
import type { DraftTransaction, ImportOutcome } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Notion allows ~3 requests/second; stay comfortably under it. */
const WRITE_DELAY_MS = 350;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type ConfirmRequest = {
  transactions?: DraftTransaction[];
};

export async function POST(request: Request) {
  let body: ConfirmRequest;
  try {
    body = (await request.json()) as ConfirmRequest;
  } catch {
    return NextResponse.json({ error: "Corp de cerere invalid." }, { status: 400 });
  }

  const mapping = await loadMapping();
  if (!mapping) {
    return NextResponse.json(
      { error: "Configurarea Notion lipsește. Deschide Setări și salvează maparea." },
      { status: 400 },
    );
  }

  const candidates = (body.transactions ?? []).filter(
    (transaction) => transaction.include && transaction.notionCategoryId,
  );
  // Last line of defence: a row without a real date must never be written. An
  // early version substituted today's date and produced an import that looked
  // fine and was wrong in every row.
  const selected = candidates.filter((transaction) =>
    /^\d{4}-\d{2}-\d{2}$/.test(transaction.date ?? ""),
  );
  const undated = candidates.length - selected.length;

  if (selected.length === 0) {
    return NextResponse.json(
      { error: "Nicio tranzacție selectată cu o categorie Notion asociată." },
      { status: 400 },
    );
  }

  // Read the live schema so every field — the category included — is written in
  // the shape the database actually uses.
  let propertyTypes: Record<string, string>;
  let monthsDbId: string | undefined;
  try {
    const schema = await getDatabaseSchema(mapping.transactionsDbId);
    propertyTypes = Object.fromEntries(
      schema.properties.map((property) => [property.name, property.type]),
    );
    monthsDbId = schema.properties.find(
      (property) =>
        property.name === mapping.transactions.month && property.type === "relation",
    )?.relationDatabaseId;
  } catch (error) {
    return NextResponse.json(
      { error: `Nu am putut citi structura bazei de tranzacții: ${(error as Error).message}` },
      { status: 502 },
    );
  }

  const outcome: ImportOutcome = {
    created: 0,
    failed: [],
    savedRules: 0,
    monthsLinked: 0,
    warnings: [],
  };

  if (undated > 0) {
    outcome.warnings.push(
      `${undated} tranzacții au fost sărite: nu au o dată valabilă. Stabilește luna la încărcare sau folosește statement-ul CSV.`,
    );
  }

  // Link each row to its month page so monthly rollups pick the import up. A
  // missing month must not block the write — the row is still correct without it.
  let monthIndex = new Map<string, string>();
  if (mapping.transactions.month) {
    if (monthsDbId) {
      try {
        monthIndex = await loadMonthIndex(monthsDbId);
      } catch (error) {
        outcome.warnings.push(
          `Nu am putut citi baza de luni: ${(error as Error).message}. Rândurile se importă fără lună.`,
        );
      }
    } else {
      outcome.warnings.push(
        `Proprietatea „${mapping.transactions.month}” nu mai este o relație — rândurile se importă fără lună.`,
      );
    }
  }

  const missingMonths = new Set<string>();

  for (const [index, transaction] of selected.entries()) {
    const monthKey = monthKeyFromDate(transaction.date);
    const monthPageId = monthKey ? (monthIndex.get(monthKey) ?? null) : null;
    if (mapping.transactions.month && monthIndex.size > 0 && !monthPageId && monthKey) {
      missingMonths.add(monthKey);
    }

    try {
      await createTransactionPage(mapping, propertyTypes, transaction, monthPageId);
      outcome.created += 1;
      if (monthPageId) outcome.monthsLinked += 1;
    } catch (error) {
      outcome.failed.push({
        description: transaction.description,
        error: (error as Error).message,
      });
    }
    if (index < selected.length - 1) await sleep(WRITE_DELAY_MS);
  }

  if (missingMonths.size > 0) {
    outcome.warnings.push(
      `Nu am găsit pagina de lună pentru ${[...missingMonths].sort().join(", ")} — rândurile din aceste luni s-au importat fără legătura de lună.`,
    );
  }

  // Learn the manual choices the user flagged, so the next import matches them
  // automatically. Only rules for rows that actually imported are worth saving.
  if (outcome.created > 0) {
    const learned = new Map<
      string,
      { revolutCategory: string; notionCategoryId: string; notionCategoryName: string }
    >();
    for (const transaction of selected) {
      if (!transaction.saveRule) continue;
      if (!transaction.revolutCategory || !transaction.notionCategoryId) continue;
      learned.set(transaction.revolutCategory.toLowerCase(), {
        revolutCategory: transaction.revolutCategory,
        notionCategoryId: transaction.notionCategoryId,
        notionCategoryName: transaction.notionCategoryName ?? "",
      });
    }
    try {
      outcome.savedRules = await upsertRules([...learned.values()]);
    } catch (error) {
      outcome.failed.push({
        description: "(salvare reguli)",
        error: (error as Error).message,
      });
    }
  }

  return NextResponse.json(outcome);
}
