import { getPool } from './connections';
import { logReplicationFailure, logPendingSync, logEmergencyPendingSync } from './db-log';
import { getProducts } from './db-read';
import type { PoolClient } from 'pg';
import type { OrderFormData, Product } from './types';


/**
 * CREATE ORDER
 * implements full Primary/Failover/Emergency WRITE logic.
 */
export const createOrder = async (orderData: OrderFormData): Promise<string> => {
  // determine Write Paths from Fragmentation Key
  const { deliveryDate } = orderData;
  const year = new Date(deliveryDate).getFullYear() === 2025 ? '2025' : '2024';
  const orderNumber = orderData.orderNumber; 

  const totalAmount = await calculateTotalAmount(orderData.items, year);
  
  // determine failover paths
  const failoverNode = year === '2025' ? 'node1' : 'node2';
  const emergencyNode = year === '2025' ? 'node2' : 'node1';

  // try to write to PRIMARY (Node 0)
  let client: PoolClient | undefined;
  try {
    console.log(`WRITE [${orderNumber}]: Trying Node 0 (Primary)...`);
    const pool = getPool('central');
    client = await pool.connect();
    
    // write to Node 0
    await executeWriteTransaction(client, orderNumber, orderData, totalAmount);
    
    // write successful. asynchronously replicate to replicas.
    console.log(`WRITE [${orderNumber}]: Success on Node 0. Replicating...`);
    
    // we don't wait for this. let it run in the background.
    replicateWrite(orderNumber, orderData, totalAmount);
    
    return orderNumber; 

  } catch (err: any) {
    console.warn(`WRITE: Node 0 failed. (${err.message}). Failing over...`);

    // try to write to FAILOVER (Node 1 or 2)
    try {
      console.log(`WRITE [${orderNumber}]: Trying Node ${failoverNode} (Failover)...`);
      const pool = getPool(failoverNode);
      client = await pool.connect();
      
      // write to the local node
      await executeWriteTransaction(client, orderNumber, orderData, totalAmount);
      
      // write succeeded. now we log it for Node 0.
      await logPendingSync(failoverNode, {
        origin_node: failoverNode,
        delivery_date: deliveryDate,
        order_data: orderData, // PostgreSQL handles JSON directly
      });
      
      return `${orderNumber} (Saved locally, sync to central pending)`;

    } catch (failoverErr: any) {
      console.warn(`WRITE [${orderNumber}]: Node ${failoverNode} failed. (${failoverErr.message}). Emergency failover...`);
      
      // try to write to EMERGENCY (Node 2 or 1)
      // handles Nodes 0+1 Down or 0+2 Down
      try {
        console.log(`WRITE [${orderNumber}]: Trying Node ${emergencyNode} (Emergency Log)...`);
        
        // we do NOT write to the main tables, just the log.
        await logEmergencyPendingSync(emergencyNode, {
          origin_node: failoverNode, // intended origin
          delivery_date: deliveryDate,
          order_data: orderData, // PostgreSQL handles JSON directly
        });
        
        return `${orderNumber} (Write failed over to emergency log on ${emergencyNode})`;
      
      } catch (emergencyErr: any) {
        console.error(`CRITICAL: All 3 nodes are down. Write failed.`);
        throw new Error("All database nodes are unavailable. Write failed.");
      }
    }
  } finally {
    if (client) client.release();
  }
};

/**
 * UPDATE ORDER
 */
