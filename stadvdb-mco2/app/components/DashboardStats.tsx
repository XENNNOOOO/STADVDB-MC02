'use client';

import { Package, DollarSign, Database, TrendingUp } from 'lucide-react';

interface Order {
  ORDER_NUMBER: string;
  CUSTOMER_NUMBER: string;
  ORDER_DATE: string;
  DELIVERY_DATE: string;
  TOTAL_AMOUNT: number;
  NODE_ACCESSED?: string;
}

export default function DashboardStats({ orders }: { orders: Order[] }) {
  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((sum, order) => sum + order.TOTAL_AMOUNT, 0);

  const orders2024 = orders.filter(o => o.DELIVERY_DATE.startsWith('2024')).length;
  const orders2025 = orders.filter(o => o.DELIVERY_DATE.startsWith('2025')).length;

  const node0Count = orders.filter(o => o.NODE_ACCESSED === 'Node 0').length;
  const node1Count = orders.filter(o => o.NODE_ACCESSED === 'Node 1').length;
  const node2Count = orders.filter(o => o.NODE_ACCESSED === 'Node 2').length;

  const stats = [
    {
      title: 'Total Orders',
      value: totalOrders,
      icon: Package,
      textColor: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
      borderColor: 'border-indigo-200',
    },
    {
      title: 'Total Revenue',
      value: `$${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: DollarSign,
      textColor: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      borderColor: 'border-emerald-200',
    },
    {
      title: 'Node Distribution',
      value: `${node1Count}/${node2Count}/${node0Count}`,
      subtitle: 'N1 / N2 / N0',
      icon: Database,
      textColor: 'text-purple-600',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200',
    },
    {
      title: 'Year Distribution',
      value: `${orders2025} / ${orders2024}`,
      subtitle: '2025 / 2024',
      icon: TrendingUp,
      textColor: 'text-amber-600',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-200',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <div
            key={index}
            className={`bg-white rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 p-6 border-2 ${stat.borderColor} group`}
          >
            <div className="flex items-start justify-between mb-4">
              <div className={`p-3 rounded-xl ${stat.bgColor} group-hover:scale-110 transition-transform`}>
                <Icon className={`h-6 w-6 ${stat.textColor}`} />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-600 mb-2">{stat.title}</p>
              <p className={`text-3xl font-bold ${stat.textColor}`}>{stat.value}</p>
              {stat.subtitle && (
                <p className="text-xs text-slate-500 mt-2 font-medium">{stat.subtitle}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
