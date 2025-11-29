'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2, Eye, X, Plus, ChevronDown } from 'lucide-react';
import QuickActions from './QuickActions';

interface Order {
  ORDER_NUMBER: string;
  CUSTOMER_NUMBER: string;
  ORDER_DATE: string;
  DELIVERY_DATE: string;
  DELIVERY_RIDER_ID?: string;
  TOTAL_AMOUNT: number;
  items?: any[];
  NODE_ACCESSED?: string;
  FAILOVER_PATH?: string[];
}

interface Product {
  PRODUCT_NUMBER: string;
  PRODUCT_NAME: string;
  UNIT_PRICE: number;
}

interface APIResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  failover_info?: {
    used_node: string;
    attempts: string[];
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasMore: boolean;
    };
  };
  error?: string;
}

type YearFilterType = 'all' | '2024' | '2025';
type ModalMode = 'view' | 'create' | 'delete' | null;

export default function OrderList() {
  const router = useRouter();
  const [filter, setFilter] = useState<YearFilterType>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Fetch products on component mount
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await fetch('/api/products');
        const result: APIResponse<Product[]> = await response.json();

        if (result.success && result.data) {
          setProducts(result.data);
        } else {
          console.error('Failed to fetch products:', result.error);
        }
      } catch (err: any) {
        console.error('Error fetching products:', err);
      }
    };

    fetchProducts();
  }, []);


  // Fetch orders based on filter and pagination
  useEffect(() => {
    const fetchOrders = async () => {
      setLoading(true);
      setError(null);

      try {
        
        // If 'all', we omit the 'year' param so the API hits Node 0 (Central).
        const params = new URLSearchParams();
        
        if (filter !== 'all') {
          params.append('year', filter);
        }
        
        params.append('page', currentPage.toString());
        params.append('limit', pageSize.toString());

        const response = await fetch(`/api/orders?${params.toString()}`);

        if (!response.ok) {
          throw new Error(`Failed to fetch orders: ${response.statusText}`);
        }

        const result: APIResponse<Order[]> = await response.json();

        if (!result.success || !result.data) {
          throw new Error(result.error || 'Failed to fetch orders');
        }

        setOrders(result.data);

        // Update pagination metadata from response
        if (result.failover_info?.pagination) {
          setTotalOrders(result.failover_info.pagination.total);
          setTotalPages(result.failover_info.pagination.totalPages);
        }

      } catch (err: any) {
        console.error('Error fetching orders:', err);
        setError(err.message || 'Failed to fetch orders');
        setOrders([]);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [filter, currentPage, pageSize]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (modalMode) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }

    // Cleanup function to restore scroll on unmount
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [modalMode]);

  const filteredOrders = orders; 

  const openModal = (mode: ModalMode, order?: Order) => {
    setSelectedOrder(order || null);
    setModalMode(mode);
  };

  const closeModal = () => {
    setSelectedOrder(null);
    setModalMode(null);
  };

  const handleFilterChange = (newFilter: YearFilterType) => {
    setFilter(newFilter);
    setCurrentPage(1); 
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1); 
  };

  return (
    <>
      <QuickActions onNewOrder={() => openModal('create')} />

      <div className="bg-white rounded-2xl shadow-sm border-2 border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b-2 border-slate-200 bg-slate-50">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">Orders</h2>
            <div className="relative">
              <select
                value={filter}
                onChange={(e) => handleFilterChange(e.target.value as YearFilterType)}
                className="appearance-none pl-4 pr-10 py-2.5 text-sm font-semibold border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-slate-700 cursor-pointer hover:bg-slate-50 transition-colors"
              >
                <option value="all">All Years (Central)</option>
                <option value="2025">2025 (Node 1)</option>
                <option value="2024">2024 (Node 2)</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                <svg className="h-5 w-5 text-slate-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center">
            <p className="text-slate-500 font-medium">Loading orders...</p>
          </div>
        ) : error ? (
          <div className="px-6 py-12 text-center">
            <p className="text-red-600 font-medium">{error}</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-slate-500 font-medium">No orders found</p>
          </div>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b-2 border-slate-200">
              <tr>
                <th className="px-6 py-3 text-center text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Order #
                </th>
                <th className="px-6 py-3 text-center text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Customer ID
                </th>
                <th className="px-6 py-3 text-center text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Created At
                </th>
                <th className="px-6 py-3 text-center text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Delivery Date
                </th>
                <th className="px-6 py-3 text-center text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Rider ID
                </th>
                 <th className="px-6 py-3 text-center text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Total
                </th>
                <th className="px-6 py-3 text-center text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="bg-white divide-y divide-slate-200">
              {filteredOrders.map((order) => (
                <tr key={order.ORDER_NUMBER} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className="font-semibold text-slate-900">{order.ORDER_NUMBER}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center text-slate-600 font-medium">
                    {order.CUSTOMER_NUMBER}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center text-slate-600">
                    {new Date(order.ORDER_DATE).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center text-slate-600">
                    {new Date(order.DELIVERY_DATE).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center text-slate-600">
                    {order.DELIVERY_RIDER_ID || 'Pending'}
                  </td>
                   <td className="px-6 py-4 whitespace-nowrap text-center text-emerald-600 font-bold">
                    ${typeof order.TOTAL_AMOUNT === 'number' ? order.TOTAL_AMOUNT.toFixed(2) : order.TOTAL_AMOUNT}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="flex justify-center gap-2">
                      <button
                        onClick={() => openModal('view', order)}
                        className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                        title="View Details"
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        onClick={() => router.push(`/orders/${order.ORDER_NUMBER}/edit`)}
                        className="p-2 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                        title="Edit Order"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => openModal('delete', order)}
                        className="p-2 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        title="Delete Order"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}

        {/* Pagination Controls */}
        {!loading && !error && orders.length > 0 && (
          <div className="px-6 py-4 border-t-2 border-slate-200 bg-slate-50">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">

              {/* Left: Results info */}
              <div className="text-sm text-slate-600 font-medium">
                Showing {((currentPage - 1) * pageSize) + 1} to{' '}
                {Math.min(currentPage * pageSize, totalOrders)} of{' '}
                {totalOrders} orders
              </div>

              {/* Center: Page controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 border-2 border-slate-300 rounded-lg text-sm font-semibold
                             disabled:opacity-30 disabled:cursor-not-allowed
                             hover:bg-slate-100 transition-all text-slate-700"
                >
                  Previous
                </button>

                {/* Page numbers */}
                <div className="flex gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    // Show current page and 2 pages before and after
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }

                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                          currentPage === pageNum
                            ? 'bg-indigo-600 text-white'
                            : 'hover:bg-slate-100 text-slate-700 border-2 border-slate-300'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="px-4 py-2 border-2 border-slate-300 rounded-lg text-sm font-semibold
                             disabled:opacity-30 disabled:cursor-not-allowed
                             hover:bg-slate-100 transition-all text-slate-700"
                >
                  Next
                </button>
              </div>

              {/* Right: Page size selector */}
              <div className="relative">
                <select
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(parseInt(e.target.value))}
                  className="appearance-none pl-3 pr-10 py-2 text-sm font-semibold border-2 border-slate-300 rounded-lg
                             focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
                             bg-white text-slate-700 cursor-pointer hover:bg-slate-50 transition-colors"
                >
                  <option value="25">25 per page</option>
                  <option value="50">50 per page</option>
                  <option value="100">100 per page</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                  <svg className="h-4 w-4 text-slate-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>

            </div>
          </div>
        )}
      </div>

      {modalMode && (
        <OrderModal
          mode={modalMode}
          order={selectedOrder}
          onClose={closeModal}
          onEdit={() => {
            if (selectedOrder) {
              router.push(`/orders/${selectedOrder.ORDER_NUMBER}/edit`);
            }
          }}
          onDelete={() => {
            if (selectedOrder) {
              setModalMode('delete');
            }
          }}
          products={products}
        />
      )}
    </>
  );
}

interface OrderModalProps {
  mode: 'view' | 'create' | 'delete';
  order: Order | null;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  products: Product[];
}

function OrderModal({ mode, order, onClose, onEdit, onDelete, products }: OrderModalProps) {
  const [formData, setFormData] = useState({
    deliveryDate: order?.DELIVERY_DATE ? new Date(order.DELIVERY_DATE).toISOString().split('T')[0] : '',
    // FIXED: Use order items directly (which contain productNumber from backend) or default
    items: order?.items || [{ productNumber: '', quantity: 1 }],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Validate form data
      if (!formData.deliveryDate) {
        throw new Error('Delivery date is required');
      }
      if (formData.items.length === 0) {
        throw new Error('At least one item is required');
      }

      // Validate that all items have products selected
      for (const item of formData.items) {
        if (!item.productNumber) {
          throw new Error('Please select a product for all items');
        }
      }

      const orderData = {
        deliveryDate: formData.deliveryDate,
        items: formData.items.map(item => ({
          productNumber: item.productNumber,
          quantity: item.quantity
        }))
      };

      const url = '/api/orders';
      const method = 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save order');
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to save order');
      }

      // Success - close modal and refresh the order list
      onClose();

      // Trigger a page reload to refresh the order list
      window.location.reload();

    } catch (err: any) {
      console.error('Error saving order:', err);
      setError(err.message || 'Failed to save order');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!order) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/orders/${order.ORDER_NUMBER}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete order');
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to delete order');
      }

      // Success - close modal and refresh the order list
      onClose();

      // Trigger a page reload to refresh the order list
      window.location.reload();

    } catch (err: any) {
      console.error('Error deleting order:', err);
      setError(err.message || 'Failed to delete order');
    } finally {
      setLoading(false);
    }
  };

  const calculateTotal = () => {
    return formData.items.reduce((total: number, item: any) => {
      // Handle both cases: creating new (has productNumber) or viewing existing (has unitPrice in item or needs lookup)
      let price = item.unitPrice;
      if (!price) {
          // Loose comparison '==' handles number vs string mismatch for product IDs
          const product = products.find((p) => p.PRODUCT_NUMBER == item.productNumber);
          price = product?.UNIT_PRICE || 0;
      }
      return total + price * item.quantity;
    }, 0);
  };

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { productNumber: '', quantity: 1 }],
    });
  };

  const removeItem = (index: number) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_: any, i: number) => i !== index),
    });
  };

  const updateItem = (index: number, field: 'productNumber' | 'quantity', value: string | number) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setFormData({ ...formData, items: newItems });
  };

  // View Mode
  if (mode === 'view') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto scrollbar-hide">
        <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full my-8 max-h-[90vh] overflow-y-auto scrollbar-hide">
          {/* Header */}
          <div className="px-8 pt-8 pb-6 border-b-2 border-slate-200">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-2xl font-bold text-slate-900 mb-1">Order Details</h3>
                <p className="text-slate-500 text-sm font-medium">{order?.ORDER_NUMBER}</p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-100 rounded-lg transition-all text-slate-400 hover:text-slate-600"
              >
                <X size={24} />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-8 space-y-6">
            {/* Customer Information */}
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Customer Information</h4>
              <div className="p-5 bg-slate-50 rounded-xl border-2 border-slate-200">
                <p className="text-sm text-slate-600 mb-1">Customer ID</p>
                <p className="text-lg font-bold text-slate-900">{order?.CUSTOMER_NUMBER}</p>
              </div>
            </div>

            {/* Order Details */}
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Order Information</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-5 bg-slate-50 rounded-xl border-2 border-slate-200">
                  <p className="text-sm text-slate-600 mb-1">Created At</p>
                  <p className="text-lg font-bold text-slate-900">
                    {order?.ORDER_DATE && new Date(order.ORDER_DATE).toLocaleString('en-US', {
                      month: '2-digit',
                      day: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: true
                    })}
                  </p>
                </div>
                <div className="p-5 bg-slate-50 rounded-xl border-2 border-slate-200">
                  <p className="text-sm text-slate-600 mb-1">Delivery Date</p>
                  <p className="text-lg font-bold text-slate-900">{order?.DELIVERY_DATE && new Date(order.DELIVERY_DATE).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}</p>
                </div>
                {/* Rider ID Added back to modal */}
                <div className="p-5 bg-slate-50 rounded-xl border-2 border-slate-200">
                  <p className="text-sm text-slate-600 mb-1">Delivery Rider ID</p>
                  <p className="text-lg font-bold text-slate-900">{order?.DELIVERY_RIDER_ID || 'Not Assigned'}</p>
                </div>
              </div>
            </div>
            
            {/* Items View */}
             <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Items</h4>
              <div className="bg-slate-50 rounded-xl border-2 border-slate-200 overflow-hidden">
                <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-100">
                        <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">Product</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">Qty</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">Price</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 uppercase">Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                        {order?.items?.map((item: any, idx: number) => (
                            <tr key={idx}>
                                <td className="px-4 py-2 text-sm text-slate-900">{item.productName}</td>
                                <td className="px-4 py-2 text-sm text-slate-600 text-right">{item.quantity}</td>
                                <td className="px-4 py-2 text-sm text-slate-600 text-right">${item.unitPrice}</td>
                                <td className="px-4 py-2 text-sm text-slate-900 font-medium text-right">${(item.quantity * item.unitPrice).toFixed(2)}</td>
                            </tr>
                        ))}
                         <tr className="bg-slate-100">
                                <td colSpan={3} className="px-4 py-2 text-sm font-bold text-slate-900 text-right">Grand Total</td>
                                <td className="px-4 py-2 text-sm font-bold text-emerald-600 text-right">${order?.TOTAL_AMOUNT.toFixed(2)}</td>
                            </tr>
                    </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="px-8 pb-8 flex justify-end gap-3">
            <button
              onClick={onEdit}
              className="px-6 py-3 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-all font-semibold"
            >
              Edit Order
            </button>
            <button
              onClick={onDelete}
              className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all font-semibold flex items-center gap-2"
            >
              <Trash2 size={18} />
              Delete
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Delete Mode
  if (mode === 'delete') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto scrollbar-hide">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full my-8 max-h-[90vh] overflow-y-auto scrollbar-hide">
          {/* Header */}
          <div className="px-8 pt-8 pb-6 border-b-2 border-slate-200">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-2xl font-bold text-slate-900 mb-1">Delete Order</h3>
                <p className="text-slate-500 text-sm font-medium">{order?.ORDER_NUMBER}</p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-100 rounded-lg transition-all text-slate-400 hover:text-slate-600"
              >
                <X size={24} />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-8">
            <div className="p-5 bg-red-50 rounded-xl border-2 border-red-200 mb-4">
              <p className="text-slate-800 font-medium">
                Are you sure you want to delete this order?
              </p>
            </div>
            <p className="text-sm text-slate-600">
              This will permanently remove the order from all nodes in the distributed database. This action cannot be undone.
            </p>

            {/* Error message */}
            {error && (
              <div className="mt-4 p-4 bg-red-50 rounded-lg border border-red-200">
                <p className="text-red-600 text-sm font-medium">{error}</p>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="px-8 pb-8 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-5 py-3 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-all font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              className="flex-1 px-5 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all font-semibold flex items-center justify-center gap-2"
            >
              <Trash2 size={18} />
              Delete
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Create Mode
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto scrollbar-hide">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full my-8 max-h-[90vh] overflow-y-auto scrollbar-hide">
        {/* Header */}
        <div className="px-8 pt-8 pb-6 border-b-2 border-slate-200">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-2xl font-bold text-slate-900 mb-1">Create New Order</h3>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-all text-slate-400 hover:text-slate-600"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {/* Order Information */}
          <div>
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Order Information</h4>
            <div className="bg-slate-50 rounded-xl p-6 border-2 border-slate-200">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Delivery Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.deliveryDate}
                    onChange={(e) => setFormData({ ...formData, deliveryDate: e.target.value })}
                    className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-slate-700 bg-white cursor-pointer"
                    required
                  />
                </div>
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm text-blue-700 font-medium">
                    📋 Customer and rider information will be automatically assigned based on the delivery year.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Order Items */}
          <div>
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Order Items</h4>
            <div className="bg-slate-50 rounded-xl p-6 border-2 border-slate-200">
              <div className="flex items-center justify-end mb-4">
                <button
                  type="button"
                  onClick={addItem}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all text-sm font-semibold flex items-center gap-2"
                >
                  <Plus size={16} />
                  Add Item
                </button>
              </div>

            <div className="space-y-3">
              {formData.items.map((item: any, index: number) => (
                <div
                  key={index}
                  className="flex gap-3 items-start p-4 bg-white rounded-lg border-2 border-slate-200"
                >
                  <div className="flex-1 relative">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Product</label>
                    <select
                      // CRITICAL FIX: Use item.productNumber consistently. Fallback to finding it via name if editing legacy data.
                      value={item.productNumber || (item.productName ? products.find(p => p.PRODUCT_NAME === item.productName)?.PRODUCT_NUMBER : "")}
                      // CRITICAL FIX: Update 'productNumber' directly
                      onChange={(e) => updateItem(index, 'productNumber', parseInt(e.target.value) || 0)}
                      className="w-full appearance-none px-3 py-2 pr-10 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-medium bg-white cursor-pointer text-slate-700"
                    >
                      <option value="">Select a product</option>
                      {products.map((product) => (
                        <option key={product.PRODUCT_NUMBER} value={product.PRODUCT_NUMBER}>
                          {product.PRODUCT_NAME} - ${product.UNIT_PRICE?.toFixed(2) || '0.00'}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 pt-5">
                      <ChevronDown className="h-4 w-4 text-slate-500" />
                    </div>
                  </div>

                  <div className="w-24">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Quantity</label>
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-medium"
                    />
                  </div>

                  <div className="w-28">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Subtotal</label>
                    <div className="px-3 py-2 bg-slate-100 rounded-lg text-slate-900 font-bold text-sm">
                      {/* Lookup unit price using productNumber or fallback to item's stored unitPrice */}
                      ${((products.find((p) => p.PRODUCT_NUMBER == item.productNumber)?.UNIT_PRICE || item.unitPrice || 0) * item.quantity).toFixed(2)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    disabled={formData.items.length === 1}
                    className="mt-6 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>

              <div className="mt-4 p-5 bg-white rounded-xl border-2 border-slate-200 flex justify-between items-center">
                <span className="text-sm text-slate-600">Total Amount</span>
                <span className="text-2xl font-bold text-emerald-600">
                  ${calculateTotal().toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-all font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all font-semibold"
            >
              Create Order
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}