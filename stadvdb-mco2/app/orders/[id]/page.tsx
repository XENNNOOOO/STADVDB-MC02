// File path: app/orders/[id]/page.tsx
'use client'; // This page uses a hook (useParams)

import OrderForm from '@/app/components/OrderForm';
import { useParams } from 'next/navigation';

// UI-ONLY: This is a fake "edit" form.
// It pre-fills the form with static data.
const MOCK_EDIT_DATA = {
  customerNumber: 'CUST-L1',
  salesStaffCode: 'S-01',
  items: [
    { productNumber: 'P-101', quantity: 2 },
    { productNumber: 'P-103', quantity: 1 },
  ],
};

export default function EditOrderPage() {
  // Get the order ID from the URL, e.g., "/orders/L-1001"
  const params = useParams();
  const orderId = params.id as string;

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Edit Order: {orderId}</h1>
      {/* We pass `isEditMode={true}` and the mock data.
        The form will be pre-filled and show "Save Changes".
      */}
      <OrderForm 
        isEditMode={true} 
        initialData={MOCK_EDIT_DATA} 
      />
    </div>
  );
}