"""
normalize_units.py — Detectează și rezolvă conflicte de unități de măsură

Citește ingrediente din data/local/local_recipes.txt, le compară cu unitățile
definite în webapp (SQLite dev.db), și interactiv te întreabă ce să faci
pentru fiecare conflict.

Utilizare:
  python normalize_units.py
  python normalize_units.py --input data/local/scraped_local_recipes.txt
  python normalize_units.py --input data/urls/scraped_recipe_urls.txt
  python normalize_units.py --input data/local/local_recipes.txt   # format raw (fallback)

Auto-detectează formatul:
  - scraped (=== Title ===, linii [qty unit]) — output de la scrape_recipes.py
  - raw (separator ----, secțiuni # Ingredients) — local_recipes.txt neprocesat
"""

import re
import os
import json
import secrets
import sqlite3
import string
import argparse
from typing import Optional
from difflib import SequenceMatcher


def _new_id() -> str:
    alphabet = string.ascii_lowercase + string.digits
    return "c" + "".join(secrets.choice(alphabet) for _ in range(24))

# ──────────────────────────────────────────────────────────────
# Normalizare unități
# ──────────────────────────────────────────────────────────────

UNIT_NORMALIZE = {
    # Volumetric
    "cups": "cup", "cup": "cup",
    "tablespoons": "tbsp", "tablespoon": "tbsp", "tbsp": "tbsp", "tbsp.": "tbsp",
    "teaspoons": "tsp", "teaspoon": "tsp", "tsp": "tsp", "tsp.": "tsp",
    "milliliters": "ml", "milliliter": "ml", "ml": "ml",
    "liters": "l", "liter": "l", "l": "l",
    "pints": "pint", "pint": "pint",
    "fluid ounces": "fl oz", "fl oz": "fl oz",
    # Gravimetric
    "grams": "g", "gram": "g", "g": "g",
    "kilograms": "kg", "kilogram": "kg", "kg": "kg",
    "ounces": "oz", "ounce": "oz", "oz": "oz", "oz.": "oz",
    "pounds": "lb", "pound": "lb", "lb": "lb", "lbs": "lb",
    # Numărabile
    "pieces": "piece", "piece": "piece",
    "handfuls": "handful", "handful": "handful",
    "pinches": "pinch", "pinch": "pinch",
    "cloves": "clove", "clove": "clove",
    "slices": "slice", "slice": "slice",
    "cans": "can", "can": "can",
    "jars": "jar", "jar": "jar",
    "bunches": "bunch", "bunch": "bunch",
    # Românești
    "linguri": "tbsp", "lingura": "tbsp", "lingură": "tbsp",
    "lingurite": "tsp", "linguriță": "tsp", "lingurita": "tsp",
    "cani": "cup", "cană": "cup", "cana": "cup",
    "bucati": "piece", "bucată": "piece", "bucata": "piece",
    "buc": "piece",
    "ml": "ml", "l": "l",
}

# Unități fără cantitate (de ignorat la comparație — nu au un "unit" în baza de date)
UNITLESS_MARKERS = {"to taste", "as needed", "optional", "pinch of", "dash of"}


def normalize_unit(raw: str) -> str:
    """Normalizează o unitate la forma canonică."""
    key = raw.strip().lower()
    return UNIT_NORMALIZE.get(key, key)


# ──────────────────────────────────────────────────────────────
# Conversie automată cu pint (sursă sigură pentru unități standard)
# ──────────────────────────────────────────────────────────────

# Mapare de la unitățile noastre la denumirile pint
_PINT_ALIAS: dict[str, str] = {
    "g": "gram", "kg": "kilogram",
    "ml": "milliliter", "l": "liter",
    "cup": "cup", "tbsp": "tablespoon", "tsp": "teaspoon",
    "oz": "ounce", "lb": "pound", "pint": "pint",
    "fl oz": "fluid_ounce",
}

try:
    from pint import UnitRegistry as _UnitRegistry, errors as _pint_errors
    _ureg = _UnitRegistry()
    _PINT_AVAILABLE = True
except ImportError:
    _PINT_AVAILABLE = False
    _pint_errors = None
    _ureg = None  # type: ignore


def pint_convert(qty: float, from_unit: str, to_unit: str) -> Optional[float]:
    """
    Convertește automat cantitatea între unități folosind librăria pint.

    Funcționează pentru conversii în aceeași dimensiune (masă↔masă, volum↔volum).
    Returnează None dacă pint nu e disponibil sau conversie imposibilă
    (ex: cup→g — diferite dimensiuni fizice, necesită factor de densitate).

    Exemple:
        pint_convert(1, "cup", "ml")   → 236.588
        pint_convert(1, "oz", "g")     → 28.3495
        pint_convert(1, "lb", "kg")    → 0.453592
        pint_convert(1, "cup", "g")    → None  (cross-dimension)
    """
    if not _PINT_AVAILABLE or qty is None:
        return None

    from_pint = _PINT_ALIAS.get(from_unit, from_unit)
    to_pint = _PINT_ALIAS.get(to_unit, to_unit)

    try:
        result = (_ureg.Quantity(qty, from_pint)).to(to_pint)
        return round(float(result.magnitude), 6)
    except Exception:
        # Dimensiuni incompatibile sau unitate necunoscută
        return None


