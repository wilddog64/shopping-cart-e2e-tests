import { test, expect } from '@playwright/test'
import { config } from '../helpers/api-client'
import { getAuthHeaders, isOAuth2Enabled } from '../helpers/auth'
import { testAddresses, testProducts, createCartItem } from '../fixtures/test-data'

const STRIPE_PM_SUCCESS = 'pm_card_visa'
const STRIPE_PM_DECLINED = 'pm_card_chargeDeclined'
const stripeLive = isOAuth2Enabled() && process.env.STRIPE_E2E === 'true'

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
  test.skip(!isOAuth2Enabled(), 'requires OAUTH2_ENABLED=true so the orchestrator resolves the caller cart by JWT subject')

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
  test.skip(!stripeLive, 'requires OAUTH2_ENABLED=true AND STRIPE_E2E=true (payment service STRIPE_ENABLED + sk_test key)')

  test.afterEach(async ({ request }) => {
    const headers = await getAuthHeaders(request)
    await request.delete(`${config.basketUrl}/api/v1/cart`, { headers }).catch(() => {})
  })

  test('completes checkout, marks order PAID, clears cart, records a stripe payment', async ({ request }) => {
    const headers = await getAuthHeaders(request)
    await request.delete(`${config.basketUrl}/api/v1/cart`, { headers })
    const qty = 2
    const add = await request.post(`${config.basketUrl}/api/v1/cart/items`, {
      headers,
      data: createCartItem('e2e-orch-book', testProducts.book, qty),
    })
    expect(add.ok()).toBeTruthy()
    const cartRes = await request.get(`${config.basketUrl}/api/v1/cart`, { headers })
    const cart = unwrapCart(await cartRes.json())
    const expectedAmount = (testProducts.book.price * qty).toFixed(2)
    const res = await request.post(`${config.orderUrl}/api/orders/checkout`, {
      headers,
      data: { shippingAddress: testAddresses.usa, paymentMethodId: STRIPE_PM_SUCCESS },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.paymentStatus).toBe('PAID')
    expect(body.orderId).toBeTruthy()
    expect(typeof body.amount).toBe('string')
    expect(body.amount).toBe(expectedAmount)
    expect(body.amount).toBe(Number(cart.totalAmount).toFixed(2))
    expect(body.currency).toBe('USD')
    const orderRes = await request.get(`${config.orderUrl}/api/orders/${body.orderId}`, { headers })
    expect(orderRes.ok()).toBeTruthy()
    expect((await orderRes.json()).status).toBe('PAID')
    const afterRes = await request.get(`${config.basketUrl}/api/v1/cart`, { headers })
    expect(unwrapCart(await afterRes.json()).items ?? []).toHaveLength(0)
    const payRes = await request.get(`${config.paymentUrl}/api/v1/payments/order/${body.orderId}`, { headers })
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
    const orderRes = await request.get(`${config.orderUrl}/api/orders/${body.orderId}`, { headers })
    expect((await orderRes.json()).status).toBe('PENDING')
    const cartRes = await request.get(`${config.basketUrl}/api/v1/cart`, { headers })
    expect((unwrapCart(await cartRes.json()).items ?? []).length).toBeGreaterThan(0)
  })
})
