#!/bin/bash
set -euo pipefail

# Only run in remote (Claude Code on the web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

echo "Installing webapp dependencies..."
cd "$CLAUDE_PROJECT_DIR/webapp"
npm install

echo "Session start hook completed."
