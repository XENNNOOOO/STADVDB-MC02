'use client';

import Link from 'next/link';
import { Package, Database, RefreshCw } from 'lucide-react';
import { usePathname } from 'next/navigation';

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="w-full bg-white shadow-sm border-b border-slate-200">
      <div className="container mx-auto max-w-7xl px-8">
        <div className="flex justify-between items-center h-16">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="p-2 bg-indigo-100 rounded-xl group-hover:bg-indigo-200 transition-all">
              <Database className="h-6 w-6 text-indigo-600" />
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-bold text-slate-800 tracking-tight">GO-Sales</span>
              <span className="text-xs text-slate-500 font-medium">Distributed Order Management</span>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            {pathname === '/recovery' ? (
              <Link
                href="/"
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 transition-all flex items-center gap-2"
              >
                <Package size={18} />
                View Orders
              </Link>
            ) : (
              <Link
                href="/recovery"
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 transition-all flex items-center gap-2"
              >
                <RefreshCw size={18} />
                Recovery
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
