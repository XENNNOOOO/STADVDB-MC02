import OrderList from '@/app/components/OrderList';

// Use the Order interface from lib/types
export interface Order {
  ORDER_NUMBER: string;
  CUSTOMER_NUMBER: string;
  ORDER_DATE: string;
  DELIVERY_DATE: string;
  TOTAL_AMOUNT: number;
}

export default function Home() {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Order Management</h1>
      <OrderList />
    </div>
  );
}