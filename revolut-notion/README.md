# Revolut → Notion

Aplicație separată de meal-planner. Încarci un screenshot din **Revolut → Analytics →
Spent**, Claude citește ce scrie pe ecran, iar tranzacțiile ajung în bazele tale Notion.

Statement-ul CSV al Revolut nu conține categorii — de aici problema pe care o rezolvă
aplicația: **CSV-ul dă sumele și datele exacte, screenshot-ul dă categoriile**, iar
aplicația le combină.

## Cum funcționează

```
screenshot(uri) ──► Claude (vision) ──┐
                                      ├──► potrivire ──► reguli ──► Notion
statement CSV ────────────────────────┘
```

Notele scrise pe tranzacții în Revolut („Cadou Bianca") se citesc tot din screenshot
și ajung în proprietatea de **comentariu**, dacă o mapezi în Setări — CSV-ul nu le are.

1. **Citire screenshot** — Claude recunoaște tipul ecranului:
   - `analytics_overview` — lista de categorii cu totaluri;
   - `category_detail` — tranzacțiile dintr-o categorie deschisă;
   - `transaction_list` — feed-ul obișnuit al contului.
2. **Combinare cu CSV-ul** (dacă e încărcat):
   - tranzacțiile din capturile de categorie sunt potrivite cu rândurile din CSV după
     sumă + dată + similaritate de comerciant → categoria e **exactă**;
   - restul rândurilor din CSV **nu** sunt clasificate automat: intră excluse și îți sunt
     raportate pe luni, ca să decizi tu ce faci cu ele;
   - CSV-ul rămâne sursa autoritară pentru sume și date.
3. **Reconciliere** — un tabel compară totalul din screenshot cu suma alocată pe fiecare
   categorie, ca să vezi imediat ce nu s-a acoperit.
4. **Mapare categorii** — regulă salvată → potrivire exactă de nume → altfel rămâne
   pentru pasul de rezolvare manuală. La pasul **Verifică** poți schimba oricând
   rezultatul: un selector pe categoria Revolut mută toate tranzacțiile ei deodată,
   iar fiecare tranzacție are și selectorul ei pentru excepții. Doar schimbarea pe
   categorie întreagă se poate ține minte ca regulă — cheia regulii e numele categoriei
   Revolut, deci un singur rând n-are ce generaliza.
5. **Import** — un rând per tranzacție în baza de tranzacții, cu relație către pagina de
   categorie. Înainte de scriere, rândurile deja existente în Notion sunt detectate ca
   duplicate și excluse implicit.

Fără CSV, categoriile care apar doar ca total intră ca **un singur rând agregat pe
categorie** (marcat ca atare) — util pentru un buget lunar, insuficient pentru tranzacții.

## Configurare

```bash
cd revolut-notion
npm install
cp .env.example .env.local   # completează cheile
npm run dev                  # http://localhost:3000
```

### Chei necesare

| Variabilă | De unde |
|---|---|
| `ANTHROPIC_API_KEY` | https://console.anthropic.com/settings/keys |
| `NOTION_TOKEN` | https://www.notion.so/my-integrations (internal integration) |
| `NOTION_TRANSACTIONS_DB_ID` | opțional — se poate seta și din Setări |
| `NOTION_CATEGORIES_DB_ID` | opțional — se poate seta și din Setări |

**Important:** integrarea Notion trebuie conectată explicit la fiecare bază pe care o
folosești — tranzacții, categorii (dacă există) și luni (pagina bazei → `...` →
*Connections* → integrarea ta). Altfel API-ul returnează 404.

### Structura Notion așteptată

Baza de **tranzacții** trebuie să aibă cel puțin:

| Rol | Tip Notion |
|---|---|
| Titlu (descriere / comerciant) | `title` |
| Dată | `date` |
| Sumă | `number` |
| Categorie | `relation` **sau** `select` / `multi_select` |
| Comentariu *(opțional)* | `rich_text` |
| Monedă *(opțional)* | `select` / `rich_text` / `multi_select` |
| Sursă import *(opțional)* | `select` / `rich_text` / `multi_select` |
| Relație către lună *(opțional)* | `relation` |
| Bifă la import *(opțional)* | `checkbox` |

Denumirile proprietăților **nu** sunt fixe: în **Setări** citești structura live a
bazelor și alegi din dropdown ce proprietate joacă fiecare rol. Maparea se salvează în
`data/notion-mapping.json`.

#### Cele două moduri pentru categorie

Tipul proprietății alese decide singur modul — nu există comutator separat:

- **`relation`** — categoriile stau într-o **a doua bază de date**, o pagină per
  categorie (singura cerință: o proprietate `title`). Trebuie să dai și ID-ul ei.
- **`select` / `multi_select`** — categoriile sunt **opțiunile proprietății**, pe baza de
  tranzacții. Nu e nevoie de a doua bază, iar câmpurile pentru ea dispar din Setări.

Restul aplicației nu vede diferența: în modul select, „id"-ul unei categorii *este* numele
opțiunii, deci regulile, potrivirea și pasul Rezolvă funcționează identic. Importul scrie
întotdeauna după **tipul real din Notion**, nu după modul salvat — dacă schimbi
proprietatea din relation în multi_select, importul se adaptează fără să reconfigurezi.

Se scriu doar opțiuni care există deja; o opțiune redenumită între timp invalidează regula
și categoria reapare la pasul de rezolvare, în loc să creeze o opțiune nouă pe furiș.

#### Luna și bifa

Multe bugete își calculează totalurile lunare printr-un rollup dintr-o bază de **luni**,
filtrat pe un **checkbox** de validare. Dacă mapezi cele două proprietăți opționale:

- **relația de lună** — fiecare rând se leagă de pagina lunii sale. Baza de luni e
  detectată automat din relație; paginile ei sunt indexate după proprietăți numite
  `Month`/`Lună` + `Year`/`An`, apoi după un `date`, apoi după titlu ca nume de lună
  (română sau engleză). O pagină care nu identifică clar o lună e sărită, nu ghicită.
- **bifa** — se bifează automat la import, ca rândurile să intre imediat în totaluri.

Proprietățile numite bat data pentru că într-o bază reală data e adesea o margine de
ciclu — un `Last Day` care intră câteva zile în luna următoare. Citită ca lună, ducea
pagina lui mai peste iunie.

Pasul **1. Luna importului** oferă exact paginile astfel detectate, în două selectoare
(an și lună), deci nu poți alege o lună care n-are pagină. Dacă totuși ai nevoie de una
(sau baza de luni nu e configurată), butonul *„Luna nu e în listă?”* deschide un câmp
liber: importul merge, dar rândurile rămân fără legătura de lună — cu atenționare.

## Regulile de mapare a categoriilor

`data/category-rules.json` ține corespondența *categorie Revolut → pagină de categorie
Notion*, cheia fiind numele Revolut normalizat (lowercase, spații colapsate).

Regulile se completează singure: în pasul **Rezolvă**, orice categorie pe care o alegi
manual cu „ține minte” bifat devine regulă și se aplică automat la importurile viitoare.
Le poți vedea și șterge din Setări.

O regulă care indică o pagină ștearsă între timp este ignorată, iar categoria reapare la
rezolvare — nu se scrie niciodată o relație către o pagină inexistentă.

## Comenzi

```bash
npm run dev        # server de dezvoltare
npm run build      # build de producție
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm run smoke      # teste pentru logica pură (fără rețea, fără chei)
```

`npm run smoke` acoperă parserul CSV, potrivirea screenshot ↔ CSV, reconcilierea,
rezolvarea categoriilor prin reguli, detectarea paginii de lună și forma payload-ului
scris în Notion (relation vs. select). Rulează complet offline — șterge intenționat
`ANTHROPIC_API_KEY` din proces, deci nu consumă credite nici dacă cheia e setată.

## Limitări cunoscute

- **Scrierile pe disc au nevoie de filesystem persistent.** Regulile și maparea se
  salvează în `data/*.json`. Local sau pe un VPS e în regulă; pe hosting serverless
  (Vercel) citirile merg, dar salvarea unei reguli noi eșuează — acolo ar trebui mutate
  într-o bază de date.
- **Deduplicarea cere egalitate exactă** — aceeași descriere, dată și sumă. Un rând
  editat între timp în Notion (altă sumă, altă dată) nu mai e recunoscut și se
  reimportă.
- **Doar cheltuieli.** Rândurile pozitive din CSV (încasări, top-up-uri, refund-uri) nu se
  importă — ecranul Analytics → Spent nu le acoperă. Parserul le citește totuși și le ține
  în `rows`, separat de `transactions`: un transfer *dintr-un pocket* ajunge pe contul
  curent ca încasare, iar de acolo se va deduce pocket-ul unei plăți. Doar `transactions`
  ajunge în Notion.
- **O singură monedă per import.** Un CSV cu mai multe monede primește o atenționare;
  sumele nu se convertesc.
- **Tranzacțiile din screenshot care nu se potrivesc cu niciun rând din CSV sunt
  ignorate** (ca posibile duplicate) și raportate ca atenționare — verifică-le dacă
  numărul e mare.

## Structura codului

```
app/
  page.tsx              wizard-ul în 4 pași (Încarcă → Verifică → Rezolvă → Importă)
  settings/page.tsx     maparea bazelor Notion + editorul de reguli
  api/parse             screenshot + CSV → tranzacții propuse
  api/confirm           scrie în Notion, salvează regulile noi
  api/mapping           citește structura bazelor, salvează maparea
  api/months            lunile din Notion, pentru selectoarele de la pasul 1
  api/duplicates        ce rânduri există deja în Notion
  api/rules             citește / actualizează / șterge reguli
lib/
  claude.ts             extragere din imagini + clasificare, structured outputs
  revolut-csv.ts        parser pentru statement-ul CSV
  merge.ts              potrivire screenshot ↔ CSV, reconciliere
  rules.ts              regulă → nume exact → nerezolvat; suprascrierea din pasul Verifică
  duplicates.ts         potrivire unu-la-unu cu rândurile deja din Notion
  months.ts             pagină de lună → "YYYY-MM" (pur, fără rețea)
  notion.ts             client Notion, schema bazelor, scriere pagini
  store.ts              persistența JSON pentru reguli și mapare
```
