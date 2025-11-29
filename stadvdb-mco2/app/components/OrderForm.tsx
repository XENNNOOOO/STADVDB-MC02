'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, ChevronDown } from 'lucide-react';

interface Product {
  PRODUCT_NUMBER: string;
  PRODUCT_NAME: string;
  UNIT_PRICE: number;
}

interface OrderFormData {
  deliveryDate: string;
  items: Array<{
    productNumber: string | number;
    quantity: number;
    productName?: string;
    unitPrice?: number;
  }>;
}

interface OrderFormProps {
  initialData?: OrderFormData;
  products: Product[];
  onSubmit: (data: OrderFormData) => void;
  loading?: boolean;
  error?: string | null;
  submitLabel?: string;
  showCustomerInfo?: boolean;
  customerNumber?: string;
  orderDate?: string;
}

export default function OrderForm({
  initialData,
  products,
  onSubmit,
  loading = false,
  error = null,
  submitLabel = 'Save Order',
  showCustomerInfo = false,
  customerNumber,
  orderDate
}: OrderFormProps) {
  const [formData, setFormData] = useState<OrderFormData>({
    deliveryDate: initialData?.deliveryDate || '',
    items: initialData?.items || [{ productNumber: '', quantity: 1 }],
  });

  // Update form data when initialData changes
  useEffect(() => {
    if (initialData) {
      setFormData({
        deliveryDate: initialData.deliveryDate || '',
        items: initialData.items || [{ productNumber: '', quantity: 1 }],
      });
    }
  }, [initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form data
    if (!formData.deliveryDate) {
      return;
    }
    if (formData.items.length === 0) {
      return;
    }
    for (const item of formData.items) {
      if (!item.productNumber) {
        return;
      }
    }

    onSubmit(formData);
  };

  const calculateTotal = () => {
    return formData.items.reduce((total: number, item: any) => {
      let price = item.unitPrice;
      if (!price) {
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

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Order Information Card */}
      <div className="bg-white rounded-2xl shadow-sm border-2 border-slate-200 p-8">
        <h2 className="text-xl font-semibold text-slate-900 mb-6">Order Information</h2>

        {showCustomerInfo && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="p-4 bg-slate-50 rounded-lg">
              <label className="block text-sm font-medium text-slate-700 mb-1">Customer ID</label>
              <p className="text-lg font-semibold text-slate-900">{customerNumber}</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg">
              <label className="block text-sm font-medium text-slate-700 mb-1">Created Date</label>
              <p className="text-lg font-semibold text-slate-900">
                {orderDate && new Date(orderDate).toLocaleDateString('en-US', {
                  month: '2-digit',
                  day: '2-digit',
                  year: 'numeric'
                })}
              </p>
            </div>
          </div>
        )}

        <div>
          <label htmlFor="deliveryDate" className="block text-sm font-semibold text-slate-700 mb-2">
            Delivery Date <span className="text-red-500">*</span>
          </label>
          <input
            id="deliveryDate"
            type="date"
            value={formData.deliveryDate}
            onChange={(e) => setFormData({ ...formData, deliveryDate: e.target.value })}
            className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-slate-700 bg-white"
            required
          />
        </div>

        {!showCustomerInfo && (
          <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-700 font-medium">
              📋 Customer and rider information will be automatically assigned based on the delivery year.
            </p>
          </div>
        )}
      </div>

      {/* Order Items Card */}
      <div className="bg-white rounded-2xl shadow-sm border-2 border-slate-200 p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-slate-900">Order Items</h2>
          <button
            type="button"
            onClick={addItem}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all text-sm font-semibold flex items-center gap-2"
          >
            <Plus size={16} />
            Add Item
          </button>
        </div>

        <div className="space-y-4 mb-6">
          {formData.items.map((item: any, index: number) => (
            <div
              key={index}
              className="flex gap-4 items-start p-6 bg-slate-50 rounded-xl border-2 border-slate-200"
            >
              <div className="flex-1 relative">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Product</label>
                <select
                  value={item.productNumber || (item.productName ? products.find(p => p.PRODUCT_NAME === item.productName)?.PRODUCT_NUMBER : "")}
                  onChange={(e) => updateItem(index, 'productNumber', parseInt(e.target.value) || 0)}
                  className="w-full appearance-none px-4 py-3 pr-12 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-medium bg-white cursor-pointer text-slate-700"
                >
                  <option value="">Select a product</option>
                  {products.map((product) => (
                    <option key={product.PRODUCT_NUMBER} value={product.PRODUCT_NUMBER}>
                      {product.PRODUCT_NAME} - ${product.UNIT_PRICE?.toFixed(2) || '0.00'}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4 pt-8">
                  <ChevronDown className="h-5 w-5 text-slate-500" />
                </div>
              </div>

              <div className="w-32">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                  className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-medium"
                />
              </div>

              <div className="w-32">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Subtotal</label>
                <div className="px-4 py-3 bg-slate-100 rounded-lg text-slate-900 font-bold text-sm text-center">
                  ${((products.find((p) => p.PRODUCT_NUMBER == item.productNumber)?.UNIT_PRICE || item.unitPrice || 0) * item.quantity).toFixed(2)}
                </div>
              </div>

              <button
                type="button"
                onClick={() => removeItem(index)}
                disabled={formData.items.length === 1}
                className="mt-8 p-3 text-red-600 hover:bg-red-50 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                title="Remove item"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>

        {/* Total */}
        <div className="p-6 bg-slate-50 rounded-xl border-2 border-slate-200 flex justify-between items-center">
          <span className="text-lg font-semibold text-slate-700">Total Amount</span>
          <span className="text-3xl font-bold text-emerald-600">
            ${calculateTotal().toFixed(2)}
          </span>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-50 rounded-lg border border-red-200">
          <p className="text-red-600 font-medium">{error}</p>
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={loading}
        className="w-full px-6 py-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed transition-all font-semibold"
      >
        {loading ? 'Saving...' : submitLabel}
      </button>
    </form>
  );
}