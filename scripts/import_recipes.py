#!/usr/bin/env python3
"""
import_recipes.py — Importă rețete din format scraped în SQLite.

Utilizare:
  python scripts/import_recipes.py
  python scripts/import_recipes.py --input data/local/scraped_local_recipes.txt
  python scripts/import_recipes.py --dry-run
  python scripts/import_recipes.py --force    # re-importă rețete existente

Pipeline:
  scrape_recipes.py  →  normalize_units.py  →  import_recipes.py
"""

import argparse
import json
import os
import re
import secrets
import shutil
import sqlite3
import string
from fractions import Fraction
from typing import Optional


# ──────────────────────────────────────────────────────────────
# ID generation (CUID-like, compatibil cu Prisma)
# ──────────────────────────────────────────────────────────────

def new_id() -> str:
    alphabet = string.ascii_lowercase + string.digits
    return "c" + "".join(secrets.choice(alphabet) for _ in range(24))


# ──────────────────────────────────────────────────────────────
# Parsare format scraped
# ──────────────────────────────────────────────────────────────

BRACKET_RE   = re.compile(r"^\[([^\]]+)\]\s*(.+)$")
OLD_GROUP_RE = re.compile(r"^\[(\d+)\]$")          # [1] [2] [3] — format vechi
META_RE      = re.compile(r"^(Servings|Time|Difficulty|Favorite|Link|Category|Slices|Image):\s*(.*)")
STEP_RE      = re.compile(r"^(\d+)\.\s+(.*)")


def _parse_bracket(bracket: str) -> tuple[str, Optional[str]]:
    bracket = bracket.strip()
    m = re.match(r"^([0-9./\s]+)\s+(.+)$", bracket)
    if m:
        return m.group(1).strip(), m.group(2).strip()
    return bracket, None


def _parse_qty(s: Optional[str]) -> Optional[float]:
    if not s:
        return None
    try:
        return float(Fraction(s.strip()))
    except Exception:
        return None


def parse_scraped_file(content: str) -> list[dict]:
    """
    Parsează fișier scraped și returnează lista de rețete.

    Formate suportate:
      [N]            — header de grup, format vechi (scrape înainte de fix)
      Group Name     — header de grup, format nou (text simplu)
      [qty unit] name — ingredient
    """
    recipes: list[dict] = []
    r: Optional[dict] = None
    state: Optional[str] = None  # 'meta' | 'desc' | 'ingr' | 'steps'

    group_name: Optional[str] = None
    group_order: int = 0
    pending_group: Optional[str] = None
    desc_lines: list[str] = []

    def flush_desc():
        nonlocal desc_lines
        if r is not None and desc_lines:
            r["description"] = " ".join(desc_lines)
        desc_lines.clear()

    for raw in content.splitlines():
        line = raw.strip()

        # ── Titlu rețetă ─────────────────────────────────────
        m = re.match(r"^===\s*(.+?)\s*===$", line)
        if m:
            if r:
                flush_desc()
                recipes.append(r)
            r = {
                "name": m.group(1).rstrip("."),
                "servings": None, "time": None, "difficulty": None,
                "category": None, "favorite": False, "link": None,
                "image": None, "description": None,
                "ingredients": [], "instructions": [],
            }
            state = "meta"
            group_name = None
            group_order = 0
            pending_group = None
            desc_lines.clear()
            continue

        if r is None or not line:
            continue

        # ── Metadata ─────────────────────────────────────────
        mm = META_RE.match(line)
        if mm and state in ("meta", "desc", None):
            key, val = mm.group(1), mm.group(2).strip()
            if key == "Servings":
                try: r["servings"] = int(val)
                except ValueError: pass
            elif key == "Time":
                try: r["time"] = int(val)
                except ValueError: pass
            elif key == "Difficulty":  r["difficulty"] = val
            elif key == "Favorite":    r["favorite"] = val.lower() == "yes"
            elif key == "Link":        r["link"] = val
            elif key == "Category":    r["category"] = val
            elif key == "Image":       r["image"] = val
            state = "meta"
            continue

        # ── Steps ────────────────────────────────────────────
        if line.startswith("Steps:"):
            flush_desc()
            state = "steps"
            continue

        if state == "steps":
            if line.startswith("## "):
                r["instructions"].append({"text": line[3:].strip(), "isSection": True})
            else:
                ms = STEP_RE.match(line)
                if ms:
                    r["instructions"].append({"text": ms.group(2).strip(), "isSection": False})
            continue

        # ── Ingredient lines ──────────────────────────────────
        if line.startswith("["):
            # Format vechi: [1] [2] — grup fără nume
            if OLD_GROUP_RE.match(line):
                flush_desc()
                if pending_group:
                    group_name = pending_group
                    group_order += 1
                    pending_group = None
                elif state == "ingr":
                    group_order += 1
                    group_name = None
                state = "ingr"
                continue

            # Ingredient: [qty unit] name
            mi = BRACKET_RE.match(line)
            if mi:
                flush_desc()
                bracket, rest = mi.group(1), mi.group(2).strip()

                # Aplică pending_group dacă există
                if pending_group is not None:
                    group_name = pending_group
                    group_order += 1
                    pending_group = None

                state = "ingr"

                qty_str, unit_str = _parse_bracket(bracket)
                name = rest.split(",")[0].strip()
                name = re.sub(r"\s*\(.*?\)", "", name).strip()
                name = re.sub(r"\s+(?:OR|or)\s+.*$", "", name).strip()

                r["ingredients"].append({
                    "name":       name.lower(),
                    "qty":        _parse_qty(qty_str),
                    "unit":       unit_str,
                    "groupName":  group_name,
                    "groupOrder": group_order,
                })
            continue

        # ── Text simplu ───────────────────────────────────────
        if state == "ingr":
            # Plain text după ingrediente = header de grup nou
            pending_group = line
        else:
            desc_lines.append(line)
            pending_group = line  # dacă urmează imediat ingrediente, devine grup
            state = "desc"

    if r:
        flush_desc()
        recipes.append(r)

    return recipes


# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────

def load_choices(path: str) -> dict:
    if not os.path.isfile(path):
        return {}
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_grocery_items(db_path: str) -> dict[str, dict]:
    if not os.path.isfile(db_path):
        return {}
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute('SELECT id, name FROM "GroceryItem"')
    rows = cur.fetchall()
    conn.close()
    return {name.lower().strip(): {"id": id_, "name": name} for id_, name in rows}


def existing_recipe_names(db_path: str) -> set[str]:
    if not os.path.isfile(db_path):
        return set()
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute('SELECT name FROM "Recipe"')
    names = {row[0].lower().strip() for row in cur.fetchall()}
    conn.close()
    return names


# ──────────────────────────────────────────────────────────────
# Gestionare imagini
# ──────────────────────────────────────────────────────────────

IMAGES_DIR = "webapp/public/images/recipes"


def resolve_image(image_path: Optional[str]) -> Optional[str]:
    """
    Copiază imaginea în webapp/public/images/recipes/ dacă nu e deja acolo.
    Returnează URL-ul relativ (/images/recipes/filename.ext) sau None.
    """
    if not image_path or not os.path.isfile(image_path):
        return None

    os.makedirs(IMAGES_DIR, exist_ok=True)
    filename = os.path.basename(image_path)
    dest = os.path.join(IMAGES_DIR, filename)

    if not os.path.isfile(dest):
        shutil.copy2(image_path, dest)

    return f"/images/recipes/{filename}"


# ──────────────────────────────────────────────────────────────
# Aplicare unit choices
# ──────────────────────────────────────────────────────────────

def apply_choice(name: str, qty: Optional[float], unit: Optional[str],
                 choices: dict) -> tuple[Optional[float], Optional[str]]:
    key = f"{name}|{unit or ''}"
    choice = choices.get(key)
    if not choice or not isinstance(choice, dict):
        return qty, unit

    action = choice.get("action", "use_unit")

    if action in ("skip", "new"):
        return qty, unit

    if action == "set_unit2":
        # Unitatea din rețetă e deja unit2 acceptat
        return qty, choice.get("unit", unit)

    if action == "use_unit":
        new_unit = choice.get("unit", unit)
        rate = choice.get("rate")
        if rate and qty is not None:
            qty = round(qty * rate, 4)
        return qty, new_unit

    return qty, unit


# ──────────────────────────────────────────────────────────────
# Insert în DB
# ──────────────────────────────────────────────────────────────

def insert_recipe(conn: sqlite3.Connection, recipe: dict, grocery_items: dict,
                  choices: dict, verbose: bool) -> dict:
    recipe_id = new_id()
    unmapped = 0

    image_url = resolve_image(recipe.get("image"))

    conn.execute(
        """
        INSERT INTO "Recipe"
          (id, name, servings, time, difficulty, category, favorite, link,
           "imageUrl", notes, "createdAt", "updatedAt")
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        """,
        (
            recipe_id,
            recipe["name"],
            recipe.get("servings"),
            recipe.get("time"),
            recipe.get("difficulty"),
            recipe.get("category"),
            1 if recipe.get("favorite") else 0,
            recipe.get("link"),
            image_url,
            recipe.get("description"),
        ),
    )

    for order, ingr in enumerate(recipe["ingredients"]):
        name = ingr["name"]
        # Ingredient fără unitate → piece implicit
        raw_unit = ingr["unit"] if ingr["unit"] is not None else "piece"
        qty, unit = apply_choice(name, ingr["qty"], raw_unit, choices)

        grocery = grocery_items.get(name)
        grocery_id = grocery["id"] if grocery else None
        if not grocery_id:
            unmapped += 1
            if verbose:
                print(f"      ⚠  nemapat: '{name}'")

        conn.execute(
            """
            INSERT INTO "Ingredient"
              (id, "recipeId", "groceryItemId", "groupName", "groupOrder",
               quantity, unit, "order")
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                new_id(), recipe_id, grocery_id,
                ingr.get("groupName"), ingr.get("groupOrder", 0),
                qty, unit, order,
            ),
        )

    step_num = 1
    for instr in recipe["instructions"]:
        is_section = instr["isSection"]
        conn.execute(
            """
            INSERT INTO "Instruction"
              (id, "recipeId", step, text, "isSection")
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                new_id(), recipe_id,
                0 if is_section else step_num,
                instr["text"],
                1 if is_section else 0,
            ),
        )
        if not is_section:
            step_num += 1

    return {"ingr_total": len(recipe["ingredients"]), "ingr_unmapped": unmapped,
            "has_image": bool(image_url)}


