# Changelog

## [1.3.1] — 2026-10-27

### 🎨 UI / UX
- **Shopping list emojis** — each aisle shows its emoji again (🥕 Fruit & veg, 🥚 Dairy, 🥩 Meat & fish, …) in the section headers, the section chips and the shared text; Added by you / At home / In cart get ✍️ / 🏠 / 🛒.
- **Selected chips** — orange chips and pills (recipe filters, shopping-list sections, meal and day pickers, recipe form, plan history) use dark text instead of white.

## [1.3.0] — 2026-10-27

### ✨ Features
- **Add meal on several days** — the Add meal sheet has a row of the week's days: pick one or more, and + puts the recipe on each of them for the chosen meal ("Add to 3 days"). The tick takes them all out again.
- **Copy a planned meal** — tap a meal in the plan: next to Move to there's Copy to, where you pick several days and meals ("Add 5 copies", same servings). The slot it already sits in is skipped.
- **Fractional servings steps** — a recipe's "− / + count in steps of" takes 0.5 or 0.25, so the steppers on the recipe page and in the plan move in quarters or halves. Servings keep two decimals (1.25).

### 🎨 UI / UX
- **Bottom sheets close when dragged down** by their grab bar on phones; a short or slow pull springs back.
- **Recipes used inside a recipe** start open on the recipe page.
- **Desktop plan cards** show a photo strip on top, with a smaller remove button over it.
- **Desktop sidebar** uses the same icons as the mobile tabs.

### ⚙️ Internals
- `Recipe.servingsStep` is now a Float (migration `20261027000000_recipe_decimal_servings_step`, already applied on Neon). `addToWeekPlanSlots` / `removeWeekPlanEntries` add or remove several plan entries in one transaction. `useSheetDrag` + `SheetGrabber` in `components/Sheet.tsx`.

## [1.2.4] — 2026-10-27

### 🐛 Fixes
- **Recipe import CLI** (`webapp/scripts/import-recipe.mts`) — strips surrounding quotes from `.env.local` values, like dotenv. The quoted `BLOB_READ_WRITE_TOKEN` was sent with its quotes, so Vercel Blob rejected it ("Access denied") and recipe photos fell back to `public/images/recipes/`. Photos from CLI imports now go to Blob again.

## [1.2.3] — 2026-10-27

### ⚙️ Internals
- Photos for the 8 recipes imported from the "Plant-Powered 7-Day Meal Plan" PDF (Berry Chia Pudding, Healthy Glow Smoothie, Blackberry Pancakes, Buffalo Cauliflower Wraps, Hidden Veggie Mac & Cheese, Butternut Squash & Lentil Curry, Apple Walnut Salad, Fudgy Sweet Potato Brownies), added under `webapp/public/images/recipes/` because the Vercel Blob upload was refused. No app changes.

## [1.2.2] — 2026-10-26

### ⚙️ Internals
- Session context dumps for the Oct 25–26 webapp work (`.claude/context/`, with `LATEST.md` pointing at the newest) and `.claude/launch.json`, which starts the webapp dev server for the preview pane. No app changes.

## [1.2.1] — 2026-10-26

### ✨ Features
- **Recipe macros** — tap the kcal tile on a recipe to open a sheet with a donut chart of the calorie share from carbs, fat and protein (4/9/4 kcal/g), plus grams and percentages per serving.

### 🎨 UI / UX
- **Recipe action bar** — Cook (when on) and Add to plan use the light orange tint of the bottom navigation's active tab instead of a solid orange fill.

## [1.2.0] — 2026-10-26

### 🎨 UI / UX
- **Recipe page** — no bottom tabs, as in the prototype: the Cook / Add to plan bar sits at the bottom of the screen (with room for the home indicator) and you leave through the back button. The "Added to plan" toast sits just above the bar.
- **Recipes list** — the sticky bar keeps the search box and the chips on two lines while you scroll; the compact one-line version (search icon + chips) is gone. Tapping a chip brings the results to just below the bar.

## [1.1.0] — 2026-10-26

### ✨ Features
- **Add recipes** — the "+" in Recipes, Add recipes in the desktop planner's panel and "Import recipes" under More open one sheet: paste recipe links with notes in plain words ("2 servings, no cilantro"), describe a recipe and let AI write it, paste a recipe's text, or upload a photo or PDF of one. Each source is read on its own with its own progress. Ingredients are matched to your grocery items and only the uncertain ones become questions (pick one of up to 3 matches, add it as new, or search; conversions ask for the total, e.g. "8 piece = ? g"). Fixed conversions (tbsp → tsp, cup → ml) apply without asking, and "Remember" keeps a choice for future imports. Nothing is saved until "Add"; closing after adding from More goes to Recipes.
- **Ingredients named after your grocery items** — with AI on, Claude gets your item list and uses an item's exact name when it's the same product, so "fresh ground black pepper" lands on Black Pepper and "canned chickpeas" on Chickpeas Tinned instead of becoming new items.
- **Recipes list** — Sort opens a "Sort by" sheet; Select mode has an Edit / Delete bar that acts only on the selected recipes still visible; batch edit is a sheet where every field can stay "As is". The header has a single "+".
- **Desktop planner** — from `lg` up, a recipes panel sits beside the week: drag a recipe into a slot, click a recipe and then a slot ("Add here"), or click a slot to pick a recipe. The header links to the shopping list.

### ⚙️ Internals
- New `app/api/import/ai` route (one source per request, `maxDuration` 60) over `lib/ai-import.ts`: Claude Opus 5.5 with structured output, the grocery item names sent as a cached system block. Without `ANTHROPIC_API_KEY`, links and text fall back to the scraper and parser. The AI paths need `ANTHROPIC_API_KEY` in Vercel (Production).
- `lib/units.ts` holds the standard conversion table (shared with the import wizard); `lib/recipe-scraper.ts` exports `browserHeaders`, `normalizeUnit` and `isUnsupportedHost`. Sheet / Switch / Segmented moved into `components/Sheet.tsx`; the old batch edit modal is gone. The `/recipes/import` wizard stays, without a link in the app.

## [1.0.0] — 2026-10-25

Mobile-first redesign of the whole app, following the clickable prototype.

