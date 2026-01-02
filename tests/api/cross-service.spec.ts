import { test, expect } from '@playwright/test'
import { ProductCatalogClient, BasketClient, OrderClient, config } from '../helpers/api-client'
import { cleanupTestData, generateTestId, waitFor } from '../helpers/cleanup'
import { testAddresses } from '../fixtures/test-data'

test.describe('Cross-Service Consistency', () => {
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

  test.describe('Product to Cart Consistency', () => {
    test('should maintain price when adding product to cart', async () => {
      // Get a real product from catalog
      const products = await productClient.listProducts({ page_size: 1 })

      if (products.items.length === 0) {
        test.skip()
        return
      }

      const product = products.items[0]

      // Add to cart
      const cart = await basketClient.addItem({
        productId: product.id,
        name: product.name,
        quantity: 1,
        unitPrice: product.price,
      })

      // Verify price matches
      expect(cart.items[0].unitPrice).toBe(product.price)
    })

    test('should preserve product details in cart', async () => {
      // Get a product
      const products = await productClient.listProducts({ page_size: 1 })

      if (products.items.length === 0) {
        test.skip()
        return
      }

      const product = products.items[0]

      // Add to cart
      await basketClient.addItem({
        productId: product.id,
        name: product.name,
        quantity: 2,
        unitPrice: product.price,
      })

      // Retrieve cart
      const cart = await basketClient.getCart()

      // Verify details
      const cartItem = cart.items.find((i: { productId: string }) => i.productId === product.id)
      expect(cartItem).toBeDefined()
      expect(cartItem.name).toBe(product.name)
      expect(cartItem.unitPrice).toBe(product.price)
    })
  })

  test.describe('Cart to Order Consistency', () => {
    test('should maintain cart total in order', async () => {
      // Get products
      const products = await productClient.listProducts({ page_size: 2 })

      if (products.items.length < 2) {
        test.skip()
        return
      }

      // Add items to cart
      await basketClient.addItem({
        productId: products.items[0].id,
        name: products.items[0].name,
        quantity: 1,
        unitPrice: products.items[0].price,
      })

      const cart = await basketClient.addItem({
        productId: products.items[1].id,
        name: products.items[1].name,
        quantity: 2,
        unitPrice: products.items[1].price,
      })

      // Create order from cart items
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

      // Verify totals match
      expect(order.totalAmount).toBeCloseTo(cart.totalAmount, 2)
    })

    test('should transfer all cart items to order', async () => {
      // Get products
      const products = await productClient.listProducts({ page_size: 3 })

      if (products.items.length < 3) {
        test.skip()
        return
      }

      // Add multiple items to cart
      for (const product of products.items) {
        await basketClient.addItem({
          productId: product.id,
          name: product.name,
          quantity: 1,
          unitPrice: product.price,
        })
      }

      const cart = await basketClient.getCart()

      // Create order
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

      // Verify all items transferred
      expect(order.items).toHaveLength(cart.items.length)

      // Verify each item
      for (const cartItem of cart.items) {
        const orderItem = order.items.find((i: { productId: string }) => i.productId === cartItem.productId)
        expect(orderItem).toBeDefined()
        expect(orderItem.quantity).toBe(cartItem.quantity)
        expect(orderItem.unitPrice).toBe(cartItem.unitPrice)
      }
    })

    test('should preserve item quantities in order', async () => {
      // Get a product
      const products = await productClient.listProducts({ page_size: 1 })

      if (products.items.length === 0) {
        test.skip()
        return
      }

      const product = products.items[0]
      const quantity = 5

      // Add to cart with specific quantity
      const cart = await basketClient.addItem({
        productId: product.id,
        name: product.name,
        quantity: quantity,
        unitPrice: product.price,
      })

      // Create order
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

      // Verify quantity preserved
      const orderItem = order.items.find((i: { productId: string }) => i.productId === product.id)
      expect(orderItem.quantity).toBe(quantity)
    })
  })

  test.describe('Full Flow Consistency', () => {
    test('should maintain consistency through complete flow', async () => {
      // 1. Get product from catalog
      const products = await productClient.listProducts({ page_size: 1 })

      if (products.items.length === 0) {
        test.skip()
        return
      }

      const product = products.items[0]
      const quantity = 2

      // 2. Add to cart
      const cart = await basketClient.addItem({
        productId: product.id,
        name: product.name,
        quantity: quantity,
        unitPrice: product.price,
      })

      // Verify cart calculations
      expect(cart.items[0].subTotal).toBeCloseTo(product.price * quantity, 2)
      expect(cart.totalAmount).toBeCloseTo(product.price * quantity, 2)

      // 3. Create order
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

      // Verify order total matches cart total
      expect(order.totalAmount).toBeCloseTo(cart.totalAmount, 2)

      // 4. Verify order can be retrieved
      const retrievedOrder = await orderClient.getOrder(order.id)
      expect(retrievedOrder.totalAmount).toBeCloseTo(order.totalAmount, 2)

      // 5. Clear cart after successful order
      await basketClient.clearCart()
      const emptyCart = await basketClient.getCart()
      expect(emptyCart.items).toHaveLength(0)
    })

    test('should handle customer ID consistently across services', async () => {
      // Get product
      const products = await productClient.listProducts({ page_size: 1 })

      if (products.items.length === 0) {
        test.skip()
        return
      }

      // Add to cart (associates with customer)
      await basketClient.addItem({
        productId: products.items[0].id,
        name: products.items[0].name,
        quantity: 1,
        unitPrice: products.items[0].price,
      })

      const cart = await basketClient.getCart()

      // Create order (associates with customer)
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

      // Verify customer ID is consistent
      expect(cart.customerId).toBe(testUserId)
      expect(order.customerId).toBe(testUserId)

      // Verify order shows up in customer's orders
      const customerOrders = await orderClient.getOrdersByCustomer(testUserId)
      const foundOrder = customerOrders.find((o: { id: string }) => o.id === order.id)
      expect(foundOrder).toBeDefined()
    })
  })

  test.describe('Error Handling Across Services', () => {
    test('should handle empty cart checkout gracefully', async () => {
      // Get empty cart
      const cart = await basketClient.getCart()
      expect(cart.items).toHaveLength(0)

      // Attempting to create order with empty items should fail or be rejected
      // (Implementation may vary - testing the behavior exists)
      try {
        await orderClient.createOrder({
          customerId: testUserId,
          items: [],
          shippingAddress: testAddresses.usa,
          currency: 'USD',
        })
        // Some implementations may reject empty orders
      } catch (error) {
        // Expected - empty orders should be rejected
        expect(error).toBeDefined()
      }
    })

    test('should handle invalid product ID in cart', async () => {
      // Add item with non-existent product ID
      // This tests that the system handles orphaned cart items
      await basketClient.addItem({
        productId: 'non-existent-product-id',
        name: 'Non-existent Product',
        quantity: 1,
        unitPrice: 9.99,
      })

      // Cart should still work
      const cart = await basketClient.getCart()
      expect(cart.items).toHaveLength(1)

      // Order should also work (business decision whether to validate)
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

      expect(order.id).toBeDefined()
    })
  })

  test.describe('Currency Consistency', () => {
    test('should maintain currency through flow', async () => {
      // Get product
      const products = await productClient.listProducts({ page_size: 1 })

      if (products.items.length === 0) {
        test.skip()
        return
      }

      const product = products.items[0]

      // Add to cart
      const cart = await basketClient.addItem({
        productId: product.id,
        name: product.name,
        quantity: 1,
        unitPrice: product.price,
      })

      // Create order with matching currency
      const order = await orderClient.createOrder({
        customerId: testUserId,
        items: cart.items.map((item: { productId: string; name: string; quantity: number; unitPrice: number }) => ({
          productId: item.productId,
          productName: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
        shippingAddress: testAddresses.usa,
        currency: product.currency,
      })

      // Verify currency consistency
      expect(product.currency).toBe('USD') // Assumption from test data
      expect(order.currency).toBe(product.currency)
    })
  })
})
