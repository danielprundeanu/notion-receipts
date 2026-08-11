/**
 * Smoke test for the pure pieces of the pipeline: CSV parsing, screenshot ↔ CSV
 * matching, reconciliation and rule-based category resolution.
 *
 * No network, no API keys. Run with: npx tsx scripts/smoke.ts
 */
import assert from "node:assert/strict";
import { mergeSources } from "../lib/merge";
import { parseRevolutCsv } from "../lib/revolut-csv";
import { applyCategoryMatching } from "../lib/rules";
import type { CategoryRules, NotionCategory, ParsedScreenshot } from "../lib/types";

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
  entries: [{ merchant: "Lidl", amount: 145.2, date: "2026-08-04", category: "Groceries" }],
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

  await run("rejects a file that is not a Revolut export", () => {
    const { transactions, warnings } = parseRevolutCsv("a,b\n1,2");
    assert.equal(transactions.length, 0);
    assert.ok(warnings[0].includes("nu pare un export Revolut"));
  });

  console.log("\nMerge");

  await run("screenshot detail wins over inference for a matched CSV row", async () => {
    const { transactions } = parseRevolutCsv(CSV);
    // No API key here, so the classifier call fails and only the exact
    // screenshot match should survive — which is precisely what we assert.
    const merged = await mergeSources([overview, detail], transactions);
    const lidl = merged.transactions.find((t) => t.description === "Lidl Bucuresti");
    assert.ok(lidl, "Lidl row missing");
    assert.equal(lidl.revolutCategory, "Groceries");
    assert.equal(lidl.categorySource, "screenshot");
  });

  await run("reconciliation reports the gap against screenshot totals", async () => {
    const { transactions } = parseRevolutCsv(CSV);
    const merged = await mergeSources([overview, detail], transactions);
    const byCategory = new Map(merged.reconciliation.map((r) => [r.category, r]));

    assert.equal(byCategory.get("Groceries")?.assignedTotal, 145.2);
    assert.equal(byCategory.get("Groceries")?.delta, 0);
    // Restaurants/Transport are only inferable via the API, unavailable here.
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
}

main().then(() => {
  console.log(process.exitCode ? "\nSmoke test FAILED" : "\nSmoke test passed");
});
