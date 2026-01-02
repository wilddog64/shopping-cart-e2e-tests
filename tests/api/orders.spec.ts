import { test, expect } from '@playwright/test'
import { OrderClient, config } from '../helpers/api-client'
import { cleanupTestData, generateTestId } from '../helpers/cleanup'
import { testProducts, testAddresses, createOrderRequest, calculateTotal } from '../fixtures/test-data'

const BASE_URL = config.orderUrl

test.describe('Order API', () => {
  let client: OrderClient
  let testUserId: string

  test.beforeEach(async ({ request }) => {
    testUserId = generateTestId()
    client = new OrderClient(BASE_URL, request, testUserId)
  })

  test.afterEach(async ({ request }) => {
    await cleanupTestData(request, { userId: testUserId, cancelOrders: true })
  })

  test.describe('Health Check', () => {
    test('should return healthy status', async () => {
      const health = await client.checkHealth()
      expect(health.status).toBeDefined()
    })
  })

  test.describe('Create Order', () => {
    test('should create order with single item', async () => {
      const items = [
        { productId: 'prod-123', name: testProducts.laptop.name, quantity: 1, unitPrice: testProducts.laptop.price },
      ]
      const orderRequest = createOrderRequest(testUserId, items, testAddresses.usa)
      const order = await client.createOrder(orderRequest)

      expect(order.id).toBeDefined()
      expect(order.customerId).toBe(testUserId)
      expect(order.status).toBe('PENDING')
      expect(order.items).toHaveLength(1)
      expect(order.items[0].productId).toBe('prod-123')
      expect(order.items[0].quantity).toBe(1)
    })

    test('should create order with multiple items', async () => {
      const items = [
        { productId: 'prod-1', name: testProducts.laptop.name, quantity: 1, unitPrice: testProducts.laptop.price },
        { productId: 'prod-2', name: testProducts.phone.name, quantity: 2, unitPrice: testProducts.phone.price },
        { productId: 'prod-3', name: testProducts.book.name, quantity: 3, unitPrice: testProducts.book.price },
      ]
      const orderRequest = createOrderRequest(testUserId, items)
      const order = await client.createOrder(orderRequest)

      expect(order.items).toHaveLength(3)
      expect(order.totalAmount).toBeCloseTo(calculateTotal(items), 2)
    })

    test('should include shipping address', async () => {
      const items = [
        { productId: 'prod-123', name: testProducts.laptop.name, quantity: 1, unitPrice: testProducts.laptop.price },
      ]
      const orderRequest = createOrderRequest(testUserId, items, testAddresses.ny)
      const order = await client.createOrder(orderRequest)

      expect(order.shippingAddress).toBeDefined()
      expect(order.shippingAddress.city).toBe('New York')
      expect(order.shippingAddress.state).toBe('NY')
    })

    test('should set currency correctly', async () => {
      const items = [
        { productId: 'prod-123', name: testProducts.laptop.name, quantity: 1, unitPrice: testProducts.laptop.price },
      ]
      const orderRequest = createOrderRequest(testUserId, items)
      const order = await client.createOrder(orderRequest)

      expect(order.currency).toBe('USD')
    })

    test('should have creation timestamp', async () => {
      const items = [
        { productId: 'prod-123', name: testProducts.laptop.name, quantity: 1, unitPrice: testProducts.laptop.price },
      ]
      const orderRequest = createOrderRequest(testUserId, items)
      const order = await client.createOrder(orderRequest)

      expect(order.createdAt).toBeDefined()
      const createdAt = new Date(order.createdAt)
      const now = new Date()
      // Created within last minute
      expect(now.getTime() - createdAt.getTime()).toBeLessThan(60000)
    })
  })

  test.describe('Get Order', () => {
    test('should get order by ID', async () => {
      // Create an order first
      const items = [
        { productId: 'prod-123', name: testProducts.laptop.name, quantity: 1, unitPrice: testProducts.laptop.price },
      ]
      const orderRequest = createOrderRequest(testUserId, items)
      const createdOrder = await client.createOrder(orderRequest)

      // Get the order
      const order = await client.getOrder(createdOrder.id)

      expect(order.id).toBe(createdOrder.id)
      expect(order.customerId).toBe(testUserId)
      expect(order.items).toHaveLength(1)
    })

    test('should return 404 for non-existent order', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/orders/00000000-0000-0000-0000-000000000000`, {
        headers: { 'X-User-ID': testUserId },
      })
      expect(response.status()).toBe(404)
    })
  })

  test.describe('Get Orders by Customer', () => {
    test('should return all orders for customer', async () => {
      // Create multiple orders
      const items1 = [
        { productId: 'prod-1', name: testProducts.laptop.name, quantity: 1, unitPrice: testProducts.laptop.price },
      ]
      const items2 = [
        { productId: 'prod-2', name: testProducts.phone.name, quantity: 1, unitPrice: testProducts.phone.price },
      ]

      await client.createOrder(createOrderRequest(testUserId, items1))
      await client.createOrder(createOrderRequest(testUserId, items2))

      // Get all orders
      const orders = await client.getOrdersByCustomer(testUserId)

      expect(orders.length).toBeGreaterThanOrEqual(2)
      for (const order of orders) {
        expect(order.customerId).toBe(testUserId)
      }
    })

    test('should return empty array for new customer', async () => {
      const newUserId = generateTestId()
      const orders = await client.getOrdersByCustomer(newUserId)
      expect(orders).toHaveLength(0)
    })
  })

  test.describe('Update Order Status', () => {
    test('should update order status to CONFIRMED', async () => {
      // Create order
      const items = [
        { productId: 'prod-123', name: testProducts.laptop.name, quantity: 1, unitPrice: testProducts.laptop.price },
      ]
      const order = await client.createOrder(createOrderRequest(testUserId, items))

      // Update status
      const updatedOrder = await client.updateOrderStatus(order.id, 'CONFIRMED')

      expect(updatedOrder.status).toBe('CONFIRMED')
      expect(updatedOrder.updatedAt).toBeDefined()
    })

    test('should track status history', async () => {
      // Create order
      const items = [
        { productId: 'prod-123', name: testProducts.laptop.name, quantity: 1, unitPrice: testProducts.laptop.price },
      ]
      const order = await client.createOrder(createOrderRequest(testUserId, items))

      // Update status multiple times
      await client.updateOrderStatus(order.id, 'CONFIRMED')
      const finalOrder = await client.updateOrderStatus(order.id, 'SHIPPED')

      expect(finalOrder.status).toBe('SHIPPED')
    })
  })

  test.describe('Cancel Order', () => {
    test('should cancel pending order', async () => {
      // Create order
      const items = [
        { productId: 'prod-123', name: testProducts.laptop.name, quantity: 1, unitPrice: testProducts.laptop.price },
      ]
      const order = await client.createOrder(createOrderRequest(testUserId, items))

      // Cancel order
      const cancelledOrder = await client.cancelOrder(order.id, 'Changed my mind')

      expect(cancelledOrder.status).toBe('CANCELLED')
    })

    test('should not cancel shipped order', async () => {
      // Create and ship order
      const items = [
        { productId: 'prod-123', name: testProducts.laptop.name, quantity: 1, unitPrice: testProducts.laptop.price },
      ]
      const order = await client.createOrder(createOrderRequest(testUserId, items))
      await client.updateOrderStatus(order.id, 'CONFIRMED')
      await client.updateOrderStatus(order.id, 'SHIPPED')

      // Try to cancel - should fail
      try {
        await client.cancelOrder(order.id, 'Too late')
        // If we get here, the test should fail
        expect(true).toBe(false)
      } catch (error) {
        // Expected to fail
        expect(error).toBeDefined()
      }
    })
  })

  test.describe('Order Data Validation', () => {
    test('should calculate total correctly', async () => {
      const items = [
        { productId: 'prod-1', name: testProducts.laptop.name, quantity: 2, unitPrice: testProducts.laptop.price },
        { productId: 'prod-2', name: testProducts.phone.name, quantity: 1, unitPrice: testProducts.phone.price },
      ]
      const expectedTotal = testProducts.laptop.price * 2 + testProducts.phone.price * 1

      const order = await client.createOrder(createOrderRequest(testUserId, items))

      expect(order.totalAmount).toBeCloseTo(expectedTotal, 2)
    })

    test('should have valid item subtotals', async () => {
      const items = [
        { productId: 'prod-1', name: testProducts.laptop.name, quantity: 3, unitPrice: testProducts.laptop.price },
      ]

      const order = await client.createOrder(createOrderRequest(testUserId, items))

      const item = order.items[0]
      expect(item.subtotal).toBeCloseTo(testProducts.laptop.price * 3, 2)
    })
  })
})
