'use client';

import Link from 'next/link';
import { Package } from 'lucide-react'; 
import { usePathname } from 'next/navigation';

export default function Navbar() {
  const pathname = usePathname();
  
  // Only show the "New Order" button if we are on the main page
  const showNewOrderButton = pathname === '/';

  return (
    <nav className="w-full bg-white shadow-md">
      <div className="container mx-auto max-w-7xl px-8">
        <div className="flex justify-between items-center h-16">
          <Link href="/" className="flex items-center gap-2">
            <Package className="h-6 w-6 text-blue-600" />
            <span className="text-xl font-bold text-gray-800">GO-Sales</span>
          </Link>
          {showNewOrderButton && (
            <Link href="/orders/new" className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700">
              + New Order
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}