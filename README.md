# Import Rețete în Notion

Scripturi Python pentru a importa rețete în bazele de date Notion:
- **`scrape_recipes.py`** - Extrage rețete de pe website-uri și le convertește în format txt
- **`import_recipes.py`** - Importă rețetele din fișiere txt în Notion

## Configurare inițială

### 1. Conectează bazele de date la integrare

Pentru fiecare bază de date (Ingredients 2.0 și Receipts 2.0):
1. Deschide baza de date în Notion
2. Click pe "..." (3 puncte) în colțul din dreapta sus
3. Selectează "Add connections" / "Connect to"
4. Alege integrarea ta Notion

### 2. Verifică structura bazelor de date

Rulează scriptul de inspecție pentru a vedea structura exactă:
```bash
/Users/danielprundeanu/Documents/GitHub/notion/.venv/bin/python inspect_databases.py
```

## Utilizare

### Metoda 1: Extragere automată de pe website-uri

#### 1. Creează fișier cu URL-uri

Creează `recipe_urls.txt` cu URL-urile rețetelor (un URL per linie):

```
https://www.allrecipes.com/recipe/example
https://www.jamieoliver.com/recipes/example
https://retetefeldefel.ro/example
```

#### 2. Extrage rețetele

```bash
/Users/danielprundeanu/Documents/GitHub/notion/.venv/bin/python scrape_recipes.py recipe_urls.txt scraped_recipes.txt
```

Scriptul va:
- ✓ Extrage automat ingrediente și cantități
- ✓ Identifica timpul și numărul de porții
- ✓ Salva pașii de preparare ca comentarii
- ✓ Converti în formatul corect pentru import

**Funcționează cu:**
- Site-uri care folosesc schema.org Recipe (majoritatea site-urilor moderne)
- AllRecipes, Jamie Oliver, BBC Good Food, etc.
- Site-uri românești de rețete

#### 3. Importă în Notion

```bash
/Users/danielprundeanu/Documents/GitHub/notion/.venv/bin/python import_recipes.py scraped_recipes.txt
```

### Metoda 2: Scriere manuală în fișier text

#### 1. Creează fișierul cu rețete

Folosește formatul din `recipe_example.txt`:

```
=== Nume Rețetă ===
Servings: 4
Time: 45
Difficulty: Medium
Category: Main Course
Favorite: Yes

[Nume Grup 1]
500g Ingredient 1
2 buc Ingredient 2
1 lingura Ingredient 3

[Nume Grup 2]
200ml Ingredient 4
Ingredient 5

=== Altă Rețetă ===
...
```

#### Format acceptat pentru ingrediente:

- **Cu cantitate și unitate**: `500g Faina`
- **Cu cantitate fără unitate**: `2 Oua`
- **Doar nume**: `Sare`
- **Cu grocery item specific**: `500g Faina (Faina alba)` - va căuta/crea "Faina alba" în Grocery List

#### Câmpuri opționale pentru rețetă:

- `Servings:` - număr de porții
- `Time:` - timp în minute
- `Difficulty:` - dificultate (**Easy** sau **Moderate**)
- `Category:` - categorie rețetă (**Breakfast**, **Lunch**, **Dinner**, **Snack**, **Smoothie**, **Smoothie Bowl**, **Soup**, **High Protein**, **Receipt**, **Extra**)
- `Favorite:` - Yes/No/Da/Nu

#### 2. Rulează importul

```bash
/Users/danielprundeanu/Documents/GitHub/notion/.venv/bin/python import_recipes.py recipe_example.txt
```

Sau cu fișierul tău:
```bash
/Users/danielprundeanu/Documents/GitHub/notion/.venv/bin/python import_recipes.py retete_mele.txt
```

## Ce face scriptul?

1. **Parsează fișierul text** și extrage toate rețetele
2. **Pentru fiecare rețetă**:
   - Creează intrarea în `Receipts 2.0`
   - Pentru fiecare ingredient:
     - Caută grocery item-ul în `Grocery List 2.0`
     - Dacă nu există, îl creează
     - Validează unitatea de măsură folosită
     - Creează ingredientul în `Ingredients 2.0` cu relațiile corespunzătoare
   - Grupează ingredientele folosind `Receipt Separator` (1, 2, 3...)

3. **La final** afișează warnings pentru:
   - Unități de măsură care nu se potrivesc cu cele din Grocery List
   - Erori întâlnite în timpul importului

## Validare unități

Scriptul verifică automat dacă unitatea folosită pentru un ingredient se potrivește cu unitățile definite în Grocery List 2.0 (`unity` și `2nd unity`).

**Dacă unitatea nu se potrivește, scriptul va OPRI EXECUȚIA** și va afișa:
- Ce unitate ai folosit
- Ce unități sunt definite în grocery item
- Soluții pentru rezolvare (conversie sau actualizare grocery item)

**Exemplu**:
- Grocery item "Faina" are `unity: g` și `2nd unity: cup`
- Dacă scrii `500g Faina` → ✓ OK - continuă
- Dacă scrii `2 cup Faina` → ✓ OK - continuă
- Dacă scrii `500ml Faina` → ❌ EROARE - oprește și cere conversie

**După ce rezolvi eroarea**, rulează din nou scriptul - rețetele deja importate nu vor fi duplicate.

## Troubleshooting

### Eroare: "Could not find database"
- Verifică că ai conectat toate cele 3 baze de date la integrare
- Verifică ID-urile în `notion.env`

### Ingredientul nu apare corect
- Verifică formatul în fișierul text
- Asigură-te că ai pus cantitate și unitate corect (ex: `500g` nu `500 g`)

### Unitate invalidă
- Verifică unitățile în Grocery List 2.0
- Actualizează `unity` sau `2nd unity` în grocery item
- SAU convertește cantitatea în fișierul text
