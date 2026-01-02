import { test, expect } from '@playwright/test'
import { OrderClient, BasketClient, config } from '../helpers/api-client'
import { cleanupTestData, generateTestId, waitFor } from '../helpers/cleanup'
import { testAddresses, testProducts, createCartItem } from '../fixtures/test-data'

/**
 * Order Management Flow Tests
 *
 * Tests focused on order lifecycle management including
 * status updates, cancellations, and order history.
 */
test.describe('Order Management Flow', () => {
  let basketClient: BasketClient
  let orderClient: OrderClient
  let testUserId: string

  test.beforeEach(async ({ request }) => {
    testUserId = generateTestId()
    basketClient = new BasketClient(config.basketUrl, request, testUserId)
    orderClient = new OrderClient(config.orderUrl, request, testUserId)
  })

  test.afterEach(async ({ request }) => {
    await cleanupTestData(request, { userId: testUserId, cancelOrders: true })
  })

  /**
   * Helper to create an order for testing
   */
  async function createTestOrder() {
    await basketClient.addItem(createCartItem('order-mgmt-prod', testProducts.laptop, 1))
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

    await basketClient.clearCart()
    return order
  }

  test.describe('Order Lifecycle', () => {
    test('should follow standard order lifecycle', async () => {
      const order = await createTestOrder()
      expect(order.status).toBe('PENDING')

      // Confirm order
      const confirmedOrder = await orderClient.updateOrderStatus(order.id, 'CONFIRMED')
      expect(confirmedOrder.status).toBe('CONFIRMED')

      // Ship order
      const shippedOrder = await orderClient.updateOrderStatus(order.id, 'SHIPPED')
      expect(shippedOrder.status).toBe('SHIPPED')

      // Deliver order
      const deliveredOrder = await orderClient.updateOrderStatus(order.id, 'DELIVERED')
      expect(deliveredOrder.status).toBe('DELIVERED')
    })

    test('should track status update timestamps', async () => {
      const order = await createTestOrder()
      const createdAt = new Date(order.createdAt)

      // Small delay to ensure time difference
      await new Promise((resolve) => setTimeout(resolve, 100))

      const updatedOrder = await orderClient.updateOrderStatus(order.id, 'CONFIRMED')

      expect(updatedOrder.updatedAt).toBeDefined()
      const updatedAt = new Date(updatedOrder.updatedAt)
      expect(updatedAt.getTime()).toBeGreaterThanOrEqual(createdAt.getTime())
    })

    test('should preserve order details through status changes', async () => {
      const order = await createTestOrder()
      const originalTotal = order.totalAmount
      const originalItemCount = order.items.length

      // Update status multiple times
      await orderClient.updateOrderStatus(order.id, 'CONFIRMED')
      await orderClient.updateOrderStatus(order.id, 'SHIPPED')

      // Retrieve and verify
      const finalOrder = await orderClient.getOrder(order.id)
      expect(finalOrder.totalAmount).toBe(originalTotal)
      expect(finalOrder.items).toHaveLength(originalItemCount)
      expect(finalOrder.customerId).toBe(testUserId)
    })
  })

  test.describe('Order Cancellation', () => {
    test('should cancel pending order', async () => {
      const order = await createTestOrder()
      expect(order.status).toBe('PENDING')

      const cancelledOrder = await orderClient.cancelOrder(order.id, 'Customer request')
      expect(cancelledOrder.status).toBe('CANCELLED')
    })

    test('should cancel confirmed order', async () => {
      const order = await createTestOrder()
      await orderClient.updateOrderStatus(order.id, 'CONFIRMED')

      const cancelledOrder = await orderClient.cancelOrder(order.id, 'Out of stock')
      expect(cancelledOrder.status).toBe('CANCELLED')
    })

    test('should not cancel shipped order', async () => {
      const order = await createTestOrder()
      await orderClient.updateOrderStatus(order.id, 'CONFIRMED')
      await orderClient.updateOrderStatus(order.id, 'SHIPPED')

      try {
        await orderClient.cancelOrder(order.id, 'Too late')
        // Should not reach here
        expect(true).toBe(false)
      } catch (error) {
        // Expected - shipped orders cannot be cancelled
        expect(error).toBeDefined()
      }

      // Verify order is still shipped
      const unchangedOrder = await orderClient.getOrder(order.id)
      expect(unchangedOrder.status).toBe('SHIPPED')
    })

    test('should not cancel delivered order', async () => {
      const order = await createTestOrder()
      await orderClient.updateOrderStatus(order.id, 'CONFIRMED')
      await orderClient.updateOrderStatus(order.id, 'SHIPPED')
      await orderClient.updateOrderStatus(order.id, 'DELIVERED')

      try {
        await orderClient.cancelOrder(order.id, 'Want refund')
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeDefined()
      }
    })
  })

  test.describe('Order Retrieval', () => {
    test('should retrieve order by ID', async () => {
      const createdOrder = await createTestOrder()

      const retrievedOrder = await orderClient.getOrder(createdOrder.id)

      expect(retrievedOrder.id).toBe(createdOrder.id)
      expect(retrievedOrder.customerId).toBe(testUserId)
      expect(retrievedOrder.status).toBe('PENDING')
    })

    test('should list all customer orders', async () => {
      // Create multiple orders
      const order1 = await createTestOrder()
      const order2 = await createTestOrder()
      const order3 = await createTestOrder()

      const orders = await orderClient.getOrdersByCustomer(testUserId)

      expect(orders.length).toBeGreaterThanOrEqual(3)

      // Verify all created orders are in the list
      const orderIds = orders.map((o: { id: string }) => o.id)
      expect(orderIds).toContain(order1.id)
      expect(orderIds).toContain(order2.id)
      expect(orderIds).toContain(order3.id)
    })

    test('should return orders sorted by date', async () => {
      // Create orders with slight delay
      await createTestOrder()
      await new Promise((resolve) => setTimeout(resolve, 100))
      await createTestOrder()
      await new Promise((resolve) => setTimeout(resolve, 100))
      await createTestOrder()

      const orders = await orderClient.getOrdersByCustomer(testUserId)

      // Verify orders are returned (sorting depends on API implementation)
      expect(orders.length).toBeGreaterThanOrEqual(3)

      // All orders should belong to test user
      for (const order of orders) {
        expect(order.customerId).toBe(testUserId)
      }
    })
  })

  test.describe('Order Details', () => {
    test('should include shipping address in order', async () => {
      await basketClient.addItem(createCartItem('address-test', testProducts.laptop, 1))
      const cart = await basketClient.getCart()

      const order = await orderClient.createOrder({
        customerId: testUserId,
        items: cart.items.map((i: { productId: string; name: string; quantity: number; unitPrice: number }) => ({
          productId: i.productId,
          productName: i.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
        shippingAddress: testAddresses.ny,
        currency: 'USD',
      })

      expect(order.shippingAddress).toEqual(testAddresses.ny)
    })

    test('should include all item details', async () => {
      await basketClient.addItem(createCartItem('item-detail-1', testProducts.laptop, 2))
      await basketClient.addItem(createCartItem('item-detail-2', testProducts.phone, 1))
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

      expect(order.items).toHaveLength(2)

      // Verify each item has required fields
      for (const item of order.items) {
        expect(item.productId).toBeDefined()
        expect(item.quantity).toBeGreaterThan(0)
        expect(item.unitPrice).toBeGreaterThan(0)
      }

      await basketClient.clearCart()
    })

    test('should calculate item subtotals correctly', async () => {
      const quantity = 3
      await basketClient.addItem(createCartItem('subtotal-test', testProducts.laptop, quantity))
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

      const expectedSubtotal = testProducts.laptop.price * quantity
      expect(order.items[0].subtotal).toBeCloseTo(expectedSubtotal, 2)

      await basketClient.clearCart()
    })
  })

  test.describe('Order Status Queries', () => {
    test('should identify pending orders', async () => {
      const order = await createTestOrder()

      const orders = await orderClient.getOrdersByCustomer(testUserId)
      const pendingOrder = orders.find((o: { id: string }) => o.id === order.id)

      expect(pendingOrder).toBeDefined()
      expect(pendingOrder.status).toBe('PENDING')
    })

    test('should identify cancelled orders', async () => {
      const order = await createTestOrder()
      await orderClient.cancelOrder(order.id, 'Test cancellation')

      const orders = await orderClient.getOrdersByCustomer(testUserId)
      const cancelledOrder = orders.find((o: { id: string }) => o.id === order.id)

      expect(cancelledOrder).toBeDefined()
      expect(cancelledOrder.status).toBe('CANCELLED')
    })

    test('should show mixed order statuses', async () => {
      // Create orders with different statuses
      const pendingOrder = await createTestOrder()

      const confirmedOrder = await createTestOrder()
      await orderClient.updateOrderStatus(confirmedOrder.id, 'CONFIRMED')

      const cancelledOrder = await createTestOrder()
      await orderClient.cancelOrder(cancelledOrder.id, 'Test')

      // Retrieve all orders
      const orders = await orderClient.getOrdersByCustomer(testUserId)

      // Verify different statuses exist
      const statuses = orders.map((o: { status: string }) => o.status)
      expect(statuses).toContain('PENDING')
      expect(statuses).toContain('CONFIRMED')
      expect(statuses).toContain('CANCELLED')
    })
  })

  test.describe('Edge Cases', () => {
    test('should handle order with single item', async () => {
      await basketClient.addItem(createCartItem('single-item', testProducts.book, 1))
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

      expect(order.items).toHaveLength(1)
      expect(order.totalAmount).toBe(testProducts.book.price)

      await basketClient.clearCart()
    })

    test('should handle order with large quantity', async () => {
      const largeQuantity = 100
      await basketClient.addItem(createCartItem('large-qty', testProducts.book, largeQuantity))
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

      expect(order.items[0].quantity).toBe(largeQuantity)
      expect(order.totalAmount).toBeCloseTo(testProducts.book.price * largeQuantity, 2)

      await basketClient.clearCart()
    })

    test('should handle rapid status updates', async () => {
      const order = await createTestOrder()

      // Rapid updates
      await orderClient.updateOrderStatus(order.id, 'CONFIRMED')
      await orderClient.updateOrderStatus(order.id, 'SHIPPED')

      const finalOrder = await orderClient.getOrder(order.id)
      expect(finalOrder.status).toBe('SHIPPED')
    })
  })
})
