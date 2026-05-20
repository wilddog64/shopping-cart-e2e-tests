# GitHub Copilot Instructions — shopping-cart-e2e-tests

Platform-level end-to-end integration test suite for the Shopping Cart microservices.
Written in Playwright (TypeScript). Tests validate complete user journeys across all services.

---

## Architecture

- **Test types**: `tests/api/` — API-level tests against each service; `tests/flows/` — multi-service
  user journey tests.
- **Typed API clients**: `tests/helpers/api-client.ts` — each service has a typed client class
  (`ProductCatalogClient`, `BasketClient`, `OrderClient`, `PaymentClient`). Test specs should call
  service methods via these clients; raw `request.get/post` belongs inside client implementations,
  not in spec files directly.
- **Test isolation**: Tests use `generateTestId()` (from `tests/helpers/cleanup.ts`) to create
  unique per-test IDs. `TEST_USER_ID` env var provides a static fallback user ID for simple cases.
  `cleanupTestData()` must be called in `test.afterEach` for all tests that mutate state.
- **Auth helpers**: `tests/helpers/auth.ts` — `getAuthToken()` handles Keycloak JWT when
  `OAUTH2_ENABLED=true`. When `false`, use `X-User-ID` header.
- **Service URLs**: always via env vars (`PRODUCT_CATALOG_URL`, `BASKET_URL`, `ORDER_URL`).
  Never hardcode `localhost:XXXX` in test files directly.
- **CI note**: CI jobs require live services running at the configured URLs. CI will fail on PRs
  that don't have services started — this is expected for non-test-code changes (docs, config).

---

## Review Focus

### Test Isolation
- Every test that creates, modifies, or deletes data must call `cleanupTestData()` in `afterEach`.
- Tests must not depend on execution order. Each test must be able to run independently.
- Never hardcode user IDs or product IDs — always generate via `TEST_USER_ID` or unique identifiers.

### Timeout Discipline
- Global Playwright timeout is 60s (`timeout: 60000` in `playwright.config.ts`). API tests should
  complete well within this; flag any test that needs to raise it significantly without justification.
- Flow tests may use `test.setTimeout(120000)` for full multi-service checkout journeys.
- Never use `page.waitForTimeout()` as a substitute for proper assertions or `waitFor` patterns.

### Selector Stability (UI/Flow Tests)
- Prefer `role`, `label`, `text` selectors over CSS class or positional selectors.
- Flag selectors that depend on DOM structure (e.g., `nth-child`) — these break on minor UI changes.
- Add a comment when a fragile selector is unavoidable, explaining why.

### Service URL Hygiene
- Service base URLs must come from env vars — flag any hardcoded `http://localhost:PORT` in spec files.
- Localhost defaults are acceptable in `tests/helpers/api-client.ts` (centralised config object) and
  `playwright.config.ts`; hardcodes scattered across individual spec files are not.

### TypeScript Patterns
- All API responses must be typed — flag `any` return types in client methods.
- Use `expect.soft()` only for non-critical assertions; critical path assertions must use `expect()`.
- `async/await` everywhere — no raw Promise chains.

### CI / Workflow
- GitHub Actions steps must pin to a version tag (`@v4`) — never `@main` or `@latest`.
- New workflow jobs that depend on live services must be gated behind `workflow_dispatch` or
  `schedule` triggers — not `pull_request`, since services are unavailable in CI.
- The `api-tests` and `flow-tests` jobs intentionally fail on PRs without live services.
  Do not flag this as a bug in PR reviews.

### Security
- No credentials, tokens, or secrets in test files. Auth tokens via `getAuthToken()` helper only.
- `OAUTH2_ENABLED=false` mode uses `X-User-ID` header — ensure it is generated per test run,
  not shared across tests.
