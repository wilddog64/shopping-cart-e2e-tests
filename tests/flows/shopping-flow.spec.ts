import { test, expect } from '@playwright/test'
import { ProductCatalogClient, BasketClient, OrderClient, config } from '../helpers/api-client'
import { cleanupTestData, generateTestId } from '../helpers/cleanup'
import { testAddresses } from '../fixtures/test-data'

/**
 * Complete Shopping Flow Tests
 *
 * These tests verify the complete user journey from browsing products
 * to placing an order, testing integration across all services.
 */
test.describe('Complete Shopping Flow', () => {
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

  test('complete shopping journey - single item', async () => {
    // Step 1: Browse products
    const productList = await productClient.listProducts({ page_size: 10 })
    expect(productList.items.length).toBeGreaterThan(0)

    // Step 2: Select a product
    const selectedProduct = productList.items[0]
    const productDetails = await productClient.getProduct(selectedProduct.id)
    expect(productDetails.id).toBe(selectedProduct.id)
    expect(productDetails.price).toBeGreaterThan(0)

    // Step 3: Add to cart
    await basketClient.addItem({
      productId: productDetails.id,
      name: productDetails.name,
      quantity: 1,
      unitPrice: productDetails.price,
    })

    // Step 4: View cart
    const cart = await basketClient.getCart()
    expect(cart.items).toHaveLength(1)
    expect(cart.items[0].productId).toBe(productDetails.id)
    expect(cart.totalAmount).toBe(productDetails.price)

    // Step 5: Checkout - create order
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

    expect(order.status).toBe('PENDING')
    expect(order.totalAmount).toBe(cart.totalAmount)

    // Step 6: Verify order was created
    const retrievedOrder = await orderClient.getOrder(order.id)
    expect(retrievedOrder.id).toBe(order.id)
    expect(retrievedOrder.items).toHaveLength(1)

    // Step 7: Clear cart after successful checkout
    await basketClient.clearCart()
    const emptyCart = await basketClient.getCart()
    expect(emptyCart.items).toHaveLength(0)
  })

  test('complete shopping journey - multiple items', async () => {
    // Step 1: Browse products in different categories
    const electronics = await productClient.listProducts({ category: 'Electronics', page_size: 2 })
    const allProducts = await productClient.listProducts({ page_size: 5 })

    // Need at least 2 products
    const products = electronics.items.length >= 2 ? electronics.items : allProducts.items
    if (products.length < 2) {
      test.skip()
      return
    }

    // Step 2: Add multiple items to cart
    const product1 = products[0]
    const product2 = products[1]

    await basketClient.addItem({
      productId: product1.id,
      name: product1.name,
      quantity: 2,
      unitPrice: product1.price,
    })

    await basketClient.addItem({
      productId: product2.id,
      name: product2.name,
      quantity: 1,
      unitPrice: product2.price,
    })

    // Step 3: Review cart
    const cart = await basketClient.getCart()
    expect(cart.items).toHaveLength(2)
    expect(cart.itemCount).toBe(3) // 2 + 1

    const expectedTotal = product1.price * 2 + product2.price * 1
    expect(cart.totalAmount).toBeCloseTo(expectedTotal, 2)

    // Step 4: Create order
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

    expect(order.items).toHaveLength(2)
    expect(order.totalAmount).toBeCloseTo(expectedTotal, 2)

    // Step 5: Clear cart
    await basketClient.clearCart()
  })

  test('shopping with quantity updates', async () => {
    // Get product
    const products = await productClient.listProducts({ page_size: 1 })
    if (products.items.length === 0) {
      test.skip()
      return
    }

    const product = products.items[0]

    // Add with initial quantity
    const initialCart = await basketClient.addItem({
      productId: product.id,
      name: product.name,
      quantity: 1,
      unitPrice: product.price,
    })

    const itemId = initialCart.items[0].id

    // Update quantity
    const updatedCart = await basketClient.updateItem(itemId, { quantity: 5 })
    expect(updatedCart.items[0].quantity).toBe(5)
    expect(updatedCart.totalAmount).toBeCloseTo(product.price * 5, 2)

    // Proceed to checkout
    const order = await orderClient.createOrder({
      customerId: testUserId,
      items: updatedCart.items.map(
        (item: { productId: string; name: string; quantity: number; unitPrice: number }) => ({
          productId: item.productId,
          productName: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })
      ),
      shippingAddress: testAddresses.usa,
      currency: 'USD',
    })

    expect(order.items[0].quantity).toBe(5)
    expect(order.totalAmount).toBeCloseTo(product.price * 5, 2)
  })

  test('shopping with item removal', async () => {
    // Get products
    const products = await productClient.listProducts({ page_size: 3 })
    if (products.items.length < 3) {
      test.skip()
      return
    }

    // Add three items
    for (const product of products.items) {
      await basketClient.addItem({
        productId: product.id,
        name: product.name,
        quantity: 1,
        unitPrice: product.price,
      })
    }

    let cart = await basketClient.getCart()
    expect(cart.items).toHaveLength(3)

    // Remove middle item
    const itemToRemove = cart.items[1].id
    cart = await basketClient.removeItem(itemToRemove)
    expect(cart.items).toHaveLength(2)

    // Create order with remaining items
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

    expect(order.items).toHaveLength(2)
  })

  test('browse by category and purchase', async () => {
    // Browse Electronics category
    const electronics = await productClient.listProducts({ category: 'Electronics' })

    if (electronics.items.length === 0) {
      // Fall back to any category
      const allProducts = await productClient.listProducts({ page_size: 1 })
      if (allProducts.items.length === 0) {
        test.skip()
        return
      }
    }

    const products = electronics.items.length > 0 ? electronics.items : (await productClient.listProducts()).items

    // Add first product from category
    const product = products[0]
    await basketClient.addItem({
      productId: product.id,
      name: product.name,
      quantity: 1,
      unitPrice: product.price,
    })

    const cart = await basketClient.getCart()

    // Complete purchase
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

    expect(order.status).toBe('PENDING')
  })

  test('paginated product browsing', async () => {
    // Get first page
    const page1 = await productClient.listProducts({ page: 1, page_size: 2 })
    expect(page1.page).toBe(1)

    // Get second page if available
    if (page1.pages > 1) {
      const page2 = await productClient.listProducts({ page: 2, page_size: 2 })
      expect(page2.page).toBe(2)

      // Items should be different
      if (page1.items.length > 0 && page2.items.length > 0) {
        expect(page2.items[0].id).not.toBe(page1.items[0].id)
      }
    }

    // Add item from first page to cart
    if (page1.items.length > 0) {
      await basketClient.addItem({
        productId: page1.items[0].id,
        name: page1.items[0].name,
        quantity: 1,
        unitPrice: page1.items[0].price,
      })

      const cart = await basketClient.getCart()
      expect(cart.items).toHaveLength(1)
    }
  })
})