# ──────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Importă rețete scraped în SQLite")
    parser.add_argument("--input",   "-i", default="data/local/scraped_local_recipes.txt",
                        help="Fișier scraped")
    parser.add_argument("--choices", "-c", default="data/local/unit_choices.json",
                        help="unit_choices.json generat de normalize_units.py")
    parser.add_argument("--db",      "-d", default="webapp/dev.db")
    parser.add_argument("--dry-run", action="store_true",
                        help="Simulează fără a scrie în DB")
    parser.add_argument("--force",   action="store_true",
                        help="Re-importă rețetele deja existente")
    parser.add_argument("--verbose", "-v", action="store_true",
                        help="Afișează ingredientele nemapate la GroceryItem")
    args = parser.parse_args()

    print(f"\n{'═'*62}")
    print(f"  import_recipes.py")
    print(f"{'═'*62}")
    print(f"  Input   : {args.input}")
    print(f"  Choices : {args.choices}")
    print(f"  DB      : {args.db}")
    if args.dry_run:
        print(f"  Mode    : DRY RUN")
    print()

    if not os.path.isfile(args.input):
        print(f"  ✗ '{args.input}' nu există.")
        return

    with open(args.input, encoding="utf-8") as f:
        content = f.read()

    choices       = load_choices(args.choices)
    grocery_items = load_grocery_items(args.db)
    existing      = set() if args.force else existing_recipe_names(args.db)
    recipes       = parse_scraped_file(content)

    print(f"  {len(recipes)} rețete parsate")
    print(f"  {len(grocery_items)} ingrediente în DB")
    print(f"  {len(choices)} unit choices")
    print(f"  {len(existing)} rețete deja în DB\n")

    imported = skipped = errors = 0
    total_ingr = total_unmapped = 0

    conn = None if args.dry_run else sqlite3.connect(args.db)

    try:
        for recipe in recipes:
            name = recipe["name"]

            if name.lower().strip() in existing:
                print(f"  ↷  {name}")
                skipped += 1
                continue

            if args.dry_run:
                unmapped = sum(1 for i in recipe["ingredients"]
                               if not grocery_items.get(i["name"]))
                flag = f"  ({unmapped} nemapate)" if unmapped else ""
                img_path = recipe.get("image")
                img_flag = f"  🖼  {os.path.basename(img_path)}" if img_path and os.path.isfile(img_path) else ""
                print(f"  [DRY] {name}  "
                      f"[{len(recipe['ingredients'])} ingr, "
                      f"{len(recipe['instructions'])} pași]{flag}{img_flag}")
                imported += 1
                total_ingr     += len(recipe["ingredients"])
                total_unmapped += unmapped
                continue

            try:
                stats = insert_recipe(conn, recipe, grocery_items, choices, args.verbose)
                total_ingr     += stats["ingr_total"]
                total_unmapped += stats["ingr_unmapped"]
                flag = f"  ({stats['ingr_unmapped']} nemapate)" if stats["ingr_unmapped"] else ""
                img_flag = "  🖼" if stats.get("has_image") else ""
                print(f"  ✓  {name}  "
                      f"[{stats['ingr_total']} ingr, "
                      f"{len(recipe['instructions'])} pași]{flag}{img_flag}")
                imported += 1
            except Exception as e:
                print(f"  ✗  {name}: {e}")
                errors += 1

        if conn:
            conn.commit()

    finally:
        if conn:
            conn.close()

    print(f"\n{'═'*62}")
    print(f"  SUMAR")
    print(f"{'═'*62}")
    print(f"  Importate       : {imported}")
    print(f"  Sărite          : {skipped}")
    print(f"  Erori           : {errors}")
    print(f"  Total ingr.     : {total_ingr}")
    print(f"  Ingr. nemapate  : {total_unmapped}")
    if total_unmapped:
        print(f"\n  → Rulează normalize_units.py pentru a rezolva ingredientele nemapate,")
        print(f"    apoi re-importă cu --force.")
    print()


if __name__ == "__main__":
    main()
