// File path: app/components/OrderList.tsx
'use client'; // This component has client-side actions (delete button)

import Link from 'next/link';
import { Eye, Trash2 } from 'lucide-react'; // This will now work
import { Order } from '@/app/page'; // Reuse the type from the main page

interface OrderListProps {
  orders: Order[];
}

export default function OrderList({ orders }: OrderListProps) {
  
  // UI-ONLY: This is a fake delete handler for the prototype
  const handleDelete = (orderNumber: string) => {
    alert(`UI-ONLY: Would call API to delete order ${orderNumber}`);
    // In the real app, you would then re-fetch the data or remove this item from the state
  };

  return (
    <div className="bg-white shadow-md rounded-lg overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order #</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer #</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {orders.length === 0 && (
            <tr>
              <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                No orders found.
              </td>
            </tr>
          )}
          {orders.map((order) => (
            <tr key={order.ORDER_NUMBER} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">{order.ORDER_NUMBER}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{order.CUSTOMER_NUMBER}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{order.ORDER_DATE}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">P {order.TOTAL_AMOUNT.toFixed(2)}</td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium flex gap-4 justify-end">
                {/* This Link navigates to the "Edit" page */}
                <Link href={`/orders/${order.ORDER_NUMBER}`} className="text-blue-600 hover:text-blue-800">
                  <Eye size={18} />
                </Link>
                <button
                  onClick={() => handleDelete(order.ORDER_NUMBER)}
                  className="text-red-600 hover:text-red-800"
                >
                  <Trash2 size={18} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}