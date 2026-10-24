---
name: import-recipe
description: Importă rețete din link-uri (sau text lipit) direct în meal-planner, prin aceeași logică ca wizard-ul de import. Claude potrivește ingredientele cu produsele din DB, convertește unitățile și întreabă doar unde decizia e grea. Folosește când Daniel dă link-uri de rețete de pus în aplicație.
argument-hint: <link-uri sau text de rețetă>
---

# /import-recipe

Pune rețete în aplicație repede și corect. Tu (Claude) faci ce face Daniel în wizard (Review → Resolve),
iar scrierea trece prin `lib/import.ts` — aceeași funcție ca butonul Import. Vorbește cu Daniel în română.

**Scrie în baza de date de producție** (Neon, `DATABASE_URL` din `webapp/.env.local`). Nu importa nimic
fără confirmarea lui din pasul 5.

## Unealta

Totul rulează din `webapp/`:

```bash
cd /Users/danielprundeanu/Documents/GitHub/notion/webapp
NODE_NO_WARNINGS=1 npx tsx scripts/import-recipe.mts <comandă>
```

| Comandă | Ce face |
|---|---|
| `parse-urls <url...>` | scraper-ul aplicației + potrivire → JSON (`ParsedRecipe[]`) |
| `match <raw.json>` | potrivire pentru rețete extrase de tine (`RawRecipe` sau `RawRecipe[]`) → JSON |
| `items [căutare]` | produse (TSV: id, name, nameRo, unit, unit2, conversion, unitWeight, category) |
| `meta` | categorii de rețete, dificultăți, categorii de produse, unități folosite |
| `check <confirmed.json>` | validează payload-ul, nu scrie nimic |
| `import <confirmed.json>` | validează, apoi salvează; afișează link-urile rețetelor |

Fișierele JSON intermediare le pui în scratchpad, nu în repo.

## Pași

### 1. Citește rețetele
- Rulează `meta` o dată (categoriile și unitățile reale).
- Rulează `parse-urls` cu toate link-urile. Pentru fiecare rețetă cu `error` (site blocat, 403, fără date
  structurate) sau cu ingrediente/pași lipsă, citește pagina tu: `WebFetch`, iar dacă e blocată, browserul
  (încarcă întâi skill-ul `anthropic-skills:chrome-browser` sau `anthropic-skills:built-in-browser`).
  Scrie rezultatul ca `RawRecipe` și rulează `match`:
  ```json
  { "name": "…", "servings": 4, "batch": true, "time": 30, "difficulty": null, "category": null,
    "link": "https://…", "image": "https://…jpg", "favorite": false,
    "ingredients": [{ "name": "red onion", "qty": 1, "unit": "piece", "obs": "finely chopped",
                      "groupName": null, "groupOrder": 0 }],
    "instructions": [{ "text": "For the sauce", "isSection": true }, { "text": "Whisk …", "isSection": false }] }
  ```
  `name` = doar ingredientul (fără cantitate, paranteze sau „, chopped” — acelea merg în `obs`).
  Unități canonice: `g kg ml l tsp tbsp cup oz lb piece clove slice can stalk bunch head handful pinch`.
  `qty` e număr (½ → 0.5); „to taste” → `qty: null, unit: null`. `groupOrder` crește cu fiecare grup
  (`groupName` ca „For the sauce”; `null` pentru lista principală).
- Text lipit de Daniel: extrage-l tot ca `RawRecipe` și rulează `match`.

### 2. Rezolvă fiecare ingredient
Output-ul de la `parse-urls`/`match` are pe fiecare ingredient `match` și uneori `unitConflict`.

**Potrivire (`match.status`):**
- `matched` — e de încredere (regulă învățată sau nume exact). Verifică doar că are sens.
- `similar` — verifică `groceryItemName`; dacă e greșit, alege din `candidates` sau caută cu `items`.
- `new` — curăță numele scraper-ului (ex: `onion)` → `onion`, `stems choy sum)` → `choy sum`) și caută
  cu `items <cuvânt>` (EN și RO). Abia dacă nu există nimic potrivit creezi un produs nou.
- Când alegi tu produsul (orice nu e `matched`), pune `saveMapping: true` și `groceryItemName`, ca
  aplicația să-l potrivească singură data viitoare.

**Produs nou (`newItem`):** `name` în engleză, cu literă mare (ca produsele existente); `unit` = unitatea
de bază: `g` pentru solide, `ml` pentru lichide, `piece` pentru ce se numără; `category` exact una din
`groceryCategories` (cu emoji). Dacă rețeta folosește altă unitate (ex: `cup`), pune-o ca `unit2` cu
`conversion` (1 unit2 = conversion × unit), sau convertește cantitatea în `unit`.

