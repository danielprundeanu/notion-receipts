import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseUrls, parseText, type RawRecipe } from "@/lib/recipe-scraper";

// URL scraping fetches external sites (up to 15s each, in parallel) — give the
// serverless function room beyond Vercel's default 10s so slow sites don't get cut off.
export const maxDuration = 30;

type UnitChoice = { action: string; unit: string; rate: number; from_unit?: string | null };
type IngredientNameMapping = { groceryItemId: string; groceryItemName: string };

// Saved unit-conversion choices, keyed "ingredientname|foreignunit" (from the UnitRule table).
async function loadUnitChoices(): Promise<Record<string, UnitChoice>> {
  const rules = await prisma.unitRule.findMany();
  const out: Record<string, UnitChoice> = {};
  for (const r of rules) out[r.key] = { action: "use_unit", unit: r.targetUnit, rate: r.rate, from_unit: r.foreignUnit };
  return out;
}

// Saved manual "raw name → grocery item" mappings (from the IngredientNameMapping table).
async function loadIngredientNameMappings(): Promise<Record<string, IngredientNameMapping>> {
  const rows = await prisma.ingredientNameMapping.findMany();
  const out: Record<string, IngredientNameMapping> = {};
  for (const m of rows) out[m.rawName] = { groceryItemId: m.groceryItemId, groceryItemName: m.groceryItemName };
  return out;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ParsedIngredient = {
  name: string;
  qty: number | null;
  unit: string | null;
  obs: string | null;
  groupName: string | null;
  groupOrder: number;
  order: number;
};

export type IngredientMatch = {
  status: "matched" | "similar" | "new";
  groceryItemId?: string;
  groceryItemName?: string;
  groceryItemUnit?: string | null;
  groceryItemUnit2?: string | null;
  candidates?: Array<{ id: string; name: string; unit: string | null; unit2?: string | null }>;
};

export type UnitConflict = {
  foreignUnit: string;           // unitatea din rețetă (ex: "cup")
  allowedUnits: string[];        // [unit, unit2] ale grocery item-ului
  autoResolved: boolean;         // true dacă există deja în unit_choices.json
  targetUnit?: string;           // cunoscut dacă autoResolved
  factor?: number;               // factor de conversie cunoscut
};

export type ReviewIngredient = ParsedIngredient & {
  match: IngredientMatch;
  unitConflict?: UnitConflict;
};

export type ParsedRecipe = {
  name: string;
  servings: number | null;
  batch: boolean;            // true = per batch (N porții), false = per serving (÷N, salvat cu servings=1)
  time: number | null;
  difficulty: string | null;
  category: string | null;
  link: string | null;
  image: string | null;
  favorite: boolean;
  ingredients: ReviewIngredient[];
  instructions: Array<{ text: string; isSection: boolean }>;
};

// ─── Ingredient matching ──────────────────────────────────────────────────────

function similarity(a: string, b: string): number {
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();
  if (s1 === s2) return 1;
  if (s1.includes(s2) || s2.includes(s1)) return 0.85;

  // Bigram similarity
  const bigrams = (str: string) => {
    const bg = new Set<string>();
    for (let i = 0; i < str.length - 1; i++) bg.add(str.slice(i, i + 2));
    return bg;
  };
  const bg1 = bigrams(s1);
  const bg2 = bigrams(s2);
  const intersection = [...bg1].filter((x) => bg2.has(x)).length;
  return (2 * intersection) / (bg1.size + bg2.size);
}

async function matchIngredient(name: string, nameMappings: Record<string, IngredientNameMapping>): Promise<IngredientMatch> {
  const nameLower = name.toLowerCase().trim();

  // 0. Saved manual mapping
  const saved = nameMappings[nameLower];
  if (saved) {
    const item = await prisma.groceryItem.findUnique({
      where: { id: saved.groceryItemId },
      select: { id: true, name: true, unit: true, unit2: true },
    });
    if (item) {
      return {
        status: "matched",
        groceryItemId: item.id,
        groceryItemName: item.name,
        groceryItemUnit: item.unit,
        groceryItemUnit2: item.unit2,
      };
    }
  }

  // 1. Exact match (case-insensitive) — EN sau RO
  const exact = await prisma.groceryItem.findFirst({
    where: {
      OR: [
        { name:   { equals: name, mode: "insensitive" } },
        { nameRo: { equals: name, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, unit: true, unit2: true },
  });
  if (exact) {
    return {
      status: "matched",
      groceryItemId: exact.id,
      groceryItemName: exact.name,
      groceryItemUnit: exact.unit,
      groceryItemUnit2: exact.unit2,
    };
  }

  // 2. Contains search — EN și RO
  const firstWord = nameLower.split(" ")[0];
  const candidates = await prisma.groceryItem.findMany({
    where: {
      OR: [
        { name:   { contains: nameLower,  mode: "insensitive" } },
        { name:   { contains: firstWord,  mode: "insensitive" } },
        { nameRo: { contains: nameLower,  mode: "insensitive" } },
        { nameRo: { contains: firstWord,  mode: "insensitive" } },
      ],
    },
    take: 20,
    select: { id: true, name: true, nameRo: true, unit: true, unit2: true },
  });

  if (candidates.length === 0) {
    return { status: "new" };
  }

  // Score candidates — ia maximul dintre similaritatea EN și RO
  // Dacă scorul RO e mai bun, returnează nameRo ca display name (mai util pentru utilizator)
  const scored = candidates
    .map((c) => {
      const scoreEn = similarity(nameLower, c.name.toLowerCase());
      const scoreRo = c.nameRo ? similarity(nameLower, c.nameRo.toLowerCase()) : 0;
      const score = Math.max(scoreEn, scoreRo);
      const displayName = scoreRo > scoreEn && c.nameRo ? c.nameRo : c.name;
      return { ...c, score, displayName };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const best = scored[0];

  // High confidence → auto-match as "similar"
  if (best.score >= 0.8) {
    return {
      status: "similar",
      groceryItemId: best.id,
      groceryItemName: best.displayName,
      groceryItemUnit: best.unit,
      groceryItemUnit2: best.unit2,
      candidates: scored.map((c) => ({ id: c.id, name: c.displayName, unit: c.unit, unit2: c.unit2 })),
    };
  }

  // Low confidence → return as new but with candidates
  return {
    status: "new",
    candidates: scored.map((c) => ({ id: c.id, name: c.displayName, unit: c.unit, unit2: c.unit2 })),
  };
}

// Count-style units: a bare quantity ("2 eggs", "1 chicken breast") maps directly to
// one of these with no numeric conversion. Anything else (g, ml, cup, …) is a measure.
const COUNT_UNITS = new Set(["piece", "clove", "slice", "can", "stalk", "bunch", "head", "handful"]);

function resolveUnitConflict(
  ingName: string,
  foreignUnit: string,
  allowedUnits: string[],
  choices: Record<string, UnitChoice>
): UnitConflict {
  const key = `${ingName.toLowerCase()}|${foreignUnit.toLowerCase()}`;
  const choice = choices[key];
  if (choice && choice.action === "use_unit") {
    return { foreignUnit, allowedUnits, autoResolved: true, targetUnit: choice.unit, factor: choice.rate };
  }
  return { foreignUnit, allowedUnits, autoResolved: false };
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type } = body as { type: "urls" | "text" };

    let rawRecipes: RawRecipe[];
    if (type === "urls") {
      rawRecipes = await parseUrls(body.urls ?? []);
    } else if (type === "text") {
      rawRecipes = parseText(body.content ?? "");
    } else {
      return NextResponse.json({ error: "type trebuie să fie 'urls' sau 'text'" }, { status: 400 });
    }

    // For each recipe, match ingredients against DB
    const reviewRecipes: ParsedRecipe[] = [];

    // Load saved mappings + unit rules once (shared across all recipes in this request)
    const unitChoices = await loadUnitChoices();
    const nameMappings = await loadIngredientNameMappings();

    for (const r of rawRecipes) {
      if (r.error) {
        reviewRecipes.push({ ...(r as unknown as ParsedRecipe) });
        continue;
      }

      const matchedIngredients: ReviewIngredient[] = await Promise.all(
        r.ingredients.map(async (ing, idx) => {
          const match = ing.name ? await matchIngredient(ing.name, nameMappings) : { status: "new" as const };

          // Resolve the ingredient's effective unit + any conflict against the matched item.
          let effectiveUnit = ing.unit;
          let unitConflict: UnitConflict | undefined;
          if (match.groceryItemId) {
            const allowed = [match.groceryItemUnit, match.groceryItemUnit2].filter(Boolean) as string[];

            // Bare count with no unit word ("1 chicken breast"): if the item is sold by a
            // count unit use that; otherwise it's measured by weight/volume (g, ml, …) so a
            // bare "1" is ambiguous — treat it as "piece" so it flows through the normal
            // resolve path (prompting "1 piece = ? g") instead of silently importing unit=null.
            // Only when there IS a quantity — a qty-less "salt to taste" needs no unit.
            if (!effectiveUnit && ing.qty != null && allowed.length > 0) {
              effectiveUnit = allowed.find((u) => COUNT_UNITS.has(u)) ?? "piece";
            }

            if (effectiveUnit && allowed.length > 0 && !allowed.includes(effectiveUnit)) {
              unitConflict = resolveUnitConflict(ing.name, effectiveUnit, allowed, unitChoices);
            }
          }

          return {
            name: ing.name,
            qty: ing.qty,
            unit: effectiveUnit,
            obs: (ing as { obs?: string | null }).obs ?? null,
            groupName: ing.groupName,
            groupOrder: ing.groupOrder,
            order: idx,
            match,
            unitConflict,
          };
        })
      );

      const instructions = r.instructions;

      reviewRecipes.push({
        name: r.name || "Rețetă fără nume",
        servings: r.servings,
        batch: r.batch ?? true,
        time: r.time,
        difficulty: r.difficulty,
        category: r.category,
        link: r.link,
        image: r.image,
        favorite: r.favorite,
        ingredients: matchedIngredients,
        instructions,
      });
    }

    return NextResponse.json({ recipes: reviewRecipes });
  } catch (err) {
    console.error("[import/parse] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Eroare internă" },
      { status: 500 }
    );
  }
}
