import { NextRequest, NextResponse } from 'next/server';
import { getProducts, getAllProducts } from '@/lib/db-read';
import {
  createSuccessResponse,
  createErrorResponse
} from '@/lib/db-mappers';

// GET /api/products - Read products with failover based on year context
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get('year');

    let products;
    let contextMsg;

    // if year provided, use context optimization. Else, fetch from Master/Central with Failover.
    if (yearParam === '2024' || yearParam === '2025') {
      console.log(`API: GET /api/products?year=${yearParam} - Starting failover read with year context...`);
      products = await getProducts(yearParam);
      contextMsg = `Retrieved ${products.length} products (context: ${yearParam})`;
    } else {
      console.log(`API: GET /api/products - Starting Master/Central read with failover...`);
      products = await getAllProducts();
      contextMsg = `Retrieved ${products.length} products (Master List)`;
    }

    return NextResponse.json(
      createSuccessResponse(
        products,
        contextMsg,
        { 
          used_node: yearParam ? 'Determined by context logic' : 'Central (or failover)', 
          attempts: ['See server logs'] 
        }
      ),
      { status: 200 }
    );

  } catch (error: any) {
    console.error('API: GET /api/products failed:', error.message);

    // Check if it's a "all nodes unavailable" error
    if (error.message.includes('unavailable')) {
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