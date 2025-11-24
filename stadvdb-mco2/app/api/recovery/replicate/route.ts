import { NextRequest, NextResponse } from 'next/server';
import { runReplicationLog } from '@/lib/db-recovery';
import {
  createSuccessResponse,
  createErrorResponse
} from '@/lib/db-mappers';

// POST /api/recovery/replicate - Execute Master→Replica replication recovery
export async function POST(request: NextRequest) {
  try {
    console.log('API: POST /api/recovery/replicate - Starting Master→Replica replication recovery...');

    const result = await runReplicationLog();

    if (result.status === 'ERROR') {
      return NextResponse.json(
        createErrorResponse('Replication recovery failed', result.message),
        { status: 503 }
      );
    }

    const message = result.message || `Replication recovery completed. ${result.totalReplicated || 0} operations processed.`;

    return NextResponse.json(
      createSuccessResponse(
        result,
        message
      ),
      { status: 200 }
    );

  } catch (error: any) {
    console.error('API: POST /api/recovery/replicate failed:', error.message);

    return NextResponse.json(
      createErrorResponse('Replication recovery failed', error.message),
      { status: 500 }
    );
  }
}

// GET /api/recovery/replicate - Get replication status (for monitoring)
export async function GET(request: NextRequest) {
  try {
    // This is a read-only status check
    return NextResponse.json(
      createSuccessResponse(
        {
          endpoint: '/api/recovery/replicate',
          description: 'Master→Replica replication recovery',
          usage: 'POST to execute replication recovery',
          scenarios: [
            'MCO2 Scenario 2: Fragment node was unavailable and came back online',
            'MCO2 Scenario 4: Failure in writing to fragment node from central'
          ]
        },
        'Replication recovery endpoint information'
      ),
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      createErrorResponse('Failed to get replication status', error.message),
      { status: 500 }
    );
  }
}