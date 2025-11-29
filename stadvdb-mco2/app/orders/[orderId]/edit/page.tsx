'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import OrderForm from '@/app/components/OrderForm';

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
  };
  error?: string;
}

export default function EditOrderPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.orderId as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch order data and products on component mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // Fetch order details and products in parallel
        const [orderResponse, productsResponse] = await Promise.all([
          fetch(`/api/orders/${orderId}`),
          fetch('/api/products')
        ]);

        if (!orderResponse.ok) {
          throw new Error('Failed to fetch order details');
        }

        if (!productsResponse.ok) {
          throw new Error('Failed to fetch products');
        }

        const orderResult: APIResponse<Order> = await orderResponse.json();
        const productsResult: APIResponse<Product[]> = await productsResponse.json();

        if (!orderResult.success || !orderResult.data) {
          throw new Error(orderResult.error || 'Failed to fetch order');
        }

        if (!productsResult.success || !productsResult.data) {
          throw new Error(productsResult.error || 'Failed to fetch products');
        }

        setOrder(orderResult.data);
        setProducts(productsResult.data);

      } catch (err: any) {
        console.error('Error fetching data:', err);
        setError(err.message || 'Failed to load order data');
      } finally {
        setLoading(false);
      }
    };

    if (orderId) {
      fetchData();
    }
  }, [orderId]);

  const handleSubmit = async (formData: any) => {
    setSaving(true);
    setError(null);

    try {
      const orderData = {
        deliveryDate: formData.deliveryDate,
        items: formData.items.map((item: any) => ({
          productNumber: item.productNumber,
          quantity: item.quantity
        }))
      };

      const response = await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update order');
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to update order');
      }

      // Success - redirect back to orders list
      router.push('/');

    } catch (err: any) {
      console.error('Error updating order:', err);
      setError(err.message || 'Failed to update order');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500 font-medium">Loading order details...</p>
      </div>
    );
  }

  if (error && !order) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 font-medium mb-4">{error}</p>
          <Link href="/" className="text-indigo-600 hover:text-indigo-800 font-medium">
            ← Back to Orders
          </Link>
        </div>
      </div>
    );
  }

  // Prepare initial form data
  const initialFormData = order ? {
    deliveryDate: order.DELIVERY_DATE ? new Date(order.DELIVERY_DATE).toISOString().split('T')[0] : '',
    items: order.items || [{ productNumber: '', quantity: 1 }],
  } : undefined;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-medium transition-colors"
          >
            <ArrowLeft size={20} />
            Back to Orders
          </Link>
        </div>
        <h1 className="text-3xl font-bold text-slate-900">Edit Order</h1>
        <p className="text-slate-500 mt-1">Order #{orderId}</p>
      </div>

      {/* Order Form */}
      <div className="space-y-4">
        <OrderForm
          initialData={initialFormData}
          products={products}
          onSubmit={handleSubmit}
          loading={saving}
          error={error}
          submitLabel="Update Order"
          showCustomerInfo={true}
          customerNumber={order?.CUSTOMER_NUMBER}
          orderDate={order?.ORDER_DATE}
        />

        {/* Cancel Button */}
        <Link
          href="/"
          className="block w-full px-6 py-4 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-all font-semibold text-center"
        >
          Cancel
        </Link>
      </div>
    </div>
  );
}