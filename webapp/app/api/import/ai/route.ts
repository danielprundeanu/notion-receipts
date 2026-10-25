import { NextRequest, NextResponse } from "next/server";
import { matchRawRecipes } from "@/lib/import";
import { AiImportError, recipeFromDescription, recipeFromFile, recipeFromLink, recipeFromText } from "@/lib/ai-import";

// One recipe per request, so the add-recipes sheet can show each link's progress and a slow
// page never holds up the others. Reading a page plus a Claude call can take a while.
export const maxDuration = 60;

type Body =
  | { kind: "link"; url: string; notes?: string }
  | { kind: "describe"; prompt: string }
  | { kind: "text"; text: string; notes?: string }
  | { kind: "file"; mediaType: string; data: string; notes?: string };

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  try {
    let raw;
    if (body.kind === "link" && typeof body.url === "string" && /^https?:\/\//i.test(body.url)) {
      raw = await recipeFromLink(body.url.trim(), body.notes ?? "");
    } else if (body.kind === "describe" && typeof body.prompt === "string" && body.prompt.trim()) {
      raw = await recipeFromDescription(body.prompt);
    } else if (body.kind === "text" && typeof body.text === "string" && body.text.trim()) {
      raw = await recipeFromText(body.text, body.notes ?? "");
    } else if (body.kind === "file" && typeof body.data === "string" && body.data) {
      raw = await recipeFromFile(body.mediaType, body.data, body.notes ?? "");
    } else {
      return NextResponse.json({ error: "Nothing to read." }, { status: 400 });
    }
    const [recipe] = await matchRawRecipes([raw]);
    return NextResponse.json({ recipe });
  } catch (err) {
    if (err instanceof AiImportError) return NextResponse.json({ error: err.message }, { status: 422 });
    console.error("[import/ai] error:", err);
    return NextResponse.json({ error: "Something went wrong reading this one. Try again." }, { status: 500 });
  }
}
