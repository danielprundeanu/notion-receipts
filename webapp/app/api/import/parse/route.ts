import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { prisma } from "@/lib/db";
import type { RawRecipe } from "@/lib/recipe-scraper";

const UNIT_CHOICES_PATH = path.resolve(process.cwd(), "../data/unit_choices.json");
const INGREDIENT_MAPPINGS_PATH = path.resolve(process.cwd(), "../data/ingredient_name_mappings.json");

type UnitChoice = { action: string; unit: string; rate: number; from_unit?: string | null };
type IngredientNameMapping = { groceryItemId: string; groceryItemName: string };

function loadUnitChoices(): Record<string, UnitChoice> {
  try {
    return JSON.parse(fs.readFileSync(UNIT_CHOICES_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function loadIngredientNameMappings(): Record<string, IngredientNameMapping> {
  try {
    return JSON.parse(fs.readFileSync(INGREDIENT_MAPPINGS_PATH, "utf-8"));
  } catch {
    return {};
  }
}

const PYTHON = path.resolve(process.cwd(), "../.venv/bin/python3");
const HANDLER = path.resolve(process.cwd(), "../scripts/web_import_handler.py");

async function callPython(mode: "parse-urls" | "parse-text", payload: object): Promise<RawRecipe[]> {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON, [HANDLER, "--mode", mode], { timeout: 60000 });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (stderr) console.warn("[python]", stderr.slice(0, 500));
      if (code !== 0) return reject(new Error(`Python exited ${code}: ${stderr.slice(0, 300)}`));
      try { resolve(JSON.parse(stdout)); }
      catch { reject(new Error(`JSON parse error: ${stdout.slice(0, 200)}`)); }
    });
    proc.on("error", reject);
    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();
  });
}

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
  groceryItemUnit2?: string | null;
  candidates?: Array<{ id: string; name: string; unit: string | null }>;
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
  const scored = candidates
    .map((c) => ({
      ...c,
      score: Math.max(
        similarity(nameLower, c.name.toLowerCase()),
        c.nameRo ? similarity(nameLower, c.nameRo.toLowerCase()) : 0,
      ),
    }))
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
      groceryItemUnit2: best.unit2,
      candidates: scored,
    };
  }

  // Low confidence → return as new but with candidates
  return {
    status: "new",
    candidates: scored,
  };
}

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
      rawRecipes = await callPython("parse-urls", { urls: body.urls ?? [] });
    } else if (type === "text") {
      rawRecipes = await callPython("parse-text", { text: body.content ?? "" });
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

      const unitChoices = loadUnitChoices();
      const nameMappings = loadIngredientNameMappings();
      const matchedIngredients: ReviewIngredient[] = await Promise.all(
        r.ingredients.map(async (ing, idx) => {
          const match = ing.name ? await matchIngredient(ing.name, nameMappings) : { status: "new" as const };

          let unitConflict: UnitConflict | undefined;
          if (ing.unit && match.groceryItemId) {
            const allowed = [match.groceryItemUnit, match.groceryItemUnit2].filter(Boolean) as string[];
            if (allowed.length > 0 && !allowed.includes(ing.unit)) {
              unitConflict = resolveUnitConflict(ing.name, ing.unit, allowed, unitChoices);
            }
          }

          return {
            name: ing.name,
            qty: ing.qty,
            unit: ing.unit,
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
