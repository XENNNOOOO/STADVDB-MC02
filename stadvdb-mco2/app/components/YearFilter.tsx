'use client';

import { useState } from 'react';
import { Calendar, Database, Filter } from 'lucide-react';

type YearFilterType = 'all' | '2024' | '2025';

interface YearFilterProps {
  selected?: YearFilterType;
  onChange?: (filter: YearFilterType) => void;
}

export default function YearFilter({ selected = 'all', onChange }: YearFilterProps) {
  const [activeFilter, setActiveFilter] = useState<YearFilterType>(selected);

  const handleFilterChange = (filter: YearFilterType) => {
    setActiveFilter(filter);
    onChange?.(filter);
  };

  const filters = [
    {
      id: 'all' as YearFilterType,
      label: 'All Orders',
      sublabel: 'View all nodes',
      icon: Database,
      activeColor: 'bg-slate-600 border-slate-600 text-white',
      inactiveColor: 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100',
      iconBg: 'bg-slate-100',
      iconColor: 'text-slate-600',
    },
    {
      id: '2025' as YearFilterType,
      label: '2025',
      sublabel: 'Node 1 Primary',
      icon: Calendar,
      activeColor: 'bg-indigo-600 border-indigo-600 text-white',
      inactiveColor: 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100',
      iconBg: 'bg-indigo-100',
      iconColor: 'text-indigo-600',
    },
    {
      id: '2024' as YearFilterType,
      label: '2024',
      sublabel: 'Node 2 Primary',
      icon: Calendar,
      activeColor: 'bg-emerald-600 border-emerald-600 text-white',
      inactiveColor: 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100',
      iconBg: 'bg-emerald-100',
      iconColor: 'text-emerald-600',
    },
  ];

  return (
    <div className="bg-white rounded-2xl shadow-sm border-2 border-slate-200 p-6">
      <div className="flex items-center gap-2 mb-5">
        <Filter className="h-5 w-5 text-slate-600" />
        <h2 className="text-lg font-semibold text-slate-800">Filter by Year</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {filters.map((filter) => {
          const Icon = filter.icon;
          const isActive = activeFilter === filter.id;

          return (
            <button
              key={filter.id}
              onClick={() => handleFilterChange(filter.id)}
              className={`
                relative p-5 rounded-xl border-2 transition-all duration-200 text-left
                ${isActive ? filter.activeColor : filter.inactiveColor}
              `}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${isActive ? 'bg-white/20' : filter.iconBg}`}>
                  <Icon className={`h-5 w-5 ${isActive ? 'text-white' : filter.iconColor}`} />
                </div>
                <div>
                  <p className={`font-bold text-lg ${isActive ? 'text-white' : ''}`}>
                    {filter.label}
                  </p>
                  <p className={`text-xs mt-0.5 ${isActive ? 'text-white/80' : 'text-slate-500'}`}>
                    {filter.sublabel}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-5 p-4 bg-slate-50 rounded-xl border border-slate-200">
        <p className="text-sm text-slate-700">
          <span className="font-semibold">Active Filter:</span>{' '}
          {activeFilter === 'all'
            ? 'Viewing all orders from all nodes'
            : activeFilter === '2025'
            ? 'Showing 2025 orders (Node 1 Primary → Node 0 → Node 2 Failover)'
            : 'Showing 2024 orders (Node 2 Primary → Node 0 → Node 1 Failover)'}
        </p>
      </div>
    </div>
  );
}
