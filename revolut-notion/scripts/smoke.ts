/**
 * Smoke test for the pure pieces of the pipeline: CSV parsing, screenshot ↔ CSV
 * matching, reconciliation and rule-based category resolution.
 *
 * No network, no API keys. Run with: npx tsx scripts/smoke.ts
 */
import assert from "node:assert/strict";
import { mergeSources } from "../lib/merge";
import {
  buildMonthIndex,
  deriveMonthKey,
  monthKeyFromDate,
  monthPageOptions,
} from "../lib/months";
import { toParsedScreenshot, type RawScreenshot } from "../lib/claude";
import { resolveEntryDate } from "../lib/dates";
import { findDuplicates } from "../lib/duplicates";
import { buildProperties } from "../lib/notion";
import { parseRevolutCsv } from "../lib/revolut-csv";
import { applyCategoryMatching, assignCategory } from "../lib/rules";
import type {
  CategoryRules,
  DraftTransaction,
  NotionCategory,
  NotionMapping,
  ParsedScreenshot,
} from "../lib/types";

const CSV = [
  "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance",
  "CARD_PAYMENT,Current,2026-08-03 09:12:01,2026-08-04 10:00:00,Lidl Bucuresti,-145.20,0.00,RON,COMPLETED,1000.00",
  'CARD_PAYMENT,Current,2026-08-05 19:44:00,2026-08-06 10:00:00,"Restaurant ""Casa Veche""",-210.00,0.00,RON,COMPLETED,790.00',
  "CARD_PAYMENT,Current,2026-08-07 08:00:00,2026-08-08 10:00:00,OMV Petrom,-300.00,0.00,RON,COMPLETED,490.00",
  "TOPUP,Current,2026-08-09 08:00:00,2026-08-09 08:05:00,Salary,2500.00,0.00,RON,COMPLETED,2990.00",
  "CARD_PAYMENT,Current,2026-08-10 08:00:00,,Pending shop,-50.00,0.00,RON,PENDING,2940.00",
].join("\n");

function run(name: string, body: () => void | Promise<void>) {
  return Promise.resolve()
    .then(body)
    .then(() => console.log(`  ok  ${name}`))
    .catch((error: Error) => {
      console.error(`  FAIL ${name}\n       ${error.message}`);
      process.exitCode = 1;
    });
}

const overview: ParsedScreenshot = {
  fileName: "analytics.png",
  kind: "analytics_overview",
  periodLabel: "August 2026",
  periodStart: "2026-08-01",
  periodEnd: "2026-08-31",
  currency: "RON",
  category: null,
  totals: [
    { category: "Groceries", amount: 145.2 },
    { category: "Restaurants", amount: 210 },
    { category: "Transport", amount: 300 },
  ],
  entries: [],
  warnings: [],
};

const detail: ParsedScreenshot = {
  fileName: "groceries.png",
  kind: "category_detail",
  periodLabel: "August 2026",
  periodStart: "2026-08-01",
  periodEnd: "2026-08-31",
  currency: "RON",
  category: "Groceries",
  totals: [],
  // Merchant string deliberately differs from the CSV ("Lidl" vs "Lidl Bucuresti")
  // and the date is a day off, to exercise fuzzy matching.
  entries: [
    { merchant: "Lidl", amount: 145.2, date: "2026-08-04", category: "Groceries", note: null },
  ],
  warnings: [],
};

