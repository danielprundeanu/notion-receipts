# 📝 Parse Local Recipes - Ghid de utilizare

## Ce face acest script?

`parse_local_recipes.py` parsează rețete din fișiere text (copy-paste din PDF-uri, Word, etc.) și le convertește în formatul pentru import în Notion.

## Utilizare rapidă

```bash
# Parsing rețete locale
notion-parse my_recipes.txt parsed_output.txt

# Sau direct
python parse_local_recipes.py my_recipes.txt parsed_output.txt
```

## Format acceptat

Scriptul acceptă **diverse formate** de rețete:

### Format 1: Cu secțiuni explicite

```
Titlul Rețetei

Servings: 4
Timp: 30 minute

Ingrediente:
- 250g făină
- 2 ouă
- 500ml lapte

Mod de preparare:
1. Amestecă făina cu ouăle
2. Adaugă laptele
3. Gătește 5 minute
```

### Format 2: Format liber (cu autodetecție)

```
Clătite pufoase

250g făină
2 ouă  
500ml lapte
1 lingură zahăr

Amestecă făina cu ouăle.
Adaugă laptele treptat.
Gătește pe foc mediu.
```

### Format 3: Cu grupuri de ingrediente

```
Tort de ciocolată

Porții: 8

Ingrediente

Pentru blat:
300g făină
4 ouă
200g zahăr

Pentru cremă:
500ml smântână
100g ciocolată

Preparare
1. Prepară blatul...
2. Fă crema...
```

## Caracteristici

### ✅ Ce detectează automat:

- **Titlu** - prima linie non-goală
- **Servings** - caută "Servings:", "Porții:", "Yields:" + număr
- **Timp** - extrage ore și minute (ex: "30 min", "1h 20min")
- **Ingrediente** - cu cantitate + unitate + nume
- **Grupuri** - "Pentru sos:", "Pentru umplutură:", etc.
- **Instrucțiuni** - pași numerotați sau propoziții cu verbe

### 📊 Calcule automate:

- Normalizează cantitățile la **1 porție**
- Suportă fracții: `1/2`, `1 1/2`, `½`, `¼`, `¾`
- Împarte cantitatea la numărul de servings

**Exemplu:**
```
Input:  500g făină (Servings: 4)
Output: 125g făină (500÷4)
```

### 🌍 Suport multilingv:

- **Română**: Ingrediente, Porții, Mod de preparare, Preparare
- **Engleză**: Ingredients, Servings, Instructions, Method, Steps

## Exemple de utilizare

### Exemplu 1: Rețetă simplă

**Input** (`reteta.txt`):
```
Omletă simplă

Servings: 2

3 ouă
50ml lapte
Sare

Bate ouăle cu laptele.
Prăjește 3 minute.
Servește cald.
```

**Comandă:**
```bash
notion-parse reteta.txt output.txt
```

**Output** (`output.txt`):
```
=== Omletă simplă ===
Servings: 2
Difficulty: Easy
Favorite: No

[1]
1.5 ouă
25 ml lapte
Sare

Method:
1. Bate ouăle cu laptele.
2. Prăjește 3 minute.
3. Servește cald.
```

### Exemplu 2: Multiple rețete în același fișier

**Input** (`retete_multiple.txt`):
```
Clătite

4 ouă
500ml lapte

Bate ouăle.
Gătește.


Tort

Servings: 8

400g făină
6 ouă

Amestecă.
Coace 30 min.
```

📌 **Notă**: Separă rețetele prin **2+ linii goale** sau `---`/`===`

## Troubleshooting

### ❌ "Nu s-au găsit rețete valide"

**Cauze:**
- Lipsește titlul
- Nu sunt ingrediente cu cantități
- Format necunoscut

**Soluție:**
```
✅ Asigură-te că ai:
   1. Titlu pe prima linie
   2. Cel puțin un ingredient cu cantitate (ex: "2 ouă")
   3. Cel puțin o instrucțiune
```

### ⚠️ Ingrediente lipsă

**Problemă**: Unele ingrediente nu apar în output

**Cauze posibile:**
- Lipsește cantitatea (ex: doar "Sare" fără "1 praf de sare")
- Format nerecunoscut

**Soluție**:
```
❌ Sare
✅ Sare (fără cantitate - va fi inclus)

❌ două ouă
✅ 2 ouă

❌ jumătate kilogram zahăr
✅ 500g zahăr sau 0.5kg zahăr
```

### 🔧 Servings greșit

**Problemă**: Calculează greșit cantitățile

**Verifică:**
```bash
# În fișierul tău, adaugă explicit:
Servings: 4
# sau
Porții: 4
```

## Workflow complet

```bash
# 1. Creează fișier cu rețete (copy-paste din PDF)
# retete.txt

# 2. Parsează
notion-parse retete.txt parsed.txt

# 3. Verifică output
notion-view parsed.txt

# 4. Editează dacă e nevoie
notion-edit parsed.txt

# 5. Importă în Notion
notion-import parsed.txt
```

## Limitări

- **Nu suportă imagini** (doar text)
- **Nu detectează dificultatea** automat (default: Easy)
- **Nu detectează categoria** automat
- **Fracții mixte**: Trebuie spațiu între întreg și fracție (`1 1/2`, nu `11/2`)

## Tips & Tricks

### ✨ Pentru rezultate optime:

1. **Servings**: Specifică explicit la început
   ```
   Servings: 4
   Timp: 30 min
   ```

2. **Grupuri ingrediente**: Folosește `:` la final
   ```
   Pentru blat:
   - 300g făină
   
   Pentru cremă:
   - 200ml smântână
   ```

3. **Instrucțiuni**: Numerotează
   ```
   1. Amestecă făina
   2. Adaugă laptele
   ```

4. **Cantități**: Format numeric
   ```
   ✅ 250g, 2 ouă, 500ml, 1.5kg
   ❌ două sute cincizeci grame
   ```

### 🚀 Automatizare

Pentru rețete frecvente:

```bash
# Alias pentru rețete din clipboardd (macOS)
pbpaste > temp_recipe.txt && notion-parse temp_recipe.txt parsed.txt

# Sau cu fish/zsh function:
function quick-recipe
    pbpaste > /tmp/recipe.txt
    notion-parse /tmp/recipe.txt parsed_recipes.txt
    notion-import parsed_recipes.txt
end
```

## Comparație cu Web Scraping

| Aspect | Web Scraping | Local Parsing |
|--------|-------------|---------------|
| **Sursă** | URL-uri web | Fișiere text locale |
| **Format** | JSON-LD/HTML | Text liber |
| **Imagini** | ✅ Auto-download | ❌ Nu suportă |
| **Precizie** | ✅✅ Foarte bună | ⚠️ Depinde de format |
| **Viteză** | Lent (HTTP) | ✅✅ Foarte rapid |
| **Offline** | ❌ Necesită internet | ✅ Funcționează offline |

## Summary

**Pentru rețete din web:**
```bash
notion-scrape  # web scraping
```

**Pentru rețete din PDF/documente:**
```bash
notion-parse my_recipes.txt parsed.txt  # local parsing
```

Ambele generează același format final pentru import în Notion! 🎯
