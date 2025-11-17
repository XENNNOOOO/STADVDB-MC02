import OrderForm from '@/app/components/OrderForm';
import { Edit } from 'lucide-react';

export default function EditOrderPage({ params }: { params: { id: string } }) {
  const mockOrder = {
    ORDER_NUMBER: params.id,
    CUSTOMER_NUMBER: 'CUST-L1',
    ORDER_DATE: '2025-10-01',
    DELIVERY_DATE: '2025-10-05',
    items: [
      { productNumber: 'P-101', quantity: 2, productName: 'TrailMaster Tent', price: 250.0 },
      { productNumber: 'P-102', quantity: 1, productName: 'TrekPro Backpack', price: 150.0 },
    ],
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-green-100 rounded-lg">
          <Edit className="h-6 w-6 text-green-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Edit Order {params.id}</h1>
          <p className="text-gray-600">Update order details in the distributed database</p>
        </div>
      </div>

      <OrderForm mode="edit" initialData={mockOrder} />
    </div>
  );
}
