#!/usr/bin/env bash
# Run E2E tests with auto-detected service URLs
# Usage: ./bin/run-tests.sh [api|flows|all] [additional playwright args]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Source configuration (auto-detects service URLs)
source "$SCRIPT_DIR/config.sh"

cd "$PROJECT_DIR"

# Test suite to run
SUITE="${1:-all}"
shift 2>/dev/null || true

echo "==> E2E Test Configuration"
echo "    Product Catalog: $PRODUCT_CATALOG_URL"
echo "    Basket Service:  $BASKET_URL"
echo "    Order Service:   $ORDER_URL"
echo "    OAuth2 Enabled:  $OAUTH2_ENABLED"
echo ""

# Check if services are reachable
check_service() {
    local name="$1"
    local url="$2"
    local health_path="$3"

    if curl -sf "${url}${health_path}" >/dev/null 2>&1; then
        echo "    ✓ $name is reachable"
        return 0
    else
        echo "    ✗ $name is NOT reachable at ${url}${health_path}"
        return 1
    fi
}

echo "==> Checking service connectivity..."
SERVICES_OK=true
check_service "Product Catalog" "$PRODUCT_CATALOG_URL" "$PRODUCT_CATALOG_HEALTH" || SERVICES_OK=false
check_service "Basket Service" "$BASKET_URL" "$BASKET_HEALTH" || SERVICES_OK=false
check_service "Order Service" "$ORDER_URL" "$ORDER_HEALTH" || SERVICES_OK=false
echo ""

if [[ "$SERVICES_OK" != "true" ]]; then
    echo "WARNING: Some services are not reachable. Tests may fail."
    echo ""
    if [[ "${CI:-false}" == "true" ]]; then
        echo "CI mode: continuing despite unreachable services"
    else
        read -p "Continue anyway? [y/N] " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
fi

echo "==> Running E2E tests (suite: $SUITE)..."
echo ""

case "$SUITE" in
    api)
        npx playwright test --project=api "$@"
        ;;
    flows)
        npx playwright test --project=flows "$@"
        ;;
    all)
        npx playwright test "$@"
        ;;
    *)
        # Treat as a specific test file or pattern
        npx playwright test "$SUITE" "$@"
        ;;
esac
