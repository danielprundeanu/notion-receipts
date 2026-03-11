"""
Exportă toate rețetele din Notion în format JSON pentru import în aplicația web.

Utilizare:
    cd /Users/danielprundeanu/Documents/GitHub/notion
    .venv/bin/python scripts/export_notion.py

Output: data/export.json
"""

import os
import json
import sys
import hashlib
import urllib.request
from datetime import datetime
from notion_client import Client
from dotenv import load_dotenv

script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(script_dir)

load_dotenv(os.path.join(project_root, 'notion.env'))

notion = Client(auth=os.getenv('NOTION_TOKEN'))
DB_GROCERIES = os.getenv('DB_GROCERIES_ID')
DB_INGREDIENTS = os.getenv('DB_INGREDIENTS_ID')
DB_RECEIPTS = os.getenv('DB_RECEIPTS_ID').rstrip('?')

IMAGES_DIR = os.path.join(project_root, 'webapp', 'public', 'images', 'recipes')
os.makedirs(IMAGES_DIR, exist_ok=True)


def download_image(url: str) -> str | None:
    """Download image from URL, save to public/images/recipes/, return public path."""
    try:
        # Use a stable filename based on URL hash so re-runs are idempotent
        ext = '.jpg'
        for candidate in ['.png', '.webp', '.jpeg', '.gif']:
            if candidate in url.lower():
                ext = candidate
                break
        filename = hashlib.md5(url.encode()).hexdigest() + ext
        dest = os.path.join(IMAGES_DIR, filename)
        if not os.path.exists(dest):
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=10) as resp:
                with open(dest, 'wb') as f:
                    f.write(resp.read())
        return f'/images/recipes/{filename}'
    except Exception as e:
        print(f'    ⚠ Image download failed: {e}')
        return None


def get_text(rich_text_array):
    if not rich_text_array:
        return ""
    return "".join(t.get('plain_text', '') for t in rich_text_array)


def query_all(database_id, filter_obj=None):
    results = []
    has_more = True
    start_cursor = None
    while has_more:
        kwargs = {'database_id': database_id}
        if start_cursor:
            kwargs['start_cursor'] = start_cursor
        if filter_obj:
            kwargs['filter'] = filter_obj
        response = notion.databases.query(**kwargs)
        results.extend(response['results'])
        has_more = response.get('has_more', False)
        start_cursor = response.get('next_cursor')
    return results


def get_page_blocks(page_id):
    results = []
    has_more = True
    start_cursor = None
    while has_more:
        kwargs = {'block_id': page_id}
        if start_cursor:
            kwargs['start_cursor'] = start_cursor
        response = notion.blocks.children.list(**kwargs)
        results.extend(response['results'])
        has_more = response.get('has_more', False)
        start_cursor = response.get('next_cursor')
    return results


def parse_instructions(blocks):
    instructions = []
    step = 0
    for block in blocks:
        btype = block.get('type', '')

        if btype in ('heading_1', 'heading_2', 'heading_3'):
            text = get_text(block.get(btype, {}).get('rich_text', []))
            if text:
                instructions.append({'step': 0, 'text': text, 'isSection': True})

        elif btype == 'numbered_list_item':
            text = get_text(block.get('numbered_list_item', {}).get('rich_text', []))
            if text:
                step += 1
                instructions.append({'step': step, 'text': text, 'isSection': False})

        elif btype == 'bulleted_list_item':
            text = get_text(block.get('bulleted_list_item', {}).get('rich_text', []))
            if text:
                step += 1
                instructions.append({'step': step, 'text': text, 'isSection': False})

        elif btype == 'paragraph':
            text = get_text(block.get('paragraph', {}).get('rich_text', []))
            # Only include non-trivial paragraphs that look like steps
            if text and len(text.strip()) > 30:
                step += 1
                instructions.append({'step': step, 'text': text.strip(), 'isSection': False})

    return instructions


def export_grocery_items():
    print("📦 Exporting grocery items...")
    pages = query_all(DB_GROCERIES)
    items = {}
    for page in pages:
        props = page['properties']
        name_list = props.get('Name', {}).get('title', [])
        if not name_list:
            continue
        name = get_text(name_list)
        if not name:
            continue

        def get_select(prop_name):
            sel = props.get(prop_name, {}).get('select')
            return sel.get('name') if sel else None

        items[page['id']] = {
            'notionId': page['id'],
            'name': name,
            'category': get_select('Category'),
            'unit': get_select('Unity'),
            'unit2': get_select('2nd Unity'),
            'conversion': props.get('Conversion', {}).get('number'),
            'kcal': props.get('KCal / 100g', {}).get('number'),
            'carbs': props.get('Carbs / 100g', {}).get('number'),
            'fat': props.get('Fat / 100g', {}).get('number'),
            'protein': props.get('Protein / 100g', {}).get('number'),
        }

    print(f"  ✓ {len(items)} grocery items")
    return items


