# Phase F — e2e for the Stripe checkout orchestrator

**Branch (all work in this repo):** `feat/stripe-checkout-e2e` (create from `origin/main`)
**Files:** `tests/flows/stripe-checkout-orchestrator.spec.ts` (new), `.env.example`

---

## Goal

End-to-end coverage for the order-service checkout orchestrator (`POST /api/orders/checkout`,
Phases A+C). The orchestrator reads the authenticated caller's basket, creates a PENDING order
with a **server-computed** total, charges the payment service over the **stripe** gateway
(`X-Idempotency-Key = orderId`), marks the order PAID, and clears the cart **only after** PAID.
On payment failure the order stays PENDING, the cart stays intact, and the response is `402`
`{ paymentStatus:"FAILED", retryable:true, failureReason }`.

This suite is the acceptance contract for that flow. It asserts the invariants the unit tests
prove in isolation, now across real basket + order + payment services.

---

## Why this suite is OAuth2-mode + env-gated (read before implementing)

The orchestrator forwards the caller's **`Authorization`** header to basket/payment. Basket
resolves a cart by JWT `subject` (OAuth2 mode) or by `X-User-ID` (mock mode). So the shopper's
cart and the orchestrator's cart read only line up when the whole stack runs in **OAuth2 mode**
(real Keycloak JWT) — which is also how the frontend (Phase E) drives it. The live tests
therefore authenticate with a real bearer via the existing `getAuthHeaders` helper (Keycloak
password grant) and **skip** unless the environment is configured:

- **`OAUTH2_ENABLED=true`** — so a bearer is issued and cart identity resolves by JWT subject.
- **`STRIPE_E2E=true`** — opt-in for the live charge tests.
- The payment service must run with **`STRIPE_ENABLED=true`** + a Stripe **test** secret key
  (`sk_test_…`) in `STRIPE_API_KEY`, else the gateway is "not enabled" and every charge fails.

In default CI (mock mode, no Stripe key) the gateway tests skip and the suite stays green. One
**contract test** (missing `paymentMethodId` → 400) runs unconditionally because it
short-circuits before any cart read or gateway call.

> Companion mock-mode parity fix lives in the order repo
> (`docs/plans/stripe-checkout-orchestrator-identity-propagation.md`) and is independent of this
> suite — do not depend on it here.

---

## File 1 — `tests/flows/stripe-checkout-orchestrator.spec.ts` (new)

Create exactly this file:

