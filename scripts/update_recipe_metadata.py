"""
Script pentru actualizarea link-urilor și imaginilor în rețetele existente din Notion
"""
import os
import re
from notion_client import Client
from dotenv import load_dotenv
from typing import Dict, List

# Încarcă variabilele de mediu
load_dotenv('notion.env')

notion = Client(auth=os.getenv('NOTION_TOKEN'))
DB_RECEIPTS = os.getenv('DB_RECEIPTS_ID').rstrip('?')


def parse_recipe_file(filepath: str) -> List[Dict]:
    """Parsează fișierul text și extrage rețetele cu link și imagine"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Împarte în rețete separate (după ===)
    recipe_blocks = re.split(r'\n(?====)', content.strip())
    recipes = []
    
    for block in recipe_blocks:
        if not block.strip():
            continue
        
        lines = [l.strip() for l in block.split('\n') if l.strip()]
        
        recipe = {
            'name': None,
            'link': None,
            'image_url': None
        }
        
        for line in lines:
            if line.startswith('===') and line.endswith('==='):
                recipe['name'] = line.strip('= ').strip()
            elif line.startswith('Link:'):
                recipe['link'] = line.split(':', 1)[1].strip()
            elif line.startswith('Image:'):
                recipe['image_url'] = line.split(':', 1)[1].strip()
        
        if recipe['name']:
            recipes.append(recipe)
    
    return recipes


def find_recipe_by_name(name: str) -> str:
    """Caută o rețetă după nume și returnează ID-ul"""
    try:
        response = notion.databases.query(
            database_id=DB_RECEIPTS,
            filter={
                "property": "Name",
                "title": {
                    "equals": name
                }
            }
        )
        
        if response.get('results'):
            return response['results'][0]['id']
        return None
        
    except Exception as e:
        print(f"  ⚠ Eroare la căutarea rețetei: {e}")
        return None


def update_recipe_metadata(recipe_id: str, recipe_data: Dict) -> bool:
    """Actualizează link-ul și imaginile pentru o rețetă"""
    try:
        updates = {}
        
        # Actualizează proprietățile
        if recipe_data.get('link'):
            updates['properties'] = {
                'link': {'url': recipe_data['link']}
            }
        
        # Actualizează cover și icon dacă există imagine
        image_url = recipe_data.get('image_url')
        if image_url and not (image_url.startswith('img/') or '/img/' in image_url):
            updates['cover'] = {
                "type": "external",
                "external": {
                    "url": image_url
                }
            }
            updates['icon'] = {
                "type": "external",
                "external": {
                    "url": image_url
                }
            }
        
        if updates:
            notion.pages.update(page_id=recipe_id, **updates)
            return True
        
        return False
        
    except Exception as e:
        print(f"  ⚠ Eroare la actualizare: {e}")
        return False


def main():
    import sys
    
    if len(sys.argv) < 2:
        print("Utilizare: python update_recipe_metadata.py <fisier_retete.txt>")
        print("\nExemplu:")
        print("  python update_recipe_metadata.py data/scraped_recipes.txt")
        sys.exit(1)
    
    filepath = sys.argv[1]
    
    if not os.path.exists(filepath):
        print(f"Eroare: Fișierul '{filepath}' nu există!")
        sys.exit(1)
    
    print(f"\n{'='*60}")
    print(f"Actualizare metadata rețete din: {filepath}")
    print(f"{'='*60}\n")
    
    # Parsează fișierul
    recipes = parse_recipe_file(filepath)
    print(f"Găsite {len(recipes)} rețete în fișier.\n")
    
    updated_count = 0
    not_found_count = 0
    skipped_count = 0
    
    # Actualizează fiecare rețetă
    for recipe in recipes:
        print(f"Procesez: {recipe['name']}")
        
        # Verifică dacă are link sau imagine
        if not recipe.get('link') and not recipe.get('image_url'):
            print(f"  ⊘ Niciun link sau imagine de actualizat")
            skipped_count += 1
            continue
        
        # Caută rețeta în Notion
        recipe_id = find_recipe_by_name(recipe['name'])
        
        if not recipe_id:
            print(f"  ✗ Rețeta nu există în Notion")
            not_found_count += 1
            continue
        
        # Actualizează metadata
        success = update_recipe_metadata(recipe_id, recipe)
        
        if success:
            parts = []
            if recipe.get('link'):
                parts.append("link")
            if recipe.get('image_url') and not (recipe['image_url'].startswith('img/') or '/img/' in recipe['image_url']):
                parts.append("cover & icon")
            print(f"  ✓ Actualizat: {', '.join(parts)}")
            updated_count += 1
        else:
            print(f"  ⊘ Nicio actualizare necesară")
            skipped_count += 1
        
        print()
    
    print(f"{'='*60}")
    print(f"✓ Finalizat!")
    print(f"  - Actualizate: {updated_count}")
    print(f"  - Nu există în Notion: {not_found_count}")
    print(f"  - Sărite (fără date): {skipped_count}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
