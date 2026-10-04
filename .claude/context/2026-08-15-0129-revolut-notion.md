---
data: 2026-08-15 01:29
zonă: revolut-notion (principal); webapp/ are modificări necommise din altă sesiune, neatinse aici
branch: claude/revolut-notion-parser-uepr62
head: f76660c Add Revolut → Notion screenshot importer
---

# Importatorul e conectat la Notion-ul real și funcțional; a rămas deducerea pocket-ului, blocată pe un CSV exemplu.

## Ce s-a făcut

- **Adaptat la structura reală din Notion**: categoria e `multi_select` pe `Expenses`, nu relație
  către o bază separată. `lib/notion.ts` decide forma de scriere după **tipul viu din schemă**,
  nu după modul salvat, deci o schimbare de schemă nu produce un write invalid.
- **Luna și bifa**: fiecare rând se leagă de pagina lunii sale (`lib/months.ts`, detectare din
  `date` → proprietăți `Month`/`Year` → titlu ca nume de lună) și primește `Check ✓`.
- **Grupuri de screenshoturi + drag & drop** (`components/UploadStep.tsx`): capturile derulate,
  fără header de categorie, primesc categoria de la grupul în care sunt puse.
- **Screenshoturile decid ce se importă** (`lib/merge.ts`): rândurile din CSV neacoperite de
  screenshot nu mai sunt clasificate de AI — intră `include: false` și sunt raportate pe luni în
  `components/ReviewStep.tsx`, cu include/exclude per lună și per rând.
- **Reparat data importată** (`lib/dates.ts`, nou): Claude transcrie eticheta zilei verbatim
  (`date_label`), utilizatorul dă luna la încărcare, anul se compune din ele.
- **Detecție de duplicate** (`lib/duplicates.ts` + `app/api/duplicates/route.ts`, noi): înainte de
  scriere se caută în Notion rânduri cu aceeași descriere, dată și sumă; cele găsite sunt excluse
  implicit și utilizatorul bifează explicit ce vrea totuși creat.

## Decizii și de ce

- **Am adaptat aplicația la `multi_select`, nu Notion-ul la aplicație.** Formulele din `Months`
  filtrează cu `prop("Category").includes("🥗 Food")` și pe `Check`; conversia categoriei în
  relation ar fi stricat ~20 de formule. Respins: restructurarea Notion-ului.
- **`id`-ul unei categorii *este* numele opțiunii** în modul select. Astfel regulile, potrivirea
  și pasul Rezolvă au rămas neschimbate. Efect secundar util: o opțiune redenumită invalidează
  regula și categoria reapare la rezolvare, în loc să creeze o opțiune nouă pe furiș.
- **Fără clasificare AI automată.** Cerința utilizatorului: intrările din screenshot au prioritate,
  restul se raportează ca să decidă el. `classifyTransactions` a rămas fără apelant și a fost
  ștearsă (~55 de linii), împreună cu valoarea `inferred` din `CategorySource`, devenită
  imposibilă. Poate fi readusă ca buton opțional dacă se cere.
- **Modelul nu ghicește categoria** când nu vede header — o captură derulată arată identic cu
  feed-ul obișnuit, deci ghicitul ar fi produs categorii inventate care par corecte. Headerul
  vizibil bate eticheta grupului, cu atenționare la conflict.
- **Duplicat = egalitate exactă** (descriere + dată + sumă), nu similaritate. Cerința
  utilizatorului: „dacă diferă sumele sau datele nu sunt". Potrivirea e unu-la-unu, ca două
  cumpărături identice reale să nu fie amândouă marcate când Notion are doar una.
  Categoria e intenționat **în afara** cheii: recategorisirea unui rând în Notion nu-l face altă
  tranzacție, iar includerea ei ar permite reimportul unui rând editat.

## Stare externă descoperită

Workspace Notion **Daniel**, integrare **„Notion Calculations"**. Token în `NOTION_TOKEN`
(`revolut-notion/.env.local`). Configurarea locală e deja scrisă în `data/notion-mapping.json`
(gitignored).

| Bază | ID | Note |
|---|---|---|
| Expenses | `de633690d4a8492eb52bd11f146c183a` | ținta importului |
| Months | `bbc8f097-c4eb-40b6-bbfb-dd39764eea7a` | 69 de pagini indexate, din oct. 2020 |
| Accounts | `f6738b67-7549-4f45-b228-4a404bbb89ca` | 11 pocket-uri |

`Expenses`: `Expense` [title] · `Date` [date] · `Amount` [number] · `Category` [multi_select,
26 opțiuni] · `Check` [checkbox] · `Month` [relation → Months] · `From` [relation → Accounts] ·
`To` [relation → Accounts] · `Comment` [rich_text] · `now` [button].
Nu există proprietate de monedă sau de sursă import.

