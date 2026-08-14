// Parse a pasted block of lines into grocery-item drafts. Handles the shapes people
// actually paste from a note or a shopping list:
//
//   Paper towels          → { name: "Paper towels" }
//   2 paper towels        → { name: "paper towels", qty: 2 }
//   1 x napkins           → { name: "napkins", qty: 1 }
//   - 500 g flour         → { name: "flour", qty: 500, unit: "g" }
//   3. olive oil          → { name: "olive oil" }            (list numbering, not a qty)
//
// `qty` is reported so the UI can say it was ignored: the ingredients page is a
// catalogue of products, it has no quantity — amounts live on recipes and the
// shopping list.

export type ParsedItemLine = {
  name: string;
  unit: string | null;
  qty: number | null;
  raw: string;
};

// Units worth recognising when they sit between the number and the name. Kept in
// sync with the import wizard's list, plus the Romanian spellings used locally.
const UNIT_TOKENS = new Set([
  "g", "kg", "mg", "ml", "l", "cl", "dl",
  "cup", "cups", "tbsp", "tsp", "oz", "lb", "lbs",
  "piece", "pieces", "pcs", "pc", "buc", "bucata", "bucată", "bucati", "bucăți",
  "can", "cans", "slice", "slices", "bunch", "handful", "pinch", "pack", "packs",
  "linguri", "lingura", "lingură", "lingurita", "linguriță",
  "pahar", "pahare", "cutie", "cutii", "legatura", "legătură", "felie", "felii",
]);

const NUM = String.raw`\d+(?:[.,]\d+)?`;

export function parseItemLines(text: string): ParsedItemLine[] {
  const out: ParsedItemLine[] = [];
  const seen = new Set<string>(); // de-dupe within the pasted block itself

  for (const rawLine of text.split(/\r?\n/)) {
    const raw = rawLine.trim();
    if (!raw) continue;

    // Drop bullets and list numbering ("- ", "• ", "1. ", "2) ").
    let rest = raw
      .replace(/^[-*•·–—]\s*/, "")
      .replace(new RegExp(String.raw`^\d+[.)]\s+`), "")
      .trim();
    if (!rest) continue;

    let qty: number | null = null;
    let unit: string | null = null;

    // "2 x name" / "2× name" — the × marks a count, never a unit.
    const timesMatch = rest.match(new RegExp(String.raw`^(${NUM})\s*[x×]\s*(.+)$`, "i"));
    if (timesMatch) {
      qty = toNumber(timesMatch[1]);
      rest = timesMatch[2].trim();
    } else {
      // "500 g name" — a number followed by a unit token we recognise.
      const qtyUnitMatch = rest.match(new RegExp(String.raw`^(${NUM})\s*([\p{L}]+)\.?\s+(.+)$`, "u"));
      if (qtyUnitMatch && UNIT_TOKENS.has(qtyUnitMatch[2].toLowerCase())) {
        qty = toNumber(qtyUnitMatch[1]);
        unit = qtyUnitMatch[2].toLowerCase();
        rest = qtyUnitMatch[3].trim();
      } else {
        // "2 name" — a bare leading count.
        const qtyMatch = rest.match(new RegExp(String.raw`^(${NUM})\s+(.+)$`));
        if (qtyMatch) {
          qty = toNumber(qtyMatch[1]);
          rest = qtyMatch[2].trim();
        }
      }
    }

    const name = rest.replace(/\s+/g, " ").trim();
    if (!name) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ name, unit, qty, raw });
  }

  return out;
}

function toNumber(s: string): number | null {
  const n = parseFloat(s.replace(",", "."));
  return isFinite(n) ? n : null;
}
