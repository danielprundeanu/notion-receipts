import { NextResponse } from "next/server";
import { getDatabaseSchema, listMonthPages } from "@/lib/notion";
import { loadMapping } from "@/lib/store";
import type { MonthPageOption } from "@/lib/months";

export const runtime = "nodejs";
export const maxDuration = 60;

export type MonthsResponse = {
  months: MonthPageOption[];
  /** Why the list is empty, when it is. The upload step falls back to a free month input. */
  error?: string;
};

/**
 * The months the import can target — the pages of the months database the
 * transactions database relates to.
 *
 * Read-only, and deliberately the same source the import writes against: the
 * user picks a page that exists, so no import can land on a month with no page.
 */
export async function GET() {
  const mapping = await loadMapping();
  if (!mapping) {
    return NextResponse.json<MonthsResponse>({
      months: [],
      error: "Configurarea Notion lipsește. Deschide Setări și salvează maparea.",
    });
  }

  const monthProperty = mapping.transactions.month;
  if (!monthProperty) {
    return NextResponse.json<MonthsResponse>({
      months: [],
      error: "Nicio proprietate de lună mapată în Setări.",
    });
  }

  try {
    const schema = await getDatabaseSchema(mapping.transactionsDbId);
    const relation = schema.properties.find(
      (property) => property.name === monthProperty && property.type === "relation",
    );
    if (!relation?.relationDatabaseId) {
      return NextResponse.json<MonthsResponse>({
        months: [],
        error: `Proprietatea „${monthProperty}” nu este o relație către o bază de luni.`,
      });
    }

    const months = await listMonthPages(relation.relationDatabaseId);
    return NextResponse.json<MonthsResponse>({
      months,
      error:
        months.length === 0
          ? "Nicio pagină din baza de luni nu identifică o lună clar."
          : undefined,
    });
  } catch (error) {
    return NextResponse.json<MonthsResponse>(
      { months: [], error: `Nu am putut citi baza de luni: ${(error as Error).message}` },
      { status: 502 },
    );
  }
}
