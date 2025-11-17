'use client';

import { useState, useEffect } from 'react';
import { Pencil, Trash2, Eye, Server, AlertTriangle, CheckCircle2, X, User, Package as PackageIcon, DollarSign, Plus, ChevronDown } from 'lucide-react';
import QuickActions from './QuickActions';

interface Order {
  ORDER_NUMBER: string;
  CUSTOMER_NUMBER: string;
  ORDER_DATE: string;
  DELIVERY_DATE: string;
  TOTAL_AMOUNT: number;
  NODE_ACCESSED?: string;
  FAILOVER_PATH?: string[];
}

type YearFilterType = 'all' | '2024' | '2025';
type ModalMode = 'view' | 'edit' | 'create' | 'delete' | null;

const MOCK_PRODUCTS = [
  { number: 'P-101', name: 'TrailMaster Tent', price: 250.0 },
  { number: 'P-102', name: 'TrekPro Backpack', price: 150.0 },
  { number: 'P-103', name: 'AquaPure Filter', price: 75.0 },
  { number: 'P-104', name: 'Summit Sleeping Bag', price: 180.0 },
  { number: 'P-105', name: 'Alpine Hiking Boots', price: 220.0 },
];

export default function OrderList({ orders }: { orders: Order[] }) {
  const [filter, setFilter] = useState<YearFilterType>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>(null);

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

  const filteredOrders = orders.filter((order) => {
    const year = parseInt(order.DELIVERY_DATE.slice(0, 4));
    if (filter === '2024') return year <= 2024;
    if (filter === '2025') return year >= 2025;
    return true;
  });

  const getNodeBadgeColor = (node?: string) => {
    if (!node) return 'bg-slate-100 text-slate-600 border-slate-200';
    if (node === 'Node 0') return 'bg-indigo-100 text-indigo-700 border-indigo-200';
    if (node === 'Node 1') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (node === 'Node 2') return 'bg-purple-100 text-purple-700 border-purple-200';
    return 'bg-slate-100 text-slate-600 border-slate-200';
  };

  const getFailoverStatus = (failoverPath?: string[]) => {
    if (!failoverPath || failoverPath.length === 0) return null;
    if (failoverPath.length === 1)
      return { text: 'Direct', color: 'text-emerald-600', icon: CheckCircle2 };
    return { text: 'Failover', color: 'text-amber-600', icon: AlertTriangle };
  };

  const openModal = (mode: ModalMode, order?: Order) => {
    setSelectedOrder(order || null);
    setModalMode(mode);
  };

  const closeModal = () => {
    setSelectedOrder(null);
    setModalMode(null);
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
                onChange={(e) => setFilter(e.target.value as YearFilterType)}
                className="appearance-none pl-4 pr-10 py-2.5 text-sm font-semibold border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-slate-700 cursor-pointer hover:bg-slate-50 transition-colors"
              >
                <option value="all">All Years</option>
                <option value="2025">2025</option>
                <option value="2024">2024</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                <svg className="h-5 w-5 text-slate-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b-2 border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Order #
                </th>
                <th className="px-6 py-3 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Order Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Delivery Date
                </th>
                <th className="px-6 py-3 text-right text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-center text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Node
                </th>
                <th className="px-6 py-3 text-center text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-center text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="bg-white divide-y divide-slate-200">
              {filteredOrders.map((order) => {
                const failoverStatus = getFailoverStatus(order.FAILOVER_PATH);
                const StatusIcon = failoverStatus?.icon;

                return (
                  <tr key={order.ORDER_NUMBER} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-semibold text-slate-900">{order.ORDER_NUMBER}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-slate-600 font-medium">
                      {order.CUSTOMER_NUMBER}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-slate-600">
                      {order.ORDER_DATE}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-slate-600">
                      {order.DELIVERY_DATE}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right font-bold text-slate-900">
                      ${order.TOTAL_AMOUNT.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${getNodeBadgeColor(
                          order.NODE_ACCESSED
                        )}`}
                      >
                        <Server size={12} />
                        {order.NODE_ACCESSED || 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {failoverStatus && StatusIcon && (
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-semibold ${failoverStatus.color}`}
                        >
                          <StatusIcon size={14} />
                          {failoverStatus.text}
                        </span>
                      )}
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
                          onClick={() => openModal('edit', order)}
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
                );
              })}
            </tbody>
          </table>

          {filteredOrders.length === 0 && (
            <div className="text-center py-16">
              <p className="text-slate-500 font-medium">No orders found for the selected filter.</p>
            </div>
          )}
        </div>
      </div>

      {modalMode && (
        <OrderModal
          mode={modalMode}
          order={selectedOrder}
          onClose={closeModal}
          onEdit={() => {
            if (selectedOrder) {
              setModalMode('edit');
            }
          }}
          onDelete={() => {
            if (selectedOrder) {
              setModalMode('delete');
            }
          }}
        />
      )}
    </>
  );
}

