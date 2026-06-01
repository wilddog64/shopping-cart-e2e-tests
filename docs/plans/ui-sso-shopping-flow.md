# Plan: Browser UI test — SSO login → random product browse → add to cart → checkout

**Branch:** `docs/next-improvements`
**Repo:** `shopping-cart-e2e-tests`
**Files to create/modify:**
- `tests/ui/sso-shopping-flow.spec.ts` — new
- `tests/helpers/sso-login.ts` — new
- `playwright.config.ts` — add `ui` project
- `.env` — add `TEST_USERNAME`, `TEST_PASSWORD` (dev values only)

---

## Motivation

All existing tests are API-level only. There is no browser test that catches UI regressions
like the `invalid_redirect_uri` SSO failure that blocked login on `frontend.3ai-talk.org`.
This test drives a real browser through the complete user journey so config and UI regressions
are caught before they reach users.

---

## What the test does

1. Navigate to `FRONTEND_URL` (default: `http://localhost:3000`)
2. Click the **Login** button in the header
3. Fill in username (`TEST_USERNAME`) and password (`TEST_PASSWORD`) on the Keycloak login page
4. Wait for redirect back to `/callback` and then to home
5. Assert the user is authenticated (username visible in header)
6. Navigate to `/products`
7. Wait for product cards to load
8. Randomly select **1–3 products** from the visible grid
9. For each selected product:
   - Click the product card
   - Randomly pick a quantity between 1 and 3
   - Click **Add to Cart**
   - Assert "Added to cart!" confirmation appears
   - Navigate back to `/products`
10. Navigate to `/cart`
11. Assert the correct number of cart items appears
12. Click **Proceed to Checkout**
13. Assert redirect to `/orders/:id` (order confirmation page)

---

## File specifications

### `tests/helpers/sso-login.ts`

