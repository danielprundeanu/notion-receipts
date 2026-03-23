/**
 * recipe-scraper.ts — TypeScript recipe scraper (replaces Python web_import_handler.py)
 *
 * Supports:
 * - URL parsing via Schema.org JSON-LD (fetch + extract)
 * - URL parsing via HTML fallback (WP Recipe Maker, Tasty Recipes, generic)
 * - Text parsing (=== format from import_recipes.py)
 */

import { parse as parseHtml } from "node-html-parser";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RawIngredient = {
  name: string;
  qty: number | null;
  unit: string | null;
  groupName: string | null;
  groupOrder: number;
};

export type RawInstruction = {
  text: string;
  isSection: boolean;
};

export type RawRecipe = {
  name: string;
  servings: number | null;
  time: number | null;
  difficulty: string | null;
  category: string | null;
  link: string | null;
  image: string | null;
  favorite: boolean;
  ingredients: RawIngredient[];
  instructions: RawInstruction[];
  error?: string;
  url?: string;
};

// ─── Unit normalization ───────────────────────────────────────────────────────

const UNIT_MAP: Record<string, string> = {
  cups: "cup",
  tablespoons: "tbsp",
  tablespoon: "tbsp",
  teaspoons: "tsp",
  teaspoon: "tsp",
  ounces: "oz",
  ounce: "oz",
  pounds: "lb",
  pound: "lb",
  pints: "pint",
  pieces: "piece",
  handfuls: "handful",
  grams: "g",
  gram: "g",
  kilograms: "kg",
  kilogram: "kg",
  milliliters: "ml",
  milliliter: "ml",
  liters: "l",
  liter: "l",
  cloves: "clove",
  slices: "slice",
  cans: "can",
  stalks: "stalk",
  bunches: "bunch",
  heads: "head",
};

const KNOWN_UNITS = [
  "tbsp", "tsp", "cup", "oz", "lb", "g", "kg", "ml", "l",
  "pint", "piece", "handful", "clove", "slice", "can", "stalk",
  "bunch", "head", "tablespoon", "teaspoon", "ounce", "pound",
  "gram", "kilogram", "milliliter", "liter", "cups", "tablespoons",
  "teaspoons", "ounces", "pounds", "grams", "kilograms", "milliliters",
  "liters", "cloves", "slices", "cans", "stalks", "bunches", "heads",
  "pints", "pieces", "handfuls",
];
const UNIT_PATTERN = new RegExp(
  `^(${KNOWN_UNITS.sort((a, b) => b.length - a.length).join("|")})\\b\\.?\\s*`,
  "i"
);

function normalizeUnit(u: string): string {
  const lower = u.toLowerCase();
  return UNIT_MAP[lower] ?? lower;
}

// ─── Ingredient parser ────────────────────────────────────────────────────────

/** Parse a qty string like "2", "1/2", "1 1/2", "½" */
function parseQty(s: string): number | null {
  if (!s) return null;
  // Handle unicode fractions
  s = s
    .replace("½", "1/2")
    .replace("⅓", "1/3")
    .replace("⅔", "2/3")
    .replace("¼", "1/4")
    .replace("¾", "3/4")
    .trim();

  // Mixed fraction: "1 1/2"
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return parseInt(mixed[1]) + parseInt(mixed[2]) / parseInt(mixed[3]);

  // Simple fraction: "1/2"
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) return parseInt(frac[1]) / parseInt(frac[2]);

  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/** Parse an ingredient string like "2 cups flour, sifted" → {qty, unit, name} */
