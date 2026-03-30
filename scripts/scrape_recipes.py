"""
Script pentru extragerea rețetelor de pe website-uri și convertirea lor în format txt
pentru import în Notion folosind import_recipes.py

Suportă:
- Schema.org Recipe markup (JSON-LD)
- Parsare HTML generică
- Multiple URL-uri dintr-un fișier
- Traducere automată din română în engleză
"""

import requests
from bs4 import BeautifulSoup
import json
import re
import sqlite3
from difflib import SequenceMatcher
from typing import Dict, List, Optional
from fractions import Fraction
import sys
import os
from urllib.parse import urlparse
import hashlib
from ingredient_processor import get_ingredient_processor
from deep_translator import GoogleTranslator


class RecipeScraper:
    def __init__(self):
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
        self.ingredient_processor = get_ingredient_processor(use_notion=True)
        self.translator = GoogleTranslator(source='ro', target='en')
        self.image_dir = 'img'  # Default, poate fi suprascris
    
    def _translate_text(self, text: str) -> str:
        """Traduce text din română în engleză"""
        if not text or not text.strip():
            return text
        
        try:
            # Verifică dacă textul este deja în engleză (conține mai mult de 50% cuvinte englezești)
            words = text.lower().split()
            english_indicators = ['the', 'and', 'or', 'with', 'for', 'to', 'of', 'in', 'on', 'at']
            english_word_count = sum(1 for word in words if word in english_indicators)
            
            # Dacă mai mult de 30% sunt cuvinte englezești, nu traduce
            if len(words) > 0 and (english_word_count / len(words)) > 0.3:
                return text
            
            # Traduce textul
            translated = self.translator.translate(text)
            return translated if translated else text
        except Exception as e:
            print(f"  ⚠ Eroare la traducere: {e}")
            return text
    
    def _translate_ingredient_line(self, line: str) -> str:
        """
        Traduce doar numele ingredientului dintr-o linie, păstrând cantitatea și unitatea în engleză.
        Exemplu: "500 g făină" → "500 g flour"
        """
        if not line or not line.strip():
            return line
        
        # Pattern pentru a identifica cantitate + unitate la început
        # Exemplu: "500 g", "2 cani", "1 lingura", etc.
        pattern = r'^(\d+(?:\.\d+)?\s*(?:g|kg|ml|l|cup|cups|tsp|tbsp|teaspoon|teaspoons|tablespoon|tablespoons|oz|lb|pint|pints|handful|handfuls|lingura|linguri|lingurita|lingurite|cana|cani|bucata|bucati)?)\s+(.+)$'
        match = re.match(pattern, line, re.I)
        
        if match:
            quantity_unit = match.group(1)  # Ex: "500 g" sau "2 linguri"
            ingredient_name = match.group(2)  # Ex: "făină"
            
            # Traduce unitățile românești la engleză și normalizează totul
            quantity_unit_en = quantity_unit.lower()
            
            # Traduce unitățile românești
            quantity_unit_en = re.sub(r'\blingura\b', 'tbsp', quantity_unit_en)
            quantity_unit_en = re.sub(r'\blinguri\b', 'tbsp', quantity_unit_en)
            quantity_unit_en = re.sub(r'\blingurita\b', 'tsp', quantity_unit_en)
            quantity_unit_en = re.sub(r'\blingurite\b', 'tsp', quantity_unit_en)
            quantity_unit_en = re.sub(r'\bcana\b', 'cup', quantity_unit_en)
            quantity_unit_en = re.sub(r'\bcani\b', 'cup', quantity_unit_en)
            quantity_unit_en = re.sub(r'\bbucata\b', 'piece', quantity_unit_en)
            quantity_unit_en = re.sub(r'\bbucati\b', 'piece', quantity_unit_en)
            
            # Normalizează toate unitățile englezești la forma scurtă/singular cu litere mici
            quantity_unit_en = re.sub(r'\bcups?\b', 'cup', quantity_unit_en)
            quantity_unit_en = re.sub(r'\btablespoons?\b', 'tbsp', quantity_unit_en)
            quantity_unit_en = re.sub(r'\bteaspoons?\b', 'tsp', quantity_unit_en)
            quantity_unit_en = re.sub(r'\bounces?\b', 'oz', quantity_unit_en)
            quantity_unit_en = re.sub(r'\bpounds?\b', 'lb', quantity_unit_en)
            quantity_unit_en = re.sub(r'\bpints?\b', 'pint', quantity_unit_en)
            quantity_unit_en = re.sub(r'\bpieces?\b', 'piece', quantity_unit_en)
            quantity_unit_en = re.sub(r'\bhandfuls?\b', 'handful', quantity_unit_en)
            quantity_unit_en = re.sub(r'\bgrams?\b', 'g', quantity_unit_en)
            quantity_unit_en = re.sub(r'\bkilograms?\b', 'kg', quantity_unit_en)
            quantity_unit_en = re.sub(r'\bmilliliters?\b', 'ml', quantity_unit_en)
            quantity_unit_en = re.sub(r'\bliters?\b', 'l', quantity_unit_en)
            
            # Traduce doar numele ingredientului
            ingredient_name_en = self._translate_text(ingredient_name)
            # Elimină caractere Unicode invizibile introduse de traducere
            ingredient_name_en = re.sub(r'[\u200b\u200c\u200d\ufeff\u00ad]', '', ingredient_name_en)
            ingredient_name_en = re.sub(r'\s+', ' ', ingredient_name_en).strip()

            return f"{quantity_unit_en} {ingredient_name_en}"
        else:
            # Dacă nu e în format cantitate+unitate, traduce tot
            translated = self._translate_text(line)
            translated = re.sub(r'[\u200b\u200c\u200d\ufeff\u00ad]', '', translated)
            return re.sub(r'\s+', ' ', translated).strip()
    
    def _normalize_units_in_text(self, text: str) -> str:
        """
        Normalizează toate unitățile de măsură dintr-un text la formă scurtă/singular cu litere mici.
        Exemplu: "2 tablespoons" → "2 tbsp", "3 cups" → "3 cup"
        """
        # Normalizează toate unitățile la forma scurtă/singular cu litere mici
        text = re.sub(r'\bcups?\b', 'cup', text, flags=re.I)
        text = re.sub(r'\btablespoons?\b', 'tbsp', text, flags=re.I)
        text = re.sub(r'\bteaspoons?\b', 'tsp', text, flags=re.I)
        text = re.sub(r'\bounces?\b', 'oz', text, flags=re.I)
        text = re.sub(r'\bpounds?\b', 'lb', text, flags=re.I)
        text = re.sub(r'\bpints?\b', 'pint', text, flags=re.I)
        text = re.sub(r'\bpieces?\b', 'piece', text, flags=re.I)
        text = re.sub(r'\bhandfuls?\b', 'handful', text, flags=re.I)
        text = re.sub(r'\bgrams?\b', 'g', text, flags=re.I)
        text = re.sub(r'\bkilograms?\b', 'kg', text, flags=re.I)
        text = re.sub(r'\bmilliliters?\b', 'ml', text, flags=re.I)
        text = re.sub(r'\bliters?\b', 'l', text, flags=re.I)
        text = re.sub(r'\btbsp\b', 'tbsp', text, flags=re.I)  # Normalizează și majusculele (Tbsp → tbsp)
        text = re.sub(r'\btsp\b', 'tsp', text, flags=re.I)
        return text
    
    def _is_local_file(self, path: str) -> bool:
        """Verifică dacă path-ul este un fișier local"""
        return os.path.isfile(path)
    
    def _parse_local_file(self, filepath: str) -> Optional[Dict]:
        """Parsează rețetă din fișier text local (același format ca parse_local_recipes.py)"""
        print(f"\n{'='*60}")
        print(f"Procesez fișier local: {filepath}")
        print(f"{'='*60}\n")
        
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception as e:
            print(f"  ✗ Eroare la citire fișier: {e}")
            return None
        
        lines = [l.strip() for l in content.split('\n')]
        
        # Prima linie non-goală = titlu
        title = None
        start_idx = 0
        for i, line in enumerate(lines):
            if line:
                title = re.sub(r'^[\d.\-–•*]+\s*', '', line).strip()
                start_idx = i + 1
                break
        
        if not title:
            print("  ✗ Nu s-a găsit titlu")
            return None
        
        print(f"  📝 Titlu: {title}")
        
        recipe = {
            'name': title,
            'servings': None,
            'time': None,
            'difficulty': 'Easy',
            'category': None,
            'favorite': False,
            'link': None,
            'slices': None,
            'description': [],
            'ingredient_groups': [],
            'instructions': [],
            'image_url': None,
            'extra_sections': []  # Pentru secțiuni extra cu #
        }
        
        current_section = None
        current_group_name = None
        current_ingredients = []
        current_instructions = []
        current_description = []
        current_extra_section = None
        current_extra_content = []
        
        for line in lines[start_idx:]:
            if not line:
                continue
            
            line_lower = line.lower()
            
            # Detectează secțiuni cu # (# Ingredients, # Steps, # Description, etc.)
            if line.startswith('#'):
                # Salvează secțiunea anterioară
                if current_section == 'extra' and current_extra_section and current_extra_content:
                    recipe['extra_sections'].append({
                        'title': current_extra_section,
                        'content': current_extra_content
                    })
                    current_extra_content = []
                
                section_title = line.lstrip('#').strip().rstrip(':')
                section_lower = section_title.lower()
                
                # Verifică tip secțiune
                if re.search(r'(ingredient|ingrediente)', section_lower):
                    if current_ingredients:
                        recipe['ingredient_groups'].append({
                            'name': current_group_name or None,
                            'items': current_ingredients
                        })
                        current_ingredients = []
                    current_section = 'ingredients'
                    print(f"  ✓ Secțiune: {section_title}")
                
                elif re.search(r'(step|method|preparare|mod de preparare|instructions|directions)', section_lower):
                    if current_ingredients:
                        recipe['ingredient_groups'].append({
                            'name': current_group_name or None,
                            'items': current_ingredients
                        })
                        current_ingredients = []
                    if current_description:
                        recipe['description'] = current_description
                        current_description = []
                    current_section = 'instructions'
                    print(f"  ✓ Secțiune: {section_title}")
                
                elif re.search(r'(description|descriere)', section_lower):
                    if current_ingredients:
                        recipe['ingredient_groups'].append({
                            'name': current_group_name or None,
                            'items': current_ingredients
                        })
                        current_ingredients = []
                    current_section = 'description'
                    print(f"  ✓ Secțiune: {section_title}")
                
                else:
                    # Altă secțiune (ex: # Serve, # Tips, etc.)
                    if current_ingredients:
                        recipe['ingredient_groups'].append({
                            'name': current_group_name or None,
                            'items': current_ingredients
                        })
                        current_ingredients = []
                    if current_description:
                        recipe['description'] = current_description
                        current_description = []
                    current_section = 'extra'
                    # Nu traduce titlul secțiunii extra - păstrează-l în limba originală
                    current_extra_section = section_title
                    print(f"  ✓ Secțiune extra: {current_extra_section}")
                
                continue
            
            # Servings
            if re.search(r'(servings?|por[țt]ii|yields?)\s*:', line_lower):
                match = re.search(r'(\d+)', line)
                if match:
                    recipe['servings'] = int(match.group(1))
                    print(f"  ℹ Servings: {recipe['servings']}")
                continue
            
            # Link
            if line_lower.startswith('link:'):
                link_match = re.search(r'link\s*:\s*(.+)', line, re.I)
                if link_match:
                    recipe['link'] = link_match.group(1).strip()
                    print(f"  ℹ Link: {recipe['link'][:60]}...")
                continue
            
            # Slices / Receipe
            if re.search(r'slice\s*/\s*receipe\s*:', line_lower):
                match = re.search(r'(\d+)', line)
                if match:
                    recipe['slices'] = int(match.group(1))
                    print(f"  ℹ Slices: {recipe['slices']}")
                continue
            
            # Time
            if re.search(r'(prep time|cook time|total time|timp|time|durat)\s*:', line_lower):
                hours = re.search(r'(\d+)\s*(?:h|ore|ora|hour)', line, re.I)
                minutes = re.search(r'(\d+)\s*(?:m|min|minute)', line, re.I)
                
                if hours or minutes:
                    total = 0
                    if hours:
                        total += int(hours.group(1)) * 60
                    if minutes:
                        total += int(minutes.group(1))
                    if total > 0:
                        recipe['time'] = total
                        print(f"  ℹ Time: {total} min")
                continue
            
            # Procesare pe baza secțiunii curente
            if current_section == 'ingredients':
                # Curăță bullet points
                clean = re.sub(r'^[\-–•*▢☐□▪◦✓✔︎→◆■●○]\s*', '', line).strip()
                
                # Verifică dacă arată ca ingredient
                if clean and (re.match(r'^\d', clean) or re.search(r'\b\d+', clean) or len(clean.split()) <= 6):
                    # Traduce doar numele ingredientului, păstrează unitățile în engleză
                    ingredient_translated = self._translate_ingredient_line(clean)
                    
                    # Procesează ingredientul pentru a separa adjectivele
                    processed, adjectives = self.ingredient_processor.process_ingredient_line(ingredient_translated)
                    
                    # Dacă am găsit adjective, adaugă-le ca observații după virgulă
                    if adjectives:
                        current_ingredients.append(f"{processed}, {adjectives}")
                    else:
                        current_ingredients.append(processed)
                continue
            
            elif current_section == 'instructions':
                clean = re.sub(r'^[\d.)\-–•*]\s*', '', line).strip()
                if len(clean) >= 10:
                    # Nu traduce instrucțiunile - păstrează-le în limba originală
                    current_instructions.append(clean)
                continue
            
            elif current_section == 'description':
                if len(line) > 10:
                    # Nu traduce descrierea - păstrează-o în limba originală
                    current_description.append(line)
                continue
            
            elif current_section == 'extra':
                if len(line) > 5:
                    # Nu traduce secțiunile extra - păstrează-le în limba originală
                    current_extra_content.append(line)
                continue
            
            # Auto-detectare (dacă nu suntem în nicio secțiune)
            if not current_section:
                clean = re.sub(r'^[\-–•*]\s*', '', line).strip()
                
                # Arată ca ingredient?
                if re.match(r'^\d', clean) or re.search(r'\b\d+\s*(?:g|kg|ml|l|cup|tsp|tbsp)', clean, re.I):
                    current_section = 'ingredients'
                    print(f"  ℹ Auto-detectat Ingrediente")
                    # Traduce doar numele ingredientului, păstrează unitățile în engleză
                    ingredient_translated = self._translate_ingredient_line(clean)
                    current_ingredients.append(ingredient_translated)
                # Skip linii de metadata
                elif not any(x in line_lower for x in ['nutrition', 'calories', 'prep', 'cook', 'total', 'servings', 'link']):
                    # Presupune că e descriere
                    if len(line) > 20:
                        # Nu traduce descrierea - păstrează-o în limba originală
                        current_description.append(line)
        
        # Salvează ultimele secțiuni
        if current_ingredients:
            recipe['ingredient_groups'].append({
                'name': current_group_name or None,
                'items': current_ingredients
            })
        
        if current_description:
            recipe['description'] = current_description
        
        if current_instructions:
            recipe['instructions'] = current_instructions
        
        if current_section == 'extra' and current_extra_section and current_extra_content:
            recipe['extra_sections'].append({
                'title': current_extra_section,
                'content': current_extra_content
            })
        
        total_ingredients = sum(len(g['items']) for g in recipe['ingredient_groups'])
        print(f"  ✓ {total_ingredients} ingrediente ({len(recipe['ingredient_groups'])} grupuri)")
        print(f"  ✓ {len(recipe['instructions'])} instrucțiuni")
        if recipe['description']:
            print(f"  ✓ {len(recipe['description'])} paragrafe descriere")
        if recipe['extra_sections']:
            print(f"  ✓ {len(recipe['extra_sections'])} secțiuni extra")
        
        if not recipe['ingredient_groups']:
            print(f"  ⚠ Niciun ingredient găsit")
            return None
        
        return recipe
    
    def scrape_recipe(self, url_or_file: str) -> Optional[Dict]:
        """Extrage rețeta de la URL sau din fișier local .txt"""
        # Verifică dacă e fișier local
        if self._is_local_file(url_or_file):
            return self._parse_local_file(url_or_file)
        
        # Altfel, procesează ca URL
        try:
            print(f"\n{'='*60}")
            print(f"Procesez: {url_or_file}")
            print(f"{'='*60}\n")
            
            response = requests.get(url_or_file, headers=self.headers, timeout=10)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.content, 'lxml')
            
            # Încearcă mai întâi să găsească JSON-LD cu schema.org Recipe
            recipe = self._extract_from_jsonld(soup)
            
            if not recipe:
                # Fallback la parsare HTML generică
                print("  ⚠ Nu s-a găsit JSON-LD, încerc parsare HTML generică...")
                recipe = self._extract_from_html(soup)
            
            if recipe:
                recipe['source_url'] = url_or_file
                
                # Normalizează toate unitățile în toate ingredientele
                if 'ingredient_groups' in recipe:
                    for group in recipe['ingredient_groups']:
                        if 'items' in group:
                            group['items'] = [self._normalize_units_in_text(item) for item in group['items']]
                if 'ingredients' in recipe:
                    recipe['ingredients'] = [self._normalize_units_in_text(item) for item in recipe['ingredients']]
                
                # Descarcă imaginea local dacă există URL
                if recipe.get('image_url'):
                    local_path = self._download_image(recipe['image_url'], recipe['name'])
                    if local_path:
                        recipe['image_path'] = local_path
                
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
                            return self._parse_recipe_schema(item, soup)
                elif self._is_recipe_schema(data):
                    return self._parse_recipe_schema(data, soup)
                    
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
    
    def _parse_recipe_schema(self, data: Dict, soup: BeautifulSoup = None) -> Dict:
        """Parsează datele din schema.org Recipe"""
        print("  ✓ Găsit JSON-LD Recipe schema")
        
        # Extrage grupuri de ingrediente (poate avea structură de tip array de obiecte)
        ingredient_groups = self._extract_ingredient_groups_from_schema(data.get('recipeIngredient', []))
        
        # Pentru compatibilitate, creează și o listă plată
        all_ingredients = []
        for group in ingredient_groups:
            all_ingredients.extend(group['items'])
        
        # Extrage servings din JSON-LD
        servings = self._extract_servings(data.get('recipeYield'))
        
        # Dacă nu am găsit servings în JSON-LD, caută în HTML
        if not servings and soup:
            page_text = soup.get_text()
            match = re.search(r'(?:servings?|serves?|yields?|porții|portii|portions?)\s*:?\s*(\d+)', page_text, re.I)
            if match:
                servings = int(match.group(1))
                pos = match.start()
                context = page_text[max(0, pos-25):min(len(page_text), pos+35)].strip()
                print(f"  ℹ Servings from HTML fallback: {servings} (context: '...{context}...')")
        
        recipe = {
            'name': data.get('name', 'Untitled Recipe'),
            'servings': servings,
            'time': self._extract_time(data.get('totalTime') or data.get('cookTime')),
            'difficulty': None,  # De obicei nu e în schema
            'category': self._extract_category(data.get('recipeCategory')),
            'ingredients': all_ingredients,  # Listă plată pentru compatibilitate
            'ingredient_groups': ingredient_groups,  # Grupuri cu nume
            'instructions': self._extract_instructions(data.get('recipeInstructions', [])),
            'image_url': self._extract_image_url(data.get('image'))
        }
        
        # Nu traduce titlul - păstrează-l în limba originală
        # recipe['name'] = self._translate_text(recipe['name'])
        
        # Traduce DOAR ingredientele din fiecare grup (pentru matching cu Notion)
        for group in recipe['ingredient_groups']:
            # Nu traduce numele grupului - păstrează-l în limba originală
            # if group['name']:
            #     group['name'] = self._translate_text(group['name'])
            # Traduce doar numele ingredientului, păstrează unitățile în engleză
            group['items'] = [self._translate_ingredient_line(item) for item in group['items']]
        
        # Normalizează toate unitățile în ingrediente (pentru cazurile când vin direct din HTML fără traducere)
        for group in recipe['ingredient_groups']:
            group['items'] = [self._normalize_units_in_text(item) for item in group['items']]
        
        # Actualizează lista plată de ingrediente
        recipe['ingredients'] = []
        for group in recipe['ingredient_groups']:
            recipe['ingredients'].extend(group['items'])
        
        # NU traduce instrucțiunile - păstrează-le în limba originală
        # Instrucțiunile rămân așa cum sunt din JSON-LD
        # translated_instructions = []
        # for step in recipe['instructions']:
        #     if isinstance(step, dict) and 'text' in step:
        #         step['text'] = self._translate_text(step['text'])
        #         translated_instructions.append(step)
        #     else:
        #         translated_instructions.append(self._translate_text(step))
        # recipe['instructions'] = translated_instructions
        
        total_groups = len(ingredient_groups)
        print(f"  ✓ Titlu: {recipe['name']}")
        print(f"  ✓ Ingrediente: {len(recipe['ingredients'])} ({total_groups} grup{'uri' if total_groups != 1 else ''})")
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
    
    def _download_image(self, image_url: str, recipe_name: str) -> Optional[str]:
        """Descarcă imaginea local și returnează path-ul local"""
        if not image_url:
            return None
        
        try:
            # Creează directorul pentru imagini dacă nu există
            os.makedirs(self.image_dir, exist_ok=True)
            
            # Generează nume de fișier unic bazat pe URL
            url_hash = hashlib.md5(image_url.encode()).hexdigest()[:8]
            
            # Extrage extensia din URL (default .jpg)
            parsed = urlparse(image_url)
            ext = os.path.splitext(parsed.path)[1]
            if not ext or ext not in ['.jpg', '.jpeg', '.png', '.gif', '.webp']:
                ext = '.jpg'
            
            # Creează nume fișier safe din numele rețetei
            safe_name = re.sub(r'[^a-zA-Z0-9\s-]', '', recipe_name)
            safe_name = re.sub(r'\s+', '_', safe_name.strip())
            safe_name = safe_name[:50]  # Limitează lungimea
            
            filename = f"{safe_name}_{url_hash}{ext}"
            filepath = os.path.join(self.image_dir, filename)
            
            # Descarcă imaginea
            print(f"  📥 Descarc imaginea...")
            response = requests.get(image_url, headers=self.headers, timeout=10, stream=True)
            response.raise_for_status()
            
            # Salvează imaginea
            with open(filepath, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            
            print(f"  ✓ Imagine salvată: {filepath}")
            return filepath
            
        except Exception as e:
            print(f"  ⚠ Eroare la descărcarea imaginii: {e}")
            return None
    
    def _extract_servings(self, yield_data) -> Optional[int]:
        """Extrage numărul de porții"""
        if not yield_data:
            return None
        
        if isinstance(yield_data, (int, float)):
            servings = int(yield_data)
            print(f"  ℹ Servings from JSON-LD (numeric): {servings}")
            return servings
        
        if isinstance(yield_data, str):
            # Mai întâi încearcă să găsească pattern "Servings: X" sau "Serves X"
            match = re.search(r'(?:servings?|serves?|yields?|porții)\s*:?\s*(\d+)', yield_data, re.I)
            if match:
                servings = int(match.group(1))
                print(f"  ℹ Servings from JSON-LD (pattern): {servings} (text: '{yield_data}')")
                return servings
            
            # Fallback: caută doar primul număr
            match = re.search(r'\d+', yield_data)
            if match:
                servings = int(match.group())
                print(f"  ℹ Servings from JSON-LD (first number): {servings} (text: '{yield_data}')")
                return servings
        
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
    
    def _extract_ingredient_groups_from_schema(self, ingredients_data) -> List[Dict]:
        """Extrage grupuri de ingrediente din JSON-LD, păstrând numele grupurilor"""
        groups = []
        
        # Cazul 1: Array de obiecte cu structură de grup (ex: {"@type": "HowToSection", "name": "...", "itemListElement": [...]})
        if isinstance(ingredients_data, list) and len(ingredients_data) > 0:
            # Verifică dacă primul element e un dict cu itemListElement (grup structurat)
            if isinstance(ingredients_data[0], dict) and 'itemListElement' in ingredients_data[0]:
                for group_data in ingredients_data:
                    if isinstance(group_data, dict):
                        group_name = group_data.get('name', '').strip()
                        items_data = group_data.get('itemListElement', [])
                        items = self._extract_ingredients(items_data)
                        if items:
                            groups.append({'name': group_name if group_name else None, 'items': items})
                return groups if groups else [{'name': None, 'items': self._extract_ingredients(ingredients_data)}]
        
        # Cazul 2: Array simplu de string-uri (fără grupuri)
        ingredients = self._extract_ingredients(ingredients_data)
        if ingredients:
            return [{'name': None, 'items': ingredients}]
        
        return []
    
    def _extract_ingredients(self, ingredients_data: List) -> List[str]:
        """Extrage lista de ingrediente și separă adjectivele"""
        ingredients = []
        
        for item in ingredients_data:
            if isinstance(item, str):
                ingredient_text = item.strip()
            elif isinstance(item, dict):
                # Uneori ingredientele sunt obiecte
                ingredient_text = item.get('text') or item.get('name') or str(item)
                ingredient_text = ingredient_text.strip()
            else:
                continue
            
            # Elimină caractere speciale de la început (▢, checkboxes, bullets)
            ingredient_text = re.sub(r'^[\-–•*▢☐□▪◦✓✔︎→◆■●○]\s*', '', ingredient_text).strip()
            
            # Procesează ingredientul pentru a separa adjectivele
            processed, adjectives = self.ingredient_processor.process_ingredient_line(ingredient_text)
            
            # Post-procesare: Detectează unități în observații și mută-le în cantitate
            # Ex: "1/4 cherry tomatoes, pint halved" -> "1/4 pint cherry tomatoes, halved"
            if adjectives:
                # Caută unități cunoscute în observații
                unit_pattern = r'\b(pint|pints|cup|cups|tablespoon|tablespoons|teaspoon|teaspoons|tbsp|tsp|oz|lb|pound|pounds)\b'
                unit_match = re.search(unit_pattern, adjectives, re.I)
                
                if unit_match:
                    unit_found = unit_match.group(1)
                    # Șterge unitatea din observații
                    adjectives_cleaned = re.sub(r'\b' + unit_found + r'\b\s*,?\s*', '', adjectives, flags=re.I).strip()
                    adjectives_cleaned = adjectives_cleaned.strip(',').strip()
                    
                    # Adaugă unitatea în cantitate
                    # Ex: processed = "1/4 cherry tomatoes" -> "1/4 pint cherry tomatoes"
                    qty_pattern = r'^(\d+(?:[./]\d+)?)\s+'
                    qty_match = re.match(qty_pattern, processed)
                    if qty_match:
                        qty = qty_match.group(1)
                        rest = processed[qty_match.end():]
                        processed = f"{qty} {unit_found} {rest}".strip()
                    
                    # Actualizează adjectives
                    adjectives = adjectives_cleaned if adjectives_cleaned else None
            
            # Dacă am găsit adjective, adaugă-le ca observații după virgulă
            if adjectives:
                ingredients.append(f"{processed}, {adjectives}")
            else:
                ingredients.append(processed)
        
        return ingredients
    
    def _extract_instructions(self, instructions_data) -> List[str]:
        """Extrage pașii de preparare, păstrând headerele secțiunilor"""
        steps = []
        
        if isinstance(instructions_data, str):
            # Dacă e un singur string, împarte după puncte/newlines
            steps = [s.strip() for s in re.split(r'[.\n]', instructions_data) if s.strip()]
        
        elif isinstance(instructions_data, list):
            for item in instructions_data:
                if isinstance(item, str):
                    # Elimină caractere speciale (checkboxes, bullets, etc.)
                    text = re.sub(r'[\-–•*▢☐□▪◦✓✔︎→◆■●○]', '', item.strip())
                    text = re.sub(r'\s+', ' ', text).strip()
                    # Șterge numerotarea de la început dacă există (ex: "1. " sau "1) ")
                    text = re.sub(r'^\d+[\.\)]\s*', '', text)
                    if text:
                        steps.append(text)
                elif isinstance(item, dict):
                    item_type = item.get('@type', '')
                    
                    # Verifică dacă e secțiune (HowToSection) cu itemListElement
                    if 'itemListElement' in item:
                        # Adaugă numele secțiunii ca header
                        section_name = item.get('name', '').strip()
                        if section_name:
                            steps.append(f"## {section_name}")
                        
                        # Adaugă pașii din secțiune
                        for sub_item in item['itemListElement']:
                            if isinstance(sub_item, dict):
                                sub_text = sub_item.get('text') or sub_item.get('name') or ''
                                if sub_text:
                                    # Elimină caractere speciale (checkboxes, bullets, etc.)
                                    sub_text = re.sub(r'[\-–•*▢☐□▪◦✓✔︎→◆■●○]', '', sub_text.strip())
                                    sub_text = re.sub(r'\s+', ' ', sub_text).strip()
                                    # Șterge numerotarea de la început dacă există
                                    sub_text = re.sub(r'^\d+[\.\)]\s*', '', sub_text)
                                    if sub_text:
                                        steps.append(sub_text)
                            elif isinstance(sub_item, str):
                                # Elimină caractere speciale (checkboxes, bullets, etc.)
                                text = re.sub(r'[\-–•*▢☐□▪◦✓✔︎→◆■●○]', '', sub_item.strip())
                                text = re.sub(r'\s+', ' ', text).strip()
                                # Șterge numerotarea de la început dacă există
                                text = re.sub(r'^\d+[\.\)]\s*', '', text)
                                if text:
                                    steps.append(text)
                    else:
                        # E un pas simplu (HowToStep)
                        text = item.get('text') or item.get('name') or ''
                        if text:
                            # Elimină caractere speciale (checkboxes, bullets, etc.)
                            text = re.sub(r'[\-–•*▢☐□▪◦✓✔︎→◆■●○]', '', text.strip())
                            text = re.sub(r'\s+', ' ', text).strip()
                            # Șterge numerotarea de la început dacă există
                            text = re.sub(r'^\d+[\.\)]\s*', '', text)
                            if text:
                                steps.append(text)
        
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
                # Metodă 1: Caută structura cu h4/h5 nested
                # Găsește toate heading-urile h4, h5, h6 din container
                headings = container.find_all(['h4', 'h5', 'h6'])
                lists = container.find_all(['ul', 'ol'])  # recursive=True implicit
                
                # Dacă avem cel puțin un heading și liste, încearcă să le asociem
                if headings and lists and len(lists) > 1:
                    # Mai multe liste înseamnă grupuri multiple (chiar dacă e un singur heading)
                    # Prima listă după heading devine primul grup
                    # Listele suplimentare devin grupuri fără nume sau cu nume implicit
                    
                    processed_lists = set()
                    
                    # Procesează fiecare heading și lista care urmează
                    for heading in headings:
                        heading_text = heading.get_text().strip()
                        next_ul = heading.find_next(['ul', 'ol'])
                        
                        if current_group['items']:
                            ingredient_groups.append(current_group)
                        
                        current_group = {'name': heading_text, 'items': []}
                        
                        if next_ul and next_ul in lists:
                            processed_lists.add(id(next_ul))
                            for li in next_ul.find_all('li', recursive=False):
                                text = li.get_text().strip()
                                has_quantity = any(char.isdigit() for char in text) or any(unit in text.lower() for unit in ['cup', 'tsp', 'tbsp', 'oz', 'g', 'ml', 'kg', 'pinch', 'handful', 'bunch', 'clove', 'cloves'])
                                
                                if not has_quantity:
                                    continue
                                
                                clean_text = self._clean_ingredient(text)
                                if clean_text and clean_text not in seen_ingredients:
                                    current_group['items'].append(clean_text)
                                    seen_ingredients.add(clean_text)
                    
                    # Salvează grupul curent
                    if current_group['items']:
                        ingredient_groups.append(current_group)
                    
                    # Procesează listele rămase (fără heading)
                    for ul in lists:
                        if id(ul) not in processed_lists:
                            # Creează grup pentru ingredientele principale (fără nume)
                            temp_group = {'name': None, 'items': []}
                            for li in ul.find_all('li', recursive=False):
                                text = li.get_text().strip()
                                has_quantity = any(char.isdigit() for char in text) or any(unit in text.lower() for unit in ['cup', 'tsp', 'tbsp', 'oz', 'g', 'ml', 'kg', 'pinch', 'handful', 'bunch', 'clove', 'cloves'])
                                
                                if not has_quantity:
                                    continue
                                
                                clean_text = self._clean_ingredient(text)
                                if clean_text and clean_text not in seen_ingredients:
                                    temp_group['items'].append(clean_text)
                                    seen_ingredients.add(clean_text)
                            
                            if temp_group['items']:
                                ingredient_groups.append(temp_group)
                    
                    if ingredient_groups:
                        break
                
                # Metodă 2: Fallback - caută h3/h4/h5 ca copii direcți și liste după ele
                for child in container.children:
                    if not hasattr(child, 'name'):
                        continue
                    
                    # Dacă e heading, e separator de grup
                    if child.name in ['h3', 'h4', 'h5', 'h6']:
                        heading_text = child.get_text().strip()
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
                
                # Pattern pentru note/tips: "Word: Description" (de ex: "Panko: The breadcrumbs...")
                # Acestea sunt notițe, nu descrieri ale rețetei
                is_note_pattern = bool(re.match(r'^[A-Z][a-z]+\s*:\s+.+', text))
                
                # Dacă e text lung fără cantități, nu e notă pattern, și nu e deja în descrieri
                if len(text) > 80 and not has_quantity and not is_note_pattern and text not in descriptions:
                    descriptions.append(text)
        
        # Metodă 1: Caută în TOT textul paginii pentru "servings", "portii", etc
        # Pattern flexibil care acceptă și text lipit înainte (ex: "uleiPortii: 3")
        page_text = soup.get_text()
        match = re.search(r'(?:servings?|serves?|yields?|porții|portii|portions?)\s*:?\s*(\d+)', page_text, re.I)
        if match:
            servings = int(match.group(1))
            # Găsește contextul (50 caractere înainte și după)
            pos = match.start()
            context = page_text[max(0, pos-25):min(len(page_text), pos+35)].strip()
            print(f"  ℹ Servings from HTML (full page search): {servings} (context: '...{context}...')")
        
        # Metodă 2: Dacă nu am găsit, caută în elemente specifice
        if not servings:
            for elem in soup.find_all(['span', 'div', 'p', 'li', 'td', 'th']):
                text = elem.get_text().strip()
                # Pattern mai specific: caută "Servings: 6" sau "Serves 4 people" etc.
                if re.search(r'(servings?|serves?|yields?|porții|portii|portions?)', text, re.I):
                    # Încearcă mai întâi pattern specific: "Servings: X" sau "Serves X"
                    match = re.search(r'(?:servings?|serves?|yields?|porții|portii|portions?)\s*:?\s*(\d+)', text, re.I)
                    if match:
                        servings = int(match.group(1))
                        print(f"  ℹ Servings from HTML (pattern match): {servings} (text: '{text[:60]}...')")
                        break
                    # Fallback: caută primul număr după keyword
                    match = re.search(r'(servings?|serves?|yields?|porții|portii|portions?).*?(\d+)', text, re.I)
                    if match:
                        servings = int(match.group(2))
                        print(f"  ℹ Servings from HTML (keyword+number): {servings} (text: '{text[:60]}...')")
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
        notes = []  # Secțiune separată pentru Notes
        seen_instructions = set()
        
        # Metodă 1: Caută containere cu "instruction", "method", "direction" în class/id
        # Include și elemente din accordion/collapse care pot fi ascunse
        for container in soup.find_all(['ol', 'ul', 'div', 'section', 'details', 'article']):
            class_name = ' '.join(container.get('class', [])).lower()
            id_name = container.get('id', '').lower()
            
            if any(word in class_name + id_name for word in ['instruction', 'step', 'preparare', 'mod', 'direction', 'method', 'preparation', 'accordion', 'collapse', 'toggle']):
                # Caută în ordinea copiilor pentru a păstra structura cu headere
                for child in container.find_all(['h4', 'h5', 'h6', 'strong', 'li', 'p'], recursive=True):
                    text = child.get_text().strip()
                    # Elimină caractere speciale (checkboxes, bullets, etc.) de oriunde
                    text = re.sub(r'[\-–•*▢☐□▪◦✓✔︎→◆■●○]', '', text)
                    text = re.sub(r'\s+', ' ', text).strip()
                    
                    # Verifică dacă e heading (scurt, fără verbe multe)
                    is_heading = child.name in ['h4', 'h5', 'h6', 'strong'] or (len(text.split()) <= 6 and not '.' in text)
                    has_action_verb = bool(re.search(r'\b(add|cook|heat|place|combine|mix|stir|pour|bring|simmer|serve|warm|fold|cut|chop|dice|slice|preheat|bake|fry|saute|boil|drain|rinse|prepare|divide|process|blend|whisk)\b', text.lower()))
                    
                    # Exclude linii care par să fie liste de ingrediente opționale (fără verbe active)
                    looks_like_ingredient_list = bool(re.search(r'\btortillas?\b|\bchips?\b|\blettuce\b|\bcheese\b|\bavocado\b|\btoppings?\b', text.lower()))  and not has_action_verb
                    
                    if text and text not in seen_instructions and not looks_like_ingredient_list:
                        # Dacă e heading fără verbe prea multe, adaugă ca secțiune
                        if is_heading and len(text.split()) <= 6 and not text in seen_instructions:
                            instructions.append(f"## {text}")
                            seen_instructions.add(text)
                        # Altfel, dacă e instrucțiune validă
                        elif len(text) > 20 and has_action_verb:
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
                            # Elimină caractere speciale (checkboxes, bullets, etc.) de oriunde
                            text = re.sub(r'[\-–•*▢☐□▪◦✓✔︎→◆■●○]', '', text)
                            text = re.sub(r'\s+', ' ', text).strip()
                            if text and len(text) > 20 and text not in seen_instructions:
                                has_action_verb = bool(re.search(r'\b(add|cook|heat|place|combine|mix|stir|pour|bring|simmer|serve|warm|fold|cut|chop|dice|slice|preheat|bake|fry|saute|boil|drain|rinse|prepare|divide|process|blend|whisk)\b', text.lower()))
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
                    # Elimină caractere speciale (checkboxes, bullets, etc.) de oriunde
                    text = re.sub(r'[\-–•*▢☐□▪◦✓✔︎→◆■●○]', '', text)
                    text = re.sub(r'\s+', ' ', text).strip()
                    if text and len(text) > 20:
                        has_action_verb = bool(re.search(r'\b(add|cook|heat|place|combine|mix|stir|pour|bring|simmer|serve|warm|fold|cut|chop|dice|slice|preheat|bake|fry|saute|boil|drain|rinse|prepare|divide|process|blend|whisk)\b', text.lower()))
                        if has_action_verb:
                            potential_instructions.append(text)
                
                # Dacă cel puțin 2 items au verbe de acțiune, probabil sunt instrucțiuni
                if len(potential_instructions) >= 2:
                    instructions = potential_instructions
                    break
        
        # Caută secțiunea Notes - poate fi după Instructions sau într-o secțiune separată
        for heading in soup.find_all(['h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b']):
            heading_text = heading.get_text().strip().lower()
            if re.search(r'^notes?:?$', heading_text):
                # Găsit heading Notes, caută următorul container cu text
                next_container = heading.find_next(['ul', 'ol', 'div', 'p', 'section'])
                if next_container:
                    # Caută toate paragrafele și list items
                    for elem in next_container.find_all(['li', 'p'], recursive=True):
                        text = elem.get_text().strip()
                        text = re.sub(r'[\-–•*▢☐□▪◦✓✔︎→◆■●○]', '', text)
                        text = re.sub(r'\s+', ' ', text).strip()
                        if text and len(text) > 10 and text not in notes:
                            notes.append(text)
                    if notes:
                        print(f"  ✓ {len(notes)} note găsite")
                        break
        
        # Calculează numărul total de ingrediente
        total_ingredients = sum(len(group['items']) for group in ingredient_groups)
        
        if not title or total_ingredients == 0:
            return None
        
        print(f"  ✓ Parsare HTML: {total_ingredients} ingrediente ({len(ingredient_groups)} grupuri), {len(instructions)} instrucțiuni găsite")
        if notes:
            print(f"  ✓ {len(notes)} note găsite")
        
        # Filtru ÎNAINTE de a adăuga descriptions: Elimină instrucțiuni care nu au verbe de acțiune
        filtered_instructions = []
        for inst in instructions:
            # Păstrează headerele (încep cu ##) DOAR dacă au sens (> 3 cuvinte, nu sunt măsurători)
            if inst.startswith('##'):
                header_text = inst[3:].strip()
                # Elimină headere scurte sau care par ingrediente/note
                is_too_short = len(header_text.split()) <= 2
                looks_like_note = bool(re.search(r'^\w+:?\s*$', header_text))
                has_measurement = bool(re.search(r'\d+(/\d+)?\s*(tsp|tbsp|cup|oz|g|ml|kg|lb)', header_text.lower()))
                
                if not is_too_short and not looks_like_note and not has_measurement:
                    filtered_instructions.append(inst)
                continue
            
            # Pentru instrucțiuni normale, verifică dacă au verbe de acțiune
            has_action_verb = bool(re.search(r'\b(add|cook|heat|place|combine|mix|stir|pour|bring|simmer|serve|warm|fold|cut|chop|dice|slice|preheat|bake|fry|saute|sauté|boil|drain|rinse|blend|process|whisk|season|top|layer|arrange|spread|drizzle|garnish|transfer|remove|divide|toss|prepare)\b', inst.lower()))
            
            # Elimină linii care par să fie liste de ingrediente sau note scurte fără verbe
            looks_like_single_word = bool(re.search(r'^\w+:?\s*$', inst))  # Un singur cuvânt urmat opțional de :
            has_measurement = bool(re.search(r'\d+(/\d+)?\s*(tsp|tbsp|cup|oz|g|ml|kg|lb)', inst.lower()))
            
            # Păstrează liniile cu verbe de acțiune SAU linii lungi (probabil descrieri)
            # Elimină doar linii scurte (<= 6 cuvinte) cu măsurători sau cuvinte singure fără verbe
            if has_action_verb:
                filtered_instructions.append(inst)
            elif not looks_like_single_word and not has_measurement:
                filtered_instructions.append(inst)
        
        instructions = filtered_instructions
        
        # Adaugă descrierile la începutul instrucțiunilor (dacă există) - doar dacă sunt lungi
        if descriptions:
            # Filtru pentru descriptions: doar linii lungi descriptive
            valid_descriptions = [d for d in descriptions if len(d.split()) > 15]
            if valid_descriptions:
                print(f"    + {len(valid_descriptions)} descrieri mutate la Method")
                instructions = valid_descriptions + instructions
        
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
            'notes': notes,  # Adaugă notes
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
        
        # Link (URL) - prioritizează link din fișier, apoi source_url
        if recipe.get('link'):
            lines.append(f"Link: {recipe['link']}")
        elif recipe.get('source_url'):
            lines.append(f"Link: {recipe['source_url']}")
        
        # Slices (dacă există)
        if recipe.get('slices'):
            lines.append(f"Slices: {recipe['slices']}")
        
        # Image (Cover) - salvează path-ul local dacă există
        if recipe.get('image_path'):
            lines.append(f"Image: {recipe['image_path']}")
        elif recipe.get('image_url'):
            lines.append(f"Image: {recipe['image_url']}")
        
        lines.append("")
        
        # Descriere (dacă există) - ÎNAINTE de ingrediente
        if recipe.get('description'):
            if isinstance(recipe['description'], list):
                for para in recipe['description']:
                    lines.append(para)
            else:
                lines.append(recipe['description'])
            lines.append("")
        
        # Ingrediente - grupate cu numele lor sau [1], [2], etc.
        ingredient_groups = recipe.get('ingredient_groups', [])
        seen_ingredients = set()  # Pentru deduplicare globală
        
        # Sortează grupurile: grupurile fără nume (main ingredients) primele, apoi cele cu nume
        groups_without_name = [g for g in ingredient_groups if not g.get('name')]
        groups_with_name = [g for g in ingredient_groups if g.get('name')]
        sorted_groups = groups_without_name + groups_with_name
        
        for group in sorted_groups:
            # Scrie numele grupului cu prefix # pentru compatibilitate cu parse_txt_simple
            group_name = group.get('name') or "Ingredients"
            lines.append(f"# {group_name}")
            
            # Scrie ingredientele din grup - convertește unități apoi normalizează la 1 porție
            for ingredient in group.get('items', []):
                # Mai întâi convertește unitățile nestandard
                converted = self._convert_units(ingredient)
                # Apoi normalizează cantitatea
                normalized = self._normalize_quantity(converted, original_servings or 1)
                
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
            lines.append("# Ingredients")
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
        
        # Adaugă instrucțiunile - formatate cu secțiuni dacă există
        if recipe.get('instructions'):
            lines.append("## Steps:")
            step_number = 1

            for step in recipe['instructions']:
                # Elimină newlines din interior (pot fi adăugate de HTML parsing)
                step = step.replace('\n', ' ').replace('\r', ' ')
                step = re.sub(r'\s+', ' ', step).strip()  # Normalizează spațiile
                # Elimină punct/spații reziduale de la parse (ex: ". Cover..." → "Cover...")
                step = re.sub(r'^[\.\s]+', '', step).strip()

                # Verifică dacă e header de secțiune (începe cu ##)
                if step.startswith('## '):
                    lines.append(step)  # Păstrează prefixul ## pentru parse_txt_simple
                elif step.strip('.').strip():
                    # Adaugă pas normal cu numerotare (sare peste linii goale sau cu doar puncte)
                    lines.append(f"{step_number}. {step}")
                    step_number += 1
            lines.append("")
        
        # Adaugă secțiunea Notes (dacă există) DUPĂ Steps
        if recipe.get('notes'):
            lines.append("## Notes:")
            for note in recipe['notes']:
                # Elimină newlines și normalizează spațiile
                note = note.replace('\n', ' ').replace('\r', ' ')
                note = re.sub(r'\s+', ' ', note).strip()
                lines.append(note)
            lines.append("")
        
        # Adaugă secțiunile extra (# Serve, # Tips, etc.) DUPĂ Notes
        if recipe.get('extra_sections'):
            for section in recipe['extra_sections']:
                section_title = section['title']
                # Skip Notes dacă a fost deja adăugată separat
                if section_title.lower() == 'notes':
                    continue
                lines.append(f"## {section_title}")
                for content_line in section['content']:
                    lines.append(content_line)
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
    
    def _convert_units(self, ingredient: str) -> str:
        """Convertește unitățile nestandard la unitățile disponibile în Notion"""
        # Dacă ingredientul are deja format bracket [quantity unit] ingredient, skip conversie
        if ingredient.strip().startswith('['):
            return ingredient
        
        # Dacă ingredientul are observații în paranteze, extrage-le temporar
        observations = ''
        obs_match = re.search(r'\(([^)]+)\)\s*$', ingredient)
        if obs_match:
            observations = obs_match.group(1)
            ingredient_original = ingredient
            ingredient = ingredient[:obs_match.start()].strip()
        
        # Dicționar de conversii - mapează la unitățile din Notion
        # Notion units: piece, tsp, tbsp, g, slice, handful, pinch, ml, scoop, bottle, cup
        conversions = {
            # Weight conversions to g
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
            
            # Volume conversions to ml
            'liter': ('ml', 1000),
            'liters': ('ml', 1000),
            'l': ('ml', 1000),
            'fl oz': ('ml', 30),
            'fluid ounce': ('ml', 30),
            'fluid ounces': ('ml', 30),
            
            # Pint conversions to cup (1 pint = 2 cups)
            'pint': ('cup', 2),
            'pints': ('cup', 2),
            
            'quart': ('ml', 946),
            'quarts': ('ml', 946),
            'gallon': ('ml', 3785),
            'gallons': ('ml', 3785),
            
            # Note: cup, tsp, tbsp există deja în Notion, nu le convertim
        }
        
        # Creează pattern dinamic pentru unitățile cunoscute
        known_units = '|'.join(re.escape(unit) for unit in conversions.keys())
        
        # Pattern pentru cantități cu unități - include fracții și numere mixte
        # Ex: "2 oz", "1.5 lb", "1 1/2 pint", "500ml" (fără spațiu)
        # Captură doar cantitatea și unitatea cunoscută, restul rămâne în ingredient
        # Include punct opțional după unitate (ex: "lb.")
        pattern = rf'^(\d+\s+\d+/\d+|\d+/\d+|\d+(?:\.\d+)?)\s*({known_units})\.?(?:\s+|$)'
        match = re.match(pattern, ingredient.strip(), re.IGNORECASE)
        
        if not match:
            # Nu are format de convertit, returnează cu observațiile
            if observations:
                return f"{ingredient} ({observations})"
            return ingredient
        
        quantity_str = match.group(1).strip()
        unit_str = match.group(2).strip().lower()
        rest = ingredient[match.end():].strip()
        
        # Verifică dacă unitatea trebuie convertită
        target_unit = None
        conversion_factor = None
        
        # Normalizează unit_str: elimină spații multiple și trimite
        unit_normalized = ' '.join(unit_str.split())
        
        for source_unit, (target, factor) in conversions.items():
            # Match exact sau la început (pentru "fl oz butter" → "fl oz")
            if unit_normalized == source_unit.lower() or unit_normalized.startswith(source_unit.lower() + ' '):
                target_unit = target
                conversion_factor = factor
                break
        
        if not target_unit:
            # Nu trebuie convertit, returnează cu observațiile
            if observations:
                return f"{ingredient} ({observations})"
            return ingredient
        
        # Parsează cantitatea
        try:
            if '/' in quantity_str:
                parts = quantity_str.split()
                if len(parts) == 2:
                    # Număr mixt: "1 1/2"
                    whole = int(parts[0])
                    frac = Fraction(parts[1])
                    quantity = float(whole + frac)
                else:
                    # Doar fracție: "1/2"
                    quantity = float(Fraction(quantity_str))
            else:
                quantity = float(quantity_str)
            
            # Convertește
            converted_qty = quantity * conversion_factor
            
            # Rotunjește inteligent (elimină zerourile finale)
            if converted_qty >= 10:
                # Pentru valori mari, rotunjește la întreg
                qty_formatted = f"{int(round(converted_qty))}"
            else:
                # Pentru valori mici, păstrează precizie
                qty_formatted = f"{converted_qty:.1f}".rstrip('0').rstrip('.')
            
            # Reconstruiește ingredientul cu unitatea convertită (cu spațiu între cantitate și unitate)
            result = f"{qty_formatted} {target_unit} {rest}".strip()
            
            # Adaugă observațiile înapoi (dacă exist)
            if observations:
                result = f"{result} ({observations})"
            
            return result
            
        except (ValueError, ZeroDivisionError):
            # Eroare, returnează original cu observațiile
            if observations:
                return f"{ingredient} ({observations})"
            return ingredient
    
    def _normalize_quantity(self, ingredient: str, servings: int) -> str:
        """Calculează cantitatea ingredientului per porție (împarte la servings) și formatează cu []"""
        # Extrage observațiile din paranteze (dacă există) pentru a le păstra
        observations = ''
        obs_match = re.search(r'\(([^)]+)\)\s*$', ingredient)
        if obs_match:
            observations = obs_match.group(1)
            ingredient = ingredient[:obs_match.start()].strip()
        
        # Mai întâi înlocuim fracțiile unicode cu text normal
        ingredient = ingredient.replace('⁄', '/')
        ingredient = ingredient.replace('½', ' 1/2')
        ingredient = ingredient.replace('¼', ' 1/4')
        ingredient = ingredient.replace('¾', ' 3/4')
        ingredient = ingredient.strip()
        
        # Pattern pentru cantități: range (2-3), fracție cu număr mixt, fracție simplă, număr întreg/zecimal
        # Acceptă: "500g", "500 g", "1/2 cup", "1 1/2 tbsp", "2-3 cloves", "400 of ml. broth"
        # Lookahead (?=\s|,|$) fără IGNORECASE: unitatea trebuie urmată de spațiu/virgulă/EOF
        # Previne matcharea 'g' din 'good', 'ml' din 'mloc' etc.
        units = r'(?:tablespoons?|teaspoons?|tbsps?\.?|cups?|tsps?\.?|ounces?|ozs?|pounds?|lbs?|grams?|kgs?|ml\.?|liters?|g|l)(?=\s|,|$)'
        # Range opțional: "2-3" → luăm media; "400 of ml." → capturăm "of <unit>" ca unitate
        pattern = rf'^(\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?|\d+\s+\d+/\d+|\d+/\d+)\s*(?:of\s+)?({units})?\s*(?:of\s+)?'
        match = re.match(pattern, ingredient.strip(), re.IGNORECASE)
        
        if not match:
            # Dacă nu are cantitate, returnează cu observațiile (dacă există)
            if observations:
                return f"{ingredient} ({observations})"
            return ingredient
        
        quantity_str = match.group(1).strip()
        unit = match.group(2) if match.group(2) else ''
        rest_of_ingredient = ingredient[match.end():].strip()
        
        try:
            # Parsează cantitatea (suportă range, fracții și numere mixte)
            if '-' in quantity_str and not quantity_str.startswith('-'):
                # Range: "2-3" → media
                parts = quantity_str.split('-')
                quantity = (float(parts[0]) + float(parts[1])) / 2
            elif '/' in quantity_str:
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
            
            # Împarte la numărul de porții doar dacă servings > 1
            if servings and servings > 1:
                normalized = quantity / servings
            else:
                normalized = quantity
            
            # Formatează rezultatul ca număr zecimal (nu fracții)
            # Rotunjește la 2 zecimale pentru precizie, elimină zerourile finale
            if normalized == 0:
                if observations:
                    return f"{ingredient} ({observations})"
                return ingredient  # Skip dacă e 0
            
            # Formatează cu 2 zecimale, apoi elimină zerourile finale și punctul dacă e număr întreg
            quantity_formatted = f"{normalized:.2f}".rstrip('0').rstrip('.')
            
            # Curăță rest_of_ingredient - elimină punct/spații și "of" de la început
            rest_of_ingredient = rest_of_ingredient.lstrip('. ')
            rest_of_ingredient = re.sub(r'^of\s+', '', rest_of_ingredient)
            # Dacă unitatea e deja capturată dar a rămas un duplicat (ex: "ml. broth" când unit="ml")
            if unit:
                unit_clean = unit.rstrip('.')
                rest_of_ingredient = re.sub(rf'^{re.escape(unit_clean)}\.?\s*', '', rest_of_ingredient, flags=re.IGNORECASE)
            
            # Reconstruiește ingredientul cu cantitate și unitate între []
            result = ''
            if unit:
                result = f"[{quantity_formatted} {unit}] {rest_of_ingredient}".strip()
            else:
                result = f"[{quantity_formatted}] {rest_of_ingredient}".strip()
            
            # Adaugă observațiile la sfârșit (dacă există)
            if observations:
                result = f"{result} ({observations})"
            
            return result
                
        except (ValueError, ZeroDivisionError):
            # Dacă parsarea eșuează, returnează ingredientul cu observațiile (dacă există)
            if observations:
                return f"{ingredient} ({observations})"
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
        # Pattern: începe cu cifră, cu [qty] bracket, sau are cifră urmată de unitate
        has_ingredient_quantity = False
        if re.match(r'^\d', ingredient):  # Începe cu cifră
            has_ingredient_quantity = True
        elif re.match(r'^\[[\d./ ]+', ingredient):  # Format [qty] sau [qty unit]
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
        
        # Procesează ingredientul pentru a separa adjectivele și descrierile
        processed, descriptions = self.ingredient_processor.process_ingredient_line(ingredient)
        
        # Post-procesare: Detectează unități în observații și mută-le în cantitate
        # Ex: "1/4 cherry tomatoes, pint halved" -> "1/4 pint cherry tomatoes, halved"
        if descriptions:
            # Caută unități cunoscute în observații
            unit_pattern = r'\b(pint|pints|cup|cups|tablespoon|tablespoons|teaspoon|teaspoons|tbsp|tsp|oz|lb|pound|pounds)\b'
            unit_match = re.search(unit_pattern, descriptions, re.I)
            
            if unit_match:
                unit_found = unit_match.group(1)
                # Șterge unitatea din observații
                descriptions_cleaned = re.sub(r'\b' + unit_found + r'\b\s*,?\s*', '', descriptions, flags=re.I).strip()
                descriptions_cleaned = descriptions_cleaned.strip(',').strip()
                
                # Adaugă unitatea în cantitate
                # Ex: processed = "1/4 cherry tomatoes" -> "1/4 pint cherry tomatoes"
                qty_pattern = r'^(\d+(?:[./]\d+)?)\s+'
                qty_match = re.match(qty_pattern, processed)
                if qty_match:
                    qty = qty_match.group(1)
                    rest = processed[qty_match.end():]
                    processed = f"{qty} {unit_found} {rest}".strip()
                
                # Actualizează descriptions
                descriptions = descriptions_cleaned if descriptions_cleaned else None
        
        # Dacă am găsit descrieri, adaugă-le ca observații
        if descriptions:
            return f"{processed}, {descriptions}"
        
        return processed


def _find_local_image(recipe_name: str, img_dir: str) -> Optional[str]:
    """
    Caută în img_dir un fișier al cărui nume (snake_case) este prefix
    al numelui rețetei normalizat.
    Ex: roast_dill_chicken.jpeg  →  "Roast Dill Chicken with courgette..."  ✓
    Ex: beetroot_bunless_burgers.jpeg  →  "Beetroot Bunless Burgers with..."  ✓
    """
    if not os.path.isdir(img_dir):
        return None
    # Normalizează numele rețetei la snake_case
    normalized = re.sub(r'[^a-zA-Z0-9\s]', '', recipe_name)
    normalized = re.sub(r'\s+', '_', normalized.strip()).lower()
    for fname in os.listdir(img_dir):
        base = os.path.splitext(fname)[0].lower()
        # Match exact SAU imaginea e prefix al numelui rețetei
        if normalized == base or normalized.startswith(base + '_'):
            return os.path.join(img_dir, fname)
    return None


def _load_scraper_db_items(db_path: str) -> dict:
    """Încarcă numele GroceryItem din SQLite. Returnează dict lowercase → display name."""
    result = {}
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute('SELECT name FROM "GroceryItem"')
        for (name,) in cursor.fetchall():
            if name:
                result[name.lower()] = name
        conn.close()
    except Exception as e:
        print(f"  ⚠ Eroare la încărcarea DB: {e}")
    return result


def _load_scraper_mappings(path: str) -> tuple[dict, dict]:
    """Încarcă grocery_mappings și obs_mappings din ingredient_mappings.json."""
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data.get('grocery_mappings', {}), data.get('obs_mappings', {})
    except FileNotFoundError:
        return {}, {}
    except Exception as e:
        print(f"  ⚠ Eroare la încărcarea mappings: {e}")
        return {}, {}


def _save_scraper_mappings(path: str, grocery_mappings: dict, obs_mappings: dict = None):
    """Actualizează grocery_mappings (și obs_mappings) în fișierul JSON."""
    try:
        try:
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except FileNotFoundError:
            data = {'grocery_mappings': {}, 'unit_conversions': {'custom_rules': []}, 'auto_create': {}}
        data['grocery_mappings'] = grocery_mappings
        if obs_mappings is not None:
            data['obs_mappings'] = obs_mappings
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"  ⚠ Eroare la salvarea mappings: {e}")



