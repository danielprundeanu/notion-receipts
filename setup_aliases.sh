#!/bin/zsh
# Setup script pentru Notion Recipes aliases

# Elimină vechile aliasuri
sed -i.backup '/# Notion Recipes/,/^$/d' ~/.zshrc

# Adaugă noile aliasuri
cat << 'EOF' >> ~/.zshrc

# Notion Recipes - Workflow aliases
alias notion-cd='cd /Users/danielprundeanu/Documents/GitHub/notion'

# Scraping & Parsing
alias notion-scrape='cd /Users/danielprundeanu/Documents/GitHub/notion && source .venv/bin/activate && python scripts/scrape_recipes.py data/recipe_urls.txt data/scraped_recipes.txt'
alias notion-parse='cd /Users/danielprundeanu/Documents/GitHub/notion && source .venv/bin/activate && python scripts/parse_local_recipes.py'

# Import & Steps
notion-import() {
    cd /Users/danielprundeanu/Documents/GitHub/notion && source .venv/bin/activate && python scripts/import_recipes.py "${@:-data/scraped_recipes.txt}"
}
alias notion-steps='cd /Users/danielprundeanu/Documents/GitHub/notion && source .venv/bin/activate && python scripts/import_recipes.py data/scraped_recipes.txt --steps'
alias notion-update-metadata='cd /Users/danielprundeanu/Documents/GitHub/notion && source .venv/bin/activate && python scripts/update_recipe_metadata.py data/scraped_recipes.txt'

# Testing
alias notion-test='cd /Users/danielprundeanu/Documents/GitHub/notion && source .venv/bin/activate && python scripts/import_recipes.py data/test/test_recipe.txt'
alias notion-test-steps='cd /Users/danielprundeanu/Documents/GitHub/notion && source .venv/bin/activate && python scripts/import_recipes.py data/test/test_recipe.txt --steps'

# File viewing/editing
alias notion-view='cat /Users/danielprundeanu/Documents/GitHub/notion/data/scraped_recipes.txt'
alias notion-edit='code /Users/danielprundeanu/Documents/GitHub/notion/data/scraped_recipes.txt'
alias notion-urls='code /Users/danielprundeanu/Documents/GitHub/notion/data/recipe_urls.txt'

# Mappings management
alias notion-mappings='cd /Users/danielprundeanu/Documents/GitHub/notion && source .venv/bin/activate && python scripts/manage_mappings.py list'
alias notion-map-add='cd /Users/danielprundeanu/Documents/GitHub/notion && source .venv/bin/activate && python scripts/manage_mappings.py add'
alias notion-map-remove='cd /Users/danielprundeanu/Documents/GitHub/notion && source .venv/bin/activate && python scripts/manage_mappings.py remove'
alias notion-map-edit='code /Users/danielprundeanu/Documents/GitHub/notion/data/ingredient_mappings.json'

# Image management
alias notion-images='cd /Users/danielprundeanu/Documents/GitHub/notion && source .venv/bin/activate && python scripts/upload_cover.py list'

# Help
alias notion-help='cat /Users/danielprundeanu/Documents/GitHub/notion/COMMANDS.md'

EOF

echo "✅ Aliasuri actualizate în ~/.zshrc"
echo "🔄 Rulează: source ~/.zshrc"
