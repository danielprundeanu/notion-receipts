#!/bin/zsh
# Script pentru setup aliases Notion Recipes - CLEAN VERSION

echo "🧹 Curățare aliases vechi..."

# Backup .zshrc
cp ~/.zshrc ~/.zshrc.backup_clean_$(date +%Y%m%d_%H%M%S)

# Elimină TOATE liniile care conțin "notion"
grep -iv "notion" ~/.zshrc > ~/.zshrc.tmp
mv ~/.zshrc.tmp ~/.zshrc

# Adaugă aliasurile noi
cat << 'EOF' >> ~/.zshrc

# ============================================================
# Notion Recipes - Workflow Commands
# ============================================================

# Navigation
alias notion-cd='cd /Users/danielprundeanu/Documents/GitHub/notion'

# Scraping function with -local/-urls flags
notion-scrape() {
    cd /Users/danielprundeanu/Documents/GitHub/notion && source .venv/bin/activate
    if [[ "$1" == "-local" ]]; then
        python scripts/scrape_recipes.py -local
    elif [[ "$1" == "-urls" ]]; then
        python scripts/scrape_recipes.py -url
    else
        echo "Usage: notion-scrape -urls | notion-scrape -local"
    fi
}

# Import function with -local/-urls flags
notion-import() {
    cd /Users/danielprundeanu/Documents/GitHub/notion && source .venv/bin/activate
    if [[ "$1" == "-local" ]]; then
        if [[ "$2" == "--steps" ]]; then
            python scripts/import_recipes.py -local --steps
        else
            python scripts/import_recipes.py -local
        fi
    elif [[ "$1" == "-urls" ]]; then
        if [[ "$2" == "--steps" ]]; then
            python scripts/import_recipes.py -url --steps
        else
            python scripts/import_recipes.py -url
        fi
    else
        echo "Usage: notion-import -urls | notion-import -local"
        echo "       notion-import -urls --steps | notion-import -local --steps"
    fi
}

# Edit source files
alias notion-urls='code /Users/danielprundeanu/Documents/GitHub/notion/data/urls/recipe_urls.txt'
alias notion-local-edit='code /Users/danielprundeanu/Documents/GitHub/notion/data/local/local_recipes.txt'

# View scraped output
alias notion-view-urls='cat /Users/danielprundeanu/Documents/GitHub/notion/data/urls/scraped_recipe_urls.txt'
alias notion-view-local='cat /Users/danielprundeanu/Documents/GitHub/notion/data/local/scraped_local_recipes.txt'

# Edit scraped output in VS Code
alias notion-edit-urls='code /Users/danielprundeanu/Documents/GitHub/notion/data/urls/scraped_recipe_urls.txt'
alias notion-edit-local='code /Users/danielprundeanu/Documents/GitHub/notion/data/local/scraped_local_recipes.txt'

# Metadata update
alias notion-update-metadata='cd /Users/danielprundeanu/Documents/GitHub/notion && source .venv/bin/activate && python scripts/update_recipe_metadata.py data/scraped_recipes.txt'

# Mappings management
alias notion-mappings='cd /Users/danielprundeanu/Documents/GitHub/notion && source .venv/bin/activate && python scripts/manage_mappings.py list'
alias notion-map-add='cd /Users/danielprundeanu/Documents/GitHub/notion && source .venv/bin/activate && python scripts/manage_mappings.py add'
alias notion-map-remove='cd /Users/danielprundeanu/Documents/GitHub/notion && source .venv/bin/activate && python scripts/manage_mappings.py remove'
alias notion-map-edit='code /Users/danielprundeanu/Documents/GitHub/notion/data/ingredient_mappings.json'

# Images
alias notion-images='cd /Users/danielprundeanu/Documents/GitHub/notion && source .venv/bin/activate && python scripts/upload_cover.py list'

# Help
alias notion-help='cat /Users/danielprundeanu/Documents/GitHub/notion/COMMANDS.md'

EOF

echo ""
echo "✅ Aliasuri create cu succes!"
echo ""
echo "📋 Comenzi disponibile:"
echo "  notion-scrape -local     # Scrape din data/local/local_recipes.txt"
echo "  notion-scrape -urls      # Scrape din data/urls/recipe_urls.txt"
echo "  notion-import -local     # Import din data/local/scraped_local_recipes.txt"
echo "  notion-import -urls      # Import din data/urls/scraped_recipe_urls.txt"
echo "  notion-import -local --steps    # Adaugă steps pentru local"
echo "  notion-import -urls --steps     # Adaugă steps pentru urls"
echo ""
echo "🔄 Rulează: source ~/.zshrc"
