// Helpers shared by the Ingredients list, the ingredient editor and the Data check page.

import { canonicalCategory } from "@/lib/constants";
import { groceryCategoryLabel } from "@/lib/labels";

// The units offered as one-tap choices; any other unit can still be typed.
export const UNIT_CHOICES = ["g", "ml", "piece", "tsp", "tbsp", "cup", "handful", "pinch", "slice"];

export function isMassUnit(unit: string | null | undefined): boolean {
  const u = (unit ?? "").trim().toLowerCase();
  return u === "g" || u === "ml";
}

// Lowercase without diacritics, so "ovaz" finds "Ovăz rulat".
export function foldText(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function fmtNum(n: number | null | undefined): string {
  return n == null ? "—" : String(Math.round(n * 10) / 10);
}

// Where an item sits in the list: its canonical category, a category the user added
// themselves, or null ("No category") for an empty or unmappable value.
export function listCategory(category: string | null | undefined, known: string[]): string | null {
  const canon = canonicalCategory(category);
  if (canon) return canon;
  const raw = category?.trim();
  return raw && known.includes(raw) ? raw : null;
}

// Household things (bulbs, sponges) that live in the catalog for the shopping list.
// They have no nutrition, so the nutrition checks skip them.
export function isHouseholdCategory(category: string | null | undefined): boolean {
  return groceryCategoryLabel(category).toLowerCase() === "supplies";
}

// Share of the calories from protein, carbs and fat (4 / 4 / 9 kcal per gram), and
// whether those add up to something far from the stored kcal — usually a typo or
// values entered per piece instead of per 100 g.
export function energySplit(kcal: number | null, protein: number | null, carbs: number | null, fat: number | null) {
  const eP = (protein ?? 0) * 4;
  const eC = (carbs ?? 0) * 4;
  const eF = (fat ?? 0) * 9;
  const sum = eP + eC + eF;
  if (sum <= 0) return { sum: 0, protein: 0, carbs: 0, fat: 0, off: false };
  const p = Math.round((eP / sum) * 100);
  const c = Math.round((eC / sum) * 100);
  return {
    sum,
    protein: p,
    carbs: c,
    fat: 100 - p - c,
    off: kcal != null && Math.abs(sum - kcal) > Math.max(10, kcal * 0.25),
  };
}
