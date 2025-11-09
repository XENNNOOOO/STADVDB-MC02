import { getPool } from './connections';
import type { Order, Product, NodeName } from './types';
import type { PoolClient } from 'pg';

/**
 * READ (All Orders for a Year)
 * 3-step failover logic for Reads.
 */
export const getOrdersByYear = async (year: '2024' | '2025'): Promise<Order[]> => {
  // read Path
  const readPath: NodeName[] =
    year === '2025'
      ? ['node1', 'central', 'node2']   // Node 1 (Primary) -> Node 0 (Master) -> Node 2 (Backup)
      : ['node2', 'central', 'node1'];  // Node 2 (Primary) -> Node 0 (Master) -> Node 1 (Backup)

  let client: PoolClient | undefined;
  
  // loop through the path until one succeeds
  for (const node of readPath) {
    try {
      console.log(`READ [${year}]: Trying Node ${node}...`);
      const pool = getPool(node);
      client = await pool.connect();
      
      // concurrency: fast - read uncommitted
      await client.query('SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;');
      
      // query works on all 3 nodes
      // Use $1, $2... for PostgreSQL again
      const { rows } = await client.query(
        `SELECT ORDER_NUMBER, CUSTOMER_NUMBER, ORDER_DATE, DELIVERY_DATE, TOTAL_AMOUNT 
         FROM ORDER_HEADER WHERE EXTRACT(YEAR FROM DELIVERY_DATE) = $1`,
        [year]
      );
      
      console.log(`READ [${year}]: Success on Node ${node}.`);
      return rows as Order[];
    
    } catch (err: any) {
      console.warn(`READ: Node ${node} failed. (${err.message}). Failing over...`);
      // loop continues to the next node
    } finally {
      if (client) client.release(); 
    }
  }

  // if all 3 nodes in the path have failed
  throw new Error(`All nodes for ${year} data are unavailable.`);
};

/**
 * READ (Single Order)
 * takes the 'year' as a signal from the API 
 * directed 3-step failover path.
 */
export const getOrderById = async (id: string, year: '2024' | '2025'): Promise<Order | null> => {
  
  //  3-step failover path based on year
  const readPath: NodeName[] =
    year === '2025'
      ? ['node1', 'central', 'node2']   // 2025 Path
      : ['node2', 'central', 'node1'];  // 2024 Path
  
  let client: PoolClient | undefined;
  
  // loop through the chosen path
  for (const node of readPath) {
    try {
      console.log(`READ [${id}]: Trying Node ${node}...`);
      const pool = getPool(node);
      client = await pool.connect();
      
      // concurrency: read committed to prevent dirty reads
      await client.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED;');
      
      const { rows } = await client.query(
        `SELECT * FROM ORDER_HEADER WHERE ORDER_NUMBER = $1`,
        [id]
      );
            
      const order = (rows as Order[])[0] || null;
      
      // ff we found the order on this node, return it
      if (order) {
        console.log(`READ [${id}]: Found on Node ${node}.`);
        return order;
      }
      
      // if order is not found, try the next node
      
    } catch (err: any) {
      // this node is down. log it and continue to the next one.
      console.warn(`READ: Node ${node} failed. (${err.message}). skipping...`);
    } finally {
      if (client) client.release(); // Always release the client
    }
  }

  // if we searched all 3 nodes (online) and didn't find it
  console.error(`Order ${id} not found on any available node.`);
  return null;
};

/**
 * READ (Products)
 * tries the local nodes first, before failing over
 */
export const getProducts = async (year: '2024' | '2025'): Promise<Product[]> => {
  
  // determine the most efficient read path based on the user's context
  const readPath: NodeName[] =
    year === '2025'
      ? ['node1', 'central', 'node2']   // Try Node 1 first then failover if needed
      : ['node2', 'central', 'node1'];  // Try Node 2 first
  
  let client: PoolClient | undefined;

  // loop through the path until one succeeds
  for (const node of readPath) {
    try {
      console.log(`READ [Products, context=${year}]: Trying Node ${node}...`);
      const pool = getPool(node);
      client = await pool.connect();
      await client.query('SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;');
      
      const { rows } = await client.query('SELECT PRODUCT_NUMBER, PRODUCT_NAME, UNIT_PRICE FROM PRODUCT');
      
      console.log(`READ [Products]: Success on Node ${node}.`);
      return rows as Product[]; 
    
    } catch (err: any) {
      console.warn(`READ [Products]: Node ${node} failed. (${err.message}). Failing over...`);
      // loop continues to the next node
    } finally {
      if (client) client.release();
    }
  }
  
  // if all 3 nodes failed
  throw new Error(`All nodes are unavailable. Cannot fetch products.`);
};

/**
 * READ (Products from Master)
 * non-failover read used only by the recovery (pending_logs) script.
 */
export const getProductsFromMaster = async (client: PoolClient): Promise<Product[]> => {
  // reuses the client connection from the recovery script
  try {
    await client.query('SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;');
    const { rows } = await client.query('SELECT PRODUCT_NUMBER, PRODUCT_NAME, UNIT_PRICE FROM PRODUCT');
    return rows as Product[];
  } catch (err: any) {
    console.error("RECOVERY: FAILED to get product list from master.", err.message);
    throw err; // rethrow to be caught by the recovery func
  }
};