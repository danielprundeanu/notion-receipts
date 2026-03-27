# Changelog

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
