"""
Script pentru adăugarea pașilor de preparare în paginile Notion deja create.

Utilizare:
    python scripts/add_recipe_steps.py [scraped_file]

Dacă nu se specifică fisierul, folosește data/urls/scraped_recipe_urls.txt
"""

import os
import re
import sys
from notion_client import Client
from dotenv import load_dotenv
from typing import Dict, List, Optional

# Încarcă variabilele de mediu
load_dotenv('notion.env')

notion = Client(auth=os.getenv('NOTION_TOKEN'))
DB_RECEIPTS = os.getenv('DB_RECEIPTS_ID').rstrip('?')


class RecipeStepsAdder:
    def __init__(self):
        self.recipes_cache = {}  # Cache pentru rețetele din Notion
        self.processed_count = 0
        self.skipped_count = 0
        self.error_count = 0
        
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
    
    def _find_recipe_page(self, recipe_name: str) -> Optional[str]:
        """Găsește pagina Notion pentru o rețetă după titlu"""
        recipe_key = recipe_name.lower()
        return self.recipes_cache.get(recipe_key)
    
    def _parse_scraped_file(self, filepath: str) -> Dict[str, List[str]]:
        """Parsează fișierul scraped și extrage pașii pentru fiecare rețetă"""
        print(f"\n📖 Procesez fișier: {filepath}")
        
        if not os.path.exists(filepath):
            print(f"  ✗ Fișierul nu există: {filepath}")
            sys.exit(1)
        
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Împarte în rețete
        recipes_raw = re.split(r'\n=== (.+?) ===\n', content)
        
        # recipes_raw[0] = conținut înainte de prima rețetă (ignorăm)
        # recipes_raw[1] = titlu primă rețetă
        # recipes_raw[2] = conținut primă rețetă
        # recipes_raw[3] = titlu a doua rețetă
        # recipes_raw[4] = conținut a doua rețetă
        # etc.
        
        recipes_with_steps = {}
        
        for i in range(1, len(recipes_raw), 2):
            if i + 1 >= len(recipes_raw):
                break
            
            recipe_name = recipes_raw[i].strip()
            recipe_content = recipes_raw[i + 1]
            
            # Extrage pașii
            steps_match = re.search(r'Steps:\s*\n((?:\d+\..+?\n)+)', recipe_content, re.MULTILINE)
            
            if steps_match:
                steps_text = steps_match.group(1)
                # Împarte în pași individuali
                steps = re.findall(r'\d+\.\s*(.+?)(?=\n\d+\.|\n\n|\Z)', steps_text, re.DOTALL)
                # Curăță fiecare pas
                steps = [step.strip() for step in steps if step.strip()]
                
                if steps:
                    recipes_with_steps[recipe_name] = steps
        
        print(f"  ✓ Găsite {len(recipes_with_steps)} rețete cu pași")
        return recipes_with_steps
    
    def _add_steps_to_page(self, page_id: str, steps: List[str]) -> bool:
        """Adaugă pașii în secțiunea Instructions/Steps din pagina Notion"""
        try:
            # Obține toate blocurile din pagină
            blocks = notion.blocks.children.list(block_id=page_id)
            
            if not blocks['results']:
                print(f"    ℹ Pagină goală - creez secțiune nouă")
                return self._create_steps_section(page_id, steps)
            
            # Caută heading-ul "Instructions" sau "Steps"
            instructions_block_index = None
            
            for idx, block in enumerate(blocks['results']):
                block_type = block.get('type')
                
                # Verifică dacă e heading (heading_1, heading_2, heading_3)
                if block_type and block_type.startswith('heading_'):
                    heading_content = block.get(block_type, {}).get('rich_text', [])
                    if heading_content:
                        text = heading_content[0].get('plain_text', '').lower()
                        if 'instruction' in text or 'steps' in text:
                            instructions_block_index = idx
                            print(f"    ✓ Găsit heading '{heading_content[0].get('plain_text')}' la poziția {idx}")
                            break
            
            if instructions_block_index is not None:
                # Colectează blocurile de șters: heading + conținutul său până la următorul heading
                blocks_to_delete = [blocks['results'][instructions_block_index]['id']]  # Include heading-ul
                
                for i in range(instructions_block_index + 1, len(blocks['results'])):
                    block = blocks['results'][i]
                    block_type = block.get('type')
                    
                    # Oprește dacă întâlnim alt heading
                    if block_type and block_type.startswith('heading_'):
                        break
                    
                    blocks_to_delete.append(block['id'])
                
                # Șterge heading-ul vechi + conținutul
                for block_id in blocks_to_delete:
                    try:
                        notion.blocks.delete(block_id=block_id)
                    except Exception as e:
                        print(f"    ⚠ Nu s-a putut șterge blocul: {e}")
                
                print(f"    ↻ Șterse {len(blocks_to_delete)} blocuri (heading + conținut)")
                
                # Creează noua secțiune Instructions cu pașii
                # API-ul Notion va adăuga la sfârșitul paginii, dar asta e OK
                children = []
                
                # Heading nou
                children.append({
                    "object": "block",
                    "type": "heading_1",
                    "heading_1": {
                        "rich_text": [{"type": "text", "text": {"content": "Steps"}}]
                    }
                })
                
                # Pașii
                for idx, step in enumerate(steps, 1):
                    children.append({
                        "object": "block",
                        "type": "paragraph",
                        "paragraph": {
                            "rich_text": [{
                                "type": "text",
                                "text": {"content": f"{idx}. {step}"}
                            }]
                        }
                    })
                
                # Adaugă la pagină (va apărea la final, dar e OK - conținutul e corect)
                notion.blocks.children.append(block_id=page_id, children=children)
                
                return True
            else:
                # Nu există secțiune Instructions - adaugă la final
                print(f"    ℹ Nu există secțiune Instructions - adaug la final")
                return self._create_steps_section(page_id, steps, at_end=True)
            
        except Exception as e:
            print(f"    ✗ Eroare: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def _create_steps_section(self, page_id: str, steps: List[str], at_end: bool = False) -> bool:
        """Creează o secțiune nouă Instructions cu pașii"""
        try:
            children = []
            
            # Adaugă divider dacă adaugăm la final
            if at_end:
                children.append({
                    "object": "block",
                    "type": "divider",
                    "divider": {}
                })
            
            # Adaugă heading
            children.append({
                "object": "block",
                "type": "heading_1",
                "heading_1": {
                    "rich_text": [{"type": "text", "text": {"content": "Steps"}}]
                }
            })
            
            # Adaugă pașii
            for idx, step in enumerate(steps, 1):
                children.append({
                    "object": "block",
                    "type": "paragraph",
                    "paragraph": {
                        "rich_text": [{
                            "type": "text",
                            "text": {"content": f"{idx}. {step}"}
                        }]
                    }
                })
            
            notion.blocks.children.append(block_id=page_id, children=children)
            return True
            
        except Exception as e:
            print(f"    ✗ Eroare la creare secțiune: {e}")
            return False
    
    def process_recipes(self, filepath: str):
        """Procesează toate rețetele din fișier și adaugă pașii în Notion"""
        print("\n" + "="*60)
        print("🚀 Adăugare pași în paginile Notion")
        print("="*60)
        
        # Încarcă rețetele din Notion
        self._load_receipts_database()
        
        # Parsează fișierul cu rețete
        recipes_with_steps = self._parse_scraped_file(filepath)
        
        if not recipes_with_steps:
            print("\n⚠ Nu s-au găsit rețete cu pași în fișier")
            return
        
        print(f"\n📝 Procesez {len(recipes_with_steps)} rețete...\n")
        
        # Procesează fiecare rețetă
        for recipe_name, steps in recipes_with_steps.items():
            print(f"🍳 {recipe_name}")
            print(f"  📋 {len(steps)} pași")
            
            # Găsește pagina în Notion
            page_id = self._find_recipe_page(recipe_name)
            
            if not page_id:
                print(f"  ✗ Nu s-a găsit în Notion - skip")
                self.skipped_count += 1
                continue
            
            # Adaugă pașii
            if self._add_steps_to_page(page_id, steps):
                print(f"  ✓ Adăugat cu succes")
                self.processed_count += 1
            else:
                self.skipped_count += 1
        
        # Sumar final
        print("\n" + "="*60)
        print("📊 SUMAR")
        print("="*60)
        print(f"✓ Procesate cu succes: {self.processed_count}")
        print(f"⚠ Skipped (deja au conținut sau nu există): {self.skipped_count}")
        if self.error_count > 0:
            print(f"✗ Erori: {self.error_count}")
        print()


def main():
    # Determină fișierul de procesat
    if len(sys.argv) > 1:
        scraped_file = sys.argv[1]
    else:
        # Default la data/urls/scraped_recipe_urls.txt
        script_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(script_dir)
        scraped_file = os.path.join(project_root, 'data', 'urls', 'scraped_recipe_urls.txt')
    
    # Creează și rulează adder-ul
    adder = RecipeStepsAdder()
    adder.process_recipes(scraped_file)


if __name__ == '__main__':
    main()
