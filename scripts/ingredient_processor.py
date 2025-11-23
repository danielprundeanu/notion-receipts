"""
Helper pentru procesarea ingredientelor - separarea adjectivelor de nume
Folosește lista de grocery items din Notion pentru match-uri inteligente
"""

import os
import re
from typing import Dict, List, Optional, Tuple, Set
from notion_client import Client
from dotenv import load_dotenv


class IngredientProcessor:
    """Procesează ingrediente pentru a separa adjective de numele de bază"""
    
    # Adjective culinare comune (backup când Notion nu ajută)
    COMMON_ADJECTIVES = {
        # Mărime
        'large', 'small', 'medium', 'big', 'tiny', 'mini', 'jumbo',
        # Stare/Prospețime
        'ripe', 'unripe', 'fresh', 'stale', 'raw', 'cooked',
        # Temperatură
        'cold', 'hot', 'warm', 'chilled', 'frozen', 'thawed',
        # Procesare - tăiere
        'whole', 'halved', 'quartered', 'chopped', 'diced', 'sliced', 
        'minced', 'grated', 'shredded', 'crushed', 'ground', 'mashed',
        'peeled', 'unpeeled', 'pitted', 'seeded', 'trimmed', 'cleaned',
        'finely', 'coarsely', 'roughly', 'thinly', 'thickly',
        # Procesare - gătire
        'blanched', 'roasted', 'toasted', 'fried', 'boiled', 'steamed',
        'baked', 'grilled', 'sautéed', 'sauteed', 'poached', 'braised',
        # Procesare - stare
        'freshly', 'newly', 'just',
        # Ambalare
        'canned', 'jarred', 'bottled', 'packaged', 'boxed',
        'dried', 'dehydrated', 'freeze-dried',
        # Calitate
        'organic', 'natural', 'free-range', 'grass-fed', 'wild',
        'extra', 'premium', 'quality', 'good',
        # Procesare lichide
        'squeezed', 'pressed', 'filtered', 'strained',
        # Curățare
        'rinsed', 'drained', 'washed', 'scrubbed',
        # Altele
        'optional', 'additional', 'leftover', 'remaining',
        'dry', 'wet', 'soft', 'hard', 'firm', 'tender',
    }
    
    def __init__(self, use_notion: bool = True):
        """
        Args:
            use_notion: Dacă True, încarcă grocery items din Notion
        """
        self.grocery_items: Set[str] = set()
        self.use_notion = use_notion
        
        if use_notion:
            self._load_grocery_items_from_notion()
    
    def _load_grocery_items_from_notion(self):
        """Încarcă lista de grocery items din Notion pentru match-uri inteligente"""
        try:
            load_dotenv('notion.env')
            notion = Client(auth=os.getenv('NOTION_TOKEN'))
            db_groceries = os.getenv('DB_GROCERIES_ID')
            
            if not db_groceries:
                print("  ⚠ DB_GROCERIES_ID nu este setat - folosesc doar lista de adjective")
                return
            
            # Fetch toate grocery items
            results = notion.databases.query(database_id=db_groceries)
            
            for item in results.get('results', []):
                name_prop = item.get('properties', {}).get('Name', {})
                title = name_prop.get('title', [])
                if title and len(title) > 0:
                    name = title[0].get('text', {}).get('content', '').strip()
                    if name:
                        # Adaugă variante: singular, plural, lowercase
                        self.grocery_items.add(name.lower())
                        # Adaugă și varianta fără 's' final (aproximare plural)
                        if name.lower().endswith('s'):
                            self.grocery_items.add(name.lower()[:-1])
            
            print(f"  ℹ Încărcate {len(self.grocery_items)} grocery items din Notion")
            
        except Exception as e:
            print(f"  ⚠ Nu pot încărca grocery items din Notion: {e}")
            print(f"  ℹ Folosesc doar lista de adjective comune")
    
    def separate_adjectives(self, ingredient_name: str) -> Tuple[str, Optional[str]]:
        """
        Separă adjectivele de numele ingredientului
        
        Args:
            ingredient_name: "large ripe banana" sau "red onion"
            
        Returns:
            Tuple[name, adjectives]: ("banana", "large, ripe") sau ("red onion", None)
        """
        if not ingredient_name:
            return ingredient_name, None
        
        original = ingredient_name.strip()
        words = original.lower().split()
        
        if len(words) <= 1:
            return original, None
        
        # Strategie: încearcă să găsească match-uri în Notion, altfel folosește adjective
        adjectives = []
        
        # 1. Verifică dacă numele complet există în Notion
        if self.use_notion and original.lower() in self.grocery_items:
            return original, None
        
        # 2. Încearcă să elimine cuvinte de la început până găsește match
        for i in range(len(words)):
            candidate = ' '.join(words[i:])
            
            # Verifică dacă candidatul există în Notion
            if self.use_notion and candidate in self.grocery_items:
                # Găsit! Tot ce e înaintea lui sunt adjective
                if i > 0:
                    adjectives = words[:i]
                    return ' '.join(words[i:]), ', '.join(adjectives)
                return original, None
        
        # 3. Dacă Notion nu a ajutat, folosește lista de adjective
        # Extrage adjective de la început
        noun_start = 0
        for i, word in enumerate(words):
            if word in self.COMMON_ADJECTIVES:
                adjectives.append(word)
                noun_start = i + 1
            else:
                # Primul cuvânt care nu e adjectiv → începe substantivul
                break
        
        if adjectives:
            noun = ' '.join(words[noun_start:])
            return noun, ', '.join(adjectives)
        
        # 4. Nu am găsit adjective clare → returnează original
        return original, None
    
    def process_ingredient_line(self, line: str) -> Tuple[str, Optional[str]]:
        """
        Procesează o linie completă de ingredient și returnează versiunea procesată
        
        Args:
            line: "1 large ripe banana" SAU "[1] large ripe banana" SAU "[1 cup] large ripe banana"
            
        Returns:
            Tuple[processed_line, extracted_adjectives]:
                ("1 banana", "large, ripe") SAU ("[1] banana", "large, ripe")
        """
        # Verifică dacă are format bracket [quantity] sau [quantity unit]
        bracket_match = re.match(r'^\[([^\]]+)\]\s*(.+)$', line.strip())
        
        if bracket_match:
            # Format: [1] ingredient sau [1 cup] ingredient
            bracket_content = bracket_match.group(1).strip()
            rest = bracket_match.group(2).strip()
            
            # Separă adjectivele din ingredient name
            clean_name, adjectives = self.separate_adjectives(rest)
            
            # Reconstruiește cu bracket
            processed = f"[{bracket_content}] {clean_name}"
            return processed, adjectives
        
        # Format standard fără brackets
        # Unități de măsură cunoscute
        KNOWN_UNITS = {
            'cup', 'cups', 'tsp', 'tsp.', 'tsps', 'teaspoon', 'teaspoons',
            'tbsp', 'tbsp.', 'tbsps', 'tablespoon', 'tablespoons',
            'oz', 'oz.', 'ounce', 'ounces', 'lb', 'lb.', 'lbs', 'pound', 'pounds',
            'g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms',
            'ml', 'milliliter', 'milliliters', 'l', 'liter', 'liters',
            'pinch', 'dash', 'handful', 'piece', 'pieces',
            'clove', 'cloves', 'slice', 'slices', 'can', 'cans',
            'bottle', 'bottles', 'jar', 'jars', 'package', 'packages',
            'buc', 'bucată', 'bucăți', 'lingură', 'linguri', 
            'linguriță', 'lingurițe', 'lingurita', 'lingurite'
        }
        
        # Pattern pentru cantitate + opțional unitate + ingredient
        # Cantitate: număr (cu fracții, decimale, range)
        match = re.match(
            r'^([0-9./\s]+(?:to\s+[0-9./]+)?)\s+(.+)$',
            line.strip()
        )
        
        if not match:
            # Nu are format standard
            return line, None
        
        qty = match.group(1).strip()
        rest = match.group(2).strip()  # Tot ce rămâne după cantitate
        
        # Verifică dacă începe cu o unitate cunoscută
        words = rest.split()
        unit = None
        ingredient_start = 0
        
        if words and words[0].lower() in KNOWN_UNITS:
            unit = words[0]
            ingredient_start = 1
        
        # Restul cuvintelor = ingredient name
        if ingredient_start < len(words):
            ingredient_name = ' '.join(words[ingredient_start:])
        else:
            # Nu are ingredient după unitate?
            return line, None
        
        # Separă adjectivele din numele ingredientului
        clean_name, adjectives = self.separate_adjectives(ingredient_name)
        
        # Reconstruiește linia
        if unit:
            processed = f"{qty} {unit} {clean_name}"
        else:
            processed = f"{qty} {clean_name}"
        
        return processed, adjectives


# Singleton pentru reutilizare
_processor_instance = None

def get_ingredient_processor(use_notion: bool = True) -> IngredientProcessor:
    """Returnează instanța singleton a procesorului"""
    global _processor_instance
    if _processor_instance is None:
        _processor_instance = IngredientProcessor(use_notion=use_notion)
    return _processor_instance
