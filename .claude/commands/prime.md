---
description: Încarcă contextul proiectului dintr-un dump și reia treaba de unde a rămas
argument-hint: [zonă sau fișier de dump] (ex: revolut-notion)
allowed-tools: Read, Glob, Grep, TodoWrite, Bash(git status:*), Bash(git rev-parse:*), Bash(git log:*), Bash(git diff:*), Bash(ls:*)
---

## Context

- Branch: !`git rev-parse --abbrev-ref HEAD`
- HEAD: !`git log -3 --oneline --no-decorate`
- Status: !`git status --short`
- Fișiere modificate față de HEAD: !`git diff --name-only HEAD 2>/dev/null | head -40`
- Dump-uri disponibile: !`ls -1t .claude/context/*.md 2>/dev/null | head -8 || echo "(niciunul — spune utilizatorului să ruleze /dump la finalul sesiunii)"`

## Task

Zona sau dump-ul cerut: **$ARGUMENTS**

Scopul: să ajungi operațional citind **puțin și țintit**. Repo-ul are trei părți independente;
citirea a tot ce mișcă e exact ce nu vrei.

### Pași de urmat:

1. **Alege dump-ul**:
   - dacă `$ARGUMENTS` e o cale către un fișier din `.claude/context/`, citește-l pe acela
   - dacă `$ARGUMENTS` e o zonă (`revolut-notion`, `webapp`), ia cel mai recent dump pentru zona aia
   - dacă `$ARGUMENTS` e gol, citește `.claude/context/LATEST.md`
   - dacă nu există niciun dump, spune asta clar și continuă doar cu pașii 2 și 3

2. **Citește `CLAUDE.md` din rădăcină.** Are regulile care se aplică indiferent de zonă:
   împărțirea în trei părți, ce e canonic și ce e stale, semantica non-evidentă a modelului
   de date.

3. **Citește dump-ul.** Secțiunile *Stare externă descoperită*, *Blocat pe* și *Capcane*
   sunt cele care contează — restul se poate reconstitui din cod, ele nu.

4. **Citește doar ce ține de zona activă**, în ordinea asta, oprindu-te când ai destul:

   **`revolut-notion/`** — importator Revolut → Notion, UI în **română**:
   - `revolut-notion/README.md` (arhitectura, modurile de categorie, luna și bifa)
   - fișierele numite explicit în dump la *Următorii pași*
   - dacă lucrezi la pipeline: `lib/merge.ts` → `lib/claude.ts` → `lib/notion.ts`
   - verificare: `cd revolut-notion && npm run typecheck && npm run lint && npm run smoke`

   **`webapp/`** — meal-planner, UI în **engleză**, Prisma + Neon:
   - `webapp/UX_CONVENTIONS.md` — **obligatoriu înainte de orice schimbare de UI**
   - `webapp/prisma/schema.prisma` dacă atingi modelul de date
   - verificare: `cd webapp && npx tsc --noEmit`

   **rădăcină** — pipeline Python legacy, în mare parte depășit. Nu presupune că reflectă
   comportamentul actual al aplicațiilor.

5. **Nu reverifica starea externă din dump prin apeluri API** decât dacă ai motiv concret să
   crezi că s-a schimbat (dump vechi de zile, sau utilizatorul spune că a modificat ceva în
   Notion). ID-urile și schemele din dump sunt bune ca punct de plecare — dar dacă o operație
   eșuează neașteptat, prima ipoteză e că s-au schimbat.

6. **Reconstruiește lista de task-uri** cu TodoWrite din secțiunea *Următorii pași*, păstrând
   marcajele de blocat.

7. **Raportează scurt** (maximum 8 rânduri), în ordinea asta:
   - unde s-a rămas, într-o propoziție
   - ce e blocat și **ce anume aștepți de la utilizator** ca să se deblocheze
   - ce e scris deja în sisteme externe și nu se poate lua înapoi (secțiunea *Stare reală*)
   - ce propui să faci în continuare

   Nu rezuma dump-ul secțiune cu secțiune și nu repeta ce a citit utilizatorul deja.
   Nu începe să lucrezi până nu confirmă — poate s-a răzgândit între sesiuni.