```ts
import { test, expect } from '@playwright/test'
import { config } from '../helpers/api-client'
import { getAuthHeaders, isOAuth2Enabled } from '../helpers/auth'
import { testAddresses, testProducts, createCartItem } from '../fixtures/test-data'

/**
 * Stripe Checkout Orchestrator (Phase F)
 *
 * Exercises POST /api/orders/checkout end-to-end across basket + order + payment.
 * Live charge tests require the full stack in OAuth2 mode with the payment service
 * running Stripe test mode; they skip otherwise (see docs/plans).
 */

// Stripe shared test PaymentMethods (test mode only).
const STRIPE_PM_SUCCESS = 'pm_card_visa'
const STRIPE_PM_DECLINED = 'pm_card_chargeDeclined'

const stripeLive = isOAuth2Enabled() && process.env.STRIPE_E2E === 'true'

// Basket may return the cart flat or wrapped in { success, data }; accept both.
function unwrapCart(body: unknown): { items?: unknown[]; totalAmount?: number } {
  const b = body as { data?: unknown }
  return (b && typeof b === 'object' && 'data' in b ? b.data : body) as {
    items?: unknown[]
    totalAmount?: number
  }
}

test.describe('Checkout Orchestrator — contract (always-on)', () => {
  test('rejects checkout with no paymentMethodId (400)', async ({ request }) => {
    const headers = await getAuthHeaders(request)
    const res = await request.post(`${config.orderUrl}/api/orders/checkout`, {
      headers,
      data: { shippingAddress: testAddresses.usa },
    })
    expect(res.status()).toBe(400)
  })
})

test.describe('Checkout Orchestrator — authenticated, no gateway (OAuth2)', () => {
  test.skip(
    !isOAuth2Enabled(),
    'requires OAUTH2_ENABLED=true so the orchestrator resolves the caller cart by JWT subject'
  )

  test('rejects checkout with an empty cart (400)', async ({ request }) => {
    const headers = await getAuthHeaders(request)
    await request.delete(`${config.basketUrl}/api/v1/cart`, { headers })
    const res = await request.post(`${config.orderUrl}/api/orders/checkout`, {
      headers,
      data: { shippingAddress: testAddresses.usa, paymentMethodId: STRIPE_PM_SUCCESS },
    })
    expect(res.status()).toBe(400)
  })
})

test.describe('Checkout Orchestrator — live Stripe (OAuth2 + Stripe test mode)', () => {
  test.skip(
    !stripeLive,
    'requires OAUTH2_ENABLED=true AND STRIPE_E2E=true (payment service STRIPE_ENABLED + sk_test key)'
  )

  test.afterEach(async ({ request }) => {
    const headers = await getAuthHeaders(request)
    await request.delete(`${config.basketUrl}/api/v1/cart`, { headers }).catch(() => {})
  })

  test('completes checkout, marks order PAID, clears cart, records a stripe payment', async ({
    request,
  }) => {
    const headers = await getAuthHeaders(request)
    await request.delete(`${config.basketUrl}/api/v1/cart`, { headers })

    // Fill cart: 2 x book @ 29.99 = 59.98
    const qty = 2
    const add = await request.post(`${config.basketUrl}/api/v1/cart/items`, {
      headers,
      data: createCartItem('e2e-orch-book', testProducts.book, qty),
    })
    expect(add.ok()).toBeTruthy()

    const cartRes = await request.get(`${config.basketUrl}/api/v1/cart`, { headers })
    const cart = unwrapCart(await cartRes.json())
    const expectedAmount = (testProducts.book.price * qty).toFixed(2) // "59.98"

    // Checkout — the request carries NO amount; the server computes it from the cart.
    const res = await request.post(`${config.orderUrl}/api/orders/checkout`, {
      headers,
      data: { shippingAddress: testAddresses.usa, paymentMethodId: STRIPE_PM_SUCCESS },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()

    expect(body.paymentStatus).toBe('PAID')
    expect(body.orderId).toBeTruthy()
    // Server-side amount authority: a string the server derived from the cart, not the client.
    expect(typeof body.amount).toBe('string')
    expect(body.amount).toBe(expectedAmount)
    expect(body.amount).toBe(Number(cart.totalAmount).toFixed(2))
    expect(body.currency).toBe('USD')

    // Order is PAID.
    const orderRes = await request.get(`${config.orderUrl}/api/orders/${body.orderId}`, { headers })
    expect(orderRes.ok()).toBeTruthy()
    expect((await orderRes.json()).status).toBe('PAID')

    // Cart cleared — only after PAID.
    const afterRes = await request.get(`${config.basketUrl}/api/v1/cart`, { headers })
    expect(unwrapCart(await afterRes.json()).items ?? []).toHaveLength(0)

    // Payment recorded against the order via the stripe gateway.
    const payRes = await request.get(
      `${config.paymentUrl}/api/v1/payments/order/${body.orderId}`,
      { headers }
    )
    expect(payRes.ok()).toBeTruthy()
    const payBody = await payRes.json()
    const payments = Array.isArray(payBody) ? payBody : (payBody.data ?? [])
    expect(payments.length).toBeGreaterThan(0)
    expect(payments[0].gateway).toBe('stripe')
    expect(payments[0].status).toBe('COMPLETED')
  })

  test('declined payment leaves order PENDING and cart intact (402)', async ({ request }) => {
    const headers = await getAuthHeaders(request)
    await request.delete(`${config.basketUrl}/api/v1/cart`, { headers })

    const add = await request.post(`${config.basketUrl}/api/v1/cart/items`, {
      headers,
      data: createCartItem('e2e-orch-declined', testProducts.book, 1),
    })
    expect(add.ok()).toBeTruthy()

    const res = await request.post(`${config.orderUrl}/api/orders/checkout`, {
      headers,
      data: { shippingAddress: testAddresses.usa, paymentMethodId: STRIPE_PM_DECLINED },
    })
    expect(res.status()).toBe(402)
    const body = await res.json()

    expect(body.paymentStatus).toBe('FAILED')
    expect(body.retryable).toBe(true)
    expect(body.failureReason).toBeTruthy()
    expect(body.orderId).toBeTruthy()

    // Order stays PENDING (never PAID).
    const orderRes = await request.get(`${config.orderUrl}/api/orders/${body.orderId}`, { headers })
    expect((await orderRes.json()).status).toBe('PENDING')

    // Cart intact — not cleared on failure.
    const cartRes = await request.get(`${config.basketUrl}/api/v1/cart`, { headers })
    expect((unwrapCart(await cartRes.json()).items ?? []).length).toBeGreaterThan(0)
  })
})
```