export const updateOrder = async (id: string, orderData: OrderFormData): Promise<string> => {
  const { deliveryDate } = orderData;
  const year = new Date(deliveryDate).getFullYear() === 2025 ? '2025' : '2024';
  
  const totalAmount = await calculateTotalAmount(orderData.items, year);
  
  const failoverNode = year === '2025' ? 'node1' : 'node2';
  const emergencyNode = year === '2025' ? 'node2' : 'node1';

  // try to write to PRIMARY (Node 0)
  let client: PoolClient | undefined;
  try {
    console.log(`UPDATE [${id}]: Trying Node 0 (Primary)...`);
    const pool = getPool('central');
    client = await pool.connect();
    await executeUpdateTransaction(client, id, orderData, totalAmount);
    
    console.log(`UPDATE [${id}]: Success on Node 0. Replicating...`);
    // we don't wait for this, just fire and forget. the failover logic is in replicateUpdate
    replicateUpdate(id, orderData, totalAmount);
    
    return id;

  } catch (err: any) {
    console.warn(`UPDATE: Node 0 failed. (${err.message}). Failing over...`);

    // try to write to FAILOVER (Node 1 or 2)
    try {
      console.log(`UPDATE [${id}]: Trying Node ${failoverNode} (Failover)...`);
      const pool = getPool(failoverNode);
      client = await pool.connect();
      await executeUpdateTransaction(client, id, orderData, totalAmount);
      
      await logPendingSync(failoverNode, {
        origin_node: failoverNode,
        delivery_date: deliveryDate,
        order_data: orderData, // log the full data
      });
      
      return `${id} (Updated locally, sync to central pending)`;

    } catch (failoverErr: any) {
      console.warn(`UPDATE [${id}]: Node ${failoverNode} failed. (${failoverErr.message}). Emergency failover...`);
      
      // try to write to EMERGENCY (Node 2 or 1)
      try {
        console.log(`UPDATE [${id}]: Trying Node ${emergencyNode} (Emergency Log)...`);
        await logEmergencyPendingSync(emergencyNode, {
          origin_node: failoverNode,
          delivery_date: deliveryDate,
          order_data: orderData,
        });
        
        return `${id} (Update failed over to emergency log on ${emergencyNode})`;
      
      } catch (emergencyErr: any) {
        console.error(`CRITICAL: All 3 nodes are down. Update failed.`);
        throw new Error("All database nodes are unavailable. Update failed.");
      }
    }
  } finally {
    if (client) client.release();
  }
};


/**
 * DELETE ORDER
 */
export const deleteOrder = async (id: string, year: '2024' | '2025'): Promise<string> => {
  const failoverNode = year === '2025' ? 'node1' : 'node2';
  const emergencyNode = year === '2025' ? 'node2' : 'node1';
  
  // try to write to PRIMARY (Node 0)
  let client: PoolClient | undefined;
  try {
    console.log(`DELETE [${id}]: Trying Node 0 (Primary)...`);
    const pool = getPool('central');
    client = await pool.connect();
    await executeDeleteTransaction(client, id);
    
    console.log(`DELETE [${id}]: Success on Node 0. Replicating...`);

    replicateDelete(id, year);
    
    return id;

  } catch (err: any) {
    console.warn(`DELETE: Node 0 failed. (${err.message}). Failing over...`);
    
    // try to write to FAILOVER (Node 1 or 2)
    try {
      console.log(`DELETE [${id}]: Trying Node ${failoverNode} (Failover)...`);
      const pool = getPool(failoverNode);
      client = await pool.connect();
      await executeDeleteTransaction(client, id);
      
      // log deletion as a PENDING task
      await logPendingSync(failoverNode, {
        origin_node: failoverNode,
        delivery_date: year.toString(),
        order_data: { orderNumber: id, _action: 'DELETE' },
      });
      
      return `${id} (Deleted locally, sync to central pending)`;

    } catch (failoverErr: any) {
      console.warn(`DELETE [${id}]: Node ${failoverNode} failed. (${failoverErr.message}). Emergency failover...`);

      // try to write to EMERGENCY (Node 2 or 1)
      try {
        console.log(`DELETE [${id}]: Trying Node ${emergencyNode} (Emergency Log)...`);
        await logEmergencyPendingSync(emergencyNode, {
          origin_node: failoverNode,
          delivery_date: year.toString(),
          order_data: { orderNumber: id, _action: 'DELETE' },
        });
        
        return `${id} (Delete failed over to emergency log on ${emergencyNode})`;
      
      } catch (emergencyErr: any) {
        console.error(`CRITICAL: All 3 nodes are down. Delete failed.`);
        throw new Error("All database nodes are unavailable. Delete failed.");
      }
    }
  } finally {
    if (client) client.release();
  }
};


// HELPER FUNCTIONS

/**
 * Calculates the total amount for an order.
 * must be called before any write transaction.
 * uses getProducts function which has its own failover.
 */
const calculateTotalAmount = async (
  items: { productNumber: string; quantity: number }[],
  year: '2024' | '2025'
): Promise<number> => {
  let total = 0;
  try {
    // get all products. Use the year as a "hint" for the most efficient node 
    // getProducts is fault-tolerant and will check all 3 nodes.
    const products: Product[] = await getProducts(year);
    
    // create a price map for efficient lookups
    const priceMap = new Map<string, number>();
    products.forEach(p => {
      priceMap.set(p.PRODUCT_NUMBER, p.UNIT_PRICE);
    });

    // calculate the total
    for (const item of items) {
      const price = priceMap.get(item.productNumber);
      if (!price) {
        throw new Error(`Invalid product number: ${item.productNumber}`);
      }
      total += price * item.quantity;
    }
    return total;

  } catch (err: any) {
    console.error("FATAL: Could not calculate total amount.", err.message);
    // if we can't get product prices, we must fail the transaction. (this means that all nodes are down or product data is corrupt)
    throw new Error(`Could not calculate total: ${err.message}`);
  }
};


