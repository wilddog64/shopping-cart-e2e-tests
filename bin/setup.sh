#!/usr/bin/env bash
# Setup script for E2E tests
# Installs dependencies and Playwright browser

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "==> Installing npm dependencies..."
if [[ -f "package-lock.json" ]]; then
    npm ci
else
    npm install
fi

echo "==> Installing Playwright browser (chromium)..."
npx playwright install chromium

echo "==> Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Check services: make check-services"
echo "  2. Run tests: make test"