# ──────────────────────────────────────────────────────────────
# Parsare ingredient line
# ──────────────────────────────────────────────────────────────

# Unități recunoscute (pentru a le separa de numele ingredientului)
KNOWN_UNITS_RE = re.compile(
    r'^(cup|cups|tbsp|tbsp\.|tablespoon|tablespoons|tsp|tsp\.|teaspoon|teaspoons'
    r'|oz|oz\.|ounce|ounces|lb|lb\.|lbs|pound|pounds'
    r'|g|gram|grams|kg|kilogram|kilograms'
    r'|ml|milliliter|milliliters|l|liter|liters'
    r'|pint|pints|handful|handfuls|pinch|pinches|piece|pieces'
    r'|clove|cloves|slice|slices|can|cans|jar|jars|bunch|bunches'
    r'|lingur[iăa]|lingurit[ăae]|can[ăi]|buc[aăt]?|bucat[ăi]|buc)\b',
    re.I
)

# Cantitate: fracții, numere, range-uri
QTY_RE = re.compile(
    r'^(\d+\s*[/⁄]\s*\d+|\d+\.\d+|\d+\s+\d+\s*[/⁄]\s*\d+|\d+(?:\s*-\s*\d+)?)'
)


def parse_ingredient_line(line: str) -> Optional[tuple[str, Optional[str], str]]:
    """
    Extrage (quantity_str, unit_str, ingredient_name) dintr-o linie de ingredient.
    Returnează None dacă linia nu pare a fi un ingredient.
    """
    line = line.strip()
    if not line:
        return None

    # Ignoră linii care sunt evident instrucțiuni, nu ingrediente
    for marker in UNITLESS_MARKERS:
        if marker in line.lower():
            return None

    # Încearcă să extragă cantitate
    qty_match = QTY_RE.match(line)
    if not qty_match:
        # Fără cantitate numerică — poate fi "1 banana" fără unitate sau "Pinch of salt"
        # Dacă nu începe cu cifră, nu e ingredient standard
        if not line[0].isdigit():
            return None
        return None

    qty_str = qty_match.group(1)
    rest = line[qty_match.end():].strip()

    if not rest:
        return None

    # Încearcă să identifice unitatea
    unit_str = None
    unit_match = KNOWN_UNITS_RE.match(rest)
    if unit_match:
        unit_str = unit_match.group(0).strip()
        ingredient_name = rest[unit_match.end():].strip()
        # Elimină "of" după unitate (ex: "cloves of garlic" → garlic)
        if ingredient_name.lower().startswith("of "):
            ingredient_name = ingredient_name[3:].strip()
    else:
        ingredient_name = rest

    if not ingredient_name:
        return None

    # Curăță descrieri după virgulă (ex: "garlic, minced" → "garlic")
    ingredient_name = ingredient_name.split(",")[0].strip()
    # Elimină paranteze (ex: "milk (any kind)" → "milk")
    ingredient_name = re.sub(r'\s*\(.*?\)', '', ingredient_name).strip()
    # Elimină sufixe descriptive frecvente (OR ..., or ...)
    ingredient_name = re.sub(r'\s+(?:OR|or)\s+.*$', '', ingredient_name).strip()

    return qty_str, unit_str, ingredient_name.lower()


# ──────────────────────────────────────────────────────────────
# Parsare format scraped (output scrape_recipes.py)
# ──────────────────────────────────────────────────────────────

# Linie de ingredient scraped: [qty] name sau [qty unit] name
BRACKET_LINE_RE = re.compile(r'^\[([^\]]+)\]\s*(.+)$')


def _parse_bracket_qty_unit(bracket: str) -> tuple[str, Optional[str]]:
    """Extrage (qty, unit) din conținutul unui bracket: '0.5 cup' → ('0.5', 'cup')."""
    bracket = bracket.strip()
    # Încearcă qty + unit
    m = re.match(r'^([0-9./\s]+)\s+(.+)$', bracket)
    if m:
        return m.group(1).strip(), m.group(2).strip()
    # Doar qty
    return bracket, None


