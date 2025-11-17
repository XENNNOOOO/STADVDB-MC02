'use client';

import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';

export default function DeleteOrderPage({ params }: { params: { id: string } }) {
  const router = useRouter();

  const handleDelete = () => {
    alert(`[UI-ONLY] Deleting order ${params.id}`);
    router.push('/');
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-xl shadow-md border border-red-200 p-8">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-4 bg-red-100 rounded-full">
            <AlertTriangle className="h-8 w-8 text-red-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Delete Order</h1>
            <p className="text-gray-600">This action cannot be undone</p>
          </div>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-gray-800">
            Are you sure you want to delete order <span className="font-bold">{params.id}</span>?
          </p>
          <p className="text-sm text-gray-600 mt-2">
            This will permanently remove the order from all nodes in the distributed database.
          </p>
        </div>

        <div className="flex gap-4">
          <button
            onClick={() => router.push('/')}
            className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-semibold"
          >
            Delete Order
          </button>
        </div>
      </div>
    </div>
  );
}
