import { test, expect } from '@playwright/test'
import { PaymentClient, config } from '../helpers/api-client'
import { generateTestId } from '../helpers/cleanup'

/**
 * Payment Service API Tests
 *
 * Tests for payment processing, retrieval, and refunds.
 * Uses mock gateway for E2E testing.
 */
test.describe('Payment API', () => {
  let paymentClient: PaymentClient
  let testUserId: string

  test.beforeEach(async ({ request }) => {
    testUserId = generateTestId()
    paymentClient = new PaymentClient(config.paymentUrl, request, testUserId)
  })

  test.describe('Health Check', () => {
    test('should return healthy status', async () => {
      const health = await paymentClient.checkHealth()
      expect(health.status).toBe('UP')
    })
  })

  test.describe('Process Payment', () => {
    test('should process payment successfully with mock gateway', async () => {
      const orderId = `order-${Date.now()}`

      const payment = await paymentClient.processPayment({
        orderId,
        customerId: testUserId,
        amount: 99.99,
        currency: 'USD',
        gateway: 'mock',
      })

      expect(payment.id).toBeDefined()
      expect(payment.orderId).toBe(orderId)
      expect(payment.customerId).toBe(testUserId)
      expect(payment.amount).toBe(99.99)
      expect(payment.currency).toBe('USD')
      expect(payment.status).toBe('COMPLETED')
      expect(payment.gateway).toBe('mock')
      expect(payment.gatewayTransactionId).toBeDefined()
    })

    test('should handle idempotent payment requests', async () => {
      const orderId = `order-${Date.now()}`
      const idempotencyKey = `idem-${Date.now()}`

      // First request
      const payment1 = await paymentClient.processPayment({
        orderId,
        customerId: testUserId,
        amount: 50.00,
        currency: 'USD',
        gateway: 'mock',
        idempotencyKey,
      })

      // Second request with same idempotency key
      const payment2 = await paymentClient.processPayment({
        orderId: `order-different-${Date.now()}`,
        customerId: testUserId,
        amount: 50.00,
        currency: 'USD',
        gateway: 'mock',
        idempotencyKey,
      })

      // Should return the same payment
      expect(payment2.id).toBe(payment1.id)
    })

    test('should reject duplicate payment for same order', async () => {
      const orderId = `order-${Date.now()}`

      // First payment
      const payment1 = await paymentClient.processPayment({
        orderId,
        customerId: testUserId,
        amount: 100.00,
        currency: 'USD',
        gateway: 'mock',
      })

      expect(payment1.status).toBe('COMPLETED')

      // Second payment for same order should return existing
      const payment2 = await paymentClient.processPayment({
        orderId,
        customerId: testUserId,
        amount: 100.00,
        currency: 'USD',
        gateway: 'mock',
      })

      expect(payment2.id).toBe(payment1.id)
    })
  })

  test.describe('Get Payment', () => {
    test('should retrieve payment by ID', async () => {
      const orderId = `order-${Date.now()}`

      const created = await paymentClient.processPayment({
        orderId,
        customerId: testUserId,
        amount: 75.50,
        currency: 'USD',
        gateway: 'mock',
      })

      const retrieved = await paymentClient.getPayment(created.id)

      expect(retrieved.id).toBe(created.id)
      expect(retrieved.orderId).toBe(orderId)
      expect(retrieved.amount).toBe(75.50)
    })

    test('should retrieve payment by order ID', async () => {
      const orderId = `order-${Date.now()}`

      await paymentClient.processPayment({
        orderId,
        customerId: testUserId,
        amount: 25.00,
        currency: 'USD',
        gateway: 'mock',
      })

      const payment = await paymentClient.getPaymentByOrderId(orderId)

      expect(payment).not.toBeNull()
      expect(payment?.orderId).toBe(orderId)
    })

    test('should retrieve payments by customer ID', async () => {
      // Create multiple payments
      for (let i = 0; i < 3; i++) {
        await paymentClient.processPayment({
          orderId: `order-${Date.now()}-${i}`,
          customerId: testUserId,
          amount: 10.00 * (i + 1),
          currency: 'USD',
          gateway: 'mock',
        })
      }

      const payments = await paymentClient.getPaymentsByCustomer(testUserId)

      expect(payments.length).toBeGreaterThanOrEqual(3)
      payments.forEach(p => {
        expect(p.customerId).toBe(testUserId)
      })
    })
  })

  test.describe('Refund Payment', () => {
    test('should process full refund', async () => {
      const orderId = `order-${Date.now()}`

      const payment = await paymentClient.processPayment({
        orderId,
        customerId: testUserId,
        amount: 100.00,
        currency: 'USD',
        gateway: 'mock',
      })

      const refund = await paymentClient.refundPayment(payment.id, {
        amount: 100.00,
        reason: 'E2E test refund',
      })

      expect(refund.id).toBeDefined()
      expect(refund.paymentId).toBe(payment.id)
      expect(refund.amount).toBe(100.00)
      expect(refund.status).toBe('COMPLETED')
    })

    test('should process partial refund', async () => {
      const orderId = `order-${Date.now()}`

      const payment = await paymentClient.processPayment({
        orderId,
        customerId: testUserId,
        amount: 100.00,
        currency: 'USD',
        gateway: 'mock',
      })

      const refund = await paymentClient.refundPayment(payment.id, {
        amount: 30.00,
        reason: 'Partial refund test',
      })

      expect(refund.amount).toBe(30.00)
      expect(refund.status).toBe('COMPLETED')

      // Verify payment status
      const updatedPayment = await paymentClient.getPayment(payment.id)
      expect(updatedPayment.status).toBe('COMPLETED') // Still completed after partial refund
    })
  })
})
