import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { prisma } from "@/lib/db";

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

// ─── Python subprocess helper ─────────────────────────────────────────────────

function runPythonHandler(mode: string, inputData: object): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const scriptsDir = path.join(process.cwd(), "..", "scripts");
    const proc = spawn("python3", ["web_import_handler.py", "--mode", mode], {
      cwd: scriptsDir,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));

    proc.stdin.write(JSON.stringify(inputData));
    proc.stdin.end();

    proc.on("close", (code) => {
      if (code !== 0 && !stdout) {
        reject(new Error(`Python process exited with code ${code}: ${stderr}`));
        return;
      }
      try {
        const result = JSON.parse(stdout);
        resolve(Array.isArray(result) ? result : [result]);
      } catch {
        reject(new Error(`JSON parse error. stdout: ${stdout.slice(0, 500)}`));
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to start Python process: ${err.message}`));
    });
  });
}

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

    // Call Python subprocess
    let rawRecipes: unknown[];
    if (type === "urls") {
      rawRecipes = await runPythonHandler("parse-urls", { urls: body.urls });
    } else if (type === "text") {
      rawRecipes = await runPythonHandler("parse-text", { text: body.content });
    } else {
      return NextResponse.json({ error: "type trebuie să fie 'urls' sau 'text'" }, { status: 400 });
    }

    // For each recipe, match ingredients against DB
    const reviewRecipes: ParsedRecipe[] = [];

    for (const raw of rawRecipes) {
      const r = raw as Record<string, unknown>;

      if (r.error) {
        // Pass through errors so UI can show them
        reviewRecipes.push({ ...(r as unknown as ParsedRecipe) });
        continue;
      }

      const rawIngredients = (r.ingredients as Array<Record<string, unknown>>) ?? [];

      const matchedIngredients: ReviewIngredient[] = await Promise.all(
        rawIngredients.map(async (ing, idx) => {
          const name = (ing.name as string) ?? "";
          const match = name ? await matchIngredient(name) : { status: "new" as const };
          return {
            name,
            qty: (ing.qty as number | null) ?? null,
            unit: (ing.unit as string | null) ?? null,
            groupName: (ing.groupName as string | null) ?? null,
            groupOrder: (ing.groupOrder as number) ?? 0,
            order: idx,
            match,
          };
        })
      );

      const instructions = (r.instructions as Array<Record<string, unknown>>) ?? [];

      reviewRecipes.push({
        name: (r.name as string) ?? "Rețetă fără nume",
        servings: (r.servings as number | null) ?? null,
        time: (r.time as number | null) ?? null,
        difficulty: (r.difficulty as string | null) ?? null,
        category: (r.category as string | null) ?? null,
        link: (r.link as string | null) ?? null,
        image: (r.image as string | null) ?? null,
        favorite: (r.favorite as boolean) ?? false,
        ingredients: matchedIngredients,
        instructions: instructions.map((inst) => ({
          text: (inst.text as string) ?? "",
          isSection: (inst.isSection as boolean) ?? false,
        })),
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
