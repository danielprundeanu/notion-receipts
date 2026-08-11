import { NextResponse } from "next/server";
import { loadRules, ruleKey, saveRules } from "@/lib/store";
import type { CategoryRules } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await loadRules());
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

type PutRequest = {
  rules?: CategoryRules["rules"];
  /** Rule keys to delete. Applied after any upserts in the same request. */
  remove?: string[];
};

export async function PUT(request: Request) {
  let body: PutRequest;
  try {
    body = (await request.json()) as PutRequest;
  } catch {
    return NextResponse.json({ error: "Corp de cerere invalid." }, { status: 400 });
  }

  try {
    const current = await loadRules();

    for (const [key, value] of Object.entries(body.rules ?? {})) {
      if (!value?.notionCategoryId) continue;
      current.rules[ruleKey(key)] = {
        notionCategoryId: value.notionCategoryId,
        notionCategoryName: value.notionCategoryName ?? "",
      };
    }
    for (const key of body.remove ?? []) {
      delete current.rules[ruleKey(key)];
    }

    await saveRules(current);
    return NextResponse.json(current);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
