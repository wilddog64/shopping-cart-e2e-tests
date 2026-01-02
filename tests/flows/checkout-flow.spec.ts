import { test, expect } from '@playwright/test'
import { ProductCatalogClient, BasketClient, OrderClient, config } from '../helpers/api-client'
import { cleanupTestData, generateTestId } from '../helpers/cleanup'
import { testAddresses, testProducts, createCartItem } from '../fixtures/test-data'

/**
 * Checkout Flow Tests
 *
 * Tests focused on the checkout process, including various
 * checkout scenarios, address handling, and order creation.
 */
test.describe('Checkout Flow', () => {
  let productClient: ProductCatalogClient
  let basketClient: BasketClient
  let orderClient: OrderClient
  let testUserId: string

  test.beforeEach(async ({ request }) => {
    testUserId = generateTestId()
    productClient = new ProductCatalogClient(config.productCatalogUrl, request)
    basketClient = new BasketClient(config.basketUrl, request, testUserId)
    orderClient = new OrderClient(config.orderUrl, request, testUserId)
  })

  test.afterEach(async ({ request }) => {
    await cleanupTestData(request, { userId: testUserId, cancelOrders: true })
  })

  test.describe('Standard Checkout', () => {
    test('should complete checkout with valid cart', async () => {
      // Setup: Add item to cart
      const item = createCartItem('checkout-prod-1', testProducts.laptop, 1)
      await basketClient.addItem(item)

      const cart = await basketClient.getCart()
      expect(cart.items).toHaveLength(1)

      // Checkout
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

      // Verify order
      expect(order.id).toBeDefined()
      expect(order.status).toBe('PENDING')
      expect(order.totalAmount).toBe(cart.totalAmount)
    })

    test('should create order with correct shipping address', async () => {
      // Add item
      await basketClient.addItem(createCartItem('checkout-prod-2', testProducts.phone, 1))
      const cart = await basketClient.getCart()

      // Checkout with NY address
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

      // Verify address
      expect(order.shippingAddress.city).toBe('New York')
      expect(order.shippingAddress.state).toBe('NY')
      expect(order.shippingAddress.postalCode).toBe('10001')
    })

    test('should handle high-value order', async () => {
      // Add expensive items
      await basketClient.addItem(createCartItem('expensive-1', testProducts.laptop, 5))
      await basketClient.addItem(createCartItem('expensive-2', testProducts.phone, 3))

      const cart = await basketClient.getCart()
      const expectedTotal = testProducts.laptop.price * 5 + testProducts.phone.price * 3

      expect(cart.totalAmount).toBeCloseTo(expectedTotal, 2)

      // Checkout
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
    })
  })

  test.describe('Cart Management Before Checkout', () => {
    test('should allow cart modifications before checkout', async () => {
      // Add initial items
      await basketClient.addItem(createCartItem('modify-1', testProducts.laptop, 2))
      const addResult = await basketClient.addItem(createCartItem('modify-2', testProducts.book, 1))

      // Modify quantity
      const laptopItem = addResult.items.find((i: { productId: string }) => i.productId === 'modify-1')
      await basketClient.updateItem(laptopItem.id, { quantity: 3 })

      // Remove book
      const bookItem = addResult.items.find((i: { productId: string }) => i.productId === 'modify-2')
      await basketClient.removeItem(bookItem.id)

      // Final cart check
      const cart = await basketClient.getCart()
      expect(cart.items).toHaveLength(1)
      expect(cart.items[0].quantity).toBe(3)

      // Checkout
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
      expect(order.items[0].quantity).toBe(3)
    })

    test('should clear cart after successful checkout', async () => {
      // Add item and checkout
      await basketClient.addItem(createCartItem('clear-test', testProducts.laptop, 1))
      const cart = await basketClient.getCart()

      await orderClient.createOrder({
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

      // Clear cart (simulating post-checkout cleanup)
      await basketClient.clearCart()

      // Verify empty
      const emptyCart = await basketClient.getCart()
      expect(emptyCart.items).toHaveLength(0)
      expect(emptyCart.totalAmount).toBe(0)
    })
  })

  test.describe('Multiple Orders', () => {
    test('should allow multiple orders from same customer', async () => {
      // First order
      await basketClient.addItem(createCartItem('multi-1', testProducts.laptop, 1))
      let cart = await basketClient.getCart()

      const order1 = await orderClient.createOrder({
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

      // Second order
      await basketClient.addItem(createCartItem('multi-2', testProducts.phone, 2))
      cart = await basketClient.getCart()

      const order2 = await orderClient.createOrder({
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

      // Verify both orders exist
      expect(order1.id).not.toBe(order2.id)

      const orders = await orderClient.getOrdersByCustomer(testUserId)
      expect(orders.length).toBeGreaterThanOrEqual(2)
    })

    test('should track order history correctly', async () => {
      // Create several orders
      const orderCount = 3
      const orderIds: string[] = []

      for (let i = 0; i < orderCount; i++) {
        await basketClient.addItem(createCartItem(`history-${i}`, testProducts.book, i + 1))
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

        orderIds.push(order.id)
        await basketClient.clearCart()
      }

      // Verify all orders in history
      const orders = await orderClient.getOrdersByCustomer(testUserId)
      expect(orders.length).toBeGreaterThanOrEqual(orderCount)

      for (const orderId of orderIds) {
        const found = orders.find((o: { id: string }) => o.id === orderId)
        expect(found).toBeDefined()
      }
    })
  })

  test.describe('Order Verification', () => {
    test('should preserve item details in order', async () => {
      const quantity = 4
      await basketClient.addItem(createCartItem('verify-details', testProducts.laptop, quantity))
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

      // Verify item details
      const orderItem = order.items[0]
      expect(orderItem.productId).toBe('verify-details')
      expect(orderItem.quantity).toBe(quantity)
      expect(orderItem.unitPrice).toBe(testProducts.laptop.price)
    })

    test('should calculate order total correctly', async () => {
      await basketClient.addItem(createCartItem('calc-1', testProducts.laptop, 2))
      await basketClient.addItem(createCartItem('calc-2', testProducts.phone, 3))
      await basketClient.addItem(createCartItem('calc-3', testProducts.book, 1))

      const cart = await basketClient.getCart()
      const expectedTotal =
        testProducts.laptop.price * 2 + testProducts.phone.price * 3 + testProducts.book.price * 1

      expect(cart.totalAmount).toBeCloseTo(expectedTotal, 2)

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
    })

    test('should assign unique order IDs', async () => {
      const orderIds = new Set<string>()

      for (let i = 0; i < 3; i++) {
        await basketClient.addItem(createCartItem(`unique-${i}`, testProducts.book, 1))
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

        expect(orderIds.has(order.id)).toBe(false)
        orderIds.add(order.id)

        await basketClient.clearCart()
      }

      expect(orderIds.size).toBe(3)
    })
  })
})
