#!/usr/bin/env python3
"""
web_import_handler.py — Bridge între web UI și logica Python de import rețete.

Mod de utilizare (apelat de Next.js API routes prin subprocess):
  echo '{"urls": ["https://..."]}' | python scripts/web_import_handler.py --mode parse-urls
  echo '{"text": "=== Recipe ===\n..."}' | python scripts/web_import_handler.py --mode parse-text

Output: JSON array de rețete parsate → stdout
Logs:   scrise în stderr (stdout rămâne JSON curat)
"""

import argparse
import json
import sys
import os
import io
import re
import base64
import mimetypes
from contextlib import redirect_stdout, redirect_stderr
from fractions import Fraction

# Schimbă directorul curent în scripts/ pentru ca importurile să funcționeze
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(SCRIPT_DIR)
sys.path.insert(0, SCRIPT_DIR)


# ──────────────────────────────────────────────────────────────
# Parsare URL-uri web
# ──────────────────────────────────────────────────────────────

def parse_urls(urls: list) -> list:
    """
    Scrape-uiește URL-urile și returnează lista de rețete parsate.
    Flux: RecipeScraper → convert_to_txt_format → parse_text
    (aceleași funcții ca la importul din txt, cu excepția pasului de scraping).
    """
    buf = io.StringIO()
    with redirect_stdout(buf), redirect_stderr(buf):
        from scrape_recipes import RecipeScraper

    scraper = RecipeScraper()
    results = []

    for url in urls:
        url = url.strip()
        if not url:
            continue
        try:
            # Redirect print-uri din scraper în stderr (nu poluăm stdout JSON)
            buf = io.StringIO()
            with redirect_stdout(buf):
                recipe_raw = scraper.scrape_recipe(url)

            if not recipe_raw:
                results.append({"error": f"Nu s-a putut extrage rețeta de la {url}", "url": url})
                continue

            # Convertim la format txt (=== / # grup / ## Steps)
            buf2 = io.StringIO()
            with redirect_stdout(buf2):
                txt = scraper.convert_to_txt_format(recipe_raw)

            # Parsăm prin același pipeline ca importul din txt
            parsed_list = parse_text(txt)
            if not parsed_list:
                results.append({"error": f"Nu s-a putut parsa rețeta de la {url}", "url": url})
                continue

            results.extend(parsed_list)

        except Exception as e:
            results.append({"error": str(e), "url": url})

    return results


# ──────────────────────────────────────────────────────────────
# Parser format simplu (nou)
# ──────────────────────────────────────────────────────────────

# Unități recunoscute pentru detecție automată
_KNOWN_UNITS = {
    'g', 'kg', 'mg', 'ml', 'l', 'dl', 'cl',
    'tsp', 'tbsp', 'cup', 'cups',
    'oz', 'lb', 'lbs',
    'piece', 'pieces', 'buc', 'buc.',
    'slice', 'slices', 'handful', 'pinch', 'scoop',
    'can', 'bottle', 'clove', 'cloves', 'bunch', 'head', 'heads',
    # română
    'linguriță', 'lingurițe', 'linguri', 'lingurite', 'lingura',
    'ceasca', 'ceașcă', 'cești', 'cana',
    'bucată', 'bucăți', 'fir', 'fire',
}

_META_RE = re.compile(
    r'^(Servings|Time|Difficulty|Favorite|Link|Image|Categories|Category|Batch):\s*(.*)',
    re.IGNORECASE
)
_STEP_RE = re.compile(r'^(\d+)[.)]\s+(.*)')
_QTY_RE  = re.compile(r'^([¼½¾\d][¼½¾\d\s./,]*)\s+(.+)$')
# Compact notation: "200g Ciocolată", "1.5kg Făină" (no space between qty and unit)
_COMPACT_QTY_RE = re.compile(r'^([¼½¾\d][¼½¾\d./,]*)([a-zA-ZĂăȘșȚțÎîÂâ]+\.?)\s+(.+)$')

