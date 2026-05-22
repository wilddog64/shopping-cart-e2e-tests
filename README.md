# Shopping Cart E2E Tests

End-to-end integration tests for the Shopping Cart microservices platform.

## Overview

This repository contains comprehensive E2E tests that validate the complete shopping cart platform across all services:

- **Product Catalog** (Python/FastAPI) - Product listing and inventory
- **Basket Service** (Go/Gin) - Cart management
- **Order Service** (Java/Spring Boot) - Order processing
- **Frontend** (React/Vite) - User interface

## Prerequisites

- Node.js 18+
- npm or yarn
- Running instances of all services (local or remote)

## Quick Start

```bash
# Install dependencies
make install

# Copy environment template
cp .env.example .env

# Edit .env with your service URLs
# Then run tests
make test
```

## Test Categories

### API Tests (`tests/api/`)

Direct API testing for each service:

- `products.spec.ts` - Product catalog CRUD operations
- `cart.spec.ts` - Cart add/update/remove operations
- `orders.spec.ts` - Order creation and management
- `cross-service.spec.ts` - Data consistency across services

### Flow Tests (`tests/flows/`)

Complete user journey tests:

- `shopping-flow.spec.ts` - Browse → Add to Cart → Checkout
- `checkout-flow.spec.ts` - Cart → Payment → Order confirmation
- `order-management.spec.ts` - Order tracking and cancellation

## Running Tests

```bash
# All tests
make test

# API tests only
make test-api

# Flow tests only
make test-flows

# With browser visible
make test-headed

# Debug mode
make test-debug

# View HTML report
make test-report
```

## Configuration

Environment variables (see `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `PRODUCT_CATALOG_URL` | http://localhost:8000 | Product service URL |
| `BASKET_URL` | http://localhost:8083 | Basket service URL |
| `ORDER_URL` | http://localhost:8080 | Order service URL |
| `FRONTEND_URL` | http://localhost:3000 | Frontend URL |
| `TEST_USER_ID` | e2e-test-user | Test user identifier |
| `OAUTH2_ENABLED` | false | Enable OAuth2 authentication |

## CI/CD

Tests run automatically via GitHub Actions:

- **Scheduled**: Daily at 6 AM UTC
- **Manual**: Via workflow dispatch

See `.github/workflows/e2e-tests.yml` for configuration.

## Test Patterns

### API Client Usage

```typescript
import { ProductCatalogClient, BasketClient, OrderClient } from './helpers/api-client'

test('complete flow', async ({ request }) => {
  const products = new ProductCatalogClient(PRODUCT_URL, request)
  const basket = new BasketClient(BASKET_URL, request)
  const orders = new OrderClient(ORDER_URL, request)

  // Test implementation
})
```

### Test Data Cleanup

Tests automatically clean up created data:

```typescript
test.afterEach(async ({ request }) => {
  await cleanupTestData(request)
})
```

## Project Structure

```
shopping-cart-e2e-tests/
├── tests/
│   ├── api/              # API tests
│   ├── flows/            # User flow tests
│   ├── fixtures/         # Test data factories
│   └── helpers/          # Utility functions
├── playwright.config.ts  # Playwright configuration
├── package.json          # Dependencies
└── Makefile              # Build automation
```

## Troubleshooting

### Services not running

Ensure all services are running and accessible:

```bash
curl http://localhost:8000/health  # Product Catalog
curl http://localhost:8083/health  # Basket
curl http://localhost:8080/actuator/health  # Order
```

### Authentication errors

If `OAUTH2_ENABLED=true`, ensure Keycloak is running and configured.

### Timeout errors

Increase timeout in `playwright.config.ts`:

```typescript
timeout: 120000,  // 2 minutes
```

## Related Repositories

- [shopping-cart-product-catalog](../shopping-cart-product-catalog)
- [shopping-cart-basket](../shopping-cart-basket)
- [shopping-cart-order](../shopping-cart-order)
- [shopping-cart-frontend](../shopping-cart-frontend)
- [shopping-cart-infra](../shopping-cart-infra)

## License

Apache 2.0 — see [LICENSE](LICENSE)
