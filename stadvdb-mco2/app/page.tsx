import OrderList from '@/app/components/OrderList';

export interface Order {
  ORDER_NUMBER: string;
  CUSTOMER_NUMBER: string;
  ORDER_DATE: string;
  DELIVERY_DATE: string;
  TOTAL_AMOUNT: number;
  NODE_ACCESSED?: string;
  FAILOVER_PATH?: string[];
}

const MOCK_ORDERS: Order[] = [
  {
    ORDER_NUMBER: 'L-1001',
    CUSTOMER_NUMBER: 'CUST-L1',
    ORDER_DATE: '2025-10-01',
    DELIVERY_DATE: '2025-10-05',
    TOTAL_AMOUNT: 500.0,
    NODE_ACCESSED: 'Node 1',
    FAILOVER_PATH: ['Node 1'],
  },
  {
    ORDER_NUMBER: 'L-1002',
    CUSTOMER_NUMBER: 'CUST-L2',
    ORDER_DATE: '2025-10-02',
    DELIVERY_DATE: '2025-10-06',
    TOTAL_AMOUNT: 750.0,
    NODE_ACCESSED: 'Node 1',
    FAILOVER_PATH: ['Node 1'],
  },
  {
    ORDER_NUMBER: 'V-2001',
    CUSTOMER_NUMBER: 'CUST-V1',
    ORDER_DATE: '2024-09-15',
    DELIVERY_DATE: '2024-09-20',
    TOTAL_AMOUNT: 1200.0,
    NODE_ACCESSED: 'Node 2',
    FAILOVER_PATH: ['Node 2'],
  },
  {
    ORDER_NUMBER: 'G-3001',
    CUSTOMER_NUMBER: 'CUST-G3',
    ORDER_DATE: '2024-08-10',
    DELIVERY_DATE: '2024-08-15',
    TOTAL_AMOUNT: 3250.5,
    NODE_ACCESSED: 'Node 0',
    FAILOVER_PATH: ['Node 2', 'Node 0'],
  },
  {
    ORDER_NUMBER: 'M-4001',
    CUSTOMER_NUMBER: 'CUST-M4',
    ORDER_DATE: '2025-11-01',
    DELIVERY_DATE: '2025-11-08',
    TOTAL_AMOUNT: 890.25,
    NODE_ACCESSED: 'Node 1',
    FAILOVER_PATH: ['Node 1'],
  },
  {
    ORDER_NUMBER: 'N-5001',
    CUSTOMER_NUMBER: 'CUST-N5',
    ORDER_DATE: '2024-07-22',
    DELIVERY_DATE: '2024-07-28',
    TOTAL_AMOUNT: 1575.8,
    NODE_ACCESSED: 'Node 2',
    FAILOVER_PATH: ['Node 2'],
  },
];

export default function Home() {
  return (
    <div>
      <OrderList orders={MOCK_ORDERS} />
    </div>
  );
}
