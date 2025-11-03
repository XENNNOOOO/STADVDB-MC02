import Link from 'next/link';
import { Order } from '@/app/page';

const MOCK_ORDERS: Order[] = [
  { ORDER_NUMBER: 'L-1001', CUSTOMER_NUMBER: 'CUST-L1', ORDER_DATE: '2025-10-01', TOTAL_AMOUNT: 500.00 },
  { ORDER_NUMBER: 'L-1002', CUSTOMER_NUMBER: 'CUST-L2', ORDER_DATE: '2025-10-02', TOTAL_AMOUNT: 750.00 },
  { ORDER_NUMBER: 'V-2001', CUSTOMER_NUMBER: 'CUST-V1', ORDER_DATE: '2025-10-01', TOTAL_AMOUNT: 1200.00 },
  { ORDER_NUMBER: 'G-3001', CUSTOMER_NUMBER: 'CUST-G3', ORDER_DATE: '2025-10-03', TOTAL_AMOUNT: 3250.50 },
];

export default function DeleteOrderPage({ params }: { params: { id: string } }) {
  const order = MOCK_ORDERS.find(o => o.ORDER_NUMBER === params.id);

  if (!order) {
    return <div className="text-red-600">Order not found.</div>;
  }

  return (
    <div className="max-w-md mx-auto text-center">
      <h1 className="text-2xl font-bold mb-4">Delete Order</h1>

      <p className="mb-6">
        Are you sure you want to delete <strong>{order.ORDER_NUMBER}</strong>?
        This action cannot be undone.
      </p>

      {/* For now this just goes home. Later we add real delete */}
      <div className="flex justify-center gap-4">
        <Link href="/" className="bg-red-600 text-white px-4 py-2 rounded">
          Yes, Delete
        </Link>

        <Link href="/" className="bg-gray-300 px-4 py-2 rounded">
          Cancel
        </Link>
      </div>
    </div>
  );
}