```typescript
import { Page } from '@playwright/test'

export interface SsoLoginOptions {
  frontendUrl: string
  keycloakUrl: string
  username: string
  password: string
}

export async function ssoLogin(page: Page, opts: SsoLoginOptions): Promise<void> {
  await page.goto(opts.frontendUrl)

  // Click the Login button in the header
  await page.getByRole('button', { name: /login/i }).click()

  // Wait for Keycloak login page
  await page.waitForURL(`${opts.keycloakUrl}/**`, { timeout: 15_000 })

  // Fill credentials
  await page.getByLabel(/username/i).fill(opts.username)
  await page.getByLabel(/password/i).fill(opts.password)
  await page.getByRole('button', { name: /sign in|log in/i }).click()

  // Wait for redirect back to the frontend callback URL
  await page.waitForURL(`${opts.frontendUrl}/callback`, { timeout: 15_000 })

  // Wait for the frontend to complete auth and navigate to home
  await page.waitForURL(`${opts.frontendUrl}/**`, { timeout: 15_000 })
  await page.waitForSelector('header', { timeout: 10_000 })
}

export function pickRandom<T>(items: T[], count: number): T[] {
  const shuffled = [...items].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(count, items.length))
}
```

### `tests/ui/sso-shopping-flow.spec.ts`

```typescript
import { test, expect } from '@playwright/test'
import { ssoLogin, pickRandom } from '../helpers/sso-login'

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'
const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8080'
const TEST_USERNAME = process.env.TEST_USERNAME || 'alice'
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'password'

// How many products to add randomly (1–3)
const PRODUCTS_TO_ADD = Math.floor(Math.random() * 3) + 1

test.describe('SSO shopping flow', () => {
  test.use({ baseURL: FRONTEND_URL })

  test('login → browse products → add random items to cart → checkout', async ({ page }) => {
    // Step 1: SSO login
    await ssoLogin(page, {
      frontendUrl: FRONTEND_URL,
      keycloakUrl: KEYCLOAK_URL,
      username: TEST_USERNAME,
      password: TEST_PASSWORD,
    })

    // Assert authenticated — user name or logout button visible in header
    await expect(
      page.getByRole('button', { name: /logout/i }).or(page.getByText(TEST_USERNAME))
    ).toBeVisible({ timeout: 10_000 })

    // Step 2: Browse products page
    await page.goto(`${FRONTEND_URL}/products`)
    await page.waitForSelector('[data-testid="product-card"], a[href*="/products/"]', {
      timeout: 15_000,
    })

    // Collect all product card links
    const productLinks = await page.locator('a[href*="/products/"]').all()
    expect(productLinks.length).toBeGreaterThan(0)

    // Randomly pick 1–3 products
    const selected = pickRandom(productLinks, PRODUCTS_TO_ADD)

    // Step 3: Add each selected product to cart
    for (const link of selected) {
      const href = await link.getAttribute('href')
      if (!href) continue

      await page.goto(`${FRONTEND_URL}${href}`)

      // Wait for product detail to load (Add to Cart button)
      await page.waitForSelector('button:has-text("Add to Cart")', { timeout: 10_000 })

      // Skip out-of-stock products
      const outOfStock = await page.locator('text=Out of stock').isVisible()
      if (outOfStock) {
        await page.goto(`${FRONTEND_URL}/products`)
        continue
      }

      // Randomly set quantity 1–3 by clicking the + button
      const extraClicks = Math.floor(Math.random() * 3)
      for (let i = 0; i < extraClicks; i++) {
        const plusBtn = page.getByRole('button', { name: '+' }).last()
        const disabled = await plusBtn.isDisabled()
        if (disabled) break
        await plusBtn.click()
      }

      // Add to cart
      await page.getByRole('button', { name: /add to cart/i }).click()

      // Assert success confirmation
      await expect(page.getByText(/added to cart/i)).toBeVisible({ timeout: 10_000 })

      // Go back to products for next iteration
      await page.goto(`${FRONTEND_URL}/products`)
      await page.waitForSelector('a[href*="/products/"]', { timeout: 10_000 })
    }

    // Step 4: View cart
    await page.goto(`${FRONTEND_URL}/cart`)
    await page.waitForSelector('text=Shopping Cart', { timeout: 10_000 })

    // Assert at least one item in cart
    const cartItems = page.locator('[class*="divide-y"] > div')
    await expect(cartItems.first()).toBeVisible({ timeout: 10_000 })

    // Step 5: Checkout
    await page.getByRole('button', { name: /proceed to checkout/i }).click()

    // Assert redirect to order confirmation page
    await page.waitForURL(`${FRONTEND_URL}/orders/**`, { timeout: 20_000 })
    await expect(page).toHaveURL(/\/orders\//)
  })
})
```

### `playwright.config.ts` change — add `ui` project

Add to the `projects` array (after the existing `flows` project):

```typescript
{
  name: 'ui',
  testMatch: /ui\/.*\.spec\.ts/,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.FRONTEND_URL || 'http://localhost:3000',
    headless: process.env.HEADED !== 'true',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
},
```

Also add to the top-level imports:
```typescript
import { defineConfig, devices } from '@playwright/test'
```

### `.env` additions

Append to `.env`:
```
# UI test credentials (dev cluster only — never production)
TEST_USERNAME=alice
TEST_PASSWORD=password
```

---

## Selectors reference (from reading actual frontend source)

| Element | Selector used |
|---------|--------------|
| Login button | `getByRole('button', { name: /login/i })` |
| Keycloak username field | `getByLabel(/username/i)` |
| Keycloak password field | `getByLabel(/password/i)` |
| Keycloak sign in button | `getByRole('button', { name: /sign in\|log in/i })` |
| Product card links | `a[href*="/products/"]` (from `Link to={\`/products/${product.id}\`}`) |
| Out of stock indicator | `text=Out of stock` (from `ProductDetailPage`) |
| Quantity + button | `getByRole('button', { name: '+' }).last()` |
| Add to Cart button | `getByRole('button', { name: /add to cart/i })` |
| Success message | `text=Added to cart!` |
| Checkout button | `getByRole('button', { name: /proceed to checkout/i })` |
| Cart item rows | `[class*="divide-y"] > div` |

---

## Before You Start

1. `git pull origin docs/next-improvements` in `shopping-cart-e2e-tests`
2. Read `memory-bank/activeContext.md` and `memory-bank/progress.md`
3. Read the three target files in full before editing:
   - `playwright.config.ts`
   - `tests/helpers/auth.ts` (for context on existing auth helpers — do NOT modify)
4. Run `npm install` — no new dependencies required (Playwright already installed)

## What NOT to Do

- Do NOT create a PR
- Do NOT skip pre-commit hooks (`--no-verify`)
- Do NOT modify files outside the four listed targets
- Do NOT commit to `main` — work on `docs/next-improvements`
- Do NOT modify existing tests (`tests/api/`, `tests/flows/`) — new files only
- Do NOT hardcode credentials — read from env vars with defaults shown above
- Do NOT add `data-testid` attributes to the frontend repo — use role/text selectors only

## Definition of Done

- [ ] `tests/helpers/sso-login.ts` created with `ssoLogin` and `pickRandom` helpers
- [ ] `tests/ui/sso-shopping-flow.spec.ts` created — full flow as described
- [ ] `playwright.config.ts` updated: `import { defineConfig, devices }` + `ui` project added
- [ ] `.env` updated: `TEST_USERNAME=alice`, `TEST_PASSWORD=password` appended
- [ ] `npx playwright test --project=ui --dry-run` exits 0 (no parse errors)
- [ ] `npx tsc --noEmit` passes with zero new errors
- [ ] Commit message: `feat(ui): SSO login → random product browse → add to cart → checkout flow`
- [ ] `git push origin docs/next-improvements` succeeds — do NOT report done until push confirmed
- [ ] Update `memory-bank/activeContext.md` and `memory-bank/progress.md` with commit SHA and COMPLETE status
- [ ] Report back: commit SHA + paste the memory-bank lines you updated
