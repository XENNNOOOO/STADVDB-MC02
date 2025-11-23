import { getConnection } from './connections';
import { logReplicationFailure, logPendingSync, logEmergencyPendingSync } from './db-log';
import { getProducts } from './db-read';
import type { Connection } from 'mysql2/promise';
import type { OrderFormData, Product } from './types';

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
 * CREATE ORDER
 * implements full Primary/Failover/Emergency WRITE logic.
 */
export const createOrder = async (orderData: OrderFormData): Promise<string> => {
  // determine Write Paths from Fragmentation Key
  const { deliveryDate } = orderData;
  const year = new Date(deliveryDate).getFullYear() === 2025 ? '2025' : '2024';

  // Ensure orderNumber is set (should be handled by API layer)
  if (!orderData.orderNumber) {
    throw new Error('Order number is required');
  }
  const orderNumber = orderData.orderNumber; 

  // FIX: Calculate total amount *once* at the beginning.
  const totalAmount = await calculateTotalAmount(orderData.items, year);
  
  // determine failover paths
  const failoverNode = year === '2025' ? 'node1' : 'node2';
  const emergencyNode = year === '2025' ? 'node2' : 'node1';

  // try to write to PRIMARY (Node 0)
  let connection: Connection | undefined;
  try {
    console.log(`WRITE [${orderNumber}]: Trying Node 0 (Primary)...`);
    connection = await getConnection('central');
    
    // Write to Node 0
    await executeWriteTransaction(connection, orderNumber, orderData, totalAmount);
    
    await connection.end();
    
    // write successful. asynchronously replicate to replicas.
    console.log(`WRITE [${orderNumber}]: Success on Node 0. Replicating...`);
    
    // we don't wait for this. let it run in the background.
    replicateWrite(orderNumber, orderData, totalAmount, year);
    
    return orderNumber; 

  } catch (err: any) {
    if (connection) await connection.end(); 
    console.warn(`WRITE: Node 0 failed. (${err.message}). Failing over...`);

    // try to write to FAILOVER (Node 1 or 2)
    try {
      console.log(`WRITE [${orderNumber}]: Trying Node ${failoverNode} (Failover)...`);
      connection = await getConnection(failoverNode);
      
      // write to the local node
      await executeWriteTransaction(connection, orderNumber, orderData, totalAmount);
      
      // write succeeded. now we log it back to master
      await logPendingSync(failoverNode, {
        origin_node: failoverNode,
        delivery_date: deliveryDate,
        order_data: JSON.stringify(orderData),
      });
      
      await connection.end();
      return `${orderNumber} (Saved locally, sync to central pending)`;

    } catch (failoverErr: any) {
      if (connection) await connection.end(); 
      console.warn(`WRITE [${orderNumber}]: Node ${failoverNode} failed. (${failoverErr.message}). Emergency failover...`);
      
      // try to write to EMERGENCY (Node 2 or 1)
      // handles Nodes 0+1 Down or 0+2 Down
      try {
        console.log(`WRITE [${orderNumber}]: Trying Node ${emergencyNode} (Emergency Log)...`);
        
        // we do NOT write to the main tables, just the log
        await logEmergencyPendingSync(emergencyNode, {
          origin_node: failoverNode, // intended origin
          delivery_date: deliveryDate,
          order_data: JSON.stringify(orderData),
        });
        
        return `${orderNumber} (Write failed over to emergency log on ${emergencyNode})`;
      
      } catch (emergencyErr: any)
      {
        console.error(`CRITICAL: All 3 nodes are down. Write failed.`);
        throw new Error("All database nodes are unavailable. Write failed.");
      }
    }
  }
};

/**
 * UPDATE ORDER
 */