**Unități — regula de bază:** `unit` al ingredientului trebuie să fie una din unitățile produsului
(`unit`/`unit2` din `items`). Altfel nutriția și lista de cumpărături ies greșit.
- `unitConflict.autoResolved: true` → aplică regula salvată: `qty = qty × factor`, `unit = targetUnit`.
- `unitConflict` nerezolvat → convertește tu:
  - conversii standard (le faci singur): 1 tsp = 5 ml, 1 tbsp = 15 ml = 3 tsp, 1 cup = 240 ml = 16 tbsp,
    1 oz = 28.35 g, 1 lb = 453.6 g, 1 kg = 1000 g, 1 l = 1000 ml; `clove`→`piece` pentru „Garlic clove” = 1.
  - conversii care țin de ingredient (cup făină → g, piece ceapă → g, tbsp unt → g): dacă produsul are
    `conversion`/`unitWeight`, folosește-le; altfel estimează doar valori culinare sigure (1 cup făină ≈
    120 g, 1 tbsp unt ≈ 14 g); dacă nu ești sigur, întreabă.
  - adaugă `{ "name", "foreignUnit", "targetUnit", "factor" }` în `newUnitRules` pentru fiecare conversie
    pe care ai decis-o tu (nu pentru cele `autoResolved`), ca aplicația s-o învețe.
  - alternativ, dacă produsul nu are `unit2` și unitatea rețetei e una naturală pentru el, poți seta
    `addUnit2: true` + `unit2Conversion` (1 unit2 = unit2Conversion × unit) și păstrezi `qty`/`unit`.
- `unitConflict` lipsă, dar unitatea nu e a produsului (se întâmplă la `similar`/candidați aleși de tine)
  → aceeași regulă: convertește.

### 3. Rețeta
- `servings` = câte porții dă rețeta; `batch: true` (cantitățile rămân totaluri pentru N porții).
  Folosește `batch: false` doar dacă Daniel o cere — atunci cantitățile sunt împărțite la `servings`.
- `category`: una sau mai multe din `recipeCategories` (de obicei masa: Breakfast/Lunch/Dinner/Snack),
  despărțite prin `, `. `difficulty`: `Easy` sau `Moderate`. `time` în minute (total).
- `nameRo`: traducerea în română a titlului (folosită doar la căutare).
- `image`: URL-ul imaginii din pagină. `link`: URL-ul rețetei.
- Păstrează pașii; titlurile de secțiune ca `isSection: true`.
- **Rețetă în rețetă** (ex: un sos sau un dip pe care Daniel îl vrea ca rețetă separată): pune rețeta
  folosită mai devreme în payload și, pe cea care o folosește, `references: [{ "refIndex": <index>,
  "quantity": 150, "unit": "g", "groupOrder": <după grupurile de ingrediente> }]`. `unit` = `g` (grame
  din greutatea totală a rețetei) sau `serving`. Pentru o rețetă existentă folosește `refRecipeId`.

### 4. Întreabă doar ce e greu — o singură dată
Strânge toate deciziile nesigure din toate rețetele și pune-le într-un singur `AskUserQuestion`
(max 4 întrebări pe apel; grupează): potrivire ambiguă între două produse existente, creare de produs nou
când există ceva aproape, conversii de care nu ești sigur, rețetă deja importată (`check` avertizează).
Dă mereu varianta recomandată prima. Nu întreba ce poți decide singur din regulile de mai sus.

### 5. Confirmă și importă
1. Scrie `{ "recipes": ConfirmedRecipe[], "newUnitRules": [...] }` (tipurile sunt în `webapp/lib/import.ts`).
   Ingredient confirmat: `name` (numele din rețetă), `qty`, `unit`, `obs`, `groupName`, `groupOrder`,
   `order`, plus `groceryItemId` **sau** `newItem`, și opțional `saveMapping`/`groceryItemName`/
   `addUnit2`/`unit2Conversion`.
2. Rulează `check`. Repară toate ❌; citește ⚠️ (duplicate, fără pași).
3. Arată-i lui Daniel un rezumat scurt pe rețetă: porții, categorie, ingredientele cu produsul ales și
   cantitatea finală, produsele noi și conversiile decise de tine. Cere confirmarea (`AskUserQuestion`).
4. Rulează `import` și dă-i link-urile din output.

## Rețete care există deja
`check` avertizează la link sau nume deja existent. Atunci compară rețeta din aplicație cu pagina
(ingrediente, cantități, unități, pași, porții, link, poză). Dacă e bună, n-o importa din nou. Dacă are
greșeli (produse greșite, cantități absurde ca „1 g” de rădăcină, pași lipsă) și Daniel e de acord,
refă-o pe loc: pune `"replaceRecipeId": "<id>"` pe rețeta din payload — se rescriu câmpurile, ingredientele,
pașii și referințele, iar id-ul (planner, rețetele care o folosesc) rămâne. Payload-ul trebuie să fie
rețeta completă, nu doar diferențele. Spune-i lui Daniel exact ce se schimbă.

## Ce nu face
- Nu scrie direct în tabele (fără SQL/Prisma ad-hoc) — doar prin `import`.
