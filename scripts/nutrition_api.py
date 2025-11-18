"""
Modul pentru obținerea informațiilor nutriționale
Folosește o bază de date locală cu alimente comune + opțional API extern

Surse de date nutriționale:
1. Bază de date locală (alimente comune RO/EN)
2. MyFitnessPal / USDA (dacă este configurat API key)
"""
import requests
from typing import Dict, List, Optional, Tuple
import time
import json
import os

# Opțional: API key pentru USDA (necesită înregistrare gratuită)
# https://fdc.nal.usda.gov/api-key-signup.html
USDA_API_KEY = os.getenv('USDA_API_KEY', None)

BASE_URL = "https://api.nal.usda.gov/fdc/v1"

# Bază de date locală cu alimente comune (per 100g)
# Surse: USDA SR Legacy, Romanian Food Composition Database
LOCAL_NUTRITION_DB = {
    # Carne & Pește
    'chicken breast': {'kcal': 165, 'carbs': 0, 'fat': 3.6, 'protein': 31},
    'piept pui': {'kcal': 165, 'carbs': 0, 'fat': 3.6, 'protein': 31},
    'chicken thigh': {'kcal': 209, 'carbs': 0, 'fat': 10.9, 'protein': 26},
    'pulpa pui': {'kcal': 209, 'carbs': 0, 'fat': 10.9, 'protein': 26},
    'ground beef': {'kcal': 250, 'carbs': 0, 'fat': 17, 'protein': 26},
    'carne tocata': {'kcal': 250, 'carbs': 0, 'fat': 17, 'protein': 26},
    'salmon': {'kcal': 208, 'carbs': 0, 'fat': 13, 'protein': 20},
    'somon': {'kcal': 208, 'carbs': 0, 'fat': 13, 'protein': 20},
    'tuna': {'kcal': 144, 'carbs': 0, 'fat': 4.9, 'protein': 23},
    'ton': {'kcal': 144, 'carbs': 0, 'fat': 4.9, 'protein': 23},
    'eggs': {'kcal': 155, 'carbs': 1.1, 'fat': 11, 'protein': 13},
    'oua': {'kcal': 155, 'carbs': 1.1, 'fat': 11, 'protein': 13},
    
    # Lactate
    'cottage cheese': {'kcal': 98, 'carbs': 3.4, 'fat': 4.3, 'protein': 11},
    'branza de vaci': {'kcal': 98, 'carbs': 3.4, 'fat': 4.3, 'protein': 11},
    'greek yogurt': {'kcal': 59, 'carbs': 3.6, 'fat': 0.4, 'protein': 10},
    'iaurt grecesc': {'kcal': 59, 'carbs': 3.6, 'fat': 0.4, 'protein': 10},
    'milk': {'kcal': 42, 'carbs': 5, 'fat': 1, 'protein': 3.4},
    'lapte': {'kcal': 42, 'carbs': 5, 'fat': 1, 'protein': 3.4},
    'parmesan': {'kcal': 431, 'carbs': 4.1, 'fat': 29, 'protein': 38},
    'mozzarella': {'kcal': 280, 'carbs': 2.2, 'fat': 17, 'protein': 28},
    
    # Cereale & Leguminoase
    'oats': {'kcal': 389, 'carbs': 66, 'fat': 6.9, 'protein': 17},
    'fulgi ovaz': {'kcal': 389, 'carbs': 66, 'fat': 6.9, 'protein': 17},
    'rice': {'kcal': 365, 'carbs': 80, 'fat': 0.6, 'protein': 7.1},
    'orez': {'kcal': 365, 'carbs': 80, 'fat': 0.6, 'protein': 7.1},
    'pasta': {'kcal': 371, 'carbs': 75, 'fat': 1.5, 'protein': 13},
    'paste': {'kcal': 371, 'carbs': 75, 'fat': 1.5, 'protein': 13},
    'quinoa': {'kcal': 368, 'carbs': 64, 'fat': 6.1, 'protein': 14},
    'bread': {'kcal': 265, 'carbs': 49, 'fat': 3.2, 'protein': 9},
    'paine': {'kcal': 265, 'carbs': 49, 'fat': 3.2, 'protein': 9},
    'chickpeas': {'kcal': 164, 'carbs': 27, 'fat': 2.6, 'protein': 8.9},
    'naut': {'kcal': 164, 'carbs': 27, 'fat': 2.6, 'protein': 8.9},
    'lentils': {'kcal': 116, 'carbs': 20, 'fat': 0.4, 'protein': 9},
    'linte': {'kcal': 116, 'carbs': 20, 'fat': 0.4, 'protein': 9},
    'black beans': {'kcal': 132, 'carbs': 24, 'fat': 0.5, 'protein': 8.9},
    'fasole neagra': {'kcal': 132, 'carbs': 24, 'fat': 0.5, 'protein': 8.9},
    
    # Fructe
    'banana': {'kcal': 89, 'carbs': 23, 'fat': 0.3, 'protein': 1.1},
    'banane': {'kcal': 89, 'carbs': 23, 'fat': 0.3, 'protein': 1.1},
    'apple': {'kcal': 52, 'carbs': 14, 'fat': 0.2, 'protein': 0.3},
    'mar': {'kcal': 52, 'carbs': 14, 'fat': 0.2, 'protein': 0.3},
    'orange': {'kcal': 47, 'carbs': 12, 'fat': 0.1, 'protein': 0.9},
    'portocala': {'kcal': 47, 'carbs': 12, 'fat': 0.1, 'protein': 0.9},
    'strawberry': {'kcal': 32, 'carbs': 7.7, 'fat': 0.3, 'protein': 0.7},
    'capsuni': {'kcal': 32, 'carbs': 7.7, 'fat': 0.3, 'protein': 0.7},
    'blueberry': {'kcal': 57, 'carbs': 14, 'fat': 0.3, 'protein': 0.7},
    'afine': {'kcal': 57, 'carbs': 14, 'fat': 0.3, 'protein': 0.7},
    'avocado': {'kcal': 160, 'carbs': 8.5, 'fat': 15, 'protein': 2},
    
    # Legume
    'broccoli': {'kcal': 34, 'carbs': 7, 'fat': 0.4, 'protein': 2.8},
    'spinach': {'kcal': 23, 'carbs': 3.6, 'fat': 0.4, 'protein': 2.9},
    'spanac': {'kcal': 23, 'carbs': 3.6, 'fat': 0.4, 'protein': 2.9},
    'tomato': {'kcal': 18, 'carbs': 3.9, 'fat': 0.2, 'protein': 0.9},
    'rosii': {'kcal': 18, 'carbs': 3.9, 'fat': 0.2, 'protein': 0.9},
    'carrot': {'kcal': 41, 'carbs': 10, 'fat': 0.2, 'protein': 0.9},
    'morcov': {'kcal': 41, 'carbs': 10, 'fat': 0.2, 'protein': 0.9},
    'cucumber': {'kcal': 15, 'carbs': 3.6, 'fat': 0.1, 'protein': 0.7},
    'castravete': {'kcal': 15, 'carbs': 3.6, 'fat': 0.1, 'protein': 0.7},
    'bell pepper': {'kcal': 31, 'carbs': 6, 'fat': 0.3, 'protein': 1},
    'ardei gras': {'kcal': 31, 'carbs': 6, 'fat': 0.3, 'protein': 1},
    'onion': {'kcal': 40, 'carbs': 9.3, 'fat': 0.1, 'protein': 1.1},
    'ceapa': {'kcal': 40, 'carbs': 9.3, 'fat': 0.1, 'protein': 1.1},
    'garlic': {'kcal': 149, 'carbs': 33, 'fat': 0.5, 'protein': 6.4},
    'usturoi': {'kcal': 149, 'carbs': 33, 'fat': 0.5, 'protein': 6.4},
    'potato': {'kcal': 77, 'carbs': 17, 'fat': 0.1, 'protein': 2},
    'cartofi': {'kcal': 77, 'carbs': 17, 'fat': 0.1, 'protein': 2},
    'sweet potato': {'kcal': 86, 'carbs': 20, 'fat': 0.1, 'protein': 1.6},
    'cartof dulce': {'kcal': 86, 'carbs': 20, 'fat': 0.1, 'protein': 1.6},
    
    # Nuci & Semințe
    'almonds': {'kcal': 579, 'carbs': 22, 'fat': 50, 'protein': 21},
    'migdale': {'kcal': 579, 'carbs': 22, 'fat': 50, 'protein': 21},
    'walnuts': {'kcal': 654, 'carbs': 14, 'fat': 65, 'protein': 15},
    'nuci': {'kcal': 654, 'carbs': 14, 'fat': 65, 'protein': 15},
    'peanut butter': {'kcal': 588, 'carbs': 20, 'fat': 50, 'protein': 25},
    'unt de arahide': {'kcal': 588, 'carbs': 20, 'fat': 50, 'protein': 25},
    'chia seeds': {'kcal': 486, 'carbs': 42, 'fat': 31, 'protein': 17},
    'seminte chia': {'kcal': 486, 'carbs': 42, 'fat': 31, 'protein': 17},
    'flax seeds': {'kcal': 534, 'carbs': 29, 'fat': 42, 'protein': 18},
    'seminte in': {'kcal': 534, 'carbs': 29, 'fat': 42, 'protein': 18},
    
    # Uleiuri & Grăsimi
    'olive oil': {'kcal': 884, 'carbs': 0, 'fat': 100, 'protein': 0},
    'ulei masline': {'kcal': 884, 'carbs': 0, 'fat': 100, 'protein': 0},
    'coconut oil': {'kcal': 862, 'carbs': 0, 'fat': 100, 'protein': 0},
    'ulei cocos': {'kcal': 862, 'carbs': 0, 'fat': 100, 'protein': 0},
    'butter': {'kcal': 717, 'carbs': 0.1, 'fat': 81, 'protein': 0.9},
    'unt': {'kcal': 717, 'carbs': 0.1, 'fat': 81, 'protein': 0.9},
    
    # Altele
    'honey': {'kcal': 304, 'carbs': 82, 'fat': 0, 'protein': 0.3},
    'miere': {'kcal': 304, 'carbs': 82, 'fat': 0, 'protein': 0.3},
    'maple syrup': {'kcal': 260, 'carbs': 67, 'fat': 0.1, 'protein': 0},
    'sirop artar': {'kcal': 260, 'carbs': 67, 'fat': 0.1, 'protein': 0},
    'dark chocolate': {'kcal': 546, 'carbs': 61, 'fat': 31, 'protein': 4.9},
    'ciocolata neagra': {'kcal': 546, 'carbs': 61, 'fat': 31, 'protein': 4.9},
}


