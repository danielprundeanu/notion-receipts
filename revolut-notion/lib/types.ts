/** Shared domain types for the Revolut → Notion importer. */

/** A single row parsed out of a Revolut statement CSV. */
export type CsvTransaction = {
  id: string;
  /** The export's own `Type` ("CARD_PAYMENT", "TRANSFER", "TOPUP", …), verbatim. */
  type: string;
  /** ISO date (YYYY-MM-DD) the transaction was started. */
  date: string;
  /**
   * Full ISO timestamp of the start, when the export gives a time — null if it
   * only gives a day. Kept because "the transfer right before this payment"
   * cannot be decided from the date alone.
   */
  startedAt: string | null;
  /** The Revolut product the row belongs to: "Current", a pocket name, … */
  product: string;
  description: string;
  /** Always the magnitude; `direction` says which way the money went. */
  amount: number;
  /**
   * Which way the money moved. Only `out` rows are ever imported — an `in` row
   * is a top-up, a refund or a transfer in, and the Analytics "Spent" screen
   * does not cover any of them. They are parsed because a transfer *out of a
   * pocket* arrives as an `in` row on the current account, which is the signal
   * pocket inference reads.
   */
  direction: "out" | "in";
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
  /** The user's own note on the transaction ("Cadou Bianca"), when it has one. */
  note: string | null;
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

/**
 * How a transaction acquired its Revolut category.
 *
 * There is deliberately no "inferred" value: a CSV row no screenshot showed is
 * never categorised automatically — it is reported per month for the user to
 * rule on (see `mergeSources`).
 */
export type CategorySource =
  /** Read directly off a category drill-down screenshot. */
  | "screenshot"
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
  /**
   * The note written on the transaction in Revolut, headed for the Notion
   * comment property. Only screenshots carry it — the CSV has no note column.
   */
  note: string | null;
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

/**
 * A category the import can assign to.
 *
 * In `relation` mode `id` is a Notion page id. In `select` mode there are no
 * category pages, so `id` *is* the option name — which keeps rules, matching and
 * the Resolve step identical in both modes.
 */
export type NotionCategory = {
  id: string;
  name: string;
};

/**
 * How the transactions database stores its category.
 *  - `relation`: a separate categories database, one page per category.
 *  - `select`: a `select` / `multi_select` property on the transactions database.
 */
export type CategoryMode = "relation" | "select";

/** Revolut category name (lowercased) → Notion category page id. */
export type CategoryRules = {
  version: 1;
  rules: Record<string, { notionCategoryId: string; notionCategoryName: string }>;
};

/** Which Notion property holds what. Filled in from the Settings page. */
export type NotionMapping = {
  transactionsDbId: string;
  /** Only used — and only required — in `relation` mode. */
  categoriesDbId?: string;
  /** Defaults to `relation` for mappings saved before select mode existed. */
  categoryMode?: CategoryMode;
  transactions: {
    /** Title property — receives the merchant/description. */
    title: string;
    /** Date property. */
    date: string;
    /** Number property — receives the amount. */
    amount: string;
    /** Category property: a relation, or a select/multi_select. */
    category: string;
    /** Optional: select or rich_text holding the currency code. */
    currency?: string;
    /** Optional: rich_text receiving the note written on the Revolut transaction. */
    comment?: string;
    /** Optional: select or rich_text stamped with the import source. */
    source?: string;
    /**
     * Optional: relation to a months database. Each row is linked to the page
     * for its own month, so monthly rollups pick the import up.
     */
    month?: string;
    /** Optional: checkbox ticked on import, for databases that gate totals on one. */
    check?: string;
  };
  /** Only used — and only required — in `relation` mode. */
  categories?: {
    /** Title property of the categories database. */
    title: string;
  };
};

export type ImportOutcome = {
  created: number;
  failed: { description: string; error: string }[];
  savedRules: number;
  /** Rows linked to a month page (0 when no month relation is mapped). */
  monthsLinked: number;
  warnings: string[];
};
