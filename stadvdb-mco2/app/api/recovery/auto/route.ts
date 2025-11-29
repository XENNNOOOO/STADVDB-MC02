import { NextRequest, NextResponse } from 'next/server';
import {
  startRecoveryAutomation,
  stopRecoveryAutomation,
  getRecoveryAutomationStatus,
  updateRecoveryAutomationConfig,
  forceRecoveryCheck
} from '@/lib/recovery-automation';
import {
  createSuccessResponse,
  createErrorResponse
} from '@/lib/db-mappers';

// GET /api/recovery/auto - Get automation status
export async function GET(request: NextRequest) {
  try {
    console.log('API: GET /api/recovery/auto - Getting automation status...');

    const status = getRecoveryAutomationStatus();

    if (!status) {
      return NextResponse.json(
        createSuccessResponse(
          {
            isRunning: false,
            message: 'Recovery automation is not initialized'
          },
          'Recovery automation status retrieved'
        ),
        { status: 200 }
      );
    }

    return NextResponse.json(
      createSuccessResponse(
        status,
        'Recovery automation status retrieved'
      ),
      { status: 200 }
    );

  } catch (error: any) {
    console.error('API: GET /api/recovery/auto failed:', error.message);

    return NextResponse.json(
      createErrorResponse('Failed to get automation status', error.message),
      { status: 500 }
    );
  }
}

// POST /api/recovery/auto - Control automation (start/stop/configure/force)
export async function POST(request: NextRequest) {
  try {
    console.log('API: POST /api/recovery/auto - Processing automation command...');

    const body = await request.json();
    const { action, config } = body;

    let result: any = {};

    switch (action) {
      case 'start':
        startRecoveryAutomation(config);
        result = {
          action: 'started',
          message: 'Recovery automation started successfully',
          config: config || 'default configuration'
        };
        break;

      case 'stop':
        stopRecoveryAutomation();
        result = {
          action: 'stopped',
          message: 'Recovery automation stopped successfully'
        };
        break;

      case 'configure':
        if (!config) {
          return NextResponse.json(
            createErrorResponse('Configuration required', 'Config object must be provided for configure action'),
            { status: 400 }
          );
        }
        updateRecoveryAutomationConfig(config);
        result = {
          action: 'configured',
          message: 'Recovery automation configuration updated',
          newConfig: config
        };
        break;

      case 'force':
        const forceResult = await forceRecoveryCheck();
        result = {
          action: 'forced',
          message: 'Manual recovery check completed',
          recoveryResult: forceResult
        };
        break;

      case 'status':
        const status = getRecoveryAutomationStatus();
        result = {
          action: 'status',
          message: 'Automation status retrieved',
          status: status
        };
        break;

      default:
        return NextResponse.json(
          createErrorResponse('Invalid action', `Action '${action}' is not supported. Use: start, stop, configure, force, or status`),
          { status: 400 }
        );
    }

    return NextResponse.json(
      createSuccessResponse(
        result,
        result.message
      ),
      { status: 200 }
    );

  } catch (error: any) {
    console.error('API: POST /api/recovery/auto failed:', error.message);

    return NextResponse.json(
      createErrorResponse('Automation command failed', error.message),
      { status: 500 }
    );
  }
}

// PUT /api/recovery/auto - Update automation configuration
export async function PUT(request: NextRequest) {
  try {
    console.log('API: PUT /api/recovery/auto - Updating automation configuration...');

    const config = await request.json();

    // Validate configuration
    const validKeys = ['monitoringInterval', 'healthCheckTimeout', 'enabled'];
    const invalidKeys = Object.keys(config).filter(key => !validKeys.includes(key));

    if (invalidKeys.length > 0) {
      return NextResponse.json(
        createErrorResponse('Invalid configuration keys', `Invalid keys: ${invalidKeys.join(', ')}. Valid keys: ${validKeys.join(', ')}`),
        { status: 400 }
      );
    }

    // Validate values
    if (config.monitoringInterval && (config.monitoringInterval < 5000 || config.monitoringInterval > 300000)) {
      return NextResponse.json(
        createErrorResponse('Invalid monitoring interval', 'Monitoring interval must be between 5000ms (5s) and 300000ms (5m)'),
        { status: 400 }
      );
    }

    if (config.healthCheckTimeout && (config.healthCheckTimeout < 1000 || config.healthCheckTimeout > 30000)) {
      return NextResponse.json(
        createErrorResponse('Invalid health check timeout', 'Health check timeout must be between 1000ms (1s) and 30000ms (30s)'),
        { status: 400 }
      );
    }

    updateRecoveryAutomationConfig(config);

    const updatedStatus = getRecoveryAutomationStatus();

    return NextResponse.json(
      createSuccessResponse(
        {
          updatedConfig: config,
          currentStatus: updatedStatus
        },
        'Automation configuration updated successfully'
      ),
      { status: 200 }
    );

  } catch (error: any) {
    console.error('API: PUT /api/recovery/auto failed:', error.message);

    return NextResponse.json(
      createErrorResponse('Failed to update automation configuration', error.message),
      { status: 500 }
    );
  }
}

// DELETE /api/recovery/auto - Stop and reset automation
export async function DELETE(request: NextRequest) {
  try {
    console.log('API: DELETE /api/recovery/auto - Stopping and resetting automation...');

    stopRecoveryAutomation();

    return NextResponse.json(
      createSuccessResponse(
        {
          action: 'reset',
          message: 'Recovery automation stopped and reset successfully'
        },
        'Recovery automation reset completed'
      ),
      { status: 200 }
    );

  } catch (error: any) {
    console.error('API: DELETE /api/recovery/auto failed:', error.message);

    return NextResponse.json(
      createErrorResponse('Failed to reset automation', error.message),
      { status: 500 }
    );
  }
}