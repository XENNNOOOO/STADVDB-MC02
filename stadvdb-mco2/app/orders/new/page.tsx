import OrderForm from '@/app/components/OrderForm';
import { PackagePlus } from 'lucide-react';

export default function NewOrderPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-blue-100 rounded-lg">
          <PackagePlus className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Create New Order</h1>
          <p className="text-gray-600">Add a new order to the distributed database system</p>
        </div>
      </div>

      <OrderForm mode="create" />
    </div>
  );
}
