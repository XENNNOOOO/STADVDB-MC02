'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Pencil, Trash2 } from 'lucide-react';
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

  return (
    <div>
      <OrderFilter selected={filter} onChange={setFilter} />

      <table className="w-full mt-4 border-collapse">
        <thead>
          <tr className="bg-gray-100 text-left text-sm text-gray-600">
            <th className="px-3 py-2 border-b">Order #</th>
            <th className="px-3 py-2 border-b">Customer</th>
            <th className="px-3 py-2 border-b">Order Date</th>
            <th className="px-3 py-2 border-b w-12"></th>
          </tr>
        </thead>

        <tbody>
          {filteredOrders.map((order) => (
            <tr key={order.ORDER_NUMBER} className="hover:bg-gray-50 transition">
              <td className="px-3 py-2 border-b">{order.ORDER_NUMBER}</td>
              <td className="px-3 py-2 border-b">{order.CUSTOMER_NUMBER}</td>
              <td className="px-3 py-2 border-b">{order.ORDER_DATE}</td>

              {/* Right aligned small actions */}
              <td className="px-3 py-2 border-b text-right">
                <div className="flex justify-end gap-3 opacity-70 hover:opacity-100 transition">

                  <Link href={`/orders/${order.ORDER_NUMBER}`}>
                    <Pencil size={18} className="cursor-pointer hover:text-blue-600" />
                  </Link>

                  <Link href={`/orders/${order.ORDER_NUMBER}/delete`}>
                    <Trash2 size={18} className="cursor-pointer hover:text-red-600" />
                  </Link>

                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
