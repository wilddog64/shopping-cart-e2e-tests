import { ShippingAddress, AddItemRequest, CreateOrderRequest, OrderItem } from '../helpers/api-client'

/**
 * Test product data
 */
export const testProducts = {
  laptop: {
    sku: 'E2E-LAPTOP-001',
    name: 'E2E Test Laptop',
    description: 'A laptop for E2E testing',
    price: 999.99,
    currency: 'USD',
    quantity: 10,
    category: 'Electronics',
  },
  phone: {
    sku: 'E2E-PHONE-001',
    name: 'E2E Test Phone',
    description: 'A phone for E2E testing',
    price: 599.99,
    currency: 'USD',
    quantity: 20,
    category: 'Electronics',
  },
  book: {
    sku: 'E2E-BOOK-001',
    name: 'E2E Test Book',
    description: 'A book for E2E testing',
    price: 29.99,
    currency: 'USD',
    quantity: 100,
    category: 'Books',
  },
}

/**
 * Test shipping addresses
 */
export const testAddresses: Record<string, ShippingAddress> = {
  usa: {
    street: '123 Test Street',
    city: 'San Francisco',
    state: 'CA',
    postalCode: '94102',
    country: 'USA',
  },
  ny: {
    street: '456 Broadway',
    city: 'New York',
    state: 'NY',
    postalCode: '10001',
    country: 'USA',
  },
}

/**
 * Create cart item request from product data
 */
export function createCartItem(
  productId: string,
  productData: typeof testProducts.laptop,
  quantity: number = 1
): AddItemRequest {
  return {
    productId,
    name: productData.name,
    quantity,
    unitPrice: productData.price,
  }
}

/**
 * Create order request from cart items
 */
export function createOrderRequest(
  customerId: string,
  items: { productId: string; name: string; quantity: number; unitPrice: number }[],
  address: ShippingAddress = testAddresses.usa
): CreateOrderRequest {
  return {
    customerId,
    items: items.map((item) => ({
      productId: item.productId,
      productName: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
    shippingAddress: address,
    currency: 'USD',
  }
}

/**
 * Calculate expected total from items
 */
export function calculateTotal(items: { quantity: number; unitPrice: number }[]): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
}

/**
 * Generate unique SKU for test isolation
 */
export function generateSku(prefix: string = 'E2E'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`
}
