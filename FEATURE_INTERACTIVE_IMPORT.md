# 🆕 Funcționalitate Nouă: Import Interactiv cu Macronutrienți

## Descriere

Atunci când imporți rețete în Notion și scriptul întâlnește un ingredient care nu există în **Grocery List**, vei fi ghidat printr-un proces interactiv de configurare completă:

### 1️⃣ Selectare Unity (Unitate Principală)
Alegi din lista de unități disponibile în Notion:
- `piece`, `tsp`, `tbsp`, `g`, `slice`, `handful`, `pinch`, `ml`, `scoop`, `bottle`, `cup`

### 2️⃣ Selectare 2nd Unity (Unitate Secundară - Opțional)
Poți adăuga o unitate secundară pentru conversii:
- `cup`, `piece`, `tbsp`, `tsp`
- Exemplu: Pentru făină, Unity=`g`, 2nd Unity=`cup`

### 3️⃣ Conversion Factor (Opțional)
Dacă ai ales 2nd Unity, definești factorul de conversie:
- Exemplu: 1 cup = 240ml → Conversion = `240`

### 4️⃣ Selectare Category
Alegi categoria ingredientului din:
- 🍎 Fruits
- 🥕 Veg & Legumes
- 🌾 Grains
- 🫙 Pantry
- 🥩 Meat & Alt
- 🥛 Dairy
- 🥫 Canned
- 🫕 Sauces & Condiments
- 🥜 Nuts & Seeds
- 🧂Fresh Herbs & Spices
- 🌵 Dried Herbs & Spices
- 🥑 Healthy Fats
- 🍸 Drinks
- 🥘 Homemade Receipts
- Other
- 🧴 Supplies

### 5️⃣ Macronutrienți (Automat sau Manual)

#### 🔍 Căutare Automată
Scriptul caută automat în **baza de date locală** cu peste 80+ alimente comune (RO + EN):
- Carne: piept pui, pulpa pui, carne tocată, somon, ton, ouă
- Lactate: brânză de vaci, iaurt grecesc, lapte, parmezan, mozzarella
- Cereale: fulgi ovaz, orez, paste, quinoa, pâine, naut, linte, fasole
- Fructe: banane, măr, portocală, căpșuni, afine, avocado
- Legume: broccoli, spanac, roșii, morcov, castravete, ardei, ceapă, usturoi, cartofi
- Nuci: migdale, nuci, unt de arahide, semințe chia, semințe in
- Uleiuri: ulei măsline, ulei cocos, unt
- Altele: miere, sirop arțar, ciocolată neagră

#### ✍️ Introducere Manuală
Dacă ingredientul nu este găsit, poți introduce manual:
- KCal / 100g
- Carbs / 100g
- Fat / 100g
- Protein / 100g

Sau poți face skip (valorile vor fi 0).

## 📊 Sursa Datelor Nutriționale

Datele din baza locală sunt preluate din:
- **USDA SR Legacy** (Standard Reference)
- **Romanian Food Composition Database**
- Valori verificate și standardizate pentru 100g

## 💡 Exemple de Workflow

### Exemplu 1: Ingredient Românesc
```
Grocery item 'nuci' nu există în baza de date.
Creez 'nuci' în Grocery List? (y/n): y

🔍 Caut informații nutriționale pentru 'nuci'...
  Găsite 1 alimente în baza locală:
    1. ✓ nuci
       KCal: 654.0/100g | Carbs: 14.0g/100g | Fat: 65.0g/100g | Protein: 15.0g/100g
    0. Introduc manual

  Selectează (0-1): 1
  ✓ Selectat: nuci

📏 Selectează Unity:
    1. piece
    2. tsp
    3. tbsp
    4. g
    ...
  Selectează Unity (1-11): 4
  ✓ Unity: g

📏 Selectează 2nd Unity:
    1. cup
    ...
    0. Skip
  Selectează (0-4): 0
  ⊗ Fără 2nd Unity

🏷️ Selectează Category:
    ...
    9. 🥜 Nuts & Seeds
    ...
  Selectează Category (1-16): 9
  ✓ Category: 🥜 Nuts & Seeds

✓ Configurare completă pentru 'nuci'
  Unity: g
  Category: 🥜 Nuts & Seeds
  Macros: 654 kcal | 14g carbs | 65g fat | 15g protein
```

### Exemplu 2: Ingredient Necunoscut (Manual)
```
Grocery item 'protein powder' nu există în baza de date.
Creez 'protein powder' în Grocery List? (y/n): y

🔍 Caut informații nutriționale pentru 'protein powder'...
  ❌ Nu am găsit 'protein powder' în baza de date
  💡 Sugestie: Încearcă numele în engleză sau un nume mai generic

  💡 Poți introduce manual sau skip
  Introduc manual? (y/n): y
    KCal / 100g: 375
    Carbs / 100g: 8
    Fat / 100g: 3
    Protein / 100g: 80

📏 Selectează Unity:
    ...
    9. scoop
  Selectează Unity (1-11): 9
  ✓ Unity: scoop

📏 Selectează 2nd Unity:
    0. Skip
  Selectează (0-4): 0

🏷️ Selectează Category:
    ...
    5. 🥩 Meat & Alt
  Selectează Category (1-16): 5
  ✓ Category: 🥩 Meat & Alt

✓ Configurare completă pentru 'protein powder'
  Unity: scoop
  Category: 🥩 Meat & Alt
  Macros: 375 kcal | 8g carbs | 3g fat | 80g protein
```

## 🎯 Beneficii

1. **🔢 Calcul Automat**: Macronutrienții sunt calculați automat pentru fiecare rețetă
2. **📊 Consistență**: Toate ingredientele au date nutriționale complete
3. **⚡ Rapiditate**: Baza locală oferă răspunsuri instantanee fără API calls
4. **🇷🇴 Suport Românesc**: Nume de ingrediente în limba română
5. **✅ Validare**: Unitățile sunt validate din lista Notion (evită erori)
6. **🗂️ Organizare**: Categoriile ajută la organizarea Grocery List

## 📝 Note Tehnice

- **Baza locală**: `scripts/nutrition_api.py` → `LOCAL_NUTRITION_DB`
- **Căutare**: Exact match + Partial match (case-insensitive)
- **Cache**: Grocery items sunt cached pentru a evita duplicate API calls
- **Fallback**: Dacă baza locală nu găsește, permite introducere manuală

## 🔧 Extindere Bază de Date

Pentru a adăuga mai multe alimente în baza locală, editează:
```python
# scripts/nutrition_api.py
LOCAL_NUTRITION_DB = {
    'nume_ingredient': {'kcal': X, 'carbs': Y, 'fat': Z, 'protein': W},
    # ... 
}
```

Valorile trebuie să fie **per 100g**.

## 🚀 Cum Folosești

Simplu! Rulează comanda normală de import:
```bash
notion-import data/scraped_recipes.txt
```

Scriptul va detecta automat ingredientele noi și te va ghida prin procesul de configurare interactivă. 🎉
