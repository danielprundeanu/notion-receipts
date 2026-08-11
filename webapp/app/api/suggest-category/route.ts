import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

// ─── AI-suggested grocery category for a batch of items ──────────────────────
// Used by the Audit page's "Match all": items with no category (or a legacy one
// nothing maps to) get a suggestion picked from the caller's allowed list. Batched
// into a single call — one request per item would be slow and needlessly costly.
// The suggestion is only ever pre-filled; the user still confirms before saving.

const MAX_ITEMS = 120;

export async function POST(req: Request) {
  try {
    const { items, categories } = (await req.json()) as {
      items?: Array<{ id?: string; name?: string }>;
      categories?: string[];
    };

    const list = (items ?? []).filter((i) => i?.id && i?.name).slice(0, MAX_ITEMS);
    const allowed = (categories ?? []).filter((c) => typeof c === "string" && c.trim());
    if (!list.length || !allowed.length) {
      return NextResponse.json({ error: "Missing items or categories." }, { status: 400 });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      // Without a key the feature degrades gracefully — the user picks manually.
      return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set." }, { status: 503 });
    }

    const anthropic = new Anthropic();

    const res = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 4000,
      system:
        "You assign grocery items to a shopping category. " +
        "You reply EXCLUSIVELY with a JSON object mapping each item id to one category, " +
        'exactly in the form {"<id>": "<category>"}, with no extra text. ' +
        "Every value MUST be copied verbatim from the allowed category list, including its emoji. " +
        "If an item fits none of them, use the category that is literally \"Other\". " +
        "Include every id you are given.",
      messages: [
        {
          role: "user",
          content:
            `Allowed categories (copy verbatim):\n${allowed.map((c) => `- ${c}`).join("\n")}\n\n` +
            `Items:\n${list.map((i) => `- ${i.id}: ${i.name}`).join("\n")}\n\n` +
            "Return only the JSON object.",
        },
      ],
    });

    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ error: "Invalid AI response." }, { status: 502 });

    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid AI response." }, { status: 502 });
    }

    // Keep only ids we asked about, mapped to a category we actually offered —
    // anything else is dropped rather than written back as a bogus category.
    const allowedSet = new Set(allowed);
    const validIds = new Set(list.map((i) => i.id as string));
    const suggestions: Record<string, string> = {};
    for (const [id, value] of Object.entries(raw)) {
      if (!validIds.has(id) || typeof value !== "string") continue;
      const v = value.trim();
      if (allowedSet.has(v)) suggestions[id] = v;
    }

    return NextResponse.json({ suggestions });
  } catch (e) {
    console.error("suggest-category:", e);
    return NextResponse.json({ error: "Error generating suggestions." }, { status: 500 });
  }
}
