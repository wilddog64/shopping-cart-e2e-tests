import { test, expect } from '@playwright/test'
import {
  ProductCatalogClient,
  BasketClient,
  OrderClient,
  PaymentClient,
  config,
} from '../helpers/api-client'
import { cleanupTestData, generateTestId } from '../helpers/cleanup'
import { testAddresses, testProducts, createCartItem } from '../fixtures/test-data'

/**
 * Payment Flow Tests
 *
 * Complete checkout flow including payment processing:
 * Browse -> Add to Cart -> Create Order -> Process Payment
 */
test.describe('Payment Flow', () => {
  let productClient: ProductCatalogClient
  let basketClient: BasketClient
  let orderClient: OrderClient
  let paymentClient: PaymentClient
  let testUserId: string

  test.beforeEach(async ({ request }) => {
    testUserId = generateTestId()
    productClient = new ProductCatalogClient(config.productCatalogUrl, request)
    basketClient = new BasketClient(config.basketUrl, request, testUserId)
    orderClient = new OrderClient(config.orderUrl, request, testUserId)
    paymentClient = new PaymentClient(config.paymentUrl, request, testUserId)
  })

  test.afterEach(async ({ request }) => {
    await cleanupTestData(request, { userId: testUserId, cancelOrders: true })
  })

  test.describe('Complete Checkout with Payment', () => {
    test('should complete full checkout flow with payment', async () => {
      // Step 1: Add items to cart
      const item = createCartItem('payment-flow-1', testProducts.laptop, 1)
      await basketClient.addItem(item)

      const cart = await basketClient.getCart()
      expect(cart.items).toHaveLength(1)
      expect(cart.totalAmount).toBe(testProducts.laptop.price)

      // Step 2: Create order
      const order = await orderClient.createOrder({
        customerId: testUserId,
        items: cart.items.map((i: { productId: string; name: string; quantity: number; unitPrice: number }) => ({
          productId: i.productId,
          productName: i.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
        shippingAddress: testAddresses.usa,
        currency: 'USD',
      })

      expect(order.id).toBeDefined()
      expect(order.status).toBe('PENDING')

      // Step 3: Process payment
      const payment = await paymentClient.processPayment({
        orderId: order.id,
        customerId: testUserId,
        amount: order.totalAmount,
        currency: order.currency,
        gateway: 'mock',
      })

      expect(payment.id).toBeDefined()
      expect(payment.orderId).toBe(order.id)
      expect(payment.status).toBe('COMPLETED')
      expect(payment.amount).toBe(order.totalAmount)

      // Step 4: Verify payment is linked to order
      const orderPayment = await paymentClient.getPaymentByOrderId(order.id)
      expect(orderPayment).not.toBeNull()
      expect(orderPayment?.id).toBe(payment.id)

      // Step 5: Clear cart after successful checkout
      await basketClient.clearCart()
      const emptyCart = await basketClient.getCart()
      expect(emptyCart.items).toHaveLength(0)
    })

    test('should handle multi-item checkout with payment', async () => {
      // Add multiple items
      await basketClient.addItem(createCartItem('multi-pay-1', testProducts.laptop, 1))
      await basketClient.addItem(createCartItem('multi-pay-2', testProducts.phone, 2))

      const cart = await basketClient.getCart()
      expect(cart.items).toHaveLength(2)

      const expectedTotal = testProducts.laptop.price + testProducts.phone.price * 2

      // Create order
      const order = await orderClient.createOrder({
        customerId: testUserId,
        items: cart.items.map((i: { productId: string; name: string; quantity: number; unitPrice: number }) => ({
          productId: i.productId,
          productName: i.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
        shippingAddress: testAddresses.usa,
        currency: 'USD',
      })

      expect(order.totalAmount).toBeCloseTo(expectedTotal, 2)

      // Process payment
      const payment = await paymentClient.processPayment({
        orderId: order.id,
        customerId: testUserId,
        amount: order.totalAmount,
        currency: 'USD',
        gateway: 'mock',
      })

      expect(payment.status).toBe('COMPLETED')
      expect(payment.amount).toBeCloseTo(expectedTotal, 2)
    })
  })

  test.describe('Payment and Refund Flow', () => {
    test('should process payment and full refund', async () => {
      // Setup: Create order with payment
      await basketClient.addItem(createCartItem('refund-test-1', testProducts.book, 2))
      const cart = await basketClient.getCart()

      const order = await orderClient.createOrder({
        customerId: testUserId,
        items: cart.items.map((i: { productId: string; name: string; quantity: number; unitPrice: number }) => ({
          productId: i.productId,
          productName: i.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
        shippingAddress: testAddresses.usa,
        currency: 'USD',
      })

      const payment = await paymentClient.processPayment({
        orderId: order.id,
        customerId: testUserId,
        amount: order.totalAmount,
        currency: 'USD',
        gateway: 'mock',
      })

      expect(payment.status).toBe('COMPLETED')

      // Process full refund
      const refund = await paymentClient.refundPayment(payment.id, {
        amount: payment.amount,
        reason: 'Customer cancelled order',
      })

      expect(refund.status).toBe('COMPLETED')
      expect(refund.amount).toBe(payment.amount)

      // Verify payment status updated
      const updatedPayment = await paymentClient.getPayment(payment.id)
      expect(updatedPayment.status).toBe('REFUNDED')
    })

    test('should process payment and partial refund', async () => {
      // Create order
      await basketClient.addItem(createCartItem('partial-refund', testProducts.laptop, 1))
      const cart = await basketClient.getCart()

      const order = await orderClient.createOrder({
        customerId: testUserId,
        items: cart.items.map((i: { productId: string; name: string; quantity: number; unitPrice: number }) => ({
          productId: i.productId,
          productName: i.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
        shippingAddress: testAddresses.usa,
        currency: 'USD',
      })

      const payment = await paymentClient.processPayment({
        orderId: order.id,
        customerId: testUserId,
        amount: order.totalAmount,
        currency: 'USD',
        gateway: 'mock',
      })

      // Process 30% refund
      const refundAmount = Math.round(payment.amount * 0.3 * 100) / 100
      const refund = await paymentClient.refundPayment(payment.id, {
        amount: refundAmount,
        reason: 'Partial damage refund',
      })

      expect(refund.status).toBe('COMPLETED')
      expect(refund.amount).toBe(refundAmount)

      // Payment should still be COMPLETED after partial refund
      const updatedPayment = await paymentClient.getPayment(payment.id)
      expect(updatedPayment.status).toBe('COMPLETED')
    })
  })

  test.describe('Payment Idempotency', () => {
    test('should handle duplicate payment requests gracefully', async () => {
      // Create order
      await basketClient.addItem(createCartItem('idem-test', testProducts.phone, 1))
      const cart = await basketClient.getCart()

      const order = await orderClient.createOrder({
        customerId: testUserId,
        items: cart.items.map((i: { productId: string; name: string; quantity: number; unitPrice: number }) => ({
          productId: i.productId,
          productName: i.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
        shippingAddress: testAddresses.usa,
        currency: 'USD',
      })

      const idempotencyKey = `e2e-${Date.now()}`

      // First payment request
      const payment1 = await paymentClient.processPayment({
        orderId: order.id,
        customerId: testUserId,
        amount: order.totalAmount,
        currency: 'USD',
        gateway: 'mock',
        idempotencyKey,
      })

      // Duplicate request with same idempotency key
      const payment2 = await paymentClient.processPayment({
        orderId: order.id,
        customerId: testUserId,
        amount: order.totalAmount,
        currency: 'USD',
        gateway: 'mock',
        idempotencyKey,
      })

      // Should return the same payment
      expect(payment2.id).toBe(payment1.id)
      expect(payment2.gatewayTransactionId).toBe(payment1.gatewayTransactionId)
    })
  })

  test.describe('Multiple Orders per Customer', () => {
    test('should track payment history for customer', async () => {
      const orderCount = 3
      const paymentIds: string[] = []

      for (let i = 0; i < orderCount; i++) {
        // Create cart and order
        await basketClient.addItem(createCartItem(`history-${i}`, testProducts.book, 1))
        const cart = await basketClient.getCart()

        const order = await orderClient.createOrder({
          customerId: testUserId,
          items: cart.items.map((item: { productId: string; name: string; quantity: number; unitPrice: number }) => ({
            productId: item.productId,
            productName: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
          shippingAddress: testAddresses.usa,
          currency: 'USD',
        })

        // Process payment
        const payment = await paymentClient.processPayment({
          orderId: order.id,
          customerId: testUserId,
          amount: order.totalAmount,
          currency: 'USD',
          gateway: 'mock',
        })

        paymentIds.push(payment.id)
        await basketClient.clearCart()
      }

      // Verify all payments in customer history
      const payments = await paymentClient.getPaymentsByCustomer(testUserId)
      expect(payments.length).toBeGreaterThanOrEqual(orderCount)

      for (const paymentId of paymentIds) {
        const found = payments.find(p => p.id === paymentId)
        expect(found).toBeDefined()
      }
    })
  })
})
