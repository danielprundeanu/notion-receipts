import { promises as fs } from "fs";
import path from "path";
import type { CategoryRules, NotionMapping } from "./types";

/**
 * JSON-file backed config. Both files live in `data/` next to the app.
 *
 * This is deliberately filesystem-backed: the app is meant to run locally (or on
 * a host with a persistent volume). On a read-only serverless filesystem the
 * reads still work — the files ship with the repo — but writes will fail, so the
 * "learn this mapping" step would be lost. See README.
 */
const DATA_DIR = path.join(process.cwd(), "data");
const RULES_FILE = path.join(DATA_DIR, "category-rules.json");
const MAPPING_FILE = path.join(DATA_DIR, "notion-mapping.json");

const EMPTY_RULES: CategoryRules = { version: 1, rules: {} };

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return fallback;
    throw new Error(
      `Nu am putut citi ${path.basename(file)}: ${(error as Error).message}`,
    );
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/** Rule keys are lowercased + whitespace-collapsed so lookups are forgiving. */
export function ruleKey(revolutCategory: string): string {
  return revolutCategory.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function loadRules(): Promise<CategoryRules> {
  const rules = await readJson<CategoryRules>(RULES_FILE, EMPTY_RULES);
  return { version: 1, rules: rules.rules ?? {} };
}

export async function saveRules(rules: CategoryRules): Promise<void> {
  await writeJson(RULES_FILE, rules);
}

/**
 * Merge new rules in without dropping existing ones. Returns how many keys were
 * added or changed, so the import step can report what it learned.
 */
export async function upsertRules(
  entries: { revolutCategory: string; notionCategoryId: string; notionCategoryName: string }[],
): Promise<number> {
  if (entries.length === 0) return 0;
  const current = await loadRules();
  let changed = 0;
  for (const entry of entries) {
    const key = ruleKey(entry.revolutCategory);
    if (!key) continue;
    const existing = current.rules[key];
    if (existing?.notionCategoryId === entry.notionCategoryId) continue;
    current.rules[key] = {
      notionCategoryId: entry.notionCategoryId,
      notionCategoryName: entry.notionCategoryName,
    };
    changed += 1;
  }
  if (changed > 0) await saveRules(current);
  return changed;
}

/**
 * Property-name mapping. Database IDs fall back to env vars so a fresh checkout
 * works with only `.env.local` filled in.
 */
export async function loadMapping(): Promise<NotionMapping | null> {
  const stored = await readJson<Partial<NotionMapping> | null>(MAPPING_FILE, null);
  const transactionsDbId =
    stored?.transactionsDbId || process.env.NOTION_TRANSACTIONS_DB_ID || "";
  const categoriesDbId =
    stored?.categoriesDbId || process.env.NOTION_CATEGORIES_DB_ID || "";

  if (!stored?.transactions || !stored?.categories) return null;
  if (!transactionsDbId || !categoriesDbId) return null;

  return {
    transactionsDbId,
    categoriesDbId,
    transactions: stored.transactions,
    categories: stored.categories,
  };
}

export async function saveMapping(mapping: NotionMapping): Promise<void> {
  await writeJson(MAPPING_FILE, mapping);
}

/** Database IDs alone, for the Settings page before a mapping exists. */
export async function loadDatabaseIds(): Promise<{
  transactionsDbId: string;
  categoriesDbId: string;
}> {
  const stored = await readJson<Partial<NotionMapping> | null>(MAPPING_FILE, null);
  return {
    transactionsDbId:
      stored?.transactionsDbId || process.env.NOTION_TRANSACTIONS_DB_ID || "",
    categoriesDbId:
      stored?.categoriesDbId || process.env.NOTION_CATEGORIES_DB_ID || "",
  };
}
