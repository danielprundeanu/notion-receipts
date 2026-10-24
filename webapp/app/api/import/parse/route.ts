import { NextRequest, NextResponse } from "next/server";
import { parseUrls, parseText, type RawRecipe } from "@/lib/recipe-scraper";
import { matchRawRecipes } from "@/lib/import";

export type { ParsedIngredient, IngredientMatch, UnitConflict, ReviewIngredient, ParsedRecipe } from "@/lib/import";

// URL scraping fetches external sites (up to 15s each, in parallel) — give the
// serverless function room beyond Vercel's default 10s so slow sites don't get cut off.
export const maxDuration = 30;

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
      return NextResponse.json({ error: "type must be 'urls' or 'text'" }, { status: 400 });
    }

    return NextResponse.json({ recipes: await matchRawRecipes(rawRecipes) });
  } catch (err) {
    console.error("[import/parse] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
