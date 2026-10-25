import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import {
  browserHeaders, isUnsupportedHost, normalizeUnit, parseIngredientString, parseText, parseUrls,
  type RawRecipe,
} from "./recipe-scraper";

// The "Ask AI" side of adding recipes: turns a recipe link (+ notes), a description, pasted
// text or a photo/PDF into the RawRecipe shape the matcher (lib/import.ts) already takes.
// Links and text go through the plain scraper first; Claude only steps in for what it can't
// do — notes to apply, a page it can't read, a description, or a photo.

const MODEL = "claude-opus-5-5";
const CATEGORIES = ["Breakfast", "Lunch", "Dinner", "Snack", "Smoothie", "Smoothie Bowl", "Soup", "High Protein"] as const;

/** A message the person can act on — the route returns it as is. */
export class AiImportError extends Error {}

const RECIPE_SCHEMA = {
  type: "object",
  properties: {
    found: { type: "boolean", description: "false when the input holds no recipe" },
    name: { type: "string" },
    servings: { type: "integer", description: "How many servings the amounts make; 0 if unknown" },
    time_minutes: { type: "integer", description: "Total time in minutes; 0 if unknown" },
    difficulty: { type: "string", enum: ["", "Easy", "Moderate", "Hard"] },
    categories: { type: "array", items: { type: "string", enum: [...CATEGORIES] } },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        properties: {
          group: { type: "string", description: "Ingredient group heading such as \"For the sauce\"; empty if none" },
          quantity: { type: "string", description: "Number as written: \"2\", \"1.5\", \"1/2\"; empty for to taste" },
          unit: { type: "string", description: "g, kg, ml, l, tsp, tbsp, cup, piece, slice, clove, can, pinch, handful, bunch, scoop; empty for a plain count or to taste" },
          name: { type: "string", description: "The ingredient alone, singular, lower case: \"red onion\", not \"2 red onions, chopped\"" },
          note: { type: "string", description: "Preparation or remark: \"finely chopped\", \"optional\"; empty if none" },
        },
        required: ["group", "quantity", "unit", "name", "note"],
        additionalProperties: false,
      },
    },
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          is_section: { type: "boolean", description: "true for a heading such as \"For the dressing\"" },
        },
        required: ["text", "is_section"],
        additionalProperties: false,
      },
    },
  },
  required: ["found", "name", "servings", "time_minutes", "difficulty", "categories", "ingredients", "steps"],
  additionalProperties: false,
} as const;

const SYSTEM = `You turn recipes into structured data for a two-person household's meal planner.

Rules:
- Keep the recipe's own amounts and servings; never invent ingredients or steps the source doesn't have (unless asked to write a recipe from a description).
- One ingredient per line. Split "salt and pepper" into two. Put preparation ("chopped", "at room temperature") in note, not in name.
- Units: use the metric or kitchen unit the source uses, from the listed set. A plain count ("2 eggs") has an empty unit.
- Steps: one action per step, in order, without numbering. Keep section headings as is_section steps only when the source groups steps.
- Write the recipe in English unless the notes say otherwise; keep proper names.
- Follow the person's notes (servings, language, substitutions) when they're given.`;

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AiImportError("AI isn't set up on this server (ANTHROPIC_API_KEY is missing).");
  }
  client ??= new Anthropic();
  return client;
}

async function extract(content: Anthropic.ContentBlockParam[], link: string | null): Promise<RawRecipe> {
  let res;
  try {
    res = await anthropic().messages.parse({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "medium", format: jsonSchemaOutputFormat(RECIPE_SCHEMA) },
      system: SYSTEM,
      messages: [{ role: "user", content }],
    });
  } catch (err) {
    if (err instanceof AiImportError) throw err;
    if (err instanceof Anthropic.RateLimitError) throw new AiImportError("AI is busy right now. Try again in a minute.");
    if (err instanceof Anthropic.APIError) {
      console.error("[ai-import] API error", err.status, err.message);
      throw new AiImportError("AI couldn't read this one. Try again, or paste the recipe as text.");
    }
    throw err;
  }
  if (res.stop_reason === "refusal") throw new AiImportError("AI declined to read this one. Paste the recipe as text instead.");
  if (res.stop_reason === "max_tokens") throw new AiImportError("This recipe is too long for AI to read in one go. Paste the part you need as text.");
  const r = res.parsed_output;
  if (!r) throw new AiImportError("AI's answer couldn't be read. Try again.");
  if (!r.found || r.ingredients.length === 0) throw new AiImportError("No recipe found in this.");

  let groupOrder = 0;
  let lastGroup: string | null = null;
  return {
    name: r.name.trim() || "Untitled recipe",
    servings: r.servings > 0 ? r.servings : null,
    batch: true,
    time: r.time_minutes > 0 ? r.time_minutes : null,
    difficulty: r.difficulty || null,
    category: r.categories.length ? [...new Set(r.categories)].join(", ") : null,
    link,
    image: null,
    favorite: false,
    ingredients: r.ingredients
      .filter((i) => i.name.trim())
      .map((i) => {
        const group = i.group.trim() || null;
        if (groupOrder === 0 || group !== lastGroup) {
          groupOrder += 1;
          lastGroup = group;
        }
        // Run the amount and unit through the scraper's parser, so "1 1/2", "½" and
        // "tablespoons" come out the way every other import stores them.
        const parsed = parseIngredientString(`${i.quantity} ${i.unit} x`.trim());
        const unit = i.unit.trim() ? normalizeUnit(i.unit.trim()) : parsed.unit;
        return {
          name: i.name.trim().toLowerCase(),
          qty: i.quantity.trim() ? parsed.qty : null,
          unit: unit || null,
          obs: i.note.trim() || null,
          groupName: group,
          groupOrder,
        };
      }),
    instructions: r.steps.filter((s) => s.text.trim()).map((s) => ({ text: s.text.trim(), isSection: s.is_section })),
  };
}

