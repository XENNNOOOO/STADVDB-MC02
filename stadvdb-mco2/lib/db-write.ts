import { getPool } from './connections';
import { logReplicationFailure, logPendingSync, logEmergencyPendingSync } from './db-log';
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

  // try to write to PRIMARY (Node 0)
  let client: PoolClient | undefined;
  try {
    console.log(`WRITE [${orderNumber}]: Trying Node 0 (Primary)...`);
    const pool = getPool('central');
    client = await pool.connect();
    
    // calc total and write to Node 0 w/in a single transaction
    const totalAmount = await calculateAndWrite(client, orderNumber, orderData, year, 'CREATE');
    
    // write successful. asynchronously replicate to replicas.
    console.log(`WRITE [${orderNumber}]: Success on Node 0. Replicating...`);
    
    // we don't wait for this. let it run in the background.
    replicateWrite(orderNumber, orderData, totalAmount, year);
    
    return orderNumber; 

  } catch (err: any) {
    console.warn(`WRITE: Node 0 failed. (${err.message}). Failing over...`);

    // try to write to FAILOVER (Node 1 or 2)
    const failoverNode = year === '2025' ? 'node1' : 'node2';
    try {
      console.log(`WRITE [${orderNumber}]: Trying Node ${failoverNode} (Failover)...`);
      const pool = getPool(failoverNode);
      client = await pool.connect();
      
      // calculate total and write to the local node
      await calculateAndWrite(client, orderNumber, orderData, year, 'CREATE');
      
      // write succeeded. now we log it back to master
      await logPendingSync(failoverNode, {
        origin_node: failoverNode,
        delivery_date: deliveryDate,
        order_data: orderData, // PostgreSQL handles JSON directly
      });
      
      return `${orderNumber} (Saved locally, sync to central pending)`;

    } catch (failoverErr: any) {
      console.warn(`WRITE [${orderNumber}]: Node ${failoverNode} failed. (${failoverErr.message}). Emergency failover...`);
      
      // try to write to EMERGENCY (Node 2 or 1)
      const emergencyNode = year === '2025' ? 'node2' : 'node1';
      try {
        console.log(`WRITE [${orderNumber}]: Trying Node ${emergencyNode} (Emergency Log)...`);
        
        // we do NOT write to the main tables, just the log
        await logEmergencyPendingSync(emergencyNode, {
          origin_node: failoverNode, // intended origin
          delivery_date: deliveryDate,
          order_data: orderData, 
        });
        
        return `${orderNumber} (Write failed over to emergency log on ${emergencyNode})`;
      
      } catch (emergencyErr: any)
      {
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
  
  const failoverNode = year === '2025' ? 'node1' : 'node2';
  const emergencyNode = year === '2025' ? 'node2' : 'node1';

  // try to write to PRIMARY (Node 0)
  let client: PoolClient | undefined;
  try {
    console.log(`UPDATE [${id}]: Trying Node 0 (Primary)...`);
    const pool = getPool('central');
    client = await pool.connect();

    // calc total and update on Node 0
    const totalAmount = await calculateAndWrite(client, id, orderData, year, 'UPDATE');
    
    console.log(`UPDATE [${id}]: Success on Node 0. Replicating...`);
    // we don't wait for this, just fire and forget.
    replicateWrite(id, orderData, totalAmount, year, 'UPDATE');
    
    return id;

  } catch (err: any) {
    console.warn(`UPDATE: Node 0 failed. (${err.message}). Failing over...`);

    // try to write to FAILOVER (Node 1 or 2)
    try {
      console.log(`UPDATE [${id}]: Trying Node ${failoverNode} (Failover)...`);
      const pool = getPool(failoverNode);
      client = await pool.connect();
      
      // calc total and update on local node
      await calculateAndWrite(client, id, orderData, year, 'UPDATE');
      
      await logPendingSync(failoverNode, {
        origin_node: failoverNode,
        delivery_date: deliveryDate,
        order_data: orderData, 
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


// --- HELPER FUNCTIONS ---

/**
 * calculate and write/update data.
 * contains all our locking logic.
 */
const calculateAndWrite = async (
  client: PoolClient,
  orderNumber: string,
  orderData: OrderFormData,
  year: '2024' | '2025',
  mode: 'CREATE' | 'UPDATE'
) => {
  let totalAmount = 0;

  try {
    // concurrency: REPEATABLE READ for all writes
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;');
    await client.query('BEGIN');

    // get product prices & apply shared lock
    // lock the products first to ensure their prices don't change.
    // helps prevent deadlocks.
    const productNumbers = orderData.items.map(item => item.productNumber);
    const { rows: products } = await client.query(
      `SELECT PRODUCT_NUMBER, UNIT_PRICE FROM PRODUCT 
       WHERE PRODUCT_NUMBER = ANY($1::text[])
       FOR SHARE`, // shared lock
      [productNumbers]
    );

    const priceMap = new Map<string, number>();
    (products as Product[]).forEach(p => priceMap.set(p.PRODUCT_NUMBER, p.UNIT_PRICE));

    for (const item of orderData.items) {
      const price = priceMap.get(item.productNumber);
      if (!price) throw new Error(`Invalid product number: ${item.productNumber}`);
      totalAmount += price * item.quantity;
    }

    //  Write/Update Operation
    
    if (mode === 'CREATE') {
      // create new order (Implicit Exclusive Lock)
      await client.query(
        `INSERT INTO ORDER_HEADER (ORDER_NUMBER, CUSTOMER_NUMBER, ORDER_DATE, DELIVERY_DATE, TOTAL_AMOUNT) 
         VALUES ($1, $2, $3, $4, $5)`,
        [orderNumber, orderData.customerNumber, new Date(), orderData.deliveryDate, totalAmount]
      );
    } else {
      // update existing order (Explicit Exclusive Lock)
      // lock the header first to maintain consistent lock order
      const { rowCount } = await client.query(
        `SELECT 1 FROM ORDER_HEADER WHERE ORDER_NUMBER = $1 FOR UPDATE`, // exclusive lock
        [orderNumber]
      );
      if (rowCount === 0) throw new Error(`Order ${orderNumber} not found.`);
      
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
    }

    // insert details
    for (const item of orderData.items) {
      await client.query(
        `INSERT INTO ORDER_DETAILS (ORDER_NUMBER, PRODUCT_NUMBER, QUANTITY_ORDERED) VALUES ($1, $2, $3)`,
        [orderNumber, item.productNumber, item.quantity]
      );
    }

    await client.query('COMMIT');
    return totalAmount;

  } catch (err) {
    // if any query fails, roll back the entire transaction
    await client.query('ROLLBACK');
    throw err; // rethrow the error
  }
};

/**
 * Helper: Executes the actual SQL INSERTs for a new order.
 */
export const executeWriteTransaction = async (
  client: PoolClient,
  orderNumber: string, 
  orderData: OrderFormData
) => {
  // now a wrapper for the new helper
  return calculateAndWrite(client, orderNumber, orderData, new Date(orderData.deliveryDate).getFullYear() === 2025 ? '2025' : '2024', 'CREATE');
};

/**
 * Helper: Executes the SQL UPDATEs for an existing order.
 */
export const executeUpdateTransaction = async (
  client: PoolClient,
  orderNumber: string, 
  orderData: OrderFormData
) => {
  return calculateAndWrite(client, orderNumber, orderData, new Date(orderData.deliveryDate).getFullYear() === 2025 ? '2025' : '2024', 'UPDATE');
};


/**
 * Helper: Executes the SQL DELETEs for an order.
 * implements consistent lock order for deadlock prevention.
 */
export const executeDeleteTransaction = async (
  client: PoolClient,
  orderNumber: string
) => {
  try {
    // concurrency: REPEATABLE READ for all writes
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;');
    await client.query('BEGIN');
    
    // DEADLOCK PREVENTION
    // lock the ORDER_HEADER row FIRST, before touching ORDER_DETAILS
    // ensures a consistent lock order (Header -> Details)
    // with our executeUpdateTransaction function.
    const { rowCount } = await client.query(
      `SELECT 1 FROM ORDER_HEADER WHERE ORDER_NUMBER = $1 FOR UPDATE`, // exclusive lock
      [orderNumber]
    );

    // if the row doesn't exist, we can just commit (nothing to delete)
    if (rowCount === 0) {
      await client.query('COMMIT');
      return;
    }

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
 * Helper: Replicates a successful Node 0 CREATE/UPDATE to the replicas.
 */
const replicateWrite = async (
  orderNumber: string,
  orderData: OrderFormData,
  totalAmount: number,
  year: '2024' | '2025',
  mode: 'CREATE' | 'UPDATE' = 'CREATE'
) => {
  
  // determine which replica to write to (Node 1 or 2)
  const targetNode = year === '2025' ? 'node1' : 'node2';
  const queryText = mode === 'CREATE' ? 'REPLICATE_CREATE_ORDER' : 'REPLICATE_UPDATE_ORDER';

  let client: PoolClient | undefined;
  try {
    // try to connect and write to the replica
    console.log(`REPLICATE (${mode}): Trying to copy to Node ${targetNode}...`);
    const pool = getPool(targetNode);
    client = await pool.connect();
    if (mode === 'CREATE') {
      await executeWriteTransaction(client, orderNumber, orderData);
    } else {
      await executeUpdateTransaction(client, orderNumber, orderData);
    }
    console.log(`REPLICATE (${mode}): Success on Node ${targetNode}.`);
    
  } catch (err: any) {
    console.warn(`REPLICATE (${mode}): Failed to copy to Node ${targetNode}. Logging failure...`);
    // log the failure on Node 0
    await logReplicationFailure({
      target_node: targetNode,
      query_text: queryText,
      query_params: { orderNumber, orderData, totalAmount }
    });
  } finally {
    if (client) client.release();
  }

  // replicate to the other node (the backup replica)
  const backupNode = year === '2025' ? 'node2' : 'node1';
  let backupClient: PoolClient | undefined;
  try {
    console.log(`REPLICATE (${mode}): Trying to copy to Node ${backupNode} (Backup)...`);
    const pool = getPool(backupNode);
    backupClient = await pool.connect();
    if (mode === 'CREATE') {
      await executeWriteTransaction(backupClient, orderNumber, orderData);
    } else {
      await executeUpdateTransaction(backupClient, orderNumber, orderData);
    }
    console.log(`REPLICATE (${mode}): Success on Node ${backupNode}.`);

  } catch (err: any) {
    console.warn(`REPLICATE (${mode}): Failed to copy to Node ${backupNode} (Backup). Logging failure...`);
    await logReplicationFailure({
      target_node: backupNode,
      query_text: queryText,
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
  replicateWrite(orderNumber, orderData, totalAmount, year, 'UPDATE');
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