# Project Brief: Shopping Cart E2E Tests

## What This Project Does

Shopping Cart E2E Tests is the platform-level integration and end-to-end test suite for the Shopping Cart microservices platform. It validates that all services work correctly together by exercising real HTTP API calls across service boundaries.

The suite tests:
- Each service's REST API in isolation (API tests)
- Complete user journeys spanning multiple services (flow tests)

It does not test the frontend UI directly — it tests the backend API surface.

## Goals

- Catch integration regressions that unit tests within individual service repos cannot detect
- Validate data consistency across service boundaries (e.g., a cart checkout creates a valid order)
- Serve as an automated acceptance test gate for the full platform
- Run in CI on a schedule (daily) and on demand

## Scope

**Services under test:**
| Service | Technology | Port | Health Endpoint |
|---|---|---|---|
| Product Catalog | Python/FastAPI | 8000 | `GET /health` |
| Basket Service | Go/Gin | 8083 | `GET /health` |
| Order Service | Java/Spring Boot | 8080 | `GET /actuator/health` |
| Payment Service | Java/Spring Boot | 8084 | `GET /actuator/health` |
| Frontend | React/Vite (optional) | 3000 | N/A |

**Test categories:**
- `tests/api/` — Direct CRUD testing of individual service APIs
- `tests/flows/` — Multi-service user journey tests

**Out of scope:**
- Frontend UI/browser automation (the frontend has its own Playwright E2E in `e2e/`)
- Load or performance testing
- Security penetration testing
- Infrastructure health checks (those belong in `shopping-cart-infra`)

## Project Position

This is a standalone repository in the multi-repo platform architecture. It is separate from all service repositories and the infrastructure repository. It references all services by URL only — no shared code dependencies.

```
shopping-cart-e2e-tests (this repo)
    tests services from:
    ├── shopping-cart-product-catalog (Python)
    ├── shopping-cart-basket (Go)
    ├── shopping-cart-order (Java)
    └── shopping-cart-payment (Java)
```

## Key Constraints

- Tests must be independent — each test creates and cleans up its own data
- Tests use unique `testUserId` values per test run to prevent cross-test contamination
- By default, no Keycloak is required (`OAUTH2_ENABLED=false`); services identify users by `X-User-ID` header
- Tests must handle graceful skipping when required data does not exist (e.g., no products seeded)
- CI runs daily at 6 AM UTC with services expected to be running and accessible
