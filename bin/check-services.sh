#!/usr/bin/env bash
# Check health of backend services
# Usage: ./bin/check-services.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source configuration (auto-detects service URLs)
source "$SCRIPT_DIR/config.sh"

echo "==> Service URLs (auto-detected)"
echo "    Product Catalog: $PRODUCT_CATALOG_URL"
echo "    Basket Service:  $BASKET_URL"
echo "    Order Service:   $ORDER_URL"
echo ""

echo "==> Checking service health..."
echo ""

check_service() {
    local name="$1"
    local url="$2"
    local health_path="$3"

    printf "%-20s %s " "$name:" "${url}${health_path}"

    local http_code
    http_code=$(curl -sf -o /dev/null -w "%{http_code}" "${url}${health_path}" 2>/dev/null) || http_code="000"

    if [[ "$http_code" == "200" ]]; then
        echo "✓ OK"
        return 0
    elif [[ "$http_code" == "000" ]]; then
        echo "✗ Connection refused"
        return 1
    else
        echo "✗ HTTP $http_code"
        return 1
    fi
}

FAILED=0

check_service "Product Catalog" "$PRODUCT_CATALOG_URL" "$PRODUCT_CATALOG_HEALTH" || FAILED=$((FAILED + 1))
check_service "Basket Service" "$BASKET_URL" "$BASKET_HEALTH" || FAILED=$((FAILED + 1))
check_service "Order Service" "$ORDER_URL" "$ORDER_HEALTH" || FAILED=$((FAILED + 1))

echo ""

if [[ $FAILED -eq 0 ]]; then
    echo "All services are healthy!"
    exit 0
else
    echo "$FAILED service(s) not reachable."
    echo ""
    echo "Troubleshooting:"
    echo "  1. Check if services are deployed: kubectl get pods -A"
    echo "  2. Check service endpoints: make show-endpoints"
    echo "  3. Check service logs: kubectl logs -n <namespace> <pod>"
    exit 1
fi
