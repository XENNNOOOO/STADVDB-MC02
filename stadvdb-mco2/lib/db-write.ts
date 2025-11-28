import { getConnection } from './connections';
import { logReplicationFailure, logPendingSync, logEmergencyPendingSync } from './db-log';
import { getUserByYear, getRiderByYear } from './hardcoded-data';
import { getProducts } from './db-read';
import type { Connection } from 'mysql2/promise';
import type { OrderFormData, Product } from './types';

interface TableOptions {
  ordersTable?: string;
  itemsTable?: string;
  productsTable?: string;
}

const calculateTotalAmount = async (
  items: { productNumber: string; quantity: number }[],
  year: '2024' | '2025'
): Promise<number> => {
  let total = 0;
  try {
    const products: Product[] = await getProducts(year);
    const priceMap = new Map<string, number>();
    products.forEach(p => {
      priceMap.set(p.PRODUCT_NUMBER.toString(), p.UNIT_PRICE);
    });

    for (const item of items) {
      const price = priceMap.get(item.productNumber.toString());
      if (!price) {
        throw new Error(`Invalid product number: ${item.productNumber}`);
      }
      total += price * item.quantity;
    }
    return total;

  } catch (err: any) {
    console.error("FATAL: Could not calculate total amount.", err.message);
    throw new Error(`Could not calculate total: ${err.message}`);
  }
};


export const createOrder = async (orderData: OrderFormData): Promise<string> => {
  const { deliveryDate } = orderData;
  const year = new Date(deliveryDate).getFullYear() === 2025 ? '2025' : '2024';

  if (!orderData.orderNumber) throw new Error('Order number is required');
  const orderNumber = orderData.orderNumber;

  const totalAmount = await calculateTotalAmount(orderData.items, year);

  const failoverNode = year === '2025' ? 'node1' : 'node2';
  const emergencyNode = year === '2025' ? 'node2' : 'node1';

  let connection: Connection | undefined;
  try {
    console.log(`WRITE [${orderNumber}]: Trying Node 0 (Primary)...`);
    connection = await getConnection('central');

    // Write to Node 0 (Standard tables)
    await executeWriteTransaction(connection, orderNumber, orderData, totalAmount);

    await connection.end();

    console.log(`WRITE [${orderNumber}]: Success on Node 0. Replicating...`);
    replicateWrite(orderNumber, orderData, totalAmount, year);

    return orderNumber;

  } catch (err: any) {
    if (connection) await connection.end();
    console.warn(`WRITE: Node 0 failed. (${err.message}). Failing over...`);

    // FAILOVER (Node 1 or 2)
    try {
      console.log(`WRITE [${orderNumber}]: Trying Node ${failoverNode} (Failover)...`);
      connection = await getConnection(failoverNode);
      
      // On local node, use standard tables
      await executeWriteTransaction(connection, orderNumber, orderData, totalAmount);
      
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
      
      // EMERGENCY (Writes to Log only)
      try {
        console.log(`WRITE [${orderNumber}]: Trying Node ${emergencyNode} (Emergency Log)...`);
        await logEmergencyPendingSync(emergencyNode, {
          origin_node: failoverNode,
          delivery_date: deliveryDate,
          order_data: JSON.stringify(orderData),
        });
        
        return `${orderNumber} (Write failed over to emergency log on ${emergencyNode})`;
      
      } catch (emergencyErr: any) {
        console.error(`CRITICAL: All 3 nodes are down. Write failed.`);
        throw new Error("All database nodes are unavailable. Write failed.");
      }
    }
  }
};

