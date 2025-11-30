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
    
    # Ingrediente de bază comune (fallback când Notion nu le are)
    COMMON_BASE_INGREDIENTS = {
        # Legume
        'onion', 'onions', 'garlic', 'tomato', 'tomatoes', 'potato', 'potatoes',
        'carrot', 'carrots', 'celery', 'pepper', 'peppers', 'bell pepper', 'bell peppers',
        'cucumber', 'cucumbers', 'lettuce', 'spinach', 'kale', 'cabbage',
        'broccoli', 'cauliflower', 'zucchini', 'eggplant', 'mushroom', 'mushrooms',
        'corn', 'peas', 'beans', 'lentils', 'chickpeas',
        # Fructe
        'apple', 'apples', 'banana', 'bananas', 'orange', 'oranges',
        'lemon', 'lemons', 'lime', 'limes', 'peach', 'peaches',
        'strawberry', 'strawberries', 'blueberry', 'blueberries',
        'mango', 'mangos', 'pineapple', 'avocado', 'avocados',
        # Proteine
        'egg', 'eggs', 'chicken', 'beef', 'pork', 'fish', 'salmon',
        'tuna', 'shrimp', 'tofu', 'tempeh',
        # Lactate
        'milk', 'cream', 'butter', 'cheese', 'yogurt', 'sour cream',
        'mozzarella', 'parmesan', 'cheddar', 'feta', 'ricotta',
        # Cereale
        'rice', 'pasta', 'bread', 'flour', 'oats', 'quinoa',
        'couscous', 'bulgur', 'barley', 'farro',
        # Condimente
        'salt', 'pepper', 'sugar', 'oil', 'olive oil', 'vinegar',
        'soy sauce', 'honey', 'maple syrup',
        # Lichide
        'water', 'broth', 'stock', 'wine', 'juice', 'orange juice',
        # Plante aromatice
        'parsley', 'cilantro', 'basil', 'thyme', 'rosemary', 'dill',
        'mint', 'oregano', 'sage',
        # Nuci și semințe
        'almond', 'almonds', 'walnut', 'walnuts', 'cashew', 'cashews',
        'peanut', 'peanuts', 'sesame', 'sunflower',
    }
    
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
        self.all_ingredients: Set[str] = set()  # Notion + Common ingredients
        self.use_notion = use_notion
        
        # Adaugă ingredientele comune de bază
        self.all_ingredients.update(self.COMMON_BASE_INGREDIENTS)
        
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
            
            # Fetch toate grocery items (cu paginare pentru >100 items)
            has_more = True
            start_cursor = None
            
            while has_more:
                if start_cursor:
                    results = notion.databases.query(
                        database_id=db_groceries,
                        start_cursor=start_cursor
                    )
                else:
                    results = notion.databases.query(database_id=db_groceries)
                
                for item in results.get('results', []):
                    name_prop = item.get('properties', {}).get('Name', {})
                    title = name_prop.get('title', [])
                    if title and len(title) > 0:
                        name = title[0].get('text', {}).get('content', '').strip()
                        if name:
                            # Adaugă variante: singular, plural, lowercase
                            name_lower = name.lower()
                            self.grocery_items.add(name_lower)
                            self.all_ingredients.add(name_lower)
                            
                            # Adaugă și varianta fără 's' final (aproximare plural)
                            if name_lower.endswith('s'):
                                self.grocery_items.add(name_lower[:-1])
                                self.all_ingredients.add(name_lower[:-1])
                
                # Verifică dacă mai sunt pagini
                has_more = results.get('has_more', False)
                start_cursor = results.get('next_cursor')
            
            print(f"  ℹ Încărcate {len(self.grocery_items)} grocery items din Notion")
            print(f"  ℹ Total {len(self.all_ingredients)} ingrediente disponibile pentru matching")
            
        except Exception as e:
            print(f"  ⚠ Nu pot încărca grocery items din Notion: {e}")
            print(f"  ℹ Folosesc doar lista de adjective comune")
    
    def separate_adjectives(self, ingredient_name: str) -> Tuple[str, Optional[str]]:
        """
        Separă adjectivele și descrierile de numele ingredientului
        
        Args:
            ingredient_name: "small-medium globe eggplant cut into 1/2-inch cubes"
            
        Returns:
            Tuple[name, descriptions]: ("eggplant", "small-medium globe cut into 1/2-inch cubes")
        """
        if not ingredient_name:
            return ingredient_name, None
        
        # Strip punctuation de la sfârșit (virgule, puncte) și curăță virgule extra din interior
        original = ingredient_name.strip().rstrip(',.;:')
        # Înlocuiește ", " din interior cu doar " " pentru procesare
        original = re.sub(r',\s+', ' ', original)
        words_lower = original.lower().split()
        words_original = original.split()
        
        if len(words_lower) <= 1:
            return original, None
        
        # 1. Verifică dacă numele complet există în lista de ingrediente (exact match)
        if original.lower() in self.all_ingredients:
            return original, None
        
        # 2. Strategie îmbunătățită: caută ingredientul de bază scanând toate combinațiile
        # Preferă match-uri din Notion, apoi din lista comună
        best_match = None
        best_match_start = -1
        best_match_end = -1
        best_match_priority = 0  # 2 = Notion, 1 = Common ingredients
        
        # Încearcă toate combinațiile posibile de cuvinte consecutive
        for length in range(len(words_lower), 0, -1):  # De la cel mai lung la cel mai scurt
            for start in range(len(words_lower) - length + 1):
                end = start + length
                candidate = ' '.join(words_lower[start:end])
                
                # Verifică în Notion items (prioritate mare)
                if candidate in self.grocery_items:
                    priority = 2
                # Verifică în ingrediente comune (prioritate medie)
                elif candidate in self.COMMON_BASE_INGREDIENTS:
                    priority = 1
                else:
                    continue
                
                # Salvează dacă e mai bun decât match-ul curent
                if priority > best_match_priority or \
                   (priority == best_match_priority and length > (best_match_end - best_match_start)):
                    best_match = ' '.join(words_original[start:end])
                    best_match_start = start
                    best_match_end = end
                    best_match_priority = priority
        
        if best_match:
            # Colectează tot ce e înainte și după match ca descriere
            descriptions = []
            if best_match_start > 0:
                descriptions.extend(words_original[:best_match_start])
            if best_match_end < len(words_original):
                descriptions.extend(words_original[best_match_end:])
            
            if descriptions:
                return best_match, ' '.join(descriptions)
            return best_match, None
        
        # 3. Dacă nu am găsit match, folosește strategia bazată pe adjective
        # Caută primul substantiv (primul cuvânt care nu e adjectiv)
        adjectives_before = []
        noun_start = -1
        noun_end = -1
        
        # Extrage adjective de la început
        for i, word in enumerate(words_lower):
            if word in self.COMMON_ADJECTIVES:
                adjectives_before.append(words_original[i])
            else:
                noun_start = i
                break
        
        if noun_start == -1:
            # Toate cuvintele sunt adjective? Puțin probabil
            return original, None
        
        # Găsește sfârșitul substantivului (primul adjectiv/prepoziție după substantiv)
        # sau cuvinte care indică procesare/pregătire
        PREP_INDICATORS = {
            'cut', 'into', 'chopped', 'diced', 'sliced', 'minced',
            'grated', 'shredded', 'crushed', 'peeled', 'pitted',
            'halved', 'quartered', 'removed', 'trimmed', 'cleaned',
            'about', 'roughly', 'finely', 'thinly', 'thickly',
            'and', 'with', 'without', 'for', 'to',
        }
        
        # Pattern special pentru "X of Y" (ex: "cloves of garlic", "cup of water")
        # În astfel de cazuri, "of" face parte din ingredient, nu din descriere
        UNIT_OF_PATTERN = r'\b(cup|cups|clove|cloves|piece|pieces|slice|slices|pinch|dash|handful|bunch|can|bottle|jar|package)\s+of\b'
        
        # Presupune că substantivul are 1-3 cuvinte
        # Caută indicatori de procesare/pregătire
        noun_end = len(words_lower)  # Default: până la sfârșit
        
        for i in range(noun_start, len(words_lower)):
            word = words_lower[i]
            
            # Verifică pattern special "X of Y"
            remaining_text = ' '.join(words_lower[noun_start:i+2]) if i+1 < len(words_lower) else ''
            if re.search(UNIT_OF_PATTERN, remaining_text):
                # Include "of" și următorul cuvânt în ingredient
                continue
            
            if word in PREP_INDICATORS or word in self.COMMON_ADJECTIVES:
                noun_end = i
                break
            # Dacă am trecut de 3 cuvinte fără indicator, oprește-te
            if i - noun_start >= 3:
                noun_end = i + 1
                break
        
        # Extrage ingredientul și descrierile
        ingredient_words = words_original[noun_start:noun_end]
        descriptions_after = words_original[noun_end:] if noun_end < len(words_original) else []
        
        all_descriptions = adjectives_before + descriptions_after
        
        if all_descriptions:
            return ' '.join(ingredient_words), ' '.join(all_descriptions)
        
        return ' '.join(ingredient_words), None
    
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
            
            # Tratează pattern-ul "unit of ingredient" (ex: "cloves of garlic")
            if ingredient_start < len(words) and words[ingredient_start].lower() == 'of':
                # Include "of" în unitate
                unit = f"{unit} of"
                ingredient_start = 2
        
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
