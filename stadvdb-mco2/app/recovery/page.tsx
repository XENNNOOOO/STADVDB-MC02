'use client';

import { useState } from 'react';
import { RefreshCw, Database, CheckCircle2, AlertCircle, XCircle, Server, Activity } from 'lucide-react';

type NodeStatus = 'online' | 'offline' | 'degraded';

interface RecoveryLog {
  id: number;
  timestamp: string;
  type: 'sync' | 'replicate';
  status: 'success' | 'error';
  message: string;
}

export default function RecoveryPage() {
  const [isRunningSync, setIsRunningSync] = useState(false);
  const [isRunningReplicate, setIsRunningReplicate] = useState(false);
  const [logs, setLogs] = useState<RecoveryLog[]>([
    {
      id: 1,
      timestamp: '2025-11-17 14:30:22',
      type: 'sync',
      status: 'success',
      message: 'Synced 5 pending orders from Node 1 to Node 0',
    },
    {
      id: 2,
      timestamp: '2025-11-17 14:28:15',
      type: 'replicate',
      status: 'success',
      message: 'Replicated 3 orders to Node 2',
    },
  ]);

  const [nodeStatuses, setNodeStatuses] = useState<Record<string, NodeStatus>>({
    'Node 0': 'online',
    'Node 1': 'online',
    'Node 2': 'degraded',
  });

  const handleRunSync = async () => {
    setIsRunningSync(true);

    // Simulate API call
    setTimeout(() => {
      const newLog: RecoveryLog = {
        id: logs.length + 1,
        timestamp: new Date().toLocaleString(),
        type: 'sync',
        status: 'success',
        message: '[UI-ONLY] Pending sync recovery completed - synced pending writes to Node 0',
      };
      setLogs([newLog, ...logs]);
      setIsRunningSync(false);
      alert('[UI-ONLY] Running Pending Sync Recovery\nEndpoint: POST /api/recovery/sync');
    }, 2000);
  };

  const handleRunReplicate = async () => {
    setIsRunningReplicate(true);

    // Simulate API call
    setTimeout(() => {
      const newLog: RecoveryLog = {
        id: logs.length + 1,
        timestamp: new Date().toLocaleString(),
        type: 'replicate',
        status: 'success',
        message: '[UI-ONLY] Replication recovery completed - re-replicated failed writes to replica nodes',
      };
      setLogs([newLog, ...logs]);
      setIsRunningReplicate(false);
      alert('[UI-ONLY] Running Replication Recovery\nEndpoint: POST /api/recovery/replicate');
    }, 2000);
  };

  const getNodeStatusIcon = (status: NodeStatus) => {
    if (status === 'online') return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    if (status === 'degraded') return <AlertCircle className="h-5 w-5 text-orange-600" />;
    return <XCircle className="h-5 w-5 text-red-600" />;
  };

  const getNodeStatusColor = (status: NodeStatus) => {
    if (status === 'online') return 'border-green-200 bg-green-50';
    if (status === 'degraded') return 'border-orange-200 bg-orange-50';
    return 'border-red-200 bg-red-50';
  };

  const getNodeStatusText = (status: NodeStatus) => {
    if (status === 'online') return 'text-green-700';
    if (status === 'degraded') return 'text-orange-700';
    return 'text-red-700';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-blue-100 rounded-lg">
          <RefreshCw className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Recovery Control Panel</h1>
          <p className="text-gray-600">Manage distributed database recovery and synchronization</p>
        </div>
      </div>

      {/* Node Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Object.entries(nodeStatuses).map(([node, status]) => (
          <div
            key={node}
            className={`bg-white rounded-xl shadow-md border-2 p-6 ${getNodeStatusColor(status)}`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Server className="h-5 w-5 text-gray-600" />
                <h3 className="font-semibold text-gray-800">{node}</h3>
              </div>
              {getNodeStatusIcon(status)}
            </div>
            <div>
              <p className={`text-sm font-medium ${getNodeStatusText(status)} capitalize`}>
                {status}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                {node === 'Node 0' && 'Central Master (All Data)'}
                {node === 'Node 1' && 'Regional 1 (2025 Primary)'}
                {node === 'Node 2' && 'Regional 2 (2024 Primary)'}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Recovery Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pending Sync Recovery */}
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Database className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-800">Pending Sync Recovery</h2>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Synchronize pending writes from Node 1 and Node 2 back to Node 0 when it recovers from
            failure.
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            <p className="text-xs text-blue-800">
              <span className="font-semibold">Endpoint:</span> POST /api/recovery/sync
            </p>
            <p className="text-xs text-blue-800 mt-1">
              <span className="font-semibold">Purpose:</span> Reads PENDING_SYNC logs and re-executes
              on Node 0
            </p>
          </div>
          <button
            onClick={handleRunSync}
            disabled={isRunningSync}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold disabled:bg-blue-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isRunningSync ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Running Sync...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Run Pending Sync
              </>
            )}
          </button>
        </div>

        {/* Replication Recovery */}
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-5 w-5 text-green-600" />
            <h2 className="text-lg font-semibold text-gray-800">Replication Recovery</h2>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Re-replicate failed writes from Node 0 to replica nodes (Node 1 and Node 2) when they
            recover.
          </p>
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
            <p className="text-xs text-green-800">
              <span className="font-semibold">Endpoint:</span> POST /api/recovery/replicate
            </p>
            <p className="text-xs text-green-800 mt-1">
              <span className="font-semibold">Purpose:</span> Reads REPLICATION_LOG and re-replicates
              to replicas
            </p>
          </div>
          <button
            onClick={handleRunReplicate}
            disabled={isRunningReplicate}
            className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-semibold disabled:bg-green-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isRunningReplicate ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Running Replication...
              </>
            ) : (
              <>
                <Activity className="h-4 w-4" />
                Run Replication Recovery
              </>
            )}
          </button>
        </div>
      </div>

      {/* Recovery Logs */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-800">Recovery Logs</h2>
        </div>
        <div className="divide-y divide-gray-200">
          {logs.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No recovery logs yet</div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="p-4 hover:bg-gray-50 transition">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {log.status === 'success' ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-gray-900">{log.message}</p>
                      <p className="text-xs text-gray-500 mt-1">{log.timestamp}</p>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      log.type === 'sync'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-green-100 text-green-700'
                    }`}
                  >
                    {log.type}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