export const updateOrder = async (id: string, orderData: OrderFormData): Promise<string> => {
  const { deliveryDate } = orderData;
  const year = new Date(deliveryDate).getFullYear() === 2025 ? '2025' : '2024';
  
  // Calculate total amount once at the beginning.
  const totalAmount = await calculateTotalAmount(orderData.items, year);
  
  const failoverNode = year === '2025' ? 'node1' : 'node2';
  const emergencyNode = year === '2025' ? 'node2' : 'node1';

  // try to write to PRIMARY (Node 0)
  let connection: Connection | undefined;
  try {
    console.log(`UPDATE [${id}]: Trying Node 0 (Primary)...`);
    connection = await getConnection('central');
    await executeUpdateTransaction(connection, id, orderData, totalAmount);
    await connection.end();
    
    console.log(`UPDATE [${id}]: Success on Node 0. Replicating...`);
    // we don't wait for this, just fire and forget.
    replicateUpdate(id, orderData, totalAmount);
    
    return id;

  } catch (err: any) {
    if (connection) await connection.end(); 
    console.warn(`UPDATE: Node 0 failed. (${err.message}). Failing over...`);

    // try to write to FAILOVER (Node 1 or 2)
    try {
      console.log(`UPDATE [${id}]: Trying Node ${failoverNode} (Failover)...`);
      connection = await getConnection(failoverNode);
      await executeUpdateTransaction(connection, id, orderData, totalAmount);
      
      await logPendingSync(failoverNode, {
        origin_node: failoverNode,
        delivery_date: deliveryDate,
        order_data: JSON.stringify(orderData), // log the full data
      });
      
      await connection.end();
      return `${id} (Updated locally, sync to central pending)`;

    } catch (failoverErr: any) {
      if (connection) await connection.end(); 
      console.warn(`UPDATE [${id}]: Node ${failoverNode} failed. (${failoverErr.message}). Emergency failover...`);
      
      // try to write to EMERGENCY (Node 2 or 1)
      try {
        console.log(`UPDATE [${id}]: Trying Node ${emergencyNode} (Emergency Log)...`);
        await logEmergencyPendingSync(emergencyNode, {
          origin_node: failoverNode,
          delivery_date: deliveryDate,
          order_data: JSON.stringify(orderData),
        });
        
        return `${id} (Update failed over to emergency log on ${emergencyNode})`;
      
      } catch (emergencyErr: any) {
        console.error(`CRITICAL: All 3 nodes are down. Update failed.`);
        throw new Error("All database nodes are unavailable. Update failed.");
      }
    }
  }
};


/**
 * DELETE ORDER
 */
export const deleteOrder = async (id: string, year: '2024' | '2025'): Promise<string> => {
  const failoverNode = year === '2025' ? 'node1' : 'node2';
  const emergencyNode = year === '2025' ? 'node2' : 'node1';
  
  // try to write to PRIMARY (Node 0)
  let connection: Connection | undefined;
  try {
    console.log(`DELETE [${id}]: Trying Node 0 (Primary)...`);
    connection = await getConnection('central');
    await executeDeleteTransaction(connection, id);
    await connection.end();
    
    console.log(`DELETE [${id}]: Success on Node 0. Replicating...`);

    replicateDelete(id, year);
    
    return id;

  } catch (err: any) {
    if (connection) await connection.end(); 
    console.warn(`DELETE: Node 0 failed. (${err.message}). Failing over...`);
    
    // try to write to FAILOVER (Node 1 or 2)
    try {
      console.log(`DELETE [${id}]: Trying Node ${failoverNode} (Failover)...`);
      connection = await getConnection(failoverNode);
      await executeDeleteTransaction(connection, id);
      
      // log deletion as a PENDING task
      await logPendingSync(failoverNode, {
        origin_node: failoverNode,
        delivery_date: year.toString(),
        order_data: JSON.stringify({ orderNumber: id, _action: 'DELETE' }),
      });
      
      await connection.end();
      return `${id} (Deleted locally, sync to central pending)`;

    } catch (failoverErr: any) {
      if (connection) await connection.end(); 
      console.warn(`DELETE [${id}]: Node ${failoverNode} failed. (${failoverErr.message}). Emergency failover...`);

      // try to write to EMERGENCY (Node 2 or 1)
      try {
        console.log(`DELETE [${id}]: Trying Node ${emergencyNode} (Emergency Log)...`);
        await logEmergencyPendingSync(emergencyNode, {
          origin_node: failoverNode,
          delivery_date: year.toString(),
          order_data: JSON.stringify({ orderNumber: id, _action: 'DELETE' }),
        });
        
        return `${id} (Delete failed over to emergency log on ${emergencyNode})`;
      
      } catch (emergencyErr: any) {
        console.error(`CRITICAL: All 3 nodes are down. Delete failed.`);
        throw new Error("All database nodes are unavailable. Delete failed.");
      }
    }
  }
};


