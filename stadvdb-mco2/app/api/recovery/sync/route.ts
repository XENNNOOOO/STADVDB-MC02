import { NextRequest, NextResponse } from 'next/server';
import { runPendingSync } from '@/lib/db-recovery';
import {
  createSuccessResponse,
  createErrorResponse
} from '@/lib/db-mappers';

// POST /api/recovery/sync - Execute Replica→Master sync recovery
export async function POST(request: NextRequest) {
  try {
    console.log('API: POST /api/recovery/sync - Starting Replica→Master sync recovery...');

    const result = await runPendingSync();

    if (result.status === 'ERROR') {
      return NextResponse.json(
        createErrorResponse('Sync recovery failed', result.message),
        { status: 503 }
      );
    }

    return NextResponse.json(
      createSuccessResponse(
        result,
        `Sync recovery completed. ${result.totalSynced} operations processed.`
      ),
      { status: 200 }
    );

  } catch (error: any) {
    console.error('API: POST /api/recovery/sync failed:', error.message);

    return NextResponse.json(
      createErrorResponse('Sync recovery failed', error.message),
      { status: 500 }
    );
  }
}

// GET /api/recovery/sync - Get sync status (for monitoring)
export async function GET(request: NextRequest) {
  try {
    // This is a read-only status check
    return NextResponse.json(
      createSuccessResponse(
        {
          endpoint: '/api/recovery/sync',
          description: 'Replica→Master sync recovery',
          usage: 'POST to execute sync recovery',
          scenarios: [
            'MCO2 Scenario 1: Central node was unavailable and came back online',
            'MCO2 Scenario 3: Failure in writing to central node from replica'
          ]
        },
        'Sync recovery endpoint information'
      ),
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      createErrorResponse('Failed to get sync status', error.message),
      { status: 500 }
    );
  }
}