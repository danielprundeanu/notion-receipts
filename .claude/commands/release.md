---
description: Actualizează CHANGELOG, bump versiune și commit release
argument-hint: [versiune] (ex: 1.2.0)
allowed-tools: Read, Write, Edit, Bash(git log:*), Bash(git tag:*), Bash(git add:*), Bash(git commit:*), Bash(git status:*)
---

## Context

- Versiunea curentă în package.json: !`cat webapp/package.json | grep '"version"' | head -1`
- Ultimul tag de versiune: !`git tag --sort=-version:refname | head -1`
- Commit-uri de la ultimul tag până acum: !`git log $(git tag --sort=-version:refname | head -1)..HEAD --oneline --no-merges 2>/dev/null || git log --oneline --no-merges -30`
- Data de azi: !`date +%Y-%m-%d`
- Status git: !`git status --short`

## Task

Versiunea nouă dorită de utilizator: **$1**

Dacă `$1` este gol, propune versiunea următoare incrementând minor (ex: `0.1.0` → `0.2.0`) și întreabă utilizatorul dacă e ok.

### Pași de urmat:

1. **Determină versiunea** — folosește `$1` dacă e furnizat, altfel propune incrementarea minor din package.json

2. **Citește CHANGELOG.md** — dacă există, adaugă o nouă secțiune în top. Dacă nu există, creează-l.

3. **Construiește entry-ul de changelog** — din lista de commit-uri de mai sus, grupează inteligent feature-urile în categorii relevante:
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

6. **Scrie fișierele** — CHANGELOG.md și webapp/package.json

7. **Creează commit-ul git:**
   ```
   git add CHANGELOG.md webapp/package.json
   git commit -m "chore: release v$VERSION"
   ```

Nu taga git-ul automat — lasă utilizatorul să decidă dacă vrea tag.
