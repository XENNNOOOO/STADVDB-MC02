import { NextRequest, NextResponse } from 'next/server';
import { getProducts } from '@/lib/db-read';
import {
  createSuccessResponse,
  createErrorResponse
} from '@/lib/db-mappers';

// GET /api/products - Read products with failover based on year context
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get('year');

    // Year is used as context for optimal node selection in failover
    const year: '2024' | '2025' = yearParam === '2024' ? '2024' : '2025';

    console.log(`API: GET /api/products?year=${year} - Starting failover read with year context...`);

    const products = await getProducts(year);

    return NextResponse.json(
      createSuccessResponse(
        products,
        `Retrieved ${products.length} products (context: ${year})`,
        { used_node: 'Determined by failover logic', attempts: ['See server logs'] }
      ),
      { status: 200 }
    );

  } catch (error: any) {
    console.error('API: GET /api/products failed:', error.message);

    // Check if it's a "all nodes unavailable" error
    if (error.message.includes('All nodes are unavailable')) {
      return NextResponse.json(
        createErrorResponse('All database nodes are unavailable', error.message),
        { status: 503 }
      );
    }

    return NextResponse.json(
      createErrorResponse('Failed to retrieve products', error.message),
      { status: 500 }
    );
  }
}