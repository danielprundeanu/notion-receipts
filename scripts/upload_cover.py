"""
Script pentru uploadarea imaginilor de cover în Notion.
Notion API nu suportă upload direct de fișiere pentru cover, 
dar putem folosi un serviciu temporar sau instrucțiuni pentru upload manual.
"""
import os
import sys
from pathlib import Path

def get_upload_instructions(image_path: str, recipe_name: str):
    """Afișează instrucțiuni pentru uploadarea manuală a imaginii"""
    if not os.path.exists(image_path):
        print(f"❌ Fișierul '{image_path}' nu există!")
        return
    
    abs_path = os.path.abspath(image_path)
    
    print(f"\n{'='*60}")
    print(f"📸 UPLOAD COVER IMAGE PENTRU: {recipe_name}")
    print(f"{'='*60}\n")
    print("Notion API nu suportă upload direct de fișiere în cover.")
    print("Trebuie să uploadezi manual imaginea:\n")
    print("OPȚIUNEA 1 - Upload manual în Notion:")
    print("  1. Deschide rețeta în Notion")
    print("  2. Click pe 'Add cover'")
    print("  3. Selectează 'Upload'")
    print(f"  4. Alege fișierul: {abs_path}\n")
    print("OPȚIUNEA 2 - Folosește un serviciu de hosting:")
    print("  1. Uploadează imaginea pe imgur.com, cloudinary.com etc.")
    print("  2. Copiază URL-ul public")
    print("  3. Folosește-l ca Image URL în fișierul .txt\n")
    print(f"Path complet: {abs_path}")
    print(f"{'='*60}\n")

def list_downloaded_images():
    """Listează toate imaginile descărcate în img/"""
    img_dir = Path('img')
    if not img_dir.exists():
        print("❌ Directorul 'img/' nu există!")
        return
    
    images = list(img_dir.glob('*'))
    images = [img for img in images if img.suffix.lower() in ['.jpg', '.jpeg', '.png', '.gif', '.webp']]
    
    if not images:
        print("❌ Nu s-au găsit imagini în 'img/'!")
        return
    
    print(f"\n{'='*60}")
    print(f"📸 IMAGINI DESCĂRCATE ({len(images)} fișiere)")
    print(f"{'='*60}\n")
    
    for img in sorted(images):
        size_kb = img.stat().st_size / 1024
        print(f"  • {img.name} ({size_kb:.1f} KB)")
    
    print(f"\n{'='*60}\n")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Utilizare:")
        print("  python upload_cover.py list                      # Listează imagini")
        print("  python upload_cover.py <image_path> <recipe_name> # Instrucțiuni upload")
        print("\nExemplu:")
        print("  python upload_cover.py img/Spiced_Beef_Tacos_abc123.jpg 'Spiced Beef Tacos'")
        sys.exit(1)
    
    if sys.argv[1] == 'list':
        list_downloaded_images()
    else:
        image_path = sys.argv[1]
        recipe_name = sys.argv[2] if len(sys.argv) > 2 else "Rețeta"
        get_upload_instructions(image_path, recipe_name)
