# Tech Context: Shopping Cart E2E Tests

## Core Technology Stack

| Technology | Version | Purpose |
|---|---|---|
| Playwright | 1.40 | Test framework and HTTP request context |
| TypeScript | 5.3 | Language |
| Node.js | 18+ | Runtime |
| dotenv | 16.3 | Environment variable loading |
| ESLint | 8.55 | Linting (typescript-eslint plugin) |
| Prettier | 3.1 | Code formatting |

## Playwright Configuration (`playwright.config.ts`)

```typescript
{
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 4,
  timeout: 60000,           // 60s per test
  expect: { timeout: 10000 }, // 10s per assertion

  use: {
    baseURL: process.env.FRONTEND_URL || 'http://localhost:3000',
    extraHTTPHeaders: {
      'X-User-ID': process.env.TEST_USER_ID || 'e2e-test-user',
      'Content-Type': 'application/json',
    },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'api', testMatch: /api\/.*\.spec\.ts/ },
    { name: 'flows', testMatch: /flows\/.*\.spec\.ts/, dependencies: ['api'] },
  ],
}
```

Key behavior:
- `api` project runs first; `flows` project depends on it completing
- CI mode: 1 worker (sequential), 2 retries, `forbidOnly` prevents `.only` tests from being committed
- Reports: HTML (`playwright-report/`), JSON (`test-results/results.json`), list (console)

## TypeScript Configuration

`tsconfig.json`:
- Target: ES2020
- Module: CommonJS
- Strict mode enabled
- No path aliases (relative imports only)

## Environment Variables

All configured in `.env` (copy from `.env.example`):

| Variable | Default | Notes |
|---|---|---|
| `PRODUCT_CATALOG_URL` | `http://localhost:8000` | FastAPI service |
| `BASKET_URL` | `http://localhost:8083` | Go/Gin service |
| `ORDER_URL` | `http://localhost:8080` | Spring Boot service |
| `PAYMENT_URL` | `http://localhost:8084` | Spring Boot service |
| `FRONTEND_URL` | `http://localhost:3000` | React SPA |
| `TEST_USER_ID` | `e2e-test-user` | Default user for non-isolated tests |
| `OAUTH2_ENABLED` | `false` | Set `true` to use Keycloak JWT |
| `KEYCLOAK_URL` | `http://localhost:8080` | Only needed if OAUTH2_ENABLED=true |
| `KEYCLOAK_REALM` | `shopping-cart` | Only needed if OAUTH2_ENABLED=true |
| `KEYCLOAK_CLIENT_ID` | `e2e-tests` | Only needed if OAUTH2_ENABLED=true |
| `KEYCLOAK_CLIENT_SECRET` | `` | Only needed if OAUTH2_ENABLED=true |
| `TEST_USERNAME` | `e2e-user` | Only needed if OAUTH2_ENABLED=true |
| `TEST_PASSWORD` | `e2e-password` | Only needed if OAUTH2_ENABLED=true |

## Dev Environment Setup

```bash
# Prerequisites: Node.js 18+, npm, running backend services

git clone <repo>
cd shopping-cart-e2e-tests
npm install
npx playwright install --with-deps   # Install browser binaries

cp .env.example .env
# Edit .env with your service URLs

# Verify services are up
./bin/check-services.sh

# Run tests
make test
```

### Running against Kubernetes
```bash
# Port-forward all services to local ports
./bin/port-forward.sh

# In another terminal, run tests
make test
```

### Docker Compose (local services)
`docker-compose.yml` is provided for spinning up services locally. Note: services must be pre-built and images available.

## Makefile Targets

```
make install        npm install + playwright install
make test           Run all tests (api + flows)
make test-api       API tests only
make test-flows     Flow tests only
make test-headed    With visible browser (for debugging)
make test-debug     Step-through debugger
make test-report    Open HTML report
```

## CI/CD

GitHub Actions at `.github/workflows/e2e-tests.yml`:
- **Triggers**: `schedule` (daily 6 AM UTC) + `workflow_dispatch` (manual)
- **Environment**: ubuntu-latest, Node 20
- **Prerequisites**: Services must be running and accessible at configured URLs
- **Reports**: Test results published as GitHub Actions artifacts
- **Retry**: 2 retries per test in CI mode

## Utility Scripts (`bin/`)

| Script | Purpose |
|---|---|
| `bin/setup.sh` | Full environment setup |
| `bin/run-tests.sh` | Wrapper to run tests with env validation |
| `bin/check-services.sh` | Health check all services before running |
| `bin/config.sh` | Shared config for other scripts |
| `bin/port-forward.sh` | `kubectl port-forward` for all K8s services |
| `scripts/init-db.sh` | Seed test data into services |
