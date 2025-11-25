'use client';

import { Server, CheckCircle2, AlertTriangle, XCircle, ArrowRight } from 'lucide-react';

interface NodeStatusIndicatorProps {
  nodeAccessed?: string;
  failoverPath?: string[];
  showDetails?: boolean;
}

export default function NodeStatusIndicator({
  nodeAccessed,
  failoverPath = [],
  showDetails = false,
}: NodeStatusIndicatorProps) {
  const getNodeColor = (node: string) => {
    if (node === 'Node 0') return 'bg-blue-500';
    if (node === 'Node 1') return 'bg-green-500';
    if (node === 'Node 2') return 'bg-purple-500';
    return 'bg-gray-500';
  };

  const getNodeBadgeColor = (node: string) => {
    if (node === 'Node 0') return 'bg-blue-100 text-blue-700 border-blue-300';
    if (node === 'Node 1') return 'bg-green-100 text-green-700 border-green-300';
    if (node === 'Node 2') return 'bg-purple-100 text-purple-700 border-purple-300';
    return 'bg-gray-100 text-gray-700 border-gray-300';
  };

  const isFailover = failoverPath.length > 1;
  const StatusIcon = isFailover ? AlertTriangle : CheckCircle2;
  const statusColor = isFailover ? 'text-orange-600' : 'text-green-600';

  if (!showDetails) {
    return (
      <div className="inline-flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${getNodeBadgeColor(
            nodeAccessed || ''
          )}`}
        >
          <Server size={12} />
          {nodeAccessed || 'N/A'}
        </span>
        <StatusIcon size={14} className={statusColor} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <StatusIcon size={16} className={statusColor} />
        <span className={`text-sm font-medium ${statusColor}`}>
          {isFailover ? 'Failover Used' : 'Direct Access'}
        </span>
      </div>

      <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
        <p className="text-xs text-gray-600 mb-2 font-semibold">Failover Path:</p>
        <div className="flex items-center gap-2 flex-wrap">
          {failoverPath.map((node, index) => (
            <div key={index} className="flex items-center gap-2">
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${getNodeBadgeColor(
                  node
                )} font-medium text-sm`}
              >
                <div className={`w-2 h-2 rounded-full ${getNodeColor(node)}`} />
                {node}
              </div>
              {index < failoverPath.length - 1 && (
                <ArrowRight size={16} className="text-gray-400" />
              )}
            </div>
          ))}
        </div>
        {isFailover && (
          <p className="text-xs text-orange-600 mt-2">
            Primary node failed, used failover path to complete operation
          </p>
        )}
      </div>
    </div>
  );
}
