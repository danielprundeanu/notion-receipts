"""
Script pentru extragerea rețetelor de pe website-uri și convertirea lor în format txt
pentru import în Notion folosind import_recipes.py

Suportă:
- Schema.org Recipe markup (JSON-LD)
- Parsare HTML generică
- Multiple URL-uri dintr-un fișier
"""

import requests
from bs4 import BeautifulSoup
import json
import re
from typing import Dict, List, Optional
from fractions import Fraction
import sys


class RecipeScraper:
    def __init__(self):
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
    
    def scrape_recipe(self, url: str) -> Optional[Dict]:
        """Extrage rețeta de la URL dat"""
        try:
            print(f"\n{'='*60}")
            print(f"Procesez: {url}")
            print(f"{'='*60}\n")
            
            response = requests.get(url, headers=self.headers, timeout=10)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.content, 'lxml')
            
            # Încearcă mai întâi să găsească JSON-LD cu schema.org Recipe
            recipe = self._extract_from_jsonld(soup)
            
            if not recipe:
                # Fallback la parsare HTML generică
                print("  ⚠ Nu s-a găsit JSON-LD, încerc parsare HTML generică...")
                recipe = self._extract_from_html(soup)
            
            if recipe:
                recipe['source_url'] = url
                return recipe
            
            print("  ✗ Nu s-a putut extrage rețeta")
            return None
            
        except Exception as e:
            print(f"  ✗ Eroare la procesarea URL-ului: {e}")
            return None
    
    def _extract_from_jsonld(self, soup: BeautifulSoup) -> Optional[Dict]:
        """Extrage rețeta din JSON-LD (schema.org/Recipe)"""
        # Caută toate script-urile de tip application/ld+json
        scripts = soup.find_all('script', type='application/ld+json')
        
        for script in scripts:
            try:
                data = json.loads(script.string)
                
                # Poate fi un array sau un obiect
                if isinstance(data, list):
                    for item in data:
                        if self._is_recipe_schema(item):
                            return self._parse_recipe_schema(item)
                elif self._is_recipe_schema(data):
                    return self._parse_recipe_schema(data)
                    
            except json.JSONDecodeError:
                continue
        
        return None
    
    def _is_recipe_schema(self, data: Dict) -> bool:
        """Verifică dacă datele sunt de tip Recipe"""
        if not isinstance(data, dict):
            return False
        
        schema_type = data.get('@type', '')
        if isinstance(schema_type, list):
            return 'Recipe' in schema_type
        return schema_type == 'Recipe'
    
    def _parse_recipe_schema(self, data: Dict) -> Dict:
        """Parsează datele din schema.org Recipe"""
        print("  ✓ Găsit JSON-LD Recipe schema")
        
        ingredients = self._extract_ingredients(data.get('recipeIngredient', []))
        
        recipe = {
            'name': data.get('name', 'Untitled Recipe'),
            'servings': self._extract_servings(data.get('recipeYield')),
            'time': self._extract_time(data.get('totalTime') or data.get('cookTime')),
            'difficulty': None,  # De obicei nu e în schema
            'category': self._extract_category(data.get('recipeCategory')),
            'ingredients': ingredients,  # Păstrăm pentru compatibilitate
            'ingredient_groups': [{'name': None, 'items': ingredients}] if ingredients else [],
            'instructions': self._extract_instructions(data.get('recipeInstructions', [])),
            'image_url': self._extract_image_url(data.get('image'))
        }
        
        print(f"  ✓ Titlu: {recipe['name']}")
        print(f"  ✓ Ingrediente: {len(recipe['ingredients'])}")
        print(f"  ✓ Pași: {len(recipe['instructions'])}")
        
        return recipe
    
    def _extract_image_url(self, image_data) -> Optional[str]:
        """Extrage URL-ul imaginii din recipe schema"""
        if not image_data:
            return None
        
        # Poate fi string direct
        if isinstance(image_data, str):
            return image_data
        
        # Poate fi list de URL-uri
        if isinstance(image_data, list) and len(image_data) > 0:
            first_image = image_data[0]
            if isinstance(first_image, str):
                return first_image
            elif isinstance(first_image, dict):
                return first_image.get('url')
        
        # Poate fi dict cu url
        if isinstance(image_data, dict):
            return image_data.get('url')
        
        return None
    
    def _extract_servings(self, yield_data) -> Optional[int]:
        """Extrage numărul de porții"""
        if not yield_data:
            return None
        
        if isinstance(yield_data, (int, float)):
            return int(yield_data)
        
        if isinstance(yield_data, str):
            # Caută primul număr
            match = re.search(r'\d+', yield_data)
            if match:
                return int(match.group())
        
        return None
    
    def _extract_time(self, time_str: Optional[str]) -> Optional[int]:
        """Extrage timpul în minute din format ISO 8601 duration (PT30M)"""
        if not time_str:
            return None
        
        # Format ISO 8601: PT1H30M = 1 oră 30 minute
        hours = re.search(r'(\d+)H', time_str)
        minutes = re.search(r'(\d+)M', time_str)
        
        total_minutes = 0
        if hours:
            total_minutes += int(hours.group(1)) * 60
        if minutes:
            total_minutes += int(minutes.group(1))
        
        return total_minutes if total_minutes > 0 else None
    
    def _extract_category(self, category_data) -> Optional[str]:
        """Extrage categoria"""
        if not category_data:
            return None
        
        if isinstance(category_data, list):
            return category_data[0] if category_data else None
        
        return str(category_data)
    
    def _extract_ingredients(self, ingredients_data: List) -> List[str]:
        """Extrage lista de ingrediente"""
        ingredients = []
        
        for item in ingredients_data:
            if isinstance(item, str):
                ingredients.append(item.strip())
            elif isinstance(item, dict):
                # Uneori ingredientele sunt obiecte
                text = item.get('text') or item.get('name') or str(item)
                ingredients.append(text.strip())
        
        return ingredients
    
    def _extract_instructions(self, instructions_data) -> List[str]:
        """Extrage pașii de preparare"""
        steps = []
        
        if isinstance(instructions_data, str):
            # Dacă e un singur string, împarte după puncte/newlines
            steps = [s.strip() for s in re.split(r'[.\n]', instructions_data) if s.strip()]
        
        elif isinstance(instructions_data, list):
            for item in instructions_data:
                if isinstance(item, str):
                    steps.append(item.strip())
                elif isinstance(item, dict):
                    # Poate fi HowToStep sau HowToSection
                    text = item.get('text') or item.get('name') or ''
                    if text:
                        steps.append(text.strip())
                    
                    # Verifică dacă are itemListElement (pentru secțiuni)
                    if 'itemListElement' in item:
                        for sub_item in item['itemListElement']:
                            sub_text = sub_item.get('text') or sub_item.get('name') or ''
                            if sub_text:
                                steps.append(sub_text.strip())
        
        return steps
    
    def _extract_from_html(self, soup: BeautifulSoup) -> Optional[Dict]:
        """Parsare HTML generică când nu există JSON-LD"""
        # Încearcă să găsească titlul
        title = None
        h1 = soup.find('h1')
        if h1:
            title = h1.get_text().strip()
        
        if not title:
            title_tag = soup.find('title')
            if title_tag:
                title = title_tag.get_text().strip()
        
        # Inițializare liste pentru colectare date
        ingredient_groups = []  # Lista de grupuri: [{'name': 'For the salsa', 'items': [...]}, ...]
        descriptions = []  # Texte descriptive găsite în ingrediente
        current_group = {'name': None, 'items': []}
        seen_ingredients = set()  # Pentru deduplicare
        
        # Caută liste cu clase specifice
        for container in soup.find_all(['ul', 'ol', 'div']):
            class_name = ' '.join(container.get('class', [])).lower()
            id_name = container.get('id', '').lower()
            
            # Verifică dacă containerul este pentru ingrediente
            if any(word in class_name + id_name for word in ['ingredient', 'ingrediente']):
                # Caută heading-uri înainte de liste pentru separatori de grup
                for child in container.children:
                    if not hasattr(child, 'name'):
                        continue
                    
                    # Dacă e heading, e separator de grup
                    if child.name in ['h3', 'h4', 'h5', 'h6']:
                        heading_text = child.get_text().strip()
                        if heading_text.endswith(':'):
                            # Salvează grupul anterior
                            if current_group['items']:
                                ingredient_groups.append(current_group)
                            current_group = {'name': heading_text.rstrip(':'), 'items': []}
                    
                    # Dacă e listă, extrage ingredientele
                    elif child.name in ['ul', 'ol']:
                        for li in child.find_all('li', recursive=False):
                            text = li.get_text().strip()
                            
                            # Verifică mai întâi dacă e ingredient valid (are cantitate/unitate)
                            has_quantity = any(char.isdigit() for char in text) or any(unit in text.lower() for unit in ['cup', 'tsp', 'tbsp', 'oz', 'g', 'ml', 'kg', 'pinch', 'handful', 'bunch', 'clove', 'cloves'])
                            
                            # Dacă nu are cantitate, e probabil descriere - skip complet
                            if not has_quantity:
                                continue
                            
                            # E ingredient, curăță-l
                            clean_text = self._clean_ingredient(text)
                            
                            if clean_text and clean_text not in seen_ingredients:
                                current_group['items'].append(clean_text)
                                seen_ingredients.add(clean_text)
                
                # Salvează ultimul grup
                if current_group['items']:
                    ingredient_groups.append(current_group)
                break
        
        # Dacă nu am găsit, caută orice listă care arată ca ingrediente
        if not ingredient_groups:
            ingredient_groups = [{'name': '', 'items': []}]
            seen_ingredients = set()
            processed_uls = set()
            
            # Găsește toate listele de ingrediente potențiale
            for ul in soup.find_all(['ul', 'ol']):
                if id(ul) in processed_uls:
                    continue
                
                # Verifică dacă e listă de ingrediente
                ingredient_count = 0
                for li in ul.find_all('li', recursive=False):
                    text = li.get_text().strip()
                    if any(char.isdigit() for char in text) or any(unit in text.lower() for unit in ['cup', 'tsp', 'tbsp', 'oz', 'g', 'ml', 'kg', 'pinch', 'handful', 'bunch']):
                        ingredient_count += 1
                
                # Dacă nu are suficiente ingrediente, skip
                if ingredient_count < 2:
                    continue
                
                processed_uls.add(id(ul))
                
                # Procesează ingredientele din această listă în grupul curent
                for li in ul.find_all('li', recursive=False):
                    text = li.get_text().strip()
                    
                    # Verifică mai întâi dacă e ingredient valid (are cantitate/unitate)
                    has_quantity = any(char.isdigit() for char in text) or any(unit in text.lower() for unit in ['cup', 'tsp', 'tbsp', 'oz', 'g', 'ml', 'kg', 'pinch', 'handful', 'bunch', 'clove', 'cloves'])
                    
                    # Dacă nu are cantitate, e probabil descriere - skip complet
                    if not has_quantity:
                        continue
                    
                    # E ingredient, curăță-l
                    clean_text = self._clean_ingredient(text)
                    
                    if clean_text and clean_text not in seen_ingredients:
                        ingredient_groups[-1]['items'].append(clean_text)
                        seen_ingredients.add(clean_text)
                
                # După această listă, caută următorul heading care ar putea fi separator
                # Folosim find_next în loc de find_next_sibling pentru că heading-ul poate fi în alt container
                next_heading = ul.find_next(['h3', 'h4', 'h5', 'h6'])
                
                # Verificăm că heading-ul apare ÎNAINTE de următorul <ul>
                next_ul = ul.find_next(['ul', 'ol'])
                
                # Dacă există un heading separator între acest ul și următorul ul
                if next_heading and next_ul:
                    # Verificăm ordinea în document
                    heading_pos = str(soup).find(str(next_heading))
                    ul_pos = str(soup).find(str(next_ul))
                    
                    if heading_pos < ul_pos:
                        heading_text = next_heading.get_text().strip()
                        if heading_text.endswith(':') and len(heading_text.split()) <= 6 and not heading_text[0].isdigit():
                            # Creează grup nou pentru următoarea secțiune
                            ingredient_groups.append({'name': heading_text.rstrip(':'), 'items': []})
        
        
        # Caută servings - mai multe metode
        servings = None
        
        # Mai întâi, colectează TOATE descrierile din toate listele (nu doar cele de ingrediente)
        # pentru a le putea muta la Method
        for ul in soup.find_all(['ul', 'ol']):
            for li in ul.find_all('li', recursive=False):
                text = li.get_text().strip()
                has_quantity = any(char.isdigit() for char in text) or any(unit in text.lower() for unit in ['cup', 'tsp', 'tbsp', 'oz', 'g', 'ml', 'kg', 'pinch', 'handful', 'bunch'])
                
                # Dacă e text lung fără cantități și nu e deja în descrieri
                if len(text) > 80 and not has_quantity and text not in descriptions:
                    descriptions.append(text)
        
        # Metodă 1: Caută în apropierea textului "servings" sau "serves"
        for elem in soup.find_all(['span', 'div', 'p', 'li']):
            text = elem.get_text()
            if re.search(r'(servings?|serves?|yields?|porții)', text, re.I):
                # Caută numere în același element sau în următorul
                match = re.search(r'(\d+)', text)
                if match:
                    servings = int(match.group(1))
                    break
        
        # Metodă 2: Dacă nu am găsit, caută meta tags
        if not servings:
            meta_servings = soup.find('meta', {'itemprop': 'recipeYield'})
            if meta_servings and meta_servings.get('content'):
                match = re.search(r'(\d+)', meta_servings['content'])
                if match:
                    servings = int(match.group(1))
        
        # Caută timp
        time_minutes = None
        for text in soup.find_all(text=re.compile(r'(total time|prep time|cook time|timp)', re.I)):
            # Caută ore și minute
            hours = re.search(r'(\d+)\s*h', str(text), re.I)
            minutes = re.search(r'(\d+)\s*m', str(text), re.I)
            
            if hours or minutes:
                total = 0
                if hours:
                    total += int(hours.group(1)) * 60
                if minutes:
                    total += int(minutes.group(1))
                if total > 0:
                    time_minutes = total
                    break
        
        # Caută instrucțiuni - mai multe metode
        instructions = []
        seen_instructions = set()
        
        # Metodă 1: Caută containere cu "instruction", "method", "direction" în class/id
        # Include și elemente din accordion/collapse care pot fi ascunse
        for container in soup.find_all(['ol', 'ul', 'div', 'section', 'details', 'article']):
            class_name = ' '.join(container.get('class', [])).lower()
            id_name = container.get('id', '').lower()
            
            if any(word in class_name + id_name for word in ['instruction', 'step', 'preparare', 'mod', 'direction', 'method', 'preparation', 'accordion', 'collapse', 'toggle']):
                # Prioritizează liste ordonate (ol > li), dar caută și în paragrafe
                items = container.find_all('li', recursive=True) or container.find_all(['p'], recursive=True)
                for item in items:
                    text = item.get_text().strip()
                    # Curăță textul de whitespace excesiv
                    text = re.sub(r'\s+', ' ', text)
                    # Exclude texte prea scurte, duplicate sau care sunt doar titluri
                    if text and len(text) > 20 and text not in seen_instructions:
                        # Exclude titluri (care nu conțin verbe de acțiune)
                        has_action_verb = bool(re.search(r'\b(add|cook|heat|place|combine|mix|stir|pour|bring|simmer|serve|warm|fold|cut|chop|dice|slice|preheat|bake|fry|saute|boil|drain|rinse)\b', text.lower()))
                        # Exclude texte care sunt doar titluri sau nume de secțiuni
                        is_title = text.endswith(':') or (len(text.split()) <= 5 and not has_action_verb)
                        if not is_title and has_action_verb:
                            instructions.append(text)
                            seen_instructions.add(text)
                if instructions:
                    break  # Am găsit instrucțiuni, oprim căutarea
        
        # Metodă 2: Dacă nu am găsit, caută heading "Instructions" sau "Method" urmat de listă/text
        if not instructions:
            for heading in soup.find_all(['h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'p']):
                heading_text = heading.get_text().strip().lower()
                if re.search(r'^(instruction|method|preparation|direction|how to make|steps)s?:?$', heading_text):
                    # Caută următoarea listă, div sau paragrafe
                    next_container = heading.find_next(['ol', 'ul', 'div', 'article', 'section'])
                    if next_container:
                        # Caută în toate elementele li și p din container
                        items = next_container.find_all(['li', 'p'], recursive=True)
                        for item in items:
                            text = item.get_text().strip()
                            text = re.sub(r'\s+', ' ', text)
                            if text and len(text) > 20 and text not in seen_instructions:
                                has_action_verb = bool(re.search(r'\b(add|cook|heat|place|combine|mix|stir|pour|bring|simmer|serve|warm|fold|cut|chop|dice|slice|preheat|bake|fry|saute|boil|drain|rinse)\b', text.lower()))
                                is_title = text.endswith(':') or (len(text.split()) <= 5 and not has_action_verb)
                                if not is_title and has_action_verb:
                                    instructions.append(text)
                                    seen_instructions.add(text)
                        if instructions:
                            break
        
        # Metodă 3: Fallback - caută orice listă care conține multe verbe de acțiune
        if not instructions:
            for ol in soup.find_all('ol'):
                potential_instructions = []
                for li in ol.find_all('li', recursive=False):
                    text = li.get_text().strip()
                    text = re.sub(r'\s+', ' ', text)
                    if text and len(text) > 20:
                        has_action_verb = bool(re.search(r'\b(add|cook|heat|place|combine|mix|stir|pour|bring|simmer|serve|warm|fold|cut|chop|dice|slice|preheat|bake|fry|saute|boil|drain|rinse)\b', text.lower()))
                        if has_action_verb:
                            potential_instructions.append(text)
                
                # Dacă cel puțin 2 items au verbe de acțiune, probabil sunt instrucțiuni
                if len(potential_instructions) >= 2:
                    instructions = potential_instructions
                    break
        
        # Calculează numărul total de ingrediente
        total_ingredients = sum(len(group['items']) for group in ingredient_groups)
        
        if not title or total_ingredients == 0:
            return None
        
        print(f"  ✓ Parsare HTML: {total_ingredients} ingrediente ({len(ingredient_groups)} grupuri), {len(instructions)} instrucțiuni găsite")
        
        # Adaugă descrierile la începutul instrucțiunilor (dacă există)
        if descriptions:
            print(f"    + {len(descriptions)} descrieri mutate la Method")
            instructions = descriptions + instructions
        
        # Extrage imaginea (og:image sau prima img mare)
        image_url = None
        og_image = soup.find('meta', property='og:image')
        if og_image and og_image.get('content'):
            image_url = og_image.get('content')
        else:
            # Caută prima imagine mare din content
            for img in soup.find_all('img'):
                src = img.get('src') or img.get('data-src')
                if src and ('http' in src or src.startswith('/')):
                    image_url = src
                    break
        
        return {
            'name': title,
            'servings': servings,
            'time': time_minutes,
            'difficulty': None,
            'category': None,
            'ingredient_groups': ingredient_groups,  # Lista de grupuri
            'instructions': instructions,
            'image_url': image_url
        }
    
    def convert_to_txt_format(self, recipe: Dict) -> str:
        """Convertește rețeta în formatul txt pentru import"""
        lines = []
        
        # Header
        lines.append(f"=== {recipe['name']} ===")
        
        # Servings - păstrează originalul
        original_servings = recipe.get('servings', 1)
        lines.append(f"Servings: {original_servings}")
        
        if recipe.get('time'):
            lines.append(f"Time: {recipe['time']}")
        
        # Difficulty - default Easy pentru rețete de pe web
        lines.append(f"Difficulty: {recipe.get('difficulty') or 'Easy'}")
        
        # Category - încearcă să mapeze la categoriile din Notion
        category = self._map_category(recipe.get('category'))
        if category:
            lines.append(f"Category: {category}")
        
        lines.append(f"Favorite: No")
        
        # Link (URL)
        if recipe.get('source_url'):
            lines.append(f"Link: {recipe['source_url']}")
        
        # Image (Cover)
        if recipe.get('image_url'):
            lines.append(f"Image: {recipe['image_url']}")
        
        lines.append("")
        
        # Ingrediente - grupate în [1], [2], etc.
        ingredient_groups = recipe.get('ingredient_groups', [])
        seen_ingredients = set()  # Pentru deduplicare globală
        
        for group_idx, group in enumerate(ingredient_groups, 1):
            # Scrie numărul grupului
            lines.append(f"[{group_idx}]")
            
            # Dacă grupul are nume (de ex: "For the salsa"), adaugă-l ca comentariu
            if group.get('name'):
                lines.append(f"# {group['name']}")
            
            # Scrie ingredientele din grup - normalizate la 1 porție
            for ingredient in group.get('items', []):
                # Normalizează cantitatea
                normalized = self._normalize_quantity(ingredient, original_servings or 1)
                
                # Dacă ingredientul conține newlines, split-ează și procesează fiecare linie
                if '\n' in normalized:
                    for line in normalized.split('\n'):
                        clean_line = self._clean_ingredient(line)
                        if clean_line and clean_line not in seen_ingredients:
                            lines.append(clean_line)
                            seen_ingredients.add(clean_line)
                else:
                    # Verificăm că ingredientul nu e duplicat
                    if normalized and normalized not in seen_ingredients:
                        lines.append(normalized)
                        seen_ingredients.add(normalized)
            
            lines.append("")
        
        # Dacă nu sunt grupuri, fallback la ingredients simplu (pentru JSON-LD)
        if not ingredient_groups and recipe.get('ingredients'):
            lines.append("[1]")
            for ingredient in recipe.get('ingredients', []):
                # Normalizează cantitatea
                normalized = self._normalize_quantity(ingredient, original_servings or 1)
                
                if '\n' in normalized:
                    for line in normalized.split('\n'):
                        clean_line = self._clean_ingredient(line)
                        if clean_line and clean_line not in seen_ingredients:
                            lines.append(clean_line)
                            seen_ingredients.add(clean_line)
                else:
                    clean_ingredient = self._clean_ingredient(normalized)
                    if clean_ingredient and clean_ingredient not in seen_ingredients:
                        lines.append(clean_ingredient)
                        seen_ingredients.add(clean_ingredient)
            lines.append("")
        
        # Adaugă instrucțiunile - formatate pentru copiere manuală în Notion
        if recipe.get('instructions'):
            lines.append("Method:")
            for i, step in enumerate(recipe['instructions'], 1):
                lines.append(f"{i}. {step}")
            lines.append("")
        
        lines.append("")
        
        return '\n'.join(lines)
    
    def _map_category(self, category: Optional[str]) -> Optional[str]:
        """Mapează categoria la valorile permise în Notion"""
        if not category:
            return None
        
        category_lower = category.lower()
        
        # Mapare categorii
        mapping = {
            'breakfast': 'Breakfast',
            'lunch': 'Lunch',
            'dinner': 'Dinner',
            'snack': 'Snack',
            'dessert': 'Snack',
            'smoothie': 'Smoothie',
            'soup': 'Soup',
            'mic dejun': 'Breakfast',
            'prânz': 'Lunch',
            'cină': 'Dinner',
            'gustare': 'Snack',
            'desert': 'Snack',
            'supă': 'Soup',
        }
        
        for key, value in mapping.items():
            if key in category_lower:
                return value
        
        return 'Dinner'  # Default
    
    def _normalize_quantity(self, ingredient: str, servings: int) -> str:
        """Calculează cantitatea ingredientului per porție (împarte la servings)"""
        if not servings or servings <= 1:
            return ingredient
        
        # Mai întâi înlocuim fracțiile unicode cu text normal
        ingredient = ingredient.replace('⁄', '/')
        ingredient = ingredient.replace('½', ' 1/2')
        ingredient = ingredient.replace('¼', ' 1/4')
        ingredient = ingredient.replace('¾', ' 3/4')
        ingredient = ingredient.strip()
        
        # Pattern pentru cantități: fracție, număr mixt, sau număr întreg
        # Acceptă: "500g", "500 g", "1/2 cup", "1 1/2 tbsp", "1/4 onion", "2 cloves"
        # Ordinea e importantă: fracție cu număr mixt, apoi fracție simplă, apoi număr
        # Unități cunoscute (opțional) - folosim word boundary pentru a evita match parțiale
        units = r'(?:cups?|tsps?|teaspoons?|tbsps?|tablespoons?|ozs?|ounces?|grams?|kgs?|mls?|liters?|lbs?|pounds?|g|ml|l)\b'
        pattern = rf'^(\d+\s+\d+/\d+|\d+/\d+|\d+(?:\.\d+)?)\s*({units})?\s*'
        match = re.match(pattern, ingredient.strip(), re.IGNORECASE)
        
        if not match:
            return ingredient
        
        quantity_str = match.group(1).strip()
        unit = match.group(2) if match.group(2) else ''
        rest_of_ingredient = ingredient[match.end():].strip()
        
        try:
            # Parsează cantitatea (suportă fracții și numere mixte)
            if '/' in quantity_str:
                # Fracție sau număr mixt (ex: "1 1/2" sau "1/2")
                parts = quantity_str.split()
                if len(parts) == 2:
                    # Număr mixt: "1 1/2"
                    whole = int(parts[0])
                    frac = Fraction(parts[1])
                    quantity = whole + frac
                else:
                    # Doar fracție: "1/2"
                    quantity = Fraction(quantity_str)
            else:
                # Număr întreg sau zecimal
                quantity = float(quantity_str)
            
            # Împarte la numărul de porții
            normalized = quantity / servings
            
            # Formatează rezultatul ca număr zecimal (nu fracții)
            # Rotunjește la 2 zecimale pentru precizie, elimină zerourile finale
            if normalized == 0:
                return ingredient  # Skip dacă e 0
            
            # Formatează cu 2 zecimale, apoi elimină zerourile finale și punctul dacă e număr întreg
            quantity_formatted = f"{normalized:.2f}".rstrip('0').rstrip('.')
            
            # Reconstruiește ingredientul cu spațiu între cantitate și unitate
            if unit:
                return f"{quantity_formatted} {unit} {rest_of_ingredient}".strip()
            else:
                return f"{quantity_formatted} {rest_of_ingredient}".strip()
                
        except (ValueError, ZeroDivisionError):
            # Dacă parsarea eșuează, returnează ingredientul neschimbat
            return ingredient
    
    def _clean_ingredient(self, ingredient: str) -> str:
        """Curăță și formatează ingredientul"""
        # Elimină caractere speciale de la început
        ingredient = ingredient.strip('•-*▢□')
        ingredient = ingredient.strip()
        
        # Elimină linii prea scurte sau doar whitespace
        if len(ingredient) < 3:
            return ''
        
        # Elimină texte prea lungi (probabil instrucțiuni, nu ingrediente)
        # Ingredientele sunt de obicei scurte: "500g beef mince"
        if len(ingredient) > 150:
            return ''
        
        # Exclude propoziții care încep cu verbe (probabil instrucțiuni)
        instruction_verbs = r'^(place|add|cook|heat|combine|mix|stir|pour|bring|simmer|serve|warm|fold|firstly|then|finally|when|to make|to serve)'
        if re.match(instruction_verbs, ingredient.lower()):
            return ''
        
        # Elimină texte care sunt doar titluri (de ex: "Ingredients:", "For the salsa:")
        if ingredient.endswith(':') and len(ingredient.split()) <= 4:
            return ''
        
        # Verifică dacă are cantitate de INGREDIENT (cifră + unitate sau cifră la început)
        # Pattern: începe cu cifră sau are cifră urmată de unitate
        has_ingredient_quantity = False
        if re.match(r'^\d', ingredient):  # Începe cu cifră
            has_ingredient_quantity = True
        elif any(f'{num} {unit}' in ingredient.lower() or f'{num}{unit}' in ingredient.lower() 
                for num in ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
                for unit in ['cup', 'tsp', 'tbsp', 'oz', 'g', 'ml', 'kg', 'lb']):
            has_ingredient_quantity = True
        
        # Elimină texte descriptive fără cantități de ingrediente
        if not has_ingredient_quantity and len(ingredient.split()) > 4:
            # Text lung fără cantitate de ingredient = descriere, nu ingredient
            return ''
        
        # Elimină orice text scurt fără cantitate
        if not has_ingredient_quantity and len(ingredient.split()) <= 4:
            return ''
        
        # Înlocuiește fracții unicode cu text
        ingredient = ingredient.replace('½', '1/2')
        ingredient = ingredient.replace('¼', '1/4')
        ingredient = ingredient.replace('¾', '3/4')
        ingredient = ingredient.replace('⅓', '1/3')
        ingredient = ingredient.replace('⅔', '2/3')
        
        return ingredient


def scrape_recipes_from_file(input_file: str, output_file: str):
    """Citește URL-uri dintr-un fișier și scrie rețetele în formatul txt"""
    scraper = RecipeScraper()
    
    print(f"\n{'='*60}")
    print(f"Recipe Web Scraper")
    print(f"{'='*60}\n")
    
    # Citește URL-urile
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            urls = [line.strip() for line in f if line.strip() and not line.startswith('#')]
    except FileNotFoundError:
        print(f"✗ Fișierul '{input_file}' nu a fost găsit!")
        return
    
    if not urls:
        print(f"✗ Nu s-au găsit URL-uri în '{input_file}'")
        return
    
    print(f"Găsite {len(urls)} URL-uri în fișier\n")
    
    # Extrage rețetele
    recipes = []
    for url in urls:
        recipe = scraper.scrape_recipe(url)
        if recipe:
            recipes.append(recipe)
    
    # Scrie în fișier
    if recipes:
        with open(output_file, 'w', encoding='utf-8') as f:
            for i, recipe in enumerate(recipes):
                if i > 0:
                    f.write('\n')  # Separator între rețete
                f.write(scraper.convert_to_txt_format(recipe))
        
        print(f"\n{'='*60}")
        print(f"✓ {len(recipes)} rețete salvate în '{output_file}'")
        print(f"{'='*60}\n")
        print(f"Pentru a importa în Notion, rulează:")
        print(f"  python import_recipes.py {output_file}")
    else:
        print(f"\n✗ Nu s-au putut extrage rețete")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Utilizare:")
        print("  python scrape_recipes.py <fisier_urls.txt> [output.txt]")
        print("\nExemplu:")
        print("  python scrape_recipes.py recipe_urls.txt scraped_recipes.txt")
        print("\nFișierul cu URL-uri trebuie să conțină un URL per linie:")
        print("  https://example.com/recipe1")
        print("  https://example.com/recipe2")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else 'scraped_recipes.txt'
    
    scrape_recipes_from_file(input_file, output_file)