// --- HELPER FUNCTIONS ---

/**
 * calculate and write/update data.
 * contains all our locking logic.
 */
// This helper function is no longer needed, as calculateTotalAmount is separate
// and the execute functions are simple.

/**
 * Helper: Executes the actual SQL INSERTs for a new order.
 */
export const executeWriteTransaction = async (
  connection: Connection,
  orderNumber: string, 
  orderData: OrderFormData,
  totalAmount: number 
) => {
  try {
    // concurrency: REPEATABLE READ for all writes
    await connection.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;');
    await connection.beginTransaction();

    // apply Shared Lock to Products 
    const productNumbers = orderData.items.map(item => item.productNumber);
    const placeholders = productNumbers.map(() => '?').join(',');
    await connection.execute(
      `SELECT 1 FROM Products WHERE id IN (${placeholders}) FOR SHARE`,
      productNumbers
    );

    // insert into Header
    await connection.execute(
      `INSERT INTO Orders (orderNumber, userId, createdAt, deliveryDate, totalAmount)
       VALUES (?, ?, ?, ?, ?)`,
      [orderNumber, orderData.customerNumber, new Date(), orderData.deliveryDate, totalAmount]
    );

    // Insert into Details
    for (const item of orderData.items) {
      await connection.execute(
        `INSERT INTO OrderItems (orderNumber, productId, quantity) VALUES (?, ?, ?)`,
        [orderNumber, item.productNumber, item.quantity]
      );
    }
    
    // All queries succeeded
    await connection.commit();

  } catch (err) {
    // If any query fails, roll back the entire transaction
    await connection.rollback();
    throw err; // Re-throw the error to be caught by the main function
  }
};

/**
 * Helper: Executes the SQL UPDATEs for an existing order.
 */
export const executeUpdateTransaction = async (
  connection: Connection,
  orderNumber: string, 
  orderData: OrderFormData,
  totalAmount: number 
) => {
  try {
    await connection.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;');
    await connection.beginTransaction();

    // apply Shared Lock to Products 
    const productNumbers = orderData.items.map(item => item.productNumber);
    const placeholders = productNumbers.map(() => '?').join(',');
    await connection.execute(
      `SELECT 1 FROM Products WHERE id IN (${placeholders}) FOR SHARE`,
      productNumbers
    );
    
    // apply Exclusive Lock to Header (Deadlock Prevention) 
    const [rows] = await connection.execute(
      `SELECT 1 FROM Orders WHERE orderNumber = ? FOR UPDATE`, // exclusive lock
      [orderNumber]
    );
    if ((rows as any[]).length === 0) throw new Error(`Order ${orderNumber} not found.`);

    // perform all writes
    await connection.execute(
      `UPDATE Orders SET
         userId = ?,
         deliveryDate = ?,
         totalAmount = ?
       WHERE orderNumber = ?`,
      [orderData.customerNumber, orderData.deliveryDate, totalAmount, orderNumber]
    );

    // delete old details
    await connection.execute(
      `DELETE FROM OrderItems WHERE orderNumber = ?`,
      [orderNumber]
    );
    
    // insert new details
    for (const item of orderData.items) {
      await connection.execute(
        `INSERT INTO OrderItems (orderNumber, productId, quantity) VALUES (?, ?, ?)`,
        [orderNumber, item.productNumber, item.quantity]
      );
    }

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  }
};


/**
 * Helper: Executes the SQL DELETEs for an order.
 * implements consistent lock order for deadlock prevention.
 */