function notesBlock(notes: string): Anthropic.TextBlockParam[] {
  return notes.trim() ? [{ type: "text", text: `The person's notes: ${notes.trim()}` }] : [];
}

/** Visible text of a page plus its JSON-LD (the best recipe source when a site has one). */
function pageText(html: string): string {
  const jsonLd = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1].trim())
    .join("\n");
  const text = html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|li|h\d|div|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  // A recipe is a few thousand characters; the cap keeps cookie banners and comment threads out.
  return [jsonLd && `Structured data on the page:\n${jsonLd.slice(0, 30000)}`, `Page text:\n${text.slice(0, 40000)}`]
    .filter(Boolean)
    .join("\n\n");
}

function ogImage(html: string): string | null {
  const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  return m?.[1] ?? null;
}

/** A recipe link. Claude reads the page when AI is set up (it splits "salt and pepper",
 *  cleans names, applies the notes); without it, the plain scraper's result. */
export async function recipeFromLink(url: string, notes: string): Promise<RawRecipe> {
  if (isUnsupportedHost(url)) {
    throw new AiImportError("Video and social posts don't hold the recipe itself. Copy the recipe as text instead.");
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    const [scraped] = await parseUrls([url]);
    if (!scraped.error && scraped.ingredients.length > 0 && !notes.trim()) return scraped;
    throw new AiImportError(scraped.error ?? "AI isn't set up on this server, and this page couldn't be read without it.");
  }

  let html: string;
  try {
    const res = await fetch(url, { headers: browserHeaders(url), signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new AiImportError(`The site turned the request away (HTTP ${res.status}). Copy the recipe as text instead.`);
    html = await res.text();
  } catch (err) {
    if (err instanceof AiImportError) throw err;
    throw new AiImportError("Couldn't reach the site. Check the link, or copy the recipe as text.");
  }
  const recipe = await extract(
    [{ type: "text", text: `Recipe page ${url}\n\n${pageText(html)}` }, ...notesBlock(notes), { type: "text", text: "Extract the recipe on this page." }],
    url
  );
  return { ...recipe, image: ogImage(html) };
}

/** A recipe written from what the person describes ("a quick red lentil soup"). */
export async function recipeFromDescription(prompt: string): Promise<RawRecipe> {
  return extract([{ type: "text", text: `Write one home-cooking recipe for this request: ${prompt.trim()}` }], null);
}

/** Pasted text: Claude when AI is set up; without it, the plain text parser (which needs the
 *  "# Ingredients / # Steps" layout the old import wizard uses). */
export async function recipeFromText(text: string, notes: string): Promise<RawRecipe> {
  if (!process.env.ANTHROPIC_API_KEY) {
    const parsed = parseText(text).filter((r) => !r.error && r.ingredients.length > 0);
    if (parsed.length === 1) return parsed[0];
  }
  return extract([{ type: "text", text: `Recipe text:\n${text.slice(0, 60000)}` }, ...notesBlock(notes), { type: "text", text: "Extract the recipe in this text." }], null);
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

/** A photo of a recipe (a cookbook page, a handwritten card, a screenshot) or a PDF. */
export async function recipeFromFile(mediaType: string, data: string, notes: string): Promise<RawRecipe> {
  let block: Anthropic.ContentBlockParam;
  if (mediaType === "application/pdf") {
    block = { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
  } else if ((IMAGE_TYPES as readonly string[]).includes(mediaType)) {
    block = { type: "image", source: { type: "base64", media_type: mediaType as ImageType, data } };
  } else {
    throw new AiImportError("Use a photo (JPG, PNG, WebP) or a PDF.");
  }
  return extract([block, ...notesBlock(notes), { type: "text", text: "Extract the recipe in this file." }], null);
}
