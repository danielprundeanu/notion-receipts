import { ruleKey } from "./store";
import type { CategoryRules, DraftTransaction, NotionCategory } from "./types";

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
