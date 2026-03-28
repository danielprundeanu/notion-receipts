# Changelog

## [0.6.1] - 2026-03-28

### Fixed
- Sort buttons replaced with compact dropdown (`<select>`) — always visible, outside the scrollable chips row
- "Add new ingredient" dropdown no longer clipped by `overflow-hidden` on ingredient group container
- Ingredient inputs no longer flicker with autocomplete dropdowns on edit page load (`hasTouched` guard)
- Servings callout (orange banner) now also appears on the recipe detail page when servings > 1

## [0.6.0] - 2026-03-28

### Added
- Ingredient autocomplete: "+ Add as new ingredient" option in dropdown when typing a name not found in DB
- `GroceryItemCreateModal`: create ingredient with all fields (name, category, unit, unit2, conversion, nutrition) directly from recipe form
- Servings callout (orange banner) before the ingredients section when recipe has > 1 serving
- Horizontal scroll for category/sort filter chips on mobile (no overflow clipping)
- No iOS input zoom: `font-size: 16px` enforced on mobile inputs/selects

### Improved
- `next/image` replaces `<img>` on recipe cards (WebP, lazy load, responsive sizes)
- Sort recipes by date (Newest / Oldest / A–Z) on the recipes list page
- `createGroceryItem` server action added for creating ingredients from the recipe form

## [0.5.1] - 2026-03-28

### Added
- Sort rețete după dată (Newest / Oldest / A–Z) cu `next/image` optimizat

### Fixed
- Imagini cu path relativ invalid nu mai cauzează crash (`data/local/img/...` → placeholder)
- `next/image` cu lazy load + WebP + resize înlocuiește `<img>` nativ pentru performanță

## [0.5.0] - 2026-03-28

### Added
- Import unificat URL + txt prin `web_import_handler.py` (Python) — același flux pentru ambele surse
- Detecție conflicte unități la import: compară unitatea din rețetă cu `[unit, unit2]` ale grocery item-ului
- Rezolvare conversii în UI (step 3): factor de conversie introdus de user, salvat în `unit_choices.json` pentru reutilizare
- Auto-rezolvare conversii cunoscute din `unit_choices.json` (badge verde în review)
- Unități restricționate în formularul de editare rețetă: selectul afișează doar `unit` + `unit2` ale grocery item-ului

### Fixed
- Strikethrough portocaliu în grocery list (`decoration-orange-500`)
- Headere HTTP îmbunătățite pentru scraping URL (Sec-Fetch-*, sec-ch-ua, Referer)
- Coloană `unitWeight` adăugată în SQLite + client Prisma regenerat

## [0.4.0] - 2026-03-14

### Added
- Ingredient checkboxes în recipe detail
- Ingredient-aware search (caută și după ingrediente)
- Gap mai mare între ingrediente
