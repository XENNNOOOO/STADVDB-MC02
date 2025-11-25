import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/connections';
import type { NodeName } from '@/lib/types';
import {
  createSuccessResponse,
  createErrorResponse
} from '@/lib/db-mappers';

interface RecoveryLog {
  id: string;
  timestamp: string;
  type: 'sync' | 'replicate';
  status: 'success' | 'error' | 'pending';
  message: string;
  node: string;
  details?: string;
}

const fetchPendingSyncLogs = async (): Promise<RecoveryLog[]> => {
  const logs: RecoveryLog[] = [];
  const nodes: { name: NodeName; displayName: string }[] = [
    { name: 'node1', displayName: 'Node 1' },
    { name: 'node2', displayName: 'Node 2' }
  ];

  for (const { name, displayName } of nodes) {
    try {
      const connection = await getConnection(name);
      const [rows] = await connection.execute(
        'SELECT * FROM PENDING_SYNC ORDER BY created_at DESC LIMIT 10'
      ) as any[];

      await connection.end();

      for (const row of rows) {
        logs.push({
          id: `sync-${name}-${row.log_id}`,
          timestamp: new Date(row.created_at || Date.now()).toLocaleString(),
          type: 'sync',
          status: 'pending',
          message: `Pending sync from ${displayName} to Central: Order for delivery ${row.delivery_date}`,
          node: displayName,
          details: row.order_data
        });
      }
    } catch (error: any) {
      console.error(`Failed to fetch PENDING_SYNC from ${name}:`, error);
      // Don't add error logs for missing tables (this is normal for healthy systems)
      if (error.code !== 'ER_NO_SUCH_TABLE' && error.code !== 'ECONNREFUSED') {
        logs.push({
          id: `sync-error-${name}-${Date.now()}`,
          timestamp: new Date().toLocaleString(),
          type: 'sync',
          status: 'error',
          message: `Failed to fetch pending sync logs from ${displayName}: ${error.message}`,
          node: displayName
        });
      }
    }
  }

  return logs;
};

const fetchReplicationLogs = async (): Promise<RecoveryLog[]> => {
  const logs: RecoveryLog[] = [];

  try {
    const connection = await getConnection('central');
    const [rows] = await connection.execute(
      'SELECT * FROM REPLICATION_LOG ORDER BY created_at DESC LIMIT 20'
    ) as any[];

    await connection.end();

    for (const row of rows) {
      const targetNode = row.target_node === 'node1' ? 'Node 1' : 'Node 2';
      const status = row.status === 'FAILED' ? 'error' : 'pending';

      logs.push({
        id: `replicate-${row.log_id}`,
        timestamp: new Date(row.created_at || Date.now()).toLocaleString(),
        type: 'replicate',
        status,
        message: `${status === 'error' ? 'Failed' : 'Pending'} replication to ${targetNode}`,
        node: 'Central',
        details: `Query: ${row.query_text}`
      });
    }
  } catch (error: any) {
    console.error('Failed to fetch REPLICATION_LOG:', error);
    // Don't add error logs for missing tables (this is normal for healthy systems)
    if (error.code !== 'ER_NO_SUCH_TABLE' && error.code !== 'ECONNREFUSED') {
      logs.push({
        id: `replicate-error-${Date.now()}`,
        timestamp: new Date().toLocaleString(),
        type: 'replicate',
        status: 'error',
        message: `Failed to fetch replication logs: ${error.message}`,
        node: 'Central'
      });
    }
  }

  return logs;
};

// GET /api/logs/recovery - Fetch recent recovery transaction logs
export async function GET(request: NextRequest) {
  try {
    console.log('API: GET /api/logs/recovery - Fetching recovery logs...');

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const type = searchParams.get('type'); // 'sync' | 'replicate' | null (for all)

    // Fetch both types of logs in parallel
    const [syncLogs, replicationLogs] = await Promise.all([
      fetchPendingSyncLogs(),
      fetchReplicationLogs()
    ]);

    // Combine and sort logs
    let allLogs = [...syncLogs, ...replicationLogs];

    // Filter by type if specified
    if (type === 'sync') {
      allLogs = allLogs.filter(log => log.type === 'sync');
    } else if (type === 'replicate') {
      allLogs = allLogs.filter(log => log.type === 'replicate');
    }

    // Sort by timestamp (newest first) and limit
    allLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    allLogs = allLogs.slice(0, limit);

    const summary = {
      total: allLogs.length,
      pending: allLogs.filter(log => log.status === 'pending').length,
      errors: allLogs.filter(log => log.status === 'error').length,
      syncCount: allLogs.filter(log => log.type === 'sync').length,
      replicationCount: allLogs.filter(log => log.type === 'replicate').length
    };

    return NextResponse.json(
      createSuccessResponse(
        {
          logs: allLogs,
          summary
        },
        `Retrieved ${allLogs.length} recovery logs`
      ),
      { status: 200 }
    );

  } catch (error: any) {
    console.error('API: GET /api/logs/recovery failed:', error.message);

    return NextResponse.json(
      createErrorResponse('Failed to fetch recovery logs', error.message),
      { status: 500 }
    );
  }
}