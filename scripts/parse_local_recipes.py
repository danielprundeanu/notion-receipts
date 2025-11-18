"""
Script pentru parsarea rețetelor din fișiere text locale (copy-paste din PDF-uri, documente etc.)
Convertește în formatul txt pentru import în Notion folosind import_recipes.py

Suportă diverse formate:
- Rețete cu secțiuni "Ingrediente:" și "Mod de preparare:"
- Liste cu bullet points (-, *, •)
- Format liber cu separatori
"""

import re
import sys
from typing import Dict, List, Optional
from fractions import Fraction


class LocalRecipeParser:
    def __init__(self):
        self.current_recipe = None
        self.recipes = []
    
    def parse_file(self, filepath: str) -> List[Dict]:
        """Parsează fișierul cu rețete"""
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Încearcă să împartă în rețete multiple (separate prin linii goale sau separatori)
        # Pattern: linie cu "----" (4+ liniuțe) sau "===" sau 3+ linii goale
        recipe_blocks = re.split(r'\n\s*-{4,}\s*\n|\n\s*={3,}\s*\n|\n\s*\n\s*\n\s*\n+', content)
        
        print(f"\n{'='*60}")
        print(f"Local Recipe Parser")
        print(f"{'='*60}\n")
        print(f"Găsite {len(recipe_blocks)} blocuri potențiale de rețete\n")
        
        for block in recipe_blocks:
            if not block.strip():
                continue
            
            recipe = self._parse_recipe_block(block.strip())
            if recipe:
                self.recipes.append(recipe)
        
        return self.recipes
    
    def _parse_recipe_block(self, block: str) -> Optional[Dict]:
        """Parsează un bloc de rețetă"""
        lines = [l.strip() for l in block.split('\n')]
        
        # Prima linie non-goală = titlu
        title = None
        start_idx = 0
        for i, line in enumerate(lines):
            if line:
                title = self._clean_title(line)
                start_idx = i + 1
                break
        
        if not title:
            return None
        
        print(f"\n{'─'*60}")
        print(f"Procesez: {title}")
        print(f"{'─'*60}")
        
        # Structura rețetei
        recipe = {
            'name': title,
            'servings': None,
            'time': None,
            'difficulty': 'Easy',
            'category': None,
            'favorite': False,
            'link': None,
            'slices': None,  # Slice / Receipe
            'description': [],
            'ingredient_groups': [],
            'instructions': [],
            'image_path': None
        }
        
        # Parsează conținutul
        current_section = None
        ingredient_groups = []  # Lista de grupuri
        current_group_name = None
        current_ingredients = []
        current_instructions = []
        
        for line in lines[start_idx:]:
            if not line:
                continue
            
            # Detectează secțiuni
            line_lower = line.lower()
            
            # Servings / Porții
            if re.search(r'(servings?|por[țt]ii|yields?)', line_lower):
                match = re.search(r'(\d+)', line)
                if match:
                    recipe['servings'] = int(match.group(1))
                    print(f"  ℹ Servings găsite: {recipe['servings']}")
                continue
            
            # Link / URL
            if re.search(r'^(link|url)\s*:', line_lower):
                link_match = re.search(r'(?:link|url)\s*:\s*(.+)', line, re.I)
                if link_match:
                    recipe['link'] = link_match.group(1).strip()
                    print(f"  ℹ Link găsit: {recipe['link'][:50]}...")
                continue
            
            # Slice / Receipe (număr de felii/porții)
            if re.search(r'slice\s*/\s*receipe\s*:', line_lower):
                match = re.search(r'(\d+)', line)
                if match:
                    recipe['slices'] = int(match.group(1))
                    print(f"  ℹ Slices găsite: {recipe['slices']}")
                continue
            
            # Timpul
            if re.search(r'(timp|time|durat)', line_lower):
                # Caută ore și minute
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
                        print(f"  ℹ Timp găsit: {total} minute")
                continue
            
            # Secțiune Ingrediente
            if re.search(r'^(ingredient[e]?s?|ingrediente)[\s:]*$', line_lower):
                current_section = 'ingredients'
                print(f"  ✓ Secțiune Ingrediente găsită")
                continue
            
            # Secțiune Instrucțiuni - verifică ÎNAINTE de subsecțiuni ingrediente
            if re.search(r'^(instructions?|mod[ul]*\s+de\s+preparare|preparare|steps?|method|pa[șs]i)[\s:]*$', line_lower):
                # Salvează ultimul grup de ingrediente
                if current_ingredients:
                    ingredient_groups.append({
                        'name': current_group_name or '1',
                        'items': current_ingredients
                    })
                    current_ingredients = []
                
                current_section = 'instructions'
                print(f"  ✓ Secțiune Instrucțiuni găsită")
                continue
            
            # Subsecțiune ingrediente (ex: "Pentru marinadă:", "Pentru sos:")
            if current_section == 'ingredients' and line.endswith(':') and len(line.split()) <= 4:
                # Salvează grupul anterior dacă există
                if current_ingredients:
                    ingredient_groups.append({
                        'name': current_group_name or '1',
                        'items': current_ingredients
                    })
                    current_ingredients = []
                
                current_group_name = line.rstrip(':')
                print(f"  ℹ Grup ingrediente: {current_group_name}")
                continue
            
            # Procesează linia în funcție de secțiune
            if current_section == 'ingredients':
                # Skip linii care nu arată ca ingrediente (descrieri, titluri, etc.)
                if not self._looks_like_ingredient(line):
                    continue
                    
                ingredient = self._parse_ingredient_line(line)
                if ingredient:
                    current_ingredients.append(ingredient)
            
            elif current_section == 'instructions':
                instruction = self._parse_instruction_line(line)
                if instruction:
                    current_instructions.append(instruction)
            
            else:
                # Încă nu am detectat secțiune - încearcă autodetecție
                # Dacă arată ca ingredient (are cantitate + unitate)
                if self._looks_like_ingredient(line):
                    if not current_section:
                        current_section = 'ingredients'
                        print(f"  ℹ Auto-detectat secțiune Ingrediente")
                    ingredient = self._parse_ingredient_line(line)
                    if ingredient:
                        current_ingredients.append(ingredient)
                
                # Dacă arată ca instrucțiune (începe cu număr sau verb)
                elif self._looks_like_instruction(line):
                    if not current_section:
                        current_section = 'instructions'
                        print(f"  ℹ Auto-detectat secțiune Instrucțiuni")
                    instruction = self._parse_instruction_line(line)
                    if instruction:
                        current_instructions.append(instruction)
                
                # Altfel, dacă nu suntem în nicio secțiune, e probabil descriere
                elif not current_section and len(line) > 20:
                    recipe['description'].append(line)
        
        # Adaugă ultimul grup de ingrediente dacă mai sunt
        if current_ingredients:
            ingredient_groups.append({
                'name': current_group_name or '1',
                'items': current_ingredients
            })
        
        # Adaugă toate grupurile la rețetă
        if ingredient_groups:
            recipe['ingredient_groups'] = ingredient_groups
            total_ingredients = sum(len(g['items']) for g in ingredient_groups)
            print(f"  ✓ {total_ingredients} ingrediente găsite ({len(ingredient_groups)} grupuri)")
        
        if current_instructions:
            recipe['instructions'] = current_instructions
            print(f"  ✓ {len(current_instructions)} instrucțiuni găsite")
        
        if recipe['description']:
            print(f"  ✓ {len(recipe['description'])} paragrafe de descriere găsite")
        
        # Validare
        if not ingredient_groups:
            print(f"  ⚠ Niciun ingredient găsit - rețeta ignorată")
            return None
        
        return recipe
    
    def _clean_title(self, title: str) -> str:
        """Curăță titlul rețetei"""
        # Elimină bullet points, numere, etc.
        title = re.sub(r'^[\d.\-–•*]+\s*', '', title)
        title = title.strip()
        return title
    
    def _looks_like_ingredient(self, line: str) -> bool:
        """Verifică dacă linia arată ca un ingredient"""
        # Elimină bullet points
        clean_line = re.sub(r'^[\-–•*]\s*', '', line)
        
        # Verifică dacă începe cu cantitate (număr, fracție)
        if re.match(r'^\d+(?:[.,]\d+)?(?:\s*[/-]\s*\d+)?', clean_line):
            return True
        
        # Verifică dacă conține unități de măsură
        if re.search(r'\b\d+\s*(?:g|kg|ml|l|cup|tsp|tbsp|oz|lb|buc|lingur|lingurit)', clean_line, re.I):
            return True
        
        return False
    
    def _looks_like_instruction(self, line: str) -> bool:
        """Verifică dacă linia arată ca o instrucțiune"""
        # Începe cu număr urmat de punct sau paranteză
        if re.match(r'^\d+[\.)]\s+', line):
            return True
        
        # Începe cu verb de acțiune
        action_verbs = r'^(ad[aă]ug|ame?stec|fierb|pr[aă]je|t[aă]ia|pun|las|ia|coc|inc[aă]lz|curat|spal|amesteca|pune|fierbe|las[aă]|ia[uă]|add|mix|cook|heat|place|combine|stir|pour|bring|simmer|serve)'
        if re.search(action_verbs, line, re.I):
            return True
        
        return False
    
    def _parse_ingredient_line(self, line: str) -> Optional[str]:
        """Parsează o linie de ingredient"""
        # Elimină bullet points
        line = re.sub(r'^[\-–•*]\s*', '', line).strip()
        
        if not line or len(line) < 3:
            return None
        
        # Dacă linia e doar un separator sau titlu de grup
        if line.endswith(':') or re.match(r'^[A-Z\s]+:?$', line):
            return None
        
        return line
    
    def _parse_instruction_line(self, line: str) -> Optional[str]:
        """Parsează o linie de instrucțiune"""
        # Elimină bullet points și numerotare
        line = re.sub(r'^[\-–•*]\s*', '', line)
        line = re.sub(r'^\d+[\.)]\s*', '', line).strip()
        
        if not line or len(line) < 10:
            return None
        
        return line
    
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
        
        # Pattern pentru cantități
        units = r'(?:cups?|tsps?|teaspoons?|tbsps?|tablespoons?|ozs?|ounces?|grams?|kgs?|mls?|liters?|lbs?|pounds?|g|ml|l|kg|buc|lingur[ia]?|lingurit[ae]?)\b'
        pattern = rf'^(\d+\s+\d+/\d+|\d+/\d+|\d+(?:[.,]\d+)?)\s*({units})?\s*'
        match = re.match(pattern, ingredient.strip(), re.IGNORECASE)
        
        if not match:
            return ingredient
        
        quantity_str = match.group(1).strip().replace(',', '.')
        unit = match.group(2) if match.group(2) else ''
        rest_of_ingredient = ingredient[match.end():].strip()
        
        try:
            # Parsează cantitatea
            if '/' in quantity_str:
                parts = quantity_str.split()
                if len(parts) == 2:
                    whole = int(parts[0])
                    frac = Fraction(parts[1])
                    quantity = whole + frac
                else:
                    quantity = Fraction(quantity_str)
            else:
                quantity = float(quantity_str)
            
            # Împarte la numărul de porții
            normalized = quantity / servings
            
            if normalized == 0:
                return ingredient
            
            quantity_formatted = f"{normalized:.2f}".rstrip('0').rstrip('.')
            
            if unit:
                return f"{quantity_formatted} {unit} {rest_of_ingredient}".strip()
            else:
                return f"{quantity_formatted} {rest_of_ingredient}".strip()
                
        except (ValueError, ZeroDivisionError):
            return ingredient
    
    def convert_to_txt_format(self, recipe: Dict) -> str:
        """Convertește rețeta în formatul txt pentru import"""
        lines = []
        
        # Header
        lines.append(f"=== {recipe['name']} ===")
        
        # Servings
        original_servings = recipe.get('servings', 1)
        lines.append(f"Servings: {original_servings}")
        
        if recipe.get('time'):
            lines.append(f"Time: {recipe['time']}")
        
        lines.append(f"Difficulty: {recipe.get('difficulty', 'Easy')}")
        
        if recipe.get('category'):
            lines.append(f"Category: {recipe['category']}")
        
        lines.append(f"Favorite: {'Yes' if recipe.get('favorite') else 'No'}")
        
        # Slices (dacă există)
        if recipe.get('slices'):
            lines.append(f"Slices: {recipe['slices']}")
        
        # Link (URL)
        if recipe.get('link'):
            lines.append(f"Link: {recipe['link']}")
        
        lines.append("")
        
        # Descriere (dacă există) - ÎNAINTE de ingrediente
        if recipe.get('description'):
            for para in recipe['description']:
                lines.append(para)
            lines.append("")
        
        # Ingrediente - grupate
        for group_idx, group in enumerate(recipe['ingredient_groups'], 1):
            lines.append(f"[{group_idx}]")
            
            if group.get('name') and group['name'] != str(group_idx):
                lines.append(f"# {group['name']}")
            
            for ingredient in group.get('items', []):
                normalized = self._normalize_quantity(ingredient, original_servings or 1)
                lines.append(normalized)
            
            lines.append("")
        
        # Instrucțiuni
        if recipe.get('instructions'):
            lines.append("Method:")
            for i, step in enumerate(recipe['instructions'], 1):
                lines.append(f"{i}. {step}")
            lines.append("")
        
        lines.append("")
        
        return '\n'.join(lines)