def extract_ingredients_scraped(content: str) -> list[dict]:
    """
    Parsează format scrape_recipes.py:
      === Title ===
      ...metadata...
      [qty unit] ingredient, adjective
      Steps: ...
    """
    results = []
    recipe_name = None
    in_ingredients = False

    for raw_line in content.splitlines():
        line = raw_line.strip()

        # Titlu rețetă
        m = re.match(r'^===\s*(.+?)\s*===$', line)
        if m:
            recipe_name = m.group(1).rstrip(".")
            in_ingredients = False
            continue

        if not recipe_name:
            continue

        # Linie goală sau metadata (Servings/Time/...) nu e ingredient
        if not line or re.match(r'^(Servings|Time|Difficulty|Favorite|Link|Slices|Steps|Category):', line):
            continue

        # Sfârșitul ingredientelor: linie Steps: sau ## sau linie de instrucțiuni numerotate
        if re.match(r'^(Steps:|##|\d+\.)', line):
            in_ingredients = False
            continue

        # Linie ingredient: începe cu [
        if line.startswith('['):
            m = BRACKET_LINE_RE.match(line)
            if not m:
                continue
            bracket, rest = m.group(1), m.group(2).strip()
            qty, unit = _parse_bracket_qty_unit(bracket)

            # Elimină tot ce vine după virgulă (adjective mutate acolo de scraper)
            name = rest.split(",")[0].strip()
            # Elimină paranteze și "OR ..." sufixe
            name = re.sub(r'\s*\(.*?\)', '', name).strip()
            name = re.sub(r'\s+(?:OR|or)\s+.*$', '', name).strip()

            if not name:
                continue

            results.append({
                "recipe": recipe_name,
                "raw_line": line,
                "qty": qty,
                "unit": unit,
                "name": name.lower(),
            })
            in_ingredients = True

    return results


# ──────────────────────────────────────────────────────────────
# Parsare format raw (local_recipes.txt)
# ──────────────────────────────────────────────────────────────

def extract_ingredients_raw(content: str) -> list[dict]:
    """Parsează format raw cu separator ---- și secțiuni # Ingredients."""
    recipe_blocks = re.split(r'\n\s*-{4,}\s*\n', content)
    results = []

    for block in recipe_blocks:
        block = block.strip()
        if not block:
            continue

        lines = [l for l in block.split("\n") if l.strip() and not re.match(r'^-{3,}$', l.strip())]
        if not lines:
            continue
        recipe_name = lines[0].strip().rstrip(".")

        in_ingredients = False
        for line in lines[1:]:
            stripped = line.strip()
            if stripped.startswith("#"):
                section = stripped.lstrip("#").strip().lower().rstrip(":")
                in_ingredients = bool(re.search(r'ingredient', section))
                continue

            if not in_ingredients:
                if not stripped[0:1].isdigit():
                    continue

            parsed = parse_ingredient_line(stripped)
            if parsed:
                qty, unit, name = parsed
                results.append({
                    "recipe": recipe_name,
                    "raw_line": stripped,
                    "qty": qty,
                    "unit": unit,
                    "name": name,
                })

    return results


# ──────────────────────────────────────────────────────────────
# Citire fișier (auto-detectează formatul)
# ──────────────────────────────────────────────────────────────

def extract_ingredients_from_file(filepath: str) -> tuple[list[dict], str]:
    """
    Parsează fișier cu rețete. Auto-detectează formatul:
      - scraped (=== Title ===, linii cu [qty unit])
      - raw (separator ----, secțiuni # Ingredients)
    Returnează (ingredients, format_name).
    """
    with open(filepath, encoding="utf-8") as f:
        content = f.read()

    # Detectare format: dacă are linii === ... ===, e format scraped
    if re.search(r'^===\s*.+\s*===$', content, re.MULTILINE):
        return extract_ingredients_scraped(content), "scraped"
    else:
        return extract_ingredients_raw(content), "raw"


# ──────────────────────────────────────────────────────────────
# Citire GroceryItems din SQLite
# ──────────────────────────────────────────────────────────────

def update_grocery_item_unit2(db_path: str, db_name: str, unit2: str, rate: Optional[float]):
    """Setează unit2 (și opțional conversion) pe un GroceryItem existent."""
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    if rate is not None:
        cur.execute(
            'UPDATE "GroceryItem" SET unit2 = ?, conversion = ? WHERE name = ?',
            (unit2, rate, db_name),
        )
    else:
        cur.execute(
            'UPDATE "GroceryItem" SET unit2 = ? WHERE name = ?',
            (unit2, db_name),
        )
    conn.commit()
    conn.close()


def load_grocery_items(db_path: str) -> dict[str, dict]:
    """
    Returnează dict: name_lower → { name, unit, unit2 }
    """
    if not os.path.isfile(db_path):
        print(f"  ⚠  DB nu a fost găsit: {db_path}")
        return {}

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute('SELECT name, unit, unit2, conversion FROM "GroceryItem"')
    rows = cur.fetchall()
    conn.close()

    items = {}
    for name, unit, unit2, conversion in rows:
        items[name.lower().strip()] = {
            "name": name,
            "unit": unit or "",
            "unit2": unit2 or "",
            "conversion": conversion,
        }
    return items


# ──────────────────────────────────────────────────────────────
# Normalizare nume ingrediente
# ──────────────────────────────────────────────────────────────