/**
 * Helper: Executes the actual SQL INSERTs for a new order.
 */
export const executeWriteTransaction = async (
  client: PoolClient,
  orderNumber: string, // The ID (e.g., 'ORD-A1B2C3')
  orderData: OrderFormData,
  totalAmount: number
) => {
  try {
    // concurrency: REPEATABLE READ for all writes
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;');
    await client.query('BEGIN');

    // insert into Header
    await client.query(
      `INSERT INTO ORDER_HEADER (ORDER_NUMBER, CUSTOMER_NUMBER, ORDER_DATE, DELIVERY_DATE, TOTAL_AMOUNT) 
       VALUES ($1, $2, $3, $4, $5)`,
      [orderNumber, orderData.customerNumber, new Date(), orderData.deliveryDate, totalAmount]
    );

    // Insert into Details
    for (const item of orderData.items) {
      await client.query(
        `INSERT INTO ORDER_DETAILS (ORDER_NUMBER, PRODUCT_NUMBER, QUANTITY_ORDERED) VALUES ($1, $2, $3)`,
        [orderNumber, item.productNumber, item.quantity]
      );
    }
    
    // All queries succeeded
    await client.query('COMMIT');

  } catch (err) {
    // If any query fails, roll back the entire transaction
    await client.query('ROLLBACK');
    throw err; // Re-throw the error to be caught by the main function
  }
};

/**
 * Helper: Executes the SQL UPDATEs for an existing order.
 * This has been fixed to remove the SYNC_STATUS column.
 */