**Notes for the implementer:**
- The declined test asserts the **402 failure contract**, not a specific Stripe decline code — if
  the shared token `pm_card_chargeDeclined` is not enabled on the account, any non-success still
  yields `402 FAILED retryable`, which is what we verify.
- Do not import unused symbols — `eslint` runs in CI (`npm run lint`).

---

## File 2 — `.env.example`

### Change A — add `PAYMENT_URL` to the Service URLs block

**Exact old block:**

```
# Service URLs
PRODUCT_CATALOG_URL=http://localhost:8000
BASKET_URL=http://localhost:8083
ORDER_URL=http://localhost:8080
FRONTEND_URL=http://localhost:3000
```

**Exact new block:**

```
# Service URLs
PRODUCT_CATALOG_URL=http://localhost:8000
BASKET_URL=http://localhost:8083
ORDER_URL=http://localhost:8080
PAYMENT_URL=http://localhost:8084
FRONTEND_URL=http://localhost:3000
```

### Change B — append the Stripe-e2e toggle at the end of the file

**Exact old block (last line):**

```
# CI/CD
CI=false
```

**Exact new block:**

```
# CI/CD
CI=false

# Stripe checkout orchestrator e2e (tests/flows/stripe-checkout-orchestrator.spec.ts)
# Live Stripe tests run ONLY when OAUTH2_ENABLED=true AND STRIPE_E2E=true, and require the
# payment service running with STRIPE_ENABLED=true + a Stripe TEST secret key (sk_test_...).
STRIPE_E2E=false
```

---

## Files Changed

| File | Change |
|------|--------|
| `tests/flows/stripe-checkout-orchestrator.spec.ts` | New Phase F suite: contract (always-on), empty-cart (OAuth2), live happy + declined (OAuth2 + Stripe test) |
| `.env.example` | Add `PAYMENT_URL`; add `STRIPE_E2E` toggle with usage note |

---

## Rules

- `npx tsc --noEmit` — clean (spec typechecks)
- `npm run lint` — no new eslint errors (no unused imports/vars)
- `npx playwright test --list` — lists the new tests without error (spec compiles under the `flows` project)
- Do NOT run the live tests locally unless the stack is up in OAuth2 mode with Stripe test mode
- No other file touched — no new deps, no `package.json`/`playwright.config.ts` changes
- No `.env` (only `.env.example`) — never commit real secrets

---

## Definition of Done

- [ ] `tests/flows/stripe-checkout-orchestrator.spec.ts` created exactly as above
- [ ] `.env.example` updated (Changes A + B)
- [ ] `npx tsc --noEmit`, `npm run lint`, `npx playwright test --list` all clean
- [ ] The always-on contract test appears in `--list`; the gated tests show as skipped without env
- [ ] Committed and pushed to `feat/stripe-checkout-e2e`
- [ ] memory-bank updated with commit SHA and task status

**Commit message (exact):**
```
test(e2e): add Stripe checkout orchestrator flow (OAuth2 + test-mode, env-gated)
```

---

## What NOT to Do

- Do NOT create a PR
- Do NOT skip pre-commit hooks (`--no-verify`)
- Do NOT modify any file other than the two listed targets
- Do NOT add dependencies or change `playwright.config.ts` / `package.json`
- Do NOT hardcode a real Stripe key or token anywhere; `.env.example` values are placeholders
- Do NOT commit to `main` — create and work on `feat/stripe-checkout-e2e` from `origin/main`