# Adjective culinare care nu fac parte din numele ingredientului
_ADJECTIVES = {
    'large', 'small', 'medium', 'big', 'tiny', 'mini', 'jumbo',
    'ripe', 'unripe', 'fresh', 'stale', 'raw', 'cooked',
    'cold', 'hot', 'warm', 'chilled', 'frozen', 'thawed',
    'whole', 'halved', 'quartered', 'chopped', 'diced', 'sliced',
    'minced', 'grated', 'shredded', 'crushed', 'ground', 'mashed',
    'peeled', 'unpeeled', 'pitted', 'seeded', 'trimmed', 'cleaned',
    'finely', 'coarsely', 'roughly', 'thinly', 'thickly',
    'blanched', 'roasted', 'toasted', 'fried', 'boiled', 'steamed',
    'baked', 'grilled', 'sauteed', 'poached', 'braised',
    'freshly', 'newly', 'just', 'canned', 'jarred', 'bottled',
    'packaged', 'boxed', 'dried', 'dehydrated', 'freeze-dried',
    'organic', 'natural', 'free-range', 'grass-fed', 'wild',
    'extra', 'premium', 'quality', 'squeezed', 'pressed',
    'filtered', 'strained', 'rinsed', 'drained', 'washed',
    'optional', 'additional', 'leftover', 'dry', 'wet',
    'soft', 'hard', 'firm', 'tender', 'plain', 'low-fat',
    'fat-free', 'reduced', 'unsalted', 'salted', 'sweetened',
    'unsweetened', 'full-fat', 'light', 'dark', 'white', 'black',
    'red', 'green', 'yellow', 'purple', 'orange',
}

# Cuvinte care indică procesare (opresc scanarea numelui)
_PREP_STOP = {
    'cut', 'into', 'and', 'with', 'without', 'for', 'to', 'or',
    'about', 'at', 'room', 'temperature',
}


def _strip_adjectives(name: str) -> str:
    """Elimină adjectivele de la începutul numelui ingredientului."""
    words = name.lower().split()
    # Sare cuvintele adjective de la început
    start = 0
    for i, w in enumerate(words):
        if w in _ADJECTIVES:
            start = i + 1
        else:
            break
    # Taie tot ce vine după un cuvânt de tip PREP_STOP
    end = len(words)
    for i in range(start, len(words)):
        if words[i] in _PREP_STOP:
            end = i
            break
    result = ' '.join(words[start:end]).strip()
    return result if result else name.lower()


def load_ingredient_mappings(mappings_path: str = "data/ingredient_mappings.json") -> dict[str, str]:
    """Încarcă grocery_mappings din ingredient_mappings.json (raw_name → canonical_name)."""
    if not os.path.isfile(mappings_path):
        return {}
    with open(mappings_path, encoding="utf-8") as f:
        data = json.load(f)
    # Normalizează cheile la lowercase pentru matching ușor
    return {k.lower().strip(): v.strip() for k, v in data.get("grocery_mappings", {}).items()}


def normalize_ingredient_name(raw: str, mappings: dict[str, str], grocery_items: dict[str, dict]) -> str:
    """
    Normalizează un nume de ingredient:
    1. Strippuiește adjectivele (ex: 'ripe banana' → 'banana')
    2. Aplică grocery_mappings (ex: 'cilantro' → 'Fresh Coriander')
    3. Returnează lowercase canonical name
    """
    # Pas 1: strip adjective
    stripped = _strip_adjectives(raw)

    # Pas 2: caută în mappings cu stripped, apoi cu raw
    for candidate in (stripped, raw.lower().strip()):
        if candidate in mappings:
            return mappings[candidate].lower()
        # Încearcă potrivire parțială: orice cheie din mappings e substring al candidat-ului
        for key, val in mappings.items():
            if key in candidate and len(key) >= 4:
                return val.lower()

    # Pas 3: dacă stripped există exact în grocery_items, folosește-l
    if stripped in grocery_items:
        return stripped

    return stripped


# ──────────────────────────────────────────────────────────────
# Fuzzy match ingredient name → GroceryItem
# ──────────────────────────────────────────────────────────────

def fuzzy_match(name: str, grocery_items: dict[str, dict], threshold: float = 0.80) -> Optional[dict]:
    """Încearcă exact match, apoi prefix match, apoi fuzzy."""
    # Exact
    if name in grocery_items:
        return grocery_items[name]

    # Plural simplu (ex: "bananas" → "banana")
    if name.endswith("s") and name[:-1] in grocery_items:
        return grocery_items[name[:-1]]

    # Prefix: DB key e conținut în numele din rețetă (ex: "spinach" în "baby spinach")
    # Nu invers — "cheese" NU trebuie să match-uieze "ricotta cheese"
    for key, item in grocery_items.items():
        if key in name:
            return item

    # Fuzzy
    best_ratio = 0.0
    best_item = None
    for key, item in grocery_items.items():
        ratio = SequenceMatcher(None, name, key).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            best_item = item
    if best_ratio >= threshold:
        return best_item

    return None


