# Active Context: Shopping Cart E2E Tests

## Current State

The E2E test suite is fully implemented with both API-level and flow-level test coverage across all backend services. The suite is operational and runs in CI on a daily schedule.

## Implemented Tests

### API Tests (`tests/api/`)
- `products.spec.ts` — Product Catalog CRUD: list products, get by ID, create, update, filter by category, pagination
- `cart.spec.ts` — Basket API: get cart, add items, update quantity, remove items, clear cart, checkout
- `orders.spec.ts` — Order API: create order, get order, list by customer, update status, cancel order
- `payments.spec.ts` — Payment API: process payment, get payment, get by order ID, refund
- `cross-service.spec.ts` — Data consistency: product IDs from cart match Product Catalog, order totals match cart totals

### Flow Tests (`tests/flows/`)
- `shopping-flow.spec.ts` — 6 tests covering: single item journey, multi-item journey, quantity updates, item removal, category browse, paginated browsing
- `checkout-flow.spec.ts` — Cart to order creation with payment integration
- `payment-flow.spec.ts` — Payment processing, status verification, refund flow
- `order-management.spec.ts` — Order lifecycle: status tracking, cancellation

### Helpers
- `tests/helpers/api-client.ts` — Typed clients for all 4 services + full type definitions (`Product`, `Cart`, `Order`, `Payment`, etc.)
- `tests/helpers/auth.ts` — OAuth2 token acquisition with caching; `getAuthHeaders()` and `getAuthToken()` exports
- `tests/helpers/cleanup.ts` — `cleanupTestData()` with cart clear + order cancel options; `generateTestId()` for test isolation; `waitFor()` polling utility

### Fixtures
- `tests/fixtures/test-data.ts` — `testAddresses` with USA and other address variants

## Configuration State

- Default mode: `OAUTH2_ENABLED=false` (X-User-ID header auth)
- Local default ports match service defaults: 8000, 8083, 8080, 8084
- CI: 1 worker, 2 retries, daily 6 AM UTC schedule

## Active Areas of Work

The test suite appears complete. Potential areas for future expansion:
1. Additional edge case tests in payment flow (failed payments, partial refunds)
2. Tests for the RabbitMQ event pipeline once message queue is fully integrated into services
3. Load test scripts (currently documented in `shopping-cart-infra` but not in this repo)
4. Browser-based Playwright tests for the frontend SPA (currently only API tests — the frontend's own `e2e/` has UI tests)

## Known Integration Dependencies

The tests depend on the following being running and accessible:
- Product Catalog seeded with at least some products (tests skip gracefully if empty)
- Basket service connected to Redis
- Order service connected to PostgreSQL
- Payment service running (new addition to the platform)

If `OAUTH2_ENABLED=true`, Keycloak must be running with:
- Realm: `shopping-cart`
- Client: `e2e-tests` with client secret configured
- Test user: `e2e-user` / `e2e-password` credentials

## Recent Changes Observed

- Payment service tests (`payments.spec.ts`) were added — this is a newer service not present in the original platform description
- Payment client class added to `api-client.ts` with full payment and refund type definitions
- `payment-flow.spec.ts` added to flow tests
