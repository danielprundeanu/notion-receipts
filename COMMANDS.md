🍳 Notion Recipes - Comenzi

═══════════════════════════════════════════════════════════

COMENZI PRINCIPALE:

  Parse & Import:
    notion-parse [input] [output]    Parse rețete locale (default: local_recipes.txt)
    notion-import [file]              Import în Notion (default: scraped_recipes.txt)
    notion-import [file] --steps      Adaugă doar Steps la rețete existente
    notion-steps                      Shortcut: adaugă Steps la scraped_recipes.txt
    notion-update-metadata            Actualizează link-uri și imagini pentru rețete existente

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
    notion-map-edit                   Editează manual ingredient_mappings.json

  Navigare:
    notion-cd                         Du-te în folder proiect
    notion-images                     Listează imagini
    notion-help                       Afișează acest help

═══════════════════════════════════════════════════════════

WORKFLOW:

  Import complet (prima dată):
    notion-scrape                     # Scrape rețete
    notion-import                     # Creează rețete + ingrediente
    # Aplică manual template-ul în Notion
    notion-steps                      # Adaugă Steps după template

  Actualizare metadata:
    notion-update-metadata            # Actualizează link-uri și imagini

  Rețete locale (PDF/copy-paste):
    notion-parse data/local_recipes.txt
    notion-import data/local_scraped_recipes.txt

═══════════════════════════════════════════════════════════

FUNCȚIONALITĂȚI:

  ✅ Ingredient groups: Păstrează [For the sauce], [For the topping]
  ✅ Section headers: Creează H3 în Notion pentru fiecare grup
  ✅ Conversii automate: oz→g, lb→g, liter→ml (10+ conversii)
  ✅ Unit matching: Validare inteligentă cu Unity/2nd Unity
  ✅ Adjective inteligente: "1 ripe banana" → "1 banana (ripe)"
  ✅ Container words: "tin of beans" păstrat ca nume complet
  ✅ Grocery mappings: Salvare incrementală după fiecare rețetă
  ✅ Recursion protection: Previne mapări circulare
  ✅ Cover & Icon: Setare automată din URL-uri externe
  ✅ Link property: Setare automată din scraped data
  ✅ Grocery List din Notion: 117 items pentru match automat
  ✅ Macros automate: 80+ foods cu valori nutriționale

═══════════════════════════════════════════════════════════

Detalii: cat README.md | cat README_LOCAL_PARSING.md
