import { NextResponse } from "next/server";
import { createTransactionPage, getDatabaseSchema } from "@/lib/notion";
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

  const selected = (body.transactions ?? []).filter(
    (transaction) => transaction.include && transaction.notionCategoryId,
  );
  if (selected.length === 0) {
    return NextResponse.json(
      { error: "Nicio tranzacție selectată cu o categorie Notion asociată." },
      { status: 400 },
    );
  }

  // Read the live schema so optional fields are written in the right shape.
  let propertyTypes: Record<string, string>;
  try {
    const schema = await getDatabaseSchema(mapping.transactionsDbId);
    propertyTypes = Object.fromEntries(
      schema.properties.map((property) => [property.name, property.type]),
    );
  } catch (error) {
    return NextResponse.json(
      { error: `Nu am putut citi structura bazei de tranzacții: ${(error as Error).message}` },
      { status: 502 },
    );
  }

  const outcome: ImportOutcome = { created: 0, failed: [], savedRules: 0 };

  for (const [index, transaction] of selected.entries()) {
    try {
      await createTransactionPage(mapping, propertyTypes, transaction);
      outcome.created += 1;
    } catch (error) {
      outcome.failed.push({
        description: transaction.description,
        error: (error as Error).message,
      });
    }
    if (index < selected.length - 1) await sleep(WRITE_DELAY_MS);
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
