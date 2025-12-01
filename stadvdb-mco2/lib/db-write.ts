import { getConnection } from './connections';
import { logReplicationFailure, logPendingSync, logEmergencyPendingSync } from './db-log';
import { getUserByYear, getRiderByYear } from './hardcoded-data';
import { getProducts } from './db-read';
import type { Connection } from 'mysql2/promise';
import type { OrderFormData, Product } from './types';

let forceRecoveryCheck: (() => Promise<any>) | undefined;
try {
  const recoveryAutomation = require('./recovery-automation');
  forceRecoveryCheck = recoveryAutomation.forceRecoveryCheck;
} catch (err) {
}

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
    throw new Error(`Could not calculate total: ${err.message}`);
  }
};

const triggerPostWriteRecovery = async (operationType: string, orderNumber: string): Promise<void> => {
  if (!forceRecoveryCheck) {
    return;
  }

  try {
    const recoveryResult = await forceRecoveryCheck();
  } catch (error: any) {
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
    connection = await getConnection('central');

    await executeWriteTransaction(connection, orderNumber, orderData, totalAmount);

    await connection.end();

    replicateWrite(orderNumber, orderData, totalAmount, year);

    await triggerPostWriteRecovery('CREATE', orderNumber);

    return orderNumber;

  } catch (err: any) {
    if (connection) await connection.end();

    try {
      connection = await getConnection(failoverNode);
      
      await executeWriteTransaction(connection, orderNumber, orderData, totalAmount);
      
      await logPendingSync(failoverNode, {
        origin_node: failoverNode,
        delivery_date: deliveryDate,
        order_data: JSON.stringify(orderData),
      });

      await connection.end();

      await triggerPostWriteRecovery('CREATE_FAILOVER', orderNumber);

      return `${orderNumber} (Saved locally, sync to central pending)`;

    } catch (failoverErr: any) {
      if (connection) await connection.end();
      
      try {
        await logEmergencyPendingSync(emergencyNode, {
          origin_node: failoverNode,
          delivery_date: deliveryDate,
          order_data: JSON.stringify(orderData),
        });
        
        return `${orderNumber} (Write failed over to emergency log on ${emergencyNode})`;
      
      } catch (emergencyErr: any) {
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
    connection = await getConnection('central');
    await executeUpdateTransaction(connection, id, orderData, totalAmount);
    await connection.end();
    
    replicateUpdate(id, orderData, totalAmount);

    await triggerPostWriteRecovery('UPDATE', id);

    return id;

  } catch (err: any) {
    if (connection) await connection.end();

    try {
      connection = await getConnection(failoverNode);
      await executeUpdateTransaction(connection, id, orderData, totalAmount);
      
      await logPendingSync(failoverNode, {
        origin_node: failoverNode,
        delivery_date: deliveryDate,
        order_data: JSON.stringify(orderData),
      });
      
      await connection.end();

      await triggerPostWriteRecovery('UPDATE_FAILOVER', id);

      return `${id} (Updated locally, sync to central pending)`;

    } catch (failoverErr: any) {
      if (connection) await connection.end();
      
      try {
        await logEmergencyPendingSync(emergencyNode, {
          origin_node: failoverNode,
          delivery_date: deliveryDate,
          order_data: JSON.stringify(orderData),
        });
        return `${id} (Update failed over to emergency log on ${emergencyNode})`;
      } catch (emergencyErr: any) {
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
    connection = await getConnection('central');
    await executeDeleteTransaction(connection, id);
    await connection.end();
    
    replicateDelete(id, year);

    await triggerPostWriteRecovery('DELETE', id);

    return id;

  } catch (err: any) {
    if (connection) await connection.end();

    try {
      connection = await getConnection(failoverNode);
      await executeDeleteTransaction(connection, id);
      
      await logPendingSync(failoverNode, {
        origin_node: failoverNode,
        delivery_date: year.toString(),
        order_data: JSON.stringify({ orderNumber: id, _action: 'DELETE' }),
      });
      
      await connection.end();

      await triggerPostWriteRecovery('DELETE_FAILOVER', id);

      return `${id} (Deleted locally, sync to central pending)`;

    } catch (failoverErr: any) {
      if (connection) await connection.end();

      try {
        await logEmergencyPendingSync(emergencyNode, {
          origin_node: failoverNode,
          delivery_date: year.toString(),
          order_data: JSON.stringify({ orderNumber: id, _action: 'DELETE' }),
        });
        return `${id} (Delete failed over to emergency log on ${emergencyNode})`;
      } catch (emergencyErr: any) {
        throw new Error("All database nodes are unavailable. Delete failed.");
      }
    }
  }
};

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
  
  const targetNode = year === '2025' ? 'node1' : 'node2';
  const queryText = mode === 'CREATE' ? 'REPLICATE_CREATE_ORDER' : 'REPLICATE_UPDATE_ORDER';
  
  let connection: Connection | undefined;
  try {
    connection = await getConnection(targetNode);
    if (mode === 'CREATE') {
      await executeWriteTransaction(connection, orderNumber, orderData, totalAmount);
    } else {
      await executeUpdateTransaction(connection, orderNumber, orderData, totalAmount);
    }
    
  } catch (err: any) {
    await logReplicationFailure({
      target_node: targetNode,
      query_text: queryText,
      query_params: JSON.stringify({ orderNumber, orderData, totalAmount })
    });
  } finally {
    if (connection) await connection.end();
  }

  const backupNode = year === '2025' ? 'node2' : 'node1';
  const backupOptions: TableOptions = year === '2025' 
    ? { ordersTable: 'Orders_2025Backup', itemsTable: 'OrderItems_2025Backup', productsTable: 'Products_2025Backup' }
    : { ordersTable: 'Orders_2024Backup', itemsTable: 'OrderItems_2024Backup', productsTable: 'Products_2024Backup' };

  let backupConnection: Connection | undefined;
  try {
    backupConnection = await getConnection(backupNode);
    if (mode === 'CREATE') {
      await executeWriteTransaction(backupConnection, orderNumber, orderData, totalAmount, backupOptions);
    } else {
      await executeUpdateTransaction(backupConnection, orderNumber, orderData, totalAmount, backupOptions);
    }

  } catch (err: any) {
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

  let connection: Connection | undefined;
  try {
    connection = await getConnection(targetNode);
    await executeDeleteTransaction(connection, orderNumber);
  } catch (err: any) {
    await logReplicationFailure({
      target_node: targetNode,
      query_text: 'REPLICATE_DELETE_ORDER',
      query_params: JSON.stringify({ orderNumber })
    });
  } finally {
    if (connection) await connection.end();
  }

  let backupConnection: Connection | undefined;
  try {
    backupConnection = await getConnection(backupNode);
    
    const backupOptions = year === '2025'
      ? { ordersTable: 'Orders_2025Backup', itemsTable: 'OrderItems_2025Backup' }
      : { ordersTable: 'Orders_2024Backup', itemsTable: 'OrderItems_2024Backup' };

    await executeDeleteTransaction(backupConnection, orderNumber, backupOptions);
  } catch (err: any) {
    await logReplicationFailure({
      target_node: backupNode,
      query_text: 'REPLICATE_DELETE_ORDER',
      query_params: JSON.stringify({ orderNumber })
    });
  } finally {
    if (backupConnection) await backupConnection.end();
  }
};