# Caractere Unicode fracții → float
_FRAC_MAP = {'½': '1/2', '¼': '1/4', '¾': '3/4'}


def _to_float(s: str):
    s = s.strip()
    for ch, rep in _FRAC_MAP.items():
        s = s.replace(ch, rep)
    s = s.replace(',', '.')
    try:
        return float(Fraction(s))
    except Exception:
        return None


def _parse_simple_ingredient(line: str):
    """Parsează 'qty [unit] name' sau '[qty unit] name' (format vechi)."""
    line = line.strip()
    if not line:
        return None, None, None

    # Format vechi cu brackets: [qty unit] name
    m_bracket = re.match(r'^\[([^\]]+)\]\s*(.+)$', line)
    if m_bracket:
        bracket, name = m_bracket.group(1).strip(), m_bracket.group(2).strip()
        m_qu = re.match(r'^([¼½¾\d][¼½¾\d\s./,]*)\s+(.+)$', bracket)
        if m_qu:
            qty = _to_float(m_qu.group(1))
            raw_unit = m_qu.group(2).strip() or None
            unit = _ABBR_MAP.get(raw_unit.lower().rstrip('.'), raw_unit.rstrip('.')) if raw_unit else None
        else:
            qty = _to_float(bracket)
            unit = "piece" if _to_float(bracket) is not None else None
        name = name.split(',')[0].strip()
        return qty, unit, name.lower()

    # Format nou: qty [unit] name
    m_qty = _QTY_RE.match(line)
    if not m_qty:
        # Try compact notation: "200g Ciocolată"
        m_compact = _COMPACT_QTY_RE.match(line)
        if m_compact and m_compact.group(2).lower().rstrip('.') in _KNOWN_UNITS:
            qty = _to_float(m_compact.group(1))
            unit = m_compact.group(2)
            name = m_compact.group(3).strip()
        else:
            # Fără cantitate (ex: "pătrunjel verde")
            return None, None, line.lower()
    else:
        qty = _to_float(m_qty.group(1))
        rest = m_qty.group(2).strip()

        # Detectează unitate ca prim cuvânt dacă e în lista cunoscută
        parts = rest.split(None, 1)
        first = parts[0].rstrip('.')
        if first.lower() in _KNOWN_UNITS and len(parts) > 1:
            unit = parts[0]
            name = parts[1]
        else:
            unit = None
            name = rest

    # Curăță observații în paranteză, variante OR
    name = re.sub(r'\s*\(.*?\)', '', name).strip()
    name = re.sub(r'\s+(?:OR|or|SAU|sau)\s+.*$', '', name).strip()
    name = name.split(',')[0].strip()

    # Normalizează unitatea: strip punct + mapare abrevieri (ml. → ml, grame → g etc.)
    if unit:
        unit = _ABBR_MAP.get(unit.lower().rstrip('.'), unit.rstrip('.'))
    elif qty is not None:
        # Cantitate fără unitate → ingredient numărabil (ceapă, morcovi etc.)
        unit = "piece"

    return qty, unit, name.lower()


