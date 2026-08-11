/** Shared domain types for the Revolut → Notion importer. */

/** A single row parsed out of a Revolut statement CSV. */
export type CsvTransaction = {
  id: string;
  type: string;
  /** ISO date (YYYY-MM-DD) the transaction was started. */
  date: string;
  description: string;
  /** Positive = money spent. Revolut writes spending as a negative amount. */
  amount: number;
  fee: number;
  currency: string;
  state: string;
};

/** Per-category spending total read off an Analytics screenshot. */
export type CategoryTotal = {
  category: string;
  amount: number;
};

/** A single transaction line read off a screenshot. */
export type ScreenshotEntry = {
  merchant: string;
  amount: number;
  /** ISO date if the screenshot showed one, else null. */
  date: string | null;
  /** Set when the screenshot is a category drill-down. */
  category: string | null;
};

export type ScreenshotKind =
  /** Analytics → Spent: a list of categories with totals. */
  | "analytics_overview"
  /** Analytics → a single category: the transactions inside it. */
  | "category_detail"
  /** The plain account transaction feed. */
  | "transaction_list"
  | "unknown";

/** What Claude extracted from one uploaded image. */
export type ParsedScreenshot = {
  fileName: string;
  kind: ScreenshotKind;
  /** Human label as shown in the app, e.g. "August 2026" or "1–31 Aug". */
  periodLabel: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  currency: string | null;
  /** Category name when `kind` is "category_detail". */
  category: string | null;
  totals: CategoryTotal[];
  entries: ScreenshotEntry[];
  warnings: string[];
};

/** How a transaction acquired its Revolut category. */
export type CategorySource =
  /** Read directly off a category drill-down screenshot. */
  | "screenshot"
  /** Claude assigned it from the merchant name, constrained to the seen categories. */
  | "inferred"
  /** No category could be determined. */
  | "none";

/** How a Revolut category was matched to a Notion category page. */
export type MatchType = "rule" | "exact-name" | "manual" | "none";

/** One row staged for import, after screenshots and CSV have been merged. */
export type DraftTransaction = {
  id: string;
  date: string;
  description: string;
  /** Positive = money spent. */
  amount: number;
  currency: string;
  revolutCategory: string | null;
  categorySource: CategorySource;
  /** True when this row is a per-category total rather than a real transaction. */
  isAggregate: boolean;
  notionCategoryId: string | null;
  notionCategoryName: string | null;
  matchType: MatchType;
  /** Set when the user picks a category by hand and wants it remembered. */
  saveRule?: boolean;
  /** Excluded from the Notion write when false. */
  include: boolean;
};

/** Screenshot totals vs. what actually got assigned, per category. */
export type ReconciliationRow = {
  category: string;
  screenshotTotal: number;
  assignedTotal: number;
  delta: number;
  transactionCount: number;
};

export type ParseResult = {
  screenshots: ParsedScreenshot[];
  currency: string;
  periodLabel: string | null;
  transactions: DraftTransaction[];
  reconciliation: ReconciliationRow[];
  /** Revolut categories with no Notion match yet — the Resolve step's input. */
  unresolvedCategories: string[];
  notionCategories: NotionCategory[];
  warnings: string[];
};

export type NotionCategory = {
  id: string;
  name: string;
};

/** Revolut category name (lowercased) → Notion category page id. */
export type CategoryRules = {
  version: 1;
  rules: Record<string, { notionCategoryId: string; notionCategoryName: string }>;
};

/** Which Notion property holds what. Filled in from the Settings page. */
export type NotionMapping = {
  transactionsDbId: string;
  categoriesDbId: string;
  transactions: {
    /** Title property — receives the merchant/description. */
    title: string;
    /** Date property. */
    date: string;
    /** Number property — receives the amount. */
    amount: string;
    /** Relation property pointing at the categories database. */
    category: string;
    /** Optional: select or rich_text holding the currency code. */
    currency?: string;
    /** Optional: select or rich_text stamped with the import source. */
    source?: string;
  };
  categories: {
    /** Title property of the categories database. */
    title: string;
  };
};

export type ImportOutcome = {
  created: number;
  failed: { description: string; error: string }[];
  savedRules: number;
};