### ✨ Features
- **Navigation** — four bottom tabs (Recipes, Plan, Shop, More); Ingredients, Import and Settings live under the new More page. Recipe pages show loading skeletons instead of a blank screen.
- **Recipes** — the whole list loads once and search, category chips and sort run on the device (no request per keystroke). Search needs every word and ignores diacritics; a category chip matches the exact tag. List or grid layout is remembered, filters come back when you return to the tab, and a "Cooked this season" row sits on top.
- **Recipe page** — hero photo, sticky Ingredients / Steps tabs, a servings card with batch pills, kitchen fractions (½ tsp, ⅓ cup), Cook mode with bigger text and the screen kept on, the source link at the bottom and a sticky action bar. **Add to plan** opens a sheet that can pick several days and next week at once.
- **Planner** — one request per week (about 4× faster), a day-by-day agenda on phones, add and entry sheets, Undo after Remove, and drag between slots on desktop. Nutrition totals add up on the device.
- **Shopping list** — grouped by aisle with sticky chips that follow the scroll, one line per product with all its units, counted items rounded up (⅓ onion → 1). Pantry staples (salt, oil, dried spices…) go under "Probably at home"; ticked items move to "In the cart". Quick add, share, and items you add yourself grouped under "Added by you". Mark a staple from Ingredients ("At home" column or the item's switch).
- **Recipe editor** — full screen with Cancel / Save (asks before discarding changes). Sections are cards; ingredients are tappable rows edited in a sheet (item search, amount accepts 1/2 or 1½, the item's own units, note, move to another group) and reordered by dragging. Steps are edited one by one in section cards — Enter starts the next step, a pasted method splits into steps — or as plain text (`#` = section, numbering dropped). Deleting asks inline.

### 🐛 Fixes
- Saving a recipe imported from Notion clears the empty "Ingredients / Steps / Method / Enjoy!" headers above its steps, and its "For the …" headers become the ingredient group names (as the recipe page already showed them). Unnamed groups no longer get "Group 2" written into the database.

### ⚙️ Internals
- New column `GroceryItem.pantryStaple` (already applied on Neon; 36 items marked). `getPlannerData` replaces the planner's four separate actions; `getGroceryList` returns merged `ShoppingLine`s; `getRecipeIndex` / `getCookedThisSeason` feed the recipe list.
- The recipe form is split into `components/recipe-form/*` with step parsing in `lib/steps.ts`. The search alias (`nameRo`) is no longer edited by hand: the server keeps it and re-translates when the title changes.
- `middleware.ts` renamed to `proxy.ts` (Next 16 convention); the login gate is unchanged.

## [0.37.0] — 2026-10-25

### ✨ Features
- **`/import-recipe` fixes recipes that already exist** — when a link was imported before, Claude compares the recipe in the app with the source page and, if it's wrong (wrong products, "1 g" roots, missing steps), rewrites it in place. The recipe keeps its id, so planner entries and recipes that use it stay linked.

### ⚙️ Internals
- `ConfirmedRecipe.replaceRecipeId` in `lib/import.ts` (CLI importer only; the wizard doesn't send it): replaces the recipe's fields, ingredients, instructions and references in one transaction. `scripts/import-recipe.mts check` validates the target recipe and no longer flags it as its own duplicate.

## [0.36.0] — 2026-10-24

### ✨ Features
- **`/import-recipe` Claude Code skill** — give Claude recipe links (or pasted text) and it imports them straight into the app: it scrapes each page (or reads it itself when the site blocks the scraper), matches ingredients to your grocery items, converts units to the item's units, asks only about the genuinely ambiguous choices in one go, shows a summary and imports after you confirm. It can also import a sub-recipe (e.g. a guacamole) and use it inside another recipe.

### 🐛 Fixes
- Imported recipes now get their search text (and the Romanian title, when given) — before, the import wizard left them empty, so search could only find them by their exact English name.

### ⚙️ Internals
- The import wizard's matching and saving moved from `app/api/import/parse` and `app/api/import/confirm` into `lib/import.ts`, shared with the new CLI importer `scripts/import-recipe.mts` (`parse-urls`, `match`, `items`, `meta`, `check`, `import`). The wizard behaves as before. The CLI writes to the database in `webapp/.env.local` (production Neon).

## [0.35.0] — 2026-10-24

### ✨ Features
- **Use a recipe inside another recipe** — e.g. puff pastry in a pie. In the recipe form, "Add recipe" next to "Add group" searches a recipe and sets the amount (servings or grams); self-references and loops are refused with a message. On the recipe page each reference renders as a collapsible ingredient group with an amount badge that scales with the servings control and a link to the referenced recipe; nested references are expanded in. Referenced ingredients count toward the nutrition box, the grocery list and planner nutrition.
- A recipe used inside another can't be deleted (single or bulk) — the delete names the recipe that uses it instead of failing silently.

### ⚙️ Internals
- New `RecipeReference` table (`recipeId`, `refRecipeId`, `quantity`, unit `serving` | `g`, `groupOrder`); `lib/recipe-refs.ts` flattens the reference graph (depth-limited, cycle-safe). Already applied on Neon with `npx prisma db push`, together with v0.34.0's `WeekPlan.servings` → double precision.

## [0.34.0] — 2026-10-23

### ✨ Features
- **Decimal servings** — the editable servings number accepts one decimal (`1.5` or `1,5`) on the recipe page, planner slot cards, the planner's add-recipe modal and the Add to planner modal. Values round to a tenth (min 0.1). − / + still snap to whole numbers (or the recipe's step); − never drops below 1 from a value ≥ 1 and leaves a typed 0.5 as it is. The recipe form's batch size stays an integer.

### ⚙️ Internals
- `WeekPlan.servings` is now `Float` (integer → double precision; existing values are kept). Run `npx prisma db push` on Neon — until then, saving a decimal servings value in the planner fails (whole numbers still work).

## [0.33.0] — 2026-10-06

### 🐛 Fixes
- **Text import no longer creates empty recipes** — a pasted recipe starting with `=== Title ===` only read `[qty unit] name` ingredient lines, so plain lines like `500g flour` (the format shown in the import page's own placeholder) were silently dropped. The `===` format now also accepts plain ingredient lines, `# Group` headers (`# Ingredients` = unnamed group), `## Steps` headers with numbered or bulleted steps, and `Categories:` / `Batch:` (also `Servings: 4 Batch: True` on one line). The legacy bracket format parses exactly as before.

## [0.32.0] — 2026-10-05

### ✨ Features
- **Type servings directly** — the number between the − / + steppers is now editable (Enter or blur saves, Escape cancels, invalid input reverts). Works on the recipe page (main control + Add to planner modal), on planner slot cards (desktop + mobile) and in the planner's add-recipe modal.
- **Per-recipe servings step** — a new "Step" field in the recipe form sets how far − / + move (snapped to multiples of the step); typed values stay unrestricted.

### ⚙️ Internals
- New nullable column `Recipe.servingsStep` (migration `20261002000000_add_recipe_servings_step`) — run `npx prisma migrate deploy` on Neon before deploying.

## [0.31.0] — 2026-10-05

### ✨ Features
- **Bulk-add products to the shopping list** — "Paste a list" next to *Add product* adds many hand-added products at once from pasted lines (quantities and units are read from each line). Products already in the week are skipped, and the toast offers Undo. Replaces the earlier bulk add on the Ingredients page.
- **Copy to another week via a week picker** — copying selected "Other" products now opens a week picker and writes them straight into the chosen week (no more clipboard + Paste). Duplicates are skipped and the toast offers Undo.
- **Delete selected products** — Select → Delete, behind an inline confirmation, with rollback if it fails.
- **Quantity steppers** — − / + buttons on the product quantity box (whole units, 0.1 below 1); typing still works.

### 🐛 Fixes
- Recipe import parses ASCII fractions (`1/2`, `1 1/2`) and trailing units correctly.

### ⚙️ Internals
- revolut-notion (separate app): duplicate detection, month views, CSV and matching improvements.
- Added the `dump` / `prime` Claude commands, session context files and a unit-weights backup.

## [0.30.0] — 2026-10-04

### ✨ Features
- **AI "Match all" in the Audit page** — match all unmatched items in one go, plus user-defined grocery categories.
- **Audit page category section** — categories are unified and shown with their emoji.
- **Copy grocery products between weeks** — Select / Copy / Paste for hand-added products; Copy appears only while a selection is active.
- **Dedicated drag handle on planner cards** — dragging no longer conflicts with swiping.
- **Single sticky search section** — the input and filters share one sticky section that minimizes when empty; the search chip scrolls to the top and focuses the input, and the bar stays maximized as a fixed header while a query is active (no scroll shift).

### 🐛 Fixes
- Category picker in the Audit page was unreachable on mobile.
- Duplicate categories in the ingredients filter are unified.
- iOS long-press text selection no longer hijacks the planner drag handle.

### 🎨 UI / UX
- iOS-style share glyph instead of the Android share icon.
- Search bar minimizes ~40px after sticking, with a smoother transition and a fixed focus ring.

### ⚙️ Internals
- Track the generated `GroceryCategory` Prisma model.
- Added the separate `revolut-notion/` app (Revolut screenshot → Notion importer) to the repo.

## [0.29.2] — 2026-07-23

### 🐛 Fixes
- **Search fără „snap" pe mobil** — cât timp căutarea e deschisă, bara de filtre devine un header `fixed` (ancorat sus), decuplat de scroll. Filtrarea la puține rezultate nu mai clampează scroll-ul și nu mai smucește bara spre top: rămâne pe loc, rezultatele se actualizează dedesubt. Căutarea rămâne maximizată cât ai un query activ și se resetează pe X. Desktop-ul e neschimbat.

## [0.29.1] — 2026-07-23

### 🐛 Fixes
- **Search sticky rămâne maximizat** — când ai o căutare activă, revenirea sus și scroll din nou în jos re-afișează input-ul (bara maximizată), nu doar iconița.
- **Fără spațiu gol scrollabil** — s-a eliminat `min-h-[100dvh]` de pe containerul de rezultate, care lăsa o zonă goală scrollabilă sub listele scurte; înălțimea paginii urmează acum rezultatele reale.

## [0.29.0] — 2026-07-23

### ✨ Features
- **Filtre multi-select pe Recipes** — chip-urile de categorie sunt acum toggle-uri multi-select: poți selecta mai multe tag-uri deodată, iar o rețetă apare dacă are *oricare* dintre ele (OR). Favorites e toggle real, „All" resetează. Selecția e ținută în URL ca listă (`?cat=Breakfast,High Protein`).
- **Search sticky care se mărește** — în modul sticky, apăsarea pe search mărește bara și afișează input-ul (cu textul căutat) deasupra chip-urilor, ca filtrele să rămână vizibile — în locul overlay-ului care acoperea chip-urile.
- **Buton de share pentru rețete** + rută publică `/r/[id]` pentru preview bogat la link-urile partajate.
- **Chip-urile de filtrare reflectă categoriile reale** ale rețetelor (orice categorie nouă apare automat).

### 🐛 Fixes
- Cantități de ingrediente cu precizie zecimală fină (ex. `0.0625`) și păstrarea preciziei la rescalare.
- La crearea unui ingredient nou cu altă unitate, se oferă conversia de unitate.
- Ordinea acțiunilor din formularul de editare rețetă, corectată.
- Alinierea primelor rezultate sub bara sticky când cauți în timp ce ești derulat.
- Eliminat flicker-ul barei sticky de filtre când filtrarea lasă puține rezultate.

### 🎨 UI / UX
- **Grocery list consistent cu rețeta** — checkbox-urile + label-urile din lista de cumpărături arată identic cu cele de ingrediente din rețetă (casetă 24px, aceeași bifă, orange-400). Item-ele bifate rămân lizibile (fără estomparea la 40% opacitate), ca să vezi ce ai cumpărat.
- Text mai mare la ingrediente & instrucțiuni pe pagina de rețetă.
- Chip-uri de filtrare mai mari + carduri de rețetă pe 2 coloane mai lizibile.
- Butonul de import aliniat la stilul icon-button (share/edit/planner).

## [0.28.0] — 2026-07-22

### ✨ Features
- **Editare în masă a rețetelor** — în modul de selecție din pagina Recipes apare acum butonul „Edit N", care deschide un modal de batch edit. Fiecare câmp are un toggle de activare, așa că se modifică doar câmpurile pe care le activezi — restul rămân neatinse pe fiecare rețetă. Editabile: **favorite**, **time**, **difficulty**, **categories** (moduri add / remove / replace) și **source URL**. Acțiune nouă `updateRecipesBatch` (scalari prin `updateMany`; add/remove la categorii îmbină tag-urile fiecărei rețete, totul într-o tranzacție).

## [0.27.0] — 2026-07-22

### ✨ Features
- **Planner — drag-and-drop pe mobil** — ține apăsat (long-press) pe o rețetă și trage-o într-un alt slot de masă al zilei afișate (ex. Breakfast → Lunch). Secțiunile de masă de pe mobil sunt acum zone „droppable" cu evidențiere la hover; cardurile din slot sunt draggable doar pe mobil (desktopul rămâne neschimbat). Acțiune nouă `moveWeekPlanEntry` cu update optimist + rollback + toast la eroare.

### 🎨 UI / UX
- **Planner** — swipe-to-delete rămâne ca scurtătură (înghețat în timpul drag-ului); iconița de coș din rândul cardului a devenit un `✕`, afordanță de ștergere vizibilă păstrată.
- **Recipe detail — ingrediente mai vizibile** — checkbox mărit (16 → 24px) cu bifă mai mare, text 15px, zonă de tap ≥44px (`py-2.5`) cu feedback la apăsare și spațiere care nu mai permite atingerea a două rânduri deodată.

## [0.26.0] — 2026-07-22

### ✨ Features
- **English UI** — the entire interface was translated from Romanian to English: navigation, recipes, planner, grocery list, ingredients, the import wizard, settings, and all user-facing error messages. `lib/labels.ts` was simplified (display labels are now near-identity over the already-English DB values; `groceryCategoryLabel` just strips the emoji prefix). Stored DB values, `?cat=` filters and comparisons are untouched.
- **Manual grocery-list items** — add products by hand to a given week, alongside the ones generated from the planner.
- **Ingredients table/list view** — toggle between the editable table and a compact card list.

### 🐛 Fixes
- Nutrition and import flow fixes.

### 🎨 UI / UX
- **Planner** — week days now fill the full width on mobile (7 equal columns instead of a scrolling row).
- **Recipes** — the "New recipe" button is now a compact "+" icon.
- **Recipe detail** — "Add to planner" and "Edit" are now icon buttons.
- Dates use the `en-US` locale; day abbreviations are Mon–Sun.

### ⚙️ Internals
- Docs (`CLAUDE.md`, `webapp/UX_CONVENTIONS.md`) updated to state the UI is English and to describe the label helpers' new role.

## [0.25.0] — 2026-07-21

### ♿ Accesibilitate & mobil
- **Ținte tactile mărite (long-tail)** — butoane de închidere, toggle favorite, „Adaugă în planner"/„Editează", stepperele din modale, comutatorul de temă, chip-urile de categorie, butonul de adăugare masă.
- **Navigație accesibilă** — etichetele din bara de jos + sidebar traduse în română, `aria-current` pe pagina activă, contrast îmbunătățit pe etichetele inactive, `aria-label` pe săgețile de navigare între săptămâni.
- **Tastatură numerică pe mobil** — `inputMode="decimal"` pe câmpurile numerice (cantități, conversii, nutriție).
- Shell-ul folosește `100dvh` în loc de `100vh` — fără conținut tăiat de bara browserului pe mobil.

### 🐛 Fixes
- **Favorite fără eșec silențios** — toggle-ul de favorite face rollback dacă salvarea eșuează.
- **Stare de gol corectă** — filtrul „Favorite" fără rezultate arată „Încearcă o altă căutare", nu „Adaugă prima ta rețetă".
- **Rute API mai robuste** — `search-items` prins în try/catch; `nutrition` nu mai scurge mesajul intern de eroare către client; upload-ul de imagine din import are limită de dimensiune (10MB).
- **Confirmare la deconectare** — evită sign-out accidental pe mobil.

## [0.24.0] — 2026-07-21

### 🎨 UI / UX
- **Tabelul de ingrediente, utilizabil pe mobil** — sub `md`, tabelul de 13 coloane (scroll orizontal, celule minuscule) e înlocuit cu o listă de carduri: nume + traducere · categorie · unitate, plus macro-uri (kcal / P / C / G); tap pe card deschide editorul. Tabelul complet rămâne pe desktop.
- **Audit unități** — coloanele de context (Folosiri, Exemple rețete, Unitățile produsului) se ascund pe mobil, ca tabelele să încapă fără scroll orizontal.
- Header-ul și bara de filtre din Ingrediente se împachetează pe ecrane înguste.

## [0.23.0] — 2026-07-21

### 🌍 i18n / UI
- **Interfața complet în română** — planner, listă de cumpărături, detaliu rețetă, listă rețete, ingrediente și formularul de rețetă au fost traduse (titluri, butoane, placeholdere, mesaje, capete de tabel, stări goale, nutriție). Datele apar acum localizate (`ro-RO`, ex. „20 iul.").
- **Etichete vs. valori (fără regresii)** — categoriile, tipul de masă (`mealType`) și dificultatea rămân stocate în engleză (filtrarea, URL-urile `?cat=` și rețetele existente nu se schimbă), dar se afișează în română printr-un modul comun de etichete (`lib/labels.ts`: `mealLabel`/`categoryLabel`/`difficultyLabel`/`groceryCategoryLabel`).

### 📄 Docs
- `webapp/UX_CONVENTIONS.md` — regulile UX & i18n pentru dezvoltare (mobil-first & touch targets, fără eșecuri silențioase, map-urile de etichete pentru valorile-DB, anti-flash temă, imagini pe blob), cu pointer în `CLAUDE.md` ca să fie respectate la update-urile viitoare.

## [0.22.0] — 2026-07-21

### 🎨 UI / UX
- **Fără flash de temă la pornire** — un script inline aplică tema (dark/light) înainte de primul paint, oglindind logica din ThemeProvider; nu mai apare clipirea albă la cold-load, mai ales în PWA-ul instalat pe dark.
- **Ținte tactile mai mari pe mobil** — stepperele de porții (detaliu rețetă + planner) 28→40px, săgețile de navigare a săptămânilor ~44px (planner + listă cumpărături), rândurile de bifare din lista de cumpărături mai înalte.
- **Selecție rețete pe mobil** — în modul selecție, tap pe card selectează rețeta în loc să o deschidă (pe mobil nu există hover pentru checkbox).
- **Ștergere vizibilă în planner pe mobil** — buton de ștergere mereu prezent pe card (swipe-ul rămâne scurtătură).
- **Import pe mobil** — comparația „Din text / Se importă" se stivuiește vertical în loc să trunchieze pe două coloane.

## [0.21.0] — 2026-07-21

### 🐛 Fixes
- **Grila de rețete nu mai poate fi dărâmată de o imagine remote** — cardurile trimit URL-urile locale/blob prin `next/image` și orice host remote neconfigurat printr-un `<img>` simplu, deci o singură copertă scrapuită nu mai prăbușește toată lista (ecranul principal pe mobil).
- **Upload imagine în wizardul de import** — mutat pe Vercel Blob (ca uploadul de copertă din v0.19); eșecul e acum vizibil în UI, nu tăcut.
- **Importul nu mai stochează base64 în DB** — coperțile inline se urcă pe blob; dacă nu se poate, se renunță la imagine (null) în loc să persiste string-ul base64.
- **Planner fără eșecuri tăcute** — adăugarea/ștergerea/schimbarea porțiilor fac rollback la starea anterioară și arată un mesaj dacă salvarea eșuează; un add eșuat nu mai lasă un card „fantomă" cu id temporar.
- **Editarea inline din Ingredients** — o salvare eșuată revine la valoarea veche + mesaj (înainte părea salvată dar nu era).
- **Modale fără spinner blocat** — „Adaugă în planner" (din rețetă și din slotul de planner) și editorul de produs tratează erorile: butonul nu mai rămâne blocat în spinner, apare un mesaj.
- **Fără spinner infinit la încărcare** — planner / listă cumpărături / ingrediente nu mai rămân blocate pe „se încarcă" la eroare; lista de cumpărături arată „Reîncearcă".
- **Nutriția din rețete se împrospătează** — editarea unui produs (kcal, unități) revalidează paginile de rețetă și lista de cumpărături.
- **Coperta nu se mai pierde** — Save în editorul de rețetă e blocat cât timp se încarcă imaginea.

### ⚙️ Internals
- Ambele rute de upload (`/api/upload-recipe-image`, `/api/import/upload-image`) și fallback-ul base64 din import folosesc Vercel Blob când `BLOB_READ_WRITE_TOKEN` e setat (store trebuie **public**), cu fallback pe filesystem în dev.

## [0.20.0] — 2026-07-21

### 🐛 Fixes
- **Fără pierdere de date la editarea/crearea rețetei** — `updateRecipe`/`createRecipe` rulează acum într-o tranzacție (`$transaction`): update-ul, ștergerea și recrearea ingredientelor/instrucțiunilor sunt all-or-nothing. O eroare la mijloc (timeout Neon, funcție serverless rece) nu mai poate goli o rețetă.
- **Import atomic per rețetă** — fiecare rețetă importată (rețetă + ingrediente + instrucțiuni + produse noi) se comite integral sau deloc; la eșec în mijloc, răspunsul spune câte rețete au reușit, ca să știi de unde reiei.
- **Ștergerea unui produs folosit e blocată** — un produs folosit în rețete nu mai poate fi șters (înainte lăsa tăcut ingrediente fără nume în rețetele partajate). Modalul și ștergerea în masă arată clar în câte rețete e folosit.
- **Lista de cumpărături nu mai adună unități diferite** — cantitățile aceluiași produs în unități diferite (ex. 200 g + 1 cup) apar ca linii separate, nu însumate greșit într-un total fără sens.
- **Validare porții în planner** — porții 0/negative/NaN sunt normalizate la minim 1 (înainte ascundeau ingrediente din listă sau produceau nutriție negativă).
- **Filtrele Recipes nu mai sparg URL-ul** — link-urile de categorie codifică acum `q` (o căutare cu `&` sau `#` nu mai rupe adresa) și păstrează sortarea aleasă.

### 🎨 UI / UX
- **Iconițe custom în navigație** — BottomNav (mobil) și Sidebar (desktop) folosesc iconițe `.webp` proprii în locul celor lucide.
- **Protecție la pierderea muncii** — formularul de rețetă avertizează (`beforeunload` + confirmare la „Cancel") când ai modificări nesalvate; progresul din wizardul de import se păstrează la refresh/back (sessionStorage); bifele din lista de cumpărături persistă per săptămână (localStorage).
- **Acțiuni în masă (Ingredients)** — selecția se golește la schimbarea filtrului (nu mai lovesc rânduri ascunse) și butoanele nu mai rămân blocate în „busy" la eroare.

### ⚙️ Internals
- Tranzacții interactive Prisma pentru scrierile multi-pas (rețete + import); `deleteGroceryItem`/`deleteGroceryItems` verifică referințele înainte de ștergere.
- `RecipesGrid`: modul de vizualizare mutat pe `useSyncExternalStore` (localStorage + eveniment `viewchange`) — corect la mount, fără hydration mismatch.
- Iconițe noi în `public/icons/*.webp`.

## [0.19.0] — 2026-07-20

### ✨ Features
- **Retheme „Orange & Teal"** — neutrele au trecut de la gri pur la un gri **cald („Sand")**, mai apetisant și mai coerent cu portocaliul, plus un accent secundar **teal** (linkuri/acțiuni secundare). Aplicat central: remap al scalei `gray` din Tailwind (`@theme`) + tokenuri light/dark actualizate în `globals.css`; portocaliul rămâne brand.
- **Selecție multiplă pe pagina Recipes** — buton „Select" pe bara de filtrare (mobil + desktop) care activează checkbox-urile pe fiecare rețetă (înainte apăreau doar la hover, deci invizibile pe mobil); selectare totală + ștergere în bloc.
- **Filtrele Recipes rămân setate** — căutarea/categoria/favorite/sortarea se rețin (sessionStorage) și se restaurează când revii pe `/recipes` din back, sidebar sau „înapoi la rețete".
- **Sugestie AI pentru conversie** — la introducerea unei a 2-a unități, un buton „✨ Sugestie AI" estimează factorul de conversie (ex. 1 cup ≈ 123 g). Disponibil în cardul de ingredient, în editorul de rețetă și în ecranul Audit unități.
- **Upload imagine rețetă cu drag-and-drop** — tragi imaginea direct în chenar (sau peste preview pentru înlocuire), cu validare de tip/mărime și mesaje clare.

### 🐛 Fixes
- **Upload imagine rețetă pe producție** — pe Vercel filesystemul e read-only, deci scrierea în `public/` eșua tăcut (500). Mutat pe **Vercel Blob** (persistent), cu fallback pe filesystem în dev și erori clare în client.
- **Ingredients** — X pentru golirea căutării; categoria editabilă ca dropdown și în tabel (nu doar în card); iconița de edit mutată pe prima coloană (mai ușor pe mobil).

### 🎨 UI / UX
- Footer-ul cardului de ingredient rearanjat: **Șterge** izolat în stânga, **Anulează + Save** grupate în dreapta (mai puțin mis-tap pe mobil).

### ⚙️ Internals
- `next.config`: `images.remotePatterns` pentru `*.public.blob.vercel-storage.com`; dependință nouă `@vercel/blob` (necesită `BLOB_READ_WRITE_TOKEN` pe Vercel).
- `globals.css`: scala `gray` remapată la „Sand" via `@theme` + token nou `--color-secondary` (teal, light/dark).

## [0.18.0] — 2026-07-20

### ✨ Features
- **Căutare bilingvă (RO/EN) + fără diacritice pentru rețete** — căutarea din pagina de rețete și din planner găsește acum rețetele indiferent de limba în care scrii și indiferent de diacritice: „supa" sau „pui" găsesc rețete cu titlu în engleză (ex. „Chicken Soup", „Big Greek Salad with Grilled Chicken"). Fiecare rețetă a primit un titlu tradus în cealaltă limbă (folosit doar la căutare) și un câmp normalizat pe care se face matching-ul. Cele ~199 de titluri existente au fost traduse; rețetele noi sau editate sunt traduse automat la salvare (Claude Haiku, best-effort — degradează elegant fără cheie API).

### ⚙️ Internals
- `Recipe`: câmpuri noi `nameRo` + `searchText` (aplicate pe Neon). Utilitar `lib/search.ts` (`normalizeSearch` / `buildRecipeSearchText`, folosit identic la stocare și la interogare). `createRecipe`/`updateRecipe` populează ambele câmpuri; `getRecipes` / `searchRecipesForPlanner` / `getRecipesPanel` fac match pe `searchText`.

## [0.17.0] — 2026-07-20

### ✨ Features
- **Referințe în cardul de ingredient** — la editarea unui ingredient (`/ingredients`) apare secțiunea „Folosit în", cu rețetele care-l folosesc, ca chip-uri clickabile care duc direct la rețetă.
- **Taguri libere în editorul de rețetă** — pe lângă categoriile predefinite, un chip „+ Tag" la coada listei permite adăugarea de categorii proprii (deocamdată pentru organizare/căutare, fără afișare separată).
- **Management în masă al ingredientelor** — selectare multiplă în tabelul `/ingredients` (inclusiv „tot ce e vizibil"), ștergere în bloc și setare de categorie pentru mai multe produse deodată.

### 🎨 UI / UX
- **Audit unități rafinat** — se listează doar produsele a căror nutriție chiar contează (au kcal/proteine setate), cu unitățile problematice afișate explicit și link direct la produs/rețetă.

### ⚙️ Internals
- Acțiuni noi `getRecipesUsingGroceryItem`, `deleteGroceryItems`, `setGroceryItemsCategory`.
- Script one-off `scripts/merge-categories.ts` (dry-run + `--apply`, cu backup JSON) pentru unificarea/redenumirea categoriilor de ingrediente.

## [0.16.0] — 2026-07-20

### ✨ Features
- **Nutriție corectă pe unități „la bucată"** — calculul de nutriție (planner + detaliu rețetă) convertește acum cantitatea în grame după **unitatea ingredientului** (g/ml direct, a 2-a unitate cu conversie, sau greutate pe bucată `unitWeight`), nu doar după unitatea primară a produsului. „1 avocado" / „1 chicken breast" nu mai era socotit ca „1 gram". Logică comună extrasă în `lib/nutrition.ts`.
- **Ecran „Audit unități"** (`/ingredients/audit`) — listează produsele folosite la bucată fără greutate (cu completare `g/buc` pe loc, care se propagă automat în toate rețetele care le folosesc) și nepotrivirile de unitate (cu link la rețetă). Permite repararea în masă a erorilor sistematice după un import, fără editare rețetă cu rețetă.
- **Editor rețetă îmbunătățit** — dificultate „Hard" (+ păstrarea oricărei valori din import care nu e în listă), reordonare ingrediente în cadrul unui grup (săgeți sus/jos) și editare directă a produsului (unități + nutriție) din editorul rețetei, chiar când produsul are deja 2 unități.

### 🐛 Fixes
- **Import — produse noi „la bucată"** — un „1 chicken breast" care creează un produs nou primește acum unitatea `piece` (nu `g`/fără unitate), ca să poată avea greutate pe bucată și nutriție corectă. Extinde fix-ul din 0.15.0 de la produsele existente la cele nou create.
- La editarea nutriției unui produs din editorul de rețetă, unitatea deja aleasă a ingredientului nu mai e schimbată tăcut dacă rămâne validă.

### 🎨 UI / UX
- Avertisment la pasul de import pentru unitățile nerezolvate (se importă ca „piece"), cu trimitere către „Audit unități".

### ⚙️ Internals
- Script one-off `webapp/scripts/fix-piece-unitweights.ts` (dry-run + backup JSON + `--apply`, idempotent) pentru completarea `unitWeight` la produsele folosite la bucată.
- Actualizată nota din `CLAUDE.md`: „learn from past imports" e acum DB-backed (`IngredientNameMapping` / `UnitRule`) și funcționează în producție — nu mai depinde de fișierele JSON locale.

## [0.15.0] — 2026-07-20

### ✨ Features
- **Acces controlat cu login** — aplicația e protejată integral de un ecran de autentificare (Auth.js v5, provider Credentials, sesiuni JWT). Conturi predefinite (fără signup public), create prin seed; middleware care blochează toate rutele mai puțin `/login`, `/api/auth/*` și asset-urile statice.
- **Erori de import mai clare la URL** — detecție a link-urilor video/social (Instagram, YouTube, TikTok…) cu mesaj dedicat; diferențiere între site blocat (403/Cloudflare), timeout și „fără rețetă structurată"; `maxDuration=30` pe ruta de parse pentru site-uri lente.

### 🎨 UI / UX
- **Bară de filtre sticky pe mobil** — la scroll, bara de căutare + chip-uri rămâne fixată sus, cu căutarea transformată într-un chip; tranziție lină la fixare; chip-urile pe un singur rând scrollabil.
- **Spațiu între bara de filtre și grila de rețete pe desktop** — bara nu mai e lipită de carduri.
- **Tag de categorie în vizualizarea listă pe mobil.**

### 🐛 Fixes
- **Import — unitate lipsă pe produse măsurate în greutate** — o cantitate fără unitate (ex. „1 chicken breast") potrivită cu un ingredient măsurat doar în g/ml era importată tăcut fără unitate; acum e tratată ca „piece" și cere conversia la pasul de resolve (cu sugestie AI + salvare ca `UnitRule`), în loc să ajungă în DB fără unitate.
- **Clearance pentru bara de navigație de jos** — conținutul din josul paginilor (detaliu rețetă, listă) nu mai e ascuns sub bottom-nav pe mobil (spacer global în layout).
- **Middleware auth** — `manifest.webmanifest` exclus din matcher (nu mai e redirecționat către login).

### ⚙️ Internals
- Model Prisma `User` + tabel pe Neon; variabilă `AUTH_SECRET` necesară (Vercel + `.env.local`); script `scripts/seed-users.ts` pentru crearea conturilor. Dependențe noi: `next-auth@5`, `bcryptjs`.

## [0.14.0] — 2026-07-18

### ✨ Features
- **Grid 2 coloane pe mobile** — opțiune nouă de afișare în pagina de rețete: 2 carduri pe rând pe mobil, cu imagini și text mai compacte. Selectorul de view are acum 3 butoane dedicate (1 coloană / 2 coloane / listă), cel activ evidențiat cu portocaliu.

### 🐛 Fixes
- **Import rețete funcțional pe Vercel** — înlocuit Python subprocess (`spawn python3`) cu scraper-ul TypeScript nativ; importul prin URL și text nu mai returnează `ENOENT` în mediul serverless.

## [0.13.0] — 2026-07-18

### 🎨 UI / UX
- **Iconă nouă a aplicației** — farfurie cu somon / broccoli / orez, cu ramă portocalie. Folosită pentru icoana de iOS („Add to Home Screen"), favicon-ul din tab, favicon-ul legacy și logo-ul din sidebar (înlocuiește ChefHat).
- **Recalculare instantanee a unităților la pasul de resolve din import** — când selectezi alt ingredient pentru unul nematchuit, verificarea unităților (potrivit / necesită conversie) se actualizează imediat din unitățile ingredientului ales, fără să mai aștepte round-trip-ul la DB (care acum doar completează `conversion`).

### ⚙️ Internals
- `api/import/parse` include acum `unit2` în candidați (necesar pentru seeding-ul instant al unităților).
- Icoanele dinamice `apple-icon.tsx` / `icon.tsx` înlocuite cu asset-uri statice (`apple-icon.png` 180×180, `icon.png` 48×48, `favicon.ico` regenerat, `public/logo.png`).

## [0.12.0] — 2026-07-17

### ✨ Features
- **Sugestii AI pentru conversia unităților la import** — la pasul de resolve, pentru conversiile dependente de ingredient (ex: 1 cup făină ≈ 120 g) pe care tabelul standard nu le acoperă, aplicația pre-completează automat factorul cu Claude Haiku 4.5, cu un badge „✨ Sugerat de AI" și o notă. Rămâne editabil — tu accepți. Rută nouă server-side `app/api/import/suggest-conversion` (cheia API nu se expune în client); regula acceptată se salvează în DB (`UnitRule`), deci AI-ul e chemat doar prima dată per ingredient.

### ⚙️ Internals
- Dependență nouă `@anthropic-ai/sdk`; variabilă de env `ANTHROPIC_API_KEY` (opțional — feature-ul se dezactivează elegant dacă lipsește).
- `.env.local` scos din tracking (era comis din greșeală) și ignorat de git.

## [0.11.0] — 2026-07-17

### ✨ Features
- **Pagină nouă de Setări** — comutatorul light/dark a fost mutat într-o pagină dedicată `/settings` (secțiunea „Aspect"). „Settings" adăugat în sidebar (jos) și în bara de navigație mobilă.
- **Comparație side-by-side la pasul de preview din import** — fiecare ingredient e afișat pe două coloane: „Din text" (linia originală din fișier) vs. „Se importă" (rezultatul după conversie de unități, împărțire pe porții și mapare la ingredient). Diferențele de cantitate / unitate / nume sunt evidențiate cu portocaliu.
- **Editare a oricărui ingredient la preview** — se pot deschide acum și cardurile deja „matched", nu doar cele care necesită revizuire, pentru ajustări de ultim moment.

### 🎨 UI / UX
- **Thumbnail inline în vizualizarea listă (Recipes)** — imaginea rețetei apare ca un pătrat mic cu colțuri rotunjite între checkbox și nume, vizibil acum și pe mobil.

### ⚙️ Internals
- Comandă nouă `/ship` — changelog + bump versiune + commit + push pe origin (deploy producție).

## [0.10.0] — 2026-07-17

### ✨ Features
- **Comutator batch / porție la editarea rețetei** — control „Porții" cu Batch(N) ↔ 1 porție, stepper pentru orice număr de porții, și scalare proporțională a cantităților ingredientelor (×nou/vechi). Switch „Scalează cantitățile" pentru a schimba numărul de porții fără a atinge cantitățile.
- **Mapările de import persistă în baza de date** — mapările manuale „nume brut → ingredient" și regulile de conversie a unităților se salvează acum în tabele Postgres (`IngredientNameMapping`, `UnitRule`) în loc de fișiere JSON locale. Funcționează și pe Vercel (înainte scrierile pe filesystem-ul read-only erau ignorate). Migrate 184 mapări + 9 reguli existente.
- Secțiunea de conversie apare și după selectarea manuală a unui ingredient nematchuit în cardul de resolve (cele 3 scenarii de unități).

### ⚙️ Internals
- Schema: tabele noi `IngredientNameMapping` + `UnitRule` (aplicate pe Neon prin `db push`); script one-time `scripts/seed-import-mappings.ts`.
- `api/import/parse` + `api/import/confirm` citesc/scriu mapările și regulile de unități din DB.
- `CLAUDE.md` adăugat (ghid de dezvoltare). Cod mort eliminat (`api/import/normalize` — spawn Python). Docs învechite mutate în `docs/archive/`. `data/export.json` + `data/local/` scoase din git. `webapp/.env.example` adăugat.

## [0.9.2] — 2026-07-16

### 🎨 UI / UX
- **Card de resolve reproiectat la import** — un singur buton „Salvează" per ingredient (înlocuiește butoanele separate de mapare / conversie / adăugare unit2). Body reorganizat: căutare în DB → opțiunea găsită (auto-match evidențiat verde) → „Crează ingredient nou" mereu vizibil → conversie unități → observații (ultima în ierarhie).
- **Conversie unități pe 3 scenarii** — (1) unitatea din fișier se potrivește cu una din unitățile ingredientului: evidențiată, fără input, cealaltă calculată din DB; (2) unitate țintă la alegere cu factor „1 foreign = N țintă", a doua unitate derivată automat din conversia din DB; (3) ingredient cu o singură unitate: factor + opțiunea de a adăuga unitatea din rețetă ca `unit2`.

### ✨ Features
- **Persistă conversia la adăugarea unei a 2-a unități** — când unitatea din rețetă e adăugată ca `unit2` pe un ingredient existent, factorul introdus se salvează ca `conversion` pe ingredient, ca lista de cumpărături și nutriția să poată converti corect.

### ⚙️ Internals
- `ReviewRow` (pasul 3 din import) rescris: o singură acțiune de salvare, detalii ingredient (unități + conversie) încărcate din DB prin `getGroceryItemDetails`.
- `api/import/confirm` — setează `conversion` odată cu `unit2` (câmp nou `unit2Conversion` în payload).

## [0.9.1] — 2026-07-16

### 🐛 Fixes
- **Importul de rețete funcționează pe Vercel** — ruta `api/import/parse` folosește acum parserul nativ TypeScript (`parseUrls`/`parseText` din `lib/recipe-scraper.ts`) în loc să pornească un subprocess Python; elimină eroarea `spawn /var/task/.venv/bin/python3 ENOENT` din mediul serverless
- **Salvarea la import nu mai eșuează pe filesystem read-only** — scrierile din `api/import/confirm` (mapări ingrediente, reguli de unități, imagini base64) sunt acum non-fatale; rețeta se salvează în Postgres chiar dacă discul nu e scriibil (Vercel), imaginile base64 rămânând inline ca fallback
- **Numele primului grup de ingrediente la importul din text** — un titlu de grup dinaintea primului `[...]` nu mai e ignorat în parserul format `=== ... ===`

### ⚙️ Internals
- Eliminat `child_process`/`spawn` și referințele la `.venv`/`web_import_handler.py` din `api/import/parse/route.ts`
- Scrierile pe disc din `api/import/confirm/route.ts` protejate cu `try/catch` pentru medii serverless

## [0.4.0] — 2026-03-21

### ✨ Features
- **TypeScript recipe scraper** — înlocuiește complet subprocess-ul Python cu un scraper nativ TypeScript; funcționează pe Vercel fără niciun runtime extern

### 🐛 Fixes
- Fix `spawn python3 ENOENT` pe Vercel (mediu serverless fără Python)
- Fix import Google Fonts și eroare TypeScript în pagina de import

### ⚙️ Internals
- `webapp/lib/recipe-scraper.ts` — scraper nou: fetch URL → Schema.org JSON-LD → structură rețetă; parser format text `=== ... ===`
- Eliminat dependența de `child_process` din `api/import/parse/route.ts`

## [0.3.0] — 2026-03-20

### ✨ Features
- **Căutare ingredient la import** — input de search cu debounce în modul „Mapează la existent" (Step 3)
- **Upload imagine la import** — buton per card de rețetă în Step 2 (Review), thumbnail după upload
- **Normalizare servings la import** — cantitățile se împart la nr. original de porții, salvate la baza de 1 serving
- **Nume editabil ingredient nou** — câmp de editare a numelui în modul „Creează nou" (Step 3)
- **Editor instrucțiuni** — înlocuiește textarea cu editor linie-cu-linie: pași numerotați, secțiuni portocalii, paste multi-linie, navigare cu săgeți
- **Timestamp rețetă** — data adăugării afișată discret sub Nutrition Facts
- **Comanda `/release`** — versionare și actualizare CHANGELOG automat

### 🎨 UI / UX
- Buton import mutat lângă „New Recipe" în header-ul paginii Recipes (sidebar/bottom nav mai curate)
- Spacing mai mare între rândurile de ingrediente în formular

### 🐛 Fixes
- Fix JSON parse error la import: print-urile Python redirecționate pe `stderr` (ingredient_processor, web_import_handler)
- Fix stdout poluat cu log-uri la apelurile `parse_scraped_file` din subproces

### ⚙️ Internals
- `api/import/search-items` — endpoint GET pentru căutare GroceryItem
- `api/import/upload-image` — endpoint POST pentru upload imagine rețetă (hash MD5, consistent cu convenția existentă)
- `api/import/confirm` — normalizare qty/servings la import

## [0.2.0] — 2026-03-20

### ✨ Features
- **Import rețete** — wizard în 4 pași (Input → Review → Resolve → Import) cu suport URL și Text/Fișier
- **Import URL** — scraping automat din site-uri cu schema.org/Recipe (AllRecipes, BBC Good Food, Jamie Oliver etc.)
- **Import Text/Fișier** — paste sau upload `.txt` cu parsare automată a ingredientelor și pașilor
- **Ingredient matching** — potrivire exactă, fuzzy (bigram) și căutare în DB la import
- **Search ingredient** — input de căutare în DB la pasul „Mapează la existent"
- **Upload imagine la import** — adăugare imagine per rețetă direct din Step 2 (Review)
- **Normalizare servings** — cantitățile se salvează per 1 porție la import (bază pentru scaler)
- **Planner** — drag & drop rețete în planificatorul săptămânal, inclusiv pe mobil
- **Planner mobile** — selector de rețete redesenat, feedback haptic la drag
- **Adaugă în Planner** — buton direct din pagina de rețetă
- **Filtru favorite** — filtrare rețete favorite în lista principală și în planner
- **PWA** — manifest + meta tags Apple web app pentru instalare pe iOS/Android
- **Editor instrucțiuni** — editor linie-cu-linie în loc de textarea: pași numerotați, secțiuni colorate, paste multi-linie, navigare cu săgeți

### 🎨 UI / UX
- **Dark mode** — temă întunecată completă (Notion-inspired) pe toate paginile
- **Theme toggle** — comutator light/dark cu design tokens
- **Timestamp rețetă** — data adăugării afișată discret sub Nutrition Facts
- **Import icon** — buton de import mutat lângă „New Recipe" în header (sidebar/bottom nav mai curate)
- **Spacing ingrediente** — gap mai mare între rândurile de ingrediente în formular
- **iOS safe area** — fix pentru status bar și safe area pe iPhone

### 🐛 Fixes
- Fix JSON parse error la import cauzat de print-uri Python pe stdout în loc de stderr
- Fix bug-uri drag & drop în planner pe mobil
- Fix active state în sidebar pentru ruta `/recipes/import`

### ⚙️ Internals
- Compresie imagini PNG mari → JPEG la export din Notion
- Eliminat `node_modules` și `.next` din tracking git
- Script `web_import_handler.py` — bridge Python/Next.js pentru import rețete
- API routes: `/api/import/parse`, `/api/import/confirm`, `/api/import/search-items`, `/api/import/upload-image`
- Comanda `/release` pentru versionare și changelog automat

## [0.1.0] — 2025-01-01

- Lansare inițială: import Notion, grid rețete, planner săptămânal, grocery list, pagina ingrediente