def parse_txt_simple(text: str) -> list:
    """
    Parsează formatul simplu de txt:

        === Titlu rețetă ===
        Servings: 4
        Time: 30
        Difficulty: Easy
        Favorite: No
        Categories: Dinner, Lunch
        Link: https://...
        Image: data/local/img/...

        # Grup ingrediente
        700 g carne
        2 morcovi

        ## Obs: notă descriptivă
        ## Steps:
        1. Pas unu
        2. Pas doi

    Reguli:
    - '=== Titlu ===' → rețetă nouă
    - 'Key: Value'    → metadata
    - '# Grup'        → grup de ingrediente (o singură diez)
    - '## Section'    → header secțiune în instrucțiuni (două dieze)
    - Linii sub '# Grup' → ingrediente 'qty [unit] name'
    - Linii sub '## '    → pași (numerotați sau plain text)
    """
    recipes = []
    r = None
    state = None          # 'meta' | 'ingr' | 'instr'
    group_name = None
    group_order = 0

    for raw in text.splitlines():
        line = raw.strip()

        # ── Titlu rețetă ──────────────────────────────────────
        m_title = re.match(r'^===\s*(.+?)\s*===$', line)
        if m_title:
            if r:
                recipes.append(r)
            r = {
                'name': m_title.group(1).rstrip('.'),
                'servings': None, 'time': None, 'difficulty': None,
                'category': None, 'favorite': False, 'link': None,
                'image': None, 'description': None, 'batch': True,
                'ingredients': [], 'instructions': [],
            }
            state = 'meta'
            group_name = None
            group_order = 0
            continue

        if r is None or not line:
            continue

        # ── Metadata ──────────────────────────────────────────
        m_meta = _META_RE.match(line)
        if m_meta and state == 'meta':
            key, val = m_meta.group(1).capitalize(), m_meta.group(2).strip()
            if key == 'Servings':
                # Handle inline "Servings: 2 Batch: False"
                m_batch_inline = re.search(r'batch:\s*(true|false|da|nu|yes)', val, re.IGNORECASE)
                if m_batch_inline:
                    r['batch'] = m_batch_inline.group(1).lower() in ('true', 'da', 'yes')
                    val = val[:m_batch_inline.start()].strip()
                try: r['servings'] = int(val)
                except ValueError: pass
            elif key == 'Batch':
                r['batch'] = val.lower() in ('true', 'da', 'yes')
            elif key == 'Time':
                try: r['time'] = int(val)
                except ValueError: pass
            elif key in ('Categories', 'Category'):
                r['category'] = val
            elif key == 'Difficulty': r['difficulty'] = val
            elif key == 'Favorite':   r['favorite'] = val.lower() in ('yes', 'da', 'true')
            elif key == 'Link':       r['link'] = val
            elif key == 'Image':
                # Local file path → base64 data URL (for local dev)
                img_val = val.strip()
                if img_val and not img_val.startswith(('http://', 'https://', 'data:')):
                    # Resolve relative to project root (one level up from scripts/)
                    project_root = os.path.dirname(SCRIPT_DIR)
                    img_path = os.path.join(project_root, img_val)
                    if os.path.isfile(img_path):
                        mime = mimetypes.guess_type(img_path)[0] or 'image/jpeg'
                        with open(img_path, 'rb') as f:
                            enc = base64.b64encode(f.read()).decode('ascii')
                        r['image'] = f'data:{mime};base64,{enc}'
                    else:
                        r['image'] = None
                else:
                    r['image'] = img_val or None
            continue

        # ── Grup ingrediente: # Grup ──────────────────────────
        # Exact un '#' urmat de spațiu (nu '##')
        if re.match(r'^#(?!#)\s+', line):
            group_name = line[1:].strip().rstrip(':')
            group_order += 1
            state = 'ingr'
            continue

        # ── Secțiune instrucțiuni: ## Section ─────────────────
        if line.startswith('## '):
            section_text = line[3:].strip().rstrip(':')
            # Adaugă header de secțiune dacă nu e doar "Steps" / "Instrucțiuni"
            if section_text.lower() not in ('steps', 'instrucțiuni', 'instructions', 'mod de preparare'):
                r['instructions'].append({'text': section_text, 'isSection': True})
            state = 'instr'
            continue

        # ── Ingredient (sub # grup) ────────────────────────────
        if state == 'ingr':
            qty, unit, name = _parse_simple_ingredient(line)
            if name:
                r['ingredients'].append({
                    'name':       name,
                    'qty':        qty,
                    'unit':       unit,
                    'groupName':  group_name,
                    'groupOrder': group_order,
                })
            continue

        # ── Pas instrucțiune (sub ## secțiune) ────────────────
        if state == 'instr':
            m_step = _STEP_RE.match(line)
            if m_step:
                r['instructions'].append({'text': m_step.group(2).strip(), 'isSection': False})
            else:
                r['instructions'].append({'text': line, 'isSection': False})
            continue

    if r:
        recipes.append(r)

    return recipes


