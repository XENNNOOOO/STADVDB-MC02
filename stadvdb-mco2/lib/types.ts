import type { Pool } from 'pg';

// edit this file to add any shared types used in multiple files

export interface Order {
  ORDER_NUMBER: string;
  CUSTOMER_NUMBER: string;  // Note guys: PostgreSQL varchar/text maps to string
  ORDER_DATE: string;       // PostgreSQL timestamp will be read as a string
  DELIVERY_DATE: string;    // PostgreSQL date will be read as a string
  TOTAL_AMOUNT: number;     // PostgreSQL numeric/decimal will be read as a string or number
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
  orderNumber: string; 
  customerNumber: string;
  deliveryDate: string;
  items: {
    productNumber: string;
    quantity: number;
  }[];
  _action?: 'DELETE'; 
}

export interface ReplicationLogData {
  target_node: 'node1' | 'node2';
  query_text: string;
  query_params: any; // JSON.stringify(params)
}

export interface PendingSyncData {
  origin_node: 'node1' | 'node2';
  delivery_date: string;
  order_data: any; // JSON.stringify(OrderFormData)
}

// 3-step failover path for reads
export type ReadPath = ['node1' | 'node2', 'central' | 'node1' | 'node2', 'central' | 'node1' | 'node2'];

// DB connection
export type NodeName = 'central' | 'node1' | 'node2';
export type GetConnectionFn = (node: NodeName) => Pool;