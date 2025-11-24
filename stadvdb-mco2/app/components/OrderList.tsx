'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Pencil, Trash2 } from 'lucide-react';
import OrderFilter from './OrderFilter';
import { Order } from '@/app/page';

interface APIResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export default function OrderList() {
  const [filter, setFilter] = useState<'all' | 'node1' | 'node2'>('all'); // Default to all orders
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50); // Limit to 50 items per page

  // Fetch orders based on filter
  useEffect(() => {
    const fetchOrders = async () => {
      setLoading(true);
      setError(null);

      try {
        let allOrders: Order[] = [];

        if (filter === 'all') {
          // Fetch both 2024 and 2025 data with reasonable limits
          const [response2024, response2025] = await Promise.allSettled([
            fetch('/api/orders?year=2024'),
            fetch('/api/orders?year=2025')
          ]);

          // Handle 2024 data
          if (response2024.status === 'fulfilled' && response2024.value.ok) {
            const result2024: APIResponse<Order[]> = await response2024.value.json();
            if (result2024.success && result2024.data) {
              // Include all 2024 orders
              allOrders = [...allOrders, ...result2024.data];
            }
          }

          // Handle 2025 data
          if (response2025.status === 'fulfilled' && response2025.value.ok) {
            const result2025: APIResponse<Order[]> = await response2025.value.json();
            if (result2025.success && result2025.data) {
              // Include all 2025 orders
              allOrders = [...allOrders, ...result2025.data];
            }
          }

          // If both failed, show error
          if (response2024.status === 'rejected' && response2025.status === 'rejected') {
            throw new Error('Failed to fetch orders from any node');
          }

        } else {
          // Fetch specific year data
          const year = filter === 'node1' ? '2025' : '2024';
          const response = await fetch(`/api/orders?year=${year}`);

          if (!response.ok) {
            throw new Error(`Failed to fetch orders: ${response.statusText}`);
          }

          const result: APIResponse<Order[]> = await response.json();

          if (!result.success || !result.data) {
            throw new Error(result.error || 'Failed to fetch orders');
          }

          // Include all orders for the selected year
          allOrders = result.data;
        }

        setOrders(allOrders);
        setCurrentPage(1); // Reset to first page when filter changes

      } catch (err: any) {
        console.error('Error fetching orders:', err);
        setError(err.message || 'Failed to fetch orders');
        setOrders([]); // Reset orders on error
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [filter]);

  const filteredOrders = orders.filter(order => {
    if (filter === 'all') return true;

    // Use DELIVERY_DATE for filtering since that's what your fragmentation is based on
    const year = parseInt(order.DELIVERY_DATE?.slice(0, 4) || order.ORDER_DATE?.slice(0, 4) || '2024');
    if (filter === 'node1') return year >= 2025;
    if (filter === 'node2') return year <= 2024;
    return true;
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentOrders = filteredOrders.slice(startIndex, endIndex);

  if (loading) {
    return (
      <div>
        <OrderFilter selected={filter} onChange={setFilter} />
        <div className="mt-4 p-8 text-center">
          <div className="animate-pulse text-gray-500">Loading orders...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <OrderFilter selected={filter} onChange={setFilter} />
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded">
          <div className="text-red-700 font-semibold">Error loading orders</div>
          <div className="text-red-600 text-sm mt-1">{error}</div>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <OrderFilter selected={filter} onChange={setFilter} />

      <div className="mt-4">
        {/* Show total count */}
        <div className="mb-4 text-sm text-gray-600">
          Showing {currentOrders.length} of {filteredOrders.length} orders
        </div>

        {filteredOrders.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No orders found for the selected filter.
          </div>
        ) : (
          <>
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100 text-left text-sm text-gray-600">
                  <th className="px-3 py-2 border-b">Order #</th>
                  <th className="px-3 py-2 border-b">Customer</th>
                  <th className="px-3 py-2 border-b">Delivery Date</th>
                  <th className="px-3 py-2 border-b">Total</th>
                  <th className="px-3 py-2 border-b w-12"></th>
                </tr>
              </thead>

              <tbody>
                {currentOrders.map((order) => (
                  <tr key={order.ORDER_NUMBER} className="hover:bg-gray-50 transition">
                    <td className="px-3 py-2 border-b">{order.ORDER_NUMBER}</td>
                    <td className="px-3 py-2 border-b">{order.CUSTOMER_NUMBER}</td>
                    <td className="px-3 py-2 border-b">{order.DELIVERY_DATE || order.ORDER_DATE}</td>
                    <td className="px-3 py-2 border-b">₱{order.TOTAL_AMOUNT.toFixed(2)}</td>

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

            {/* Pagination controls */}
            {totalPages > 1 && (
              <div className="mt-6 flex justify-center items-center gap-2">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 bg-gray-200 text-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300"
                >
                  Previous
                </button>

                <span className="px-3 py-1 text-sm text-gray-600">
                  Page {currentPage} of {totalPages}
                </span>

                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 bg-gray-200 text-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
