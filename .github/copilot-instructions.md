# GitHub Copilot Instructions — shopping-cart-e2e-tests

Platform-level end-to-end integration test suite for the Shopping Cart microservices.
Written in Playwright (TypeScript). Tests validate complete user journeys across all services.

---

## Architecture

- **Test types**: `tests/api/` — API-level tests against each service; `tests/flows/` — multi-service
  user journey tests.
- **Typed API clients**: `tests/helpers/api-client.ts` — each service has a typed client class
  (`ProductCatalogClient`, `BasketClient`, `OrderClient`). All service calls must go through these
  clients, not raw `request.get/post`.
- **Test isolation**: `TEST_USER_ID` env var scopes each test run. `cleanupTestData()` in
  `tests/helpers/cleanup.ts` must be called in `test.afterEach` for all tests that mutate state.
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
- API tests must complete within 5 seconds each. Flag timeouts that exceed this without justification.
- Flow tests may use up to `test.setTimeout(120000)` for full checkout journeys.
- Never use `page.waitForTimeout()` as a substitute for proper assertions or `waitFor` patterns.

### Selector Stability (UI/Flow Tests)
- Prefer `role`, `label`, `text` selectors over CSS class or positional selectors.
- Flag selectors that depend on DOM structure (e.g., `nth-child`) — these break on minor UI changes.
- Add a comment when a fragile selector is unavoidable, explaining why.

### Service URL Hygiene
- Service base URLs must come from env vars — flag any hardcoded `http://localhost:PORT` in test files.
- Default fallback in `playwright.config.ts` is acceptable; hardcodes in spec files are not.

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
