import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 20;

// ─── AI-suggested unit conversion for an ingredient ─────────────────────────────
// Folosit doar pentru conversiile dependente de ingredient (ex: 1 cup făină = 120 g)
// pe care tabelul static getAutoFactor() nu le poate ști. Cheia API rămâne pe server.

type Suggestion = { factor: number; note: string; confidence: "high" | "medium" | "low" };

export async function POST(req: Request) {
  try {
    const { ingredientName, fromUnit, toUnit } = await req.json();
    if (!ingredientName || !fromUnit || !toUnit) {
      return NextResponse.json({ error: "Lipsesc parametri (ingredientName, fromUnit, toUnit)." }, { status: 400 });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      // Fără cheie feature-ul e dezactivat elegant — clientul cade pe introducere manuală.
      return NextResponse.json({ error: "ANTHROPIC_API_KEY nesetat." }, { status: 503 });
    }

    const anthropic = new Anthropic();

    const res = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 300,
      system:
        "Ești un asistent culinar care estimează factori de conversie între unități pentru un ingredient anume, " +
        "folosind valori uzuale de gătit (măsuri US standard). " +
        "Răspunzi EXCLUSIV cu un obiect JSON, fără text în plus, exact de forma: " +
        `{"factor": <număr pozitiv>, "note": "<explicație foarte scurtă în română>", "confidence": "high"|"medium"|"low"}. ` +
        "factor = câte unități toUnit reprezintă 1 unitate fromUnit din acel ingredient.",
      messages: [
        {
          role: "user",
          content: `Ingredient: "${ingredientName}". Cât înseamnă 1 ${fromUnit} în ${toUnit}? Întoarce doar JSON-ul.`,
        },
      ],
    });

    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const parsed = parseSuggestion(text);
    if (!parsed) {
      return NextResponse.json({ error: "Răspuns AI invalid." }, { status: 502 });
    }
    return NextResponse.json(parsed);
  } catch (e) {
    console.error("suggest-conversion:", e);
    return NextResponse.json({ error: "Eroare la generarea sugestiei." }, { status: 500 });
  }
}

function parseSuggestion(text: string): Suggestion | null {
  // Extrage primul obiect JSON din răspuns
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const obj = JSON.parse(match[0]) as { factor?: unknown; note?: unknown; confidence?: unknown };
      const factor = Number(obj.factor);
      if (isFinite(factor) && factor > 0) {
        const confidence = obj.confidence === "high" || obj.confidence === "low" ? obj.confidence : "medium";
        return {
          factor: +factor.toFixed(6),
          note: typeof obj.note === "string" ? obj.note : "",
          confidence,
        };
      }
    } catch {
      // cade pe fallback-ul numeric de mai jos
    }
  }
  // Fallback: primul număr pozitiv din text
  const num = text.match(/\d+(\.\d+)?/);
  if (num) {
    const factor = Number(num[0]);
    if (isFinite(factor) && factor > 0) return { factor: +factor.toFixed(6), note: "", confidence: "low" };
  }
  return null;
}
