import { NextResponse } from "next/server";
import { dateRange, findDuplicates, type DuplicateMatch } from "@/lib/duplicates";
import { listExistingTransactions } from "@/lib/notion";
import { loadMapping } from "@/lib/store";
import type { DraftTransaction } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type DuplicatesRequest = {
  transactions?: DraftTransaction[];
};

export type DuplicatesResponse = {
  duplicates: DuplicateMatch[];
  /** How many pages already in Notion were compared against. */
  scanned: number;
  error?: string;
};

/**
 * Which of these rows are already in Notion?
 *
 * Read-only. Called before the import writes anything, so the user can rule on
 * duplicates instead of discovering them afterwards.
 */
export async function POST(request: Request) {
  let body: DuplicatesRequest;
  try {
    body = (await request.json()) as DuplicatesRequest;
  } catch {
    return NextResponse.json({ error: "Corp de cerere invalid." }, { status: 400 });
  }

  const transactions = body.transactions ?? [];
  const mapping = await loadMapping();
  if (!mapping) {
    return NextResponse.json(
      { error: "Configurarea Notion lipsește. Deschide Setări și salvează maparea." },
      { status: 400 },
    );
  }

  const range = dateRange(transactions);
  if (!range) {
    const empty: DuplicatesResponse = { duplicates: [], scanned: 0 };
    return NextResponse.json(empty);
  }

  try {
    const existing = await listExistingTransactions(mapping, range);
    const response: DuplicatesResponse = {
      duplicates: findDuplicates(transactions, existing),
      scanned: existing.length,
    };
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { error: `Nu am putut citi tranzacțiile existente: ${(error as Error).message}` },
      { status: 502 },
    );
  }
}
