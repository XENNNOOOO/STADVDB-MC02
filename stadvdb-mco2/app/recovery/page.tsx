'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle2, AlertCircle, XCircle, Server, Clock, Settings, Activity } from 'lucide-react';

type NodeStatus = 'online' | 'offline' | 'degraded';

interface NodeInfo {
  name: string;
  status: NodeStatus;
  description: string;
  lastChecked: string;
  responseTime?: number;
}

interface RecoveryLog {
  id: string;
  timestamp: string;
  type: 'sync' | 'replicate';
  status: 'success' | 'error' | 'pending';
  message: string;
  node: string;
  details?: string;
}

interface AutomationStatus {
  isRunning: boolean;
  config: {
    monitoringInterval: number;
    healthCheckTimeout: number;
    enabled: boolean;
  };
  nodeHealth: {
    [key: string]: {
      isOnline: boolean;
      lastChecked: string;
      lastStatusChange: string;
      consecutiveFailures: number;
    };
  };
  stats: {
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    lastRunTime: string | null;
    lastRunResult: any;
  };
}

export default function RecoveryPage() {
  const [logs, setLogs] = useState<RecoveryLog[]>([]);
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, NodeInfo>>({});
  const [automationStatus, setAutomationStatus] = useState<AutomationStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<string>('');


  const fetchNodeStatus = async () => {
    try {
      const response = await fetch('/api/status/nodes');
      const result = await response.json();
      if (result.success) {
        setNodeStatuses(result.data.nodes);
      }
    } catch (error) {
      console.error('Failed to fetch node status:', error);
    }
  };

  const fetchRecoveryLogs = async () => {
    try {
      const response = await fetch('/api/logs/recovery?limit=20');
      const result = await response.json();
      if (result.success) {
        setLogs(result.data.logs);
      }
    } catch (error) {
      console.error('Failed to fetch recovery logs:', error);
    }
  };

  const fetchAutomationStatus = async () => {
    try {
      const response = await fetch('/api/recovery/auto');
      const result = await response.json();
      if (result.success) {
        setAutomationStatus(result.data);
      }
    } catch (error) {
      console.error('Failed to fetch automation status:', error);
      setAutomationStatus(null);
    }
  };

  const refreshData = async () => {
    setIsLoading(true);
    await Promise.all([fetchNodeStatus(), fetchRecoveryLogs(), fetchAutomationStatus()]);
    setLastRefresh(new Date().toLocaleString());
    setIsLoading(false);
  };

  useEffect(() => {
    refreshData();

    // Auto-refresh every 30 seconds
    const interval = setInterval(refreshData, 30000);
    return () => clearInterval(interval);
  }, []);

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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-100 rounded-lg">
            <RefreshCw className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Recovery Control Panel</h1>
            <p className="text-gray-600">Real-time monitoring of automated distributed database recovery</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {lastRefresh && (
            <div className="text-sm text-gray-500 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Last updated: {lastRefresh}
            </div>
          )}
          <button
            onClick={refreshData}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:bg-blue-400 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Refreshing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Refresh
              </>
            )}
          </button>
        </div>
      </div>

      {/* Node Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Object.entries(nodeStatuses).map(([nodeName, nodeInfo]) => (
          <div
            key={nodeName}
            className={`bg-white rounded-xl shadow-md border-2 p-6 ${getNodeStatusColor(nodeInfo.status)}`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Server className="h-5 w-5 text-gray-600" />
                <h3 className="font-semibold text-gray-800">{nodeName}</h3>
              </div>
              {getNodeStatusIcon(nodeInfo.status)}
            </div>
            <div>
              <p className={`text-sm font-medium ${getNodeStatusText(nodeInfo.status)} capitalize`}>
                {nodeInfo.status}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                {nodeInfo.description}
              </p>
              {nodeInfo.responseTime && (
                <p className="text-xs text-gray-500 mt-1">
                  Response: {nodeInfo.responseTime}ms
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Automation Status */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-purple-600" />
            <h2 className="text-lg font-semibold text-gray-800">Automation Status</h2>
          </div>
          {automationStatus?.isRunning ? (
            <div className="flex items-center gap-2 text-green-600">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium">Active</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-gray-500">
              <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
              <span className="text-sm font-medium">Inactive</span>
            </div>
          )}
        </div>

        {automationStatus ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded p-3">
                <p className="text-xs text-gray-600 font-medium">Monitor Interval</p>
                <p className="text-sm text-gray-800">{(automationStatus.config.monitoringInterval / 1000)}s</p>
              </div>
              <div className="bg-gray-50 rounded p-3">
                <p className="text-xs text-gray-600 font-medium">Health Timeout</p>
                <p className="text-sm text-gray-800">{(automationStatus.config.healthCheckTimeout / 1000)}s</p>
              </div>
            </div>

            <div className="border-t pt-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700">Recovery Statistics</span>
                <span className="text-xs text-gray-500">
                  {automationStatus.stats.lastRunTime
                    ? `Last run: ${new Date(automationStatus.stats.lastRunTime).toLocaleTimeString()}`
                    : 'No runs yet'
                  }
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-blue-50 rounded p-2">
                  <p className="text-lg font-bold text-blue-600">{automationStatus.stats.totalRuns}</p>
                  <p className="text-xs text-blue-600">Total</p>
                </div>
                <div className="bg-green-50 rounded p-2">
                  <p className="text-lg font-bold text-green-600">{automationStatus.stats.successfulRuns}</p>
                  <p className="text-xs text-green-600">Success</p>
                </div>
                <div className="bg-red-50 rounded p-2">
                  <p className="text-lg font-bold text-red-600">{automationStatus.stats.failedRuns}</p>
                  <p className="text-xs text-red-600">Failed</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <Settings className="h-8 w-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600">Automation status unavailable</p>
            <p className="text-xs text-gray-500">Check if the recovery service is running</p>
          </div>
        )}
      </div>

      {/* Recovery Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-800">Automatic Sync Recovery</h2>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Replica nodes automatically synchronize pending writes to the central node when it comes back online.
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-800">
              <span className="font-semibold">Process:</span> Reads PENDING_SYNC logs from replicas
            </p>
            <p className="text-xs text-blue-800 mt-1">
              <span className="font-semibold">Trigger:</span> {automationStatus?.isRunning ? 'Automated every 30 seconds' : 'Manual via API'}
            </p>
            <p className="text-xs text-blue-800 mt-1">
              <span className="font-semibold">Execution:</span> {automationStatus?.isRunning ? 'Background service running' : 'Background monitoring calls /api/recovery/sync automatically'}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <RefreshCw className="h-5 w-5 text-green-600" />
            <h2 className="text-lg font-semibold text-gray-800">Automatic Replication Recovery</h2>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Central node automatically re-replicates failed writes to replica nodes when they recover.
          </p>
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-xs text-green-800">
              <span className="font-semibold">Process:</span> Reads REPLICATION_LOG for failed operations
            </p>
            <p className="text-xs text-green-800 mt-1">
              <span className="font-semibold">Trigger:</span> {automationStatus?.isRunning ? 'Automated every 30 seconds' : 'Manual via API'}
            </p>
            <p className="text-xs text-green-800 mt-1">
              <span className="font-semibold">Execution:</span> {automationStatus?.isRunning ? 'Background service running' : 'Background monitoring calls /api/recovery/replicate automatically'}
            </p>
          </div>
        </div>
      </div>

      {/* Transaction Logs */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-800">Recovery Transaction Logs</h2>
          <p className="text-sm text-gray-600 mt-1">Real-time view of pending sync and replication operations</p>
        </div>
        <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
          {logs.length === 0 ? (
            <div className="p-8 text-center">
              {isLoading ? (
                <div className="flex items-center justify-center gap-2 text-gray-500">
                  <RefreshCw className="h-5 w-5 animate-spin" />
                  Loading recovery logs...
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-2 text-green-600">
                    <CheckCircle2 className="h-6 w-6" />
                    <span className="font-medium">System Operating Normally</span>
                  </div>
                  <p className="text-sm text-gray-600">
                    No recovery operations required - all nodes are functioning correctly
                  </p>
                  <p className="text-xs text-gray-500">
                    Recovery logs will appear here when failover scenarios occur
                  </p>
                </div>
              )}
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="p-4 hover:bg-gray-50 transition">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {log.status === 'success' ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                    ) : log.status === 'error' ? (
                      <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
                    ) : (
                      <Clock className="h-5 w-5 text-orange-600 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium text-gray-900">{log.message}</p>
                        <span className="text-xs text-gray-500 font-medium">from {log.node}</span>
                      </div>
                      <p className="text-xs text-gray-500">{log.timestamp}</p>
                      {log.details && (
                        <p className="text-xs text-gray-600 mt-1 bg-gray-100 px-2 py-1 rounded font-mono">
                          {log.details.length > 100 ? log.details.substring(0, 100) + '...' : log.details}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        log.type === 'sync'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-green-100 text-green-700'
                      }`}
                    >
                      {log.type}
                    </span>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        log.status === 'success'
                          ? 'bg-green-100 text-green-700'
                          : log.status === 'error'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-orange-100 text-orange-700'
                      }`}
                    >
                      {log.status}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
