#!/bin/zsh
# Setup script pentru Notion Recipes aliases

# Elimină vechile aliasuri
sed -i.backup '/# Notion Recipes/,/^$/d' ~/.zshrc

# Adaugă noile aliasuri
cat << 'EOF' >> ~/.zshrc

# Notion Recipes - Workflow aliases
alias notion-cd='cd /Users/danielprundeanu/Documents/GitHub/notion'

# Scraping (Web URLs or Local text files)
alias notion-scrape-url='cd /Users/danielprundeanu/Documents/GitHub/notion && source .venv/bin/activate && python scripts/scrape_recipes.py -url'
alias notion-scrape-local='cd /Users/danielprundeanu/Documents/GitHub/notion && source .venv/bin/activate && python scripts/scrape_recipes.py -local'
alias notion-scrape='notion-scrape-url'  # Default: scrape URLs

# Edit source files
alias notion-urls='code /Users/danielprundeanu/Documents/GitHub/notion/data/urls/recipe_urls.txt'
alias notion-local='code /Users/danielprundeanu/Documents/GitHub/notion/data/local/local_recipes.txt'

# Import & Steps
alias notion-import-url='cd /Users/danielprundeanu/Documents/GitHub/notion && source .venv/bin/activate && python scripts/import_recipes.py -url'
alias notion-import-local='cd /Users/danielprundeanu/Documents/GitHub/notion && source .venv/bin/activate && python scripts/import_recipes.py -local'
alias notion-import='notion-import-url'  # Default: import URLs

alias notion-steps-url='cd /Users/danielprundeanu/Documents/GitHub/notion && source .venv/bin/activate && python scripts/add_recipe_steps.py data/urls/scraped_recipe_urls.txt'
alias notion-steps-local='cd /Users/danielprundeanu/Documents/GitHub/notion && source .venv/bin/activate && python scripts/add_recipe_steps.py data/local/scraped_local_recipes.txt'
alias notion-steps='notion-steps-url'  # Default: steps for URLs

# Cleanup duplicate ingredients
alias notion-cleanup='cd /Users/danielprundeanu/Documents/GitHub/notion && source .venv/bin/activate && python scripts/cleanup_duplicate_ingredients.py'

# Update metadata
alias notion-update-metadata='cd /Users/danielprundeanu/Documents/GitHub/notion && source .venv/bin/activate && python scripts/update_recipe_metadata.py data/scraped_recipes.txt'

# Testing
alias notion-test='cd /Users/danielprundeanu/Documents/GitHub/notion && source .venv/bin/activate && python scripts/import_recipes.py data/test/test_recipe.txt'
alias notion-test-steps='cd /Users/danielprundeanu/Documents/GitHub/notion && source .venv/bin/activate && python scripts/import_recipes.py data/test/test_recipe.txt --steps'

# File viewing/editing
alias notion-view-urls='cat /Users/danielprundeanu/Documents/GitHub/notion/data/urls/scraped_recipe_urls.txt'
alias notion-view-local='cat /Users/danielprundeanu/Documents/GitHub/notion/data/local/scraped_local_recipes.txt'
alias notion-edit-urls='code /Users/danielprundeanu/Documents/GitHub/notion/data/urls/scraped_recipe_urls.txt'
alias notion-edit-local='code /Users/danielprundeanu/Documents/GitHub/notion/data/local/scraped_local_recipes.txt'

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
