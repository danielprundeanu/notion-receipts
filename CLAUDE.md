# CLAUDE.md

Meal-planner web app that imports recipes & grocery items from Notion and manages
recipes, a weekly planner, a grocery list, and ingredient nutrition. **UI copy is in Romanian.**

## Repository layout

Two parts:
- **`webapp/`** — the Next.js app (the deployed product). **All app work happens here.**
- **Repo root** — a legacy Python pipeline (`scripts/*.py`, `.venv/`, `data/`) that originally
  exported from Notion and parsed recipes. Mostly superseded by the TypeScript app; kept only
  for one-off Notion exports. Do not assume it reflects current app behavior.

Deployed on **Vercel** (`notion-recipe.vercel.app`) against a **Neon Postgres** database.
`git push` to `main` triggers the production deploy.

## Stack
- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS v4
- Prisma 7 with the `@prisma/adapter-pg` adapter → **PostgreSQL** (Neon), via `DATABASE_URL`.
  (Historically SQLite — no longer. Ignore older notes that say SQLite/better-sqlite3.)
- lucide-react icons
- Prisma client is generated to `webapp/app/generated/prisma`; import it as
  `@/app/generated/prisma/client`.

## Running & commands
Run everything from **`webapp/`** — `next dev` from the repo root fails ("Couldn't find any
`app` directory"), and `npx` there installs the wrong Next version.
```bash
cd webapp
npm run dev          # dev server
npm run build        # production build
npx tsc --noEmit     # typecheck (run this after edits)
npx eslint <path>    # lint
npx tsx scripts/<name>.ts   # one-off DB scripts
```
- Prisma schema: `webapp/prisma/schema.prisma`; DB singleton: `webapp/lib/db.ts`.

## Key paths (under webapp/)
- `lib/actions.ts` — server actions ("use server"): recipe / grocery / planner CRUD.
- `lib/recipe-scraper.ts` — recipe parser/scraper: `parseUrls()`, `parseText()`.
- `app/recipes/import/page.tsx` — 4-step import wizard (Input → Review → Resolve → Import).
- `app/api/import/*` — parse / confirm / search-items / upload-image routes.
- Components: `RecipeForm`, `RecipeDetail`, `RecipesGrid`, `GroceryItemModal`, `Sidebar`, `BottomNav`.

## Data-model semantics (non-obvious — get these right)
- `GroceryItem.conversion`: **1 `unit2` = `conversion` × `unit`**
  (e.g. `unit`=g, `unit2`=cup, `conversion`=240 → 1 cup = 240 g).
- `GroceryItem.unitWeight`: grams per one "piece"-style unit; used **only** for nutrition
  (`getWeekNutrition`, `RecipeDetail`). Nutrition values are per 100 g.
- `Ingredient.quantity` + `Ingredient.unit`: the stored unit must be one of the grocery item's
  units (imports convert a foreign unit to one of them).
- **Batch vs per-serving**: a `Recipe` has **no** `batch` flag — only `servings` + ingredient
  `quantity`. `servings = N` means the quantities are totals for N servings ("batch");
  `servings = 1` means per single serving. The import wizard's batch toggle only chooses which
  representation to store; nothing persists "was this a batch".

## Import architecture (important)
- Recipe parsing is **pure TypeScript** (`lib/recipe-scraper.ts`). It replaced an old Python
  subprocess (`scripts/web_import_handler.py`) that crashed on Vercel with
  `spawn .../python3 ENOENT`. **Never reintroduce `child_process`/Python in API routes.**
- "Learn from past imports" is **DB-backed** via two Prisma tables — `IngredientNameMapping`
  (remembers manual ingredient→grocery-item mappings, keyed by lowercased raw name) and `UnitRule`
  (remembers unit-conversion choices, keyed by `"ingredientname|foreignunit"`). They are read in
  `app/api/import/parse` (`loadIngredientNameMappings()` / `loadUnitChoices()`) and upserted in
  `app/api/import/confirm` (`saveIngredientMappings()` / `saveUnitRules()`). Because these are
  Postgres writes, **learning works in production on Vercel** (Neon is writable) — this replaces
  the old `data/ingredient_name_mappings.json` / `data/unit_choices.json` files, which no longer
  exist. Two caveats: (1) a mapping is only saved when the user flags it (`saveMapping`) during the
  Resolve step — auto/similar matches aren't learned; (2) these only affect **future** imports at
  parse time — they never retroactively fix an already-imported recipe (edit those in place).

## Deployment constraints
- Vercel serverless FS is read-only except `/tmp`. Never write to `public/` or repo files at
  request time — image writes won't persist. Use blob storage for uploads instead.

## Conventions
- UI copy: Romanian. Match the surrounding component's Tailwind classes & dark-mode tokens
  (`dark:bg-[#1f1f1f]`, `#2a2a2a` inputs, `#e3e3e3` text, orange-500 accent).
- Releases: `/release <version>` bumps root `CHANGELOG.md` + `webapp/package.json` and commits.
  **Root `CHANGELOG.md` is canonical**; `webapp/CHANGELOG.md` is stale — ignore it.
