import { NextResponse } from "next/server";
import { extractScreenshot } from "@/lib/claude";
import { mergeSources } from "@/lib/merge";
import { listCategories } from "@/lib/notion";
import { parseRevolutCsv } from "@/lib/revolut-csv";
import { applyCategoryMatching } from "@/lib/rules";
import { loadMapping, loadRules } from "@/lib/store";
import type { CsvTransaction, NotionCategory, ParseResult, ParsedScreenshot } from "@/lib/types";

export const runtime = "nodejs";
/** Vision extraction plus classification can take a couple of minutes. */
export const maxDuration = 300;

type ParseRequest = {
  images?: { name: string; dataUrl: string }[];
  csv?: string | null;
};

export async function POST(request: Request) {
  let body: ParseRequest;
  try {
    body = (await request.json()) as ParseRequest;
  } catch {
    return NextResponse.json({ error: "Corp de cerere invalid." }, { status: 400 });
  }

  const images = body.images ?? [];
  const csvText = body.csv?.trim() ?? "";

  if (images.length === 0 && !csvText) {
    return NextResponse.json(
      { error: "Încarcă cel puțin un screenshot sau un CSV." },
      { status: 400 },
    );
  }

  const warnings: string[] = [];

  // 1. Read every screenshot. One unreadable image shouldn't sink the import.
  const screenshots: ParsedScreenshot[] = [];
  for (const image of images) {
    try {
      const parsed = await extractScreenshot(image.dataUrl, image.name);
      screenshots.push(parsed);
      warnings.push(...parsed.warnings.map((w) => `${image.name}: ${w}`));
    } catch (error) {
      warnings.push(`${image.name}: ${(error as Error).message}`);
    }
  }

  if (images.length > 0 && screenshots.length === 0) {
    return NextResponse.json(
      { error: `Niciun screenshot nu a putut fi citit. ${warnings.join(" ")}` },
      { status: 502 },
    );
  }

  // 2. Parse the CSV, if one was supplied.
  let csv: CsvTransaction[] = [];
  if (csvText) {
    const parsed = parseRevolutCsv(csvText);
    csv = parsed.transactions;
    warnings.push(...parsed.warnings.map((w) => `CSV: ${w}`));
  }

  // 3. Merge the two sources into draft rows.
  let merged;
  try {
    merged = await mergeSources(screenshots, csv);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
  warnings.push(...merged.warnings);

  // 4. Match Revolut categories to Notion category pages.
  const mapping = await loadMapping();
  let notionCategories: NotionCategory[] = [];
  if (mapping) {
    try {
      notionCategories = await listCategories(
        mapping.categoriesDbId,
        mapping.categories.title,
      );
    } catch (error) {
      warnings.push(
        `Nu am putut citi categoriile din Notion: ${(error as Error).message}`,
      );
    }
  } else {
    warnings.push(
      "Configurarea Notion lipsește — mergi în Setări și mapează bazele de date înainte de import.",
    );
  }

  const rules = await loadRules();
  const { transactions, unresolvedCategories } = applyCategoryMatching(
    merged.transactions,
    rules,
    notionCategories,
  );

  const currency =
    transactions.find((transaction) => transaction.currency)?.currency ??
    screenshots.find((screenshot) => screenshot.currency)?.currency ??
    "RON";

  const result: ParseResult = {
    screenshots,
    currency,
    periodLabel:
      screenshots.find((screenshot) => screenshot.periodLabel)?.periodLabel ?? null,
    transactions,
    reconciliation: merged.reconciliation,
    unresolvedCategories,
    notionCategories,
    warnings,
  };

  return NextResponse.json(result);
}
