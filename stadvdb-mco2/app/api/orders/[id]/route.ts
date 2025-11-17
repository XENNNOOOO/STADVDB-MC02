import { NextRequest, NextResponse } from 'next/server';
import { getOrderById } from '@/lib/db-read';
import { updateOrder, deleteOrder } from '@/lib/db-write';
import {
  createSuccessResponse,
  createErrorResponse,
  validateOrderData,
  getYearFromDeliveryDate
} from '@/lib/db-mappers';
import type { OrderFormData } from '@/lib/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/orders/[id] - Read single order with 3-step failover
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get('year');

    // Default year for routing if not specified
    const year: '2024' | '2025' = yearParam === '2024' ? '2024' : '2025';

    console.log(`API: GET /api/orders/${id}?year=${year} - Starting 3-step failover read...`);

    const order = await getOrderById(id, year);

    if (!order) {
      return NextResponse.json(
        createErrorResponse('Order not found', `Order ${id} was not found on any available node`),
        { status: 404 }
      );
    }

    return NextResponse.json(
      createSuccessResponse(
        order,
        `Order ${id} retrieved successfully`,
        { used_node: 'Determined by failover logic', attempts: ['See server logs'] }
      ),
      { status: 200 }
    );

  } catch (error: any) {
    console.error(`API: GET /api/orders/[id] failed:`, error.message);

    if (error.message.includes('unavailable')) {
      return NextResponse.json(
        createErrorResponse('All database nodes are unavailable', error.message),
        { status: 503 }
      );
    }

    return NextResponse.json(
      createErrorResponse('Failed to retrieve order', error.message),
      { status: 500 }
    );
  }
}

// PUT /api/orders/[id] - Update order with replication
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Validate request data
    const validation = validateOrderData(body);
    if (!validation.isValid) {
      return NextResponse.json(
        createErrorResponse('Invalid order data', validation.errors),
        { status: 400 }
      );
    }

    const orderData: OrderFormData = {
      orderNumber: id, // Use the ID from the URL
      customerNumber: body.customerNumber,
      deliveryDate: body.deliveryDate,
      items: body.items
    };

    console.log(`API: PUT /api/orders/${id} - Updating order with Primary→Failover→Emergency logic...`);

    const result = await updateOrder(id, orderData);

    // Check if result indicates failover was used
    const isFailover = typeof result === 'string' && result.includes('pending');
    const isEmergency = typeof result === 'string' && result.includes('emergency');

    let message = `Order updated successfully`;
    let failoverInfo = { used_node: 'central', attempts: ['central'] };

    if (isEmergency) {
      message = 'Order update logged to emergency node due to multiple failures';
      failoverInfo = { used_node: 'emergency', attempts: ['central', 'failover', 'emergency'] };
    } else if (isFailover) {
      message = 'Order updated locally, sync to central pending';
      failoverInfo = { used_node: 'failover', attempts: ['central', 'failover'] };
    }

    return NextResponse.json(
      createSuccessResponse(
        { orderNumber: id, status: result },
        message,
        failoverInfo
      ),
      { status: 200 }
    );

  } catch (error: any) {
    console.error(`API: PUT /api/orders/[id] failed:`, error.message);

    if (error.message.includes('All database nodes are unavailable')) {
      return NextResponse.json(
        createErrorResponse('All database nodes are unavailable', error.message),
        { status: 503 }
      );
    }

    if (error.message.includes('not found')) {
      return NextResponse.json(
        createErrorResponse('Order not found', error.message),
        { status: 404 }
      );
    }

    if (error.message.includes('Invalid product number') || error.message.includes('Could not calculate total')) {
      return NextResponse.json(
        createErrorResponse('Invalid order data', error.message),
        { status: 400 }
      );
    }

    return NextResponse.json(
      createErrorResponse('Failed to update order', error.message),
      { status: 500 }
    );
  }
}

// DELETE /api/orders/[id] - Delete order with replication
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get('year');

    // Determine year for proper routing (required for delete)
    let year: '2024' | '2025';
    if (yearParam === '2024' || yearParam === '2025') {
      year = yearParam;
    } else {
      // If year not specified, try to determine from order ID pattern or default
      year = id.startsWith('L-') ? '2025' : '2024';
    }

    console.log(`API: DELETE /api/orders/${id}?year=${year} - Deleting order with Primary→Failover→Emergency logic...`);

    const result = await deleteOrder(id, year);

    // Check if result indicates failover was used
    const isFailover = typeof result === 'string' && result.includes('pending');
    const isEmergency = typeof result === 'string' && result.includes('emergency');

    let message = `Order deleted successfully`;
    let failoverInfo = { used_node: 'central', attempts: ['central'] };

    if (isEmergency) {
      message = 'Order deletion logged to emergency node due to multiple failures';
      failoverInfo = { used_node: 'emergency', attempts: ['central', 'failover', 'emergency'] };
    } else if (isFailover) {
      message = 'Order deleted locally, sync to central pending';
      failoverInfo = { used_node: 'failover', attempts: ['central', 'failover'] };
    }

    return NextResponse.json(
      createSuccessResponse(
        { orderNumber: id, status: result },
        message,
        failoverInfo
      ),
      { status: 200 }
    );

  } catch (error: any) {
    console.error(`API: DELETE /api/orders/[id] failed:`, error.message);

    if (error.message.includes('All database nodes are unavailable')) {
      return NextResponse.json(
        createErrorResponse('All database nodes are unavailable', error.message),
        { status: 503 }
      );
    }

    return NextResponse.json(
      createErrorResponse('Failed to delete order', error.message),
      { status: 500 }
    );
  }
}