#!/usr/bin/env bash
# Port-forward k3s services for E2E testing
# Usage: ./bin/port-forward.sh [start|stop|status]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source configuration
source "$SCRIPT_DIR/config.sh"

PID_DIR="/tmp/e2e-port-forward"

start_port_forward() {
    mkdir -p "$PID_DIR"

    echo "==> Starting port-forward for Product Catalog..."
    kubectl port-forward "svc/$PRODUCT_CATALOG_SVC" "$PRODUCT_CATALOG_PORT:$PRODUCT_CATALOG_PORT" -n "$PRODUCT_CATALOG_NS" &>/dev/null &
    echo $! > "$PID_DIR/product-catalog.pid"

    echo "==> Starting port-forward for Basket Service..."
    kubectl port-forward "svc/$BASKET_SVC" "$BASKET_PORT:$BASKET_PORT" -n "$BASKET_NS" &>/dev/null &
    echo $! > "$PID_DIR/basket.pid"

    echo "==> Starting port-forward for Order Service..."
    kubectl port-forward "svc/$ORDER_SVC" "$ORDER_PORT:$ORDER_PORT" -n "$ORDER_NS" &>/dev/null &
    echo $! > "$PID_DIR/order.pid"

    sleep 2

    echo ""
    echo "Port-forwarding started:"
    echo "  Product Catalog: http://localhost:$PRODUCT_CATALOG_PORT"
    echo "  Basket Service:  http://localhost:$BASKET_PORT"
    echo "  Order Service:   http://localhost:$ORDER_PORT"
    echo ""
    echo "Run 'make port-forward-stop' to stop port-forwarding"
}

stop_port_forward() {
    echo "==> Stopping port-forward processes..."

    for pidfile in "$PID_DIR"/*.pid; do
        if [[ -f "$pidfile" ]]; then
            pid=$(cat "$pidfile")
            if kill -0 "$pid" 2>/dev/null; then
                kill "$pid" 2>/dev/null || true
                echo "Stopped PID $pid"
            fi
            rm -f "$pidfile"
        fi
    done

    # Also kill any remaining kubectl port-forward processes for our services
    pkill -f "kubectl port-forward.*$PRODUCT_CATALOG_SVC" 2>/dev/null || true
    pkill -f "kubectl port-forward.*$BASKET_SVC" 2>/dev/null || true
    pkill -f "kubectl port-forward.*$ORDER_SVC" 2>/dev/null || true

    echo "Port-forwarding stopped"
}

check_status() {
    echo "==> Port-forward status:"

    local running=0

    for pidfile in "$PID_DIR"/*.pid; do
        if [[ -f "$pidfile" ]]; then
            pid=$(cat "$pidfile")
            name=$(basename "$pidfile" .pid)
            if kill -0 "$pid" 2>/dev/null; then
                echo "  $name: running (PID $pid)"
                running=$((running + 1))
            else
                echo "  $name: stopped"
            fi
        fi
    done

    if [[ $running -eq 0 ]]; then
        echo "  No port-forward processes running"
    fi

    echo ""
    echo "Checking port availability:"
    for port in $PRODUCT_CATALOG_PORT $BASKET_PORT $ORDER_PORT; do
        if nc -z localhost "$port" 2>/dev/null; then
            echo "  Port $port: listening"
        else
            echo "  Port $port: not listening"
        fi
    done
}

case "${1:-start}" in
    start)
        start_port_forward
        ;;
    stop)
        stop_port_forward
        ;;
    status)
        check_status
        ;;
    restart)
        stop_port_forward
        sleep 1
        start_port_forward
        ;;
    *)
        echo "Usage: $0 [start|stop|status|restart]"
        exit 1
        ;;
esac
