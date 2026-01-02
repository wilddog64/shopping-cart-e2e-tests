# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

**Shopping Cart E2E Tests** is the platform-level end-to-end integration test suite for the Shopping Cart microservices platform. It validates complete user journeys across all services.

## Technology Stack

- **Framework**: Playwright (TypeScript)
- **Node.js**: 18+
- **Test Types**: API tests, Flow tests

## Services Under Test

| Service | Technology | Port | Health Check |
|---------|------------|------|--------------|
| Product Catalog | Python/FastAPI | 8000 | GET /health |
| Basket | Go/Gin | 8083 | GET /health |
| Order | Java/Spring Boot | 8080 | GET /actuator/health |
| Frontend | React/Vite | 3000 | N/A |

## Repository Structure

```
shopping-cart-e2e-tests/
├── tests/
│   ├── api/                  # API-level tests
│   │   ├── products.spec.ts  # Product catalog API
│   │   ├── cart.spec.ts      # Basket API
│   │   ├── orders.spec.ts    # Order API
│   │   └── cross-service.spec.ts
│   ├── flows/                # User journey tests
│   │   ├── shopping-flow.spec.ts
│   │   ├── checkout-flow.spec.ts
│   │   └── order-management.spec.ts
│   ├── fixtures/             # Test data factories
│   │   └── test-data.ts
│   └── helpers/              # Utility functions
│       ├── api-client.ts     # Typed API clients
│       ├── auth.ts           # Authentication helpers
│       └── cleanup.ts        # Test data cleanup
├── playwright.config.ts
├── package.json
└── Makefile
```

## Common Commands

```bash
# Install dependencies
make install

# Run all tests
make test

# Run API tests only
make test-api

# Run flow tests only
make test-flows

# Debug mode
make test-debug

# View report
make test-report
```

## Key Patterns

### API Client Pattern

Each service has a typed client in `tests/helpers/api-client.ts`:

```typescript
export class ProductCatalogClient {
  constructor(private baseUrl: string, private request: APIRequestContext) {}

  async listProducts() { ... }
  async getProduct(id: string) { ... }
  async createProduct(data: CreateProductRequest) { ... }
}
```

### Test Data Management

- Tests use `TEST_USER_ID` environment variable for isolation
- `cleanupTestData()` runs after each test
- Cart is cleared after checkout tests

### Authentication

When `OAUTH2_ENABLED=true`:
- Uses Keycloak for JWT tokens
- `getAuthToken()` helper handles token acquisition
- Tokens are cached for performance

When `OAUTH2_ENABLED=false` (default):
- Uses `X-User-ID` header for user identification
- No token required

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PRODUCT_CATALOG_URL` | Yes | Product service URL |
| `BASKET_URL` | Yes | Basket service URL |
| `ORDER_URL` | Yes | Order service URL |
| `TEST_USER_ID` | No | Test user ID (default: e2e-test-user) |
| `OAUTH2_ENABLED` | No | Enable JWT auth (default: false) |

## Test Guidelines

1. **Independence**: Each test should be independent
2. **Cleanup**: Always clean up test data
3. **Assertions**: Use specific assertions, not just status codes
4. **Timeouts**: API tests should complete in < 5 seconds each
5. **Naming**: Use descriptive test names

## Adding New Tests

### API Test

```typescript
// tests/api/new-feature.spec.ts
import { test, expect } from '@playwright/test'
import { SomeClient } from '../helpers/api-client'

const BASE_URL = process.env.SERVICE_URL || 'http://localhost:8000'

test.describe('New Feature API', () => {
  test('should do something', async ({ request }) => {
    const client = new SomeClient(BASE_URL, request)
    const result = await client.someMethod()
    expect(result.status).toBe('success')
  })
})
```

### Flow Test

```typescript
// tests/flows/new-flow.spec.ts
import { test, expect } from '@playwright/test'
import { ProductCatalogClient, BasketClient } from '../helpers/api-client'
import { cleanupTestData } from '../helpers/cleanup'

test.describe('New User Flow', () => {
  test.afterEach(async ({ request }) => {
    await cleanupTestData(request)
  })

  test('complete journey', async ({ request }) => {
    // Multi-service test implementation
  })
})
```

## Troubleshooting

### Test Timeouts

Increase timeout in playwright.config.ts or per-test:

```typescript
test('slow test', async ({ request }) => {
  test.setTimeout(120000)
  // ...
})
```

### Service Unavailable

Check service health endpoints:

```bash
curl $PRODUCT_CATALOG_URL/health
curl $BASKET_URL/health
curl $ORDER_URL/actuator/health
```

### Flaky Tests

1. Add explicit waits if needed
2. Check for race conditions
3. Ensure proper cleanup between tests

## CI/CD

Tests run via GitHub Actions:

- **Trigger**: Daily at 6 AM UTC, or manual
- **Environment**: Ubuntu latest, Node 20
- **Services**: Must be running and accessible

## Related Documentation

- [Playwright Docs](https://playwright.dev/)
- [Shopping Cart Architecture](../shopping-cart/docs/architecture/)
- [API Documentation](../shopping-cart/docs/api/)
