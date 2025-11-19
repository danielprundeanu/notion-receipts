🍳 Notion Recipes - Comenzi

═══════════════════════════════════════════════════════════

COMENZI PRINCIPALE:

  Parse & Import:
    notion-parse [input] [output]    Parse rețete locale (default: local_recipes.txt)
    notion-import [file]              Import în Notion (default: scraped_recipes.txt)
    notion-import-local               Shortcut: import data/local_scraped_recipes.txt

  Scraping Web:
    notion-scrape                     Scrape din data/recipe_urls.txt
    notion-urls                       Editează URL-uri

  Vizualizare:
    notion-view                       Vezi rețete scraped
    notion-edit                       Editează în VS Code

  Mappings:
    notion-mappings                   Listează mappings
    notion-map-add                    Adaugă mapping
    notion-map-remove                 Șterge mapping

  Navigare:
    notion-cd                         Du-te în folder proiect
    notion-images                     Listează imagini

═══════════════════════════════════════════════════════════

WORKFLOW:

  Rețete locale (PDF/copy-paste):
    notion-parse data/local_recipes.txt
    notion-import-local

  Rețete web:
    notion-urls              # Adaugă URL-uri
    notion-scrape
    notion-import

═══════════════════════════════════════════════════════════

FUNCȚIONALITĂȚI:

  ✅ Adjective inteligente: "1 ripe banana" → "1 banana (ripe)"
  ✅ Grocery List din Notion: 117 items pentru match automat
  ✅ Interactiv: Selectare Unity, Category, Macros automate (80+ foods)
  ✅ Slices, Time, Servings - toate suportate

═══════════════════════════════════════════════════════════

Detalii: cat README.md | cat README_LOCAL_PARSING.md
