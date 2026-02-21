# System Patterns: Shopping Cart E2E Tests

## Project Structure

```
tests/
├── api/             # Layer 1: Individual service API tests
├── flows/           # Layer 2: Multi-service integration tests
├── fixtures/        # Shared test data factories
└── helpers/         # Shared utilities (clients, auth, cleanup)
```

The `api` project is a dependency of `flows` in Playwright config — flow tests should only run if API tests pass first.

## Typed API Client Pattern

Each backend service is represented by a typed class in `tests/helpers/api-client.ts`. This is the central abstraction — test files never call Playwright's `request.get/post` directly.

```typescript
export class BasketClient {
  constructor(
    private baseUrl: string,
    private request: APIRequestContext,
    private userId: string = config.testUserId
  ) {}

  private getHeaders() {
    return { 'X-User-ID': this.userId }
  }

  async getCart(): Promise<Cart>         { ... }
  async addItem(item): Promise<Cart>     { ... }
  async updateItem(id, data): Promise<Cart> { ... }
  async removeItem(id): Promise<Cart>    { ... }
  async clearCart(): Promise<void>       { ... }
  async checkout(address): Promise<Cart> { ... }
  async checkHealth(): Promise<{status:string}> { ... }
}
```

All four clients follow this pattern:
- `ProductCatalogClient` — `/api/products` (no auth header, public API)
- `BasketClient` — `/api/v1/cart` (uses `X-User-ID` header)
- `OrderClient` — `/api/orders` (uses `X-User-ID` + `X-Correlation-ID` headers)
- `PaymentClient` — `/api/payments` (uses `X-User-ID` + `X-Correlation-ID` headers)

`config` object centralizes all service base URLs, read from environment variables.

## Test Isolation Pattern

Each test that creates mutable state must generate a unique user ID to prevent interference:

```typescript
test.beforeEach(async ({ request }) => {
  testUserId = generateTestId()  // e2e-<timestamp>-<random>
  basketClient = new BasketClient(config.basketUrl, request, testUserId)
  orderClient = new OrderClient(config.orderUrl, request, testUserId)
})

test.afterEach(async ({ request }) => {
  await cleanupTestData(request, { userId: testUserId, cancelOrders: true })
})
```

`generateTestId()` returns `e2e-<Date.now()>-<random>` ensuring uniqueness within a test run.

## Cleanup Pattern

`cleanupTestData()` in `tests/helpers/cleanup.ts` accepts options:

```typescript
cleanupTestData(request, {
  clearCart: true,       // default: true — DELETE /api/v1/cart
  cancelOrders: false,   // default: false — cancel PENDING orders via Order API
  userId: testUserId,    // override user (defaults to config.testUserId)
})
```

Cleanup errors are caught and silently ignored (cart may not exist, order may already be cancelled). This is intentional — cleanup should not cause test failures.

## Authentication Pattern

The `tests/helpers/auth.ts` module handles two modes:

**Mode 1: `OAUTH2_ENABLED=false` (default)**
- No token acquisition
- Auth headers: `{ 'X-User-ID': testUserId }`
- Services use the user ID from this header for request scoping

**Mode 2: `OAUTH2_ENABLED=true`**
- Uses Keycloak password grant (`grant_type: password`)
- Token acquired once and cached in module scope
- Cache expires 30 seconds before token expiry to prevent race conditions
- Returns `Authorization: Bearer <token>` header
- Falls back to `X-User-ID` if token acquisition fails

```typescript
export async function getAuthHeaders(request): Promise<Record<string, string>> {
  const token = await getAuthToken(request)
  if (token) return { Authorization: `Bearer ${token}` }
  return { 'X-User-ID': process.env.TEST_USER_ID || 'e2e-test-user' }
}
```

## Test Data Pattern

`tests/fixtures/test-data.ts` contains:
- `testAddresses` — pre-built `ShippingAddress` objects (USA, UK, etc.)
- Product data factories for creating test products

Tests that need products call `productClient.listProducts()` first and skip if no products are found (rather than creating products, which would pollute shared state).

## Flow Test Pattern

Flow tests follow a step-by-step narrative matching real user journeys:

```typescript
test('complete shopping journey - single item', async () => {
  // Step 1: Browse products
  const productList = await productClient.listProducts({ page_size: 10 })
  expect(productList.items.length).toBeGreaterThan(0)

  // Step 2: Add to cart
  await basketClient.addItem({ productId, name, quantity: 1, unitPrice })

  // Step 3: Verify cart
  const cart = await basketClient.getCart()
  expect(cart.items).toHaveLength(1)

  // Step 4: Create order
  const order = await orderClient.createOrder({ customerId: testUserId, items, shippingAddress })
  expect(order.status).toBe('PENDING')

  // Step 5: Verify order
  const retrieved = await orderClient.getOrder(order.id)
  expect(retrieved.id).toBe(order.id)

  // Step 6: Clear cart
  await basketClient.clearCart()
})
```

## Cross-Service Consistency Tests

`tests/api/cross-service.spec.ts` validates data integrity across service boundaries:
- Product data referenced in a cart item matches the Product Catalog
- Order total matches sum of cart items at checkout time
- Order status transitions are consistent

## Graceful Skipping Pattern

When required preconditions cannot be met, tests skip rather than fail:

```typescript
const products = await productClient.listProducts({ page_size: 3 })
if (products.items.length < 3) {
  test.skip()
  return
}
```

This prevents false failures in environments with sparse test data.

## Report Output

After each test run:
- HTML report: `playwright-report/index.html`
- JSON results: `test-results/results.json`
- Screenshots on failure: `test-results/`
- Traces on first retry: `test-results/` (`.zip` files)
