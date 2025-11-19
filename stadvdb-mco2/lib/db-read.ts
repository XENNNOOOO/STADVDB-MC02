import { getConnection } from './connections';
import type { Connection } from 'mysql2/promise';
import type { Order, Product, NodeName } from './types';

/**
 * READ (All Orders for a Year with Pagination)
 * Implements 3-step failover logic based on your spec.
 */
export const getOrdersByYear = async (
  year: '2024' | '2025',
  limit: number = 50,
  offset: number = 0
): Promise<{ orders: Order[]; total: number }> => {
  // determine the correct 3-step read path based on the year
  const readPath: NodeName[] =
    year === '2025'
      ? ['node1', 'central', 'node2'] // Spec: Try Node 1 (Primary) -> Node 0 (Master) -> Node 2 (Backup)
      : ['node2', 'central', 'node1']; // Spec: Try Node 2 (Primary) -> Node 0 (Master) -> Node 1 (Backup)

  let connection: Connection | undefined;

  // loop through the path until one succeeds
  for (const node of readPath) {
    try {
      console.log(`READ [${year}]: Trying Node ${node}...`);
      connection = await getConnection(node);

      // fastest isolation for high-concurrency reads
      await connection.execute('SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;');

      // Get total count for pagination metadata
      const [countRows] = await connection.execute(
        `SELECT COUNT(*) as total FROM Orders WHERE YEAR(deliveryDate) = ?`,
        [year]
      );
      const total = (countRows as any)[0].total;

      // query works on all 3 nodes with pagination
      // Use ? placeholders and YEAR() for MySQL
      // Fetch all columns from database
      // ORDER BY for consistent pagination results
      // Note: LIMIT and OFFSET must be literal integers, not bound parameters in mysql2
      const [rows] = await connection.execute(
        `SELECT id, orderNumber, userId, deliveryDate, deliveryRiderId, createdAt, updatedAt
         FROM Orders
         WHERE YEAR(deliveryDate) = ?
         ORDER BY deliveryDate DESC, orderNumber ASC
         LIMIT ${limit} OFFSET ${offset}`,
        [year]
      );

      await connection.end();

      const orders = rows as Order[];

      console.log(`READ [${year}]: Success on Node ${node}. Fetched ${orders.length} of ${total} total orders.`);
      return { orders, total };

    } catch (err: any) {
      console.warn(`READ: Node ${node} failed. (${err.message}). Failing over...`);
      if (connection) await connection.end();
      // loop continues to the next node
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
  
  //  3-step failover path based on the signal (year)
  const readPath: NodeName[] =
    year === '2025'
      ? ['node1', 'central', 'node2']   // 2025 Path
      : ['node2', 'central', 'node1'];  // 2024 Path
  
  let connection: Connection | undefined;
  
  // loop through the chosen path
  for (const node of readPath) {
    try {
      console.log(`READ [${id}]: Trying Node ${node}...`);
      connection = await getConnection(node);
      
      // concurrency: read committed to prevent dirty reads
      await connection.execute('SET TRANSACTION ISOLATION LEVEL READ COMMITTED;');
      
      const [rows] = await connection.execute(
        `SELECT id, orderNumber, userId, deliveryDate, deliveryRiderId, createdAt, updatedAt
         FROM Orders WHERE orderNumber = ?`,
        [id]
      );

      await connection.end();

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
      if (connection) await connection.end();
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
  
  let connection: Connection | undefined;

  // loop through the path until one succeeds
  for (const node of readPath) {
    try {
      console.log(`READ [Products, context=${year}]: Trying Node ${node}...`);
      connection = await getConnection(node);
      await connection.execute('SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;');
      
      const [rows] = await connection.execute(
        `SELECT id, name, price, productCode as productNumber
         FROM Products`
      );

      await connection.end();

      console.log(`READ [Products]: Success on Node ${node}.`);
      return rows as Product[]; 
    
    } catch (err: any) {
      console.warn(`READ [Products]: Node ${node} failed. (${err.message}). Failing over...`);
      if (connection) await connection.end();
      // Loop continues to the next node
    }
  }
  
  // if all 3 nodes failed
  throw new Error(`All nodes are unavailable. Cannot fetch products.`);
};

/**
 * READ (Products from Master)
 * non-failover read used only by the recovery (pending_logs) script.
 */
export const getProductsFromMaster = async (connection: Connection): Promise<Product[]> => {
  try {
    // re-uses the connection from the recovery script
    await connection.execute('SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;');
    const [rows] = await connection.execute(
      `SELECT id, name, price, productCode as productNumber
       FROM Products`
    );
    return rows as Product[];
  } catch (err: any) {
    console.error("RECOVERY: FAILED to get product list from master.", err.message);
    throw err; // throw to be caught by the recovery function
  }
};