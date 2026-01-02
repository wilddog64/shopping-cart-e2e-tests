.PHONY: help install test test-api test-flows test-all test-headed test-debug test-report \
        lint format clean check-deps check-services port-forward port-forward-stop port-forward-status

# Directories
NODE_MODULES := node_modules
BIN_DIR := bin

help:
	@echo "E2E Integration Tests - Available targets:"
	@echo ""
	@echo "Setup:"
	@echo "  install              - Install dependencies and Playwright browsers"
	@echo "  clean                - Remove build artifacts"
	@echo ""
	@echo "Kubernetes/Istio:"
	@echo "  check-services       - Check if backend services are reachable (auto-detects URLs)"
	@echo "  show-endpoints       - Show k3s service endpoints and Istio config"
	@echo "  port-forward         - Start kubectl port-forward to services"
	@echo "  port-forward-stop    - Stop port-forwarding"
	@echo "  port-forward-status  - Check port-forward status"
	@echo ""
	@echo "Testing:"
	@echo "  test                 - Run all tests"
	@echo "  test-api             - Run API tests only"
	@echo "  test-flows           - Run flow tests only"
	@echo "  test-headed          - Run tests with browser visible"
	@echo "  test-debug           - Run tests in debug mode"
	@echo "  test-report          - Show HTML test report"
	@echo ""
	@echo "Code Quality:"
	@echo "  lint                 - Run ESLint"
	@echo "  format               - Format code with Prettier"
	@echo ""
	@echo "Note: Service URLs are auto-detected from k3s/Istio. Edit bin/config.sh to customize."

# Check if dependencies are installed
check-deps:
	@if [ ! -d "$(NODE_MODULES)" ]; then \
		echo "Dependencies not installed. Running 'make install'..."; \
		$(MAKE) install; \
	fi

#------------------------------------------------------------------------------
# Setup
#------------------------------------------------------------------------------

install:
	$(BIN_DIR)/setup.sh

clean:
	rm -rf node_modules test-results playwright-report dist

#------------------------------------------------------------------------------
# Kubernetes / Istio
#------------------------------------------------------------------------------

check-services:
	$(BIN_DIR)/check-services.sh

port-forward:
	$(BIN_DIR)/port-forward.sh start

port-forward-stop:
	$(BIN_DIR)/port-forward.sh stop

port-forward-status:
	$(BIN_DIR)/port-forward.sh status

show-endpoints:
	@echo "==> Kubernetes Service Endpoints"
	@echo ""
	@kubectl get svc -A -o wide | grep -E 'NAME|product-catalog|basket|order' || echo "No matching services found"
	@echo ""
	@echo "==> Istio Virtual Services"
	@kubectl get virtualservices -A 2>/dev/null || echo "No VirtualServices found (Istio may not be configured)"
	@echo ""
	@echo "==> Istio Gateway"
	@kubectl get gateways -A 2>/dev/null || echo "No Gateways found"

#------------------------------------------------------------------------------
# Testing (URLs are auto-detected from k3s/Istio)
#------------------------------------------------------------------------------

test: check-deps
	$(BIN_DIR)/run-tests.sh all

test-api: check-deps
	$(BIN_DIR)/run-tests.sh api

test-flows: check-deps
	$(BIN_DIR)/run-tests.sh flows

test-headed: check-deps
	$(BIN_DIR)/run-tests.sh all --headed

test-debug: check-deps
	$(BIN_DIR)/run-tests.sh all --debug

test-report:
	npx playwright show-report

# Run specific test file
# Usage: make test-file FILE=tests/api/cart.spec.ts
test-file: check-deps
	$(BIN_DIR)/run-tests.sh $(FILE)

#------------------------------------------------------------------------------
# Code Quality
#------------------------------------------------------------------------------

lint: check-deps
	npm run lint

format: check-deps
	npm run format

#------------------------------------------------------------------------------
# CI/CD Helpers
#------------------------------------------------------------------------------

# Run tests in CI mode (no interactive prompts, URLs from bin/config.sh)
test-ci: check-deps
	CI=true $(BIN_DIR)/run-tests.sh all --reporter=list,json

# Generate test report for CI
report-ci:
	npx playwright show-report --host 0.0.0.0
