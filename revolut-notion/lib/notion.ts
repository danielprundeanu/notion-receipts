import { Client } from "@notionhq/client";
import type { ExistingTransaction } from "./duplicates";
import {
  buildMonthIndex,
  monthPageOptions,
  type MonthPageOption,
  type PropertyText,
} from "./months";
import type { CategoryMode, DraftTransaction, NotionCategory, NotionMapping } from "./types";

let client: Client | null = null;

function getClient(): Client {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    throw new Error(
      "NOTION_TOKEN nu este setat. Adaugă token-ul integrării în .env.local.",
    );
  }
  client ??= new Client({ auth: token });
  return client;
}

/**
 * Accepts a raw database ID, a dashed UUID, or a full Notion URL and returns the
 * bare 32-character ID the API expects.
 */
export function normaliseDatabaseId(value: string): string {
  const trimmed = value.trim();
  const matches = trimmed.match(/[0-9a-fA-F]{32}/g);
  if (matches && matches.length > 0) return matches[matches.length - 1];

  const dashed = trimmed.match(
    /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/,
  );
  if (dashed) return dashed[0].replace(/-/g, "");

  return trimmed;
}

export type NotionProperty = {
  name: string;
  type: string;
  /** `select` / `multi_select` only: the configured option names. */
  options?: string[];
  /** `relation` only: the database it points at. */
  relationDatabaseId?: string;
};

export type DatabaseSchema = {
  id: string;
  title: string;
  properties: NotionProperty[];
};

/** Read a database's property names and types, for the Settings mapping UI. */
export async function getDatabaseSchema(databaseId: string): Promise<DatabaseSchema> {
  const id = normaliseDatabaseId(databaseId);
  const database = await getClient().databases.retrieve({ database_id: id });

  const raw = database as unknown as {
    id: string;
    title?: { plain_text?: string }[];
    properties: Record<
      string,
      {
        type: string;
        select?: { options?: { name: string }[] };
        multi_select?: { options?: { name: string }[] };
        relation?: { database_id?: string };
      }
    >;
  };

  return {
    id: raw.id,
    title: raw.title?.map((part) => part.plain_text ?? "").join("") || "(fără titlu)",
    properties: Object.entries(raw.properties ?? {}).map(([name, property]) => {
      const options = (property.select ?? property.multi_select)?.options;
      return {
        name,
        type: property.type,
        options: options?.map((option) => option.name),
        relationDatabaseId: property.relation?.database_id,
      };
    }),
  };
}

/** Mode implied by a category property's type; unknown types fall back to relation. */
export function categoryModeForType(type: string | undefined): CategoryMode {
  return type === "select" || type === "multi_select" ? "select" : "relation";
}

/**
 * The category options of a `select` / `multi_select` property, shaped like
 * category pages so the rest of the pipeline cannot tell the difference.
 */
