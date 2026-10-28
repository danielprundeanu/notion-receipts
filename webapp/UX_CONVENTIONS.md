# UX & i18n conventions

> Read this before any UI change. The app is used **predominantly on mobile** by **2 trusted
> users** with **shared data**. Optimize for mobile ergonomics, correctness of shared data, and
> honest feedback — not for scale/abuse hardening.

## Mobile-first & touch targets
- Design and test at **~390px width first**; desktop is secondary.
- Interactive controls need a **≥40px (ideally 44px) touch target**. Concretely:
  - Round steppers (+/− porții): `w-10 h-10` (min), never `w-7 h-7`.
  - Icon-only nav arrows / close buttons: `p-3` or `min-w-[44px] min-h-[44px] flex items-center justify-center` (keep the icon small, grow the hit area).
  - Tappable list rows: give real vertical padding (`py-2.5`+).
- Don't rely on **hover** for anything essential on mobile (no hover exists). In select mode, tapping a card must toggle selection, not navigate. Destructive actions need a **visible affordance**, not swipe-only.
- Wide content (tables) must not overflow the page body — give it its own `overflow-x-auto`, or switch to a card/list layout under `md:`.

## Feedback & error handling (shared data — no silent failures)
- **Every mutation** (server action / `fetch`) is wrapped in `try/catch`. On failure: **roll back** the optimistic UI to its prior state and show a message (toast / inline red text). Never leave a false "saved" state.
- **Loading always clears**: put `setLoading(false)` in `finally`. A spinner must never hang on error. For data loads, prefer an **error + "Reîncearcă"** state over a false empty state.
- **Modals**: `try/catch/finally`; on error keep the modal open, show the error, stop the spinner — never a stuck disabled button.
- After mutations, `revalidatePath` the pages that render the changed data (e.g. editing a grocery item → `revalidatePath("/recipes")`).

## Data integrity
- Multi-step DB writes must be **transactional** (`prisma.$transaction`). Keep external API calls (translation, blob) **outside** the transaction.
- Don't delete a `GroceryItem` still referenced by ingredients (it would orphan nameless rows) — the server refuses and the UI explains why.
- Validate numeric inputs server-side (planner servings ≥ 0.1, two decimals; recipe batch servings ≥ 1 integer; dayOfWeek 0–6, etc.).

## i18n (UI copy is English)
- All user-facing copy is **English**. Locale for dates: `toLocaleDateString("en-US", …)`.
- The app was Romanian through v0.25.0 and fully translated to English in v0.26.0. If you find a stray
  Romanian UI string, translate it (grep for the diacritics `ăâîșțĂÂÎȘȚ` — remaining hits should only be
  code comments or the text-parser regex that matches Romanian `porții` in pasted recipe input).
- **DANGER — some English strings are DB values / filter keys, NOT free display text.** Never rename the
  stored value; render it through `lib/labels.ts`:
  - `WeekPlan.mealType` (`Breakfast`/`Lunch`/…) → `mealLabel()`
  - `Recipe.category` (`Soup`/`Dinner`/…) → `categoryLabel()`
  - `Recipe.difficulty` (`Easy`/`Moderate`/`Hard`) → `difficultyLabel()`
  - `GroceryItem.category` (emoji-prefixed, e.g. `🍎 Fruits`) → `groceryCategoryLabel()` (strips the emoji)
  - Keep the stored value in the DB, the `?cat=` URL, `<option value>`, and all comparisons. Only `{…Label(v)}` in display.
- Because the UI is now English and the stored values are already English, these helpers are effectively
  identity (except `groceryCategoryLabel`, which drops the emoji prefix) — but keep calling them so display
  stays decoupled from storage if the label mapping ever changes again.
- `GroceryItem.nameRo` is a **Romanian search alias** (field labelled "Name (RO)"); it may legitimately hold
  Romanian text and is used only to match search queries, never as primary display copy.
- Units (`g`, `ml`, `cup`, `tsp`, …) are values/conventions — never "translated".

## Theme
- Dark/light via the `.dark` class on `<html>`; localStorage key `"theme"`.
- An **anti-flash inline script** in `app/layout.tsx` applies the class before first paint (mirrors `ThemeProvider`). `ThemeProvider` must not clobber it on its first effect run. Don't remove either half.

## Images (Vercel)
- Upload routes use **Vercel Blob** when `BLOB_READ_WRITE_TOKEN` is set (store must be **public** — private stores can't be served via `<img>`); dev falls back to the filesystem.
- Never store base64 in the DB (`imageUrl`). `next.config` `remotePatterns` only allows the blob host, and recipes imported from a link keep the source site's image URL — so never pass `recipe.imageUrl` to `next/image` directly. Use `components/RecipeCover` (it uses `next/image` only for local `/…` and blob URLs, a plain `<img>` otherwise) or a plain `<img>`; one bad host would otherwise crash the whole page.

## Styling
- Match the surrounding component's Tailwind + dark-mode tokens: `dark:bg-[#1f1f1f]`, `#2a2a2a` inputs, `#e3e3e3` text, **orange-500** brand accent, teal secondary.
- **Never white on `orange-500`** (2.9:1, fails). Anything filled orange — buttons, the FAB, checkboxes, badges —
  takes `text-gray-900` (6.1:1).
- **Selected chips / pills / segments are tinted, not filled:** `bg-orange-100 border-orange-300 text-orange-800
  dark:bg-orange-500/15 dark:border-orange-500/50 dark:text-orange-300` (drop the border classes on segments).
  A solid orange chip swallows the emoji. Chip counts take no `opacity-*`: gray-600 at 85% falls under 4.5:1 on white.
