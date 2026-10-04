import type { CategoryRules, DraftTransaction, NotionCategory } from "./types";

/**
 * Rule keys are lowercased + whitespace-collapsed so lookups are forgiving.
 *
 * It lives here rather than next to the JSON store so this module stays free of
 * `fs`: the Review step imports `assignCategory` into the browser bundle.
 */
export function ruleKey(revolutCategory: string): string {
  return revolutCategory.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Resolve each draft's Revolut category to a Notion category page.
 *
 * Two automatic paths, in order:
 *  1. A saved rule (learned from a previous import's Resolve step).
 *  2. An exact, case-insensitive name match against the Notion categories.
 *
 * Anything left over becomes the Resolve step's work list.
 */
export function applyCategoryMatching(
  drafts: DraftTransaction[],
  rules: CategoryRules,
  notionCategories: NotionCategory[],
): { transactions: DraftTransaction[]; unresolvedCategories: string[] } {
  const byId = new Map(notionCategories.map((category) => [category.id, category]));
  const byName = new Map(
    notionCategories.map((category) => [category.name.trim().toLowerCase(), category]),
  );

  const unresolved = new Map<string, string>();

  const transactions = drafts.map((draft) => {
    if (!draft.revolutCategory) return draft;

    const rule = rules.rules[ruleKey(draft.revolutCategory)];
    // A rule can point at a page that has since been deleted or renamed; only
    // trust it while the page is still in the categories database.
    const fromRule = rule ? byId.get(rule.notionCategoryId) : undefined;
    if (fromRule) {
      return {
        ...draft,
        notionCategoryId: fromRule.id,
        notionCategoryName: fromRule.name,
        matchType: "rule" as const,
      };
    }

    const fromName = byName.get(draft.revolutCategory.trim().toLowerCase());
    if (fromName) {
      return {
        ...draft,
        notionCategoryId: fromName.id,
        notionCategoryName: fromName.name,
        matchType: "exact-name" as const,
      };
    }

    const key = draft.revolutCategory.trim().toLowerCase();
    if (!unresolved.has(key)) unresolved.set(key, draft.revolutCategory.trim());
    return draft;
  });

  return { transactions, unresolvedCategories: [...unresolved.values()] };
}

/**
 * Point a set of drafts at a Notion category — or clear it, with `category: null`.
 *
 * This is the Review step's override: whatever matching produced, the user has
 * the last word, for a whole Revolut category at once or for a single row.
 *
 * `saveRule` only ever sticks to rows that carry a Revolut category name, since
 * that name is the rule key. A single-row override must pass `false`: a rule
 * learned from one row would be applied to the whole category next time.
 */
export function assignCategory(
  drafts: DraftTransaction[],
  ids: ReadonlySet<string>,
  category: NotionCategory | null,
  saveRule = false,
): DraftTransaction[] {
  return drafts.map((draft) => {
    if (!ids.has(draft.id)) return draft;

    if (!category) {
      return {
        ...draft,
        notionCategoryId: null,
        notionCategoryName: null,
        matchType: "none" as const,
        saveRule: false,
      };
    }

    return {
      ...draft,
      notionCategoryId: category.id,
      notionCategoryName: category.name,
      matchType: "manual" as const,
      saveRule: saveRule && Boolean(draft.revolutCategory),
    };
  });
}
