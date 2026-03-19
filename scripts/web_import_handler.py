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
from contextlib import redirect_stdout, redirect_stderr

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
    Folosește RecipeScraper → convert_to_txt_format → parse_scraped_file
    pentru a reutiliza toată logica existentă.
    """
    buf = io.StringIO()
    with redirect_stdout(buf), redirect_stderr(buf):
        from scrape_recipes import RecipeScraper
        from import_recipes import parse_scraped_file

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

            # Convertim la format txt, apoi parsăm structurat
            buf2 = io.StringIO()
            with redirect_stdout(buf2):
                txt = scraper.convert_to_txt_format(recipe_raw)

            parsed_list = parse_scraped_file(txt)
            if not parsed_list:
                results.append({"error": f"Nu s-a putut parsa rețeta de la {url}", "url": url})
                continue

            recipe = parsed_list[0]

            # Adăugăm image_url din rețeta raw dacă nu a fost captat
            if not recipe.get("image") and recipe_raw.get("image_url"):
                recipe["image"] = recipe_raw["image_url"]

            results.append(recipe)

        except Exception as e:
            results.append({"error": str(e), "url": url})

    return results


# ──────────────────────────────────────────────────────────────
# Parsare text manual
# ──────────────────────────────────────────────────────────────

def parse_text(text: str) -> list:
    """
    Parsează text în format manual/scraped și returnează lista de rețete.
    Acceptă atât formatul scraped (=== Title ===, [qty unit] ingredient)
    cât și formatul raw (# Ingredients, # Steps).

    Format supported:
    === Nume Reteta ===
    Servings: 4
    Time: 30
    Difficulty: Easy
    Category: Dinner

    Grup Ingrediente
    [500 g] faina
    [2 cup] lapte

    Steps:
    1. Pas unu
    2. Pas doi
    """
    if not text.strip():
        return []

    buf = io.StringIO()
    with redirect_stdout(buf), redirect_stderr(buf):
        from import_recipes import parse_scraped_file
        from scrape_recipes import RecipeScraper, scrape_recipes_from_file

    # Dacă textul conține format scraped (=== ... ===), parsăm direct
    if "===" in text:
        try:
            return parse_scraped_file(text)
        except Exception as e:
            return [{"error": str(e)}]

    # Dacă e format raw (# Sections), folosim scraper-ul în modul local
    # Scriem temporar într-un fișier și procesăm
    import tempfile
    try:
        scraper = RecipeScraper()
        buf2 = io.StringIO()
        with redirect_stdout(buf2):
            # Împărțim în blocuri de rețete (separator: 4+ liniuțe sau 3+ linii goale)
            import re
            recipe_blocks = re.split(
                r'(?:^|\n)\s*-{4,}\s*\n|\n\s*={3,}\s*\n|\n(?:\s*\n){5,}',
                text
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
                buf3 = io.StringIO()
                with redirect_stdout(buf3):
                    recipe_raw = scraper._parse_local_file(tmp_path)

                if recipe_raw:
                    buf4 = io.StringIO()
                    with redirect_stdout(buf4):
                        txt = scraper.convert_to_txt_format(recipe_raw)
                    parsed = parse_scraped_file(txt)
                    if parsed:
                        recipes.extend(parsed)
            finally:
                os.unlink(tmp_path)

        return recipes

    except Exception as e:
        return [{"error": str(e)}]


# ──────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Web Import Handler pentru recipe scraper")
    parser.add_argument(
        "--mode",
        choices=["parse-urls", "parse-text"],
        required=True,
        help="parse-urls: scrape URL-uri web | parse-text: parsează text manual"
    )
    args = parser.parse_args()

    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        json.dump({"error": f"JSON invalid la input: {e}"}, sys.stdout, ensure_ascii=False)
        sys.exit(1)

    if args.mode == "parse-urls":
        result = parse_urls(data.get("urls", []))
    elif args.mode == "parse-text":
        result = parse_text(data.get("text", ""))
    else:
        result = []

    json.dump(result, sys.stdout, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
