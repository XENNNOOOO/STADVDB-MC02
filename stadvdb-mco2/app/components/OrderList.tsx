'use client';
import { useState } from 'react';
import OrderFilter from './OrderFilter';
import { Order } from '@/app/page';

export default function OrderList({ orders }: { orders: Order[] }) {
  const [filter, setFilter] = useState<'all' | 'node1' | 'node2'>('all');

  const filteredOrders = orders.filter(order => {
    const year = parseInt(order.ORDER_DATE.slice(0, 4));
    if (filter === 'node1') return year >= 2025;
    if (filter === 'node2') return year <= 2024;
    return true;
  });

  const getNodeLabel = (date: string) => {
    const year = parseInt(date.slice(0, 4));
    if (year >= 2025) return "Node 1";
    if (year <= 2024) return "Node 2";
    return "Node 0";
  };

  return (
    <div>
      <OrderFilter selected={filter} onChange={setFilter} />

      <table className="w-full border mt-4">
        <thead className="bg-gray-100">
          <tr>
            <th className="border px-2 py-1">Order #</th>
            <th className="border px-2 py-1">Customer</th>
            <th className="border px-2 py-1">Order Date</th>
          </tr>
        </thead>
        <tbody>
          {filteredOrders.map((order) => (
            <tr key={order.ORDER_NUMBER}>
              <td className="border px-2 py-1">{order.ORDER_NUMBER}</td>
              <td className="border px-2 py-1">{order.CUSTOMER_NUMBER}</td>
              <td className="border px-2 py-1">{order.ORDER_DATE}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
