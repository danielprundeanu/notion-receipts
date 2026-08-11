import { Client } from "@notionhq/client";
import type { DraftTransaction, NotionCategory, NotionMapping } from "./types";

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

export type NotionProperty = { name: string; type: string };

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
    properties: Record<string, { type: string }>;
  };

  return {
    id: raw.id,
    title: raw.title?.map((part) => part.plain_text ?? "").join("") || "(fără titlu)",
    properties: Object.entries(raw.properties ?? {}).map(([name, property]) => ({
      name,
      type: property.type,
    })),
  };
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
 * `propertyTypes` comes from the live database schema so optional text-ish
 * fields (currency, source) are written in whatever shape the user's database
 * actually uses.
 */
export function buildProperties(
  mapping: NotionMapping,
  propertyTypes: Record<string, string>,
  draft: DraftTransaction,
): Record<string, PropertyValue> {
  const properties: Record<string, PropertyValue> = {
    [mapping.transactions.title]: {
      title: [{ text: { content: draft.description.slice(0, 2000) } }],
    },
    [mapping.transactions.date]: { date: { start: draft.date } },
    [mapping.transactions.amount]: { number: draft.amount },
  };

  if (draft.notionCategoryId) {
    properties[mapping.transactions.category] = {
      relation: [{ id: draft.notionCategoryId }],
    };
  }

  const currencyProp = mapping.transactions.currency;
  if (currencyProp) {
    const value = textValue(propertyTypes[currencyProp] ?? "select", draft.currency);
    if (value) properties[currencyProp] = value;
  }

  const sourceProp = mapping.transactions.source;
  if (sourceProp) {
    const label = draft.isAggregate
      ? "Revolut (agregat)"
      : draft.categorySource === "inferred"
        ? "Revolut (categorie dedusă)"
        : "Revolut";
    const value = textValue(propertyTypes[sourceProp] ?? "select", label);
    if (value) properties[sourceProp] = value;
  }

  return properties;
}

export async function createTransactionPage(
  mapping: NotionMapping,
  propertyTypes: Record<string, string>,
  draft: DraftTransaction,
): Promise<void> {
  await getClient().pages.create({
    parent: { database_id: normaliseDatabaseId(mapping.transactionsDbId) },
    properties: buildProperties(mapping, propertyTypes, draft) as never,
  });
}
