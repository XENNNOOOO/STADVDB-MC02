import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/connections';
import type { NodeName } from '@/lib/types';
import {
  createSuccessResponse,
  createErrorResponse
} from '@/lib/db-mappers';

type NodeStatus = 'online' | 'offline' | 'degraded';

interface NodeInfo {
  name: string;
  status: NodeStatus;
  description: string;
  lastChecked: string;
  responseTime?: number;
}

const testNodeConnection = async (node: NodeName): Promise<{ status: NodeStatus; responseTime?: number }> => {
  try {
    const startTime = Date.now();
    const connection = await getConnection(node);

    // Simple ping test
    await connection.execute('SELECT 1');
    await connection.end();

    const responseTime = Date.now() - startTime;

    // Consider degraded if response time > 2 seconds
    const status: NodeStatus = responseTime > 2000 ? 'degraded' : 'online';

    return { status, responseTime };
  } catch (error) {
    console.error(`Node ${node} connection failed:`, error);
    return { status: 'offline' };
  }
};

// GET /api/status/nodes - Check real-time connectivity status for all nodes
export async function GET(request: NextRequest) {
  try {
    console.log('API: GET /api/status/nodes - Checking node connectivity...');

    const nodeNames: NodeName[] = ['central', 'node1', 'node2'];
    const nodeDescriptions = {
      'central': 'Central Master (All Data)',
      'node1': 'Regional 1 (2025 Primary)',
      'node2': 'Regional 2 (2024 Primary)'
    };

    // Test all nodes in parallel
    const nodeTests = await Promise.all(
      nodeNames.map(async (node) => {
        const result = await testNodeConnection(node);
        return {
          name: node === 'central' ? 'Node 0' : node === 'node1' ? 'Node 1' : 'Node 2',
          status: result.status,
          description: nodeDescriptions[node],
          lastChecked: new Date().toISOString(),
          responseTime: result.responseTime
        };
      })
    );

    const nodeStatuses = nodeTests.reduce((acc, node) => {
      acc[node.name] = node;
      return acc;
    }, {} as Record<string, NodeInfo>);

    return NextResponse.json(
      createSuccessResponse(
        {
          nodes: nodeStatuses,
          summary: {
            online: nodeTests.filter(n => n.status === 'online').length,
            degraded: nodeTests.filter(n => n.status === 'degraded').length,
            offline: nodeTests.filter(n => n.status === 'offline').length,
            total: nodeTests.length
          }
        },
        'Node connectivity status retrieved'
      ),
      { status: 200 }
    );

  } catch (error: any) {
    console.error('API: GET /api/status/nodes failed:', error.message);

    return NextResponse.json(
      createErrorResponse('Failed to check node status', error.message),
      { status: 500 }
    );
  }
}