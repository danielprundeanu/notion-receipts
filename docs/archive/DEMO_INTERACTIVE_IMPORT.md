# 🎬 Demo: Import Interactiv cu Ingredient Nou

## Simulare Pas-cu-Pas

Acest document arată cum arată procesul interactiv când adaugi un ingredient nou în Grocery List.

### Setup
```bash
# Creăm o rețetă de test cu ingredient nou
cat > data/test/demo_recipe.txt << 'EOF'
=== Smoothie Bowl cu Quinoa ===
Servings: 2
Time: 10
Difficulty: Easy

[1]
50g quinoa coapta
1buc banana
100g berries
30ml lapte migdale

Method:
1. Blend banana cu laptele
2. Add berries
3. Top cu quinoa
EOF

# Importăm în Notion
notion-import data/test/demo_recipe.txt
```

### Output Interactiv (Exemplu)

```
============================================================
Import Rețete în Notion
============================================================

Importez: Smoothie Bowl cu Quinoa
Servings: 2 | Time: 10 | Difficulty: Easy

────────────────────────────────────────────────────────────
Procesez Ingrediente
────────────────────────────────────────────────────────────

[Ingredient 1/4] 50g quinoa coapta
  📋 Folosesc mapare salvată: 'quinoa coapta' → 'quinoa'
  ✓ Găsit grocery item existent: quinoa

[Ingredient 2/4] 1buc banana
  ✓ Găsit grocery item existent: banana

[Ingredient 3/4] 100g berries

  Găsite 3 grocery items similare cu 'berries':
    1. Blueberries
    2. Strawberries  
    3. Mixed Berries
    0. Creează item nou: berries

  Selectează (0-3): 3
  ✓ Folosit grocery item existent: Mixed Berries
  💾 Mapare salvată: 'berries' → 'Mixed Berries'

[Ingredient 4/4] 30ml lapte migdale

  Grocery item 'lapte migdale' nu există în baza de date.
  Creez 'lapte migdale' în Grocery List? (y/n): y

────────────────────────────────────────────────────────────
Configurare grocery item nou: lapte migdale
────────────────────────────────────────────────────────────

📏 Selectează Unity (unitate principală):
    1. piece
    2. tsp
    3. tbsp
    4. g
    5. slice
    6. handful
    7. pinch
    8. ml
    9. scoop
    10. bottle
    11. cup

  Selectează Unity (1-11): 8
  ✓ Unity: ml

📏 Selectează 2nd Unity (unitate secundară - opțional):
    1. cup
    2. piece
    3. tbsp
    4. tsp
    0. Skip (fără 2nd Unity)

  Selectează 2nd Unity (0-4): 1
  ✓ 2nd Unity: cup

🔄 Conversion factor: câte ml sunt într-un cup?
   Exemplu: dacă 1 cup = 240ml, introduce 240
   Conversion (sau ENTER pentru skip): 240
  ✓ Conversion: 1 cup = 240.0 ml

🏷️ Selectează Category:
    1. 🍎 Fruits
    2. 🥕 Veg & Legumes
    3. 🌾 Grains
    4. 🫙 Pantry
    5. 🥩 Meat & Alt
    6. 🥛 Dairy
    7. 🥫 Canned
    8. 🫕 Sauces & Condiments
    9. 🥜 Nuts & Seeds
    10. 🧂Fresh Herbs & Spices
    11. 🌵 Dried Herbs & Spices
    12. 🥑 Healthy Fats
    13. 🍸 Drinks
    14. 🥘 Homemade Receipts
    15. Other
    16. 🧴 Supplies

  Selectează Category (1-16): 13
  ✓ Category: 🍸 Drinks

🔍 Informații nutriționale (per 100g):

🔍 Caut informații nutriționale pentru 'lapte migdale'...
  ❌ Nu am găsit 'lapte migdale' în baza de date
  💡 Sugestie: Încearcă numele în engleză sau un nume mai generic

  💡 Poți introduce manual sau skip (valori vor fi 0)
  Introduc manual? (y/n): y
    KCal / 100g: 17
    Carbs / 100g: 0.6
    Fat / 100g: 1.1
    Protein / 100g: 0.4

────────────────────────────────────────────────────────────
✓ Configurare completă pentru 'lapte migdale'
  Unity: ml | 2nd Unity: cup
  Conversion: 1 cup = 240.0 ml
  Category: 🍸 Drinks
  Macros: 17.0 kcal | 0.6g carbs | 1.1g fat | 0.4g protein
────────────────────────────────────────────────────────────

  + Creat grocery item nou: lapte migdale

────────────────────────────────────────────────────────────
✓ Toate ingredientele procesate
────────────────────────────────────────────────────────────

✓ Rețetă creată: Smoothie Bowl cu Quinoa
  Link: https://notion.so/...

============================================================
✓ 1 rețetă importată cu succes
============================================================

✓ 1 mapări noi salvate în data/ingredient_mappings.json
```

### Rezultat în Notion

**Grocery List - Item Nou Adăugat:**
```
┌─────────────────────────────────────────────────────┐
│ Name: lapte migdale                                  │
│ Unity: ml                                            │
│ 2nd Unity: cup                                       │
│ Conversion: 240                                      │
│ Category: 🍸 Drinks                                  │
│ KCal / 100g: 17                                      │
│ Carbs / 100g: 0.6                                    │
│ Fat / 100g: 1.1                                      │
│ Protein / 100g: 0.4                                  │
└─────────────────────────────────────────────────────┘
```

**Rețeta în Receipts 2.0:**
- Toate ingredientele linked corect
- Macronutrienții calculați automat pe baza cantităților
- Template aplicat (manual, Notion API limitation)

### Note

1. **Bază de date**: Căutarea se face mai întâi în LOCAL_NUTRITION_DB (80+ alimente)
2. **Mapări**: Învață automat mapări pentru viitor ('berries' → 'Mixed Berries')
3. **Validare**: Unity și Category sunt validate din schema Notion
4. **Fallback**: Dacă nu găsește nutriție, permite introducere manuală sau skip (0)

### 🎯 Avantaje

- **⚡ Rapid**: Ingredient comun (ex: banana) → instant (din bază locală)
- **🎓 Învață**: Mapările sunt salvate pentru import viitor
- **✅ Validat**: Nu poți introduce unități sau categorii invalide
- **🔢 Precis**: Macronutrienți din surse verificate (USDA, Romanian DB)
- **🇷🇴 Bilingv**: Funcționează cu nume RO și EN