export function parseIngredientString(raw: string): Pick<RawIngredient, "name" | "qty" | "unit"> {
  // Remove special bullet chars
  let text = raw.replace(/^[-–•*▢☐□▪◦✓✔→◆■●○]\s*/, "").trim();

  // Remove parenthetical notes: "2 cups flour (about 250g)" → "2 cups flour"
  text = text.replace(/\s*\(.*?\)/g, "").trim();

  // Match optional qty at start
  const qtyMatch = text.match(/^(\d+(?:[.,]\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+|[½⅓⅔¼¾])\s*/);
  if (!qtyMatch) {
    // No quantity — whole string is name
    const name = text.split(",")[0].trim().toLowerCase();
    return { name, qty: null, unit: null };
  }

  const qty = parseQty(qtyMatch[1].replace(",", "."));
  const afterQty = text.slice(qtyMatch[0].length);

  // Try to match unit
  const unitMatch = afterQty.match(UNIT_PATTERN);
  if (unitMatch) {
    const unit = normalizeUnit(unitMatch[1]);
    const name = afterQty.slice(unitMatch[0].length).split(",")[0].trim().toLowerCase();
    return { name, qty, unit };
  }

  // No unit — the rest is the name
  const name = afterQty.split(",")[0].trim().toLowerCase();
  return { name, qty, unit: null };
}

// ─── Duration parser ──────────────────────────────────────────────────────────

/** Parse ISO 8601 duration like "PT1H30M" → minutes */
function parseDuration(s: string | undefined | null): number | null {
  if (!s) return null;
  const match = s.match(/PT?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!match) return null;
  const h = parseInt(match[1] ?? "0");
  const m = parseInt(match[2] ?? "0");
  const total = h * 60 + m;
  return total > 0 ? total : null;
}

// ─── Schema.org Recipe parser ─────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractImageUrl(image: any): string | null {
  if (!image) return null;
  if (typeof image === "string") return image;
  if (Array.isArray(image)) {
    const first = image[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object") return first.url ?? null;
  }
  if (typeof image === "object") return image.url ?? null;
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractCategory(cat: any): string | null {
  if (!cat) return null;
  if (typeof cat === "string") return cat.split(",")[0].trim() || null;
  if (Array.isArray(cat) && cat.length > 0) return String(cat[0]).split(",")[0].trim() || null;
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractServings(yield_: any): number | null {
  if (!yield_) return null;
  if (typeof yield_ === "number") return yield_;
  const s = String(yield_);
  const m = s.match(/\d+/);
  return m ? parseInt(m[0]) : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractInstructions(data: any): RawInstruction[] {
  const steps: RawInstruction[] = [];
  if (!data) return steps;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function cleanStep(text: string): string {
    return text
      .replace(/^[-–•*▢☐□▪◦✓✔→◆■●○]\s*/, "")
      .replace(/^\d+[.)]\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  if (typeof data === "string") {
    // Split on newlines or periods
    data.split(/\n|(?<=\.)\s+/).forEach((s) => {
      const t = cleanStep(s);
      if (t) steps.push({ text: t, isSection: false });
    });
    return steps;
  }

  if (Array.isArray(data)) {
    for (const item of data) {
      if (typeof item === "string") {
        const t = cleanStep(item);
        if (t) steps.push({ text: t, isSection: false });
      } else if (item && typeof item === "object") {
        // HowToSection with itemListElement
        if (item.itemListElement) {
          const sectionName = item.name ? item.name.trim() : "";
          if (sectionName) steps.push({ text: sectionName, isSection: true });
          for (const sub of item.itemListElement) {
            const t = cleanStep(sub.text ?? sub.name ?? "");
            if (t) steps.push({ text: t, isSection: false });
          }
        } else {
          const t = cleanStep(item.text ?? item.name ?? "");
          if (t) steps.push({ text: t, isSection: false });
        }
      }
    }
  }

  return steps;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractIngredientGroups(data: any): { groupName: string | null; items: string[] }[] {
  if (!data || !Array.isArray(data)) return [];

  // Structured groups: [{@type: "HowToSection", name: "...", itemListElement: [...]}]
  if (data.length > 0 && typeof data[0] === "object" && data[0].itemListElement) {
    const groups = [];
    for (const group of data) {
      const name = group.name?.trim() || null;
      const items: string[] = (group.itemListElement ?? []).map((i: unknown) =>
        typeof i === "string" ? i : (i as { text?: string; name?: string }).text ?? (i as { name?: string }).name ?? ""
      ).filter(Boolean);
      if (items.length) groups.push({ groupName: name, items });
    }
    if (groups.length) return groups;
  }

  // Flat array of strings
  const items = data.map((i: unknown) =>
    typeof i === "string" ? i : (i as { text?: string; name?: string }).text ?? (i as { name?: string }).name ?? ""
  ).filter(Boolean);

  return items.length ? [{ groupName: null, items }] : [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isRecipeSchema(data: any): boolean {
  if (!data || typeof data !== "object") return false;
  const type = data["@type"];
  if (Array.isArray(type)) return type.includes("Recipe");
  return type === "Recipe";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseRecipeSchema(data: any, url: string): RawRecipe {
  const groups = extractIngredientGroups(data.recipeIngredient ?? []);

  const ingredients: RawIngredient[] = [];
  groups.forEach((group, groupOrder) => {
    group.items.forEach((itemStr) => {
      const parsed = parseIngredientString(itemStr);
      ingredients.push({
        ...parsed,
        groupName: group.groupName,
        groupOrder,
      });
    });
  });

  const time =
    parseDuration(data.totalTime) ??
    parseDuration(data.cookTime) ??
    parseDuration(data.prepTime);

  return {
    name: String(data.name ?? "Untitled Recipe"),
    servings: extractServings(data.recipeYield),
    time,
    difficulty: null,
    category: extractCategory(data.recipeCategory),
    link: url,
    image: extractImageUrl(data.image),
    favorite: false,
    ingredients,
    instructions: extractInstructions(data.recipeInstructions),
  };
}

// ─── HTML fallback parser ─────────────────────────────────────────────────────

function extractFromHtml(html: string, url: string): RawRecipe | null {
  const root = parseHtml(html, { lowerCaseTagName: true });

  // ── Detect plugin ─────────────────────────────────────────────────────────
  const hasWprm = root.querySelector(".wprm-recipe-ingredient") !== null;
  const hasEasyRecipe = root.querySelector(".easyrecipe") !== null;
  const hasTasty = root.querySelector(".tasty-recipes") !== null;

  // ── Title ────────────────────────────────────────────────────────────────
  let name = "";
  if (hasWprm) name = root.querySelector(".wprm-recipe-name")?.text.trim() ?? "";
  else if (hasEasyRecipe) name = root.querySelector(".ERSName")?.text.trim() ?? "";
  else if (hasTasty) name = root.querySelector(".tasty-recipes-title")?.text.trim() ?? "";
  if (!name) name = root.querySelector("h1")?.text.trim() ?? "";
  if (!name) return null;

  // ── Servings ─────────────────────────────────────────────────────────────
  let servings: number | null = null;
  if (hasWprm) {
    servings = parseInt(root.querySelector(".wprm-recipe-servings")?.text.trim() ?? "") || null;
  } else if (hasEasyRecipe) {
    const s = root.querySelector(".ERSServes [itemprop='recipeYield'], .ERSServes span")?.text.trim() ?? "";
    servings = parseInt(s.match(/\d+/)?.[0] ?? "") || null;
  }

  // ── Time ─────────────────────────────────────────────────────────────────
  let time: number | null = null;
  if (hasWprm) {
    const t = root.querySelector(".wprm-recipe-total_time-container .wprm-recipe-time")?.text.trim();
    if (t) time = parseInt(t) || null;
  } else if (hasEasyRecipe) {
    // EasyRecipe uses ISO 8601 in the datetime attribute of <time> elements
    const totalTimeEl = root.querySelector("time[itemprop='totalTime']");
    if (totalTimeEl) time = parseDuration(totalTimeEl.getAttribute("datetime")) ?? null;
    if (!time) {
      const cookTimeEl = root.querySelector("time[itemprop='cookTime']");
      if (cookTimeEl) time = parseDuration(cookTimeEl.getAttribute("datetime")) ?? null;
    }
  }

  // ── Image ─────────────────────────────────────────────────────────────────
  let image: string | null = null;
  if (hasWprm) image = root.querySelector(".wprm-recipe-image img")?.getAttribute("src") ?? null;
  else if (hasEasyRecipe) image = root.querySelector(".ERSTopRight img")?.getAttribute("src") ?? null;
  else if (hasTasty) image = root.querySelector(".tasty-recipes-image img")?.getAttribute("src") ?? null;

  // ── Category ──────────────────────────────────────────────────────────────
  const category = root.querySelector(".wprm-recipe-course")?.text.trim() ?? null;

  // ── Ingredients ───────────────────────────────────────────────────────────
  const ingredients: RawIngredient[] = [];

  if (hasWprm) {
    let groupOrder = 0;
    for (const group of root.querySelectorAll(".wprm-recipe-ingredient-group")) {
      const groupName = group.querySelector(".wprm-recipe-ingredient-group-name")?.text.trim() || null;
      for (const item of group.querySelectorAll(".wprm-recipe-ingredient")) {
        const qty = parseQty(item.querySelector(".wprm-recipe-ingredient-amount")?.text.trim() ?? "");
        const rawUnit = item.querySelector(".wprm-recipe-ingredient-unit")?.text.trim() ?? null;
        const unit = rawUnit ? normalizeUnit(rawUnit) : null;
        const ingName = item.querySelector(".wprm-recipe-ingredient-name")?.text.trim().toLowerCase() ?? item.text.trim().toLowerCase();
        if (ingName) ingredients.push({ name: ingName, qty, unit, groupName, groupOrder });
      }
      groupOrder++;
    }
  } else if (hasEasyRecipe) {
    // EasyRecipe: .ERSSectionHead for group names, li.ingredient for items
    const ingBlock = root.querySelector(".ERSIngredients");
    if (ingBlock) {
      let groupName: string | null = null;
      let groupOrder = 0;
      for (const child of ingBlock.childNodes) {
        const el = child as typeof root;
        if (!el.tagName) continue;
        const tag = el.tagName.toLowerCase();
        const cls = (el.getAttribute?.("class") ?? "").toLowerCase();

        if (cls.includes("erssectionhead")) {
          if (groupName !== null) groupOrder++;
          groupName = el.text.trim().replace(/:$/, "") || null;
        } else if (tag === "ul" || tag === "ol") {
          for (const li of el.querySelectorAll("li")) {
            const text = li.text.trim();
            if (!text) continue;
            const parsed = parseIngredientString(text);
            if (parsed.name) ingredients.push({ ...parsed, groupName, groupOrder });
          }
          if (groupName !== null) groupOrder++;
          groupName = null;
        }
      }
    }
  } else {
    // Generic fallback: containers with "ingredient" in class/id
    const containers = root.querySelectorAll("ul, ol, div").filter((el) => {
      const cls = (el.getAttribute("class") ?? "").toLowerCase();
      const id = (el.getAttribute("id") ?? "").toLowerCase();
      return cls.includes("ingredient") || id.includes("ingredient") ||
             cls.includes("ingrediente") || id.includes("ingrediente");
    }).slice(0, 5);

    let groupOrder = 0;
    for (const container of containers) {
      for (const li of container.querySelectorAll("li")) {
        const text = li.text.trim();
        if (!text) continue;
        const parsed = parseIngredientString(text);
        if (parsed.name) ingredients.push({ ...parsed, groupName: null, groupOrder });
      }
      if (ingredients.length > 0) break;
      groupOrder++;
    }
  }

  // ── Instructions ──────────────────────────────────────────────────────────
  const instructions: RawInstruction[] = [];

  if (hasWprm) {
    for (const group of root.querySelectorAll(".wprm-recipe-instruction-group")) {
      const sectionName = group.querySelector(".wprm-recipe-instruction-group-name")?.text.trim();
      if (sectionName) instructions.push({ text: sectionName, isSection: true });
      for (const step of group.querySelectorAll(".wprm-recipe-instruction")) {
        const text = step.querySelector(".wprm-recipe-instruction-text")?.text.trim() ?? step.text.trim();
        if (text) instructions.push({ text, isSection: false });
      }
    }
  } else if (hasTasty) {
    for (const step of root.querySelectorAll(".tasty-recipes-instructions li, .tasty-recipes-instructions p")) {
      const text = step.text.trim();
      if (text) instructions.push({ text, isSection: false });
    }
  } else {
    // Generic fallback
    const instrContainers = root.querySelectorAll("ul, ol, div").filter((el) => {
      const cls = (el.getAttribute("class") ?? "").toLowerCase();
      const id = (el.getAttribute("id") ?? "").toLowerCase();
      return cls.includes("instruction") || id.includes("instruction") ||
             cls.includes("step") || id.includes("step") ||
             cls.includes("preparare") || id.includes("preparare") ||
             cls.includes("mod-de-preparare") || id.includes("mod-de-preparare");
    }).slice(0, 3);

    for (const container of instrContainers) {
      for (const item of container.querySelectorAll("li, p")) {
        const text = item.text.trim();
        if (text && text.length > 10) instructions.push({ text, isSection: false });
      }
      if (instructions.length > 0) break;
    }
  }

  if (!ingredients.length && !instructions.length) return null;

  return { name, servings, time, difficulty: null, category, link: url, image, favorite: false, ingredients, instructions };
}

// ─── URL fetcher ──────────────────────────────────────────────────────────────

async function fetchRecipeFromUrl(url: string): Promise<RawRecipe> {
  let html: string;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (e) {
    return { name: "", servings: null, time: null, difficulty: null, category: null, link: url, image: null, favorite: false, ingredients: [], instructions: [], error: `Fetch error: ${e instanceof Error ? e.message : e}`, url };
  }

  // Extract all JSON-LD script tags
  const jsonLdMatches = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);

  for (const match of jsonLdMatches) {
    try {
      const raw = JSON.parse(match[1]);
      const candidates = Array.isArray(raw) ? raw : [raw];

      // Some sites nest it in @graph
      const expanded: unknown[] = [];
      for (const c of candidates) {
        if (c?.["@graph"]) expanded.push(...c["@graph"]);
        else expanded.push(c);
      }

      for (const item of expanded) {
        if (isRecipeSchema(item)) {
          return parseRecipeSchema(item, url);
        }
      }
    } catch {
      // ignore malformed JSON-LD
    }
  }

  // Fallback: try generic HTML parsing
  const htmlResult = extractFromHtml(html, url);
  if (htmlResult) return htmlResult;

  return {
    name: "",
    servings: null,
    time: null,
    difficulty: null,
    category: null,
    link: url,
    image: null,
    favorite: false,
    ingredients: [],
    instructions: [],
    error: `Nu s-a putut extrage rețeta de la ${url}`,
    url,
  };
}

// ─── Text parser (=== format) ─────────────────────────────────────────────────

const META_RE = /^(Servings|Time|Difficulty|Favorite|Link|Category|Image):\s*(.+)$/;
const BRACKET_RE = /^\[([^\]]*)\]\s*(.*)$/;
const OLD_GROUP_RE = /^\[\d+\]$/;
const STEP_RE = /^(\d+)[.)]\s*(.+)$/;

function parseBracket(s: string): { qtyStr: string | null; unit: string | null } {
  const parts = s.trim().split(/\s+/, 2);
  if (parts.length === 0) return { qtyStr: null, unit: null };
  if (parts.length === 1) {
    // Could be just qty (no unit) or just unit
    const n = parseFloat(parts[0]);
    if (!isNaN(n)) return { qtyStr: parts[0], unit: null };
    return { qtyStr: null, unit: parts[0] || null };
  }
  return { qtyStr: parts[0], unit: parts[1] || null };
}

export function parseTextFormat(content: string): RawRecipe[] {
  const recipes: RawRecipe[] = [];
  let r: RawRecipe | null = null;
  let state: "meta" | "ingr" | "steps" | null = null;
  let groupName: string | null = null;
  let groupOrder = 0;
  let pendingGroup: string | null = null;

  for (const raw of content.split("\n")) {
    const line = raw.trim();

    // Recipe title
    const titleMatch = line.match(/^===\s*(.+?)\s*===$/);
    if (titleMatch) {
      if (r) recipes.push(r);
      r = {
        name: titleMatch[1].replace(/\.$/, ""),
        servings: null, time: null, difficulty: null,
        category: null, favorite: false, link: null,
        image: null, ingredients: [], instructions: [],
      };
      state = "meta";
      groupName = null;
      groupOrder = 0;
      pendingGroup = null;
      continue;
    }

    if (!r || !line) continue;

    // Metadata
    const metaMatch = line.match(META_RE);
    if (metaMatch && (state === "meta" || state === null)) {
      const [, key, val] = metaMatch;
      if (key === "Servings") r.servings = parseInt(val) || null;
      else if (key === "Time") r.time = parseInt(val) || null;
      else if (key === "Difficulty") r.difficulty = val;
      else if (key === "Favorite") r.favorite = val.toLowerCase() === "yes";
      else if (key === "Link") r.link = val;
      else if (key === "Category") r.category = val;
      else if (key === "Image") r.image = val;
      state = "meta";
      continue;
    }

    // Steps section
    if (line.startsWith("Steps:")) {
      state = "steps";
      continue;
    }
    if (state === "steps") {
      if (line.startsWith("## ")) {
        r.instructions.push({ text: line.slice(3).trim(), isSection: true });
      } else {
        const sm = line.match(STEP_RE);
        if (sm) r.instructions.push({ text: sm[2].trim(), isSection: false });
      }
      continue;
    }

    // Ingredient lines
    if (line.startsWith("[")) {
      if (OLD_GROUP_RE.test(line)) {
        if (pendingGroup) { groupName = pendingGroup; groupOrder++; pendingGroup = null; }
        else if (state === "ingr") { groupOrder++; groupName = null; }
        state = "ingr";
        continue;
      }
      const bm = line.match(BRACKET_RE);
      if (bm) {
        if (pendingGroup !== null) { groupName = pendingGroup; groupOrder++; pendingGroup = null; }
        state = "ingr";
        const { qtyStr, unit } = parseBracket(bm[1]);
        let name = bm[2].split(",")[0].trim()
          .replace(/\s*\(.*?\)/g, "")
          .replace(/\s+(?:OR|or)\s+.*$/, "")
          .toLowerCase();
        r.ingredients.push({
          name,
          qty: parseQty(qtyStr ?? ""),
          unit: unit ? normalizeUnit(unit) : null,
          groupName,
          groupOrder,
        });
        continue;
      }
    }

    // Plain text after ingredients = new group header
    if (state === "ingr") {
      pendingGroup = line;
    }
  }

  if (r) recipes.push(r);
  return recipes;
}

// ─── Free-form text parser (# Ingredients / # Steps format) ─────────────────

function parseFreeFormBlock(content: string): RawRecipe | null {
  const lines = content.split("\n").map((l) => l.trim());

  // First non-empty line = title
  let title = "";
  let startIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]) {
      title = lines[i].replace(/^[\d.\-–•*]+\s*/, "").trim();
      startIdx = i + 1;
      break;
    }
  }
  if (!title) return null;

  let servings: number | null = null;
  let time: number | null = null;
  let link: string | null = null;
  type Section = "ingredients" | "steps" | "description" | "extra" | null;
  let section: Section = null;

  const ingredientGroups: { groupName: string | null; items: string[] }[] = [];
  const instructions: RawInstruction[] = [];
  let currentGroupName: string | null = null;
  let currentIngredients: string[] = [];

  function flushIngredients() {
    if (currentIngredients.length > 0) {
      ingredientGroups.push({ groupName: currentGroupName, items: [...currentIngredients] });
      currentIngredients = [];
    }
    currentGroupName = null;
  }

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Section header
    if (line.startsWith("#")) {
      const sl = line.replace(/^#+\s*/, "").replace(/:$/, "").toLowerCase();
      if (/ingredient|ingrediente/.test(sl)) {
        flushIngredients(); section = "ingredients";
      } else if (/step|method|preparare|mod de preparare|instruction|direction/.test(sl)) {
        flushIngredients(); section = "steps";
      } else if (/description|descriere/.test(sl)) {
        flushIngredients(); section = "description";
      } else {
        flushIngredients(); section = "extra";
      }
      continue;
    }

    // Servings (with or without colon)
    if (/^(servings?|por[țt]ii|yields?)\s*:?\s*\d/i.test(line)) {
      const m = line.match(/(\d+)/);
      if (m) servings = parseInt(m[1]);
      continue;
    }

    // Time
    if (/^(prep time|cook time|total time|timp|time|durat)\s*:/i.test(line)) {
      const h = line.match(/(\d+)\s*(?:h|ore|ora|hour)/i);
      const m = line.match(/(\d+)\s*(?:m|min|minute)/i);
      if (h || m) time = (h ? parseInt(h[1]) * 60 : 0) + (m ? parseInt(m[1]) : 0) || null;
      continue;
    }

    // Link
    if (/^link\s*:/i.test(line)) {
      link = line.replace(/^link\s*:\s*/i, "").trim();
      continue;
    }

    if (section === "ingredients") {
      const clean = line.replace(/^[-–•*▢☐□▪◦✓✔→◆■●○]\s*/, "").trim();
      if (!clean) continue;
      const hasNumber = /[\d½⅓⅔¼¾]/.test(clean);
      const wordCount = clean.split(/\s+/).length;
      // Group name: no number, ≤2 words, or ends with ":"
      // Everything else (including no-qty ingredients like "pátrunjel verde") → ingredient
      if (!hasNumber && (wordCount <= 2 || clean.endsWith(":"))) {
        flushIngredients();
        currentGroupName = clean.replace(/:$/, "");
      } else {
        currentIngredients.push(clean);
      }
    } else if (section === "steps") {
      const clean = line.replace(/^[\d.)–\-•*]\s*/, "").trim();
      if (clean.length >= 5) instructions.push({ text: clean, isSection: false });
    }
  }

  flushIngredients();

  if (ingredientGroups.length === 0 && instructions.length === 0) return null;

  const ingredients: RawIngredient[] = [];
  ingredientGroups.forEach((group, groupOrder) => {
    for (const item of group.items) {
      const parsed = parseIngredientString(item);
      if (parsed.name) ingredients.push({ ...parsed, groupName: group.groupName, groupOrder });
    }
  });

  return { name: title, servings, time, difficulty: null, category: null, link, image: null, favorite: false, ingredients, instructions };
}

function parseFreeFormText(content: string): RawRecipe[] {
  // Split on recipe separators (4+ dashes on their own line)
  const blocks = content.split(/\n\s*-{4,}\s*\n/).filter((b) => b.trim());
  return blocks.map(parseFreeFormBlock).filter((r): r is RawRecipe => r !== null);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function parseUrls(urls: string[]): Promise<RawRecipe[]> {
  return Promise.all(urls.filter((u) => u.trim()).map(fetchRecipeFromUrl));
}

export function parseText(text: string): RawRecipe[] {
  if (!text.trim()) return [];
  // === format (export from import_recipes.py)
  if (text.includes("===")) return parseTextFormat(text);
  // # Ingredients / # Steps free-form format
  return parseFreeFormText(text);
}
