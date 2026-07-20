// Text normalization for accent- and case-insensitive search (RO/EN).
// "Supă de pui" and "supa de pui" both normalize to "supa de pui".
export function normalizeSearch(s: string): string {
  return s
    .normalize("NFD")                 // split accented chars into base + combining mark
    .replace(/\p{Diacritic}/gu, "")   // strip the combining diacritics
    .toLowerCase()
    .trim();
}

// The stored, matchable blob for a recipe: its title plus the alternate-language
// title (usually the RO translation), normalized. Search matches against this so a
// query in either language / with or without diacritics finds the recipe.
export function buildRecipeSearchText(name: string, altTitle: string | null | undefined): string {
  return normalizeSearch([name, altTitle ?? ""].filter(Boolean).join(" "));
}
