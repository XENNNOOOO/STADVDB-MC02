import OrderList from '@/app/components/OrderList';

// mock data type for  orders
export interface Order {
  ORDER_NUMBER: string;
  CUSTOMER_NUMBER: string;
  ORDER_DATE: string;
  TOTAL_AMOUNT: number;
}

// UI-ONLY
const MOCK_ORDERS: Order[] = [
  { ORDER_NUMBER: 'L-1001', CUSTOMER_NUMBER: 'CUST-L1', ORDER_DATE: '2025-10-01', TOTAL_AMOUNT: 500.00 },
  { ORDER_NUMBER: 'L-1002', CUSTOMER_NUMBER: 'CUST-L2', ORDER_DATE: '2025-10-02', TOTAL_AMOUNT: 750.00 },
  { ORDER_NUMBER: 'V-2001', CUSTOMER_NUMBER: 'CUST-V1', ORDER_DATE: '2025-10-01', TOTAL_AMOUNT: 1200.00 },
  { ORDER_NUMBER: 'G-3001', CUSTOMER_NUMBER: 'CUST-G3', ORDER_DATE: '2025-10-03', TOTAL_AMOUNT: 3250.50 },
];

export default function Home() {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Order Management</h1>
      <OrderList orders={MOCK_ORDERS} />
    </div>
  );
}