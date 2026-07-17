---
description: Changelog, bump versiune, commit ȘI push pe origin (deploy producție)
argument-hint: [versiune] (ex: 1.2.0)
allowed-tools: Read, Write, Edit, Bash(git log:*), Bash(git tag:*), Bash(git add:*), Bash(git commit:*), Bash(git status:*), Bash(git rev-parse:*), Bash(git symbolic-ref:*), Bash(git remote:*), Bash(git push:*)
---

## Context

- Versiunea curentă în package.json: !`cat webapp/package.json | grep '"version"' | head -1`
- Ultimul tag de versiune: !`git tag --sort=-version:refname | head -1`
- Commit-uri de la ultimul tag până acum: !`git log $(git tag --sort=-version:refname | head -1)..HEAD --oneline --no-merges 2>/dev/null || git log --oneline --no-merges -30`
- Data de azi: !`date +%Y-%m-%d`
- Branch curent: !`git rev-parse --abbrev-ref HEAD`
- Remote origin: !`git remote get-url origin 2>/dev/null || echo "(fără origin)"`
- Status git: !`git status --short`

## Task

Versiunea nouă dorită de utilizator: **$1**

Dacă `$1` este gol, propune versiunea următoare incrementând minor (ex: `0.1.0` → `0.2.0`) și întreabă utilizatorul dacă e ok.

> ⚠️ **Atenție:** push-ul pe `main` declanșează deploy de producție pe Vercel. Această comandă
> face push la final — asta e scopul ei. Rulează doar când ești gata să dai drumul la deploy.

### Pași de urmat:

1. **Determină versiunea** — folosește `$1` dacă e furnizat, altfel propune incrementarea minor din package.json.

2. **Citește CHANGELOG.md** (rădăcina repo — cel canonic) — adaugă o nouă secțiune în top. Dacă nu există, creează-l.

3. **Construiește entry-ul de changelog** — din lista de commit-uri de mai sus, grupează inteligent în categorii relevante:
   - `### ✨ Features` — funcționalități noi
   - `### 🐛 Fixes` — bugfix-uri
   - `### 🎨 UI / UX` — îmbunătățiri vizuale
   - `### ⚙️ Internals` — refactoring, configurare, tooling

   Omite commit-urile de merge. Formulează fiecare item clar, în română sau engleză (după cum e scris commit-ul).

4. **Formatul entry-ului:**
   ```
   ## [X.Y.Z] — YYYY-MM-DD

   ### ✨ Features
   - ...

   ### 🐛 Fixes
   - ...
   ```

5. **Actualizează `webapp/package.json`** — schimbă câmpul `"version"` la versiunea nouă.

6. **Scrie fișierele** — CHANGELOG.md (rădăcină) și webapp/package.json.

7. **Creează commit-ul git:**
   ```
   git add CHANGELOG.md webapp/package.json
   git commit -m "chore: release v$VERSION"
   ```

8. **Push pe origin** — push pe branch-ul curent (cel din Context de mai sus):
   ```
   git push origin HEAD
   ```
   Dacă push-ul eșuează (ex: remote înainte cu commit-uri, protecție de branch), NU forța (`--force`) —
   raportează eroarea utilizatorului și oprește-te.

9. **Confirmă rezultatul** — spune ce versiune a fost lansată, pe ce branch s-a făcut push, și, dacă
   branch-ul e `main`, menționează că deploy-ul de producție pe Vercel a pornit.

Nu taga git-ul automat — lasă utilizatorul să decidă dacă vrea tag.
