import OrderForm from '@/app/components/OrderForm';

export default function NewOrderPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Create New Order</h1>
      {/* We pass `isEditMode={false}` to the form,
        so it knows to show "Create Order" on its button.
      */}
      <OrderForm isEditMode={false} />
    </div>
  );
}