'use client';

import { Plus } from 'lucide-react';

interface QuickActionsProps {
  onNewOrder: () => void;
}

export default function QuickActions({ onNewOrder }: QuickActionsProps) {
  return (
    <div className="fixed bottom-8 right-8 z-40">
      <button
        onClick={onNewOrder}
        className="group relative p-4 bg-indigo-600 text-white rounded-full shadow-lg hover:shadow-xl hover:bg-indigo-700 transition-all duration-300 hover:scale-110"
        title="Create New Order"
      >
        <Plus size={28} strokeWidth={2.5} />
        <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 px-3 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          New Order
        </span>
      </button>
    </div>
  );
}
