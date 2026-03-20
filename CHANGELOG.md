# Changelog

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
