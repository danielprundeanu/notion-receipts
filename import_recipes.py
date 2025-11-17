"""
Script pentru importul rețetelor în Notion din fișiere text
"""
import os
import re
from notion_client import Client
from dotenv import load_dotenv
from typing import Dict, List, Tuple, Optional

# Încarcă variabilele de mediu
load_dotenv('notion.env')

notion = Client(auth=os.getenv('NOTION_TOKEN'))
DB_GROCERIES = os.getenv('DB_GROCERIES_ID')
DB_INGREDIENTS = os.getenv('DB_INGREDIENTS_ID')
DB_RECEIPTS = os.getenv('DB_RECEIPTS_ID').rstrip('?')
TEMPLATE_RECIPE_ID = os.getenv('TEMPLATE_RECIPE_ID')


class RecipeImporter:
    # Valori permise pentru câmpuri
    VALID_DIFFICULTIES = ['Easy', 'Moderate']
    VALID_CATEGORIES = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Smoothie', 
                        'Smoothie Bowl', 'Soup', 'High Protein', 'Receipt', 'Extra']
    
    def __init__(self):
        self.grocery_cache = {}  # Cache pentru grocery items deja găsite
        self.unit_warnings = []  # Warnings pentru unități necunoscute
        
    def parse_recipe_file(self, filepath: str) -> List[Dict]:
        """Parsează fișierul text și extrage rețetele"""
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Împarte în rețete separate (după ===)
        recipe_blocks = re.split(r'\n(?====)', content.strip())
        recipes = []
        
        for block in recipe_blocks:
            if not block.strip():
                continue
            recipe = self._parse_recipe_block(block)
            if recipe:
                recipes.append(recipe)
        
        return recipes
    
    def _parse_recipe_block(self, block: str) -> Optional[Dict]:
        """Parsează un bloc de rețetă"""
        lines = [l.strip() for l in block.split('\n') if l.strip()]
        
        if not lines:
            return None
        
        # Prima linie trebuie să fie titlul (între ===)
        title_match = re.match(r'===\s*(.+?)\s*===', lines[0])
        if not title_match:
            return None
        
        recipe = {
            'name': title_match.group(1),
            'servings': None,
            'time': None,
            'difficulty': None,
            'category': None,
            'favorite': False,
            'ingredient_groups': []
        }
        
        current_group = None
        i = 1
        
        while i < len(lines):
            line = lines[i]
            
            # Metadata rețetă
            if line.startswith('Servings:'):
                recipe['servings'] = int(re.search(r'\d+', line).group())
            elif line.startswith('Time:'):
                recipe['time'] = int(re.search(r'\d+', line).group())
            elif line.startswith('Difficulty:'):
                recipe['difficulty'] = line.split(':', 1)[1].strip()
            elif line.startswith('Category:'):
                recipe['category'] = line.split(':', 1)[1].strip()
            elif line.startswith('Favorite:'):
                val = line.split(':', 1)[1].strip().lower()
                recipe['favorite'] = val in ['yes', 'da', 'true', '1']
            
            # Grup nou de ingrediente
            elif line.startswith('[') and line.endswith(']'):
                group_name = line[1:-1].strip()
                current_group = {
                    'name': group_name,
                    'ingredients': []
                }
                recipe['ingredient_groups'].append(current_group)
            
            # Ingredient
            elif current_group is not None and line:
                ingredient = self._parse_ingredient(line)
                if ingredient:
                    current_group['ingredients'].append(ingredient)
            
            i += 1
        
        return recipe
    
    def _parse_ingredient(self, line: str) -> Optional[Dict]:
        """
        Parsează o linie de ingredient.
        Formate acceptate:
        - 500g Faina
        - 2 buc Oua
        - 1 lingura Zahar
        - Sare (fără cantitate)
        - 500g Faina (Faina alba)  # cu grocery item specific în paranteze
        """
        # Pattern pentru ingredient cu cantitate și unitate
        pattern = r'^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?\s+(.+?)(?:\s*\((.+?)\))?$'
        match = re.match(pattern, line)
        
        if match:
            quantity = float(match.group(1))
            unit = match.group(2) or ''
            name = match.group(3).strip()
            grocery_item = match.group(4).strip() if match.group(4) else name
            
            return {
                'quantity': quantity,
                'unit': unit,
                'name': name,
                'grocery_item': grocery_item
            }
        
        # Ingredient fără cantitate (doar nume)
        pattern_no_qty = r'^([^(]+?)(?:\s*\((.+?)\))?$'
        match = re.match(pattern_no_qty, line)
        
        if match:
            name = match.group(1).strip()
            grocery_item = match.group(2).strip() if match.group(2) else name
            
            return {
                'quantity': None,
                'unit': '',
                'name': name,
                'grocery_item': grocery_item
            }
        
        return None
    
    def find_or_create_grocery_item(self, name: str) -> str:
        """Caută sau creează un grocery item și returnează ID-ul"""
        # Verifică în cache
        if name in self.grocery_cache:
            return self.grocery_cache[name]
        
        try:
            # Caută în baza de date
            response = notion.databases.query(
                **{
                    "database_id": DB_GROCERIES,
                    "filter": {
                        "property": "Name",
                        "title": {
                            "equals": name
                        }
                    }
                }
            )
            
            if response.get('results'):
                page_id = response['results'][0]['id']
                self.grocery_cache[name] = page_id
                print(f"  ✓ Găsit grocery item existent: {name}")
                return page_id
            
            # Nu există, creează unul nou
            new_page = notion.pages.create(
                parent={"database_id": DB_GROCERIES},
                properties={
                    "Name": {
                        "title": [{"text": {"content": name}}]
                    }
                }
            )
            
            page_id = new_page['id']
            self.grocery_cache[name] = page_id
            print(f"  + Creat grocery item nou: {name}")
            return page_id
            
        except Exception as e:
            print(f"  ⚠ Eroare la găsirea/crearea grocery item '{name}': {e}")
            return None
    
    def get_grocery_item_units(self, page_id: str) -> Tuple[str, str]:
        """Obține unitățile de măsură pentru un grocery item"""
        try:
            page = notion.pages.retrieve(page_id=page_id)
            props = page.get('properties', {})
            
            unity = props.get('unity', {})
            unity_val = ''
            if unity.get('type') == 'rich_text' and unity.get('rich_text'):
                unity_val = unity['rich_text'][0]['plain_text']
            
            second_unity = props.get('2nd unity', {})
            second_unity_val = ''
            if second_unity.get('type') == 'rich_text' and second_unity.get('rich_text'):
                second_unity_val = second_unity['rich_text'][0]['plain_text']
            
            return unity_val, second_unity_val
            
        except Exception as e:
            print(f"  ⚠ Eroare la obținerea unităților: {e}")
            return '', ''
    
    def validate_unit(self, ingredient: Dict, grocery_item_id: str, grocery_name: str) -> bool:
        """Validează dacă unitatea folosită este compatibilă cu grocery item-ul"""
        if not ingredient['unit'] or not grocery_item_id:
            return True
        
        unity, second_unity = self.get_grocery_item_units(grocery_item_id)
        
        # Normalizare unități
        unit_normalized = ingredient['unit'].lower().strip()
        unity_normalized = unity.lower().strip() if unity else ''
        second_unity_normalized = second_unity.lower().strip() if second_unity else ''
        
        # Verifică dacă unitatea se potrivește
        if unit_normalized == unity_normalized or unit_normalized == second_unity_normalized:
            return True
        
        # Dacă grocery item-ul nu are unități setate, acceptă orice
        if not unity_normalized and not second_unity_normalized:
            print(f"    ℹ Grocery item '{grocery_name}' nu are unități definite - se acceptă '{ingredient['unit']}'")
            return True
        
        # Unitatea nu se potrivește - OPREȘTE EXECUȚIA
        print(f"\n{'='*60}")
        print(f"❌ EROARE: Unitate de măsură incompatibilă!")
        print(f"{'='*60}")
        print(f"\nIngredient: {ingredient['name']}")
        print(f"Unitate folosită: '{ingredient['unit']}'")
        print(f"Grocery item: '{grocery_name}'")
        print(f"  - Unitate principală: '{unity if unity else '(nedefinită)'}'")
        print(f"  - Unitate secundară: '{second_unity if second_unity else '(nedefinită)'}'")
        print(f"\n{'─'*60}")
        print("SOLUȚII:")
        print(f"{'─'*60}")
        print(f"\n1. CONVERSIA în fișierul de rețete:")
        if unity:
            print(f"   - Convertește cantitatea în '{unity}' în fișierul text")
        if second_unity:
            print(f"   - SAU convertește cantitatea în '{second_unity}' în fișierul text")
        print(f"\n2. ACTUALIZARE Grocery Item în Notion:")
        print(f"   - Deschide '{grocery_name}' în Grocery List 2.0")
        print(f"   - Setează 'unity' sau '2nd unity' la '{ingredient['unit']}'")
        if unity and second_unity:
            print(f"   - Actualizează 'conversion' dacă adaugi o nouă unitate")
        print(f"\n{'='*60}\n")
        
        raise ValueError(f"Unitate incompatibilă: '{ingredient['unit']}' pentru '{grocery_name}'")

    
    def create_recipe(self, recipe_data: Dict) -> Optional[str]:
        """Creează rețeta în baza Receipts 2.0"""
        try:
            properties = {
                "Name": {
                    "title": [{"text": {"content": recipe_data['name']}}]
                }
            }
            
            # Adaugă proprietăți opționale
            if recipe_data.get('servings'):
                properties["Servings / Receipt"] = {"number": recipe_data['servings']}
            
            if recipe_data.get('time'):
                properties["Time / Min"] = {"number": recipe_data['time']}
            
            # Validează și adaugă Difficulty
            if recipe_data.get('difficulty'):
                difficulty = recipe_data['difficulty']
                if difficulty not in self.VALID_DIFFICULTIES:
                    print(f"  ⚠ Atenție: Difficulty '{difficulty}' nu este în lista validă.")
                    print(f"     Valori permise: {', '.join(self.VALID_DIFFICULTIES)}")
                    print(f"     Se va încerca crearea oricum...")
                properties["Dificulty"] = {"select": {"name": difficulty}}
            
            # Validează și adaugă Category (multi_select)
            if recipe_data.get('category'):
                category = recipe_data['category']
                if category not in self.VALID_CATEGORIES:
                    print(f"  ⚠ Atenție: Category '{category}' nu este în lista validă.")
                    print(f"     Valori permise: {', '.join(self.VALID_CATEGORIES)}")
                    print(f"     Se va încerca crearea oricum...")
                properties["Receipe Category"] = {
                    "multi_select": [{"name": category}]
                }
            
            # Favorite nu există în baza de date - comentat
            # if recipe_data.get('favorite') is not None:
            #     properties["Favorite"] = {"checkbox": recipe_data['favorite']}
            
            # Creează pagina fără template (template-ul va fi aplicat la final)
            new_page = notion.pages.create(
                parent={"database_id": DB_RECEIPTS},
                properties=properties
            )
            
            print(f"\n✓ Rețeta '{recipe_data['name']}' a fost creată cu succes!")
            return new_page['id']
            
        except Exception as e:
            print(f"\n✗ Eroare la crearea rețetei '{recipe_data['name']}': {e}")
            return None
    
    def apply_template_to_recipe(self, recipe_id: str, recipe_name: str):
        """Aplică template-ul la o rețetă după ce a fost creată complet"""
        if not TEMPLATE_RECIPE_ID:
            return
        
        try:
            # Citește conținutul template-ului
            template_blocks = notion.blocks.children.list(block_id=TEMPLATE_RECIPE_ID)
            
            # Copiază conținutul template-ului în pagina rețetei
            blocks_copied = 0
            if template_blocks.get('results'):
                for block in template_blocks['results']:
                    block_copy = self._prepare_block_for_copy(block)
                    if block_copy:
                        try:
                            notion.blocks.children.append(
                                block_id=recipe_id,
                                children=[block_copy]
                            )
                            blocks_copied += 1
                        except Exception as e:
                            # Ignoră blocurile care nu pot fi copiate
                            print(f"  ⚠ Nu s-a putut copia blocul de tip '{block.get('type')}': {str(e)[:100]}")
                            continue
            
            if blocks_copied > 0:
                print(f"\n✓ Template aplicat la rețeta '{recipe_name}' ({blocks_copied} blocuri copiate)!")
            else:
                print(f"\n⚠ Nu s-au copiat blocuri din template la '{recipe_name}'")
            
        except Exception as e:
            print(f"\n⚠ Eroare la aplicarea template-ului pentru '{recipe_name}': {e}")
    
    def _prepare_block_for_copy(self, block: Dict) -> Optional[Dict]:
        """Pregătește un bloc pentru copiere eliminând metadata"""
        block_type = block.get('type')
        if not block_type:
            return None
        
        # Tipuri de blocuri suportate pentru copiere
        # child_database nu poate fi copiat prin API, trebuie creat manual în Notion
        supported_types = [
            'paragraph', 'heading_1', 'heading_2', 'heading_3',
            'bulleted_list_item', 'numbered_list_item', 'to_do',
            'toggle', 'quote', 'callout', 'divider'
        ]
        
        if block_type not in supported_types:
            return None
        
        # Creează o copie curată a blocului
        block_content = block.get(block_type, {})
        
        # Pentru divider, nu trebuie conținut
        if block_type == 'divider':
            return {
                "type": "divider",
                "divider": {}
            }
        
        # Pentru alte tipuri, curăță rich_text
        clean_block = {
            "type": block_type,
            block_type: {}
        }
        
        # Copiază rich_text dacă există
        if 'rich_text' in block_content:
            clean_rich_text = []
            for text_obj in block_content['rich_text']:
                clean_text = {
                    "type": text_obj.get('type', 'text'),
                    "text": {
                        "content": text_obj.get('text', {}).get('content', ''),
                    }
                }
                # Adaugă annotations dacă există
                if 'annotations' in text_obj:
                    clean_text['annotations'] = text_obj['annotations']
                
                clean_rich_text.append(clean_text)
            
            clean_block[block_type]['rich_text'] = clean_rich_text
        
        # Pentru to_do, adaugă checked
        if block_type == 'to_do' and 'checked' in block_content:
            clean_block[block_type]['checked'] = block_content['checked']
        
        # Pentru callout, adaugă icon și color
        if block_type == 'callout':
            if 'icon' in block_content:
                clean_block[block_type]['icon'] = block_content['icon']
            if 'color' in block_content:
                clean_block[block_type]['color'] = block_content['color']
        
        return clean_block
    
    def create_ingredients(self, recipe_id: str, recipe_data: Dict):
        """Creează ingredientele pentru o rețetă"""
        separator_counter = 1
        
        for group in recipe_data['ingredient_groups']:
            print(f"\n  Grup: [{group['name']}]")
            
            for ingredient in group['ingredients']:
                # Găsește/creează grocery item
                grocery_id = self.find_or_create_grocery_item(ingredient['grocery_item'])
                
                if not grocery_id:
                    continue
                
                # Validează unitatea
                self.validate_unit(ingredient, grocery_id, ingredient['grocery_item'])
                
                # Creează ingredientul
                try:
                    properties = {
                        "Ingredient": {
                            "title": [{"text": {"content": ingredient['name']}}]
                        },
                        "Grocery - Item": {
                            "relation": [{"id": grocery_id}]
                        },
                        "Receipt": {
                            "relation": [{"id": recipe_id}]
                        },
                        "Receipt separator": {
                            "select": {"name": str(separator_counter)}
                        }
                    }
                    
                    # Adaugă cantitatea dacă există
                    if ingredient['quantity'] is not None:
                        properties["Size / Unit"] = {"number": ingredient['quantity']}
                    
                    notion.pages.create(
                        parent={"database_id": DB_INGREDIENTS},
                        properties=properties
                    )
                    
                    qty_str = f"{ingredient['quantity']}{ingredient['unit']}" if ingredient['quantity'] else ""
                    print(f"    ✓ {qty_str} {ingredient['name']}")
                    
                except Exception as e:
                    print(f"    ✗ Eroare la crearea ingredientului '{ingredient['name']}': {e}")
            
            separator_counter += 1
    
    def import_recipes(self, filepath: str):
        """Importă toate rețetele dintr-un fișier"""
        print(f"\n{'='*60}")
        print(f"Import rețete din: {filepath}")
        print(f"{'='*60}\n")
        
        # Parsează fișierul
        recipes = self.parse_recipe_file(filepath)
        print(f"Găsite {len(recipes)} rețete în fișier.\n")
        
        # Importă fiecare rețetă
        for recipe in recipes:
            print(f"\n{'─'*60}")
            print(f"Procesez: {recipe['name']}")
            print(f"{'─'*60}")
            
            try:
                # Creează rețeta
                recipe_id = self.create_recipe(recipe)
                
                if recipe_id:
                    # Creează ingredientele
                    self.create_ingredients(recipe_id, recipe)
                    
                    # Aplică template-ul la final
                    self.apply_template_to_recipe(recipe_id, recipe['name'])
                    
            except ValueError as e:
                # Eroare de validare unitate - oprește importul
                print(f"\n❌ Import oprit din cauza erorii de validare.")
                print(f"Corectează problema și rulează din nou scriptul.\n")
                return
            except Exception as e:
                print(f"\n✗ Eroare neașteptată: {e}")
                print(f"Import oprit.\n")
                return
        
        print(f"\n\n{'='*60}")
        print("✓ Import finalizat cu succes!")
        print(f"{'='*60}\n")


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Utilizare: python import_recipes.py <fisier_retete.txt>")
        print("\nExemplu: python import_recipes.py recipe_example.txt")
        sys.exit(1)
    
    filepath = sys.argv[1]
    
    if not os.path.exists(filepath):
        print(f"Eroare: Fișierul '{filepath}' nu există!")
        sys.exit(1)
    
    importer = RecipeImporter()
    importer.import_recipes(filepath)