# ──────────────────────────────────────────────────────────────
# Parsare text manual
# ──────────────────────────────────────────────────────────────

def parse_text(text: str) -> list:
    """
    Parsează text în format simplu (nou) sau scraped (vechi).

    Format simplu (nou) — recunoscut când textul conține '===':
        === Titlu ===
        Servings: 4
        Categories: Dinner, Lunch

        # Grup ingrediente
        700 g carne
        2 morcovi

        ## Steps:
        1. Pas unu

    Format vechi scraped (fallback) — cu [qty unit] brackets.
    """
    if not text.strip():
        return []

    # Normalizează unitățile românești înainte de parsare
    # "400 de grame de fasole" → "400 g fasole", "3 linguri de" → "3 tbsp" etc.
    text = normalize_text(text)

    # Format cu === titlu === → folosim noul parser simplu
    if "===" in text:
        try:
            return parse_txt_simple(text)
        except Exception as e:
            return [{"error": str(e)}]

    # Fallback: format vechi fără ===
    buf = io.StringIO()
    with redirect_stdout(buf), redirect_stderr(buf):
        from import_recipes import parse_scraped_file
        from scrape_recipes import RecipeScraper

    import tempfile
    try:
        scraper = RecipeScraper()
        recipe_blocks = re.split(
            r'(?:^|\n)\s*-{4,}\s*\n|\n(?:\s*\n){5,}', text
        )
        recipes = []
        for block in recipe_blocks:
            if not block.strip():
                continue
            with tempfile.NamedTemporaryFile(
                mode='w', suffix='.txt', encoding='utf-8', delete=False
            ) as f:
                f.write(block.strip())
                tmp_path = f.name
            try:
                buf2 = io.StringIO()
                with redirect_stdout(buf2):
                    recipe_raw = scraper._parse_local_file(tmp_path)
                if recipe_raw:
                    buf3 = io.StringIO()
                    with redirect_stdout(buf3):
                        txt = scraper.convert_to_txt_format(recipe_raw)
                    buf4 = io.StringIO()
                    with redirect_stdout(buf4):
                        parsed = parse_scraped_file(txt)
                    if parsed:
                        recipes.extend(parsed)
            finally:
                os.unlink(tmp_path)
        return recipes
    except Exception as e:
        return [{"error": str(e)}]


# ──────────────────────────────────────────────────────────────
# Ingredient line normalizer (Romanian → structured)
# ──────────────────────────────────────────────────────────────

# Maps Romanian unit words to standard abbreviations
_RO_UNITS = [
    # longer patterns first to avoid partial matches
    (r'\blingurițe?\b',        'tsp'),
    (r'\blingurite?\b',        'tsp'),
    (r'\blinguri\b',           'tbsp'),
    (r'\blingura\b',           'tbsp'),
    (r'\bcanã\b|\bcana\b|\bcani\b|\bcăni\b|\bceașcă\b|\bceașca\b|\bcești\b', 'cup'),
    (r'\bbucăți\b|\bbucati\b|\bbucată\b|\bbucata\b', 'buc'),
    (r'\bfire?\b',             'fire'),
    (r'\bgrame?\b',            'g'),
    (r'\bkilograme?\b',        'kg'),
    (r'\bmililitri?\b',        'ml'),
    (r'\blitri?\b',            'l'),
]

# "X de <unit>" or "X <unit>." patterns — Romanian genitive construction
_DE_UNIT_RE = re.compile(
    r'^([\d¼½¾][\d\s./,¼½¾-]*?)\s+(?:de\s+)?(grame?|g|kilograme?|kg|mililitri?|ml\.?|litri?|l|linguri?ță?|linguri|lingurița|lingurite|lingura|tbsp|tsp|cup|cupe?|cana|cani|căni|ceașcă|buc\.?|bucăți|fire?)\s+(?:de\s+)?(.+)$',
    re.IGNORECASE | re.UNICODE,
)