export const updateOrder = async (id: string, orderData: OrderFormData): Promise<string> => {
  const { deliveryDate } = orderData;
  const year = new Date(deliveryDate).getFullYear() === 2025 ? '2025' : '2024';
  const totalAmount = await calculateTotalAmount(orderData.items, year);
  
  const failoverNode = year === '2025' ? 'node1' : 'node2';
  const emergencyNode = year === '2025' ? 'node2' : 'node1';

  let connection: Connection | undefined;
  try {
    console.log(`UPDATE [${id}]: Trying Node 0 (Primary)...`);
    connection = await getConnection('central');
    await executeUpdateTransaction(connection, id, orderData, totalAmount);
    await connection.end();
    
    console.log(`UPDATE [${id}]: Success on Node 0. Replicating...`);
    replicateUpdate(id, orderData, totalAmount);
    return id;

  } catch (err: any) {
    if (connection) await connection.end();
    console.warn(`UPDATE: Node 0 failed. (${err.message}). Failing over...`);

    try {
      console.log(`UPDATE [${id}]: Trying Node ${failoverNode} (Failover)...`);
      connection = await getConnection(failoverNode);
      await executeUpdateTransaction(connection, id, orderData, totalAmount);
      
      await logPendingSync(failoverNode, {
        origin_node: failoverNode,
        delivery_date: deliveryDate,
        order_data: JSON.stringify(orderData),
      });
      
      await connection.end();
      return `${id} (Updated locally, sync to central pending)`;

    } catch (failoverErr: any) {
      if (connection) await connection.end();
      console.warn(`UPDATE [${id}]: Node ${failoverNode} failed. (${failoverErr.message}). Emergency failover...`);
      
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

export const deleteOrder = async (id: string, year: '2024' | '2025'): Promise<string> => {
  const failoverNode = year === '2025' ? 'node1' : 'node2';
  const emergencyNode = year === '2025' ? 'node2' : 'node1';

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

    try {
      console.log(`DELETE [${id}]: Trying Node ${failoverNode} (Failover)...`);
      connection = await getConnection(failoverNode);
      await executeDeleteTransaction(connection, id);
      
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

export const executeWriteTransaction = async (
  connection: Connection,
  orderNumber: string, 
  orderData: OrderFormData,
  totalAmount: number,
  options: TableOptions = {} 
) => {
  const { 
    ordersTable = 'Orders', 
    itemsTable = 'OrderItems', 
    productsTable = 'Products' 
  } = options;

  try {
    await connection.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;');
    await connection.beginTransaction();

    const productNumbers = orderData.items.map(item => item.productNumber);
    const placeholders = productNumbers.map(() => '?').join(',');
    
    await connection.execute(
      `SELECT 1 FROM ${productsTable} WHERE id IN (${placeholders}) FOR SHARE`,
      productNumbers
    );

    const year = new Date(orderData.deliveryDate).getFullYear() >= 2025 ? '2025' : '2024';
    const hardcodedUser = getUserByYear(year);
    const hardcodedRider = getRiderByYear(year);
    
    const [orderResult] = await connection.execute(
      `INSERT INTO ${ordersTable} (orderNumber, userId, deliveryRiderId, deliveryDate, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [orderNumber, hardcodedUser.id, hardcodedRider.id, orderData.deliveryDate, new Date(), new Date()]
    );

    const orderId = (orderResult as any).insertId;

    for (const item of orderData.items) {
      await connection.execute(
        `INSERT INTO ${itemsTable} (OrderId, ProductId, quantity, notes, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`,
        [orderId, item.productNumber, item.quantity, null, new Date(), new Date()]
      );
    }
    
    await connection.commit();

  } catch (err) {
    await connection.rollback();
    throw err;
  }
};

export const executeUpdateTransaction = async (
  connection: Connection,
  orderNumber: string, 
  orderData: OrderFormData,
  totalAmount: number,
  options: TableOptions = {}
) => {
  const { 
    ordersTable = 'Orders', 
    itemsTable = 'OrderItems', 
    productsTable = 'Products' 
  } = options;

  try {
    await connection.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;');
    await connection.beginTransaction();

    const productNumbers = orderData.items.map(item => item.productNumber);
    const placeholders = productNumbers.map(() => '?').join(',');
    await connection.execute(
      `SELECT 1 FROM ${productsTable} WHERE id IN (${placeholders}) FOR SHARE`,
      productNumbers
    );
    
    const [rows] = await connection.execute(
      `SELECT 1 FROM ${ordersTable} WHERE orderNumber = ? FOR UPDATE`,
      [orderNumber]
    );
    if ((rows as any[]).length === 0) throw new Error(`Order ${orderNumber} not found.`);

    const year = new Date(orderData.deliveryDate).getFullYear() >= 2025 ? '2025' : '2024';
    const hardcodedUser = getUserByYear(year);
    const hardcodedRider = getRiderByYear(year);
    await connection.execute(
      `UPDATE ${ordersTable} SET
         userId = ?,
         deliveryRiderId = ?,
         deliveryDate = ?,
         updatedAt = ?
       WHERE orderNumber = ?`,
      [hardcodedUser.id, hardcodedRider.id, orderData.deliveryDate, new Date(), orderNumber]
    );

    const [orderRows] = await connection.execute(
      `SELECT id FROM ${ordersTable} WHERE orderNumber = ?`,
      [orderNumber]
    );
    const orderId = (orderRows as any[])[0]?.id;

    await connection.execute(
      `DELETE FROM ${itemsTable} WHERE OrderId = ?`,
      [orderId]
    );
    
    for (const item of orderData.items) {
      await connection.execute(
        `INSERT INTO ${itemsTable} (OrderId, ProductId, quantity, notes, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`,
        [orderId, item.productNumber, item.quantity, null, new Date(), new Date()]
      );
    }

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  }
};

export const executeDeleteTransaction = async (
  connection: Connection,
  orderNumber: string,
  options: TableOptions = {}
) => {
  const { ordersTable = 'Orders', itemsTable = 'OrderItems' } = options;

  try {
    await connection.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;');
    await connection.beginTransaction();
    
    const [rows] = await connection.execute(
      `SELECT 1 FROM ${ordersTable} WHERE orderNumber = ? FOR UPDATE`,
      [orderNumber]
    );

    if ((rows as any[]).length === 0) {
      await connection.commit();
      return;
    }

    const [orderRows] = await connection.execute(
      `SELECT id FROM ${ordersTable} WHERE orderNumber = ?`,
      [orderNumber]
    );
    const orderId = (orderRows as any[])[0]?.id;

    if (orderId) {
      await connection.execute(
        `DELETE FROM ${itemsTable} WHERE OrderId = ?`,
        [orderId]
      );
    }
    await connection.execute(
      `DELETE FROM ${ordersTable} WHERE orderNumber = ?`,
      [orderNumber]
    );

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  }
};


const replicateWrite = async (
  orderNumber: string,
  orderData: OrderFormData,
  totalAmount: number,
  year: '2024' | '2025',
  mode: 'CREATE' | 'UPDATE' = 'CREATE'
) => {
  
  // REPLICATE TO TARGET NODE (Primary Table)
  const targetNode = year === '2025' ? 'node1' : 'node2';
  const queryText = mode === 'CREATE' ? 'REPLICATE_CREATE_ORDER' : 'REPLICATE_UPDATE_ORDER';
  
  let connection: Connection | undefined;
  try {
    console.log(`REPLICATE (${mode}): Trying to copy to Node ${targetNode}...`);
    connection = await getConnection(targetNode);
    // Uses default tables (Orders, OrderItems) on the target node
    if (mode === 'CREATE') {
      await executeWriteTransaction(connection, orderNumber, orderData, totalAmount);
    } else {
      await executeUpdateTransaction(connection, orderNumber, orderData, totalAmount);
    }
    console.log(`REPLICATE (${mode}): Success on Node ${targetNode}.`);
    
  } catch (err: any) {
    console.warn(`REPLICATE (${mode}): Failed to copy to Node ${targetNode}. Logging failure...`);
    await logReplicationFailure({
      target_node: targetNode,
      query_text: queryText,
      query_params: JSON.stringify({ orderNumber, orderData, totalAmount })
    });
  } finally {
    if (connection) await connection.end();
  }

  // REPLICATE TO BACKUP NODE (Backup Tables)
  const backupNode = year === '2025' ? 'node2' : 'node1';
  const backupOptions: TableOptions = year === '2025' 
    ? { ordersTable: 'Orders_2025Backup', itemsTable: 'OrderItems_2025Backup', productsTable: 'Products_2025Backup' }
    : { ordersTable: 'Orders_2024Backup', itemsTable: 'OrderItems_2024Backup', productsTable: 'Products_2024Backup' };

  let backupConnection: Connection | undefined;
  try {
    console.log(`REPLICATE (${mode}): Trying to copy to Node ${backupNode} (Backup Tables)...`);
    backupConnection = await getConnection(backupNode);
    if (mode === 'CREATE') {
      await executeWriteTransaction(backupConnection, orderNumber, orderData, totalAmount, backupOptions);
    } else {
      await executeUpdateTransaction(backupConnection, orderNumber, orderData, totalAmount, backupOptions);
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

const replicateUpdate = async (
  orderNumber: string,
  orderData: OrderFormData,
  totalAmount: number
) => {
  const { deliveryDate } = orderData;
  const year = new Date(deliveryDate).getFullYear() === 2025 ? '2025' : '2024';
  replicateWrite(orderNumber, orderData, totalAmount, year, 'UPDATE');
};

const replicateDelete = async (orderNumber: string, year: '2024' | '2025') => {
  const targetNode = year === '2025' ? 'node1' : 'node2';
  const backupNode = year === '2025' ? 'node2' : 'node1';

  // Replicate to target (Primary Tables)
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

  // Replicate to backup (Backup Tables)
  let backupConnection: Connection | undefined;
  try {
    console.log(`REPLICATE (DELETE): Trying to copy to Node ${backupNode} (Backup Tables)...`);
    backupConnection = await getConnection(backupNode);
    
    const backupOptions = year === '2025'
      ? { ordersTable: 'Orders_2025Backup', itemsTable: 'OrderItems_2025Backup' }
      : { ordersTable: 'Orders_2024Backup', itemsTable: 'OrderItems_2024Backup' };

    await executeDeleteTransaction(backupConnection, orderNumber, backupOptions);
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