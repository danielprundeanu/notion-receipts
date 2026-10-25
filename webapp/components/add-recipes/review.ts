import type { ConfirmedIngredient, ConfirmedRecipe, NewUnitRule, ParsedRecipe, ReviewIngredient } from "@/lib/import";
import { standardFactor } from "@/lib/units";

// Turns matched recipes into the few questions worth asking, and the answers back into what
// /api/import/confirm saves. Only what the matcher wasn't sure about becomes a question:
// an ingredient it found nothing (or only something similar) for, and a unit the chosen
// ingredient isn't measured in.

export type ItemOption = { id: string; name: string; unit: string | null; unit2: string | null };

export type Answer = {
  pick?: { type: "item"; item: ItemOption } | { type: "new" };
  amount?: string; // what the recipe's amount comes to in `target` ("200 g" → "4" handfuls)
  factor?: string; // 1 recipe unit = factor × target; used when the recipe gives no amount
  target?: string;
  keepUnit?: boolean; // keep the recipe's unit on the item as its second unit
  remember?: boolean; // default on
};

export type Answers = Record<string, Answer>;

export const answerKey = (recipe: number, ing: number) => `${recipe}:${ing}`;

export function newItemName(name: string): string {
  const n = name.trim();
  return n.charAt(0).toUpperCase() + n.slice(1);
}

/** The item choices for an ingredient the matcher wasn't sure about: likely matches first.
 *  None for one it found nothing close to — its leftovers are noise; search covers that. */
export function itemOptions(ing: ReviewIngredient): ItemOption[] {
  if (ing.match.status === "new") return [];
  const fromCandidates = (ing.match.candidates ?? []).map((c) => ({ id: c.id, name: c.name, unit: c.unit, unit2: c.unit2 ?? null }));
  const best = ing.match.groceryItemId
    ? [{ id: ing.match.groceryItemId, name: ing.match.groceryItemName ?? "", unit: ing.match.groceryItemUnit ?? null, unit2: ing.match.groceryItemUnit2 ?? null }]
    : [];
  const seen = new Set<string>();
  return [...best, ...fromCandidates].filter((o) => o.name && !seen.has(o.id) && seen.add(o.id)).slice(0, ing.match.status === "similar" ? 3 : 2);
}

/** The item this ingredient ends up as: the match, the person's pick, or a new one (null). */
function chosenItem(ing: ReviewIngredient, a: Answer | undefined): ItemOption | "new" | undefined {
  if (ing.match.status === "matched" && ing.match.groceryItemId) {
    return { id: ing.match.groceryItemId, name: ing.match.groceryItemName ?? "", unit: ing.match.groceryItemUnit ?? null, unit2: ing.match.groceryItemUnit2 ?? null };
  }
  if (!a?.pick) return undefined;
  return a.pick.type === "new" ? "new" : a.pick.item;
}

export type Conversion = { from: string; units: string[]; target: string; factor: number | null; auto: boolean; item: ItemOption };

/** The unit question, when the chosen item isn't measured in the recipe's unit. */
export function conversionFor(ing: ReviewIngredient, a: Answer | undefined): Conversion | null {
  const item = chosenItem(ing, a);
  if (!item || item === "new" || !ing.unit) return null;
  const units = [item.unit, item.unit2].filter((u): u is string => !!u);
  if (units.length === 0 || units.includes(ing.unit)) return null;
  // A rule saved from an earlier import already answers it (only known for the matcher's item).
  const uc = ing.unitConflict;
  if (uc?.autoResolved && uc.targetUnit && uc.factor != null && item.id === ing.match.groceryItemId) {
    return { from: ing.unit, units, target: uc.targetUnit, factor: uc.factor, auto: true, item };
  }
  const target = a?.target && units.includes(a.target) ? a.target : units[0];
  const num = (v: string | undefined) => {
    const n = parseFloat((v ?? "").replace(",", "."));
    return n > 0 ? n : null;
  };
  let factor: number | null;
  if (a?.amount !== undefined && ing.qty) factor = num(a.amount) != null ? num(a.amount)! / ing.qty : null;
  else if (a?.factor !== undefined) factor = num(a.factor);
  else factor = standardFactor(ing.unit, target);
  return { from: ing.unit, units, target, factor, auto: false, item };
}

export type Question = {
  key: string;
  recipe: number;
  ing: ReviewIngredient;
  needsItem: boolean;
  conversion: Conversion | null;
  answered: boolean;
};

export function questionsFor(recipes: ParsedRecipe[], answers: Answers, skip: Set<number>): Question[] {
  const out: Question[] = [];
  recipes.forEach((r, ri) => {
    if (skip.has(ri)) return;
    r.ingredients.forEach((ing, ii) => {
      const key = answerKey(ri, ii);
      const a = answers[key];
      const needsItem = ing.match.status !== "matched";
      const conversion = conversionFor(ing, a);
      // tbsp → tsp and the like are the same for every ingredient: applied, not asked.
      const certain = !!conversion && a?.factor === undefined && a?.amount === undefined && standardFactor(conversion.from, conversion.target) != null;
      if (!needsItem && (!conversion || conversion.auto || certain)) return;
      const itemOk = !needsItem || !!a?.pick;
      const unitOk = !conversion || conversion.auto || conversion.factor != null;
      out.push({ key, recipe: ri, ing, needsItem, conversion: conversion?.auto ? null : conversion, answered: itemOk && unitOk });
    });
  });
  return out;
}

/** What /api/import/confirm takes, for the recipes kept. */
export function buildConfirm(recipes: ParsedRecipe[], answers: Answers, skip: Set<number>): { recipes: ConfirmedRecipe[]; newUnitRules: NewUnitRule[] } {
  const newUnitRules: NewUnitRule[] = [];
  const confirmed = recipes.flatMap((r, ri): ConfirmedRecipe[] => {
    if (skip.has(ri)) return [];
    const ingredients = r.ingredients.map((ing, ii): ConfirmedIngredient => {
      const a = answers[answerKey(ri, ii)];
      const remember = a?.remember !== false;
      const item = chosenItem(ing, a);
      const out: ConfirmedIngredient = {
        name: ing.name,
        qty: ing.qty,
        unit: ing.unit,
        obs: ing.obs ?? null,
        groupName: ing.groupName,
        groupOrder: ing.groupOrder,
        order: ing.order,
      };
      if (item === "new" || item === undefined) {
        out.newItem = { name: newItemName(ing.name), unit: ing.unit ?? null, category: null };
        return out;
      }
      out.groceryItemId = item.id;
      if (ing.match.status !== "matched" && remember) {
        out.saveMapping = true;
        out.groceryItemName = item.name;
      }
      const conv = conversionFor(ing, a);
      if (conv && conv.factor != null) {
        if (!conv.auto && a?.keepUnit && conv.units.length === 1) {
          out.addUnit2 = true;
          out.unit2Conversion = conv.factor;
        } else {
          out.qty = ing.qty != null ? Number((ing.qty * conv.factor).toFixed(6)) : null;
          out.unit = conv.target;
          if (!conv.auto && remember) newUnitRules.push({ name: ing.name, foreignUnit: conv.from, targetUnit: conv.target, factor: conv.factor });
        }
      }
      return out;
    });
    return [{
      name: r.name,
      servings: r.servings,
      batch: r.batch,
      time: r.time,
      difficulty: r.difficulty,
      category: r.category,
      link: r.link,
      image: r.image,
      favorite: r.favorite,
      ingredients,
      instructions: r.instructions,
    }];
  });
  return { recipes: confirmed, newUnitRules };
}
