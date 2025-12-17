"""
Script pentru importul rețetelor în Notion din fișiere text
"""
import os
import re
import json
from notion_client import Client
from dotenv import load_dotenv
from typing import Dict, List, Tuple, Optional
from nutrition_api import NutritionAPI

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
    
    # Dicționar de conversii între unități
    UNIT_CONVERSIONS = {
        # Volume - conversii la ml
        'cup': ('ml', 240),
        'cups': ('ml', 240),
        'tsp': ('ml', 5),
        'teaspoon': ('ml', 5),
        'teaspoons': ('ml', 5),
        'tbsp': ('ml', 15),
        'tablespoon': ('ml', 15),
        'tablespoons': ('ml', 15),
        'fl oz': ('ml', 30),
        'fluid ounce': ('ml', 30),
        'fluid ounces': ('ml', 30),
        'pint': ('cup', 2),  # 1 pint = 2 cups
        'pints': ('cup', 2),
        'quart': ('ml', 946),
        'quarts': ('ml', 946),
        'gallon': ('ml', 3785),
        'gallons': ('ml', 3785),
        'liter': ('ml', 1000),
        'liters': ('ml', 1000),
        'l': ('ml', 1000),
        
        # Weight - conversii la g
        'oz': ('g', 28.35),
        'ounce': ('g', 28.35),
        'ounces': ('g', 28.35),
        'lb': ('g', 453.6),
        'lbs': ('g', 453.6),
        'pound': ('g', 453.6),
        'pounds': ('g', 453.6),
        'kg': ('g', 1000),
        'kilogram': ('g', 1000),
        'kilograms': ('g', 1000),
    }
    
    # Mapări de sinonime pentru unități (folosim termenii englezi ca chei principale)
    UNIT_SYNONYMS = {
        'ml': ['ml', 'milliliter', 'milliliters', 'mL'],
        'l': ['l', 'L', 'liter', 'liters', 'litre', 'litres'],
        'g': ['g', 'gram', 'grams', 'gm'],
        'kg': ['kg', 'kilogram', 'kilograms'],
        'piece': ['buc', 'piece', 'pieces', 'pc', 'pcs', 'bucată', 'bucăți'],
        'tbsp': ['lingura', 'lingură', 'linguri', 'tbsp', 'tablespoon', 'tablespoons'],
        'tsp': ['lingurita', 'lingurită', 'lingurite', 'linguriță', 'tsp', 'teaspoon', 'teaspoons'],
    }
    
    # Opțiuni disponibile în Notion pentru Unity și Category (din database schema)
    AVAILABLE_UNITS = ['piece', 'tsp', 'tbsp', 'g', 'slice', 'handful', 'pinch', 'ml', 'scoop', 'bottle', 'cup', 'pint']
    AVAILABLE_2ND_UNITS = ['cup', 'piece', 'tbsp', 'tsp']
    AVAILABLE_CATEGORIES = [
        '🍎 Fruits', '🥕 Veg & Legumes', '🌾 Grains', '🫙 Pantry', 
        '🥩 Meat & Alt', '🥛 Dairy', '🥫 Canned', '🫕 Sauces & Condiments',
        '🥜 Nuts & Seeds', '🧂Fresh Herbs & Spices', '🌵 Dried Herbs & Spices',
        '🥑 Healthy Fats', '🍸 Drinks', '🥘 Homemade Receipts', 'Other', '🧴 Supplies'
    ]
    
    def __init__(self):
        self.grocery_cache = {}  # Cache pentru grocery items deja găsite
        self.unit_warnings = []  # Warnings pentru unități necunoscute
        self.mappings = self._load_mappings()
        self.new_mappings = {}  # Mapări noi învățate în această sesiune
        self.nutrition_api = NutritionAPI()  # API pentru informații nutriționale
    
    def _load_mappings(self) -> Dict:
        """Încarcă mapările din fișierul JSON"""
        script_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(script_dir)
        mappings_file = os.path.join(project_root, 'data', 'ingredient_mappings.json')
        if os.path.exists(mappings_file):
            try:
                with open(mappings_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                print(f"⚠ Eroare la încărcarea mapărilor: {e}")
                return {"grocery_mappings": {}, "unit_conversions": {}, "auto_create": {"enabled": False}}
        return {"grocery_mappings": {}, "unit_conversions": {}, "auto_create": {"enabled": False}}
    
    def _save_mappings(self):
        """Salvează mapările actualizate în fișier"""
        if not self.new_mappings:
            return
        
        # Actualizează mapările cu cele noi
        self.mappings['grocery_mappings'].update(self.new_mappings)
        
        try:
            script_dir = os.path.dirname(os.path.abspath(__file__))
            project_root = os.path.dirname(script_dir)
            mappings_file = os.path.join(project_root, 'data', 'ingredient_mappings.json')
            with open(mappings_file, 'w', encoding='utf-8') as f:
                json.dump(self.mappings, f, indent=2, ensure_ascii=False)
            print(f"  💾 {len(self.new_mappings)} mapări salvate")
            # Resetează mapările noi pentru următoarea rețetă
            self.new_mappings.clear()
        except Exception as e:
            print(f"  ⚠ Eroare la salvarea mapărilor: {e}")
        
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
            'link': None,
            'slices': None,  # Slice / Receipe
            'image_url': None,
            'ingredient_groups': [],
            'instructions': []
        }
        
        current_group = None
        in_method_section = False
        i = 1
        
        while i < len(lines):
            line = lines[i]
            
            # Verifică dacă am intrat în secțiunea Steps
            if line.startswith('Steps:') or line.startswith('Method:'):
                in_method_section = True
                i += 1
                continue
            
            # Dacă suntem în Steps, parsează instrucțiunile
            if in_method_section:
                # Verifică dacă e un header de secțiune (text fără numerotare, nu vid)
                # Trebuie să fie: nu începe cu număr, are lungime rezonabilă (3-50 char), nu conține junk
                stripped = line.strip()
                
                # Lista de cuvinte junk care indică text extras din meniuri/navigație
                junk_words = [
                    'subscribe', 'save recipe', 'about', 'contact', 'privacy', 'http', 'www.',
                    'all rights', 'copyright', 'follow', 'facebook', 'instagram', 'pinterest',
                    'twitter', 'latest', 'recipes', 'search', 'menu', 'home', 'blog', 'index',
                    'salads', 'pasta', 'chicken', 'seafood', 'main course', 'dessert',
                    'breakfast', 'lunch', 'dinner', 'snack', 'appetizer'
                ]
                
                is_junk = any(junk in stripped.lower() for junk in junk_words)
                is_potential_header = (
                    stripped 
                    and not re.match(r'^\d+\.', line)
                    and 3 <= len(stripped) <= 50
                    and not is_junk
                )
                
                if is_potential_header:
                    # E un header de secțiune - marchează-l cu prefix special
                    recipe['instructions'].append(f"__SECTION_HEADER__{stripped}")
                # Parsează liniile numerotate: "1. text", "2. text", etc.
                elif re.match(r'^\d+\.\s*(.+)$', line):
                    match = re.match(r'^\d+\.\s*(.+)$', line)
                    recipe['instructions'].append(match.group(1))
                i += 1
                continue
            
            # Metadata rețetă
            if line.startswith('Servings:'):
                match = re.search(r'\d+', line)
                if match:
                    recipe['servings'] = int(match.group())
            elif line.startswith('Time:'):
                match = re.search(r'\d+', line)
                if match:
                    recipe['time'] = int(match.group())
            elif line.startswith('Difficulty:'):
                recipe['difficulty'] = line.split(':', 1)[1].strip()
            elif line.startswith('Category:'):
                recipe['category'] = line.split(':', 1)[1].strip()
            elif line.startswith('Favorite:'):
                val = line.split(':', 1)[1].strip().lower()
                recipe['favorite'] = val in ['yes', 'da', 'true', '1']
            elif line.startswith('Slices:'):
                match = re.search(r'\d+', line)
                if match:
                    recipe['slices'] = int(match.group())
            elif line.startswith('Link:'):
                recipe['link'] = line.split(':', 1)[1].strip()
            elif line.startswith('Image:'):
                recipe['image_url'] = line.split(':', 1)[1].strip()
            
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
                # Ignoră comentariile (linii care încep cu #)
                if line.startswith('#'):
                    i += 1
                    continue
                ingredient = self._parse_ingredient(line)
                if ingredient:
                    current_group['ingredients'].append(ingredient)
            
            i += 1
        
        return recipe
    
    def _normalize_unit(self, unit: str) -> str:
        """
        Normalizează unitățile de măsură la forma standard
        Exemple: cups -> cup, teaspoons -> tsp, tablespoons -> tbsp
        """
        unit_lower = unit.lower()
        
        # Mapare unități plurale -> singular
        unit_mappings = {
            'cups': 'cup',
            'teaspoons': 'tsp',
            'tablespoons': 'tbsp',
            'tsps': 'tsp',
            'tbsps': 'tbsp',
            'ounces': 'oz',
            'pounds': 'lb',
            'pints': 'pint',
            'handfuls': 'handful',
            'grams': 'g',
            'kilograms': 'kg',
            'milliliters': 'ml',
            'liters': 'l',
            'cloves': 'clove',
            'pieces': 'piece',
        }
        
        return unit_mappings.get(unit_lower, unit)
    
    def _parse_ingredient(self, line: str) -> Optional[Dict]:
        """
        Parsează o linie de ingredient.
        Formate acceptate:
        - [500 g] Faina
        - [2] Oua
        - [1 tbsp] Zahar
        - 500g Faina (format vechi)
        - Sare (fără cantitate)
        - [500 g] Faina (Faina alba)  # cu grocery item specific în paranteze
        - [0.5] large tomatoes, finely chopped  # cu adjective și observații
        """
        # Lista de adjective comune pentru ingrediente (fără culori - ele fac parte din nume)
        # Exemplu: "black beans", "red onion", "green chilli" - culorile rămân în nume
        adjectives = r'\b(large|small|medium|fresh|dried|chopped|diced|sliced|minced|grated|peeled|crushed|whole|canned|frozen|ripe|unripe|raw|cooked)\b'
        
        # Pattern pentru formatul nou cu [] - [cantitate unitate] nume
        # Exemplu: "[0.5 g] large tomatoes" sau "[2] eggs"
        pattern_brackets = r'^\[(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?\]\s+(.+?)(?:\s*\((.+?)\))?$'
        match = re.match(pattern_brackets, line)
        
        if match:
            quantity = float(match.group(1))
            unit = match.group(2) or ''
            # Normalizează unitățile (cups -> cup, teaspoons -> tsp, etc.)
            if unit:
                unit = self._normalize_unit(unit)
            else:
                # Dacă nu există unitate, tratează ca piece
                unit = 'piece'
            rest = match.group(3).strip()
            text_in_parentheses = match.group(4).strip() if match.group(4) else None
            
            # Textul din paranteze este ÎNTOTDEAUNA observație, nu grocery item
            observations = text_in_parentheses if text_in_parentheses else ''
            
            # Separă observațiile (după virgulă)
            observations_from_comma = ''
            name = rest
            if ',' in rest:
                parts = rest.split(',', 1)
                name = parts[0].strip()
                observations_from_comma = parts[1].strip()
            
            # Combină observațiile (paranteze + virgulă)
            if observations and observations_from_comma:
                observations = f"{observations_from_comma}, {observations}"
            elif observations_from_comma:
                observations = observations_from_comma
            
            # Procesare simplă - ingredientele vin deja procesate de la scraping
            # Singularizează și capitalizează numele
            name = self._singularize(name)
            name = name.capitalize()
            
            # Grocery item este întotdeauna numele curățat (nu mai folosim paranteze pentru grocery_item)
            grocery_item = name
            
            return {
                'quantity': quantity,
                'unit': unit,
                'name': name,
                'grocery_item': grocery_item,
                'observations': observations
            }
        
        # Pattern pentru formatul vechi (fără brackets) - pentru compatibilitate
        # Exemplu: "0.5 large tomatoes, finely chopped" sau "500g beef mince"
        pattern = r'^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?\s+(.+?)(?:\s*\((.+?)\))?$'
        match = re.match(pattern, line)
        
        if match:
            quantity = float(match.group(1))
            potential_unit = match.group(2) or ''
            rest = match.group(3).strip()
            text_in_parentheses = match.group(4).strip() if match.group(4) else None
            
            # Textul din paranteze este ÎNTOTDEAUNA observație, nu grocery item
            observations_from_parentheses = text_in_parentheses if text_in_parentheses else ''
            
            # Validează dacă unitatea este o unitate de măsură reală
            # Lista de unități cunoscute (extinsă)
            known_units = ['g', 'kg', 'mg', 'ml', 'l', 'cup', 'cups', 'tsp', 'teaspoon', 'teaspoons',
                          'tbsp', 'tablespoon', 'tablespoons', 'oz', 'ounce', 'ounces', 'lb', 'lbs',
                          'pound', 'pounds', 'piece', 'pieces', 'slice', 'slices', 'handful', 'pinch',
                          'pint', 'pints', 'scoop']
            
            # Containere care NU sunt unități de măsură - fac parte din numele ingredientului
            # Exemplu: "1 tin of beans" -> quantity=1, unit='', name='tin of beans'
            container_words = ['bottle', 'can', 'tin', 'jar', 'pack', 'packet', 'bag', 'bunch',
                              'head', 'sprig', 'stalk', 'clove', 'stick']
            
            # Verifică dacă este o unitate validă (case insensitive)
            unit = ''
            if potential_unit and potential_unit.lower() in known_units:
                unit = self._normalize_unit(potential_unit)
            elif potential_unit and potential_unit.lower() in container_words:
                # Este un container - include-l în nume, nu ca unitate
                rest = f"{potential_unit} {rest}"
            else:
                # Nu e nici unitate, nici container - consideră-l parte din nume
                if potential_unit:
                    rest = f"{potential_unit} {rest}"
            
            # Dacă nu există unitate, tratează ca piece
            if not unit:
                unit = 'piece'
            
            # Separă observațiile (după virgulă)
            observations_from_comma = ''
            name = rest
            if ',' in rest:
                parts = rest.split(',', 1)
                name = parts[0].strip()
                observations_from_comma = parts[1].strip()
            
            # Combină observațiile (paranteze + virgulă)
            observations = ''
            if observations_from_parentheses and observations_from_comma:
                observations = f"{observations_from_comma}, {observations_from_parentheses}"
            elif observations_from_parentheses:
                observations = observations_from_parentheses
            elif observations_from_comma:
                observations = observations_from_comma
            
            # Procesare simplă - ingredientele vin deja procesate de la scraping
            name = self._singularize(name)
            name = name.capitalize()
            
            # Grocery item este întotdeauna numele curățat
            grocery_item = name
            
            return {
                'quantity': quantity,
                'unit': unit,
                'name': name,
                'grocery_item': grocery_item,
                'observations': observations
            }
        
        # Ingredient fără cantitate (doar nume)
        pattern_no_qty = r'^([^(]+?)(?:\s*\((.+?)\))?$'
        match = re.match(pattern_no_qty, line)
        
        if match:
            rest = match.group(1).strip()
            text_in_parentheses = match.group(2).strip() if match.group(2) else None
            
            # Textul din paranteze este ÎNTOTDEAUNA observație
            observations_from_parentheses = text_in_parentheses if text_in_parentheses else ''
            
            # Separă observațiile (după virgulă)
            observations_from_comma = ''
            name = rest
            if ',' in rest:
                parts = rest.split(',', 1)
                name = parts[0].strip()
                observations_from_comma = parts[1].strip()
            
            # Combină observațiile
            observations = ''
            if observations_from_parentheses and observations_from_comma:
                observations = f"{observations_from_comma}, {observations_from_parentheses}"
            elif observations_from_parentheses:
                observations = observations_from_parentheses
            elif observations_from_comma:
                observations = observations_from_comma
            
            # Procesare simplă - ingredientele vin deja procesate de la scraping
            name = self._singularize(name)
            name = name.capitalize()
            
            # Grocery item este întotdeauna numele curățat
            grocery_item = name
            
            return {
                'quantity': None,
                'unit': '',
                'name': name,
                'grocery_item': grocery_item,
                'observations': observations
            }
        
        return None
    
    def _singularize(self, word: str) -> str:
        """Singularizează un cuvânt (tomatoes -> tomato, onions -> onion)"""
        word = word.strip().lower()
        
        # Cazuri speciale
        special_cases = {
            'potatoes': 'potato',
            'tomatoes': 'tomato',
            'onions': 'onion',
            'carrots': 'carrot',
            'mushrooms': 'mushroom',
            'cloves': 'clove',
            'limes': 'lime',
            'lemons': 'lemon',
            'beans': 'bean',
            'peas': 'pea',
            'chickpeas': 'chickpea',
        }
        
        if word in special_cases:
            return special_cases[word]
        
        # Regulă generală: dacă se termină în 's', îl elimină
        if word.endswith('s') and len(word) > 3:
            return word[:-1]
        
        return word
    
    def _configure_new_grocery_item(self, name: str) -> Optional[Dict]:
        """
        Configurare interactivă pentru un grocery item nou
        Returns: Dict cu properties pentru Notion sau None dacă se anulează
        """
        print(f"\n{'─'*60}")
        print(f"Configurare grocery item nou: {name}")
        print(f"{'─'*60}")
        
        # 1. Selectare Unity (obligatoriu)
        print(f"\n📏 Selectează Unity (unitate principală):")
        for idx, unit in enumerate(self.AVAILABLE_UNITS, 1):
            print(f"    {idx}. {unit}")
        
        unity = None
        while not unity:
            choice = input(f"\n  Selectează Unity (1-{len(self.AVAILABLE_UNITS)}): ").strip()
            try:
                choice = int(choice)
                if 1 <= choice <= len(self.AVAILABLE_UNITS):
                    unity = self.AVAILABLE_UNITS[choice - 1]
                    print(f"  ✓ Unity: {unity}")
                else:
                    print(f"  ⚠️ Opțiune invalidă")
            except ValueError:
                print(f"  ⚠️ Te rog introdu un număr")
        
        # 2. Selectare 2nd Unity (opțional)
        print(f"\n📏 Selectează 2nd Unity (unitate secundară - opțional):")
        for idx, unit in enumerate(self.AVAILABLE_2ND_UNITS, 1):
            print(f"    {idx}. {unit}")
        print(f"    0. Skip (fără 2nd Unity)")
        
        second_unity = None
        while True:
            choice = input(f"\n  Selectează 2nd Unity (0-{len(self.AVAILABLE_2ND_UNITS)}): ").strip()
            try:
                choice = int(choice)
                if choice == 0:
                    print(f"  ⊗ Fără 2nd Unity")
                    break
                elif 1 <= choice <= len(self.AVAILABLE_2ND_UNITS):
                    second_unity = self.AVAILABLE_2ND_UNITS[choice - 1]
                    print(f"  ✓ 2nd Unity: {second_unity}")
                    break
                else:
                    print(f"  ⚠️ Opțiune invalidă")
            except ValueError:
                print(f"  ⚠️ Te rog introdu un număr")
        
        # 3. Conversion (opțional - pentru 2nd Unity)
        conversion = None
        if second_unity:
            print(f"\n🔄 Conversion factor: câte {unity} sunt într-un {second_unity}?")
            print(f"   Exemplu: dacă 1 cup = 240ml, introduce 240")
            conv_input = input(f"   Conversion (sau ENTER pentru skip): ").strip()
            if conv_input:
                try:
                    conversion = float(conv_input)
                    print(f"  ✓ Conversion: 1 {second_unity} = {conversion} {unity}")
                except ValueError:
                    print(f"  ⚠️ Conversion invalid, skip")
        
        # 4. Selectare Category
        print(f"\n🏷️ Selectează Category:")
        for idx, cat in enumerate(self.AVAILABLE_CATEGORIES, 1):
            print(f"    {idx}. {cat}")
        
        category = None
        while not category:
            choice = input(f"\n  Selectează Category (1-{len(self.AVAILABLE_CATEGORIES)}): ").strip()
            try:
                choice = int(choice)
                if 1 <= choice <= len(self.AVAILABLE_CATEGORIES):
                    category = self.AVAILABLE_CATEGORIES[choice - 1]
                    print(f"  ✓ Category: {category}")
                else:
                    print(f"  ⚠️ Opțiune invalidă")
            except ValueError:
                print(f"  ⚠️ Te rog introdu un număr")
        
        # 5. Informații nutriționale (automat din API sau manual)
        print(f"\n🔍 Informații nutriționale (per 100g):")
        nutrients = self.nutrition_api.get_nutrition_interactive(name)
        
        if not nutrients:
            print(f"\n  💡 Poți introduce manual sau skip (valori vor fi 0)")
            manual = input(f"  Introduc manual? (y/n): ").strip().lower()
            
            if manual == 'y' or manual == 'yes':
                nutrients = {}
                try:
                    nutrients['kcal'] = float(input(f"    KCal / 100g: ").strip() or "0")
                    nutrients['carbs'] = float(input(f"    Carbs / 100g: ").strip() or "0")
                    nutrients['fat'] = float(input(f"    Fat / 100g: ").strip() or "0")
                    nutrients['protein'] = float(input(f"    Protein / 100g: ").strip() or "0")
                except ValueError:
                    print(f"  ⚠️ Valori invalide, folosesc 0")
                    nutrients = {'kcal': 0, 'carbs': 0, 'fat': 0, 'protein': 0}
            else:
                nutrients = {'kcal': 0, 'carbs': 0, 'fat': 0, 'protein': 0}
        
        # Construiește proprietățile pentru Notion
        properties = {
            "Name": {
                "title": [{"text": {"content": name}}]
            },
            "Unity": {
                "select": {"name": unity}
            },
            "Category": {
                "select": {"name": category}
            },
            "KCal / 100g": {
                "number": nutrients['kcal']
            },
            "Carbs / 100g": {
                "number": nutrients['carbs']
            },
            "Fat / 100g": {
                "number": nutrients['fat']
            },
            "Protein / 100g": {
                "number": nutrients['protein']
            }
        }
        
        # Adaugă 2nd Unity dacă există
        if second_unity:
            properties["2nd Unity"] = {
                "select": {"name": second_unity}
            }
        
        # Adaugă Conversion dacă există
        if conversion is not None:
            properties["Conversion"] = {
                "number": conversion
            }
        
        print(f"\n{'─'*60}")
        print(f"✓ Configurare completă pentru '{name}'")
        print(f"  Unity: {unity}" + (f" | 2nd Unity: {second_unity}" if second_unity else ""))
        if conversion:
            print(f"  Conversion: 1 {second_unity} = {conversion} {unity}")
        print(f"  Category: {category}")
        print(f"  Macros: {nutrients['kcal']} kcal | {nutrients['carbs']}g carbs | {nutrients['fat']}g fat | {nutrients['protein']}g protein")
        print(f"{'─'*60}\n")
        
        return properties
    
    def find_or_create_grocery_item(self, name: str, _visited: set = None) -> str:
        """Caută sau creează un grocery item și returnează ID-ul"""
        # Protecție împotriva recursiunii infinite
        if _visited is None:
            _visited = set()
        
        name_lower = name.lower()
        if name_lower in _visited:
            print(f"  ⚠ Ciclu de mapare detectat pentru '{name}', folosesc numele original")
            # Nu mai urmări maparea, caută direct
            _visited = set()  # Reset pentru căutare directă
        else:
            _visited.add(name_lower)
        
        # Verifică în cache
        if name in self.grocery_cache:
            return self.grocery_cache[name]
        
        # Verifică în mapări salvate (doar dacă nu e în ciclu)
        if len(_visited) == 1 and name_lower in self.mappings.get('grocery_mappings', {}):
            mapped_name = self.mappings['grocery_mappings'][name_lower]
            print(f"  📋 Folosesc mapare salvată: '{name}' → '{mapped_name}'")
            # Recursiv pentru a găsi mapped item
            return self.find_or_create_grocery_item(mapped_name, _visited)
        
        try:
            # Metoda 1: Caută exact
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
            
            # Metoda 2: Caută parțial (case-insensitive)
            response = notion.databases.query(
                **{
                    "database_id": DB_GROCERIES,
                    "filter": {
                        "property": "Name",
                        "title": {
                            "contains": name
                        }
                    }
                }
            )
            
            if response.get('results'):
                # Găsit posibile match-uri
                print(f"\n  Găsite {len(response['results'])} grocery items similare cu '{name}':")
                for idx, result in enumerate(response['results'][:5], 1):  # Max 5 rezultate
                    title_prop = result.get('properties', {}).get('Name', {})
                    if title_prop.get('title'):
                        item_name = title_prop['title'][0]['plain_text']
                        print(f"    {idx}. {item_name}")
                
                print(f"    0. Creează item nou: {name}")
                
                choice = input("\n  Selectează (0-{}): ".format(min(len(response['results']), 5)))
                
                try:
                    choice = int(choice)
                    if choice > 0 and choice <= len(response['results']):
                        # Folosește item-ul selectat
                        selected = response['results'][choice - 1]
                        page_id = selected['id']
                        selected_name = selected['properties']['Name']['title'][0]['plain_text']
                        self.grocery_cache[name] = page_id
                        
                        # Salvează maparea pentru viitor
                        self.new_mappings[name_lower] = selected_name
                        print(f"  ✓ Folosit grocery item existent: {selected_name}")
                        print(f"  💾 Mapare salvată: '{name}' → '{selected_name}'")
                        
                        return page_id
                    elif choice == 0:
                        # Continuă la creare
                        pass
                    else:
                        print(f"  ⚠ Opțiune invalidă, creez item nou")
                except ValueError:
                    print(f"  ⚠ Input invalid, creez item nou")
            
            # Nu există match sau utilizatorul a ales să creeze nou
            # Întreabă utilizatorul confirmarea
            print(f"\n  Grocery item '{name}' nu există în baza de date.")
            confirm = input(f"  Creez '{name}' în Grocery List? (y/n): ").strip().lower()
            
            if confirm != 'y' and confirm != 'yes':
                # Permite utilizatorului să specifice un nume diferit
                new_name = input(f"  Introdu numele corect sau ENTER pentru a sări: ").strip()
                if new_name:
                    # Salvează maparea pentru viitor
                    self.new_mappings[name_lower] = new_name
                    print(f"  💾 Mapare salvată: '{name}' → '{new_name}'")
                    # Recursiv - încearcă să găsești/creezi cu numele nou
                    return self.find_or_create_grocery_item(new_name, _visited)
                else:
                    print(f"  ⚠ Sărit grocery item pentru '{name}'")
                    return None
            
            # Configurează proprietățile pentru noul grocery item
            properties = self._configure_new_grocery_item(name)
            
            if not properties:
                print(f"  ⚠ Anulată crearea grocery item pentru '{name}'")
                return None
            
            # Creează item nou cu toate proprietățile
            new_page = notion.pages.create(
                parent={"database_id": DB_GROCERIES},
                properties=properties
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
            
            # Unity este de tip select, nu rich_text
            unity = props.get('Unity', {})
            unity_val = ''
            if unity.get('type') == 'select' and unity.get('select'):
                unity_val = unity['select']['name']
            
            # 2nd Unity este de tip select, nu rich_text
            second_unity = props.get('2nd Unity', {})
            second_unity_val = ''
            if second_unity.get('type') == 'select' and second_unity.get('select'):
                second_unity_val = second_unity['select']['name']
            
            return unity_val, second_unity_val
            
        except Exception as e:
            print(f"  ⚠ Eroare la obținerea unităților: {e}")
            return '', ''
    
    def _add_2nd_unity_to_grocery(self, grocery_item_id: str, unit: str, grocery_name: str) -> bool:
        """
        Adaugă 2nd Unity la un Grocery Item existent (fără Conversion)
        DEPRECATED: Folosește _add_2nd_unity_with_conversion în schimb
        """
        try:
            if unit not in self.AVAILABLE_2ND_UNITS:
                print(f"  ⚠ '{unit}' nu e în lista AVAILABLE_2ND_UNITS: {self.AVAILABLE_2ND_UNITS}")
                return False
            
            notion.pages.update(
                page_id=grocery_item_id,
                properties={
                    "2nd Unity": {
                        "select": {"name": unit}
                    }
                }
            )
            
            print(f"  ✓ Actualizat '{grocery_name}': 2nd Unity = '{unit}'")
            return True
            
        except Exception as e:
            print(f"  ✗ Eroare la actualizarea Grocery Item: {e}")
            return False
    
    def _select_2nd_unity_dialog(self, recipe_unit: str) -> Optional[str]:
        """
        Afișează dialog pentru selectarea 2nd Unity
        
        Args:
            recipe_unit: Unitatea din rețetă (pentru a o marca în listă)
        
        Returns:
            Unitatea selectată sau None dacă s-a anulat
        """
        print(f"\n📏 Selectează 2nd Unity:")
        for idx, unit in enumerate(self.AVAILABLE_2ND_UNITS, 1):
            marker = " ← (din rețetă)" if unit == recipe_unit else ""
            print(f"    {idx}. {unit}{marker}")
        print(f"    0. Anulează")
        
        while True:
            choice = input(f"\n  Selectează 2nd Unity (0-{len(self.AVAILABLE_2ND_UNITS)}): ").strip()
            try:
                choice_num = int(choice)
                if choice_num == 0:
                    print(f"  ⊗ Anulat")
                    return None
                elif 1 <= choice_num <= len(self.AVAILABLE_2ND_UNITS):
                    selected = self.AVAILABLE_2ND_UNITS[choice_num - 1]
                    print(f"  ✓ Selectat: {selected}")
                    return selected
                else:
                    print(f"  ⚠ Opțiune invalidă")
            except ValueError:
                print(f"  ⚠ Te rog introdu un număr")
    
    def _add_2nd_unity_with_conversion(self, grocery_item_id: str, unit: str, grocery_name: str) -> bool:
        """
        Adaugă 2nd Unity la un Grocery Item + cere valoarea Conversion
        
        Args:
            grocery_item_id: ID-ul Grocery Item-ului
            unit: Unitatea care va fi setată ca 2nd Unity
            grocery_name: Numele Grocery Item-ului (pentru logging)
        
        Returns:
            True dacă actualizarea a avut succes, False altfel
        """
        try:
            if unit not in self.AVAILABLE_2ND_UNITS:
                print(f"  ⚠ '{unit}' nu e în lista AVAILABLE_2ND_UNITS: {self.AVAILABLE_2ND_UNITS}")
                return False
            
            # Obține Unity pentru a afișa în prompt
            unity, _ = self.get_grocery_item_units(grocery_item_id)
            
            # Cere valoarea Conversion
            print(f"\n🔄 Conversion factor: câte {unity} sunt într-un {unit}?")
            print(f"   Exemplu: dacă 1 {unit} = 240{unity}, introduce 240")
            conv_input = input(f"   Conversion (sau ENTER pentru skip): ").strip()
            
            conversion = None
            if conv_input:
                try:
                    conversion = float(conv_input)
                    print(f"  ✓ Conversion: 1 {unit} = {conversion} {unity}")
                except ValueError:
                    print(f"  ⚠ Conversion invalid, se salvează fără conversion")
            
            # Actualizează Grocery Item
            properties = {
                "2nd Unity": {
                    "select": {"name": unit}
                }
            }
            
            if conversion is not None:
                properties["Conversion"] = {"number": conversion}
            
            notion.pages.update(
                page_id=grocery_item_id,
                properties=properties
            )
            
            conv_text = f" + Conversion: 1 {unit} = {conversion} {unity}" if conversion else ""
            print(f"  ✓ Actualizat '{grocery_name}': 2nd Unity = '{unit}'{conv_text}")
            return True
            
        except Exception as e:
            print(f"  ✗ Eroare la actualizarea Grocery Item: {e}")
            return False
    
    def _manual_conversion_dialog(self, ingredient: Dict, unity: str, second_unity: str) -> Tuple[Optional[float], Optional[str]]:
        """
        Dialog pentru introducerea manuală a conversiei
        
        Args:
            ingredient: Dicționarul ingredientului cu unit și quantity
            unity: Unity din Grocery Item
            second_unity: 2nd Unity din Grocery Item
        
        Returns:
            Tuple (cantitate_convertită, unitate_țintă) sau (None, None) dacă s-a anulat
        """
        print(f"\n🔢 Conversie manuală pentru {ingredient['quantity']} {ingredient['unit']}:")
        
        options = []
        if unity:
            options.append((unity, 'principală'))
        if second_unity:
            options.append((second_unity, 'secundară'))
        
        if not options:
            print(f"  ⚠ Nu există unități disponibile în Grocery Item")
            return None, None
        
        print(f"\nAlege unitatea țintă:")
        for idx, (unit, unit_type) in enumerate(options, 1):
            print(f"  {idx}. Convertește la {unit} (unitate {unit_type})")
        print(f"  0. Anulează")
        
        target_unit = None
        while not target_unit:
            choice = input(f"\nSelectează unitate (0-{len(options)}): ").strip()
            try:
                choice_num = int(choice)
                if choice_num == 0:
                    return None, None
                elif 1 <= choice_num <= len(options):
                    target_unit = options[choice_num - 1][0]
                else:
                    print(f"  ⚠ Opțiune invalidă")
            except ValueError:
                print(f"  ⚠ Te rog introdu un număr")
        
        # Cere factorul de conversie (câte unități țintă sunt într-o unitate din rețetă)
        print(f"\n🔄 Factor de conversie:")
        print(f"   Câte {target_unit} sunt într-un {ingredient['unit']}?")
        print(f"   Exemplu: dacă 1 {ingredient['unit']} = 5{target_unit}, introdu 5")
        
        while True:
            factor_input = input(f"\nFactor de conversie (sau ENTER pentru anulare): ").strip()
            if not factor_input:
                return None, None
            try:
                conversion_factor = float(factor_input)
                if conversion_factor <= 0:
                    print(f"  ⚠ Factorul trebuie să fie pozitiv")
                    continue
                
                # Calculează cantitatea finală
                converted_qty = ingredient['quantity'] * conversion_factor
                print(f"  ✓ Conversie: {ingredient['quantity']} {ingredient['unit']} × {conversion_factor} = {converted_qty:.4g} {target_unit}")
                
                return converted_qty, target_unit
            except ValueError:
                print(f"  ⚠ Te rog introdu un număr valid")
    
    def _normalize_unit(self, unit: str) -> str:
        """Normalizează o unitate la forma ei canonică"""
        unit_lower = unit.lower().strip()
        
        # Verifică sinonimele
        for canonical, synonyms in self.UNIT_SYNONYMS.items():
            if unit_lower in [s.lower() for s in synonyms]:
                return canonical
        
        return unit_lower
    
    def _units_match(self, unit1: str, unit2: str) -> bool:
        """Verifică dacă două unități sunt echivalente (inclusiv sinonime)"""
        if not unit1 or not unit2:
            return False
        
        normalized1 = self._normalize_unit(unit1)
        normalized2 = self._normalize_unit(unit2)
        
        return normalized1 == normalized2
    
    def _convert_unit(self, quantity: float, from_unit: str, to_unit: str) -> Optional[float]:
        """Convertește cantitatea dintr-o unitate în alta"""
        from_normalized = self._normalize_unit(from_unit)
        to_normalized = self._normalize_unit(to_unit)
        
        # Dacă sunt deja aceleași (inclusiv sinonime), nu e nevoie de conversie
        if from_normalized == to_normalized:
            return quantity
        
        # Caută în UNIT_CONVERSIONS folosind forma RAW (nu normalizată)
        # Încearcă conversie prin dicționar
        from_raw = from_unit.lower().strip()
        to_raw = to_unit.lower().strip()
        
        if from_raw in self.UNIT_CONVERSIONS:
            target_unit, factor = self.UNIT_CONVERSIONS[from_raw]
            
            # Convertește la unitatea intermediară
            intermediate_value = quantity * factor
            
            # Verifică dacă unitatea țintă este compatibilă
            if target_unit.lower() == to_raw:
                return intermediate_value
            
            # Dacă to_unit e în conversii și are aceeași unitate intermediară
            if to_raw in self.UNIT_CONVERSIONS:
                to_target, to_factor = self.UNIT_CONVERSIONS[to_raw]
                if to_target.lower() == target_unit.lower():
                    return intermediate_value / to_factor
        
        return None
    
    def validate_unit(self, ingredient: Dict, grocery_item_id: str, grocery_name: str) -> Tuple[bool, Optional[float], Optional[str]]:
        """
        Validează dacă unitatea folosită este compatibilă cu grocery item-ul.
        
        Returns:
            Tuple[bool, Optional[float], Optional[str]]: 
                - True dacă e compatibil (cu sau fără conversie), False dacă nu
                - Cantitatea convertită (sau None dacă nu e nevoie de conversie)
                - Unitatea țintă (sau None dacă nu e nevoie de conversie)
        """
        if not ingredient['unit'] or not grocery_item_id:
            return True, None, None
        
        unity, second_unity = self.get_grocery_item_units(grocery_item_id)
        
        # Dacă grocery item-ul nu are unități setate, acceptă orice
        if not unity and not second_unity:
            print(f"    ℹ Grocery item '{grocery_name}' nu are unități definite - se acceptă '{ingredient['unit']}'")
            return True, None, None
        
        # Verifică dacă unitatea se potrivește direct (inclusiv sinonime)
        # Prioritate: verifică mai întâi dacă se potrivește exact cu oricare din cele două
        matches_unity = unity and self._units_match(ingredient['unit'], unity)
        matches_second_unity = second_unity and self._units_match(ingredient['unit'], second_unity)
        
        if matches_unity or matches_second_unity:
            # Unitatea se potrivește direct - nu e nevoie de conversie
            # Folosește unitatea care se potrivește (prioritate la cea din rețetă)
            return True, None, None
        
        # Unitatea nu se potrivește - încearcă conversie
        print(f"\n{'='*60}")
        print(f"⚠️  Unitate de măsură diferită!")
        print(f"{'='*60}")
        print(f"\nIngredient: {ingredient['name']}")
        print(f"Cantitate: {ingredient['quantity']} {ingredient['unit']}")
        print(f"Grocery item: '{grocery_name}'")
        print(f"  - Unitate principală: '{unity if unity else '(nedefinită)'}'")
        print(f"  - Unitate secundară: '{second_unity if second_unity else '(nedefinită)'}'")
        
        # Încearcă conversie la fiecare unitate disponibilă
        conversions = []
        
        if unity:
            converted = self._convert_unit(ingredient['quantity'], ingredient['unit'], unity)
            if converted is not None:
                conversions.append((converted, unity, 'principală'))
        
        if second_unity:
            converted = self._convert_unit(ingredient['quantity'], ingredient['unit'], second_unity)
            if converted is not None:
                conversions.append((converted, second_unity, 'secundară'))
        
        if conversions:
            print(f"\n{'─'*60}")
            print("💡 CONVERSII DISPONIBILE:")
            print(f"{'─'*60}\n")
            
            for idx, (conv_qty, conv_unit, unit_type) in enumerate(conversions, 1):
                print(f"{idx}. Convertește la {conv_qty:.2f} {conv_unit} (unitate {unit_type})")
            
            # Adaugă ÎNTOTDEAUNA opțiunea de conversie manuală
            next_option = len(conversions) + 1
            print(f"\n{next_option}. INTRODUCE conversie manuală")
            if unity:
                print(f"   - Câte {unity} sunt într-un {ingredient['unit']}?")
            if second_unity and unity:
                print(f"   - SAU câte {second_unity} sunt într-un {ingredient['unit']}?")
            elif second_unity:
                print(f"   - Câte {second_unity} sunt într-un {ingredient['unit']}?")
            
            # Adaugă opțiunea de a seta 2nd Unity (doar dacă nu există deja)
            can_add_2nd = not second_unity
            if can_add_2nd:
                next_option += 1
                print(f"\n{next_option}. ADAUGĂ 2nd Unity la '{grocery_name}' (alegi manual din listă)")
            
            print(f"\n0. Anulează - oprește importul")
            
            while True:
                max_option = len(conversions) + 1 + (1 if can_add_2nd else 0)
                choice = input(f"\nAlege opțiune (0-{max_option}): ").strip()
                
                try:
                    choice_num = int(choice)
                    if choice_num == 0:
                        print(f"  ✗ Import anulat pentru '{ingredient['name']}'")
                        return False, None, None
                    elif 1 <= choice_num <= len(conversions):
                        conv_qty, conv_unit, _ = conversions[choice_num - 1]
                        print(f"  ✓ Se va folosi {conv_qty:.2f} {conv_unit}")
                        return True, conv_qty, conv_unit
                    elif choice_num == len(conversions) + 1:
                        # Opțiune: INTRODUCE conversie manuală
                        conv_qty, conv_unit = self._manual_conversion_dialog(ingredient, unity, second_unity)
                        if conv_qty is not None:
                            print(f"  ✓ Se va folosi {conv_qty} {conv_unit}")
                            return True, conv_qty, conv_unit
                        else:
                            print(f"  ⊗ Conversie anulată, alege altă opțiune")
                            continue
                    elif can_add_2nd and choice_num == len(conversions) + 2:
                        # Dialog pentru adăugare 2nd Unity
                        selected_unit = self._select_2nd_unity_dialog(ingredient['unit'])
                        if selected_unit:
                            success = self._add_2nd_unity_with_conversion(grocery_item_id, selected_unit, grocery_name)
                            if success:
                                if self._units_match(ingredient['unit'], selected_unit):
                                    print(f"  ✓ Se va folosi {ingredient['quantity']} {ingredient['unit']}")
                                    return True, None, None
                                else:
                                    print(f"  ⚠ Unitatea '{ingredient['unit']}' NU match-uiește cu '{selected_unit}'")
                                    print(f"  ℹ Alege din nou ce să faci")
                                    continue
                            else:
                                continue
                        else:
                            continue
                    else:
                        print(f"  ⚠ Opțiune invalidă")
                except ValueError:
                    print(f"  ⚠ Input invalid")
        
        # Nu există conversii disponibile
        print(f"\n{'─'*60}")
        print("❌ Nu există conversii automate disponibile!")
        print(f"{'─'*60}")
        print(f"\nSOLUȚII:")
        print(f"\n1. INTRODUCE conversie manuală")
        if unity:
            print(f"   - Convertește cantitatea la '{unity}' și introdu valoarea")
        if second_unity:
            print(f"   - SAU convertește cantitatea la '{second_unity}' și introdu valoarea")
        
        # Verifică dacă poate adăuga 2nd Unity (doar dacă nu există deja)
        can_add_2nd_unity = not second_unity
        
        if can_add_2nd_unity:
            print(f"\n2. ADAUGĂ 2nd Unity la '{grocery_name}'")
            print(f"   - Vei alege manual din lista AVAILABLE_2ND_UNITS")
        else:
            print(f"\n2. ACTUALIZARE manuală Grocery Item în Notion:")
            print(f"   - Deschide '{grocery_name}' în Grocery List 2.0")
            print(f"   - Modifică '2nd Unity' la unitatea dorită")
        
        print(f"\n3. SARI acest ingredient (va fi salvat în Obs)")
        print(f"\n0. ANULEAZĂ importul pentru acest ingredient")
        print(f"\n{'='*60}\n")
        
        while True:
            if can_add_2nd_unity:
                choice = input("Alege opțiune (0-3): ").strip()
            else:
                choice = input("Alege opțiune (0, 1 sau 3): ").strip()
            
            if choice == '0':
                print(f"  ✗ Import anulat pentru '{ingredient['name']}'")
                return False, None, None
            elif choice == '1':
                # Dialog pentru conversie manuală
                conv_qty, conv_unit = self._manual_conversion_dialog(ingredient, unity, second_unity)
                if conv_qty is not None:
                    print(f"  ✓ Se va folosi {conv_qty} {conv_unit}")
                    return True, conv_qty, conv_unit
                else:
                    print(f"  ⊗ Conversie anulată, alege altă opțiune")
                    continue
            elif choice == '2' and can_add_2nd_unity:
                # Selectează manual 2nd Unity din listă
                selected_unit = self._select_2nd_unity_dialog(ingredient['unit'])
                
                if selected_unit:
                    # Adaugă 2nd Unity selectat la Grocery Item + Conversion
                    success = self._add_2nd_unity_with_conversion(grocery_item_id, selected_unit, grocery_name)
                    if success:
                        print(f"  ✓ 2nd Unity '{selected_unit}' adăugat la '{grocery_name}'")
                        
                        # Verifică dacă unitatea selectată match-uiește cu cea din rețetă
                        if self._units_match(ingredient['unit'], selected_unit):
                            print(f"  ✓ Se va folosi {ingredient['quantity']} {ingredient['unit']}")
                            return True, None, None
                        else:
                            print(f"  ⚠ Unitatea din rețetă '{ingredient['unit']}' NU match-uiește cu '{selected_unit}'")
                            print(f"  ℹ Te rog alege din nou ce să faci cu acest ingredient")
                            continue
                    else:
                        print(f"  ✗ Nu s-a putut adăuga 2nd Unity, alege altă opțiune")
                        continue
                else:
                    continue
            elif choice == '3':
                print(f"  ⚠ Cantitatea {ingredient['quantity']}{ingredient['unit']} va fi salvată în Obs (nu în Size)")
                return True, None, None
            else:
                print(f"  ⚠ Opțiune invalidă")
                continue

    def find_existing_recipe(self, recipe_name: str) -> Optional[str]:
        """Caută o rețetă existentă după nume și returnează ID-ul"""
        print(f"  🔍 Caut rețeta: '{recipe_name}'")
        try:
            response = notion.databases.query(
                **{
                    "database_id": DB_RECEIPTS,
                    "filter": {
                        "property": "Name",
                        "title": {
                            "equals": recipe_name
                        }
                    }
                }
            )
            
            if response.get('results'):
                recipe_id = response['results'][0]['id']
                print(f"  ✓ Găsită rețetă existentă: {recipe_name}")
                return recipe_id
            
            return None
            
        except Exception as e:
            print(f"  ⚠ Eroare la căutarea rețetei: {e}")
            return None
    
    def get_existing_ingredients(self, recipe_id: str) -> List[Dict]:
        """Obține ingredientele existente pentru o rețetă (versiune simplă pentru compatibilitate)"""
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
                    name = props['Ingredient']['title'][0]['text']['content']
                
                # Extrage Grocery Item ID
                grocery_id = None
                if 'Grocery - Item' in props and props['Grocery - Item']['relation']:
                    grocery_id = props['Grocery - Item']['relation'][0]['id']
                
                ingredients.append({
                    'id': result['id'],
                    'name': name,
                    'grocery_id': grocery_id
                })
            
            return ingredients
            
        except Exception as e:
            print(f"  ⚠ Eroare la obținerea ingredientelor: {e}")
            return []
    
    def _get_grocery_item_name(self, grocery_id: str) -> Optional[str]:
        """Obține numele unui grocery item după ID"""
        try:
            page = notion.pages.retrieve(page_id=grocery_id)
            name_prop = page['properties'].get('Name', {})
            if name_prop.get('title'):
                return name_prop['title'][0]['text']['content']
        except Exception:
            pass
        return None
    
    def _get_existing_ingredients_detailed(self, recipe_id: str) -> List[Dict]:
        """Obține ingredientele existente pentru o rețetă cu toate detaliile (pentru smart update)"""
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
                try:
                    props = result['properties']
                    
                    # Extrage numele ingredientului
                    name = ''
                    if 'Ingredient' in props and props['Ingredient']['title']:
                        title_arr = props['Ingredient']['title']
                        if title_arr and len(title_arr) > 0:
                            # Încearcă ambele formate API
                            text_obj = title_arr[0].get('text')
                            if text_obj and 'content' in text_obj:
                                name = text_obj['content']
                            elif 'plain_text' in title_arr[0]:
                                name = title_arr[0]['plain_text']
                    
                    # Extrage Grocery Item ID
                    grocery_id = None
                    if 'Grocery - Item' in props and props['Grocery - Item']['relation']:
                        relations = props['Grocery - Item']['relation']
                        if relations and len(relations) > 0:
                            grocery_id = relations[0]['id']
                    
                    # Extrage cantitățile
                    size_unit = None
                    if 'Size / Unit' in props and props['Size / Unit']['number'] is not None:
                        size_unit = props['Size / Unit']['number']
                    
                    size_2nd_unit = None
                    if 'Size / 2nd Unit' in props and props['Size / 2nd Unit']['number'] is not None:
                        size_2nd_unit = props['Size / 2nd Unit']['number']
                    
                    # Extrage observațiile
                    obs = ''
                    if 'Obs' in props and props['Obs']['rich_text']:
                        obs = props['Obs']['rich_text'][0]['plain_text']
                    
                    # Extrage separator
                    separator = ''
                    if 'Receipt separator' in props and props['Receipt separator']['select']:
                        separator = props['Receipt separator']['select']['name']
                    
                    ingredients.append({
                        'id': result['id'],
                        'name': name,
                        'grocery_id': grocery_id,
                        'size_unit': size_unit,
                        'size_2nd_unit': size_2nd_unit,
                        'obs': obs,
                        'separator': separator
                    })
                except Exception as item_error:
                    # Sari peste ingrediente care nu pot fi parsate
                    print(f"  ⚠ Nu pot parsa ingredientul: {item_error}")
                    continue
            
            return ingredients
            
        except Exception as e:
            print(f"  ⚠ Eroare la obținerea ingredientelor detaliate: {e}")
            return []
    
    def update_recipe_ingredients(self, recipe_id: str, recipe_data: Dict):
        """Actualizează ingredientele unei rețete existente (smart update - păstrează existente, update doar ce s-a schimbat)"""
        print(f"\n  Actualizare inteligentă ingrediente pentru: {recipe_data['name']}")
        
        # Obține ingredientele existente cu toate detaliile
        existing = self._get_existing_ingredients_detailed(recipe_id)
        print(f"  ℹ Găsite {len(existing)} ingrediente existente")
        
        # Creează un dict pentru ingredientele existente (key = grocery_id + name lowercase)
        existing_map = {}
        # Creează și un mapping de la grocery_item name la grocery_id pentru reutilizare
        existing_grocery_names = {}
        # Creează și un mapping invers: grocery_id -> numele pe care il folosim in DB
        grocery_id_to_name = {}
        for ing in existing:
            # Aplică singularizare la fel ca _parse_ingredient pentru matching consistent
            singularized_name = self._singularize(ing['name'])
            key = f"{ing['grocery_id']}:{singularized_name.lower()}"
            existing_map[key] = ing
            # Mapează și numele grocery item-ului la ID
            if ing['grocery_id']:
                grocery_name = self._get_grocery_item_name(ing['grocery_id'])
                if grocery_name:
                    existing_grocery_names[grocery_name.lower()] = ing['grocery_id']
                    # Salvează și mapping-ul grocery_id -> nume din DB
                    grocery_id_to_name[ing['grocery_id']] = ing['name']
        
        # Procesează ingredientele noi
        separator_counter = 1
        new_ingredients_keys = set()
        updated_count = 0
        created_count = 0
        
        for group in recipe_data['ingredient_groups']:
            print(f"\n  Grup: [{group['name']}]")
            
            for ingredient in group['ingredients']:
                # Mai întâi verifică dacă avem deja acest grocery item în ingredientele existente
                grocery_id = existing_grocery_names.get(ingredient['grocery_item'].lower())
                
                # Dacă nu există, caută/creează în baza de date
                if not grocery_id:
                    grocery_id = self.find_or_create_grocery_item(ingredient['grocery_item'])
                else:
                    print(f"  ♻️  Reutilizez grocery item existent: {ingredient['grocery_item']}")
                
                if not grocery_id:
                    continue
                
                # Obține numele REAL al grocery item-ului din Notion pentru validarea unitățiilor
                grocery_name_from_db = self._get_grocery_item_name(grocery_id)
                grocery_name_for_validation = grocery_name_from_db if grocery_name_from_db else ingredient['grocery_item']
                
                # Validează unitatea și verifică dacă e nevoie de conversie
                is_valid, converted_qty, converted_unit = self.validate_unit(
                    ingredient, grocery_id, grocery_name_for_validation
                )
                
                if not is_valid:
                    print(f"    ✗ Import anulat pentru '{ingredient['name']}'")
                    continue
                
                # Folosește cantitatea și unitatea convertite dacă există
                final_quantity = converted_qty if converted_qty is not None else ingredient['quantity']
                final_unit = converted_unit if converted_unit is not None else ingredient['unit']
                
                # Determină numele de folosit pentru matching
                # Dacă acest grocery_id există deja în ingrediente, folosește numele din DB
                # Altfel folosește numele parsate din ingredient
                name_for_matching = grocery_id_to_name.get(grocery_id, ingredient['name'])
                
                # Creează key pentru acest ingredient (folosește lowercase și singularizat)
                singularized_name = self._singularize(name_for_matching)
                ingredient_key = f"{grocery_id}:{singularized_name.lower()}"
                new_ingredients_keys.add(ingredient_key)
                
                # Verifică dacă ingredientul există deja
                if ingredient_key in existing_map:
                    # Update ingredient existent
                    existing_ing = existing_map[ingredient_key]
                    
                    # Verifică dacă s-a schimbat ceva (cantitate, unitate, obs)
                    needs_update = False
                    updates = {}
                    
                    # Determină care câmp să folosim (Size / Unit sau Size / 2nd Unit)
                    unity, second_unity = self.get_grocery_item_units(grocery_id)
                    use_second_unit = False
                    save_in_obs = False
                    
                    if not unity and not second_unity:
                        use_second_unit = False
                        save_in_obs = False
                    else:
                        matches_unity = unity and self._units_match(final_unit, unity)
                        matches_second_unity = second_unity and self._units_match(final_unit, second_unity)
                        
                        if matches_second_unity:
                            use_second_unit = True
                            save_in_obs = False
                        elif matches_unity:
                            use_second_unit = False
                            save_in_obs = False
                        else:
                            use_second_unit = False
                            save_in_obs = True
                    
                    # Compară cantitatea
                    if use_second_unit:
                        if existing_ing.get('size_2nd_unit') != final_quantity:
                            updates["Size / 2nd Unit"] = {"number": final_quantity} if final_quantity else {"number": None}
                            needs_update = True
                        # Clear Size / Unit dacă era setat
                        if existing_ing.get('size_unit') is not None:
                            updates["Size / Unit"] = {"number": None}
                            needs_update = True
                    else:
                        if not save_in_obs and existing_ing.get('size_unit') != final_quantity:
                            updates["Size / Unit"] = {"number": final_quantity} if final_quantity else {"number": None}
                            needs_update = True
                        # Clear Size / 2nd Unit dacă era setat
                        if existing_ing.get('size_2nd_unit') is not None:
                            updates["Size / 2nd Unit"] = {"number": None}
                            needs_update = True
                    
                    # Construiește noul Obs
                    obs_parts = []
                    if save_in_obs and final_quantity is not None:
                        obs_parts.append(f"{final_quantity}{final_unit}")
                    if ingredient.get('observations'):
                        obs_parts.append(ingredient['observations'])
                    
                    new_obs = " | ".join(obs_parts) if obs_parts else ""
                    
                    # Compară Obs
                    if existing_ing.get('obs', '') != new_obs:
                        updates["Obs"] = {"rich_text": [{"text": {"content": new_obs}}]} if new_obs else {"rich_text": []}
                        needs_update = True
                    
                    # Update separator
                    if existing_ing.get('separator') != str(separator_counter):
                        updates["Receipt separator"] = {"select": {"name": str(separator_counter)}}
                        needs_update = True
                    
                    # Aplică update-urile dacă există
                    if needs_update:
                        try:
                            notion.pages.update(
                                page_id=existing_ing['id'],
                                properties=updates
                            )
                            print(f"    ↻ Actualizat: {ingredient['name']}")
                            updated_count += 1
                        except Exception as e:
                            print(f"    ⚠ Eroare la actualizare '{ingredient['name']}': {e}")
                    else:
                        print(f"    = Neschimbat: {ingredient['name']}")
                else:
                    # Creează ingredient nou
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
                        
                        # Determină care câmp să folosim
                        unity, second_unity = self.get_grocery_item_units(grocery_id)
                        use_second_unit = False
                        save_in_obs = False
                        
                        if not unity and not second_unity:
                            use_second_unit = False
                            save_in_obs = False
                        else:
                            matches_unity = unity and self._units_match(final_unit, unity)
                            matches_second_unity = second_unity and self._units_match(final_unit, second_unity)
                            
                            if matches_second_unity:
                                use_second_unit = True
                                save_in_obs = False
                            elif matches_unity:
                                use_second_unit = False
                                save_in_obs = False
                            else:
                                use_second_unit = False
                                save_in_obs = True
                        
                        # Adaugă cantitatea
                        if final_quantity is not None and not save_in_obs:
                            if use_second_unit:
                                properties["Size / 2nd Unit"] = {"number": final_quantity}
                            else:
                                properties["Size / Unit"] = {"number": final_quantity}
                        
                        # Adaugă observațiile
                        obs_parts = []
                        if save_in_obs and final_quantity is not None:
                            obs_parts.append(f"{final_quantity}{final_unit}")
                        if ingredient.get('observations'):
                            obs_parts.append(ingredient['observations'])
                        
                        if obs_parts:
                            properties["Obs"] = {
                                "rich_text": [{"text": {"content": " | ".join(obs_parts)}}]
                            }
                        
                        notion.pages.create(
                            parent={"database_id": DB_INGREDIENTS},
                            properties=properties
                        )
                        print(f"    + Creat: {ingredient['name']}")
                        created_count += 1
                        
                    except Exception as e:
                        print(f"    ✗ Eroare la crearea ingredientului '{ingredient['name']}': {e}")
            
            # Incrementează separator după procesarea tuturor ingredientelor din grup
            separator_counter += 1
        
        # Șterge ingredientele care nu mai există în versiunea nouă
        deleted_count = 0
        for key, ing in existing_map.items():
            if key not in new_ingredients_keys:
                try:
                    notion.pages.update(
                        page_id=ing['id'],
                        archived=True
                    )
                    print(f"    - Șters: {ing['name']}")
                    deleted_count += 1
                except Exception as e:
                    print(f"    ⚠ Eroare la ștergerea ingredientului '{ing['name']}': {e}")
        
        # Sumar
        print(f"\n  ✓ Actualizare completă:")
        print(f"    + {created_count} noi")
        print(f"    ↻ {updated_count} actualizate")
        print(f"    - {deleted_count} șterse")
        print(f"    = {len(new_ingredients_keys) - created_count - updated_count} neschimbate")
    
    def create_recipe(self, recipe_data: Dict) -> Optional[str]:
        """Creează rețeta în baza Receipts 2.0"""
        try:
            # Verifică schema bazei de date pentru a vedea ce proprietăți există
            db_schema = notion.databases.retrieve(database_id=DB_RECEIPTS)
            available_props = db_schema.get('properties', {}).keys()
            
            properties = {
                "Name": {
                    "title": [{"text": {"content": recipe_data['name']}}]
                }
            }
            
            # Adaugă proprietăți opționale
            if recipe_data.get('servings'):
                properties["Servings / Receipt"] = {"number": recipe_data['servings']}
            
            if recipe_data.get('slices'):
                properties["Slice / Receipe"] = {"number": recipe_data['slices']}
            
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
            
            # Adaugă Link (URL) - doar dacă proprietatea există în baza de date
            if recipe_data.get('link') and 'link' in available_props:
                properties["link"] = {"url": recipe_data['link']}
            
            # Creează pagina fără template (template-ul va fi aplicat la final)
            new_page = notion.pages.create(
                parent={"database_id": DB_RECEIPTS},
                properties=properties
            )
            
            print(f"\n✓ Rețeta '{recipe_data['name']}' a fost creată cu succes!")
            
            # Set cover image și icon image dacă există
            image_value = recipe_data.get('image_url')
            if image_value:
                try:
                    # Verifică dacă e path local (începe cu img/ sau este path absolut la img/)
                    if image_value.startswith('img/') or '/img/' in image_value:
                        # Upload fișier local
                        # Notion API nu suportă upload direct de fișiere în cover
                        # Trebuie să folosim un URL extern sau să uploadăm în blocks
                        print(f"  ⚠ Imaginea locală '{image_value}' trebuie încărcată manual în Notion")
                        print(f"    Sau folosește un serviciu de hosting pentru imagini")
                    else:
                        # URL extern - setează atât cover cât și icon
                        notion.pages.update(
                            page_id=new_page['id'],
                            cover={
                                "type": "external",
                                "external": {
                                    "url": image_value
                                }
                            },
                            icon={
                                "type": "external",
                                "external": {
                                    "url": image_value
                                }
                            }
                        )
                        print(f"  ✓ Cover image și icon setate din URL")
                except Exception as e:
                    print(f"  ⚠ Eroare la setarea imaginilor: {e}")
            
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
    
    def create_recipe_content(self, recipe_id: str, recipe_data: Dict):
        """Creează conținutul paginii de rețetă cu structura dorită"""
        blocks_to_add = []
        
        # 1. Heading "Ingredients"
        blocks_to_add.append({
            "object": "block",
            "type": "heading_1",
            "heading_1": {
                "rich_text": [{"type": "text", "text": {"content": "Ingredients"}}]
            }
        })
        
        # 2. Pentru fiecare grup de ingrediente - doar heading-ul
        # View-urile filtrate trebuie adăugate manual sau prin template
        separator_counter = 1
        for group in recipe_data['ingredient_groups']:
            # Heading cu numele grupului
            group_title = group.get('name', str(separator_counter))
            if not group_title or group_title.isdigit():
                group_title = f"Ingredients Group {separator_counter}"
            
            blocks_to_add.append({
                "object": "block",
                "type": "heading_3",
                "heading_3": {
                    "rich_text": [{"type": "text", "text": {"content": group_title}}]
                }
            })
            
            # Placeholder pentru view - va fi adăugat manual
            blocks_to_add.append({
                "object": "block",
                "type": "paragraph",
                "paragraph": {
                    "rich_text": [{
                        "type": "text", 
                        "text": {
                            "content": f"[Adaugă aici view Ingredients 2.0 filtrat pentru Receipt separator = {separator_counter}]"
                        },
                        "annotations": {
                            "color": "gray"
                        }
                    }]
                }
            })
            
            separator_counter += 1
        
        # 3. Heading "Steps:"
        blocks_to_add.append({
            "object": "block",
            "type": "heading_1",
            "heading_1": {
                "rich_text": [{"type": "text", "text": {"content": "Steps:"}}]
            }
        })
        
        # 4. Lista numerotată cu instrucțiunile
        if recipe_data.get('instructions'):
            for step in recipe_data['instructions']:
                blocks_to_add.append({
                    "object": "block",
                    "type": "numbered_list_item",
                    "numbered_list_item": {
                        "rich_text": [{"type": "text", "text": {"content": step}}]
                    }
                })
        else:
            # Fallback dacă nu există instrucțiuni
            blocks_to_add.append({
                "object": "block",
                "type": "paragraph",
                "paragraph": {
                    "rich_text": [{"type": "text", "text": {"content": "Nu s-au găsit instrucțiuni."}}]
                }
            })
        
        # Adaugă toate blocurile în pagina de rețetă
        try:
            notion.blocks.children.append(
                block_id=recipe_id,
                children=blocks_to_add
            )
            print(f"\n✓ Structură de conținut creată pentru rețeta!")
        except Exception as e:
            print(f"\n⚠ Eroare la crearea structurii de conținut: {e}")
    
    def add_steps_to_recipe(self, recipe_id: str, recipe_data: Dict):
        """Adaugă pașii (Steps) la rețeta existentă care are deja template aplicat"""
        if not recipe_data.get('instructions'):
            print("  ⚠ Nu există instrucțiuni de adăugat")
            return
        
        # Găsește heading-ul "Steps" în pagină
        try:
            blocks = notion.blocks.children.list(block_id=recipe_id)
            steps_block_id = None
            
            for block in blocks.get('results', []):
                if block.get('type') == 'heading_2':
                    heading_text = block.get('heading_2', {}).get('rich_text', [])
                    if heading_text and 'Steps' in heading_text[0].get('text', {}).get('content', ''):
                        steps_block_id = block['id']
                        break
            
            if not steps_block_id:
                print("  ⚠ Nu s-a găsit heading 'Steps' în template. Adaug la final.")
                steps_block_id = recipe_id
            
            # Verifică dacă avem grupuri multiple cu nume
            has_multiple_named_groups = False
            ingredient_groups = recipe_data.get('ingredient_groups', [])
            if len(ingredient_groups) > 1:
                has_multiple_named_groups = any(group.get('name') for group in ingredient_groups)
            
            # Creează lista numerotată cu pașii
            step_blocks = []
            for step in recipe_data['instructions']:
                # Verifică dacă e un header de secțiune
                if step.startswith('__SECTION_HEADER__'):
                    section_name = step.replace('__SECTION_HEADER__', '')
                    # Adaugă H3 doar dacă avem grupuri multiple cu nume
                    if has_multiple_named_groups:
                        step_blocks.append({
                            "object": "block",
                            "type": "heading_3",
                            "heading_3": {
                                "rich_text": [{"type": "text", "text": {"content": f"For the {section_name}"}}]
                            }
                        })
                else:
                    step_blocks.append({
                        "object": "block",
                        "type": "numbered_list_item",
                        "numbered_list_item": {
                            "rich_text": [{"type": "text", "text": {"content": step}}]
                        }
                    })
            
            # Adaugă blocurile după heading-ul Steps
            notion.blocks.children.append(
                block_id=steps_block_id,
                children=step_blocks
            )
            
            print(f"  ✓ Adăugate {len(step_blocks)} pași în secțiunea Steps")
            
        except Exception as e:
            print(f"  ⚠ Eroare la adăugarea pașilor: {e}")
    
    def add_method_section(self, recipe_id: str, recipe_data: Dict):
        """Adaugă secțiunea Method la sfârșitul paginii de rețetă"""
        blocks_to_add = []
        
        # Verifică dacă avem grupuri multiple cu nume pentru a decide dacă adăugăm H3
        has_multiple_named_groups = False
        ingredient_groups = recipe_data.get('ingredient_groups', [])
        if len(ingredient_groups) > 1:
            # Verifică dacă cel puțin un grup are nume
            has_multiple_named_groups = any(group.get('name') for group in ingredient_groups)
        
        # Heading "Steps:"
        blocks_to_add.append({
            "object": "block",
            "type": "heading_1",
            "heading_1": {
                "rich_text": [{"type": "text", "text": {"content": "Steps:"}}]
            }
        })
        
        # Lista numerotată cu instrucțiunile
        if recipe_data.get('instructions'):
            for step in recipe_data['instructions']:
                # Verifică dacă e un header de secțiune
                if step.startswith('__SECTION_HEADER__'):
                    section_name = step.replace('__SECTION_HEADER__', '')
                    # Adaugă H3 doar dacă avem grupuri multiple cu nume
                    if has_multiple_named_groups:
                        blocks_to_add.append({
                            "object": "block",
                            "type": "heading_3",
                            "heading_3": {
                                "rich_text": [{"type": "text", "text": {"content": f"For the {section_name}"}}]
                            }
                        })
                else:
                    # E un pas normal
                    blocks_to_add.append({
                        "object": "block",
                        "type": "numbered_list_item",
                        "numbered_list_item": {
                            "rich_text": [{"type": "text", "text": {"content": step}}]
                        }
                    })
        
        # Adaugă blocurile la sfârșitul paginii
        try:
            notion.blocks.children.append(
                block_id=recipe_id,
                children=blocks_to_add
            )
            print(f"  ✓ Steps adăugat ({len(recipe_data.get('instructions', []))} pași)")
        except Exception as e:
            print(f"  ⚠ Eroare la adăugarea Steps: {e}")
    
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
                
                # Obține numele REAL al grocery item-ului din Notion pentru validarea unitățiilor
                grocery_name_from_db = self._get_grocery_item_name(grocery_id)
                grocery_name_for_validation = grocery_name_from_db if grocery_name_from_db else ingredient['grocery_item']
                
                # Validează unitatea și verifică dacă e nevoie de conversie
                is_valid, converted_qty, converted_unit = self.validate_unit(
                    ingredient, grocery_id, grocery_name_for_validation
                )
                
                if not is_valid:
                    print(f"    ✗ Import anulat pentru '{ingredient['name']}'")
                    continue
                
                # Folosește cantitatea și unitatea convertite dacă există
                final_quantity = converted_qty if converted_qty is not None else ingredient['quantity']
                final_unit = converted_unit if converted_unit is not None else ingredient['unit']
                
                # Determină care câmp să folosim (Size / Unit sau Size / 2nd Unit)
                unity, second_unity = self.get_grocery_item_units(grocery_id)
                
                # Logica de decizie:
                # 1. Dacă grocery item NU are Unity/2nd Unity definite → pune în Size / Unit
                # 2. Dacă unitatea se potrivește cu 2nd Unity → pune în Size / 2nd Unit
                # 3. Dacă unitatea se potrivește cu Unity → pune în Size / Unit
                # 4. Dacă unitatea NU se potrivește cu niciunul → pune în Obs
                
                if not unity and not second_unity:
                    # Grocery item fără unități definite → implicit Size / Unit
                    use_second_unit = False
                    save_in_obs = False
                else:
                    # Verifică match-uri cu unitățile definite
                    matches_unity = unity and self._units_match(final_unit, unity)
                    matches_second_unity = second_unity and self._units_match(final_unit, second_unity)
                    
                    if matches_second_unity:
                        use_second_unit = True
                        save_in_obs = False
                    elif matches_unity:
                        use_second_unit = False
                        save_in_obs = False
                    else:
                        # Nu se potrivește cu niciunul → salvează în Obs
                        use_second_unit = False
                        save_in_obs = True
                
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
                    
                    # Adaugă cantitatea în câmpul corespunzător SAU în Obs dacă unitatea nu se potrivește
                    if final_quantity is not None and not save_in_obs:
                        if use_second_unit:
                            properties["Size / 2nd Unit"] = {"number": final_quantity}
                        else:
                            properties["Size / Unit"] = {"number": final_quantity}
                    
                    # Adaugă observațiile
                    obs_parts = []
                    
                    # Dacă unitatea nu se potrivește, adaugă cantitatea în Obs
                    if save_in_obs and final_quantity is not None:
                        obs_parts.append(f"{final_quantity}{final_unit}")
                    
                    # Adaugă observațiile existente
                    if ingredient.get('observations'):
                        obs_parts.append(ingredient['observations'])
                    
                    # Scrie toate observațiile în Obs
                    if obs_parts:
                        properties["Obs"] = {
                            "rich_text": [{"text": {"content": " | ".join(obs_parts)}}]
                        }
                    
                    notion.pages.create(
                        parent={"database_id": DB_INGREDIENTS},
                        properties=properties
                    )
                    
                    # Formatează cantitatea cu spațiu înainte de unitate (dacă există)
                    if final_quantity and final_unit:
                        qty_str = f"{final_quantity} {final_unit}"
                    elif final_quantity:
                        qty_str = str(final_quantity)
                    else:
                        qty_str = ""
                    
                    obs_str = f" ({ingredient.get('observations')})" if ingredient.get('observations') else ""
                    conversion_note = " [convertit]" if converted_qty is not None else ""
                    saved_in_obs_note = " [salvat în Obs]" if save_in_obs else ""
                    print(f"    ✓ {qty_str} {ingredient['name']}{obs_str}{conversion_note}{saved_in_obs_note}")
                    
                except Exception as e:
                    print(f"    ✗ Eroare la crearea ingredientului '{ingredient['name']}': {e}")
            
            separator_counter += 1
    
    def import_recipes(self, filepath: str, steps_only: bool = False):
        """Importă toate rețetele dintr-un fișier"""
        mode_text = "Adăugare Steps" if steps_only else "Import rețete"
        print(f"\n{'='*60}")
        print(f"{mode_text} din: {filepath}")
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
                if steps_only:
                    # Modul Steps: caută rețeta existentă și adaugă pașii
                    recipe_id = self.find_existing_recipe(recipe['name'])
                    if recipe_id:
                        self.add_steps_to_recipe(recipe_id, recipe)
                        print(f"\n  ✓ Steps adăugate!")
                        # Salvează mapările după fiecare rețetă (în caz că find_existing_recipe a creat mapări)
                        self._save_mappings()
                    else:
                        print(f"  ✗ Rețeta '{recipe['name']}' nu există. Creează-o mai întâi fără --steps.")
                else:
                    # Verifică dacă rețeta există deja
                    existing_recipe_id = self.find_existing_recipe(recipe['name'])
                    
                    if existing_recipe_id:
                        # Rețeta există - întreabă utilizatorul dacă vrea să o actualizeze
                        print(f"\n  ⚠ Rețeta '{recipe['name']}' există deja în Notion!")
                        print(f"  Vrei să actualizezi ingredientele? (da/nu): ", end='')
                        
                        response = input().strip().lower()
                        
                        if response in ['da', 'yes', 'y', 'd']:
                            # Actualizează ingredientele
                            self.update_recipe_ingredients(existing_recipe_id, recipe)
                            print(f"\n  ✓ Ingrediente actualizate!")
                            
                            # Întreabă dacă vrea să actualizeze și Steps
                            print(f"\n  Vrei să actualizezi și Steps? (da/nu): ", end='')
                            response_steps = input().strip().lower()
                            
                            if response_steps in ['da', 'yes', 'y', 'd']:
                                self.add_steps_to_recipe(existing_recipe_id, recipe)
                                print(f"  ✓ Steps actualizate!")
                            
                            # Salvează mapările
                            self._save_mappings()
                        else:
                            print(f"  → Rețeta '{recipe['name']}' sărită (nu se actualizează)")
                            continue
                    else:
                        # Modul normal: creează rețeta + ingredientele
                        recipe_id = self.create_recipe(recipe)
                        
                        if recipe_id:
                            # Creează ingredientele
                            self.create_ingredients(recipe_id, recipe)
                            print(f"\n  ✓ Rețeta și ingredientele create!")
                            print(f"  📝 Aplică manual template-ul în Notion, apoi rulează:")
                            print(f"     python import_recipes.py {filepath} --steps")
                            
                            # Salvează mapările după fiecare rețetă
                            self._save_mappings()
                    
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
        print("Utilizare:")
        print("  python import_recipes.py -url [--steps]      # Import din data/urls/scraped_recipe_urls.txt")
        print("  python import_recipes.py -local [--steps]    # Import din data/local/scraped_local_recipes.txt")
        print("  python import_recipes.py <file> [--steps]    # Import din fișier custom")
        print("\nExemple:")
        print("  python import_recipes.py -url                # Import complet URL-uri")
        print("  python import_recipes.py -url --steps        # Adaugă Steps pentru URL-uri")
        print("  python import_recipes.py -local              # Import complet local")
        print("  python import_recipes.py -local --steps      # Adaugă Steps pentru local")
        sys.exit(1)
    
    # Detectează modul
    first_arg = sys.argv[1]
    
    if first_arg == '-url':
        filepath = 'data/urls/scraped_recipe_urls.txt'
        mode_name = 'URL-uri web'
    elif first_arg == '-local':
        filepath = 'data/local/scraped_local_recipes.txt'
        mode_name = 'Rețete locale'
    else:
        filepath = first_arg
        mode_name = 'Fișier custom'
    
    steps_only = '--steps' in sys.argv
    
    # Debug: afișează argumentele primite
    if steps_only:
        print(f"\n🔧 Modul: Adaugă doar Steps ({mode_name})")
    else:
        print(f"\n🔧 Modul: Import complet ({mode_name})")
    
    if not os.path.exists(filepath):
        print(f"Eroare: Fișierul '{filepath}' nu există!")
        sys.exit(1)
    
    importer = RecipeImporter()
    importer.import_recipes(filepath, steps_only=steps_only)
