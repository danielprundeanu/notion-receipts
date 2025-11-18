# 📸 Ghid Imagini Locale pentru Rețete

## Cum funcționează

Sistemul descarcă automat imaginile în folderul `img/` în timpul procesului de scraping și le salvează cu nume unice bazate pe titlul rețetei.

## Workflow

### 1. Scraping cu descărcare automată

```bash
notion-scrape
# sau
python scrape_recipes.py recipe_urls.txt scraped_recipes.txt
```

**Ce se întâmplă:**
- Extrage rețetele de pe URL-uri
- Descarcă automat imaginile în `img/`
- Salvează path-ul local în fișierul `.txt`: `Image: img/Reteta_Name_abc123.jpg`

### 2. Verifică imaginile descărcate

```bash
notion-images
# sau
python upload_cover.py list
```

**Output:**
```
📸 IMAGINI DESCĂRCATE (5 fișiere)
  • Spiced_Beef_Tacos_abc123.jpg (375.7 KB)
  • Chicken_Curry_def456.jpg (421.3 KB)
  ...
```

### 3. Import în Notion

```bash
notion-import
# sau
python import_recipes.py scraped_recipes.txt
```

**⚠️ IMPORTANT:** 
Notion API nu suportă upload direct de fișiere pentru cover images. Vei vedea acest mesaj:

```
⚠ Imaginea locală 'img/Reteta_Name.jpg' trebuie încărcată manual în Notion
  Sau folosește un serviciu de hosting pentru imagini
```

### 4. Upload manual în Notion

**Opțiunea A - Upload direct în Notion:**

1. Deschide rețeta în Notion
2. Click pe "Add cover" (hover peste zona de sus)
3. Selectează "Upload"
4. Alege fișierul din folderul `img/`

**Opțiunea B - Folosește un serviciu de hosting:**

Dacă vrei să automatizezi complet procesul, uploadează imaginile pe un serviciu extern:

1. **Imgur** (gratuit, simplu):
   - Merge pe imgur.com/upload
   - Drag & drop imaginea din `img/`
   - Copiază "Direct Link"
   - Înlocuiește în `.txt`: `Image: https://i.imgur.com/abc123.jpg`

2. **Cloudinary** (mai profesional):
   - Account gratuit la cloudinary.com
   - Upload prin dashboard sau API
   - Folosește URL-ul public

3. **GitHub** (pentru repo-uri publice):
   - Commit imaginile în repo
   - Folosește URL raw: `https://raw.githubusercontent.com/user/repo/main/img/image.jpg`

## Comenzi utile

```bash
# Listează toate imaginile descărcate
notion-images

# Afișează instrucțiuni pentru o imagine specifică
python upload_cover.py img/Reteta_Name.jpg "Numele Rețetei"

# Șterge imaginile vechi (manual)
rm img/*.jpg

# Verifică dimensiunea folderului img/
du -sh img/
```

## Structura fișierelor

```
notion/
├── img/                          # Imagini descărcate
│   ├── Reteta_1_abc123.jpg
│   ├── Reteta_2_def456.jpg
│   └── ...
├── scrape_recipes.py             # Scraping + descărcare imagini
├── import_recipes.py             # Import în Notion
├── upload_cover.py               # Helper pentru imagini
└── scraped_recipes.txt           # Conține: Image: img/...
```

## Avantaje vs URL-uri externe

| Aspect | Imagini locale | URL-uri externe |
|--------|---------------|-----------------|
| **Persistență** | ✅ Sigur, nu depinde de site | ❌ Poate dispărea |
| **Viteză import** | ❌ Upload manual | ✅ Instant (link direct) |
| **Automatizare** | ⚠️ Semi-automată | ✅ Complet automată |
| **Spațiu** | ❌ Ocupă pe disc | ✅ Nu ocupă spațiu |
| **Offline** | ✅ Disponibil local | ❌ Necesită internet |

## Rezolvare probleme

### Imaginea nu se descarcă

**Cauze posibile:**
- URL-ul imaginii nu e valid
- Site-ul blochează descărcarea
- Format nesuportat

**Soluție:**
```bash
# Verifică URL-ul manual
curl -I "https://site.com/image.jpg"

# Sau descarcă manual
curl "https://site.com/image.jpg" -o img/manual_download.jpg
```

### Format nesuportat

**Formate acceptate:** `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`

**Conversie:**
```bash
# Convertește webp la jpg (necesită imagemagick)
brew install imagemagick
convert img/image.webp img/image.jpg
```

### Notion refuză imaginea

**Limită:** Notion acceptă max 5MB per fișier

**Optimizare:**
```bash
# Redimensionează imaginea (macOS)
sips -Z 1200 img/image.jpg

# Sau folosește compression online
# - tinypng.com
# - compressor.io
```

## Alternative avansate

### Automatizare cu Imgur API

Dacă vrei să uploadezi automat pe Imgur:

1. Crează cont pe imgur.com
2. Generează Client ID: https://api.imgur.com/oauth2/addclient
3. Instalează: `pip install imgurpython`
4. Folosește scriptul `upload_to_imgur.py` (nu inclus, dar poate fi creat)

### Self-hosting

Dacă ai server propriu:
```bash
# Upload prin SCP
scp img/*.jpg user@server:/var/www/images/

# Sau folosește AWS S3, Google Cloud Storage, etc.
```

## Summary

**Workflow recomandat:**

1. ✅ Scrape cu descărcare automată: `notion-scrape`
2. ✅ Verifică imaginile: `notion-images`
3. ✅ Import rețete: `notion-import`
4. ⚠️ Upload manual cover în Notion UI (5-10 sec/rețetă)

**Pentru automatizare completă:**
- Folosește Imgur sau alt serviciu de hosting
- Înlocuiește path-urile locale cu URL-uri externe înainte de import
