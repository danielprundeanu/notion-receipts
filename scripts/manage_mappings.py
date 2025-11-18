#!/usr/bin/env python3
"""
Script helper pentru gestionarea mapărilor de ingrediente
"""
import json
import sys
import os

# Path relativ la locația scriptului
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
MAPPINGS_FILE = os.path.join(PROJECT_ROOT, 'data', 'ingredient_mappings.json')

def load_mappings():
    try:
        with open(MAPPINGS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return {"grocery_mappings": {}, "unit_conversions": {}, "auto_create": {"enabled": False}}

def save_mappings(mappings):
    with open(MAPPINGS_FILE, 'w', encoding='utf-8') as f:
        json.dump(mappings, f, indent=2, ensure_ascii=False)
    print(f"✓ Mapări salvate în {MAPPINGS_FILE}")

def list_mappings():
    mappings = load_mappings()
    grocery_maps = mappings.get('grocery_mappings', {})
    
    if not grocery_maps:
        print("Nu există mapări salvate.")
        return
    
    print(f"\n{'='*60}")
    print(f"MAPĂRI INGREDIENTE ({len(grocery_maps)} total)")
    print(f"{'='*60}\n")
    
    for idx, (from_name, to_name) in enumerate(sorted(grocery_maps.items()), 1):
        print(f"{idx:3d}. '{from_name}' → '{to_name}'")
    print()

def add_mapping(from_name, to_name):
    mappings = load_mappings()
    mappings['grocery_mappings'][from_name.lower()] = to_name
    save_mappings(mappings)
    print(f"✓ Adăugat: '{from_name}' → '{to_name}'")

def remove_mapping(from_name):
    mappings = load_mappings()
    if from_name.lower() in mappings['grocery_mappings']:
        del mappings['grocery_mappings'][from_name.lower()]
        save_mappings(mappings)
        print(f"✓ Șters: '{from_name}'")
    else:
        print(f"⚠ Nu există mapare pentru '{from_name}'")

def main():
    if len(sys.argv) < 2:
        print("Utilizare:")
        print("  python manage_mappings.py list")
        print("  python manage_mappings.py add <nume_original> <nume_notion>")
        print("  python manage_mappings.py remove <nume_original>")
        print("\nExemple:")
        print("  python manage_mappings.py add 'sunflower oil' 'Olive Oil'")
        print("  python manage_mappings.py remove 'sunflower oil'")
        sys.exit(1)
    
    command = sys.argv[1].lower()
    
    if command == 'list':
        list_mappings()
    elif command == 'add':
        if len(sys.argv) < 4:
            print("Eroare: Specifică <nume_original> și <nume_notion>")
            sys.exit(1)
        add_mapping(sys.argv[2], sys.argv[3])
    elif command == 'remove':
        if len(sys.argv) < 3:
            print("Eroare: Specifică <nume_original>")
            sys.exit(1)
        remove_mapping(sys.argv[2])
    else:
        print(f"Comandă necunoscută: {command}")
        sys.exit(1)

if __name__ == '__main__':
    main()