def parse_local_recipes(input_file: str, output_file: str):
    """Parsează rețete din fișier text local"""
    parser = LocalRecipeParser()
    
    try:
        recipes = parser.parse_file(input_file)
        
        if not recipes:
            print(f"\n✗ Nu s-au găsit rețete valide în '{input_file}'")
            print(f"\nVerifică că fișierul conține:")
            print(f"  - Titlu rețetă pe prima linie")
            print(f"  - Secțiune 'Ingrediente:' sau liste cu cantități")
            print(f"  - Secțiune 'Mod de preparare:' sau pași numerotați")
            return
        
        # Scrie în fișier
        with open(output_file, 'w', encoding='utf-8') as f:
            for i, recipe in enumerate(recipes):
                if i > 0:
                    f.write('\n')
                f.write(parser.convert_to_txt_format(recipe))
        
        print(f"\n{'='*60}")
        print(f"✓ {len(recipes)} rețete salvate în '{output_file}'")
        print(f"{'='*60}\n")
        print(f"Pentru a importa în Notion, rulează:")
        print(f"  python import_recipes.py {output_file}")
        
    except FileNotFoundError:
        print(f"✗ Fișierul '{input_file}' nu a fost găsit!")
    except Exception as e:
        print(f"✗ Eroare la procesare: {e}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Utilizare:")
        print("  python parse_local_recipes.py <fisier_input.txt> [output.txt]")
        print("\nExemplu:")
        print("  python parse_local_recipes.py my_recipes.txt parsed_recipes.txt")
        print("\nFormatul fișierului de input:")
        print("  - O sau mai multe rețete separate prin linii goale")
        print("  - Fiecare rețetă cu titlu, ingrediente și pași")
        print("  - Suportă diverse formate (cu/fără sectiuni 'Ingrediente:', 'Mod de preparare:')")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else 'parsed_recipes.txt'
    
    parse_local_recipes(input_file, output_file)
