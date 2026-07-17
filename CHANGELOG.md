# Changelog

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
