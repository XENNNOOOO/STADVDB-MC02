import type { Connection } from 'mysql2/promise';

// edit this if needed

export interface Order {
  ORDER_NUMBER: string;
  CUSTOMER_NUMBER: string;
  ORDER_DATE: string; 
  DELIVERY_DATE: string; 
  TOTAL_AMOUNT: number;
}

export interface OrderItem {
  ORDER_NUMBER: string;
  PRODUCT_NUMBER: string;
  QUANTITY_ORDERED: number;
}

export interface Product {
  PRODUCT_NUMBER: string;
  PRODUCT_NAME: string;
  UNIT_PRICE: number;
}

export interface OrderFormData {
  orderNumber?: string; // Optional, will be auto-generated if not provided
  customerNumber: string; // Will be populated by API with hardcoded data
  deliveryDate: string;
  items: {
    productNumber: string;
    quantity: number;
  }[];
  _action?: 'DELETE'; // Used for logging a delete action
}

export interface ReplicationLogData {
  target_node: 'node1' | 'node2';
  query_text: string;
  query_params: string; // JSON.stringify(params)
}

export interface PendingSyncData {
  origin_node: 'node1' | 'node2';
  delivery_date: string;
  order_data: string; // JSON.stringify(OrderFormData)
}

// 3-step failover path for reads
export type ReadPath = ['node1' | 'node2', 'central' | 'node1' | 'node2', 'central' | 'node1' | 'node2'];

// DB connection
export type NodeName = 'central' | 'node1' | 'node2';
export type GetConnectionFn = (node: NodeName) => Promise<Connection>;