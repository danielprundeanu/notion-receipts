# Changelog

## [0.26.0] — 2026-07-22

### ✨ Features
- **English UI** — the entire interface was translated from Romanian to English: navigation, recipes, planner, grocery list, ingredients, the import wizard, settings, and all user-facing error messages. `lib/labels.ts` was simplified (display labels are now near-identity over the already-English DB values; `groceryCategoryLabel` just strips the emoji prefix). Stored DB values, `?cat=` filters and comparisons are untouched.
- **Manual grocery-list items** — add products by hand to a given week, alongside the ones generated from the planner.
- **Ingredients table/list view** — toggle between the editable table and a compact card list.

### 🐛 Fixes
- Nutrition and import flow fixes.

### 🎨 UI / UX
- **Planner** — week days now fill the full width on mobile (7 equal columns instead of a scrolling row).
- **Recipes** — the "New recipe" button is now a compact "+" icon.
- **Recipe detail** — "Add to planner" and "Edit" are now icon buttons.
- Dates use the `en-US` locale; day abbreviations are Mon–Sun.

### ⚙️ Internals
- Docs (`CLAUDE.md`, `webapp/UX_CONVENTIONS.md`) updated to state the UI is English and to describe the label helpers' new role.

## [0.25.0] — 2026-07-21

### ♿ Accesibilitate & mobil
- **Ținte tactile mărite (long-tail)** — butoane de închidere, toggle favorite, „Adaugă în planner"/„Editează", stepperele din modale, comutatorul de temă, chip-urile de categorie, butonul de adăugare masă.
- **Navigație accesibilă** — etichetele din bara de jos + sidebar traduse în română, `aria-current` pe pagina activă, contrast îmbunătățit pe etichetele inactive, `aria-label` pe săgețile de navigare între săptămâni.
- **Tastatură numerică pe mobil** — `inputMode="decimal"` pe câmpurile numerice (cantități, conversii, nutriție).
- Shell-ul folosește `100dvh` în loc de `100vh` — fără conținut tăiat de bara browserului pe mobil.

### 🐛 Fixes
- **Favorite fără eșec silențios** — toggle-ul de favorite face rollback dacă salvarea eșuează.
- **Stare de gol corectă** — filtrul „Favorite" fără rezultate arată „Încearcă o altă căutare", nu „Adaugă prima ta rețetă".
- **Rute API mai robuste** — `search-items` prins în try/catch; `nutrition` nu mai scurge mesajul intern de eroare către client; upload-ul de imagine din import are limită de dimensiune (10MB).
- **Confirmare la deconectare** — evită sign-out accidental pe mobil.

## [0.24.0] — 2026-07-21

### 🎨 UI / UX
- **Tabelul de ingrediente, utilizabil pe mobil** — sub `md`, tabelul de 13 coloane (scroll orizontal, celule minuscule) e înlocuit cu o listă de carduri: nume + traducere · categorie · unitate, plus macro-uri (kcal / P / C / G); tap pe card deschide editorul. Tabelul complet rămâne pe desktop.
- **Audit unități** — coloanele de context (Folosiri, Exemple rețete, Unitățile produsului) se ascund pe mobil, ca tabelele să încapă fără scroll orizontal.
- Header-ul și bara de filtre din Ingrediente se împachetează pe ecrane înguste.

## [0.23.0] — 2026-07-21

