---
description: Salvează starea sesiunii în .claude/context/ ca s-o poți relua cu /prime
argument-hint: [notă scurtă] (ex: "am terminat duplicatele, urmează pocket-urile")
allowed-tools: Read, Write, Bash(git status:*), Bash(git rev-parse:*), Bash(git log:*), Bash(git diff:*), Bash(date:*), Bash(ls:*), Bash(mkdir:*)
---

## Context

- Data și ora: !`date "+%Y-%m-%d %H:%M"`
- Branch: !`git rev-parse --abbrev-ref HEAD`
- HEAD: !`git log -1 --oneline --no-decorate`
- Status: !`git status --short`
- Fișiere modificate față de HEAD: !`git diff --name-only HEAD 2>/dev/null | head -40`
- Dump-uri existente: !`ls -1t .claude/context/*.md 2>/dev/null | head -5 || echo "(niciunul)"`

## Task

Notă de la utilizator: **$ARGUMENTS**

Scopul: o sesiune nouă trebuie să poată relua treaba **fără să redescopere nimic**. Cel mai
scump lucru din repo-ul ăsta nu e codul — e ce s-a aflat despre starea externă (bazele Notion,
formatele de export) și **de ce** s-au luat deciziile. Codul spune *ce* face; dump-ul spune *de ce*
și *ce urmează*.

### Pași de urmat:

1. **Stabilește zona de lucru** din fișierele modificate mai sus:
   - `revolut-notion/` — importatorul Revolut → Notion (UI în română)
   - `webapp/` — meal-planner-ul (UI în engleză, Prisma + Neon)
   - rădăcină — pipeline-ul Python legacy
   Dacă s-a lucrat în mai multe, notează-le pe toate, cu cea principală prima.

2. **Creează directorul** dacă lipsește: `mkdir -p .claude/context`

3. **Scrie `.claude/context/YYYY-MM-DD-HHMM-<zonă>.md`** cu secțiunile de mai jos.
   Sari peste orice secțiune care ar fi goală — un dump scurt și adevărat bate unul lung și umplut.

   ```markdown
   ---
   data: YYYY-MM-DD HH:MM
   zonă: revolut-notion
   branch: <branch>
   head: <sha scurt + subiect>
   ---

   # <o propoziție: unde s-a ajuns>

   ## Ce s-a făcut
   Doar lucrurile care schimbă comportament, cu referințe `fișier:linie`. Nu repeta ce se
   vede din `git log` sau din diff — asta se citește oricum la prime.

   ## Decizii și de ce
   Partea cea mai valoroasă. Pentru fiecare: ce s-a ales, **ce s-a respins și din ce motiv**.
   Motivele nu supraviețuiesc în cod; alegerea da.

   ## Stare externă descoperită
   Tot ce a costat apeluri API sau citit fișiere ca să afli, și ce nu se vede din cod:
   - ID-uri de baze Notion, nume exacte de proprietăți și tipurile lor
   - Ciudățenii aflate pe pielea ta (ex: Notion ascunde proprietățile de tip relation
     dacă baza-țintă nu e partajată cu integrarea — proprietatea *pare* că nu există)
   - Formate reale de fișiere de intrare (coloane CSV, cum arată datele pe ecran)
   - Câte înregistrări are fiecare bază, dacă e relevant

   ## Blocat pe
   Ce așteaptă de la utilizator, și **exact ce trebuie ca să se deblocheze**. Un element
   blocat fără să spună ce anume lipsește e inutil la reluare.

   ## Verificat
   Ce comenzi au rulat și ce au întors — nu „merge", ci rezultatul. Ex:
   `npm run typecheck | lint | smoke (29 teste) | build` — toate trec.
   Dacă ceva n-a fost rulat sau a picat, scrie asta explicit.

   ## Capcane
   Greșeli făcute în sesiune și cum s-au reparat, ca să nu se repete. Ex: fallback tăcut
   pe ziua curentă care producea date plauzibile și greșite.

   ## Următorii pași
   Listă ordonată, fiecare cu fișierul de atins. Marchează ce e blocat.

   ## Stare reală (nu de dorit)
   Ce e scris deja în sisteme externe și nu poate fi luat înapoi — rânduri create în Notion,
   fișiere modificate în afara repo-ului, date greșite rămase în urmă.
   ```

4. **Copiază conținutul și în `.claude/context/LATEST.md`**, cu o primă linie
   `<!-- copie a <numele fișierului de arhivă> -->`. `/prime` citește LATEST.

5. **Nu scrie secrete.** Chei API, tokenuri, valori din `.env.local` — niciodată. Referă-te la
   ele pe nume de variabilă (`NOTION_TOKEN`), nu prin valoare. ID-urile bazelor Notion sunt ok.

6. **Confirmă** ce fișier ai scris și rezumă în două-trei rânduri ce ar afla cineva citindu-l.