interface OrderModalProps {
  mode: 'view' | 'edit' | 'create' | 'delete';
  order: Order | null;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

function OrderModal({ mode, order, onClose, onEdit, onDelete }: OrderModalProps) {
  const [formData, setFormData] = useState({
    customerNumber: order?.CUSTOMER_NUMBER || '',
    orderDate: order?.ORDER_DATE || '',
    deliveryDate: order?.DELIVERY_DATE || '',
    items: [{ productNumber: 'P-101', quantity: 2 }],
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const action = mode === 'create' ? 'Creating' : 'Updating';
    alert(`[UI-ONLY] ${action} order:\n${JSON.stringify(formData, null, 2)}`);
    onClose();
  };

  const handleDelete = () => {
    alert(`[UI-ONLY] Deleting order ${order?.ORDER_NUMBER}`);
    onClose();
  };

  const calculateTotal = () => {
    return formData.items.reduce((total, item) => {
      const product = MOCK_PRODUCTS.find((p) => p.number === item.productNumber);
      return total + (product?.price || 0) * item.quantity;
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
      items: formData.items.filter((_, i) => i !== index),
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
                <p className="text-sm text-slate-600 mb-1">Customer Number</p>
                <p className="text-lg font-bold text-slate-900">{order?.CUSTOMER_NUMBER}</p>
              </div>
            </div>

            {/* Order Details */}
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Order Information</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-5 bg-slate-50 rounded-xl border-2 border-slate-200">
                  <p className="text-sm text-slate-600 mb-1">Order Date</p>
                  <p className="text-lg font-bold text-slate-900">{order?.ORDER_DATE}</p>
                </div>
                <div className="p-5 bg-slate-50 rounded-xl border-2 border-slate-200">
                  <p className="text-sm text-slate-600 mb-1">Delivery Date</p>
                  <p className="text-lg font-bold text-slate-900">{order?.DELIVERY_DATE}</p>
                </div>
              </div>
            </div>

            {/* Payment */}
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Payment</h4>
              <div className="p-5 bg-slate-50 rounded-xl border-2 border-slate-200">
                <p className="text-sm text-slate-600 mb-1">Total Amount</p>
                <p className="text-2xl font-bold text-emerald-600">
                  ${order?.TOTAL_AMOUNT.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            {/* Database Information */}
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Database Information</h4>
              <div className="p-5 bg-slate-50 rounded-xl border-2 border-slate-200 space-y-4">
                <div>
                  <p className="text-sm text-slate-600 mb-1">Node Accessed</p>
                  <p className="text-lg font-bold text-indigo-600">{order?.NODE_ACCESSED || 'N/A'}</p>
                </div>
                {order?.FAILOVER_PATH && order.FAILOVER_PATH.length > 0 && (
                  <div className="pt-4 border-t-2 border-slate-200">
                    <p className="text-sm text-slate-600 mb-1">Failover Path</p>
                    <p className="text-sm text-slate-700 font-medium">
                      {order.FAILOVER_PATH.join(' → ')}
                    </p>
                  </div>
                )}
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

  // Create/Edit Mode
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto scrollbar-hide">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full my-8 max-h-[90vh] overflow-y-auto scrollbar-hide">
        {/* Header */}
        <div className="px-8 pt-8 pb-6 border-b-2 border-slate-200">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-2xl font-bold text-slate-900 mb-1">
                {mode === 'create' ? 'Create New Order' : 'Edit Order'}
              </h3>
              {mode === 'edit' && (
                <p className="text-slate-500 text-sm font-medium">{order?.ORDER_NUMBER}</p>
              )}
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
          {/* Customer Information */}
          <div>
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Customer Information</h4>
            <div className="bg-slate-50 rounded-xl p-6 border-2 border-slate-200">

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Customer Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.customerNumber}
                    onChange={(e) => setFormData({ ...formData, customerNumber: e.target.value })}
                    className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium"
                    placeholder="e.g., CUST-001"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Order Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.orderDate}
                    onChange={(e) => setFormData({ ...formData, orderDate: e.target.value })}
                    className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-slate-700 bg-white cursor-pointer"
                    required
                  />
                </div>

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
              {formData.items.map((item, index) => (
                <div
                  key={index}
                  className="flex gap-3 items-start p-4 bg-white rounded-lg border-2 border-slate-200"
                >
                  <div className="flex-1 relative">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Product</label>
                    <select
                      value={item.productNumber}
                      onChange={(e) => updateItem(index, 'productNumber', e.target.value)}
                      className="w-full appearance-none px-3 py-2 pr-10 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-medium bg-white cursor-pointer text-slate-700"
                    >
                      <option value="">Select a product</option>
                      {MOCK_PRODUCTS.map((product) => (
                        <option key={product.number} value={product.number}>
                          {product.name} - ${product.price.toFixed(2)}
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
                      ${((MOCK_PRODUCTS.find((p) => p.number === item.productNumber)?.price || 0) * item.quantity).toFixed(2)}
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
              {mode === 'create' ? 'Create Order' : 'Update Order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