async function main() {
  // Keep the run offline and deterministic even on a machine that has a key
  // set. The Anthropic client reads the env var lazily, so clearing it here is
  // enough to force the merge step down its screenshot-only path.
  delete process.env.ANTHROPIC_API_KEY;

  console.log("CSV parser");

  await run("keeps only completed outgoing rows, as positive amounts", () => {
    const { transactions, warnings } = parseRevolutCsv(CSV);
    assert.equal(transactions.length, 3);
    assert.ok(transactions.every((t) => t.amount > 0));
    assert.deepEqual(
      transactions.map((t) => t.amount),
      [145.2, 210, 300],
    );
    assert.ok(warnings.some((w) => w.includes("încasări")));
    assert.ok(warnings.some((w) => w.includes("COMPLETED")));
  });

  await run("handles quoted fields containing escaped quotes and commas", () => {
    const { transactions } = parseRevolutCsv(CSV);
    assert.equal(transactions[1].description, 'Restaurant "Casa Veche"');
  });

  await run("incoming rows are parsed but kept out of the importable set", () => {
    const { transactions, rows } = parseRevolutCsv(CSV);

    // Everything completed is parsed, in file order; only spending is importable.
    assert.equal(rows.length, 4);
    assert.equal(transactions.length, 3);
    assert.ok(transactions.every((t) => t.direction === "out"));
    assert.deepEqual(
      rows.map((r) => r.direction),
      ["out", "out", "out", "in"],
    );
    // Same objects, so nothing can drift between the two views.
    assert.equal(rows[0], transactions[0]);

    const salary = rows.find((r) => r.description === "Salary");
    assert.equal(salary?.direction, "in");
    assert.equal(salary?.amount, 2500, "the magnitude is kept, not the sign");
  });

  await run("the clock and the product survive parsing", () => {
    // Pocket inference needs both: which product a row belongs to, and the order
    // of rows within a day. Neither can be recovered from the date alone.
    const csv = [
      "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance",
      "TRANSFER,Current,2026-08-14 18:15:02,2026-08-14 18:15:02,Pocket Fun,300.00,0.00,RON,COMPLETED,300.00",
      "CARD_PAYMENT,Current,2026-08-14 18:16:23,2026-08-15 10:00:00,Massimo Dutti,-300.50,0.00,RON,COMPLETED,-0.50",
      "CARD_PAYMENT,Savings,2026-08-14,2026-08-15,Fara ora,-10.00,0.00,RON,COMPLETED,0.00",
    ].join("\n");

    const { rows } = parseRevolutCsv(csv);
    assert.deepEqual(
      rows.map((r) => [r.type, r.product, r.startedAt, r.direction]),
      [
        ["TRANSFER", "Current", "2026-08-14T18:15:02", "in"],
        ["CARD_PAYMENT", "Current", "2026-08-14T18:16:23", "out"],
        // A day with no time on it must not be invented one.
        ["CARD_PAYMENT", "Savings", null, "out"],
      ],
    );
    assert.equal(rows[2].date, "2026-08-14");
  });

  await run("rejects a file that is not a Revolut export", () => {
    const { transactions, warnings } = parseRevolutCsv("a,b\n1,2");
    assert.equal(transactions.length, 0);
    assert.ok(warnings[0].includes("nu pare un export Revolut"));
  });

  console.log("\nMerge");

  await run("a screenshot row carries its category onto the matching CSV row", async () => {
    const { transactions } = parseRevolutCsv(CSV);
    const merged = await mergeSources([overview, detail], transactions);
    const lidl = merged.transactions.find((t) => t.description === "Lidl Bucuresti");
    assert.ok(lidl, "Lidl row missing");
    assert.equal(lidl.revolutCategory, "Groceries");
    assert.equal(lidl.categorySource, "screenshot");
    assert.equal(lidl.include, true);
  });

  await run("a note on the screenshot row travels with it, CSV or not", async () => {
    const noted: ParsedScreenshot = {
      ...detail,
      entries: [{ ...detail.entries[0], note: "Cadou Bianca" }],
    };

    // Merged with the CSV: the note is the one thing the CSV cannot supply, so
    // it has to survive the match onto the CSV row.
    const { transactions } = parseRevolutCsv(CSV);
    const merged = await mergeSources([overview, noted], transactions);
    const lidl = merged.transactions.find((t) => t.description === "Lidl Bucuresti");
    assert.equal(lidl?.note, "Cadou Bianca");
    // A row the screenshot never showed has no note to carry.
    assert.equal(
      merged.transactions.find((t) => t.description === "OMV Petrom")?.note,
      null,
    );

    // Screenshots on their own take the same route.
    const alone = await mergeSources([noted], []);
    assert.equal(alone.transactions.find((t) => t.description === "Lidl")?.note, "Cadou Bianca");
  });

  await run("CSV rows no screenshot showed are kept but excluded by default", async () => {
    const { transactions } = parseRevolutCsv(CSV);
    const merged = await mergeSources([overview, detail], transactions);

    // Only Lidl appears on a category screenshot; the other two are CSV-only.
    const uncovered = merged.transactions.filter((t) => t.categorySource === "none");
    assert.equal(uncovered.length, 2);
    assert.ok(
      uncovered.every((t) => t.include === false),
      "uncovered rows must not be imported without the user saying so",
    );
    assert.ok(
      uncovered.every((t) => t.revolutCategory === null),
      "uncovered rows must not be given a guessed category",
    );
    assert.ok(merged.warnings.some((w) => w.includes("nu apar în niciun screenshot")));
  });

  await run("reconciliation reports the gap against screenshot totals", async () => {
    const { transactions } = parseRevolutCsv(CSV);
    const merged = await mergeSources([overview, detail], transactions);
    const byCategory = new Map(merged.reconciliation.map((r) => [r.category, r]));

    assert.equal(byCategory.get("Groceries")?.assignedTotal, 145.2);
    assert.equal(byCategory.get("Groceries")?.delta, 0);
    // Transport appears only as a total; no screenshot listed its transactions,
    // so nothing is assigned to it and the gap is the point of the table.
    assert.equal(byCategory.get("Transport")?.assignedTotal, 0);
    assert.equal(byCategory.get("Transport")?.delta, -300);
  });

  await run("without a CSV, total-only categories become aggregate rows", async () => {
    const merged = await mergeSources([overview], []);
    assert.equal(merged.transactions.length, 3);
    assert.ok(merged.transactions.every((t) => t.isAggregate));
    assert.equal(merged.transactions[0].currency, "RON");
  });

  await run("collects every category name seen across screenshots", async () => {
    const merged = await mergeSources([overview, detail], []);
    assert.deepEqual(merged.categories.sort(), [
      "Groceries",
      "Restaurants",
      "Transport",
    ]);
  });

  console.log("\nCategory rules");

  const notionCategories: NotionCategory[] = [
    { id: "page-food", name: "Mâncare" },
    { id: "page-transport", name: "Transport" },
  ];

  await run("saved rules and exact names match; the rest stay unresolved", async () => {
    const merged = await mergeSources([overview], []);
    const rules: CategoryRules = {
      version: 1,
      rules: {
        groceries: { notionCategoryId: "page-food", notionCategoryName: "Mâncare" },
      },
    };

    const { transactions, unresolvedCategories } = applyCategoryMatching(
      merged.transactions,
      rules,
      notionCategories,
    );

    const byCategory = new Map(transactions.map((t) => [t.revolutCategory, t]));
    assert.equal(byCategory.get("Groceries")?.matchType, "rule");
    assert.equal(byCategory.get("Groceries")?.notionCategoryId, "page-food");
    assert.equal(byCategory.get("Transport")?.matchType, "exact-name");
    assert.deepEqual(unresolvedCategories, ["Restaurants"]);
  });

  await run("a rule pointing at a deleted page is ignored", async () => {
    const merged = await mergeSources([overview], []);
    const rules: CategoryRules = {
      version: 1,
      rules: {
        groceries: { notionCategoryId: "page-deleted", notionCategoryName: "Vechi" },
      },
    };

    const { transactions, unresolvedCategories } = applyCategoryMatching(
      merged.transactions,
      rules,
      notionCategories,
    );

    const groceries = transactions.find((t) => t.revolutCategory === "Groceries");
    assert.equal(groceries?.notionCategoryId, null);
    assert.ok(unresolvedCategories.includes("Groceries"));
  });

  await run("the review step retargets a whole category, or a single row", async () => {
    const merged = await mergeSources([overview], []);
    const { transactions } = applyCategoryMatching(
      merged.transactions,
      { version: 1, rules: {} },
      notionCategories,
    );

    const groceries = transactions.filter((t) => t.revolutCategory === "Groceries");
    assert.equal(groceries.length, 1);

    // A whole category, remembered as a rule.
    const retargeted = assignCategory(
      transactions,
      new Set(groceries.map((t) => t.id)),
      { id: "page-food", name: "Mâncare" },
      true,
    );
    const moved = retargeted.find((t) => t.id === groceries[0].id);
    assert.equal(moved?.notionCategoryId, "page-food");
    assert.equal(moved?.matchType, "manual");
    assert.equal(moved?.saveRule, true);
    // Rows outside the set keep the identity they had.
    const transport = transactions.find((t) => t.revolutCategory === "Transport");
    assert.equal(
      retargeted.find((t) => t.id === transport?.id),
      transport,
    );

    // One row on its own must never teach a rule: the key is the category name.
    const single = assignCategory(
      retargeted,
      new Set([groceries[0].id]),
      { id: "page-transport", name: "Transport" },
      false,
    );
    assert.equal(single.find((t) => t.id === groceries[0].id)?.saveRule, false);

    // Clearing takes the row out of the import instead of writing a stale page.
    const cleared = assignCategory(single, new Set([groceries[0].id]), null);
    const blank = cleared.find((t) => t.id === groceries[0].id);
    assert.equal(blank?.notionCategoryId, null);
    assert.equal(blank?.notionCategoryName, null);
    assert.equal(blank?.matchType, "none");
    assert.equal(blank?.saveRule, false);
  });

  console.log("\nScreenshot dates");

  await run("a day label plus the import month becomes a real date", () => {
    assert.equal(resolveEntryDate(null, "14 august", "2026-08"), "2026-08-14");
    assert.equal(resolveEntryDate(null, "14.08", "2026-08"), "2026-08-14");
    assert.equal(resolveEntryDate(null, "Aug 14", "2026-08"), "2026-08-14");
    // Bare day: the month comes from the period.
    assert.equal(resolveEntryDate(null, "3", "2026-08"), "2026-08-03");
  });

  await run("a complete date on screen is used as-is", () => {
    assert.equal(resolveEntryDate("2025-01-09", "14 august", "2026-08"), "2025-01-09");
  });

  await run("an explicit year on the label beats the import month", () => {
    assert.equal(resolveEntryDate(null, "14 august 2024", "2026-08"), "2024-08-14");
  });

  await run("a January screenshot showing December resolves to the year before", () => {
    assert.equal(resolveEntryDate(null, "28 decembrie", "2026-01"), "2025-12-28");
  });

  await run("relative labels and impossible days resolve to nothing, never to today", () => {
    for (const label of ["Astăzi", "Ieri", "Today", "Yesterday"]) {
      assert.equal(resolveEntryDate(null, label, "2026-08"), null, label);
    }
    assert.equal(resolveEntryDate(null, "31 aprilie", "2026-04"), null);
    assert.equal(resolveEntryDate(null, "14 august", null), null);
    assert.equal(resolveEntryDate(null, null, "2026-08"), null);
  });

  await run("undated screenshot rows are excluded instead of stamped with today", async () => {
    const undatedShot: ParsedScreenshot = {
      ...detail,
      periodStart: null,
      periodEnd: null,
      entries: [
        { merchant: "Lidl", amount: 145.2, date: null, category: "Groceries", note: null },
      ],
    };
    const merged = await mergeSources([undatedShot], []);
    const lidl = merged.transactions.find((t) => t.description === "Lidl");
    assert.ok(lidl);
    assert.equal(lidl.include, false);
    assert.notEqual(lidl.date, new Date().toISOString().slice(0, 10));
    assert.ok(merged.warnings.some((w) => w.includes("nu au o dată")));
  });

  console.log("\nScreenshot grouping");

  const headerless: RawScreenshot = {
    kind: "transaction_list",
    period_label: "August",
    period_start: null,
    period_end: null,
    currency: "RON",
    category: null,
    totals: [],
    entries: [
      {
        merchant: "Lidl",
        amount: 145.2,
        date: "2026-08-04",
        date_label: "4 august",
        category: null,
        note: null,
      },
    ],
    warnings: [],
  };

  await run("a headerless screenshot takes its category from the upload group", () => {
    const parsed = toParsedScreenshot(headerless, "shot-2.png", "🥗 Food");
    assert.equal(parsed.category, "🥗 Food");
    assert.equal(parsed.entries[0].category, "🥗 Food");
  });

  await run("without a group label, a headerless screenshot stays uncategorised", () => {
    const parsed = toParsedScreenshot(headerless, "shot-2.png", "   ");
    assert.equal(parsed.category, null);
    assert.equal(parsed.entries[0].category, null);
  });

  await run("a visible header beats the group label, and says so", () => {
    const parsed = toParsedScreenshot(
      { ...headerless, kind: "category_detail", category: "Groceries" },
      "shot-1.png",
      "🥗 Food",
    );
    assert.equal(parsed.category, "Groceries");
    assert.equal(parsed.entries[0].category, "Groceries");
    assert.ok(parsed.warnings.some((w) => w.includes("pe ecran scrie")));
  });

  console.log("\nMonth pages");

  await run("reads the month from separate Month + Year properties", () => {
    const key = deriveMonthKey([
      { name: "Name", type: "title", text: "August" },
      { name: "Month", type: "select", text: "08" },
      { name: "Year", type: "select", text: "2026" },
      { name: "Total Expenses", type: "formula", text: "1234" },
    ]);
    assert.equal(key, "2026-08");
  });

  await run("with no month named, a date property decides the whole key", () => {
    const key = deriveMonthKey([
      { name: "Name", type: "title", text: "August" },
      { name: "Last Day", type: "date", text: "2025-03-31" },
      { name: "Year", type: "select", text: "2026" },
    ]);
    assert.equal(key, "2025-03");
  });

  await run("a named month beats a date that spills into the next one", () => {
    // The real months database has a "Last Day" that closes the cycle ten days
    // into the following month. Read as the month, it filed May under June.
    const key = deriveMonthKey([
      { name: "Name", type: "title", text: "May" },
      { name: "Last Day", type: "date", text: "2025-06-10" },
      { name: "Year", type: "select", text: "2025" },
      { name: "Month", type: "select", text: "05" },
    ]);
    assert.equal(key, "2025-05");
  });

  await run("a boundary date is not read as the year either", () => {
    // Month named, year missing: the date disagrees about the month, so it says
    // nothing trustworthy about the year — the page is skipped, not guessed at.
    assert.equal(
      deriveMonthKey([
        { name: "Name", type: "title", text: "Decembrie" },
        { name: "Last Day", type: "date", text: "2026-01-05" },
        { name: "Month", type: "select", text: "12" },
      ]),
      null,
    );
    // Agreeing date: the year is safe to take from it.
    assert.equal(
      deriveMonthKey([
        { name: "Last Day", type: "date", text: "2025-12-31" },
        { name: "Month", type: "select", text: "12" },
      ]),
      "2025-12",
    );
  });

  await run("falls back to a month name in the title", () => {
    assert.equal(
      deriveMonthKey([
        { name: "Name", type: "title", text: "Ianuarie" },
        { name: "An", type: "select", text: "2026" },
      ]),
      "2026-01",
    );
    assert.equal(
      deriveMonthKey([
        { name: "Name", type: "title", text: "Dec" },
        { name: "Tag", type: "select", text: "2024" },
      ]),
      "2024-12",
    );
  });

  await run("a page that identifies no month is skipped, not guessed", () => {
    assert.equal(
      deriveMonthKey([
        { name: "Name", type: "title", text: "Buget general" },
        { name: "Total", type: "number", text: "8" },
      ]),
      null,
    );

    const index = buildMonthIndex([
      { id: "page-aug", properties: [
        { name: "Month", type: "select", text: "08" },
        { name: "Year", type: "select", text: "2026" },
      ] },
      { id: "page-none", properties: [{ name: "Name", type: "title", text: "Arhivă" }] },
    ]);
    assert.equal(index.size, 1);
    assert.equal(index.get("2026-08"), "page-aug");
  });

  await run("transaction dates map onto month keys", () => {
    assert.equal(monthKeyFromDate("2026-08-03"), "2026-08");
    assert.equal(monthKeyFromDate("nu-e-o-data"), null);
  });

  await run("the month pickers offer the same pages the import links to", () => {
    const pages = [
      { id: "page-jul", properties: [
        { name: "Name", type: "title", text: "Iulie" },
        { name: "Year", type: "select", text: "2026" },
      ] },
      { id: "page-aug", properties: [
        { name: "Name", type: "title", text: "August" },
        { name: "Year", type: "select", text: "2026" },
      ] },
      // Same month twice, and a page that identifies none.
      { id: "page-aug-copy", properties: [
        { name: "Name", type: "title", text: "August (copie)" },
        { name: "Year", type: "select", text: "2026" },
      ] },
      { id: "page-none", properties: [{ name: "Name", type: "title", text: "Arhivă" }] },
    ];

    const options = monthPageOptions(pages);
    assert.deepEqual(
      options.map((option) => option.key),
      ["2026-08", "2026-07"],
    );
    assert.equal(options[0].title, "August");

    // The picker must not offer a page the import would not use.
    const index = buildMonthIndex(pages);
    for (const option of options) assert.equal(index.get(option.key), option.id);
  });

  console.log("\nDuplicates");

  const existingRows = [
    {
      pageId: "page-a",
      url: null,
      title: "Parcare Sonx",
      date: "2026-08-14",
      amount: 23,
    },
  ];

  const asDraft = (
    id: string,
    description: string,
    date: string,
    amount: number,
  ): DraftTransaction => ({
    id,
    date,
    description,
    amount,
    currency: "RON",
    note: null,
    revolutCategory: "Transport",
    categorySource: "screenshot",
    isAggregate: false,
    notionCategoryId: "🚙 Honda",
    notionCategoryName: "🚙 Honda",
    matchType: "rule",
    include: true,
  });

  await run("an identical description, date and amount is a duplicate", () => {
    const found = findDuplicates(
      [asDraft("d1", "Parcare Sonx", "2026-08-14", 23)],
      existingRows,
    );
    assert.equal(found.length, 1);
    assert.equal(found[0].existing.pageId, "page-a");
  });

  await run("a different amount or date is a different transaction", () => {
    assert.equal(
      findDuplicates([asDraft("d1", "Parcare Sonx", "2026-08-14", 24)], existingRows)
        .length,
      0,
      "amount differs",
    );
    assert.equal(
      findDuplicates([asDraft("d1", "Parcare Sonx", "2026-08-15", 23)], existingRows)
        .length,
      0,
      "date differs",
    );
    assert.equal(
      findDuplicates([asDraft("d1", "Parcare Otopeni", "2026-08-14", 23)], existingRows)
        .length,
      0,
      "description differs — resemblance is not enough",
    );
  });

  await run("only as many rows are flagged as Notion actually holds", () => {
    // Two identical purchases, one already imported: the second is genuinely new.
    const found = findDuplicates(
      [
        asDraft("d1", "Parcare Sonx", "2026-08-14", 23),
        asDraft("d2", "Parcare Sonx", "2026-08-14", 23),
      ],
      existingRows,
    );
    assert.equal(found.length, 1);
    assert.equal(found[0].draftId, "d1");
  });

  await run("undated rows are never matched", () => {
    assert.equal(
      findDuplicates([asDraft("d1", "Parcare Sonx", "", 23)], existingRows).length,
      0,
    );
  });

  console.log("\nNotion payload");

  const draft: DraftTransaction = {
    id: "t1",
    date: "2026-08-03",
    description: "Lidl Bucuresti",
    amount: 145.2,
    currency: "RON",
    note: null,
    revolutCategory: "Groceries",
    categorySource: "screenshot",
    isAggregate: false,
    notionCategoryId: "🥗 Food",
    notionCategoryName: "🥗 Food",
    matchType: "rule",
    include: true,
  };

  const selectMapping: NotionMapping = {
    transactionsDbId: "db-expenses",
    categoryMode: "select",
    transactions: {
      title: "Expense",
      date: "Date",
      amount: "Amount",
      category: "Category",
      month: "Month",
      check: "Check",
    },
  };

  const selectTypes = {
    Expense: "title",
    Date: "date",
    Amount: "number",
    Category: "multi_select",
    Month: "relation",
    Check: "checkbox",
  };

  await run("a multi_select category is written as an option, not a relation", () => {
    const properties = buildProperties(selectMapping, selectTypes, draft, "page-aug");
    assert.deepEqual(properties.Category, { multi_select: [{ name: "🥗 Food" }] });
    assert.deepEqual(properties.Month, { relation: [{ id: "page-aug" }] });
    assert.deepEqual(properties.Check, { checkbox: true });
    assert.deepEqual(properties.Date, { date: { start: "2026-08-03" } });
    assert.deepEqual(properties.Amount, { number: 145.2 });
  });

  await run("without a month page the row is still written, minus the link", () => {
    const properties = buildProperties(selectMapping, selectTypes, draft, null);
    assert.ok(!("Month" in properties));
    assert.deepEqual(properties.Category, { multi_select: [{ name: "🥗 Food" }] });
  });

  await run("a relation category still writes a page id", () => {
    const relationMapping: NotionMapping = {
      transactionsDbId: "db-tx",
      categoriesDbId: "db-cat",
      categoryMode: "relation",
      transactions: { title: "Name", date: "Date", amount: "Amount", category: "Category" },
      categories: { title: "Name" },
    };
    const properties = buildProperties(
      relationMapping,
      { Name: "title", Date: "date", Amount: "number", Category: "relation" },
      { ...draft, notionCategoryId: "page-food", notionCategoryName: "Mâncare" },
    );
    assert.deepEqual(properties.Category, { relation: [{ id: "page-food" }] });
  });

  await run("the note written in Revolut is written to the comment property", () => {
    const mapping: NotionMapping = {
      ...selectMapping,
      transactions: { ...selectMapping.transactions, comment: "Comment" },
    };
    const types = { ...selectTypes, Comment: "rich_text" };

    const withNote = buildProperties(
      mapping,
      types,
      { ...draft, note: "Cadou Bianca" },
      null,
    );
    assert.deepEqual(withNote.Comment, {
      rich_text: [{ text: { content: "Cadou Bianca" } }],
    });

    // Most rows have no note; an empty comment is worse than no comment.
    assert.ok(!("Comment" in buildProperties(mapping, types, draft, null)));
    assert.ok(
      !("Comment" in buildProperties(mapping, types, { ...draft, note: "  " }, null)),
    );

    // Nothing is written anywhere when the property is not mapped.
    assert.ok(
      !("Comment" in
        buildProperties(selectMapping, types, { ...draft, note: "Cadou Bianca" }, null)),
    );
  });

  await run("the live schema overrides a stale stored mode", () => {
    // Mapping says relation, but the property is a multi_select today: the
    // database wins, otherwise the write would fail with a type error.
    const properties = buildProperties(
      { ...selectMapping, categoryMode: "relation" },
      selectTypes,
      draft,
      null,
    );
    assert.deepEqual(properties.Category, { multi_select: [{ name: "🥗 Food" }] });
  });
}

main().then(() => {
  console.log(process.exitCode ? "\nSmoke test FAILED" : "\nSmoke test passed");
});
