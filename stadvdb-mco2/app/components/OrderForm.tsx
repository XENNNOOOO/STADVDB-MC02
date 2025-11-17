'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Package, User, Calendar, DollarSign } from 'lucide-react';

interface OrderFormProps {
  initialData?: {
    ORDER_NUMBER?: string;
    CUSTOMER_NUMBER: string;
    ORDER_DATE: string;
    DELIVERY_DATE: string;
    items: { productNumber: string; quantity: number; productName?: string; price?: number }[];
  };
  mode: 'create' | 'edit';
}

const MOCK_PRODUCTS = [
  { number: 'P-101', name: 'TrailMaster Tent', price: 250.0 },
  { number: 'P-102', name: 'TrekPro Backpack', price: 150.0 },
  { number: 'P-103', name: 'AquaPure Filter', price: 75.0 },
  { number: 'P-104', name: 'Summit Sleeping Bag', price: 180.0 },
  { number: 'P-105', name: 'Alpine Hiking Boots', price: 220.0 },
];

export default function OrderForm({ initialData, mode }: OrderFormProps) {
  const router = useRouter();
  const [customerNumber, setCustomerNumber] = useState(initialData?.CUSTOMER_NUMBER || '');
  const [orderDate, setOrderDate] = useState(initialData?.ORDER_DATE || '');
  const [deliveryDate, setDeliveryDate] = useState(initialData?.DELIVERY_DATE || '');
  const [items, setItems] = useState<
    { productNumber: string; quantity: number; productName?: string; price?: number }[]
  >(initialData?.items || [{ productNumber: '', quantity: 1 }]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!customerNumber.trim()) {
      newErrors.customerNumber = 'Customer number is required';
    }

    if (!orderDate) {
      newErrors.orderDate = 'Order date is required';
    }

    if (!deliveryDate) {
      newErrors.deliveryDate = 'Delivery date is required';
    }

    if (orderDate && deliveryDate && new Date(deliveryDate) < new Date(orderDate)) {
      newErrors.deliveryDate = 'Delivery date must be after order date';
    }

    if (items.length === 0 || items.every((item) => !item.productNumber)) {
      newErrors.items = 'At least one product is required';
    }

    items.forEach((item, index) => {
      if (item.productNumber && item.quantity <= 0) {
        newErrors[`quantity-${index}`] = 'Quantity must be greater than 0';
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const addItem = () => {
    setItems([...items, { productNumber: '', quantity: 1 }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: 'productNumber' | 'quantity', value: string | number) => {
    const newItems = [...items];
    if (field === 'productNumber') {
      const product = MOCK_PRODUCTS.find((p) => p.number === value);
      newItems[index] = {
        ...newItems[index],
        productNumber: value as string,
        productName: product?.name,
        price: product?.price,
      };
    } else {
      newItems[index] = { ...newItems[index], [field]: value };
    }
    setItems(newItems);
  };

  const calculateTotal = () => {
    return items.reduce((total, item) => {
      const product = MOCK_PRODUCTS.find((p) => p.number === item.productNumber);
      return total + (product?.price || 0) * item.quantity;
    }, 0);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const orderData = {
      customerNumber,
      orderDate,
      deliveryDate,
      items: items.filter((item) => item.productNumber),
      totalAmount: calculateTotal(),
    };

    alert(`[UI-ONLY] ${mode === 'create' ? 'Creating' : 'Updating'} order:\n${JSON.stringify(orderData, null, 2)}`);
    router.push('/');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-6">
          <User className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-800">Customer Information</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Customer Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={customerNumber}
              onChange={(e) => setCustomerNumber(e.target.value)}
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.customerNumber ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="e.g., CUST-001"
            />
            {errors.customerNumber && (
              <p className="mt-1 text-sm text-red-600">{errors.customerNumber}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Order Date <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.orderDate ? 'border-red-500' : 'border-gray-300'
                }`}
              />
            </div>
            {errors.orderDate && <p className="mt-1 text-sm text-red-600">{errors.orderDate}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Delivery Date <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.deliveryDate ? 'border-red-500' : 'border-gray-300'
                }`}
              />
            </div>
            {errors.deliveryDate && (
              <p className="mt-1 text-sm text-red-600">{errors.deliveryDate}</p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-800">Order Items</h2>
          </div>
          <button
            type="button"
            onClick={addItem}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2 text-sm"
          >
            <Plus size={16} />
            Add Item
          </button>
        </div>

        {errors.items && <p className="mb-4 text-sm text-red-600">{errors.items}</p>}

        <div className="space-y-4">
          {items.map((item, index) => (
            <div
              key={index}
              className="flex gap-4 items-start p-4 bg-gray-50 rounded-lg border border-gray-200"
            >
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">Product</label>
                <select
                  value={item.productNumber}
                  onChange={(e) => updateItem(index, 'productNumber', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select a product</option>
                  {MOCK_PRODUCTS.map((product) => (
                    <option key={product.number} value={product.number}>
                      {product.name} - ${product.price.toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="w-32">
                <label className="block text-sm font-medium text-gray-700 mb-2">Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    errors[`quantity-${index}`] ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {errors[`quantity-${index}`] && (
                  <p className="mt-1 text-sm text-red-600">{errors[`quantity-${index}`]}</p>
                )}
              </div>

              <div className="w-32">
                <label className="block text-sm font-medium text-gray-700 mb-2">Subtotal</label>
                <div className="px-4 py-2 bg-gray-100 rounded-lg text-gray-900 font-semibold">
                  ${((item.price || 0) * item.quantity).toFixed(2)}
                </div>
              </div>

              <button
                type="button"
                onClick={() => removeItem(index)}
                disabled={items.length === 1}
                className="mt-8 p-2 text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-blue-600" />
            <span className="text-lg font-semibold text-gray-800">Total Amount:</span>
          </div>
          <span className="text-2xl font-bold text-blue-600">
            ${calculateTotal().toFixed(2)}
          </span>
        </div>
      </div>

      <div className="flex gap-4">
        <button
          type="button"
          onClick={() => router.push('/')}
          className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-semibold"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold"
        >
          {mode === 'create' ? 'Create Order' : 'Update Order'}
        </button>
      </div>
    </form>
  );
}