export const executeUpdateTransaction = async (
  client: PoolClient,
  orderNumber: string, // The ID
  orderData: OrderFormData,
  totalAmount: number
) => {
  try {
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;');
    await client.query('BEGIN');

    await client.query(
      `UPDATE ORDER_HEADER SET 
         CUSTOMER_NUMBER = $1, 
         DELIVERY_DATE = $2, 
         TOTAL_AMOUNT = $3
       WHERE ORDER_NUMBER = $4`,
      [orderData.customerNumber, orderData.deliveryDate, totalAmount, orderNumber]
    );

    // delete old details
    await client.query(
      `DELETE FROM ORDER_DETAILS WHERE ORDER_NUMBER = $1`,
      [orderNumber]
    );
    
    // insert new details
    for (const item of orderData.items) {
      await client.query(
        `INSERT INTO ORDER_DETAILS (ORDER_NUMBER, PRODUCT_NUMBER, QUANTITY_ORDERED) VALUES ($1, $2, $3)`,
        [orderNumber, item.productNumber, item.quantity]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
};

/**
 * Helper: Executes the SQL DELETEs for an order.
 */
export const executeDeleteTransaction = async (
  client: PoolClient,
  orderNumber: string
) => {
  try {
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;');
    await client.query('BEGIN');
    
    // must delete from details first due to foreign key constraints
    await client.query(
      `DELETE FROM ORDER_DETAILS WHERE ORDER_NUMBER = $1`,
      [orderNumber]
    );
    await client.query(
      `DELETE FROM ORDER_HEADER WHERE ORDER_NUMBER = $1`,
      [orderNumber]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
};


/**
 * Helper: Replicates a successful Node 0 CREATE to the replicas.
 */
const replicateWrite = async (
  orderNumber: string,
  orderData: OrderFormData,
  totalAmount: number
) => {
  const { deliveryDate } = orderData;
  const year = new Date(deliveryDate).getFullYear() === 2025 ? '2025' : '2024';
  
  // determine which replica to write to (Node 1 or 2)
  const targetNode = year === '2025' ? 'node1' : 'node2';
  
  let client: PoolClient | undefined;
  try {
    // try to connect and write to the replica
    console.log(`REPLICATE (CREATE): Trying to copy to Node ${targetNode}...`);
    const pool = getPool(targetNode);
    client = await pool.connect();
    await executeWriteTransaction(client, orderNumber, orderData, totalAmount);
    console.log(`REPLICATE (CREATE): Success on Node ${targetNode}.`);
    
  } catch (err: any) {
    console.warn(`REPLICATE (CREATE): Failed to copy to Node ${targetNode}. Logging failure...`);
    // log the failure on Node 0
    await logReplicationFailure({
      target_node: targetNode,
      query_text: 'REPLICATE_CREATE_ORDER',
      query_params: { orderNumber, orderData, totalAmount }
    });
  } finally {
    if (client) client.release();
  }

  // replicate to the other node (the backup replica)
  const backupNode = year === '2025' ? 'node2' : 'node1';
  let backupClient: PoolClient | undefined;
  try {
    console.log(`REPLICATE (CREATE): Trying to copy to Node ${backupNode} (Backup)...`);
    const pool = getPool(backupNode);
    backupClient = await pool.connect();
    await executeWriteTransaction(backupClient, orderNumber, orderData, totalAmount);
    console.log(`REPLICATE (CREATE): Success on Node ${backupNode}.`);

  } catch (err: any) {
    console.warn(`REPLICATE (CREATE): Failed to copy to Node ${backupNode} (Backup). Logging failure...`);
    await logReplicationFailure({
      target_node: backupNode,
      query_text: 'REPLICATE_CREATE_ORDER',
      query_params: { orderNumber, orderData, totalAmount }
    });
  } finally {
    if (backupClient) backupClient.release();
  }
};

/**
 * Helper: Replicates a successful Node 0 UPDATE to the replicas.
 */
const replicateUpdate = async (
  orderNumber: string,
  orderData: OrderFormData,
  totalAmount: number
) => {
  const { deliveryDate } = orderData;
  const year = new Date(deliveryDate).getFullYear() === 2025 ? '2025' : '2024';
  const targetNode = year === '2025' ? 'node1' : 'node2';
  const backupNode = year === '2025' ? 'node2' : 'node1';

  // replicate to target node
  let client: PoolClient | undefined;
  try {
    console.log(`REPLICATE (UPDATE): Trying to copy to Node ${targetNode}...`);
    const pool = getPool(targetNode);
    client = await pool.connect();
    await executeUpdateTransaction(client, orderNumber, orderData, totalAmount);
  } catch (err: any) {
    console.warn(`REPLICATE (UPDATE): Failed to copy to Node ${targetNode}. Logging failure...`);
    await logReplicationFailure({
      target_node: targetNode,
      query_text: 'REPLICATE_UPDATE_ORDER',
      query_params: { orderNumber, orderData, totalAmount }
    });
  } finally {
    if (client) client.release();
  }

  // replicate to backup node
  let backupClient: PoolClient | undefined;
  try {
    console.log(`REPLICATE (UPDATE): Trying to copy to Node ${backupNode} (Backup)...`);
    const pool = getPool(backupNode);
    backupClient = await pool.connect();
    await executeUpdateTransaction(backupClient, orderNumber, orderData, totalAmount);
  } catch (err: any) {
    console.warn(`REPLICATE (UPDATE): Failed to copy to Node ${backupNode} (Backup). Logging failure...`);
    await logReplicationFailure({
      target_node: backupNode,
      query_text: 'REPLICATE_UPDATE_ORDER',
      query_params: { orderNumber, orderData, totalAmount }
    });
  } finally {
    if (backupClient) backupClient.release();
  }
};

/**
 * Helper: Replicates a successful Node 0 DELETE to the replicas.
 */
const replicateDelete = async (orderNumber: string, year: '2024' | '2025') => {
  const targetNode = year === '2025' ? 'node1' : 'node2';
  const backupNode = year === '2025' ? 'node2' : 'node1';

  // replicate to target node
  let client: PoolClient | undefined;
  try {
    console.log(`REPLICATE (DELETE): Trying to copy to Node ${targetNode}...`);
    const pool = getPool(targetNode);
    client = await pool.connect();
    await executeDeleteTransaction(client, orderNumber);
  } catch (err: any) {
    console.warn(`REPLICATE (DELETE): Failed to copy to Node ${targetNode}. Logging failure...`);
    await logReplicationFailure({
      target_node: targetNode,
      query_text: 'REPLICATE_DELETE_ORDER',
      query_params: { orderNumber }
    });
  } finally {
    if (client) client.release();
  }

  // replicate to backup node
  let backupClient: PoolClient | undefined;
  try {
    console.log(`REPLICATE (DELETE): Trying to copy to Node ${backupNode}...`);
    const pool = getPool(backupNode);
    backupClient = await pool.connect();
    await executeDeleteTransaction(backupClient, orderNumber);
  } catch (err: any) {
    console.warn(`REPLICATE (DELETE): Failed to copy to Node ${backupNode}. Logging failure...`);
    await logReplicationFailure({
      target_node: backupNode,
      query_text: 'REPLICATE_DELETE_ORDER',
      query_params: { orderNumber }
    });
  } finally {
    if (backupClient) backupClient.release();
  }
};