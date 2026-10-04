import { NextResponse } from "next/server";
import {
  categoriesFromOptions,
  categoryModeForType,
  getDatabaseSchema,
  listCategories,
  normaliseDatabaseId,
} from "@/lib/notion";
import { loadDatabaseIds, loadMapping, saveMapping } from "@/lib/store";
import type { DatabaseSchema } from "@/lib/notion";
import type { NotionCategory, NotionMapping } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export type MappingResponse = {
  mapping: NotionMapping | null;
  databaseIds: { transactionsDbId: string; categoriesDbId: string };
  transactionsSchema: DatabaseSchema | null;
  categoriesSchema: DatabaseSchema | null;
  categories: NotionCategory[];
  errors: string[];
};

/**
 * Current mapping plus the live schemas needed to render the Settings form.
 *
 * `transactionsDbId` / `categoriesDbId` query params override the stored IDs, so
 * the Settings page can preview a database the user has typed in but not saved.
 */
export async function GET(request: Request) {
  const errors: string[] = [];
  const stored = await loadDatabaseIds();
  const query = new URL(request.url).searchParams;
  const databaseIds = {
    transactionsDbId: query.get("transactionsDbId")?.trim() || stored.transactionsDbId,
    categoriesDbId: query.get("categoriesDbId")?.trim() || stored.categoriesDbId,
  };
  const mapping = await loadMapping();

  let transactionsSchema: DatabaseSchema | null = null;
  let categoriesSchema: DatabaseSchema | null = null;
  let categories: NotionCategory[] = [];

  if (databaseIds.transactionsDbId) {
    try {
      transactionsSchema = await getDatabaseSchema(databaseIds.transactionsDbId);
    } catch (error) {
      errors.push(`Baza de tranzacții: ${(error as Error).message}`);
    }
  }

  // In select mode the categories are the options of the mapped property, so
  // there is no second database to read.
  const categoryProperty = transactionsSchema?.properties.find(
    (property) => property.name === mapping?.transactions.category,
  );
  const selectMode = categoryModeForType(categoryProperty?.type) === "select";

  if (selectMode && categoryProperty) {
    categories = categoriesFromOptions(categoryProperty);
  } else if (databaseIds.categoriesDbId) {
    try {
      categoriesSchema = await getDatabaseSchema(databaseIds.categoriesDbId);
      const titleProperty =
        mapping?.categories?.title ??
        categoriesSchema.properties.find((property) => property.type === "title")?.name ??
        "Name";
      categories = await listCategories(databaseIds.categoriesDbId, titleProperty);
    } catch (error) {
      errors.push(`Baza de categorii: ${(error as Error).message}`);
    }
  }

  const response: MappingResponse = {
    mapping,
    databaseIds,
    transactionsSchema,
    categoriesSchema,
    categories,
    errors,
  };
  return NextResponse.json(response);
}

export async function PUT(request: Request) {
  let body: NotionMapping;
  try {
    body = (await request.json()) as NotionMapping;
  } catch {
    return NextResponse.json({ error: "Corp de cerere invalid." }, { status: 400 });
  }

  const categoryMode = body.categoryMode === "select" ? "select" : "relation";

  const missing = [
    !body.transactionsDbId && "ID-ul bazei de tranzacții",
    !body.transactions?.title && "proprietatea Titlu",
    !body.transactions?.date && "proprietatea Dată",
    !body.transactions?.amount && "proprietatea Sumă",
    !body.transactions?.category && "proprietatea Categorie",
    // Only a relation needs a second database behind it.
    categoryMode === "relation" && !body.categoriesDbId && "ID-ul bazei de categorii",
    categoryMode === "relation" &&
      !body.categories?.title &&
      "proprietatea Titlu din baza de categorii",
  ].filter(Boolean);

  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Lipsesc câmpuri obligatorii: ${missing.join(", ")}.` },
      { status: 400 },
    );
  }

  const mapping: NotionMapping = {
    transactionsDbId: normaliseDatabaseId(body.transactionsDbId),
    categoryMode,
    categoriesDbId:
      categoryMode === "relation" && body.categoriesDbId
        ? normaliseDatabaseId(body.categoriesDbId)
        : undefined,
    transactions: {
      title: body.transactions.title,
      date: body.transactions.date,
      amount: body.transactions.amount,
      category: body.transactions.category,
      currency: body.transactions.currency || undefined,
      source: body.transactions.source || undefined,
      month: body.transactions.month || undefined,
      check: body.transactions.check || undefined,
    },
    categories:
      categoryMode === "relation" && body.categories?.title
        ? { title: body.categories.title }
        : undefined,
  };

  try {
    await saveMapping(mapping);
    return NextResponse.json({ mapping });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
