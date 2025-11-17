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
        
        recipe = {
            'name': data.get('name', 'Untitled Recipe'),
            'servings': self._extract_servings(data.get('recipeYield')),
            'time': self._extract_time(data.get('totalTime') or data.get('cookTime')),
            'difficulty': None,  # De obicei nu e în schema
            'category': self._extract_category(data.get('recipeCategory')),
            'ingredients': self._extract_ingredients(data.get('recipeIngredient', [])),
            'instructions': self._extract_instructions(data.get('recipeInstructions', []))
        }
        
        print(f"  ✓ Titlu: {recipe['name']}")
        print(f"  ✓ Ingrediente: {len(recipe['ingredients'])}")
        print(f"  ✓ Pași: {len(recipe['instructions'])}")
        
        return recipe
    
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
        
        # Caută ingrediente în diverse formate
        ingredients = []
        seen_ingredients = set()  # Pentru deduplicare
        
        # Caută liste cu clase specifice
        for container in soup.find_all(['ul', 'ol', 'div']):
            class_name = ' '.join(container.get('class', [])).lower()
            id_name = container.get('id', '').lower()
            
            # Verifică dacă containerul este pentru ingrediente
            if any(word in class_name + id_name for word in ['ingredient', 'ingrediente']):
                # Caută în li sau div
                for item in container.find_all(['li', 'div', 'p']):
                    text = item.get_text().strip()
                    # Curăță ingredientul ÎNAINTE de a-l adăuga
                    clean_text = self._clean_ingredient(text)
                    # Exclude texte goale după curățare și duplicate
                    if clean_text and clean_text not in seen_ingredients:
                        ingredients.append(clean_text)
                        seen_ingredients.add(clean_text)
        
        # Dacă nu am găsit, caută orice listă care arată ca ingrediente
        if not ingredients:
            for ul in soup.find_all(['ul', 'ol']):
                potential_ingredients = []
                for li in ul.find_all('li'):
                    text = li.get_text().strip()
                    # Curăță ingredientul
                    clean_text = self._clean_ingredient(text)
                    # Verifică dacă arată ca un ingredient (conține cifre sau unități) ȘI nu e duplicat
                    if clean_text and clean_text not in seen_ingredients:
                        if any(char.isdigit() for char in clean_text) or any(unit in clean_text.lower() for unit in ['cup', 'tsp', 'tbsp', 'oz', 'g', 'ml', 'kg', 'pinch', 'handful', 'bunch']):
                            potential_ingredients.append(clean_text)
                            seen_ingredients.add(clean_text)
                
                # Dacă am găsit cel puțin 3 ingrediente, le folosim
                if len(potential_ingredients) >= 3:
                    ingredients.extend(potential_ingredients)
                    break
        
        # Caută servings
        servings = None
        for text in soup.find_all(text=re.compile(r'(servings?|serves?|porții)', re.I)):
            match = re.search(r'(\d+)', str(text))
            if match:
                servings = int(match.group(1))
                break
        
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
        
        # Caută instrucțiuni
        instructions = []
        for container in soup.find_all(['ol', 'div']):
            class_name = ' '.join(container.get('class', [])).lower()
            id_name = container.get('id', '').lower()
            
            if any(word in class_name + id_name for word in ['instruction', 'step', 'preparare', 'mod', 'direction']):
                for item in container.find_all(['li', 'p', 'div']):
                    text = item.get_text().strip()
                    if text and len(text) > 10:  # Exclude texte prea scurte
                        instructions.append(text)
        
        if not title or not ingredients:
            return None
        
        print(f"  ✓ Parsare HTML: {len(ingredients)} ingrediente găsite")
        
        return {
            'name': title,
            'servings': servings,
            'time': time_minutes,
            'difficulty': None,
            'category': None,
            'ingredients': ingredients,
            'instructions': instructions
        }
    
    def convert_to_txt_format(self, recipe: Dict) -> str:
        """Convertește rețeta în formatul txt pentru import"""
        lines = []
        
        # Header
        lines.append(f"=== {recipe['name']} ===")
        
        if recipe.get('servings'):
            lines.append(f"Servings: {recipe['servings']}")
        
        if recipe.get('time'):
            lines.append(f"Time: {recipe['time']}")
        
        # Difficulty - default Easy pentru rețete de pe web
        lines.append(f"Difficulty: {recipe.get('difficulty') or 'Easy'}")
        
        # Category - încearcă să mapeze la categoriile din Notion
        category = self._map_category(recipe.get('category'))
        if category:
            lines.append(f"Category: {category}")
        
        lines.append(f"Favorite: No")
        lines.append("")
        
        # Ingrediente - toate în grupul [1]
        lines.append("[1]")
        seen_ingredients = set()  # Pentru deduplicare
        for ingredient in recipe.get('ingredients', []):
            # Dacă ingredientul conține newlines, split-ează și procesează fiecare linie
            if '\n' in ingredient:
                for line in ingredient.split('\n'):
                    clean_line = self._clean_ingredient(line)
                    if clean_line and clean_line not in seen_ingredients:
                        lines.append(clean_line)
                        seen_ingredients.add(clean_line)
            else:
                # Curăță ingredientul
                clean_ingredient = self._clean_ingredient(ingredient)
                if clean_ingredient and clean_ingredient not in seen_ingredients:
                    lines.append(clean_ingredient)
                    seen_ingredients.add(clean_ingredient)
        
        lines.append("")
        lines.append("")
        
        # Adaugă instrucțiunile ca comentariu (nu sunt importate, dar utile pentru referință)
        if recipe.get('instructions'):
            lines.append("# Instrucțiuni (nu sunt importate automat):")
            for i, step in enumerate(recipe['instructions'], 1):
                lines.append(f"# {i}. {step}")
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
        
        # Elimină texte care sunt doar titluri (de ex: "Ingredients:", "For the salsa:")
        if ingredient.endswith(':') and len(ingredient.split()) <= 4:
            return ''
        
        # Elimină duplicate de nume (de ex: "500g beef mince" nu "beef mince")
        # Verifică dacă ingredientul nu este doar un nume fără cantitate
        if not any(char.isdigit() for char in ingredient) and not any(unit in ingredient.lower() for unit in ['pinch', 'handful', 'bunch', 'clove', 'cloves', 'to taste']):
            # Dacă e prea scurt și fără cifre, probabil e duplicat sau titlu
            if len(ingredient.split()) <= 3:
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
