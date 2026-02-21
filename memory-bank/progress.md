# Progress: Shopping Cart E2E Tests

## What's Built

### Project Infrastructure
- [x] Playwright TypeScript project scaffolding
- [x] `playwright.config.ts` with dual-project setup (`api` + `flows`)
- [x] `package.json` with all test scripts
- [x] `tsconfig.json` (strict TypeScript, CommonJS modules)
- [x] `.env.example` with all environment variables documented
- [x] `docker-compose.yml` for local service orchestration
- [x] `Makefile` with install, test, test-api, test-flows, test-debug, test-report targets
- [x] `.github/workflows/e2e-tests.yml` — daily schedule + manual trigger
- [x] `.gitignore` (playwright-report, test-results, node_modules, .env)

### Test Helpers
- [x] `tests/helpers/api-client.ts`
  - [x] `config` object with all service URLs from env
  - [x] Full TypeScript type definitions (Product, Cart, CartItem, Order, OrderItem, Payment, Refund, etc.)
  - [x] `ProductCatalogClient` class with listProducts, getProduct, createProduct, updateProduct, deleteProduct, checkHealth
  - [x] `BasketClient` class with getCart, addItem, updateItem, removeItem, clearCart, checkout, checkHealth
  - [x] `OrderClient` class with createOrder, getOrder, getOrdersByCustomer, updateOrderStatus, cancelOrder, checkHealth
  - [x] `PaymentClient` class with processPayment, getPayment, getPaymentByOrderId, getPaymentsByCustomer, refundPayment, checkHealth
- [x] `tests/helpers/auth.ts`
  - [x] `getAuthToken()` — Keycloak password grant with module-scope token caching
  - [x] `getAuthHeaders()` — returns Bearer token or X-User-ID fallback
  - [x] `clearTokenCache()` — utility for token refresh tests
  - [x] `isOAuth2Enabled()` — config check
- [x] `tests/helpers/cleanup.ts`
  - [x] `cleanupTestData()` — clear cart + optionally cancel PENDING orders
  - [x] `generateTestId()` — unique test user IDs (`e2e-<timestamp>-<random>`)
  - [x] `waitFor()` — polling utility with configurable timeout/interval

### Test Fixtures
- [x] `tests/fixtures/test-data.ts` — `testAddresses` and product data factories

### API Tests
- [x] `tests/api/products.spec.ts` — Product Catalog service API tests
- [x] `tests/api/cart.spec.ts` — Basket service API tests
- [x] `tests/api/orders.spec.ts` — Order service API tests
- [x] `tests/api/payments.spec.ts` — Payment service API tests
- [x] `tests/api/cross-service.spec.ts` — Cross-service data consistency tests

### Flow Tests
- [x] `tests/flows/shopping-flow.spec.ts` — 6 tests covering complete browse-to-order journeys
- [x] `tests/flows/checkout-flow.spec.ts` — Cart checkout and order creation flow
- [x] `tests/flows/payment-flow.spec.ts` — Payment processing flow
- [x] `tests/flows/order-management.spec.ts` — Order tracking and cancellation

### Utility Scripts
- [x] `bin/setup.sh` — environment setup
- [x] `bin/run-tests.sh` — test runner wrapper
- [x] `bin/check-services.sh` — pre-test service health verification
- [x] `bin/config.sh` — shared script configuration
- [x] `bin/port-forward.sh` — kubectl port-forward for K8s services
- [x] `scripts/init-db.sh` — test data seeding

## What's Pending

- [ ] Tests for RabbitMQ event-driven flows — once message queue is integrated into services, tests that verify async event propagation would be valuable (e.g., order.created event triggers payment processing)
- [ ] Frontend browser E2E tests — this repo focuses on API tests; UI flow tests using Playwright's browser mode could be added here or expanded in the frontend repo's `e2e/` directory
- [ ] Performance baseline tests — measuring response times and flagging regressions
- [ ] Contract tests — formal verification that service request/response shapes match the type definitions in `api-client.ts`

## Known Issues

1. **Payment service dependency**: The payment service (`PAYMENT_URL`) is a newer addition. Tests in `payments.spec.ts` and `payment-flow.spec.ts` will fail if the payment service is not running. Consider adding graceful skipping when the payment service is unavailable.

2. **Shared test user in API tests**: Some API tests use the default `config.testUserId` (`e2e-test-user`) rather than a generated unique ID. If multiple test runs happen simultaneously or the cart is not cleaned up properly, these tests may interfere.

3. **Database seeding required**: Flow tests that call `productClient.listProducts()` and skip when no products are found silently skip in environments with no data. CI should ensure the database is seeded (`scripts/init-db.sh`) before running tests.

4. **OAuth2 token cache is module-scoped**: The token cache in `auth.ts` lives at module scope. In parallel worker mode (`workers: 4` local), each worker has its own module scope, so token acquisition is duplicated per worker. This is benign but inefficient.

5. **Order status values discrepancy**: The `Order` type in `api-client.ts` uses `'PENDING' | 'PAID' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED'` while the frontend's `types/index.ts` uses `'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED'`. These should be reconciled against the actual Order service API contract.
