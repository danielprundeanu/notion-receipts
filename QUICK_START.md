# 🍳 Notion Recipes - Quick Start

Sistem automatizat pentru importul rețetelor în Notion din diverse surse (web, PDF, documente).

## 🚀 Start rapid

```bash
# 1. Vezi comenzile disponibile
notion-help

# 2. Adaugă URL-uri de rețete
notion-urls

# 3. Scrape rețetele
notion-scrape

# 4. Importă în Notion
notion-import
```

## 📂 Structură proiect

```
notion/
├── scripts/           # 🔧 Scripturi Python (nu modifica)
├── data/              # 📁 Fișierele tale de lucru
│   ├── recipe_urls.txt        → URL-uri pentru scraping
│   ├── scraped_recipes.txt    → Rețete pentru import
│   └── ingredient_mappings.json
├── img/               # 📸 Imagini descărcate
├── COMMANDS.md        # 📖 Lista completă comenzi
└── README*.md         # 📚 Documentație detaliată
```

## 💡 Workflow-uri comune

### Web Scraping
```bash
notion-urls     # Adaugă URL-uri
notion-scrape   # Extrage rețete
notion-import   # Importă în Notion
```

### Parsing Local (PDF/documente)
```bash
notion-parse my_recipes.txt data/scraped_recipes.txt
notion-import
```

### Verificare & Editare
```bash
notion-view     # Vezi rețetele
notion-edit     # Editează în VS Code
```

## 📖 Documentație completă

- **COMMANDS.md** - Toate comenzile disponibile
- **README_IMAGES.md** - Ghid pentru imagini locale
- **README_LOCAL_PARSING.md** - Ghid parsing din PDF/documente
- **UNITATI.md** - Info unități de măsură

## 🔧 Setup

Dacă aliasurile nu funcționează:
```bash
./setup_aliases.sh
source ~/.zshrc
```

## ⚙️ Configurare

Credențiale API în `notion.env`:
```bash
NOTION_TOKEN=secret_...
DB_RECEIPTS_ID=...
DB_INGREDIENTS_ID=...
DB_GROCERIES_ID=...
```

---

**Pentru detalii complete:** `notion-help` sau `cat COMMANDS.md`
