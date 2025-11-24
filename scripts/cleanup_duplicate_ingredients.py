"""
Script pentru ștergerea ingredientelor duplicate din rețetele Notion.

Utilizare:
    python scripts/cleanup_duplicate_ingredients.py -urls    # Pentru data/urls/scraped_recipe_urls.txt
    python scripts/cleanup_duplicate_ingredients.py -local   # Pentru data/local/scraped_local_recipes.txt

Scriptul:
1. Citește rețetele din fișierul specificat
2. Pentru fiecare rețetă, găsește pagina în Notion
3. Identifică ingredientele duplicate (același grocery_id + nume)
4. Păstrează doar prima apariție, șterge duplicatele
"""

import os
import re
import sys
from notion_client import Client
from dotenv import load_dotenv
from typing import Dict, List, Set
from collections import defaultdict

# Încarcă variabilele de mediu
load_dotenv('notion.env')

notion = Client(auth=os.getenv('NOTION_TOKEN'))
DB_RECEIPTS = os.getenv('DB_RECEIPTS_ID').rstrip('?')
DB_INGREDIENTS = os.getenv('DB_INGREDIENTS_ID')


class IngredientCleaner:
    def __init__(self):
        self.recipes_cache = {}  # Cache pentru rețetele din Notion
        self.cleaned_count = 0
        self.skipped_count = 0
        self.total_duplicates_removed = 0
        
    def _load_receipts_database(self):
        """Încarcă toate rețetele din baza de date Receipts 2.0"""
        print("\n📚 Încarc rețetele din Notion...")
        
        try:
            has_more = True
            start_cursor = None
            
            while has_more:
                if start_cursor:
                    response = notion.databases.query(
                        database_id=DB_RECEIPTS,
                        start_cursor=start_cursor
                    )
                else:
                    response = notion.databases.query(database_id=DB_RECEIPTS)
                
                for page in response['results']:
                    title_prop = page['properties'].get('Name', {})
                    if title_prop.get('title'):
                        title = title_prop['title'][0]['plain_text']
                        self.recipes_cache[title.lower()] = page['id']
                
                has_more = response.get('has_more', False)
                start_cursor = response.get('next_cursor')
            
            print(f"  ✓ Încărcate {len(self.recipes_cache)} rețete")
            
        except Exception as e:
            print(f"  ✗ Eroare la încărcarea rețetelor: {e}")
            sys.exit(1)
    
    def _find_recipe_page(self, recipe_name: str) -> str:
        """Găsește pagina Notion pentru o rețetă după titlu"""
        recipe_key = recipe_name.lower()
        return self.recipes_cache.get(recipe_key)
    
    def _parse_scraped_file(self, filepath: str) -> List[str]:
        """Parsează fișierul scraped și extrage numele rețetelor"""
        print(f"\n📖 Procesez fișier: {filepath}")
        
        if not os.path.exists(filepath):
            print(f"  ✗ Fișierul nu există: {filepath}")
            sys.exit(1)
        
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Împarte în rețete
        recipes_raw = re.split(r'\n=== (.+?) ===\n', content)
        
        # Extrage doar numele rețetelor (indexurile impare)
        recipe_names = []
        for i in range(1, len(recipes_raw), 2):
            recipe_names.append(recipes_raw[i].strip())
        
        print(f"  ✓ Găsite {len(recipe_names)} rețete")
        return recipe_names
    
    def _get_recipe_ingredients(self, recipe_id: str) -> List[Dict]:
        """Obține toate ingredientele pentru o rețetă cu detalii complete"""
        try:
            response = notion.databases.query(
                database_id=DB_INGREDIENTS,
                filter={
                    "property": "Receipt",
                    "relation": {
                        "contains": recipe_id
                    }
                }
            )
            
            ingredients = []
            for result in response.get('results', []):
                props = result['properties']
                
                # Extrage numele ingredientului
                name = ''
                if 'Ingredient' in props and props['Ingredient']['title']:
                    title_items = props['Ingredient']['title']
                    if title_items and len(title_items) > 0:
                        name = title_items[0].get('plain_text', '')
                
                # Extrage Grocery Item ID
                grocery_id = None
                if 'Grocery - Item' in props and props['Grocery - Item']['relation']:
                    grocery_id = props['Grocery - Item']['relation'][0]['id']
                
                # Extrage separator pentru a păstra ordinea
                separator = ''
                if 'Receipt separator' in props and props['Receipt separator']['select']:
                    separator = props['Receipt separator']['select']['name']
                
                ingredients.append({
                    'id': result['id'],
                    'name': name,
                    'grocery_id': grocery_id,
                    'separator': separator
                })
            
            return ingredients
            
        except Exception as e:
            print(f"  ⚠ Eroare la obținerea ingredientelor: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    def _find_and_remove_duplicates(self, recipe_id: str, recipe_name: str) -> int:
        """Identifică și șterge ingredientele duplicate pentru o rețetă"""
        # Obține toate ingredientele
        ingredients = self._get_recipe_ingredients(recipe_id)
        
        if not ingredients:
            return 0
        
        # Grupează ingredientele după (grocery_id, name) pentru a identifica duplicatele
        seen = {}  # key: (grocery_id, name) -> prima apariție (ingredient dict)
        duplicates = []  # Lista cu ID-urile de șters
        
        # Sortează după separator pentru a păstra ordinea corectă
        ingredients.sort(key=lambda x: int(x['separator']) if x['separator'].isdigit() else 999)
        
        for ingredient in ingredients:
            key = (ingredient['grocery_id'], ingredient['name'])
            
            if key in seen:
                # E duplicat - marchează pentru ștergere
                duplicates.append({
                    'id': ingredient['id'],
                    'name': ingredient['name']
                })
            else:
                # Prima apariție - păstrează
                seen[key] = ingredient
        
        # Șterge duplicatele
        for dup in duplicates:
            try:
                notion.pages.update(
                    page_id=dup['id'],
                    archived=True
                )
                print(f"    - Șters duplicat: {dup['name']}")
            except Exception as e:
                print(f"    ⚠ Eroare la ștergerea '{dup['name']}': {e}")
        
        return len(duplicates)
    
    def cleanup_recipes(self, filepath: str):
        """Procesează toate rețetele și șterge duplicatele"""
        print("\n" + "="*60)
        print("🧹 Curățare ingrediente duplicate")
        print("="*60)
        
        # Încarcă rețetele din Notion
        self._load_receipts_database()
        
        # Parsează fișierul cu rețete
        recipe_names = self._parse_scraped_file(filepath)
        
        if not recipe_names:
            print("\n⚠ Nu s-au găsit rețete în fișier")
            return
        
        print(f"\n📝 Procesez {len(recipe_names)} rețete...\n")
        
        # Procesează fiecare rețetă
        for recipe_name in recipe_names:
            print(f"🍳 {recipe_name}")
            
            # Găsește pagina în Notion
            recipe_id = self._find_recipe_page(recipe_name)
            
            if not recipe_id:
                print(f"  ✗ Nu s-a găsit în Notion - skip")
                self.skipped_count += 1
                continue
            
            # Caută și șterge duplicatele
            duplicates_removed = self._find_and_remove_duplicates(recipe_id, recipe_name)
            
            if duplicates_removed > 0:
                print(f"  ✓ Curățat: {duplicates_removed} duplicate șterse")
                self.cleaned_count += 1
                self.total_duplicates_removed += duplicates_removed
            else:
                print(f"  = Fără duplicate")
                self.skipped_count += 1
        
        # Sumar final
        print("\n" + "="*60)
        print("📊 SUMAR")
        print("="*60)
        print(f"✓ Rețete curățate: {self.cleaned_count}")
        print(f"= Rețete fără duplicate: {self.skipped_count}")
        print(f"🗑️  Total duplicate șterse: {self.total_duplicates_removed}")
        print()


def main():
    # Verifică argumentele
    if len(sys.argv) < 2 or sys.argv[1] not in ['-urls', '-local']:
        print("Utilizare:")
        print("  python scripts/cleanup_duplicate_ingredients.py -urls    # Curăță rețete din data/urls/scraped_recipe_urls.txt")
        print("  python scripts/cleanup_duplicate_ingredients.py -local   # Curăță rețete din data/local/scraped_local_recipes.txt")
        sys.exit(1)
    
    # Determină fișierul
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    
    if sys.argv[1] == '-urls':
        filepath = os.path.join(project_root, 'data', 'urls', 'scraped_recipe_urls.txt')
        mode_name = 'URL-uri web'
    else:  # -local
        filepath = os.path.join(project_root, 'data', 'local', 'scraped_local_recipes.txt')
        mode_name = 'Rețete locale'
    
    print(f"\n🔧 Modul: {mode_name}")
    
    # Creează și rulează cleaner-ul
    cleaner = IngredientCleaner()
    cleaner.cleanup_recipes(filepath)


if __name__ == '__main__':
    main()
