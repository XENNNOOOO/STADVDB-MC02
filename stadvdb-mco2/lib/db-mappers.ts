import type { Order, Product, OrderFormData } from './types';

// Database row interfaces (actual database structure)
interface DatabaseOrder {
  id: number;
  orderNumber: string;
  userId: number;
  deliveryDate: string;
  deliveryRiderId?: number;
  createdAt: string;
  updatedAt: string;
}

interface DatabaseProduct {
  id: number;
  name: string;
  price: number;
  productNumber?: string;
}

interface DatabaseOrderItem {
  id: number;
  orderId: number;
  productId: number;
  quantity: number;
  price: number;
}

// Mapping functions to convert database rows to API format
export const mapDatabaseOrderToAPI = (dbOrder: DatabaseOrder, totalAmount?: number): Order => {
  return {
    ORDER_NUMBER: dbOrder.orderNumber,
    CUSTOMER_NUMBER: dbOrder.userId.toString(),
    ORDER_DATE: dbOrder.createdAt,
    DELIVERY_DATE: dbOrder.deliveryDate,
    TOTAL_AMOUNT: totalAmount || 0, // Will be calculated separately
  };
};

export const mapDatabaseProductToAPI = (dbProduct: DatabaseProduct): Product => {
  return {
    PRODUCT_NUMBER: dbProduct.productNumber || dbProduct.id.toString(),
    PRODUCT_NAME: dbProduct.name,
    UNIT_PRICE: dbProduct.price,
  };
};

// Convert API OrderFormData to database format
export const mapAPIOrderToDatabase = (orderData: OrderFormData) => {
  return {
    orderNumber: orderData.orderNumber,
    userId: parseInt(orderData.customerNumber),
    deliveryDate: orderData.deliveryDate,
    // createdAt will be set by MySQL DEFAULT
  };
};

// Helper to extract year from delivery date for routing
export const getYearFromDeliveryDate = (deliveryDate: string): '2024' | '2025' => {
  const year = new Date(deliveryDate).getFullYear();
  return year >= 2025 ? '2025' : '2024';
};

// Helper to generate order number (if not provided)
export const generateOrderNumber = (year: '2024' | '2025'): string => {
  const prefix = year === '2025' ? 'L' : 'V';
  const timestamp = Date.now().toString().slice(-6);
  return `${prefix}-${timestamp}`;
};

// Validate order data - Note: customerNumber is not required from frontend (injected by API)
export const validateOrderData = (orderData: any): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!orderData.deliveryDate) {
    errors.push('Delivery date is required');
  }

  if (!orderData.items || !Array.isArray(orderData.items) || orderData.items.length === 0) {
    errors.push('At least one order item is required');
  }

  // Validate each item
  if (orderData.items) {
    orderData.items.forEach((item: any, index: number) => {
      if (!item.productNumber) {
        errors.push(`Item ${index + 1}: Product number is required`);
      }
      if (!item.quantity || item.quantity < 1) {
        errors.push(`Item ${index + 1}: Quantity must be at least 1`);
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// API Response helpers
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  failover_info?: {
    used_node: string;
    attempts?: string[];
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasMore: boolean;
    };
  };
  error?: string;
  details?: any;
}

export const createSuccessResponse = <T>(
  data: T,
  message?: string,
  failoverInfo?: {
    used_node: string;
    attempts?: string[];
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasMore: boolean;
    };
  }
): APIResponse<T> => {
  return {
    success: true,
    data,
    message,
    failover_info: failoverInfo,
  };
};

export const createErrorResponse = (
  error: string,
  details?: any
): APIResponse => {
  return {
    success: false,
    error,
    details,
  };
};