def _fuzzy_score(a: str, b: str) -> float:
    """Calculează scorul de similaritate între două șiruri."""
    ratio = SequenceMatcher(None, a, b).ratio()
    if a in b or b in a:
        return max(ratio, 0.75)
    return ratio


def _find_top_db_matches(name: str, db_items: dict, n: int = 5) -> list:
    """Returnează top N potriviri din db_items ca listă de (score, display_name) sortată descendent."""
    scores = []
    name_lower = name.lower()
    for key, display in db_items.items():
        score = _fuzzy_score(name_lower, key)
        if score > 0.4:
            scores.append((score, display))
    scores.sort(key=lambda x: x[0], reverse=True)
    return scores[:n]


def _resolve_ingredient_names_interactive(recipes: list, db_path: str, mappings_path: str) -> list:
    """Rezolvă interactiv numele de ingrediente necunoscute față de DB, rețetă cu rețetă."""
    db_items = _load_scraper_db_items(db_path)
    grocery_mappings, obs_mappings = _load_scraper_mappings(mappings_path)

    _bracket_re2 = re.compile(r'^\[([^\]]*)\]\s*', re.IGNORECASE)
    _qty_unit_re = re.compile(
        r'^[\d./\s]+\s*(?:cup|cups|tbsp|tsp|g|kg|ml|l|oz|lb|piece|pieces|slice|slices|handful|pint|clove|cloves|can|cans|bunch|bunches|pinch|pinches|sprig|sprigs)?\s*',
        re.IGNORECASE
    )

    def _extract_base_name(item_str: str) -> str:
        s = _bracket_re2.sub('', item_str.strip()).strip()
        s = _qty_unit_re.sub('', s).strip()
        s = s.split(',')[0].strip()
        s = re.sub(r'\(.*?\)', '', s).strip()
        return s.lower()

    def _resolve_name(name: str, recipe_title: str, item_str: str) -> str | None:
        """Returnează canonical name sau None (sare peste). Folosește cache grocery_mappings."""
        # Deja mapat
        if name in grocery_mappings:
            return grocery_mappings[name]

        # Potrivire exactă în DB (case-insensitive)
        if name in db_items:
            return db_items[name]

        top_matches = _find_top_db_matches(name, db_items)

        # Auto-resolve dacă scor >= 0.92
        if top_matches and top_matches[0][0] >= 0.92:
            canonical = top_matches[0][1]
            grocery_mappings[name] = canonical
            _save_scraper_mappings(mappings_path, grocery_mappings, obs_mappings)
            print(f"    ✓ auto: '{name}' → '{canonical}'")
            return canonical

        # Prompt interactiv
        print(f"\n  ┌─────────────────────────────────────────────────────")
        print(f"  │  Rețetă     : {recipe_title}")
        print(f"  │  Ingredient : {item_str.strip()}")
        print(f"  │  Bază       : {name}")
        print(f"  └─────────────────────────────────────────────────────")

        if top_matches:
            for idx, (score, display) in enumerate(top_matches, 1):
                print(f"    [{idx}] {display}  ({int(score * 100)}%)")
        else:
            print("    (fără potriviri în DB)")

        print("    [m] Introdu manual numele din DB")
        print("    [n] Ingredient nou (creează)")
        print("    [s] Sare peste")
        print()

        while True:
            try:
                choice = input("  Alegere: ").strip()
            except (EOFError, KeyboardInterrupt):
                print()
                return None

            choice_lower = choice.lower()

            if choice_lower == 's':
                return None
            elif choice_lower == 'n':
                grocery_mappings[name] = '__new__'
                _save_scraper_mappings(mappings_path, grocery_mappings, obs_mappings)
                return None
            elif choice_lower == 'm':
                try:
                    manual = input("  Nume DB: ").strip()
                    obs = input("  Obs: ").strip()
                except (EOFError, KeyboardInterrupt):
                    print()
                    return None
                if manual:
                    grocery_mappings[name] = manual
                    if obs:
                        obs_mappings[name] = obs
                    _save_scraper_mappings(mappings_path, grocery_mappings, obs_mappings)
                    return manual
            elif choice.isdigit():
                idx = int(choice)
                if 1 <= idx <= len(top_matches):
                    canonical = top_matches[idx - 1][1]
                    grocery_mappings[name] = canonical
                    _save_scraper_mappings(mappings_path, grocery_mappings, obs_mappings)
                    return canonical
                else:
                    print(f"    Alegere invalidă. Introduceți 1-{len(top_matches)}, m, n sau s.")
            else:
                print("    Alegere invalidă. Introduceți un număr, m, n sau s.")

    # Procesează rețetă cu rețetă
    for recipe in recipes:
        recipe_title = recipe.get('name', '?')
        recipe_printed = False

        for group in recipe.get('ingredient_groups', []):
            new_items = []
            for item in group.get('items', []):
                base = _extract_base_name(item)
                if not base:
                    new_items.append(item)
                    continue

                # Verifică rapid dacă e deja cunoscut (fără prompt)
                known = (base in grocery_mappings) or (base in db_items)
                if not known:
                    top = _find_top_db_matches(base, db_items)
                    known = bool(top and top[0][0] >= 0.92)

                if not known and not recipe_printed:
                    print(f"\n{'═' * 58}")
                    print(f"  {recipe_title}")
                    print(f"{'═' * 58}")
                    recipe_printed = True

                canonical = _resolve_name(base, recipe_title, item)
                if canonical and canonical != '__new__':
                    item = re.sub(
                        r'(?i)\b' + re.escape(base) + r'\b',
                        canonical,
                        item,
                        count=1
                    )
                new_items.append(item)
            group['items'] = new_items

    return recipes


