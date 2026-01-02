#!/usr/bin/env bash
# E2E Test Configuration
# This file is sourced by other scripts to get service URLs

# Kubernetes namespaces
export PRODUCT_CATALOG_NS="${PRODUCT_CATALOG_NS:-product-catalog}"
export BASKET_NS="${BASKET_NS:-basket}"
export ORDER_NS="${ORDER_NS:-order}"

# Service names
export PRODUCT_CATALOG_SVC="${PRODUCT_CATALOG_SVC:-product-catalog}"
export BASKET_SVC="${BASKET_SVC:-basket}"
export ORDER_SVC="${ORDER_SVC:-order}"

# Service ports (internal)
export PRODUCT_CATALOG_PORT="${PRODUCT_CATALOG_PORT:-8000}"
export BASKET_PORT="${BASKET_PORT:-8083}"
export ORDER_PORT="${ORDER_PORT:-8080}"

# Istio configuration
export ISTIO_NS="${ISTIO_NS:-istio-system}"
export ISTIO_INGRESS_SVC="${ISTIO_INGRESS_SVC:-istio-ingressgateway}"

# Health check endpoints
export PRODUCT_CATALOG_HEALTH="/health"
export BASKET_HEALTH="/health"
export ORDER_HEALTH="/actuator/health"

# OAuth2 (disabled by default for E2E tests)
export OAUTH2_ENABLED="${OAUTH2_ENABLED:-false}"

#------------------------------------------------------------------------------
# Auto-detect service URLs from Istio or NodePort
#------------------------------------------------------------------------------

detect_service_urls() {
    local ingress_host=""
    local ingress_port=""

    # Try to get Istio ingress gateway
    if kubectl get svc "$ISTIO_INGRESS_SVC" -n "$ISTIO_NS" &>/dev/null; then
        # Get LoadBalancer IP
        ingress_host=$(kubectl get svc "$ISTIO_INGRESS_SVC" -n "$ISTIO_NS" \
            -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null) || true

        # Try hostname if no IP
        if [[ -z "$ingress_host" ]]; then
            ingress_host=$(kubectl get svc "$ISTIO_INGRESS_SVC" -n "$ISTIO_NS" \
                -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null) || true
        fi

        # Get NodePort if LoadBalancer not available
        if [[ -z "$ingress_host" ]]; then
            ingress_host=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}' 2>/dev/null) || true
            ingress_port=$(kubectl get svc "$ISTIO_INGRESS_SVC" -n "$ISTIO_NS" \
                -o jsonpath='{.spec.ports[?(@.name=="http2")].nodePort}' 2>/dev/null) || true
        fi

        if [[ -n "$ingress_host" ]]; then
            local base_url="http://${ingress_host}${ingress_port:+:$ingress_port}"
            export PRODUCT_CATALOG_URL="${PRODUCT_CATALOG_URL:-$base_url}"
            export BASKET_URL="${BASKET_URL:-$base_url}"
            export ORDER_URL="${ORDER_URL:-$base_url}"
            return 0
        fi
    fi

    # Fallback: Try NodePort for each service directly
    local node_ip
    node_ip=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}' 2>/dev/null) || true

    if [[ -n "$node_ip" ]]; then
        local pc_nodeport basket_nodeport order_nodeport

        pc_nodeport=$(kubectl get svc "$PRODUCT_CATALOG_SVC" -n "$PRODUCT_CATALOG_NS" \
            -o jsonpath='{.spec.ports[0].nodePort}' 2>/dev/null) || true
        basket_nodeport=$(kubectl get svc "$BASKET_SVC" -n "$BASKET_NS" \
            -o jsonpath='{.spec.ports[0].nodePort}' 2>/dev/null) || true
        order_nodeport=$(kubectl get svc "$ORDER_SVC" -n "$ORDER_NS" \
            -o jsonpath='{.spec.ports[0].nodePort}' 2>/dev/null) || true

        if [[ -n "$pc_nodeport" ]]; then
            export PRODUCT_CATALOG_URL="${PRODUCT_CATALOG_URL:-http://${node_ip}:${pc_nodeport}}"
        fi
        if [[ -n "$basket_nodeport" ]]; then
            export BASKET_URL="${BASKET_URL:-http://${node_ip}:${basket_nodeport}}"
        fi
        if [[ -n "$order_nodeport" ]]; then
            export ORDER_URL="${ORDER_URL:-http://${node_ip}:${order_nodeport}}"
        fi

        return 0
    fi

    # Final fallback: localhost with default ports
    export PRODUCT_CATALOG_URL="${PRODUCT_CATALOG_URL:-http://localhost:${PRODUCT_CATALOG_PORT}}"
    export BASKET_URL="${BASKET_URL:-http://localhost:${BASKET_PORT}}"
    export ORDER_URL="${ORDER_URL:-http://localhost:${ORDER_PORT}}"
}

# Auto-detect URLs when this script is sourced
detect_service_urls