export function categoriesFromOptions(property: NotionProperty | undefined): NotionCategory[] {
  return (property?.options ?? [])
    .map((name) => ({ id: name, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Every page in the categories database, as { id, name }. */
export async function listCategories(
  databaseId: string,
  titleProperty: string,
): Promise<NotionCategory[]> {
  const id = normaliseDatabaseId(databaseId);
  const categories: NotionCategory[] = [];
  let cursor: string | undefined;

  do {
    const response = await getClient().databases.query({
      database_id: id,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const page of response.results) {
      const properties = (page as unknown as {
        properties?: Record<string, { type: string; title?: { plain_text?: string }[] }>;
      }).properties;
      if (!properties) continue;

      // Prefer the configured property, but fall back to whichever one is the
      // title — databases renamed after setup shouldn't break the import.
      const titleProp =
        properties[titleProperty]?.type === "title"
          ? properties[titleProperty]
          : Object.values(properties).find((property) => property.type === "title");

      const name = titleProp?.title?.map((part) => part.plain_text ?? "").join("").trim();
      if (name) categories.push({ id: page.id, name });
    }

    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return categories.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Every category the import can assign to, whichever way the database stores
 * them: pages from the categories database, or the options of a select property.
 */
export async function listCategoryChoices(mapping: NotionMapping): Promise<NotionCategory[]> {
  if (mapping.categoryMode === "select") {
    const schema = await getDatabaseSchema(mapping.transactionsDbId);
    const property = schema.properties.find(
      (candidate) => candidate.name === mapping.transactions.category,
    );
    if (!property) {
      throw new Error(
        `Proprietatea „${mapping.transactions.category}” nu mai există în baza de tranzacții.`,
      );
    }
    return categoriesFromOptions(property);
  }

  if (!mapping.categoriesDbId || !mapping.categories?.title) {
    throw new Error("Baza de categorii nu este configurată. Deschide Setări.");
  }
  return listCategories(mapping.categoriesDbId, mapping.categories.title);
}

/** Flatten a page property to plain text, for month detection. */
function propertyToText(property: Record<string, unknown>): string {
  const type = property.type as string;
  const value = property[type];

  if (type === "title" || type === "rich_text") {
    return ((value as { plain_text?: string }[] | undefined) ?? [])
      .map((part) => part.plain_text ?? "")
      .join("");
  }
  if (type === "select" || type === "status") return (value as { name?: string })?.name ?? "";
  if (type === "multi_select") {
    return ((value as { name?: string }[] | undefined) ?? [])
      .map((option) => option.name ?? "")
      .join(" ");
  }
  if (type === "date") return (value as { start?: string })?.start ?? "";
  if (type === "number") return value === null || value === undefined ? "" : String(value);
  if (type === "formula") {
    const formula = value as { type?: string; string?: string; number?: number };
    if (formula?.type === "string") return formula.string ?? "";
    if (formula?.type === "number") return String(formula.number ?? "");
    return "";
  }
  return "";
}

/**
 * Every page of a months database, flattened to text for month detection.
 *
 * Month databases are small (one page per month), so a full read is cheap.
 */
async function readMonthPages(
  databaseId: string,
): Promise<{ id: string; properties: PropertyText[] }[]> {
  const id = normaliseDatabaseId(databaseId);
  const pages: { id: string; properties: PropertyText[] }[] = [];
  let cursor: string | undefined;

  do {
    const response = await getClient().databases.query({
      database_id: id,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const page of response.results) {
      const properties = (page as unknown as {
        properties?: Record<string, Record<string, unknown>>;
      }).properties;
      if (!properties) continue;

      pages.push({
        id: page.id,
        properties: Object.entries(properties).map(([name, property]) => ({
          name,
          type: property.type as string,
          text: propertyToText(property),
        })),
      });
    }

    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return pages;
}

/** "YYYY-MM" → month page id, for linking each transaction to its month. */
export async function loadMonthIndex(databaseId: string): Promise<Map<string, string>> {
  return buildMonthIndex(await readMonthPages(databaseId));
}

/** The month pages themselves, for the upload step's year/month pickers. */
export async function listMonthPages(databaseId: string): Promise<MonthPageOption[]> {
  return monthPageOptions(await readMonthPages(databaseId));
}

/**
 * Rows already in the transactions database within a date span.
 *
 * Scoped to the span the import covers so a large history costs nothing: the
 * only pages that could duplicate an incoming row share its date.
 */
export async function listExistingTransactions(
  mapping: NotionMapping,
  range: { start: string; end: string },
): Promise<ExistingTransaction[]> {
  const id = normaliseDatabaseId(mapping.transactionsDbId);
  const { title, date: dateProperty, amount: amountProperty } = mapping.transactions;
  const existing: ExistingTransaction[] = [];
  let cursor: string | undefined;

  do {
    const response = await getClient().databases.query({
      database_id: id,
      start_cursor: cursor,
      page_size: 100,
      filter: {
        and: [
          { property: dateProperty, date: { on_or_after: range.start } },
          { property: dateProperty, date: { on_or_before: range.end } },
        ],
      } as never,
    });

    for (const page of response.results) {
      const raw = page as unknown as {
        id: string;
        url?: string;
        properties?: Record<string, Record<string, unknown>>;
      };
      const properties = raw.properties;
      if (!properties) continue;

      const titleProperty = properties[title];
      const titleText = ((titleProperty?.title as { plain_text?: string }[]) ?? [])
        .map((part) => part.plain_text ?? "")
        .join("")
        .trim();

      const dateValue = (properties[dateProperty]?.date as { start?: string })?.start;
      const amountValue = properties[amountProperty]?.number;

      existing.push({
        pageId: raw.id,
        url: raw.url ?? null,
        title: titleText,
        date: dateValue ? dateValue.slice(0, 10) : null,
        amount: typeof amountValue === "number" ? amountValue : null,
      });
    }

    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return existing;
}

type PropertyValue = Record<string, unknown>;

function textValue(type: string, value: string): PropertyValue | null {
  if (type === "select") return { select: { name: value } };
  if (type === "rich_text") return { rich_text: [{ text: { content: value } }] };
  if (type === "title") return { title: [{ text: { content: value } }] };
  if (type === "multi_select") return { multi_select: [{ name: value }] };
  return null;
}

/**
 * Build the Notion `properties` payload for one transaction.
 *
 * `propertyTypes` comes from the live database schema, so both the category
 * (relation vs. select) and the optional text-ish fields (currency, source) are
 * written in whatever shape the user's database actually uses — the stored
 * mapping is only a hint, the live schema decides.
 */
export function buildProperties(
  mapping: NotionMapping,
  propertyTypes: Record<string, string>,
  draft: DraftTransaction,
  monthPageId?: string | null,
): Record<string, PropertyValue> {
  const properties: Record<string, PropertyValue> = {
    [mapping.transactions.title]: {
      title: [{ text: { content: draft.description.slice(0, 2000) } }],
    },
    [mapping.transactions.date]: { date: { start: draft.date } },
    [mapping.transactions.amount]: { number: draft.amount },
  };

  if (draft.notionCategoryId) {
    const categoryProperty = mapping.transactions.category;
    const categoryType = propertyTypes[categoryProperty];
    // In select mode the id *is* the option name; keep the name as the source of
    // truth for writing and fall back to the id only if it went missing.
    const optionName = draft.notionCategoryName || draft.notionCategoryId;

    if (categoryType === "multi_select") {
      properties[categoryProperty] = { multi_select: [{ name: optionName }] };
    } else if (categoryType === "select") {
      properties[categoryProperty] = { select: { name: optionName } };
    } else {
      properties[categoryProperty] = { relation: [{ id: draft.notionCategoryId }] };
    }
  }

  const monthProperty = mapping.transactions.month;
  if (monthProperty && monthPageId) {
    properties[monthProperty] = { relation: [{ id: monthPageId }] };
  }

  const checkProperty = mapping.transactions.check;
  if (checkProperty && propertyTypes[checkProperty] === "checkbox") {
    properties[checkProperty] = { checkbox: true };
  }

  // The note the user wrote on the transaction in Revolut. Absent on most rows,
  // and an empty comment is worse than none, so only write it when there is one.
  const commentProp = mapping.transactions.comment;
  const note = draft.note?.trim();
  if (commentProp && note) {
    const value = textValue(propertyTypes[commentProp] ?? "rich_text", note.slice(0, 2000));
    if (value) properties[commentProp] = value;
  }

  const currencyProp = mapping.transactions.currency;
  if (currencyProp) {
    const value = textValue(propertyTypes[currencyProp] ?? "select", draft.currency);
    if (value) properties[currencyProp] = value;
  }

  const sourceProp = mapping.transactions.source;
  if (sourceProp) {
    const label = draft.isAggregate ? "Revolut (agregat)" : "Revolut";
    const value = textValue(propertyTypes[sourceProp] ?? "select", label);
    if (value) properties[sourceProp] = value;
  }

  return properties;
}

export async function createTransactionPage(
  mapping: NotionMapping,
  propertyTypes: Record<string, string>,
  draft: DraftTransaction,
  monthPageId?: string | null,
): Promise<void> {
  await getClient().pages.create({
    parent: { database_id: normaliseDatabaseId(mapping.transactionsDbId) },
    properties: buildProperties(mapping, propertyTypes, draft, monthPageId) as never,
  });
}
