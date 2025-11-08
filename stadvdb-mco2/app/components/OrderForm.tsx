'use client'; 

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Mock data type for products
interface Product {
  PRODUCT_NUMBER: string;
  PRODUCT_NAME: string;
  UNIT_PRICE: number;
}

// Static mock data for the product dropdown
const MOCK_PRODUCTS: Product[] = [
  { PRODUCT_NUMBER: 'P-101', PRODUCT_NAME: 'TrailMaster Tent', UNIT_PRICE: 15000 },
  { PRODUCT_NUMBER: 'P-102', PRODUCT_NAME: 'TrekPro Backpack', UNIT_PRICE: 7500 },
  { PRODUCT_NUMBER: 'P-103', PRODUCT_NAME: 'AquaPure Filter', UNIT_PRICE: 3000 },
];

// Define the shape of the form data
interface OrderFormData {
  customerNumber: string;
  items: { productNumber: string; quantity: number }[];
}

// Define the component's props
interface OrderFormProps {
  initialData?: OrderFormData; 
  isEditMode: boolean;
}

export default function OrderForm({ initialData, isEditMode }: OrderFormProps) {
  const router = useRouter();
  const [formData, setFormData] = useState<OrderFormData>(
    initialData || {
      customerNumber: '',
      items: [{ productNumber: '', quantity: 1 }],
    }
  );
  
  // UI-ONLY
  const products = MOCK_PRODUCTS;

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // UI-ONLY
    const action = isEditMode ? 'updated' : 'created';
    alert(`UI-ONLY: Order ${action} successfully!\n` + JSON.stringify(formData, null, 2));
    router.push('/'); // Go back to the main list
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow-md space-y-6">

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
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
        >
          {isEditMode ? 'Save Changes' : 'Create Order'}
        </button>
      </div>
    </form>
  );
}