### 🌍 i18n / UI
- **Interfața complet în română** — planner, listă de cumpărături, detaliu rețetă, listă rețete, ingrediente și formularul de rețetă au fost traduse (titluri, butoane, placeholdere, mesaje, capete de tabel, stări goale, nutriție). Datele apar acum localizate (`ro-RO`, ex. „20 iul.").
- **Etichete vs. valori (fără regresii)** — categoriile, tipul de masă (`mealType`) și dificultatea rămân stocate în engleză (filtrarea, URL-urile `?cat=` și rețetele existente nu se schimbă), dar se afișează în română printr-un modul comun de etichete (`lib/labels.ts`: `mealLabel`/`categoryLabel`/`difficultyLabel`/`groceryCategoryLabel`).

### 📄 Docs
- `webapp/UX_CONVENTIONS.md` — regulile UX & i18n pentru dezvoltare (mobil-first & touch targets, fără eșecuri silențioase, map-urile de etichete pentru valorile-DB, anti-flash temă, imagini pe blob), cu pointer în `CLAUDE.md` ca să fie respectate la update-urile viitoare.

## [0.22.0] — 2026-07-21

### 🎨 UI / UX
- **Fără flash de temă la pornire** — un script inline aplică tema (dark/light) înainte de primul paint, oglindind logica din ThemeProvider; nu mai apare clipirea albă la cold-load, mai ales în PWA-ul instalat pe dark.
- **Ținte tactile mai mari pe mobil** — stepperele de porții (detaliu rețetă + planner) 28→40px, săgețile de navigare a săptămânilor ~44px (planner + listă cumpărături), rândurile de bifare din lista de cumpărături mai înalte.
- **Selecție rețete pe mobil** — în modul selecție, tap pe card selectează rețeta în loc să o deschidă (pe mobil nu există hover pentru checkbox).
- **Ștergere vizibilă în planner pe mobil** — buton de ștergere mereu prezent pe card (swipe-ul rămâne scurtătură).
- **Import pe mobil** — comparația „Din text / Se importă" se stivuiește vertical în loc să trunchieze pe două coloane.

## [0.21.0] — 2026-07-21

### 🐛 Fixes
- **Grila de rețete nu mai poate fi dărâmată de o imagine remote** — cardurile trimit URL-urile locale/blob prin `next/image` și orice host remote neconfigurat printr-un `<img>` simplu, deci o singură copertă scrapuită nu mai prăbușește toată lista (ecranul principal pe mobil).
- **Upload imagine în wizardul de import** — mutat pe Vercel Blob (ca uploadul de copertă din v0.19); eșecul e acum vizibil în UI, nu tăcut.
- **Importul nu mai stochează base64 în DB** — coperțile inline se urcă pe blob; dacă nu se poate, se renunță la imagine (null) în loc să persiste string-ul base64.
- **Planner fără eșecuri tăcute** — adăugarea/ștergerea/schimbarea porțiilor fac rollback la starea anterioară și arată un mesaj dacă salvarea eșuează; un add eșuat nu mai lasă un card „fantomă" cu id temporar.
- **Editarea inline din Ingredients** — o salvare eșuată revine la valoarea veche + mesaj (înainte părea salvată dar nu era).
- **Modale fără spinner blocat** — „Adaugă în planner" (din rețetă și din slotul de planner) și editorul de produs tratează erorile: butonul nu mai rămâne blocat în spinner, apare un mesaj.
- **Fără spinner infinit la încărcare** — planner / listă cumpărături / ingrediente nu mai rămân blocate pe „se încarcă" la eroare; lista de cumpărături arată „Reîncearcă".
- **Nutriția din rețete se împrospătează** — editarea unui produs (kcal, unități) revalidează paginile de rețetă și lista de cumpărături.
- **Coperta nu se mai pierde** — Save în editorul de rețetă e blocat cât timp se încarcă imaginea.

### ⚙️ Internals
- Ambele rute de upload (`/api/upload-recipe-image`, `/api/import/upload-image`) și fallback-ul base64 din import folosesc Vercel Blob când `BLOB_READ_WRITE_TOKEN` e setat (store trebuie **public**), cu fallback pe filesystem în dev.

## [0.20.0] — 2026-07-21

### 🐛 Fixes
- **Fără pierdere de date la editarea/crearea rețetei** — `updateRecipe`/`createRecipe` rulează acum într-o tranzacție (`$transaction`): update-ul, ștergerea și recrearea ingredientelor/instrucțiunilor sunt all-or-nothing. O eroare la mijloc (timeout Neon, funcție serverless rece) nu mai poate goli o rețetă.
- **Import atomic per rețetă** — fiecare rețetă importată (rețetă + ingrediente + instrucțiuni + produse noi) se comite integral sau deloc; la eșec în mijloc, răspunsul spune câte rețete au reușit, ca să știi de unde reiei.
- **Ștergerea unui produs folosit e blocată** — un produs folosit în rețete nu mai poate fi șters (înainte lăsa tăcut ingrediente fără nume în rețetele partajate). Modalul și ștergerea în masă arată clar în câte rețete e folosit.
- **Lista de cumpărături nu mai adună unități diferite** — cantitățile aceluiași produs în unități diferite (ex. 200 g + 1 cup) apar ca linii separate, nu însumate greșit într-un total fără sens.
- **Validare porții în planner** — porții 0/negative/NaN sunt normalizate la minim 1 (înainte ascundeau ingrediente din listă sau produceau nutriție negativă).
- **Filtrele Recipes nu mai sparg URL-ul** — link-urile de categorie codifică acum `q` (o căutare cu `&` sau `#` nu mai rupe adresa) și păstrează sortarea aleasă.

### 🎨 UI / UX
- **Iconițe custom în navigație** — BottomNav (mobil) și Sidebar (desktop) folosesc iconițe `.webp` proprii în locul celor lucide.
- **Protecție la pierderea muncii** — formularul de rețetă avertizează (`beforeunload` + confirmare la „Cancel") când ai modificări nesalvate; progresul din wizardul de import se păstrează la refresh/back (sessionStorage); bifele din lista de cumpărături persistă per săptămână (localStorage).
- **Acțiuni în masă (Ingredients)** — selecția se golește la schimbarea filtrului (nu mai lovesc rânduri ascunse) și butoanele nu mai rămân blocate în „busy" la eroare.

### ⚙️ Internals
- Tranzacții interactive Prisma pentru scrierile multi-pas (rețete + import); `deleteGroceryItem`/`deleteGroceryItems` verifică referințele înainte de ștergere.
- `RecipesGrid`: modul de vizualizare mutat pe `useSyncExternalStore` (localStorage + eveniment `viewchange`) — corect la mount, fără hydration mismatch.
- Iconițe noi în `public/icons/*.webp`.

## [0.19.0] — 2026-07-20

### ✨ Features
- **Retheme „Orange & Teal"** — neutrele au trecut de la gri pur la un gri **cald („Sand")**, mai apetisant și mai coerent cu portocaliul, plus un accent secundar **teal** (linkuri/acțiuni secundare). Aplicat central: remap al scalei `gray` din Tailwind (`@theme`) + tokenuri light/dark actualizate în `globals.css`; portocaliul rămâne brand.
- **Selecție multiplă pe pagina Recipes** — buton „Select" pe bara de filtrare (mobil + desktop) care activează checkbox-urile pe fiecare rețetă (înainte apăreau doar la hover, deci invizibile pe mobil); selectare totală + ștergere în bloc.
- **Filtrele Recipes rămân setate** — căutarea/categoria/favorite/sortarea se rețin (sessionStorage) și se restaurează când revii pe `/recipes` din back, sidebar sau „înapoi la rețete".
- **Sugestie AI pentru conversie** — la introducerea unei a 2-a unități, un buton „✨ Sugestie AI" estimează factorul de conversie (ex. 1 cup ≈ 123 g). Disponibil în cardul de ingredient, în editorul de rețetă și în ecranul Audit unități.
- **Upload imagine rețetă cu drag-and-drop** — tragi imaginea direct în chenar (sau peste preview pentru înlocuire), cu validare de tip/mărime și mesaje clare.

### 🐛 Fixes
- **Upload imagine rețetă pe producție** — pe Vercel filesystemul e read-only, deci scrierea în `public/` eșua tăcut (500). Mutat pe **Vercel Blob** (persistent), cu fallback pe filesystem în dev și erori clare în client.
- **Ingredients** — X pentru golirea căutării; categoria editabilă ca dropdown și în tabel (nu doar în card); iconița de edit mutată pe prima coloană (mai ușor pe mobil).

### 🎨 UI / UX
- Footer-ul cardului de ingredient rearanjat: **Șterge** izolat în stânga, **Anulează + Save** grupate în dreapta (mai puțin mis-tap pe mobil).

### ⚙️ Internals
- `next.config`: `images.remotePatterns` pentru `*.public.blob.vercel-storage.com`; dependință nouă `@vercel/blob` (necesită `BLOB_READ_WRITE_TOKEN` pe Vercel).
- `globals.css`: scala `gray` remapată la „Sand" via `@theme` + token nou `--color-secondary` (teal, light/dark).

## [0.18.0] — 2026-07-20

### ✨ Features
- **Căutare bilingvă (RO/EN) + fără diacritice pentru rețete** — căutarea din pagina de rețete și din planner găsește acum rețetele indiferent de limba în care scrii și indiferent de diacritice: „supa" sau „pui" găsesc rețete cu titlu în engleză (ex. „Chicken Soup", „Big Greek Salad with Grilled Chicken"). Fiecare rețetă a primit un titlu tradus în cealaltă limbă (folosit doar la căutare) și un câmp normalizat pe care se face matching-ul. Cele ~199 de titluri existente au fost traduse; rețetele noi sau editate sunt traduse automat la salvare (Claude Haiku, best-effort — degradează elegant fără cheie API).

### ⚙️ Internals
- `Recipe`: câmpuri noi `nameRo` + `searchText` (aplicate pe Neon). Utilitar `lib/search.ts` (`normalizeSearch` / `buildRecipeSearchText`, folosit identic la stocare și la interogare). `createRecipe`/`updateRecipe` populează ambele câmpuri; `getRecipes` / `searchRecipesForPlanner` / `getRecipesPanel` fac match pe `searchText`.

## [0.17.0] — 2026-07-20

### ✨ Features
- **Referințe în cardul de ingredient** — la editarea unui ingredient (`/ingredients`) apare secțiunea „Folosit în", cu rețetele care-l folosesc, ca chip-uri clickabile care duc direct la rețetă.
- **Taguri libere în editorul de rețetă** — pe lângă categoriile predefinite, un chip „+ Tag" la coada listei permite adăugarea de categorii proprii (deocamdată pentru organizare/căutare, fără afișare separată).
- **Management în masă al ingredientelor** — selectare multiplă în tabelul `/ingredients` (inclusiv „tot ce e vizibil"), ștergere în bloc și setare de categorie pentru mai multe produse deodată.

### 🎨 UI / UX
- **Audit unități rafinat** — se listează doar produsele a căror nutriție chiar contează (au kcal/proteine setate), cu unitățile problematice afișate explicit și link direct la produs/rețetă.

### ⚙️ Internals
- Acțiuni noi `getRecipesUsingGroceryItem`, `deleteGroceryItems`, `setGroceryItemsCategory`.
- Script one-off `scripts/merge-categories.ts` (dry-run + `--apply`, cu backup JSON) pentru unificarea/redenumirea categoriilor de ingrediente.

## [0.16.0] — 2026-07-20

### ✨ Features
- **Nutriție corectă pe unități „la bucată"** — calculul de nutriție (planner + detaliu rețetă) convertește acum cantitatea în grame după **unitatea ingredientului** (g/ml direct, a 2-a unitate cu conversie, sau greutate pe bucată `unitWeight`), nu doar după unitatea primară a produsului. „1 avocado" / „1 chicken breast" nu mai era socotit ca „1 gram". Logică comună extrasă în `lib/nutrition.ts`.
- **Ecran „Audit unități"** (`/ingredients/audit`) — listează produsele folosite la bucată fără greutate (cu completare `g/buc` pe loc, care se propagă automat în toate rețetele care le folosesc) și nepotrivirile de unitate (cu link la rețetă). Permite repararea în masă a erorilor sistematice după un import, fără editare rețetă cu rețetă.
- **Editor rețetă îmbunătățit** — dificultate „Hard" (+ păstrarea oricărei valori din import care nu e în listă), reordonare ingrediente în cadrul unui grup (săgeți sus/jos) și editare directă a produsului (unități + nutriție) din editorul rețetei, chiar când produsul are deja 2 unități.

### 🐛 Fixes
- **Import — produse noi „la bucată"** — un „1 chicken breast" care creează un produs nou primește acum unitatea `piece` (nu `g`/fără unitate), ca să poată avea greutate pe bucată și nutriție corectă. Extinde fix-ul din 0.15.0 de la produsele existente la cele nou create.
- La editarea nutriției unui produs din editorul de rețetă, unitatea deja aleasă a ingredientului nu mai e schimbată tăcut dacă rămâne validă.

### 🎨 UI / UX
- Avertisment la pasul de import pentru unitățile nerezolvate (se importă ca „piece"), cu trimitere către „Audit unități".

### ⚙️ Internals
- Script one-off `webapp/scripts/fix-piece-unitweights.ts` (dry-run + backup JSON + `--apply`, idempotent) pentru completarea `unitWeight` la produsele folosite la bucată.
- Actualizată nota din `CLAUDE.md`: „learn from past imports" e acum DB-backed (`IngredientNameMapping` / `UnitRule`) și funcționează în producție — nu mai depinde de fișierele JSON locale.

## [0.15.0] — 2026-07-20

### ✨ Features
- **Acces controlat cu login** — aplicația e protejată integral de un ecran de autentificare (Auth.js v5, provider Credentials, sesiuni JWT). Conturi predefinite (fără signup public), create prin seed; middleware care blochează toate rutele mai puțin `/login`, `/api/auth/*` și asset-urile statice.
- **Erori de import mai clare la URL** — detecție a link-urilor video/social (Instagram, YouTube, TikTok…) cu mesaj dedicat; diferențiere între site blocat (403/Cloudflare), timeout și „fără rețetă structurată"; `maxDuration=30` pe ruta de parse pentru site-uri lente.

### 🎨 UI / UX
- **Bară de filtre sticky pe mobil** — la scroll, bara de căutare + chip-uri rămâne fixată sus, cu căutarea transformată într-un chip; tranziție lină la fixare; chip-urile pe un singur rând scrollabil.
- **Spațiu între bara de filtre și grila de rețete pe desktop** — bara nu mai e lipită de carduri.
- **Tag de categorie în vizualizarea listă pe mobil.**

### 🐛 Fixes
- **Import — unitate lipsă pe produse măsurate în greutate** — o cantitate fără unitate (ex. „1 chicken breast") potrivită cu un ingredient măsurat doar în g/ml era importată tăcut fără unitate; acum e tratată ca „piece" și cere conversia la pasul de resolve (cu sugestie AI + salvare ca `UnitRule`), în loc să ajungă în DB fără unitate.
- **Clearance pentru bara de navigație de jos** — conținutul din josul paginilor (detaliu rețetă, listă) nu mai e ascuns sub bottom-nav pe mobil (spacer global în layout).
- **Middleware auth** — `manifest.webmanifest` exclus din matcher (nu mai e redirecționat către login).

### ⚙️ Internals
- Model Prisma `User` + tabel pe Neon; variabilă `AUTH_SECRET` necesară (Vercel + `.env.local`); script `scripts/seed-users.ts` pentru crearea conturilor. Dependențe noi: `next-auth@5`, `bcryptjs`.

## [0.14.0] — 2026-07-18

### ✨ Features
- **Grid 2 coloane pe mobile** — opțiune nouă de afișare în pagina de rețete: 2 carduri pe rând pe mobil, cu imagini și text mai compacte. Selectorul de view are acum 3 butoane dedicate (1 coloană / 2 coloane / listă), cel activ evidențiat cu portocaliu.

### 🐛 Fixes
- **Import rețete funcțional pe Vercel** — înlocuit Python subprocess (`spawn python3`) cu scraper-ul TypeScript nativ; importul prin URL și text nu mai returnează `ENOENT` în mediul serverless.

## [0.13.0] — 2026-07-18

### 🎨 UI / UX
- **Iconă nouă a aplicației** — farfurie cu somon / broccoli / orez, cu ramă portocalie. Folosită pentru icoana de iOS („Add to Home Screen"), favicon-ul din tab, favicon-ul legacy și logo-ul din sidebar (înlocuiește ChefHat).
- **Recalculare instantanee a unităților la pasul de resolve din import** — când selectezi alt ingredient pentru unul nematchuit, verificarea unităților (potrivit / necesită conversie) se actualizează imediat din unitățile ingredientului ales, fără să mai aștepte round-trip-ul la DB (care acum doar completează `conversion`).

### ⚙️ Internals
- `api/import/parse` include acum `unit2` în candidați (necesar pentru seeding-ul instant al unităților).
- Icoanele dinamice `apple-icon.tsx` / `icon.tsx` înlocuite cu asset-uri statice (`apple-icon.png` 180×180, `icon.png` 48×48, `favicon.ico` regenerat, `public/logo.png`).

## [0.12.0] — 2026-07-17

### ✨ Features
- **Sugestii AI pentru conversia unităților la import** — la pasul de resolve, pentru conversiile dependente de ingredient (ex: 1 cup făină ≈ 120 g) pe care tabelul standard nu le acoperă, aplicația pre-completează automat factorul cu Claude Haiku 4.5, cu un badge „✨ Sugerat de AI" și o notă. Rămâne editabil — tu accepți. Rută nouă server-side `app/api/import/suggest-conversion` (cheia API nu se expune în client); regula acceptată se salvează în DB (`UnitRule`), deci AI-ul e chemat doar prima dată per ingredient.

### ⚙️ Internals
- Dependență nouă `@anthropic-ai/sdk`; variabilă de env `ANTHROPIC_API_KEY` (opțional — feature-ul se dezactivează elegant dacă lipsește).
- `.env.local` scos din tracking (era comis din greșeală) și ignorat de git.

## [0.11.0] — 2026-07-17

### ✨ Features
- **Pagină nouă de Setări** — comutatorul light/dark a fost mutat într-o pagină dedicată `/settings` (secțiunea „Aspect"). „Settings" adăugat în sidebar (jos) și în bara de navigație mobilă.
- **Comparație side-by-side la pasul de preview din import** — fiecare ingredient e afișat pe două coloane: „Din text" (linia originală din fișier) vs. „Se importă" (rezultatul după conversie de unități, împărțire pe porții și mapare la ingredient). Diferențele de cantitate / unitate / nume sunt evidențiate cu portocaliu.
- **Editare a oricărui ingredient la preview** — se pot deschide acum și cardurile deja „matched", nu doar cele care necesită revizuire, pentru ajustări de ultim moment.

### 🎨 UI / UX
- **Thumbnail inline în vizualizarea listă (Recipes)** — imaginea rețetei apare ca un pătrat mic cu colțuri rotunjite între checkbox și nume, vizibil acum și pe mobil.

### ⚙️ Internals
- Comandă nouă `/ship` — changelog + bump versiune + commit + push pe origin (deploy producție).

## [0.10.0] — 2026-07-17

### ✨ Features
- **Comutator batch / porție la editarea rețetei** — control „Porții" cu Batch(N) ↔ 1 porție, stepper pentru orice număr de porții, și scalare proporțională a cantităților ingredientelor (×nou/vechi). Switch „Scalează cantitățile" pentru a schimba numărul de porții fără a atinge cantitățile.
- **Mapările de import persistă în baza de date** — mapările manuale „nume brut → ingredient" și regulile de conversie a unităților se salvează acum în tabele Postgres (`IngredientNameMapping`, `UnitRule`) în loc de fișiere JSON locale. Funcționează și pe Vercel (înainte scrierile pe filesystem-ul read-only erau ignorate). Migrate 184 mapări + 9 reguli existente.
- Secțiunea de conversie apare și după selectarea manuală a unui ingredient nematchuit în cardul de resolve (cele 3 scenarii de unități).

### ⚙️ Internals
- Schema: tabele noi `IngredientNameMapping` + `UnitRule` (aplicate pe Neon prin `db push`); script one-time `scripts/seed-import-mappings.ts`.
- `api/import/parse` + `api/import/confirm` citesc/scriu mapările și regulile de unități din DB.
- `CLAUDE.md` adăugat (ghid de dezvoltare). Cod mort eliminat (`api/import/normalize` — spawn Python). Docs învechite mutate în `docs/archive/`. `data/export.json` + `data/local/` scoase din git. `webapp/.env.example` adăugat.

## [0.9.2] — 2026-07-16

### 🎨 UI / UX
- **Card de resolve reproiectat la import** — un singur buton „Salvează" per ingredient (înlocuiește butoanele separate de mapare / conversie / adăugare unit2). Body reorganizat: căutare în DB → opțiunea găsită (auto-match evidențiat verde) → „Crează ingredient nou" mereu vizibil → conversie unități → observații (ultima în ierarhie).
- **Conversie unități pe 3 scenarii** — (1) unitatea din fișier se potrivește cu una din unitățile ingredientului: evidențiată, fără input, cealaltă calculată din DB; (2) unitate țintă la alegere cu factor „1 foreign = N țintă", a doua unitate derivată automat din conversia din DB; (3) ingredient cu o singură unitate: factor + opțiunea de a adăuga unitatea din rețetă ca `unit2`.

### ✨ Features
- **Persistă conversia la adăugarea unei a 2-a unități** — când unitatea din rețetă e adăugată ca `unit2` pe un ingredient existent, factorul introdus se salvează ca `conversion` pe ingredient, ca lista de cumpărături și nutriția să poată converti corect.

### ⚙️ Internals
- `ReviewRow` (pasul 3 din import) rescris: o singură acțiune de salvare, detalii ingredient (unități + conversie) încărcate din DB prin `getGroceryItemDetails`.
- `api/import/confirm` — setează `conversion` odată cu `unit2` (câmp nou `unit2Conversion` în payload).

## [0.9.1] — 2026-07-16

### 🐛 Fixes
- **Importul de rețete funcționează pe Vercel** — ruta `api/import/parse` folosește acum parserul nativ TypeScript (`parseUrls`/`parseText` din `lib/recipe-scraper.ts`) în loc să pornească un subprocess Python; elimină eroarea `spawn /var/task/.venv/bin/python3 ENOENT` din mediul serverless
- **Salvarea la import nu mai eșuează pe filesystem read-only** — scrierile din `api/import/confirm` (mapări ingrediente, reguli de unități, imagini base64) sunt acum non-fatale; rețeta se salvează în Postgres chiar dacă discul nu e scriibil (Vercel), imaginile base64 rămânând inline ca fallback
- **Numele primului grup de ingrediente la importul din text** — un titlu de grup dinaintea primului `[...]` nu mai e ignorat în parserul format `=== ... ===`

### ⚙️ Internals
- Eliminat `child_process`/`spawn` și referințele la `.venv`/`web_import_handler.py` din `api/import/parse/route.ts`
- Scrierile pe disc din `api/import/confirm/route.ts` protejate cu `try/catch` pentru medii serverless

## [0.4.0] — 2026-03-21

### ✨ Features
- **TypeScript recipe scraper** — înlocuiește complet subprocess-ul Python cu un scraper nativ TypeScript; funcționează pe Vercel fără niciun runtime extern

### 🐛 Fixes
- Fix `spawn python3 ENOENT` pe Vercel (mediu serverless fără Python)
- Fix import Google Fonts și eroare TypeScript în pagina de import

### ⚙️ Internals
- `webapp/lib/recipe-scraper.ts` — scraper nou: fetch URL → Schema.org JSON-LD → structură rețetă; parser format text `=== ... ===`
- Eliminat dependența de `child_process` din `api/import/parse/route.ts`

## [0.3.0] — 2026-03-20

### ✨ Features
- **Căutare ingredient la import** — input de search cu debounce în modul „Mapează la existent" (Step 3)
- **Upload imagine la import** — buton per card de rețetă în Step 2 (Review), thumbnail după upload
- **Normalizare servings la import** — cantitățile se împart la nr. original de porții, salvate la baza de 1 serving
- **Nume editabil ingredient nou** — câmp de editare a numelui în modul „Creează nou" (Step 3)
- **Editor instrucțiuni** — înlocuiește textarea cu editor linie-cu-linie: pași numerotați, secțiuni portocalii, paste multi-linie, navigare cu săgeți
- **Timestamp rețetă** — data adăugării afișată discret sub Nutrition Facts
- **Comanda `/release`** — versionare și actualizare CHANGELOG automat

### 🎨 UI / UX
- Buton import mutat lângă „New Recipe" în header-ul paginii Recipes (sidebar/bottom nav mai curate)
- Spacing mai mare între rândurile de ingrediente în formular

### 🐛 Fixes
- Fix JSON parse error la import: print-urile Python redirecționate pe `stderr` (ingredient_processor, web_import_handler)
- Fix stdout poluat cu log-uri la apelurile `parse_scraped_file` din subproces

### ⚙️ Internals
- `api/import/search-items` — endpoint GET pentru căutare GroceryItem
- `api/import/upload-image` — endpoint POST pentru upload imagine rețetă (hash MD5, consistent cu convenția existentă)
- `api/import/confirm` — normalizare qty/servings la import

## [0.2.0] — 2026-03-20

### ✨ Features
- **Import rețete** — wizard în 4 pași (Input → Review → Resolve → Import) cu suport URL și Text/Fișier
- **Import URL** — scraping automat din site-uri cu schema.org/Recipe (AllRecipes, BBC Good Food, Jamie Oliver etc.)
- **Import Text/Fișier** — paste sau upload `.txt` cu parsare automată a ingredientelor și pașilor
- **Ingredient matching** — potrivire exactă, fuzzy (bigram) și căutare în DB la import
- **Search ingredient** — input de căutare în DB la pasul „Mapează la existent"
- **Upload imagine la import** — adăugare imagine per rețetă direct din Step 2 (Review)
- **Normalizare servings** — cantitățile se salvează per 1 porție la import (bază pentru scaler)
- **Planner** — drag & drop rețete în planificatorul săptămânal, inclusiv pe mobil
- **Planner mobile** — selector de rețete redesenat, feedback haptic la drag
- **Adaugă în Planner** — buton direct din pagina de rețetă
- **Filtru favorite** — filtrare rețete favorite în lista principală și în planner
- **PWA** — manifest + meta tags Apple web app pentru instalare pe iOS/Android
- **Editor instrucțiuni** — editor linie-cu-linie în loc de textarea: pași numerotați, secțiuni colorate, paste multi-linie, navigare cu săgeți

### 🎨 UI / UX
- **Dark mode** — temă întunecată completă (Notion-inspired) pe toate paginile
- **Theme toggle** — comutator light/dark cu design tokens
- **Timestamp rețetă** — data adăugării afișată discret sub Nutrition Facts
- **Import icon** — buton de import mutat lângă „New Recipe" în header (sidebar/bottom nav mai curate)
- **Spacing ingrediente** — gap mai mare între rândurile de ingrediente în formular
- **iOS safe area** — fix pentru status bar și safe area pe iPhone

### 🐛 Fixes
- Fix JSON parse error la import cauzat de print-uri Python pe stdout în loc de stderr
- Fix bug-uri drag & drop în planner pe mobil
- Fix active state în sidebar pentru ruta `/recipes/import`

### ⚙️ Internals
- Compresie imagini PNG mari → JPEG la export din Notion
- Eliminat `node_modules` și `.next` din tracking git
- Script `web_import_handler.py` — bridge Python/Next.js pentru import rețete
- API routes: `/api/import/parse`, `/api/import/confirm`, `/api/import/search-items`, `/api/import/upload-image`
- Comanda `/release` pentru versionare și changelog automat

## [0.1.0] — 2025-01-01

- Lansare inițială: import Notion, grid rețete, planner săptămânal, grocery list, pagina ingrediente
