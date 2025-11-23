🍳 Notion Recipes - Comenzi

═══════════════════════════════════════════════════════════

COMENZI PRINCIPALE:

  Scraping:
    notion-scrape-url                 Scrape URL-uri web din data/urls/recipe_urls.txt
    notion-scrape-local               Parsează fișier local data/local/local_recipes.txt
    notion-scrape                     Alias pentru notion-scrape-url (default)

  Import:
    notion-import-url                 Import rețete din data/urls/scraped_recipe_urls.txt
    notion-import-local               Import rețete din data/local/scraped_local_recipes.txt
    notion-import                     Alias pentru notion-import-url (default)
    
    notion-steps-url                  Adaugă Steps pentru rețete URL (după template)
    notion-steps-local                Adaugă Steps pentru rețete locale (după template)
    notion-steps                      Alias pentru notion-steps-url (default)
    
    notion-update-metadata            Actualizează link-uri și imagini pentru rețete existente

  Editare fișiere:
    notion-urls                       Editează data/urls/recipe_urls.txt
    notion-local                      Editează data/local/local_recipes.txt
    notion-view-urls                  Vezi data/urls/scraped_recipe_urls.txt
    notion-view-local                 Vezi data/local/scraped_local_recipes.txt
    notion-edit-urls                  Editează scraped_recipe_urls.txt în VS Code
    notion-edit-local                 Editează scraped_local_recipes.txt în VS Code

  Mappings:
    notion-mappings                   Listează mappings ingrediente
    notion-map-add                    Adaugă mapping
    notion-map-remove                 Șterge mapping
    notion-map-edit                   Editează manual ingredient_mappings.json

  Navigare:
    notion-cd                         Du-te în folder proiect
    notion-images                     Listează imagini descărcate
    notion-help                       Afișează acest help

═══════════════════════════════════════════════════════════

STRUCTURĂ FOLDERE:

  data/urls/
    ├── recipe_urls.txt               Input: URL-uri web (un URL per linie)
    ├── scraped_recipe_urls.txt       Output: Rețete scraped din web
    └── img/                          Imagini descărcate din web

  data/local/
    ├── local_recipes.txt             Input: Rețete text (copy-paste din PDF/Word)
    ├── scraped_local_recipes.txt     Output: Rețete parsate din text
    └── img/                          Imagini locale (dacă există)

═══════════════════════════════════════════════════════════

WORKFLOW:

  Rețete web:
    1. notion-urls                    # Editează data/urls/recipe_urls.txt
    2. notion-scrape-url              # Scrape → data/urls/scraped_recipe_urls.txt
    3. notion-import-url              # Import în Notion
    4. Aplică template în Notion      # Manual
    5. notion-steps-url               # Adaugă Steps

  SAU folosește alias-urile default (echivalent cu -url):
    1. notion-urls
    2. notion-scrape
    3. notion-import
    4. Aplică template
    5. notion-steps

  Rețete locale:
    1. notion-local                   # Editează data/local/local_recipes.txt
    2. notion-scrape-local            # Parse → data/local/scraped_local_recipes.txt
    3. notion-import-local            # Import în Notion
    4. Aplică template în Notion      # Manual
    5. notion-steps-local             # Adaugă Steps

  Actualizare metadata:
    notion-update-metadata            # Actualizează link-uri și imagini

═══════════════════════════════════════════════════════════

FUNCȚIONALITĂȚI:

  ✅ Ingredient groups: Păstrează [For the sauce], [For the topping]
  ✅ Section headers: Creează H3 în Notion pentru fiecare grup
  ✅ Bracket format: [0.5 g] beef mince pentru vizibilitate
  ✅ Traducere automată: Română → Engleză (site-uri .ro)
  ✅ Conversii automate: oz→g, lb→g, liter→ml (10+ conversii)
  ✅ Unit matching: Validare inteligentă cu Unity/2nd Unity
  ✅ Adjective inteligente: "1 ripe banana" → "1 banana (ripe)"
  ✅ Container words: "tin of beans" păstrat ca nume complet
  ✅ Grocery mappings: Salvare incrementală după fiecare rețetă
  ✅ Recursion protection: Previne mapări circulare
  ✅ Cover & Icon: Setare automată din URL-uri externe
  ✅ Link property: Setare automată din scraped data
  ✅ Servings detection: Regex pentru site-uri românești (portii, porții)
  ✅ Imagini separate: data/urls/img/ pentru web, data/local/img/ pentru local
  ✅ Grocery List din Notion: 117 items pentru match automat
  ✅ Macros automate: 80+ foods cu valori nutriționale

═══════════════════════════════════════════════════════════

EXEMPLE:

  # Workflow complet cu rețete web (folosind alias-uri default)
  echo "https://www.bbcgoodfood.com/recipes/easy-pizza" >> data/urls/recipe_urls.txt
  notion-scrape       # Scrape URL-uri
  notion-import       # Import în Notion
  # Aplică template manual în Notion
  notion-steps        # Adaugă Steps

  # Workflow explicit cu -url
  notion-scrape-url
  notion-import-url
  notion-steps-url

  # Workflow cu rețete locale
  pbpaste > data/local/local_recipes.txt  # paste din clipboard
  notion-scrape-local
  notion-import-local
  # Aplică template manual în Notion
  notion-steps-local

  # Import custom dintr-un fișier specific
  python scripts/import_recipes.py path/to/custom.txt
  python scripts/import_recipes.py path/to/custom.txt --steps

═══════════════════════════════════════════════════════════

Detalii: cat README.md
