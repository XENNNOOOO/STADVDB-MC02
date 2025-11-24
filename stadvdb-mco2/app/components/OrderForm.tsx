'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// API Response type
interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  failover_info?: {
    used_node: string;
    attempts: string[];
  };
}

// Product interface
interface Product {
  PRODUCT_NUMBER: string;
  PRODUCT_NAME: string;
  UNIT_PRICE: number;
}

// Define the shape of the form data
interface OrderFormData {
  orderNumber?: string;
  customerNumber: string;
  deliveryDate: string;
  items: { productNumber: string; quantity: number }[];
}

// Define the component's props
interface OrderFormProps {
  initialData?: OrderFormData;
  isEditMode: boolean;
  orderNumber?: string; // For edit mode
}

export default function OrderForm({ initialData, isEditMode, orderNumber }: OrderFormProps) {
  const router = useRouter();
  const [formData, setFormData] = useState<OrderFormData>(
    initialData || {
      customerNumber: '',
      deliveryDate: '',
      items: [{ productNumber: '', quantity: 1 }],
    }
  );

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch products on component mount
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/products?year=2025'); // Use 2025 as default context
        const result: APIResponse<Product[]> = await response.json();

        if (result.success && result.data) {
          setProducts(result.data);
        } else {
          throw new Error(result.error || 'Failed to fetch products');
        }
      } catch (err: any) {
        console.error('Error fetching products:', err);
        setError('Failed to load products. Using fallback data.');
        // Use fallback products if API fails
        setProducts([
          { PRODUCT_NUMBER: 'P-101', PRODUCT_NAME: 'TrailMaster Tent', UNIT_PRICE: 15000 },
          { PRODUCT_NUMBER: 'P-102', PRODUCT_NAME: 'TrekPro Backpack', UNIT_PRICE: 7500 },
          { PRODUCT_NUMBER: 'P-103', PRODUCT_NAME: 'AquaPure Filter', UNIT_PRICE: 3000 },
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  const handleItemChange = (index: number, field: string, value: string) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setFormData({ ...formData, items: newItems });
  };

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { productNumber: '', quantity: 1 }],
    });
  };

  const removeItem = (index: number) => {
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newItems });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      // Validate form data
      if (!formData.customerNumber.trim()) {
        throw new Error('Customer number is required');
      }
      if (!formData.deliveryDate) {
        throw new Error('Delivery date is required');
      }
      if (formData.items.length === 0) {
        throw new Error('At least one item is required');
      }

      // Validate each item
      for (let i = 0; i < formData.items.length; i++) {
        const item = formData.items[i];
        if (!item.productNumber) {
          throw new Error(`Item ${i + 1}: Product is required`);
        }
        if (!item.quantity || item.quantity < 1) {
          throw new Error(`Item ${i + 1}: Quantity must be at least 1`);
        }
      }

      let response: Response;

      if (isEditMode && orderNumber) {
        // Update existing order
        response = await fetch(`/api/orders/${orderNumber}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(formData),
        });
      } else {
        // Create new order
        response = await fetch('/api/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(formData),
        });
      }

      const result: APIResponse = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || `Failed to ${isEditMode ? 'update' : 'create'} order`);
      }

      // Show success message with failover info if available
      let successMessage = `Order ${isEditMode ? 'updated' : 'created'} successfully!`;
      if (result.failover_info) {
        successMessage += `\n\nNode used: ${result.failover_info.used_node}`;
        if (result.message) {
          successMessage += `\nInfo: ${result.message}`;
        }
      }

      alert(successMessage);
      router.push('/'); // Go back to the main list

    } catch (err: any) {
      console.error('Error submitting order:', err);
      setError(err.message || `Failed to ${isEditMode ? 'update' : 'create'} order`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow-md space-y-6">

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded">
          <div className="text-red-700 font-semibold">Error</div>
          <div className="text-red-600 text-sm mt-1">{error}</div>
        </div>
      )}

      {/* Loading Indicator */}
      {loading && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded">
          <div className="text-blue-700">Loading products...</div>
        </div>
      )}

      {/* Main Order Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="customerNumber" className="block text-sm font-medium text-gray-700">
            Customer Number
          </label>
          <input
            type="text"
            id="customerNumber"
            value={formData.customerNumber}
            onChange={(e) => setFormData({ ...formData, customerNumber: e.target.value })}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
            required
            disabled={submitting}
          />
        </div>

        <div>
          <label htmlFor="deliveryDate" className="block text-sm font-medium text-gray-700">
            Delivery Date
          </label>
          <input
            type="date"
            id="deliveryDate"
            value={formData.deliveryDate}
            onChange={(e) => setFormData({ ...formData, deliveryDate: e.target.value })}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
            required
            disabled={submitting}
          />
        </div>
      </div>

      {/* Order Items */}
      <hr />
      <h3 className="text-lg font-medium text-gray-900">Order Items</h3>
      <div className="space-y-4">
        {formData.items.map((item, index) => (
          <div key={index} className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700">
                Product
              </label>
              <select
                value={item.productNumber}
                onChange={(e) => handleItemChange(index, 'productNumber', e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
              >
                <option value="">Select a product...</option>
                {products.map((p) => (
                  <option key={p.PRODUCT_NUMBER} value={p.PRODUCT_NUMBER}>
                    {p.PRODUCT_NAME} (P {p.UNIT_PRICE})
                  </option>
                ))}
              </select>
            </div>
            <div className="w-24">
              <label className="block text-sm font-medium text-gray-700">
                Qty
              </label>
              <input
                type="number"
                min="1"
                value={item.quantity}
                onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => removeItem(index)}
              className="px-3 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addItem}
        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
      >
        + Add Item
      </button>

      {/* Submit Button */}
      <hr />
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => router.push('/')}
          className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 mr-4"
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className={`px-6 py-2 rounded-lg font-semibold ${
            submitting
              ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
          disabled={submitting}
        >
          {submitting
            ? 'Processing...'
            : isEditMode
            ? 'Save Changes'
            : 'Create Order'
          }
        </button>
      </div>
    </form>
  );
}