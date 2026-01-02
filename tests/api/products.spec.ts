import { test, expect } from '@playwright/test'
import { ProductCatalogClient, config } from '../helpers/api-client'

const BASE_URL = config.productCatalogUrl

test.describe('Product Catalog API', () => {
  let client: ProductCatalogClient

  test.beforeEach(async ({ request }) => {
    client = new ProductCatalogClient(BASE_URL, request)
  })

  test.describe('Health Check', () => {
    test('should return healthy status', async () => {
      const health = await client.checkHealth()
      expect(health.status).toBe('healthy')
    })
  })

  test.describe('List Products', () => {
    test('should return products list with pagination', async () => {
      const result = await client.listProducts()

      expect(result).toHaveProperty('items')
      expect(result).toHaveProperty('total')
      expect(result).toHaveProperty('page')
      expect(result).toHaveProperty('page_size')
      expect(result).toHaveProperty('pages')
      expect(Array.isArray(result.items)).toBe(true)
    })

    test('should support pagination parameters', async () => {
      const page1 = await client.listProducts({ page: 1, page_size: 5 })
      expect(page1.page).toBe(1)
      expect(page1.page_size).toBe(5)
    })

    test('should filter by category', async () => {
      const result = await client.listProducts({ category: 'Electronics' })

      for (const product of result.items) {
        expect(product.category).toBe('Electronics')
      }
    })

    test('should only return active products by default', async () => {
      const result = await client.listProducts()

      for (const product of result.items) {
        expect(product.is_active).toBe(true)
      }
    })
  })

  test.describe('Get Product', () => {
    test('should return product by ID', async () => {
      // First get a product from the list
      const list = await client.listProducts({ page_size: 1 })

      if (list.items.length > 0) {
        const productId = list.items[0].id
        const product = await client.getProduct(productId)

        expect(product.id).toBe(productId)
        expect(product).toHaveProperty('sku')
        expect(product).toHaveProperty('name')
        expect(product).toHaveProperty('price')
        expect(product).toHaveProperty('currency')
        expect(product).toHaveProperty('quantity')
      } else {
        test.skip()
      }
    })

    test('should return 404 for non-existent product', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/products/00000000-0000-0000-0000-000000000000`)
      expect(response.status()).toBe(404)
    })
  })

  test.describe('Product Data Validation', () => {
    test('should have valid price format', async () => {
      const result = await client.listProducts()

      for (const product of result.items) {
        expect(typeof product.price).toBe('number')
        expect(product.price).toBeGreaterThan(0)
      }
    })

    test('should have valid quantity', async () => {
      const result = await client.listProducts()

      for (const product of result.items) {
        expect(typeof product.quantity).toBe('number')
        expect(product.quantity).toBeGreaterThanOrEqual(0)
      }
    })

    test('should have valid currency code', async () => {
      const result = await client.listProducts()

      for (const product of result.items) {
        expect(product.currency).toMatch(/^[A-Z]{3}$/)
      }
    })
  })
})
