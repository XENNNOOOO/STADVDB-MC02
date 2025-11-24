import { getConnection } from './connections';
import type { Connection, RowDataPacket } from 'mysql2/promise'; 
import type { Order, Product, NodeName } from './types';

/**
 * READ (All Orders for a Year)
 * Implements 3-step failover logic based on your spec.
 */
export const getOrdersByYear = async (year: '2024' | '2025'): Promise<Order[]> => {
  const readPath: NodeName[] =
    year === '2025'
      ? ['node1', 'central', 'node2'] 
      : ['node2', 'central', 'node1']; 

  let connection: Connection | undefined;
  
  for (const node of readPath) {
    try {
      console.log(`READ [${year}]: Trying Node ${node}...`);
      connection = await getConnection(node); 
      
      await connection.execute('SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;');
      
      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT 
            o.orderNumber as ORDER_NUMBER, 
            o.userId as CUSTOMER_NUMBER,
            o.createdAt as ORDER_DATE, 
            o.deliveryDate as DELIVERY_DATE,
            COALESCE(SUM(oi.quantity * p.price), 0) as TOTAL_AMOUNT
         FROM Orders o
         LEFT JOIN OrderItems oi ON o.id = oi.OrderId
         LEFT JOIN Products p ON oi.ProductId = p.id
         WHERE YEAR(o.deliveryDate) = ?
         GROUP BY o.id, o.orderNumber, o.userId, o.createdAt, o.deliveryDate`,
        [year]
      );
      
      await connection.end();
      
      console.log(`READ [${year}]: Success on Node ${node}. Fetched ${rows.length} orders.`);
      
      return rows as Order[];
    
    } catch (err: any) {
      console.warn(`READ: Node ${node} failed. (${err.message}). Failing over...`);
      if (connection) await connection.end();
    }
  }

  throw new Error(`All nodes for ${year} data are unavailable.`);
};


/**
 * READ (Single Order)
 * takes the 'year' as a signal from the API 
 * directed 3-step failover path.
 */
export const getOrderById = async (id: string, year: '2024' | '2025'): Promise<any | null> => {
  
  const readPath: NodeName[] =
    year === '2025'
      ? ['node1', 'central', 'node2'] 
      : ['node2', 'central', 'node1']; 
  
  let connection: Connection | undefined;
  
  for (const node of readPath) {
    try {
      console.log(`READ [${id}]: Trying Node ${node}...`);
      connection = await getConnection(node);
      
      // Use READ COMMITTED for consistent reads without locking gaps
      await connection.execute('SET TRANSACTION ISOLATION LEVEL READ COMMITTED;');
      
      // We JOIN tables to get Order info, Item info, and Product Price info
      const [rows]: any[] = await connection.execute(
        `SELECT 
           o.orderNumber, 
           o.userId, 
           o.deliveryDate, 
           o.createdAt,
           oi.quantity,
           p.name as productName,
           p.price as unitPrice
         FROM Orders o
         LEFT JOIN OrderItems oi ON o.id = oi.OrderId
         LEFT JOIN Products p ON oi.ProductId = p.id
         WHERE o.orderNumber = ?`,
        [id]
      );
      
      await connection.end();
      
      // If no rows returned, order doesn't exist
      if (rows.length === 0) continue; 

      console.log(`READ [${id}]: Found on Node ${node}. Parsing...`);

      // TRANSFORM FLAT ROWS INTO NESTED OBJECT
      // Because of the JOIN, we get 1 row per item. We need to combine them.
      const order = {
        orderNumber: rows[0].orderNumber,
        customerNumber: rows[0].userId,
        orderDate: rows[0].createdAt,
        deliveryDate: rows[0].deliveryDate,
        totalAmount: 0, // We will calculate this
        items: [] as any[]
      };

      // Loop through rows to build the items array and sum the total
      rows.forEach((row: any) => {
        if (row.productName) { // check if items exist
          const lineTotal = row.quantity * row.unitPrice;
          order.totalAmount += lineTotal;
          
          order.items.push({
            productName: row.productName,
            quantity: row.quantity,
            unitPrice: row.unitPrice,
            lineTotal: lineTotal
          });
        }
      });

      return order;
      
    } catch (err: any) {
      console.warn(`READ: Node ${node} failed. (${err.message}). skipping...`);
      if (connection) await connection.end();
    }
  }

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
        `SELECT id as PRODUCT_NUMBER, name as PRODUCT_NAME, price as UNIT_PRICE
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
      `SELECT id as PRODUCT_NUMBER, name as PRODUCT_NAME, price as UNIT_PRICE
       FROM Products`
    );
    return rows as Product[];
  } catch (err: any) {
    console.error("RECOVERY: FAILED to get product list from master.", err.message);
    throw err; // throw to be caught by the recovery function
  }
};