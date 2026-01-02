import { APIRequestContext } from '@playwright/test'
import { BasketClient, OrderClient, config } from './api-client'

/**
 * Clean up test data after tests
 * Clears cart and optionally cancels pending orders
 */
export async function cleanupTestData(
  request: APIRequestContext,
  options?: {
    clearCart?: boolean
    cancelOrders?: boolean
    userId?: string
  }
): Promise<void> {
  const userId = options?.userId || config.testUserId
  const clearCart = options?.clearCart ?? true
  const cancelOrders = options?.cancelOrders ?? false

  // Clear cart
  if (clearCart) {
    try {
      const basketClient = new BasketClient(config.basketUrl, request, userId)
      await basketClient.clearCart()
    } catch (error) {
      // Cart might not exist, ignore
      console.debug('Cart cleanup skipped:', (error as Error).message)
    }
  }

  // Cancel pending orders (optional, disabled by default)
  if (cancelOrders) {
    try {
      const orderClient = new OrderClient(config.orderUrl, request, userId)
      const orders = await orderClient.getOrdersByCustomer(userId)

      for (const order of orders) {
        if (order.status === 'PENDING') {
          try {
            await orderClient.cancelOrder(order.id, 'E2E test cleanup')
          } catch (error) {
            console.debug('Order cancellation skipped:', order.id)
          }
        }
      }
    } catch (error) {
      console.debug('Order cleanup skipped:', (error as Error).message)
    }
  }
}

/**
 * Generate unique test ID for isolation
 */
export function generateTestId(): string {
  return `e2e-${Date.now()}-${Math.random().toString(36).substring(7)}`
}

/**
 * Wait for condition with timeout
 */
export async function waitFor(
  condition: () => Promise<boolean>,
  options?: {
    timeout?: number
    interval?: number
    message?: string
  }
): Promise<void> {
  const timeout = options?.timeout ?? 10000
  const interval = options?.interval ?? 500
  const message = options?.message ?? 'Condition not met'

  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, interval))
  }

  throw new Error(`Timeout: ${message}`)
}
