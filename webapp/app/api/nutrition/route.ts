import { NextRequest, NextResponse } from "next/server";
import { searchUsda } from "@/lib/usda";

// USDA FoodData Central — free, no registration needed with DEMO_KEY
const USDA_KEY = process.env.USDA_API_KEY ?? "DEMO_KEY";

// Best match plus up to 4 alternatives. `confident` is false when the name could mean several
// foods: callers that write without asking (bulk fill, Data check) must skip those.
export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q")?.trim();
  if (!query) return NextResponse.json({ error: "Missing query" }, { status: 400 });

  try {
    const match = await searchUsda(query, USDA_KEY);
    if (!match) {
      return NextResponse.json(
        { error: "No nutrition data found." },
        { status: 404 }
      );
    }
    return NextResponse.json(match);
  } catch (err) {
    console.error("[nutrition]", err);
    return NextResponse.json(
      { error: "Error searching nutrition. Please try again." },
      { status: 500 }
    );
  }
}
