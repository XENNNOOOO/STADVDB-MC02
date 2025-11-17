import { Order } from '@/app/page';
import Link from 'next/link';

const MOCK_ORDERS: Order[] = [
  { ORDER_NUMBER: 'L-1001', CUSTOMER_NUMBER: 'CUST-L1', ORDER_DATE: '2025-10-01', DELIVERY_DATE: '2025-10-01', TOTAL_AMOUNT: 500.00 },
  { ORDER_NUMBER: 'L-1002', CUSTOMER_NUMBER: 'CUST-L2', ORDER_DATE: '2025-10-02', DELIVERY_DATE: '2025-10-02', TOTAL_AMOUNT: 750.00 },
  { ORDER_NUMBER: 'V-2001', CUSTOMER_NUMBER: 'CUST-V1', ORDER_DATE: '2025-10-01', DELIVERY_DATE: '2025-10-01', TOTAL_AMOUNT: 1200.00 },
  { ORDER_NUMBER: 'G-3001', CUSTOMER_NUMBER: 'CUST-G3', ORDER_DATE: '2025-10-03', DELIVERY_DATE: '2025-10-03', TOTAL_AMOUNT: 3250.50 },
];

export default function EditOrderPage({ params }: { params: { id: string } }) {
  const order = MOCK_ORDERS.find(o => o.ORDER_NUMBER === params.id);

  if (!order) {
    return <div className="text-red-600">Order not found.</div>;
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-4">Edit Order {order.ORDER_NUMBER}</h1>

      <form className="space-y-4">
        <div>
          <label className="block text-sm font-semibold">Customer Number</label>
          <input
            defaultValue={order.CUSTOMER_NUMBER}
            className="border rounded px-2 py-1 w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold">Order Date</label>
          <input
            type="date"
            defaultValue={order.ORDER_DATE}
            className="border rounded px-2 py-1 w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold">Total Amount</label>
          <input
            type="number"
            step="0.01"
            defaultValue={order.TOTAL_AMOUNT}
            className="border rounded px-2 py-1 w-full"
          />
        </div>

        {/* This will become a real submit later */}
        <button className="bg-blue-600 text-white px-4 py-2 rounded">
          Save Changes
        </button>

        <Link href="/" className="block mt-3 text-gray-600 hover:underline">
          Cancel
        </Link>
      </form>
    </div>
  );
}