def scrape_recipes_from_file(mode: str, input_file: str = None, output_file: str = None):
    """Citește URL-uri sau rețete text și scrie în formatul txt

    Args:
        mode: '-url' pentru web scraping sau '-local' pentru fișiere locale
        input_file: cale custom pentru fișierul de input (opțional)
        output_file: cale custom pentru fișierul de output (opțional)
    """
    scraper = RecipeScraper()

    # Configurare paths în funcție de mod
    if mode == '-url':
        input_file = input_file or 'data/urls/recipe_urls.txt'
        output_file = output_file or 'data/urls/scraped_recipe_urls.txt'
        img_dir = 'data/urls/img'
        mode_name = 'Web URLs'
        is_local = False
    elif mode == '-local':
        input_file = input_file or 'data/local/local_recipes.txt'
        output_file = output_file or 'data/local/scraped_local_recipes.txt'
        img_dir = 'data/local/img'
        mode_name = 'Local Text'
        is_local = True
    else:
        print(f"✗ Mod invalid: {mode}")
        print("Utilizare: notion-scrape -url SAU notion-scrape -local")
        return
    
    # Setează directorul pentru imagini
    scraper.image_dir = img_dir
    
    print(f"\n{'='*60}")
    print(f"Recipe Scraper - {mode_name}")
    print(f"{'='*60}\n")
    
    # Citește conținutul
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            content = f.read()
    except FileNotFoundError:
        print(f"✗ Fișierul '{input_file}' nu a fost găsit!")
        print(f"Creează fișierul și adaugă {'URL-uri (un URL per linie)' if not is_local else 'rețete text'}")
        return
    
    recipes = []
    
    if is_local:
        # Mod local - split în rețete multiple
        # Împarte după separator: ---- (4+ liniuțe) sau === sau 3+ linii goale
        recipe_blocks = re.split(r'(?:^|\n)\s*-{4,}\s*\n|\n\s*={3,}\s*\n|\n(?:\s*\n){5,}', content)
        
        print(f"Găsite {len(recipe_blocks)} blocuri potențiale de rețete\n")
        
        for block_num, block in enumerate(recipe_blocks, 1):
            if not block.strip():
                continue
            
            print(f"\n{'─'*60}")
            print(f"Procesez blocul {block_num}")
            print(f"{'─'*60}")
            
            # Scrie blocul temporar într-un fișier
            temp_file = f"/tmp/recipe_block_{block_num}.txt"
            with open(temp_file, 'w', encoding='utf-8') as f:
                f.write(block.strip())
            
            recipe = scraper._parse_local_file(temp_file)
            if recipe:
                # Caută imagine locală după numele rețetei (snake_case)
                if not recipe.get('image_path') and not recipe.get('image_url'):
                    img_match = _find_local_image(recipe['name'], img_dir)
                    if img_match:
                        recipe['image_path'] = img_match
                        print(f"  🖼  Imagine găsită: {img_match}")
                recipes.append(recipe)
            
            # Șterge fișierul temporar
            os.remove(temp_file)
    else:
        # Mod URL - scrape web
        lines = [line.strip() for line in content.split('\n')]
        urls = [line for line in lines if line and not line.startswith('#') and (line.startswith('http://') or line.startswith('https://'))]
        
        if not urls:
            print(f"✗ Nu s-au găsit URL-uri în '{input_file}'")
            return
        
        print(f"Găsite {len(urls)} URL-uri\n")
        for url in urls:
            recipe = scraper.scrape_recipe(url)
            if recipe:
                recipes.append(recipe)
    
    # Rezolvă interactiv numele de ingrediente necunoscute
    if recipes:
        db_path_for_resolver = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'webapp', 'dev.db')
        if not os.path.isfile(db_path_for_resolver):
            db_path_for_resolver = 'webapp/dev.db'
        mappings_path = 'data/ingredient_mappings.json'
        recipes = _resolve_ingredient_names_interactive(recipes, db_path_for_resolver, mappings_path)

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
        print(f"  notion-import {output_file}")
    else:
        print(f"\n✗ Nu s-au putut extrage rețete")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Utilizare:")
        print("  python scrape_recipes.py -url               # Scrape URL-uri web (default paths)")
        print("  python scrape_recipes.py -local             # Parsează fișiere text locale (default paths)")
        print("  python scrape_recipes.py -url   -i <input> -o <output>")
        print("  python scrape_recipes.py -local -i <input> -o <output>")
        print("\nDefault paths:")
        print("  -url  : data/urls/recipe_urls.txt    → data/urls/scraped_recipe_urls.txt")
        print("  -local: data/local/local_recipes.txt → data/local/scraped_local_recipes.txt")
        print("\nImagini salvate în:")
        print("  data/urls/img/                    (pentru -url)")
        print("  data/local/img/                   (pentru -local)")
        print("\nAmbele moduri folosesc:")
        print("  • Traducere automată română → engleză")
        print("  • Format cu bracket [cantitate unitate]")
        print("  • Normalizare per porție")
        sys.exit(1)

    mode = sys.argv[1]

    if mode not in ['-url', '-local']:
        print(f"✗ Flag invalid: {mode}")
        print("Utilizare: python scrape_recipes.py -url SAU python scrape_recipes.py -local")
        sys.exit(1)

    # Parsare opțională -i / -o
    custom_input = None
    custom_output = None
    argv_rest = sys.argv[2:]
    i = 0
    while i < len(argv_rest):
        if argv_rest[i] in ('-i', '--input') and i + 1 < len(argv_rest):
            custom_input = argv_rest[i + 1]
            i += 2
        elif argv_rest[i] in ('-o', '--output') and i + 1 < len(argv_rest):
            custom_output = argv_rest[i + 1]
            i += 2
        else:
            i += 1

    scrape_recipes_from_file(mode, input_file=custom_input, output_file=custom_output)