class NutritionAPI:
    """Client pentru obținerea datelor nutriționale"""
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or USDA_API_KEY
        self.session = requests.Session()
        self.last_request_time = 0
        self.min_request_interval = 0.2
    
    def search_local(self, query: str) -> List[Dict]:
        """
        Caută în baza de date locală
        
        Args:
            query: Numele alimentului (RO sau EN)
        
        Returns:
            Listă de rezultate găsite local
        """
        query_lower = query.lower().strip()
        results = []
        
        # Caută match exact
        if query_lower in LOCAL_NUTRITION_DB:
            nutrients = LOCAL_NUTRITION_DB[query_lower]
            results.append({
                'name': query_lower,
                'source': 'Local DB',
                'nutrients': nutrients,
                'exact_match': True
            })
            return results
        
        # Caută match parțial
        for food_name, nutrients in LOCAL_NUTRITION_DB.items():
            if query_lower in food_name or food_name in query_lower:
                results.append({
                    'name': food_name,
                    'source': 'Local DB',
                    'nutrients': nutrients,
                    'exact_match': False
                })
        
        return results[:5]  # Max 5 rezultate
    
    def search_usda(self, query: str, page_size: int = 5) -> List[Dict]:
        """Caută în USDA API (necesită API key)"""
        if not self.api_key:
            return []
        
        # Implementare USDA (doar dacă există API key)
        # ... cod existent ...
        return []
    
    def format_nutrition_display(self, nutrients: Dict) -> str:
        """Formatează nutrienții pentru afișare"""
        lines = []
        if 'kcal' in nutrients:
            lines.append(f"KCal: {nutrients['kcal']:.1f}/100g")
        if 'carbs' in nutrients:
            lines.append(f"Carbs: {nutrients['carbs']:.1f}g/100g")
        if 'fat' in nutrients:
            lines.append(f"Fat: {nutrients['fat']:.1f}g/100g")
        if 'protein' in nutrients:
            lines.append(f"Protein: {nutrients['protein']:.1f}g/100g")
        
        return " | ".join(lines) if lines else "N/A"
    
    def get_nutrition_interactive(self, ingredient_name: str) -> Optional[Dict[str, float]]:
        """
        Caută și permite utilizatorului să selecteze informații nutriționale
        
        Args:
            ingredient_name: Numele ingredientului
        
        Returns:
            Dict cu {'kcal': float, 'carbs': float, 'fat': float, 'protein': float} sau None
        """
        print(f"\n🔍 Caut informații nutriționale pentru '{ingredient_name}'...")
        
        # 1. Caută în baza locală
        local_results = self.search_local(ingredient_name)
        
        if local_results:
            print(f"\n  Găsite {len(local_results)} alimente în baza locală:")
            for idx, food in enumerate(local_results, 1):
                match_indicator = "✓ " if food['exact_match'] else "~ "
                nutrition_str = self.format_nutrition_display(food['nutrients'])
                print(f"    {idx}. {match_indicator}{food['name']}")
                print(f"       {nutrition_str}")
            
            print(f"    0. Introduc manual")
            
            # Selecție utilizator
            while True:
                choice = input(f"\n  Selectează (0-{len(local_results)}): ").strip()
                
                try:
                    choice = int(choice)
                    if choice == 0:
                        return None
                    elif 1 <= choice <= len(local_results):
                        selected = local_results[choice - 1]
                        nutrients = selected['nutrients']
                        print(f"  ✓ Selectat: {selected['name']}")
                        return {
                            'kcal': round(nutrients['kcal'], 1),
                            'carbs': round(nutrients['carbs'], 1),
                            'fat': round(nutrients['fat'], 1),
                            'protein': round(nutrients['protein'], 1)
                        }
                    else:
                        print(f"  ⚠️ Opțiune invalidă")
                except ValueError:
                    print(f"  ⚠️ Te rog introdu un număr")
        else:
            print(f"  ❌ Nu am găsit '{ingredient_name}' în baza de date")
            print(f"  💡 Sugestie: Încearcă numele în engleză sau un nume mai generic")
            return None


def test_api():
    """Testează API-ul cu câteva exemple"""
    api = NutritionAPI()
    
    test_foods = ["chicken breast", "banane", "fulgi ovaz", "nuci", "broccoli"]
    
    for food in test_foods:
        print(f"\n{'='*60}")
        print(f"Test: {food}")
        print(f"{'='*60}")
        
        results = api.search_local(food)
        
        if results:
            for idx, result in enumerate(results, 1):
                match_type = "exact" if result['exact_match'] else "partial"
                print(f"\n{idx}. {result['name']} ({match_type})")
                print(f"   Source: {result['source']}")
                print(f"   Nutrition: {api.format_nutrition_display(result['nutrients'])}")
        else:
            print("Nu s-au găsit rezultate în baza locală")


if __name__ == "__main__":
    test_api()
