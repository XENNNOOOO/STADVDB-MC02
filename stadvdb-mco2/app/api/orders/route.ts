import { NextRequest, NextResponse } from 'next/server';
import { getOrdersByYear, getAllOrders } from '@/lib/db-read'; // <--- Added getAllOrders import
import { createOrder } from '@/lib/db-write';
import {
  createSuccessResponse,
  createErrorResponse,
  validateOrderData,
  getYearFromDeliveryDate,
  generateOrderNumber
} from '@/lib/db-mappers';
import { getUserByYear } from '@/lib/hardcoded-data';
import type { OrderFormData } from '@/lib/types';

// GET /api/orders - Read orders (All or by Year) with failover and pagination
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get('year');
    const pageParam = searchParams.get('page');
    const limitParam = searchParams.get('limit');

    // Pagination parameters with defaults
    const page = Math.max(1, parseInt(pageParam || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(limitParam || '50'))); // Min 1, max 100
    const offset = (page - 1) * limit;

    let result;
    let contextMsg;

    // LOGIC: Check if specific year is requested, otherwise fetch ALL
    if (yearParam === '2024' || yearParam === '2025') {
      console.log(`API: GET /api/orders?year=${yearParam}&page=${page}&limit=${limit} - Starting paginated read for ${yearParam}...`);
      result = await getOrdersByYear(yearParam, limit, offset);
      contextMsg = `Retrieved ${result.orders.length} orders for year ${yearParam}`;
    } else {
      // If no year is specified (or invalid), fetch ALL orders from Central
      console.log(`API: GET /api/orders?page=${page}&limit=${limit} - Starting paginated read for ALL YEARS...`);
      result = await getAllOrders(limit, offset);
      contextMsg = `Retrieved ${result.orders.length} orders (All Years)`;
    }

    const { orders, total } = result;
    const totalPages = Math.ceil(total / limit);

    return NextResponse.json(
      createSuccessResponse(
        orders,
        `${contextMsg} (page ${page} of ${totalPages})`,
        {
          used_node: yearParam ? 'Determined by failover logic' : 'Central (or failover)',
          pagination: {
            page,
            limit,
            total,
            totalPages,
            hasMore: offset + orders.length < total
          }
        }
      ),
      { status: 200 }
    );

  } catch (error: any) {
    console.error('API: GET /api/orders failed:', error.message);

    // Check if it's a "all nodes unavailable" error
    if (error.message.includes('unavailable')) {
      return NextResponse.json(
        createErrorResponse('Database nodes are unavailable', error.message),
        { status: 503 }
      );
    }

    return NextResponse.json(
      createErrorResponse('Failed to retrieve orders', error.message),
      { status: 500 }
    );
  }
}

// POST /api/orders - Create new order with Primary→Failover→Emergency logic
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request data
    const validation = validateOrderData(body);
    if (!validation.isValid) {
      return NextResponse.json(
        createErrorResponse('Invalid order data', validation.errors),
        { status: 400 }
      );
    }

    // Extract delivery date and determine year for routing
    const year = getYearFromDeliveryDate(body.deliveryDate);

    // Generate order number if not provided
    if (!body.orderNumber) {
      body.orderNumber = generateOrderNumber(year);
    }

    // Get hardcoded user based on delivery year
    const hardcodedUser = getUserByYear(year);

    const orderData: OrderFormData = {
      orderNumber: body.orderNumber,
      customerNumber: hardcodedUser.id.toString(), // Inject hardcoded customer
      deliveryDate: body.deliveryDate,
      items: body.items
    };

    console.log(`API: POST /api/orders - Creating order ${orderData.orderNumber} (${year}) with Primary→Failover→Emergency logic...`);

    const result = await createOrder(orderData);

    // Check if result indicates failover was used
    const isFailover = typeof result === 'string' && result.includes('pending');
    const isEmergency = typeof result === 'string' && result.includes('emergency');

    let message = `Order created successfully`;
    let failoverInfo = { used_node: 'central', attempts: ['central'] };

    if (isEmergency) {
      message = 'Order logged to emergency node due to multiple failures';
      failoverInfo = { used_node: 'emergency', attempts: ['central', 'failover', 'emergency'] };
    } else if (isFailover) {
      message = 'Order saved locally, sync to central pending';
      failoverInfo = { used_node: 'failover', attempts: ['central', 'failover'] };
    }

    return NextResponse.json(
      createSuccessResponse(
        { orderNumber: orderData.orderNumber, status: result },
        message,
        failoverInfo
      ),
      { status: 201 }
    );

  } catch (error: any) {
    console.error('API: POST /api/orders failed:', error.message);

    // Check if it's a "all nodes unavailable" error
    if (error.message.includes('All database nodes are unavailable')) {
      return NextResponse.json(
        createErrorResponse('All database nodes are unavailable', error.message),
        { status: 503 }
      );
    }

    // Check for validation errors
    if (error.message.includes('Invalid product number') || error.message.includes('Could not calculate total')) {
      return NextResponse.json(
        createErrorResponse('Invalid order data', error.message),
        { status: 400 }
      );
    }

    return NextResponse.json(
      createErrorResponse('Failed to create order', error.message),
      { status: 500 }
    );
  }
}