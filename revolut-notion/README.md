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

1. **Citire screenshot** — Claude recunoaște tipul ecranului:
   - `analytics_overview` — lista de categorii cu totaluri;
   - `category_detail` — tranzacțiile dintr-o categorie deschisă;
   - `transaction_list` — feed-ul obișnuit al contului.
2. **Combinare cu CSV-ul** (dacă e încărcat):
   - tranzacțiile din capturile de categorie sunt potrivite cu rândurile din CSV după
     sumă + dată + similaritate de comerciant → categoria e **exactă**;
   - restul rândurilor din CSV sunt clasificate de Claude, dar **numai** în categoriile
     văzute pe ecran → categoria e **dedusă**;
   - CSV-ul rămâne sursa autoritară pentru sume și date.
3. **Reconciliere** — un tabel compară totalul din screenshot cu suma alocată pe fiecare
   categorie, ca să vezi imediat ce nu s-a acoperit.
4. **Mapare categorii** — regulă salvată → potrivire exactă de nume → altfel rămâne
   pentru pasul de rezolvare manuală.
5. **Import** — un rând per tranzacție în baza de tranzacții, cu relație către pagina de
   categorie.

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

**Important:** integrarea Notion trebuie conectată explicit la ambele baze
(pagina bazei → `...` → *Connections* → integrarea ta). Altfel API-ul returnează 404.

### Structura Notion așteptată

Două baze de date:

- **Categorii** — o pagină per categorie. Singura cerință e proprietatea de tip `title`.
- **Tranzacții** — trebuie să aibă cel puțin:
  | Rol | Tip Notion |
  |---|---|
  | Titlu (descriere / comerciant) | `title` |
  | Dată | `date` |
  | Sumă | `number` |
  | Categorie | `relation` către baza de categorii |
  | Monedă *(opțional)* | `select` / `rich_text` / `multi_select` |
  | Sursă import *(opțional)* | `select` / `rich_text` / `multi_select` |

Denumirile proprietăților **nu** sunt fixe: în **Setări** citești structura live a
bazelor și alegi din dropdown ce proprietate joacă fiecare rol. Maparea se salvează în
`data/notion-mapping.json`.

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

`npm run smoke` acoperă parserul CSV, potrivirea screenshot ↔ CSV, reconcilierea și
rezolvarea categoriilor prin reguli. Rulează complet offline — șterge intenționat
`ANTHROPIC_API_KEY` din proces, deci nu consumă credite nici dacă cheia e setată.

## Limitări cunoscute

- **Scrierile pe disc au nevoie de filesystem persistent.** Regulile și maparea se
  salvează în `data/*.json`. Local sau pe un VPS e în regulă; pe hosting serverless
  (Vercel) citirile merg, dar salvarea unei reguli noi eșuează — acolo ar trebui mutate
  într-o bază de date.
- **Nu există deduplicare la import.** Dacă rulezi același import de două ori, obții
  rânduri duplicate în Notion.
- **Doar cheltuieli.** Rândurile pozitive din CSV (încasări, top-up-uri, refund-uri) sunt
  ignorate — ecranul Analytics → Spent nu le acoperă.
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
  api/rules             citește / actualizează / șterge reguli
lib/
  claude.ts             extragere din imagini + clasificare, structured outputs
  revolut-csv.ts        parser pentru statement-ul CSV
  merge.ts              potrivire screenshot ↔ CSV, reconciliere
  rules.ts              regulă → nume exact → nerezolvat
  notion.ts             client Notion, schema bazelor, scriere pagini
  store.ts              persistența JSON pentru reguli și mapare
```