`Months`: `Name` [title, „August"] · `Month` [select, „08"] · `Year` [select, „2026"] · plus ~20
de formule care agregă din `Expenses`.

Cele 11 conturi: Cleaning, Bebe, Fun, Honda, Supplies, Food & Coffee, Holiday, Utilities,
Safety, CEB, Saves — se suprapun aproape unu-la-unu peste categorii.

**Capcană Notion**: proprietățile de tip `relation` sunt **invizibile** în schema returnată de API
dacă baza-țintă nu e partajată cu integrarea. `From` și `To` păreau că nu există până când
`Accounts` a fost adăugată în *Connections*. Dacă o proprietate „lipsește", verifică asta întâi.

**Ecranele Revolut** nu arată anul — doar „14 august", „14.08" sau „Astăzi". De aici întregul
mecanism cu luna dată de utilizator.

## Blocat pe

**Un export CSV Revolut de la utilizator.** Necesar pentru ambele lucruri legate de pocket-uri:

1. Deducerea pocket-ului: regula cerută e „o plată aparține pocket-ului dacă tranzacția
   imediat dinaintea ei e un transfer din acel pocket". Nu se poate scrie fără să văd cum arată
   efectiv un transfer din pocket: valoarea din `Type`, ce scrie în `Description`, dacă `Product`
   diferă între contul curent și pocket, și cât de apropiate în timp sunt transferul și plata.
2. Maparea `From` → `Accounts` în Setări și la scriere depinde de (1) ca să aibă ce popula.

Parserul aruncă azi exact ce ar trebui păstrat: rândurile pozitive (`lib/revolut-csv.ts:151` —
un transfer *din* pocket e o intrare pe contul curent), ora tranzacției (`:78`, se păstrează doar
data) și coloana `Product` (`:112`, nu e citită).

## Verificat

Din `revolut-notion/`: `npm run typecheck`, `npm run lint`, `npm run smoke` (32 de teste) și
`npm run build` — toate trec. Serverul de dev a rulat pe `localhost:3000` toată sesiunea.
Verificat live pe datele reale printr-un dry-run read-only: 26 de categorii citite, baza de luni
detectată din relație, potrivirea lunii august 2026 corectă.

**Nerulat**: niciun import real după reparațiile de dată și duplicate. Următorul import e primul
test end-to-end al lor.

## Capcane

- **Fallback tăcut pe ziua curentă.** `merge.ts` ștampila `new Date()` când o intrare n-avea dată,
  producând un import întreg cu date plauzibile și complet greșite. Reparat prin eliminarea
  fallback-ului peste tot, plus o gardă în `app/api/confirm/route.ts` care refuză scrierea unui rând
  fără dată ISO validă. Regula generală: mai bine un rând exclus și raportat decât unul inventat.
- **`cd` nu persistă între apeluri de Bash** în sesiunea asta — comenzile care citesc
  `.env.local` trebuie să înceapă cu `cd .../revolut-notion &&`, altfel `grep` eșuează și
  `export $(...)` scuipă tot mediul în output.
- **Argumentele comenzilor slash**: `$1` ia doar primul cuvânt. Pentru o notă liberă folosește
  `$ARGUMENTS`.

## Următorii pași

1. **[BLOCAT — CSV]** Păstrează în `lib/revolut-csv.ts` rândurile pozitive, ora și coloana
   `Product`; adaugă tipul de rând (plată vs. transfer) pe `CsvTransaction`.
2. **[BLOCAT — CSV]** Deducerea pocket-ului: transfer → plata imediat următoare, în `lib/merge.ts`
   sau un modul nou `lib/pockets.ts`. Adaugă `accountName` pe `DraftTransaction`.
3. **[BLOCAT — (2)]** Mapare `From` în `app/settings/page.tsx` + scriere în `lib/notion.ts`
   (rezolvare nume → pagină din `Accounts`, ca la categorii).
4. Curățenie: cele 8 rânduri greșite din Notion (vezi mai jos) — utilizatorul n-a confirmat încă.
5. Opțional: readu clasificarea AI ca buton explicit pentru rândurile incluse manual.

## Stare reală (nu de dorit)

**8 rânduri greșite în `Expenses`**, create la `2026-08-14T22:11Z` din două rulări ale importului
vechi. Toate au `Date = 2026-08-14` (ziua importului, nu data reală), categoria `Other`, și
`Check ✓` — deci **intră chiar acum în totalurile din `Months`**. Unele sunt și duplicate:
`Parcare Sonx` ×3, `Amparcat.ro` ×3, `Bolt` ×2. Se identifică fără ambiguitate după
`created_time`. Utilizatorul a fost întrebat dacă să fie șterse; **n-a confirmat încă**.

`data/category-rules.json` conține reguli învățate la acele importuri — merită verificate, s-au
format pe categorii mapate manual către `Other`.

**`webapp/`** are modificări necommise dintr-o altă sesiune (`BulkIngredientsModal.tsx`,
`lib/bulk-ingredients.ts`, `app/api/suggest-ingredients/`, `app/ingredients/page.tsx`,
`lib/actions.ts`). Nu au fost atinse aici și nu au fost verificate.