# ──────────────────────────────────────────────────────────────
# Persistare alegeri utilizator
# ──────────────────────────────────────────────────────────────

CHOICES_FILE = "data/local/unit_choices.json"


def load_choices() -> dict:
    if os.path.isfile(CHOICES_FILE):
        with open(CHOICES_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_choices(choices: dict):
    os.makedirs(os.path.dirname(CHOICES_FILE), exist_ok=True)
    with open(CHOICES_FILE, "w", encoding="utf-8") as f:
        json.dump(choices, f, ensure_ascii=False, indent=2)


# ──────────────────────────────────────────────────────────────
# Prompt interactiv
# ──────────────────────────────────────────────────────────────

def parse_rate_input(raw: str) -> Optional[float]:
    """Parsează un număr sau fracție introdusă de utilizator (ex: '0.01', '1/100', '100')."""
    raw = raw.strip().replace(",", ".")
    if not raw:
        return None
    # Fracție simplă: "1/100"
    frac = re.match(r'^(\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)$', raw)
    if frac:
        denom = float(frac.group(2))
        if denom == 0:
            return None
        return float(frac.group(1)) / denom
    try:
        return float(raw)
    except ValueError:
        return None


def prompt_conversion(from_unit: Optional[str], to_unit: str, db_conversion: Optional[float]) -> Optional[float]:
    """
    Cere utilizatorului factorul de conversie: 1 [from_unit] = ? [to_unit]

    Încearcă mai întâi conversie automată cu pint (pentru unități standard).
    Returnează rata ca float, sau None dacă utilizatorul sare.
    """
    from_label = from_unit or "bucată"

    # ── Încearcă conversie automată cu pint ──────────────────────
    auto_rate: Optional[float] = None
    if from_unit:
        auto_rate = pint_convert(1.0, normalize_unit(from_unit), normalize_unit(to_unit))

    print()
    print(f"  Conversie: 1 {from_label} = ? {to_unit}")

    if auto_rate is not None:
        print(f"  ✓ Conversie automată pint: 1 {from_label} = {auto_rate} {to_unit}")
        print(f"  Apasă Enter pentru a accepta, sau introdu altă valoare:")
    else:
        if _PINT_AVAILABLE:
            print(f"  (pint nu poate converti automat {from_label}→{to_unit} — dimensiuni diferite)")
        else:
            print(f"  (instalează 'pip install pint' pentru conversie automată)")
        if db_conversion is not None:
            print(f"  (DB are deja conversion={db_conversion} — poate fi util ca referință)")
        print(f"  Exemplu: '100' sau '1/100' sau '0.01'  |  Enter = sare fără conversie")
    print()

    while True:
        raw = input(f"  1 {from_label} = __ {to_unit} : ").strip()
        if not raw:
            # Enter fără input: dacă pint a calculat auto → acceptăm auto_rate
            if auto_rate is not None:
                print(f"  ✓ Acceptat automat: {auto_rate}")
                return auto_rate
            return None
        rate = parse_rate_input(raw)
        if rate is not None and rate > 0:
            return rate
        print("  Valoare invalidă. Introdu un număr pozitiv (ex: 0.01 sau 1/100).")


def prompt_user(name: str, raw_name: str, used_unit: Optional[str], db_item: dict) -> dict:
    """
    Afișează un prompt și returnează un dict cu alegerea.
    Chei posibile:
      { "action": "use_unit",  "unit": str, "rate": float|None, "from_unit": str|None }
      { "action": "set_unit2", "unit": str, "rate": float|None }
      { "action": "new" }
      { "action": "skip" }
    """
    unit1 = db_item["unit"]
    unit2 = db_item["unit2"]
    db_name = db_item["name"]
    db_conversion = db_item.get("conversion")
    can_set_unit2 = bool(used_unit and not unit2)

    print()
    print(f"  ┌─ Conflict unitate ──────────────────────────────────────────")
    if raw_name != name:
        print(f"  │  Ingredient (rețetă) : {raw_name}  →  {name}")
    else:
        print(f"  │  Ingredient (rețetă) : {name}")
    print(f"  │  Unitate folosită    : {used_unit or '(fără unitate)'}")
    print(f"  │  Ingredientul în DB  : {db_name}")
    print(f"  │  unit1 (principal)   : {unit1 or '(nesetat)'}")
    print(f"  │  unit2 (secundar)    : {unit2 or '(nesetat)'}")
    if db_conversion is not None:
        print(f"  │  conversion (DB)     : {db_conversion}")
    print(f"  └────────────────────────────────────────────────────────────")
    print()

    if unit1:
        print(f"  [1] Folosește unit1: {unit1}")
    if unit2:
        print(f"  [2] Folosește unit2: {unit2}")
    if can_set_unit2:
        print(f"  [2] Setează unit2 = {used_unit}  (adaugă la {db_name} în DB)")
    print(f"  [n] Ingredient nou  (cu unitate: {used_unit or '?'})")
    print(f"  [s] Sare peste")
    print()

    while True:
        choice = input("  Alegere: ").strip().lower()

        if choice == "1" and unit1:
            chosen = normalize_unit(unit1)
            from_unit = used_unit
            if from_unit and normalize_unit(from_unit) != chosen:
                rate = prompt_conversion(from_unit, chosen, db_conversion)
            elif from_unit is None:
                rate = prompt_conversion(None, chosen, db_conversion)
            else:
                rate = None
            return {"action": "use_unit", "unit": chosen, "rate": rate, "from_unit": from_unit}

        if choice == "2" and unit2:
            chosen = normalize_unit(unit2)
            from_unit = used_unit
            if from_unit and normalize_unit(from_unit) != chosen:
                rate = prompt_conversion(from_unit, chosen, db_conversion)
            elif from_unit is None:
                rate = prompt_conversion(None, chosen, db_conversion)
            else:
                rate = None
            return {"action": "use_unit", "unit": chosen, "rate": rate, "from_unit": from_unit}

        if choice == "2" and can_set_unit2:
            new_unit2 = normalize_unit(used_unit)
            print()
            print(f"  Rata de conversie din unit1 în unit2:")
            rate = prompt_conversion(unit1, new_unit2, db_conversion)
            return {"action": "set_unit2", "unit": new_unit2, "rate": rate}

        if choice == "n":
            return {"action": "new"}
        if choice == "s":
            return {"action": "skip"}
        print("  Opțiune invalidă. Încearcă din nou.")


# ──────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Detectează conflicte de unități în rețete locale")
    parser.add_argument(
        "--input", "-i",
        default="data/local/scraped_local_recipes.txt",
        help="Fișier cu rețete scraped sau raw (default: data/local/scraped_local_recipes.txt)",
    )
    parser.add_argument(
        "--db", "-d",
        default="webapp/dev.db",
        help="Calea SQLite dev.db (default: webapp/dev.db)",
    )
    parser.add_argument(
        "--threshold", "-t",
        type=float,
        default=0.80,
        help="Prag similaritate fuzzy (default: 0.80)",
    )
    parser.add_argument(
        "--report", "-r",
        metavar="OUTPUT.json",
        help="Exportă un raport JSON cu conflictele detectate (fără modul interactiv)",
    )
    args = parser.parse_args()

    # ── Încarcă date ──────────────────────────────────────────
    print(f"\n{'═'*62}")
    print(f"  normalize_units.py")
    print(f"{'═'*62}")
    print(f"  Input  : {args.input}")
    print(f"  DB     : {args.db}")
    print()

    print("Încărc grocery items din DB...")
    grocery_items = load_grocery_items(args.db)
    print(f"  {len(grocery_items)} ingrediente găsite în DB")

    print("Încărc ingredient mappings...")
    mappings = load_ingredient_mappings()
    print(f"  {len(mappings)} mappings de ingrediente\n")

    print(f"Parsez rețete din '{args.input}'...")
    all_ingredients, fmt = extract_ingredients_from_file(args.input)
    print(f"  Format detectat: {fmt}")
    print(f"  {len(all_ingredients)} linii de ingrediente extrase\n")

    # ── Grupează pe (normalized_name, unit) unice ─────────────
    # name_raw → normalized name (pentru afișare transparentă)
    seen: dict[tuple, dict] = {}  # (norm_name, unit) → { recipes, raw_name, db_item }
    for item in all_ingredients:
        unit_norm = normalize_unit(item["unit"]) if item["unit"] else None
        norm_name = normalize_ingredient_name(item["name"], mappings, grocery_items)
        key = (norm_name, unit_norm)
        if key not in seen:
            seen[key] = {"recipes": [], "raw_name": item["name"]}
        if item["recipe"] not in seen[key]["recipes"]:
            seen[key]["recipes"].append(item["recipe"])

    # ── Detectează conflicte ──────────────────────────────────
    choices = load_choices()
    conflicts: list[dict] = []

    for (name, unit_norm), meta in seen.items():
        db_item = fuzzy_match(name, grocery_items, args.threshold)
        if not db_item:
            continue  # Nu există în DB — nu putem compara

        db_unit1 = normalize_unit(db_item["unit"]) if db_item["unit"] else None
        db_unit2 = normalize_unit(db_item["unit2"]) if db_item["unit2"] else None

        # Ingredient fără unitate → se consideră "piece"
        effective_unit = unit_norm if unit_norm is not None else "piece"

        matches = (
            effective_unit == db_unit1
            or effective_unit == db_unit2
            or unit_norm is None and not db_unit1
        )

        if not matches:
            conflicts.append({
                "name": name,
                "raw_name": meta["raw_name"],
                "unit": effective_unit,  # None → "piece" implicit
                "db_item": db_item,
                "recipes": meta["recipes"],
            })

    # ── Sortează conflictele alfabetic după ingredient ─────────
    conflicts.sort(key=lambda c: (c["name"], c["unit"] or ""))

    print(f"{'─'*62}")
    print(f"  {len(conflicts)} conflicte de unități detectate")
    print(f"{'─'*62}\n")

    if not conflicts:
        print("  ✓ Niciun conflict — toate unitățile sunt compatibile cu DB!\n")
        return

    # ── Modul raport: exportă JSON și iese ────────────────────
    if args.report:
        pint_status = "disponibil" if _PINT_AVAILABLE else "indisponibil (pip install pint)"
        report = {
            "pint_available": _PINT_AVAILABLE,
            "pint_status": pint_status,
            "total_conflicts": len(conflicts),
            "conflicts": [
                {
                    "ingredient": c["name"],
                    "raw_name": c.get("raw_name", c["name"]),
                    "unit_in_recipe": c["unit"],
                    "db_name": c["db_item"]["name"],
                    "db_unit1": c["db_item"]["unit"],
                    "db_unit2": c["db_item"]["unit2"],
                    "recipes": c["recipes"],
                    "pint_auto_convert": (
                        pint_convert(1.0, normalize_unit(c["unit"]), normalize_unit(c["db_item"]["unit"]))
                        if c["unit"] and c["db_item"]["unit"] else None
                    ),
                }
                for c in conflicts
            ],
        }
        out_path = args.report
        os.makedirs(os.path.dirname(out_path) if os.path.dirname(out_path) else ".", exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        print(f"\n  ✓ Raport exportat în: {out_path}")
        print(f"  Pint: {pint_status}")
        return

    # ── Interactiv ────────────────────────────────────────────
    new_ingredients: list[dict] = []
    resolved: list[dict] = []

    for i, conflict in enumerate(conflicts, 1):
        name = conflict["name"]
        raw_name = conflict.get("raw_name", name)
        unit = conflict["unit"]
        db_item = conflict["db_item"]
        recipes = conflict["recipes"]

        cache_key = f"{name}|{unit or ''}"

        # Verifică dacă am ales deja (cache poate fi dict sau string legacy)
        if cache_key in choices:
            cached = choices[cache_key]
            # Suportă format vechi (string) și nou (dict)
            if isinstance(cached, dict):
                action = cached.get("action", "use_unit")
                if action == "skip":
                    print(f"  [{i}/{len(conflicts)}] {name} ({unit or '?'}) → sărit (din cache)")
                    continue
                elif action == "new":
                    print(f"  [{i}/{len(conflicts)}] {name} ({unit or '?'}) → ingredient nou (din cache)")
                    continue
                elif action == "set_unit2":
                    cached_unit = cached.get("unit", "")
                    rate = cached.get("rate")
                    rate_str = f", conversie: 1 {cached.get('from_unit', unit1 or '?')} = {rate} {cached_unit}" if rate else ""
                    print(f"  [{i}/{len(conflicts)}] {name} → unit2={cached_unit}{rate_str} (din cache)")
                    continue
                else:
                    chosen_unit = cached.get("unit", "")
                    rate = cached.get("rate")
                    rate_str = f", conversie: 1 {unit or '?'} = {rate} {chosen_unit}" if rate else ""
                    print(f"  [{i}/{len(conflicts)}] {name} ({unit or '?'}) → {chosen_unit}{rate_str} (din cache)")
                    resolved.append({"name": name, "old_unit": unit, "new_unit": chosen_unit, "rate": rate, "recipes": recipes})
            else:
                # Format vechi string
                print(f"  [{i}/{len(conflicts)}] {name} ({unit or '?'}) → {cached} (din cache)")
                resolved.append({"name": name, "old_unit": unit, "new_unit": cached, "rate": None, "recipes": recipes})
            continue

        print(f"\n  [{i}/{len(conflicts)}]  Rețete afectate: {', '.join(recipes[:3])}" +
              (" + altele" if len(recipes) > 3 else ""))

        result = prompt_user(name, raw_name, unit, db_item)

        if result["action"] == "skip":
            choices[cache_key] = {"action": "skip"}
            print(f"  ↷ Sărit")
        elif result["action"] == "new":
            new_ingredients.append({
                "name": name,
                "unit": unit or "",
                "unit2": "",
            })
            choices[cache_key] = {"action": "new", "unit": unit or ""}
            print(f"  ✚ Adăugat la lista de ingrediente noi")
        elif result["action"] == "set_unit2":
            new_unit2 = result["unit"]
            rate = result["rate"]
            update_grocery_item_unit2(args.db, db_item["name"], new_unit2, rate)
            # Actualizează și cache-ul local ca să nu mai fie conflict la rerulare
            grocery_items[name]["unit2"] = new_unit2
            choices[cache_key] = {"action": "set_unit2", "unit": new_unit2, "rate": rate}
            rate_str = f"  (1 {db_item['unit']} = {rate} {new_unit2})" if rate else ""
            print(f"  ✓ unit2 setat: {db_item['name']} → unit2={new_unit2}{rate_str}  [DB actualizat]")
        else:
            chosen_unit = result["unit"]
            rate = result["rate"]
            choices[cache_key] = {"action": "use_unit", "unit": chosen_unit, "rate": rate, "from_unit": unit}
            resolved.append({"name": name, "old_unit": unit, "new_unit": chosen_unit, "rate": rate, "recipes": recipes})
            rate_str = f"  (1 {unit or 'buc'} = {rate} {chosen_unit})" if rate else ""
            print(f"  ✓ Ales: {chosen_unit}{rate_str}")

        # Salvează imediat după fiecare alegere (rezistență la întreruperi)
        save_choices(choices)

    # ── Sumar ─────────────────────────────────────────────────
    print(f"\n{'═'*62}")
    print(f"  SUMAR")
    print(f"{'═'*62}")
    print(f"  Conflicte găsite    : {len(conflicts)}")
    print(f"  Rezolvate           : {len(resolved)}")
    print(f"  Ingrediente noi     : {len(new_ingredients)}")
    print()

    if resolved:
        print("  Unități actualizate:")
        for r in resolved:
            rate = r.get("rate")
            rate_str = f"  [1 {r['old_unit'] or 'buc'} = {rate} {r['new_unit']}]" if rate else ""
            print(f"    • {r['name']}: {r['old_unit'] or '(fără)'} → {r['new_unit']}{rate_str}")

    print()

    # Creează interactiv ingredientele marcate __new__ în ingredient_mappings.json
    prompt_new_grocery_items(args.db)


def _read_optional_float(prompt: str) -> Optional[float]:
    """Citește un număr opțional de la stdin. Enter gol → None."""
    raw = input(prompt).strip().replace(",", ".")
    if not raw:
        return None
    try:
        return float(raw)
    except ValueError:
        print("    ⚠ Valoare invalidă, ignorată.")
        return None


def prompt_new_grocery_items(db_path: str, mappings_path: str = "data/ingredient_mappings.json"):
    """
    Găsește toate ingredientele marcate __new__ în ingredient_mappings.json,
    le interoghează câmp cu câmp și le inserează în GroceryItem.
    """
    if not os.path.isfile(mappings_path):
        return

    with open(mappings_path, encoding="utf-8") as f:
        data = json.load(f)

    grocery_mappings = data.get("grocery_mappings", {})
    new_names = sorted(k for k, v in grocery_mappings.items() if v == "__new__")

    if not new_names:
        return

    print(f"\n{'═'*62}")
    print(f"  INGREDIENTE NOI  ({len(new_names)} de creat)")
    print(f"{'═'*62}")

    conn = sqlite3.connect(db_path)
    created = 0

    for raw_name in new_names:
        print(f"\n  ┌─────────────────────────────────────────────────────")
        print(f"  │  Ingredient nou: {raw_name}")
        print(f"  └─────────────────────────────────────────────────────")
        print("  (Enter gol = câmp gol / sare peste)")

        try:
            name   = input(f"  Nume ingredient [{raw_name}]: ").strip() or raw_name
            unit1  = input("  Unitate1 (ex: g, ml, piece): ").strip() or None
            unit2  = input("  Unitate2 (ex: cup, tbsp):    ").strip() or None
            conv   = _read_optional_float("  Conversie (1 unit1 = ? unit2): ")
            kcal   = _read_optional_float("  Kcal/100g: ")
            carbs  = _read_optional_float("  Carbs/100g: ")
            fat    = _read_optional_float("  Fat/100g: ")
            protein = _read_optional_float("  Protein/100g: ")
        except (EOFError, KeyboardInterrupt):
            print("\n  ✗ Întrerupt.")
            break

        item_id = _new_id()
        try:
            conn.execute(
                """
                INSERT INTO "GroceryItem"
                  (id, name, unit, unit2, conversion, kcal, carbs, fat, protein)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (item_id, name, unit1, unit2, conv, kcal, carbs, fat, protein),
            )
            conn.commit()
            grocery_mappings[raw_name] = name
            print(f"  ✓ Creat: '{name}'  [id: {item_id}]")
            created += 1
        except Exception as e:
            print(f"  ✗ Eroare la inserare: {e}")

    conn.close()

    # Salvează mappings actualizate (__new__ → nume real)
    if created:
        data["grocery_mappings"] = grocery_mappings
        with open(mappings_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"\n  {created} ingrediente create în DB.")
        print(f"  ingredient_mappings.json actualizat.\n")


if __name__ == "__main__":
    main()