def export_ingredients_for_recipe(recipe_id, grocery_items):
    pages = query_all(DB_INGREDIENTS, filter_obj={
        'property': 'Receipt',
        'relation': {'contains': recipe_id}
    })

    ingredients = []
    for page in pages:
        props = page['properties']
        grocery_relations = props.get('Grocery - Item', {}).get('relation', [])
        grocery_item_id = grocery_relations[0]['id'] if grocery_relations else None
        grocery_item = grocery_items.get(grocery_item_id) if grocery_item_id else None

        sep = props.get('Receipt separator', {}).get('select')
        group_order = int(sep.get('name', '1')) if sep else 1

        ingredients.append({
            'notionId': page['id'],
            'quantity': props.get('Size / Unit', {}).get('number'),
            'quantity2': props.get('Size / 2nd Unit', {}).get('number'),
            'groupOrder': group_order,
            'notes': get_text(props.get('Obs', {}).get('rich_text', [])) or None,
            'groceryItemId': grocery_item_id,
            'groceryItem': grocery_item,
        })

    return ingredients


def export_recipes(grocery_items):
    print("🍳 Exporting recipes...")
    pages = query_all(DB_RECEIPTS)
    recipes = []
    total = len(pages)

    for i, page in enumerate(pages, 1):
        props = page['properties']
        name_list = props.get('Name', {}).get('title', [])
        if not name_list:
            continue
        name = get_text(name_list)
        if not name:
            continue

        print(f"  [{i}/{total}] {name}")

        categories = [opt['name'] for opt in props.get('Receipe Category', {}).get('multi_select', [])]

        # Cover image — download locally so URLs don't expire
        cover = page.get('cover')
        image_url = None
        if cover:
            raw_url = None
            if cover.get('type') == 'external':
                raw_url = cover.get('external', {}).get('url')
            elif cover.get('type') == 'file':
                raw_url = cover.get('file', {}).get('url')
            if raw_url:
                image_url = download_image(raw_url)

        recipe = {
            'notionId': page['id'],
            'name': name,
            'servings': props.get('Servings / Receipt', {}).get('number'),
            'time': props.get('Time / Min', {}).get('number'),
            'difficulty': props.get('Dificulty', {}).get('select', {}).get('name') if props.get('Dificulty', {}).get('select') else None,
            'category': ', '.join(categories) if categories else None,
            'favorite': props.get('Favourite', {}).get('checkbox', False),
            'link': props.get('link', {}).get('url'),
            'imageUrl': image_url,
        }

        try:
            blocks = get_page_blocks(page['id'])
            recipe['instructions'] = parse_instructions(blocks)
            # If no cover image, use first image block found in page content
            if not recipe['imageUrl']:
                for block in blocks:
                    if block.get('type') == 'image':
                        img = block.get('image', {})
                        raw_url = None
                        if img.get('type') == 'external':
                            raw_url = img.get('external', {}).get('url')
                        elif img.get('type') == 'file':
                            raw_url = img.get('file', {}).get('url')
                        if raw_url:
                            downloaded = download_image(raw_url)
                            if downloaded:
                                recipe['imageUrl'] = downloaded
                                print(f"    📷 Content image used as cover")
                                break
        except Exception as e:
            print(f"    ⚠ Instructions error: {e}")
            recipe['instructions'] = []

        try:
            recipe['ingredients'] = export_ingredients_for_recipe(page['id'], grocery_items)
        except Exception as e:
            print(f"    ⚠ Ingredients error: {e}")
            recipe['ingredients'] = []

        recipes.append(recipe)

    print(f"  ✓ {len(recipes)} recipes exported")
    return recipes


def main():
    output_path = os.path.join(project_root, 'data', 'export.json')
    print("🚀 Starting Notion export...\n")

    grocery_items = export_grocery_items()
    recipes = export_recipes(grocery_items)

    export_data = {
        'exportedAt': datetime.now().isoformat(),
        'groceryItems': list(grocery_items.values()),
        'recipes': recipes,
    }

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(export_data, f, indent=2, ensure_ascii=False)

    print(f"\n✅ Saved to: {output_path}")
    print(f"   {len(grocery_items)} grocery items, {len(recipes)} recipes")


if __name__ == '__main__':
    main()
