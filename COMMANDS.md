# 🍳 Notion Recipes - Comenzi disponibile

## 📁 Navigare
```bash
notion-cd              # Navighează în folder-ul proiectului
```

## 🌐 Scraping Web
```bash
notion-scrape          # Scrape rețete din data/recipe_urls.txt
notion-urls            # Editează lista de URL-uri
```

## 📝 Parsing Local (din PDF/documente)
```bash
notion-parse <input.txt> <output.txt>   # Parsează rețete locale
```

**Exemplu:**
```bash
notion-parse my_recipes.txt data/scraped_recipes.txt
```

## 📥 Import în Notion
```bash
notion-import          # Importă rețete în Notion (INTERACTIV! ⭐)
notion-steps           # Adaugă Steps la rețete existente
```

### 🆕 Import Interactiv cu Autocompletare
Când imporți rețete, scriptul te ghidează interactiv pentru ingrediente noi:

**Funcționalități:**
- ✅ **Selectare Unity** din lista Notion (g, ml, cup, piece, etc.)
- ✅ **Selectare 2nd Unity** opțional (pentru conversii)
- ✅ **Conversion Factor** (ex: 1 cup = 240ml)
- ✅ **Selectare Category** (🍎 Fruits, 🥕 Veg, 🌾 Grains, etc.)
- ✅ **Autocompletare Macronutrienți** din bază de date locală (80+ alimente RO/EN)
  - KCal / 100g
  - Carbs / 100g
  - Fat / 100g
  - Protein / 100g

**Bază de date locală include:**
- Carne: piept pui, somon, ton, ouă
- Lactate: brânză vaci, iaurt grecesc, lapte
- Cereale: fulgi ovaz, orez, paste, quinoa
- Fructe: banane, măr, portocală, căpșuni
- Legume: broccoli, spanac, roșii, cartofi
- Nuci: migdale, nuci, semințe chia
- și multe altele...

📖 Vezi [FEATURE_INTERACTIVE_IMPORT.md](FEATURE_INTERACTIVE_IMPORT.md) pentru detalii complete
🎬 Vezi [DEMO_INTERACTIVE_IMPORT.md](DEMO_INTERACTIVE_IMPORT.md) pentru exemplu pas-cu-pas

## 📋 Vizualizare & Editare
```bash
notion-view            # Afișează rețete scraped
notion-edit            # Editează rețete scraped în VS Code
```

## 🗺️ Ingredient Mappings
```bash
notion-mappings        # Listează toate mappings
notion-map-add         # Adaugă mapping nou
notion-map-remove      # Șterge mapping
notion-map-edit        # Editează mappings manual
```

## 📸 Imagini
```bash
notion-images          # Listează imagini descărcate
```

## 🧪 Testing
```bash
notion-test            # Test import cu test_recipe.txt
notion-test-steps      # Test Steps cu test_recipe.txt
```

---

## 🔄 Workflow Complet

### Opțiunea 1: Rețete de pe web

```bash
# 1. Adaugă URL-uri
notion-urls

# 2. Scrape rețete
notion-scrape

# 3. Verifică rezultate
notion-view

# 4. Importă în Notion
notion-import

# 5. Aplică template MANUAL în Notion UI

# 6. Adaugă Steps
notion-steps
```

### Opțiunea 2: Rețete locale (PDF/documente)

```bash
# 1. Copy-paste rețete în fișier text
# my_recipes.txt

# 2. Parsează
notion-parse my_recipes.txt data/scraped_recipes.txt

# 3. Verifică
notion-view

# 4. Importă în Notion
notion-import

# 5. Aplică template MANUAL în Notion UI

# 6. Adaugă Steps
notion-steps
```

---

## 📂 Structură foldere

```
notion/
├── scripts/              # Toate scripturile Python
│   ├── scrape_recipes.py
│   ├── parse_local_recipes.py
│   ├── import_recipes.py
│   ├── manage_mappings.py
│   └── upload_cover.py
│
├── data/                 # Date pentru workflow
│   ├── recipe_urls.txt          # Input: URL-uri pentru scraping
│   ├── scraped_recipes.txt      # Output: Rețete pentru import
│   ├── ingredient_mappings.json # Mappings învățate
│   └── test/                    # Fișiere de test
│
├── img/                  # Imagini descărcate
│
├── README.md             # Documentație principală
├── README_IMAGES.md      # Ghid imagini locale
├── README_LOCAL_PARSING.md  # Ghid parsing local
├── COMMANDS.md           # Acest fișier
└── notion.env            # Credențiale Notion API
```

---

## 📚 Documentație detaliată

```bash
cat README.md                    # Ghid principal
cat README_IMAGES.md             # Ghid imagini locale
cat README_LOCAL_PARSING.md      # Ghid parsing local
cat UNITATI.md                   # Info unități de măsură
```

---

## 💡 Tips

### Scraping rapid
```bash
# Scrape o singură rețetă
echo "https://site.com/recipe" > data/recipe_urls.txt
notion-scrape
```

### Verificare mappings
```bash
# Vezi ce mappings ai
notion-mappings

# Editează manual dacă e nevoie
notion-map-edit
```

### Clean restart
```bash
# Backup și șterge rețete vechi
mv data/scraped_recipes.txt data/scraped_recipes_$(date +%Y%m%d).txt
```

---

## 🆘 Probleme comune

### "Command not found: notion-scrape"
```bash
source ~/.zshrc
```

### "No such file or directory"
```bash
notion-cd
ls -la data/
```

### "Module not found"
```bash
cd /Users/danielprundeanu/Documents/GitHub/notion
source .venv/bin/activate
pip install -r requirements.txt
```

### Imagini nu se uploadă
Notion API nu suportă upload direct de fișiere în cover.
Vezi: `cat README_IMAGES.md`

---

Pentru mai multe detalii, consultă README-urile! 📖
