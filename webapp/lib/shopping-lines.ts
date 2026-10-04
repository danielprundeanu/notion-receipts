// Parser for the Ingredients page's "Bulk add" — turns a pasted shopping-list block
// into ingredient rows. Input is whatever the user copied, one item per line:
//
//   1 x servetele          → { qty: 1,   unit: null,  name: "Servetele" }
//   2 prosop de bucatarie  → { qty: 2,   unit: null,  name: "Prosop de bucatarie" }
//   200 g faina            → { qty: 200, unit: "g",   name: "Faina" }
//   3 buc oua              → { qty: 3,   unit: "piece", name: "Oua" }
//   Prosop de bucatarie    → { qty: null, unit: null, name: "Prosop de bucatarie" }
//
// A GroceryItem has no quantity field, so `qty` is only shown back to the user as a
// hint — it is never stored. A recognised unit prefills `GroceryItem.unit`.
// Pure module (no server/DOM deps) so the modal can parse as the user types.

import { normalizeSearch } from "./search";

export type ParsedIngredientLine = {
  /** The original line, kept so the review step can show what a row came from. */
  raw: string;
  name: string;
  qty: number | null;
  unit: string | null;
};

// Unit words → the vocabulary already used in the catalog (`g`, `ml`, `piece`, …).
// Keys are normalized (lowercased, diacritics stripped), so "bucăți" matches "bucati".
// Romanian first because that's what gets pasted; the English forms cost nothing.
const UNIT_ALIASES: Record<string, string> = {
  // mass
  g: "g", gr: "g", gram: "g", grame: "g", grams: "g",
  kg: "kg", kilogram: "kg", kilograme: "kg", kilograms: "kg",
  mg: "mg",
  // volume
  ml: "ml", mililitri: "ml", milliliter: "ml", milliliters: "ml",
  l: "l", litru: "l", litri: "l", liter: "l", liters: "l",
  // pieces & kitchen measures
  buc: "piece", bucata: "piece", bucati: "piece", piece: "piece", pieces: "piece",
  pcs: "piece", pc: "piece",
  lingura: "tbsp", linguri: "tbsp", tbsp: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp",
  lingurita: "tsp", lingurite: "tsp", tsp: "tsp", teaspoon: "tsp", teaspoons: "tsp",
  cana: "cup", cani: "cup", cup: "cup", cups: "cup",
  felie: "slice", felii: "slice", slice: "slice", slices: "slice",
  catel: "clove", catei: "clove", clove: "clove", cloves: "clove",
  legatura: "bunch", legaturi: "bunch", bunch: "bunch", bunches: "bunch",
  // packaging
  cutie: "can", cutii: "can", conserva: "can", conserve: "can", can: "can", cans: "can",
  pachet: "pack", pachete: "pack", pack: "pack", packs: "pack",
  sticla: "bottle", sticle: "bottle", bottle: "bottle", bottles: "bottle",
  borcan: "jar", borcane: "jar", jar: "jar", jars: "jar",
  punga: "bag", pungi: "bag", bag: "bag", bags: "bag",
  plic: "sachet", plicuri: "sachet", sachet: "sachet",
};

const BULLET_RE = /^[-–—•*▢☐□▪◦✓✔→◆■●○]+\s*/;
// "1. Servetele" is list numbering, not a quantity — both end up with the same name,
// and since quantities aren't stored the distinction only affects the displayed hint.
const NUMBERING_RE = /^\d+[.)]\s+/;
// Longest form first: alternation is ordered, so a plain-integer branch placed ahead of
// the fractions would match just the "1" of "1/2 kg" and leave "/2 kg" in the name.
const LEADING_QTY_RE = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?|[½⅓⅔¼¾])\s*/;
const MULTIPLIER_RE = /^[x×*]\s*/i;
// Trailing form: "Servetele x2" / "Prosop × 3".
const TRAILING_QTY_RE = /[\s,–-]*[x×]\s*(\d+(?:[.,]\d+)?)\s*$/i;
const UNIT_TOKEN_RE = /^(\p{L}+)\.?(?=\s|$)/u;

/** Parse a quantity string like "2", "1/2", "1 1/2", "1,5" or "½". */
function parseQty(s: string): number | null {
  const t = s
    .replace("½", "1/2").replace("⅓", "1/3").replace("⅔", "2/3")
    .replace("¼", "1/4").replace("¾", "3/4")
    .replace(",", ".")
    .trim();

  const mixed = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return parseInt(mixed[1]) + parseInt(mixed[2]) / parseInt(mixed[3]);

  const frac = t.match(/^(\d+)\/(\d+)$/);
  if (frac) return parseInt(frac[1]) / parseInt(frac[2]);

  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

// The catalog is written in sentence case ("Cherry tomatoes", "Sweet potato"), while a
// pasted list is usually all-lowercase. Only the first letter is touched — anything the
// user capitalised on purpose (brand names) survives.
function sentenceCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function cleanName(s: string): string {
  return s.replace(/\s+/g, " ").replace(/^[,;:.\-–—\s]+|[,;:.\-–—\s]+$/g, "").trim();
}

/** Parse one line. Returns null when nothing usable is left (blank line, bare "2 kg"). */
export function parseIngredientLine(raw: string): ParsedIngredientLine | null {
  let text = raw.trim();
  if (!text) return null;

  text = text.replace(BULLET_RE, "").trim();
  if (!text) return null;

  let qty: number | null = null;
  let unit: string | null = null;

  const numbering = text.match(NUMBERING_RE);
  if (numbering) {
    text = text.slice(numbering[0].length);
  } else {
    const qtyMatch = text.match(LEADING_QTY_RE);
    if (qtyMatch) {
      qty = parseQty(qtyMatch[1]);
      text = text.slice(qtyMatch[0].length);
      // "1 x servetele" — drop the multiplier between the count and the name.
      text = text.replace(MULTIPLIER_RE, "");

      const unitMatch = text.match(UNIT_TOKEN_RE);
      if (unitMatch) {
        const mapped = UNIT_ALIASES[normalizeSearch(unitMatch[1])];
        if (mapped) {
          unit = mapped;
          text = text.slice(unitMatch[0].length);
        }
      }
    } else {
      const trailing = text.match(TRAILING_QTY_RE);
      if (trailing) {
        qty = parseQty(trailing[1]);
        text = text.slice(0, trailing.index);
      }
    }
  }

  const name = sentenceCase(cleanName(text));
  if (!name) return null;

  return { raw: raw.trim(), name, qty, unit };
}

/** Parse a whole pasted block. Lines are split on newlines and semicolons. */
export function parseIngredientBlock(text: string): ParsedIngredientLine[] {
  return text
    .split(/[\r\n;]+/)
    .map(parseIngredientLine)
    .filter((r): r is ParsedIngredientLine => r !== null);
}
