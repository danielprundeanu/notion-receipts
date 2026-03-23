import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseUrls, parseText, type RawRecipe } from "@/lib/recipe-scraper";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ParsedIngredient = {
  name: string;
  qty: number | null;
  unit: string | null;
  groupName: string | null;
  groupOrder: number;
  order: number;
};

export type IngredientMatch = {
  status: "matched" | "similar" | "new";
  groceryItemId?: string;
  groceryItemName?: string;
  groceryItemUnit?: string | null;
  candidates?: Array<{ id: string; name: string; unit: string | null }>;
};

export type ReviewIngredient = ParsedIngredient & { match: IngredientMatch };

export type ParsedRecipe = {
  name: string;
  servings: number | null;
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

async function matchIngredient(name: string): Promise<IngredientMatch> {
  const nameLower = name.toLowerCase().trim();

  // 1. Exact match (case-insensitive)
  const exact = await prisma.groceryItem.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true, name: true, unit: true },
  });
  if (exact) {
    return {
      status: "matched",
      groceryItemId: exact.id,
      groceryItemName: exact.name,
      groceryItemUnit: exact.unit,
    };
  }

  // 2. Contains search — get top candidates
  const candidates = await prisma.groceryItem.findMany({
    where: {
      OR: [
        { name: { contains: nameLower, mode: "insensitive" } },
        { name: { contains: nameLower.split(" ")[0], mode: "insensitive" } },
      ],
    },
    take: 20,
    select: { id: true, name: true, unit: true },
  });

  if (candidates.length === 0) {
    return { status: "new" };
  }

  // Score candidates by similarity
  const scored = candidates
    .map((c) => ({ ...c, score: similarity(nameLower, c.name) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const best = scored[0];

  // High confidence → auto-match as "similar"
  if (best.score >= 0.8) {
    return {
      status: "similar",
      groceryItemId: best.id,
      groceryItemName: best.name,
      groceryItemUnit: best.unit,
      candidates: scored,
    };
  }

  // Low confidence → return as new but with candidates
  return {
    status: "new",
    candidates: scored,
  };
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type } = body as { type: "urls" | "text" };

    // Parse recipes using TypeScript scraper
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

    for (const r of rawRecipes) {
      if (r.error) {
        reviewRecipes.push({ ...(r as unknown as ParsedRecipe) });
        continue;
      }

      const matchedIngredients: ReviewIngredient[] = await Promise.all(
        r.ingredients.map(async (ing, idx) => {
          const match = ing.name ? await matchIngredient(ing.name) : { status: "new" as const };
          return {
            name: ing.name,
            qty: ing.qty,
            unit: ing.unit,
            groupName: ing.groupName,
            groupOrder: ing.groupOrder,
            order: idx,
            match,
          };
        })
      );

      const instructions = r.instructions;

      reviewRecipes.push({
        name: r.name || "Rețetă fără nume",
        servings: r.servings,
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
