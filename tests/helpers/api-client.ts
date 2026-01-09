import { APIRequestContext } from '@playwright/test'

// Environment configuration
export const config = {
  productCatalogUrl: process.env.PRODUCT_CATALOG_URL || 'http://localhost:8000',
  basketUrl: process.env.BASKET_URL || 'http://localhost:8083',
  orderUrl: process.env.ORDER_URL || 'http://localhost:8080',
  paymentUrl: process.env.PAYMENT_URL || 'http://localhost:8084',
  testUserId: process.env.TEST_USER_ID || 'e2e-test-user',
}

// Types
export interface Product {
  id: string
  sku: string
  name: string
  description?: string
  price: number
  currency: string
  quantity: number
  category?: string
  image_url?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ProductListResponse {
  items: Product[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface CartItem {
  id: string
  productId: string
  name: string
  quantity: number
  unitPrice: number
  subTotal: number
}

export interface Cart {
  id: string
  customerId: string
  items: CartItem[]
  itemCount: number
  totalAmount: number
  currency: string
  createdAt: string
  updatedAt: string
  expiresAt: string
}

export interface AddItemRequest {
  productId: string
  name: string
  quantity: number
  unitPrice: number
}

export interface UpdateItemRequest {
  quantity: number
}

export interface ShippingAddress {
  street: string
  city: string
  state: string
  postalCode: string
  country: string
}

export interface OrderItem {
  productId: string
  productName: string
  quantity: number
  unitPrice: number
}

export interface CreateOrderRequest {
  customerId: string
  items: OrderItem[]
  shippingAddress: ShippingAddress
  currency: string
}

export interface Order {
  id: string
  customerId: string
  status: 'PENDING' | 'PAID' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED'
  items: OrderItem[]
  totalAmount: number
  currency: string
  shippingAddress: ShippingAddress
  trackingNumber?: string
  carrier?: string
  createdAt: string
  updatedAt: string
}

// Product Catalog Client
export class ProductCatalogClient {
  constructor(
    private baseUrl: string,
    private request: APIRequestContext
  ) {}

  async listProducts(params?: {
    page?: number
    page_size?: number
    category?: string
    active_only?: boolean
  }): Promise<ProductListResponse> {
    const searchParams = new URLSearchParams()
    if (params?.page) searchParams.set('page', params.page.toString())
    if (params?.page_size) searchParams.set('page_size', params.page_size.toString())
    if (params?.category) searchParams.set('category', params.category)
    if (params?.active_only !== undefined) searchParams.set('active_only', params.active_only.toString())

    const url = `${this.baseUrl}/api/products${searchParams.toString() ? '?' + searchParams.toString() : ''}`
    const response = await this.request.get(url)
    return response.json()
  }

  async getProduct(id: string): Promise<Product> {
    const response = await this.request.get(`${this.baseUrl}/api/products/${id}`)
    return response.json()
  }

  async createProduct(data: Partial<Product>): Promise<Product> {
    const response = await this.request.post(`${this.baseUrl}/api/products`, {
      data,
    })
    return response.json()
  }

  async updateProduct(id: string, data: Partial<Product>): Promise<Product> {
    const response = await this.request.patch(`${this.baseUrl}/api/products/${id}`, {
      data,
    })
    return response.json()
  }

  async deleteProduct(id: string): Promise<void> {
    await this.request.delete(`${this.baseUrl}/api/products/${id}`)
  }

  async checkHealth(): Promise<{ status: string }> {
    const response = await this.request.get(`${this.baseUrl}/health`)
    return response.json()
  }
}

// Basket (Cart) Client
export class BasketClient {
  constructor(
    private baseUrl: string,
    private request: APIRequestContext,
    private userId: string = config.testUserId
  ) {}

  private getHeaders() {
    return {
      'X-User-ID': this.userId,
    }
  }

  async getCart(): Promise<Cart> {
    const response = await this.request.get(`${this.baseUrl}/api/v1/cart`, {
      headers: this.getHeaders(),
    })
    return response.json()
  }

  async addItem(item: AddItemRequest): Promise<Cart> {
    const response = await this.request.post(`${this.baseUrl}/api/v1/cart/items`, {
      headers: this.getHeaders(),
      data: item,
    })
    return response.json()
  }

  async updateItem(itemId: string, data: UpdateItemRequest): Promise<Cart> {
    const response = await this.request.put(`${this.baseUrl}/api/v1/cart/items/${itemId}`, {
      headers: this.getHeaders(),
      data,
    })
    return response.json()
  }

  async removeItem(itemId: string): Promise<Cart> {
    const response = await this.request.delete(`${this.baseUrl}/api/v1/cart/items/${itemId}`, {
      headers: this.getHeaders(),
    })
    return response.json()
  }

  async clearCart(): Promise<void> {
    await this.request.delete(`${this.baseUrl}/api/v1/cart`, {
      headers: this.getHeaders(),
    })
  }

  async checkout(shippingAddress: ShippingAddress): Promise<Cart> {
    const response = await this.request.post(`${this.baseUrl}/api/v1/cart/checkout`, {
      headers: this.getHeaders(),
      data: { shippingAddress },
    })
    return response.json()
  }

  async checkHealth(): Promise<{ status: string }> {
    const response = await this.request.get(`${this.baseUrl}/health`)
    return response.json()
  }
}

// Order Client
export class OrderClient {
  constructor(
    private baseUrl: string,
    private request: APIRequestContext,
    private userId: string = config.testUserId
  ) {}

  private getHeaders() {
    return {
      'X-User-ID': this.userId,
      'X-Correlation-ID': `e2e-${Date.now()}`,
    }
  }

  async createOrder(data: CreateOrderRequest): Promise<Order> {
    const response = await this.request.post(`${this.baseUrl}/api/orders`, {
      headers: this.getHeaders(),
      data,
    })
    return response.json()
  }

  async getOrder(orderId: string): Promise<Order> {
    const response = await this.request.get(`${this.baseUrl}/api/orders/${orderId}`, {
      headers: this.getHeaders(),
    })
    return response.json()
  }

  async getOrdersByCustomer(customerId: string): Promise<Order[]> {
    const response = await this.request.get(`${this.baseUrl}/api/orders?customerId=${customerId}`, {
      headers: this.getHeaders(),
    })
    return response.json()
  }

  async updateOrderStatus(orderId: string, status: string): Promise<Order> {
    const response = await this.request.patch(`${this.baseUrl}/api/orders/${orderId}/status`, {
      headers: this.getHeaders(),
      data: { status },
    })
    return response.json()
  }

  async cancelOrder(orderId: string, reason?: string): Promise<Order> {
    const response = await this.request.post(`${this.baseUrl}/api/orders/${orderId}/cancel`, {
      headers: this.getHeaders(),
      data: { reason: reason || 'E2E test cancellation' },
    })
    return response.json()
  }

  async checkHealth(): Promise<{ status: string }> {
    const response = await this.request.get(`${this.baseUrl}/actuator/health`)
    return response.json()
  }
}

// Payment Types
export type PaymentStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REFUND_PENDING' | 'REFUNDED' | 'REFUND_FAILED'

export interface ProcessPaymentRequest {
  orderId: string
  customerId: string
  amount: number
  currency: string
  gateway?: string
  paymentMethodId?: string
  idempotencyKey?: string
}

export interface Payment {
  id: string
  orderId: string
  customerId: string
  amount: number
  currency: string
  status: PaymentStatus
  gateway: string
  gatewayTransactionId?: string
  cardLast4?: string
  cardBrand?: string
  failureReason?: string
  failureCode?: string
  createdAt: string
  processedAt?: string
  completedAt?: string
}

export interface RefundRequest {
  amount: number
  reason?: string
}

export interface Refund {
  id: string
  paymentId: string
  amount: number
  currency: string
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  reason?: string
  gatewayRefundId?: string
  createdAt: string
  completedAt?: string
}

// Payment Client
export class PaymentClient {
  constructor(
    private baseUrl: string,
    private request: APIRequestContext,
    private userId: string = config.testUserId
  ) {}

  private getHeaders() {
    return {
      'X-User-ID': this.userId,
      'X-Correlation-ID': `e2e-${Date.now()}`,
    }
  }

  async processPayment(data: ProcessPaymentRequest): Promise<Payment> {
    const response = await this.request.post(`${this.baseUrl}/api/payments`, {
      headers: this.getHeaders(),
      data,
    })
    return response.json()
  }

  async getPayment(paymentId: string): Promise<Payment> {
    const response = await this.request.get(`${this.baseUrl}/api/payments/${paymentId}`, {
      headers: this.getHeaders(),
    })
    return response.json()
  }

  async getPaymentByOrderId(orderId: string): Promise<Payment | null> {
    const response = await this.request.get(`${this.baseUrl}/api/payments?orderId=${orderId}`, {
      headers: this.getHeaders(),
    })
    const payments = await response.json()
    return payments.length > 0 ? payments[0] : null
  }

  async getPaymentsByCustomer(customerId: string): Promise<Payment[]> {
    const response = await this.request.get(`${this.baseUrl}/api/payments?customerId=${customerId}`, {
      headers: this.getHeaders(),
    })
    return response.json()
  }

  async refundPayment(paymentId: string, data: RefundRequest): Promise<Refund> {
    const response = await this.request.post(`${this.baseUrl}/api/payments/${paymentId}/refund`, {
      headers: this.getHeaders(),
      data,
    })
    return response.json()
  }

  async checkHealth(): Promise<{ status: string }> {
    const response = await this.request.get(`${this.baseUrl}/actuator/health`)
    return response.json()
  }
}
