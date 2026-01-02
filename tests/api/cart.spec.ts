import { test, expect } from '@playwright/test'
import { BasketClient, config } from '../helpers/api-client'
import { cleanupTestData, generateTestId } from '../helpers/cleanup'
import { testProducts, createCartItem } from '../fixtures/test-data'

const BASE_URL = config.basketUrl

test.describe('Cart (Basket) API', () => {
  let client: BasketClient
  let testUserId: string

  test.beforeEach(async ({ request }) => {
    testUserId = generateTestId()
    client = new BasketClient(BASE_URL, request, testUserId)
  })

  test.afterEach(async ({ request }) => {
    await cleanupTestData(request, { userId: testUserId })
  })

  test.describe('Health Check', () => {
    test('should return healthy status', async () => {
      const health = await client.checkHealth()
      expect(health.status).toBeDefined()
    })
  })

  test.describe('Get Cart', () => {
    test('should return empty cart for new user', async () => {
      const cart = await client.getCart()

      expect(cart).toHaveProperty('id')
      expect(cart).toHaveProperty('customerId')
      expect(cart).toHaveProperty('items')
      expect(cart.items).toHaveLength(0)
      expect(cart.totalAmount).toBe(0)
    })

    test('should return cart with customer ID', async () => {
      const cart = await client.getCart()
      expect(cart.customerId).toBe(testUserId)
    })
  })

  test.describe('Add Item', () => {
    test('should add item to cart', async () => {
      const item = createCartItem('prod-123', testProducts.laptop, 1)
      const cart = await client.addItem(item)

      expect(cart.items).toHaveLength(1)
      expect(cart.items[0].productId).toBe('prod-123')
      expect(cart.items[0].quantity).toBe(1)
      expect(cart.items[0].unitPrice).toBe(testProducts.laptop.price)
    })

    test('should calculate subtotal correctly', async () => {
      const quantity = 3
      const item = createCartItem('prod-123', testProducts.laptop, quantity)
      const cart = await client.addItem(item)

      const expectedSubtotal = testProducts.laptop.price * quantity
      expect(cart.items[0].subTotal).toBe(expectedSubtotal)
    })

    test('should update total amount', async () => {
      const item = createCartItem('prod-123', testProducts.laptop, 2)
      const cart = await client.addItem(item)

      const expectedTotal = testProducts.laptop.price * 2
      expect(cart.totalAmount).toBe(expectedTotal)
    })

    test('should add multiple different items', async () => {
      await client.addItem(createCartItem('prod-1', testProducts.laptop, 1))
      const cart = await client.addItem(createCartItem('prod-2', testProducts.phone, 2))

      expect(cart.items).toHaveLength(2)
      expect(cart.itemCount).toBe(3) // 1 + 2

      const expectedTotal = testProducts.laptop.price * 1 + testProducts.phone.price * 2
      expect(cart.totalAmount).toBeCloseTo(expectedTotal, 2)
    })
  })

  test.describe('Update Item', () => {
    test('should update item quantity', async () => {
      // Add item first
      const addResult = await client.addItem(createCartItem('prod-123', testProducts.laptop, 1))
      const itemId = addResult.items[0].id

      // Update quantity
      const cart = await client.updateItem(itemId, { quantity: 5 })

      expect(cart.items[0].quantity).toBe(5)
      expect(cart.totalAmount).toBe(testProducts.laptop.price * 5)
    })

    test('should remove item when quantity set to 0', async () => {
      // Add item first
      const addResult = await client.addItem(createCartItem('prod-123', testProducts.laptop, 1))
      const itemId = addResult.items[0].id

      // Set quantity to 0
      const cart = await client.updateItem(itemId, { quantity: 0 })

      expect(cart.items).toHaveLength(0)
      expect(cart.totalAmount).toBe(0)
    })
  })

  test.describe('Remove Item', () => {
    test('should remove item from cart', async () => {
      // Add two items
      await client.addItem(createCartItem('prod-1', testProducts.laptop, 1))
      const addResult = await client.addItem(createCartItem('prod-2', testProducts.phone, 1))
      const itemToRemove = addResult.items[1].id

      // Remove second item
      const cart = await client.removeItem(itemToRemove)

      expect(cart.items).toHaveLength(1)
      expect(cart.items[0].productId).toBe('prod-1')
    })
  })

  test.describe('Clear Cart', () => {
    test('should clear all items from cart', async () => {
      // Add items
      await client.addItem(createCartItem('prod-1', testProducts.laptop, 1))
      await client.addItem(createCartItem('prod-2', testProducts.phone, 2))

      // Clear cart
      await client.clearCart()

      // Verify empty
      const cart = await client.getCart()
      expect(cart.items).toHaveLength(0)
      expect(cart.totalAmount).toBe(0)
    })
  })

  test.describe('Cart Expiration', () => {
    test('should have expiration timestamp', async () => {
      const item = createCartItem('prod-123', testProducts.laptop, 1)
      const cart = await client.addItem(item)

      expect(cart.expiresAt).toBeDefined()
      const expiresAt = new Date(cart.expiresAt)
      const now = new Date()

      // Should expire in the future
      expect(expiresAt.getTime()).toBeGreaterThan(now.getTime())
    })
  })
})
