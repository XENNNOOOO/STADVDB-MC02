import type { Connection } from 'mysql2/promise';

// edit this if needed

export interface Order {
  id: number;
  orderNumber: string;
  userId: number;
  deliveryDate: string;
  deliveryRiderId?: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: number;
  orderId: number;
  productId: number;
  quantity: number;
  price: number;
}

export interface Product {
  id: number;
  name: string;
  price: number;
  productNumber?: string;
}

export interface OrderFormData {
  orderNumber: string; 
  customerNumber: string;
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