_ABBR_MAP = {
    'grame': 'g', 'gram': 'g',
    'kilograme': 'kg', 'kilogram': 'kg',
    'mililitri': 'ml', 'mililitru': 'ml', 'ml.': 'ml',
    'litri': 'l', 'litru': 'l',
    'linguriță': 'tsp', 'lingurița': 'tsp', 'lingurițe': 'tsp', 'lingurite': 'tsp',
    'linguri': 'tbsp', 'lingura': 'tbsp',
    'cup': 'cup', 'cupe': 'cup', 'cana': 'cup', 'cani': 'cup', 'căni': 'cup', 'ceașcă': 'cup',
    'buc': 'buc', 'buc.': 'buc', 'bucată': 'buc', 'bucati': 'buc', 'bucăți': 'buc',
    'fire': 'fire', 'fir': 'fire',
}


def _normalize_ingredient_line(line: str) -> str:
    """
    Normalize a single Romanian ingredient line to 'qty unit name' format.
    Examples:
      '400 de grame de fasole boabe'  → '400 g fasole boabe'
      '3 linguri de tarhon verde'     → '3 tbsp tarhon verde'
      'telina cat 1 ou mic'           → unchanged (no recognizable qty pattern)
      '2-3 foi de dafin'              → unchanged (already fine)
    """
    line = line.strip()
    if not line:
        return line

    m = _DE_UNIT_RE.match(line)
    if m:
        qty_raw = m.group(1).strip()
        unit_raw = m.group(2).strip().lower().rstrip('.')
        name = m.group(3).strip()
        unit = _ABBR_MAP.get(unit_raw, unit_raw)
        return f'{qty_raw} {unit} {name}'

    return line


def normalize_text(text: str) -> str:
    """
    Walk through the recipe text and normalize ingredient lines.
    - If the text has === / # structure, only lines inside '# Group' sections are touched.
    - If the text has no structure (plain ingredient list), all lines are normalized.
    Metadata lines, section headers (##), and step lines are always left intact.
    """
    lines = text.splitlines()
    has_structure = any(
        re.match(r'^===\s*.+\s*===$', l.strip()) or l.strip().startswith('# ')
        for l in lines
    )
    result = []
    in_ingredients = not has_structure  # unstructured text → always in ingredient mode

    for line in lines:
        stripped = line.strip()

        # === title === → reset
        if re.match(r'^===\s*.+\s*===$', stripped):
            in_ingredients = False
            result.append(line)
            continue

        # ## section header → instructions / obs → leave alone
        if stripped.startswith('## '):
            in_ingredients = False
            result.append(line)
            continue

        # # group → enter ingredient mode
        if stripped.startswith('# ') or stripped == '#':
            in_ingredients = True
            result.append(line)
            continue

        # Metadata lines (Key: value) → not ingredients
        if re.match(r'^[A-Za-z]+:\s', stripped):
            in_ingredients = False
            result.append(line)
            continue

        # Step lines (1. / 2.) → leave alone
        if re.match(r'^\d+[.)]\s+', stripped):
            result.append(line)
            continue

        if in_ingredients and stripped:
            result.append(_normalize_ingredient_line(stripped))
        else:
            result.append(line)

    return '\n'.join(result)


# ──────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Web Import Handler pentru recipe scraper")
    parser.add_argument(
        "--mode",
        choices=["parse-urls", "parse-text", "normalize-text"],
        required=True,
        help="parse-urls | parse-text | normalize-text"
    )
    args = parser.parse_args()

    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        json.dump({"error": f"JSON invalid la input: {e}"}, sys.stdout, ensure_ascii=False)
        sys.exit(1)

    if args.mode == "parse-urls":
        result = parse_urls(data.get("urls", []))
        json.dump(result, sys.stdout, ensure_ascii=False, indent=2)
    elif args.mode == "parse-text":
        result = parse_text(data.get("text", ""))
        json.dump(result, sys.stdout, ensure_ascii=False, indent=2)
    elif args.mode == "normalize-text":
        normalized = normalize_text(data.get("text", ""))
        json.dump({"text": normalized}, sys.stdout, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