export const executeDeleteTransaction = async (
  connection: Connection,
  orderNumber: string
) => {
  try {
    await connection.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;');
    await connection.beginTransaction();
    
    // DEADLOCK PREVENTION
    // lock the ORDER_HEADER row FIRST, before touching ORDER_DETAILS
    // ensures a consistent lock order (Header -> Details)
    // with our executeUpdateTransaction function.
    const [rows] = await connection.execute(
      `SELECT 1 FROM Orders WHERE orderNumber = ? FOR UPDATE`, // exclusive lock
      [orderNumber]
    );

    // if the row doesn't exist, we can just commit (nothing to delete)
    if ((rows as any[]).length === 0) {
      await connection.commit();
      return;
    }

    // must delete from details first due to foreign key constraints
    await connection.execute(
      `DELETE FROM OrderItems WHERE orderNumber = ?`,
      [orderNumber]
    );
    await connection.execute(
      `DELETE FROM Orders WHERE orderNumber = ?`,
      [orderNumber]
    );

    await connection.commit();
  } catch (err) {
    await connection.rollback();
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
  
  let connection: Connection | undefined;
  try {
    // try to connect and write to the replica
    console.log(`REPLICATE (${mode}): Trying to copy to Node ${targetNode}...`);
    connection = await getConnection(targetNode);
    if (mode === 'CREATE') {
      await executeWriteTransaction(connection, orderNumber, orderData, totalAmount);
    } else {
      await executeUpdateTransaction(connection, orderNumber, orderData, totalAmount);
    }
    console.log(`REPLICATE (${mode}): Success on Node ${targetNode}.`);
    
  } catch (err: any) {
    console.warn(`REPLICATE (${mode}): Failed to copy to Node ${targetNode}. Logging failure...`);
    // log the failure on Node 0
    await logReplicationFailure({
      target_node: targetNode,
      query_text: queryText,
      query_params: JSON.stringify({ orderNumber, orderData, totalAmount })
    });
  } finally {
    if (connection) await connection.end();
  }

  // replicate to the other node (the backup replica)
  const backupNode = year === '2025' ? 'node2' : 'node1';
  let backupConnection: Connection | undefined;
  try {
    console.log(`REPLICATE (${mode}): Trying to copy to Node ${backupNode} (Backup)...`);
    backupConnection = await getConnection(backupNode);
    if (mode === 'CREATE') {
      await executeWriteTransaction(backupConnection, orderNumber, orderData, totalAmount);
    } else {
      await executeUpdateTransaction(backupConnection, orderNumber, orderData, totalAmount);
    }
    console.log(`REPLICATE (${mode}): Success on Node ${backupNode}.`);

  } catch (err: any) {
    console.warn(`REPLICATE (${mode}): Failed to copy to Node ${backupNode} (Backup). Logging failure...`);
    await logReplicationFailure({
      target_node: backupNode,
      query_text: queryText,
      query_params: JSON.stringify({ orderNumber, orderData, totalAmount })
    });
  } finally {
    if (backupConnection) await backupConnection.end();
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
  let connection: Connection | undefined;
  try {
    console.log(`REPLICATE (DELETE): Trying to copy to Node ${targetNode}...`);
    connection = await getConnection(targetNode);
    await executeDeleteTransaction(connection, orderNumber);
  } catch (err: any) {
    console.warn(`REPLICATE (DELETE): Failed to copy to Node ${targetNode}. Logging failure...`);
    await logReplicationFailure({
      target_node: targetNode,
      query_text: 'REPLICATE_DELETE_ORDER',
      query_params: JSON.stringify({ orderNumber })
    });
  } finally {
    if (connection) await connection.end();
  }

  // replicate to backup node
  let backupConnection: Connection | undefined;
  try {
    console.log(`REPLICATE (DELETE): Trying to copy to Node ${backupNode}...`);
    backupConnection = await getConnection(backupNode);
    await executeDeleteTransaction(backupConnection, orderNumber);
  } catch (err: any) {
    console.warn(`REPLICATE (DELETE): Failed to copy to Node ${backupNode}. Logging failure...`);
    await logReplicationFailure({
      target_node: backupNode,
      query_text: 'REPLICATE_DELETE_ORDER',
      query_params: JSON.stringify({ orderNumber })
    });
  } finally {
    if (backupConnection) await backupConnection.end();
  }
};