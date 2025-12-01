import { getConnection } from './connections';
import { executeWriteTransaction, executeUpdateTransaction, executeDeleteTransaction } from './db-write';
import { getAllProducts } from './db-read'; 
import type { Connection, RowDataPacket } from 'mysql2/promise';
import type { NodeName, OrderFormData, Product } from './types';

interface PendingSyncLog {
  id: number; 
  origin_node: NodeName;
  delivery_date: string;
  order_data: string;
}

interface ReplicationLog {
  id: number; 
  target_node: NodeName;
  query_text: string;
  query_params: string;
}

interface TableOptions {
  ordersTable?: string;
  itemsTable?: string;
  productsTable?: string;
}

export const runRecovery = async () => {
  const results = {
    masterToSlaves: 0,
    slavesToMaster: 0,
    errors: [] as string[]
  };

  try {
    const syncResult = await runPendingSync();
    if (syncResult.status === 'OK') {
        results.slavesToMaster = syncResult.totalSynced || 0;
    } else {
        results.errors.push(syncResult.message || 'Sync failed');
    }

    const replResult = await runReplicationLog();
    if (replResult.status === 'OK') {
        results.masterToSlaves = replResult.totalReplicated || 0;
    } else {
        results.errors.push(replResult.message || 'Replication failed');
    }
    
  } catch (err: any) {
    results.errors.push(err.message);
  }

  return results;
};

const readPendingSyncLog = async (node: 'node1' | 'node2'): Promise<PendingSyncLog[]> => {
  let connection: Connection | undefined;
  try {
    connection = await getConnection(node);
    const [rows] = await connection.execute('SELECT * FROM PENDING_SYNC WHERE status = "PENDING"');
    await connection.end();
    return rows as PendingSyncLog[];
  } catch (err: any) {
    if (connection) await connection.end();
    return [];
  }
};

const markPendingSyncComplete = async (node: 'node1' | 'node2', log_id: number) => {
  let connection: Connection | undefined;
  try {
    connection = await getConnection(node);
    await connection.execute('UPDATE PENDING_SYNC SET status = "COMPLETED" WHERE id = ?', [log_id]);
    await connection.end();
  } catch (err: any) {
    if (connection) await connection.end();
  }
};

export const runPendingSync = async () => {
  let centralConnection: Connection | undefined;
  try {
    centralConnection = await getConnection('central');

    let productPriceMap = new Map<string, number>();
    try {
      const products: Product[] = await getAllProducts();
      products.forEach(p => {
        productPriceMap.set(p.PRODUCT_NUMBER, p.UNIT_PRICE);
      });
    } catch (err: any) {
      throw new Error(`Could not load product prices: ${err.message}`);
    }

    const nodesToCheck: NodeName[] = ['node1', 'node2'];
    let totalSynced = 0;

    for (const node of nodesToCheck) {
      const logs = await readPendingSyncLog(node as 'node1' | 'node2');
      if (logs.length === 0) continue;

      for (const log of logs) {
        try {
          const orderData = JSON.parse(log.order_data) as OrderFormData;
          const orderNumber = orderData.orderNumber;

          let totalAmount = 0;
          if (orderData.items) {
            for (const item of orderData.items) {
                const price = productPriceMap.get(String(item.productNumber));
                if (price) {
                    totalAmount += price * item.quantity;
                }
            }
          }

          if ((orderData as any)._action === 'DELETE') {
            await executeDeleteTransaction(centralConnection, orderNumber);
          }
          else if (await orderExists(centralConnection, orderNumber, 'Orders')) {
            await executeUpdateTransaction(centralConnection, orderNumber, orderData, totalAmount);
          }
          else {
            await executeWriteTransaction(centralConnection, orderNumber, orderData, totalAmount);
          }

          await markPendingSyncComplete(node as 'node1' | 'node2', log.id);
          totalSynced++;

        } catch (jobErr: any) {
          console.error(jobErr.message);
        }
      }
    }

    return { status: 'OK', totalSynced };

  } catch (err: any) {
    return { status: 'ERROR', message: 'Node 0 is unavailable.' };
  } finally {
    if (centralConnection) await centralConnection.end();
  }
};

export const runReplicationLog = async () => {
  let centralConnection: Connection | undefined;
  let replicaConnection: Connection | undefined;

  try {
    centralConnection = await getConnection('central');
    const [logs] = await centralConnection.execute(
      "SELECT * FROM REPLICATION_LOG WHERE status = 'PENDING'"
    );

    const pendingLogs = logs as ReplicationLog[];
    if (pendingLogs.length === 0) {
      await centralConnection.end();
      return { status: 'OK', message: 'No pending replications found.' };
    }

    let totalReplicated = 0;

    for (const log of pendingLogs) {
      try {
        const targetNode = log.target_node as NodeName;
        const queryParams = JSON.parse(log.query_params);
        
        const orderData = queryParams.orderData || {}; 
        const deliveryDate = orderData.deliveryDate || new Date().toISOString(); 
        
        const year = new Date(deliveryDate).getFullYear() >= 2025 ? '2025' : '2024';

        let tableOptions: TableOptions = { ordersTable: 'Orders', itemsTable: 'OrderItems', productsTable: 'Products' };
        
        if (year === '2025' && targetNode === 'node2') {
            tableOptions = { ordersTable: 'Orders_2025Backup', itemsTable: 'OrderItems_2025Backup', productsTable: 'Products_2025Backup' };
        } else if (year === '2024' && targetNode === 'node1') {
            tableOptions = { ordersTable: 'Orders_2024Backup', itemsTable: 'OrderItems_2024Backup', productsTable: 'Products_2024Backup' };
        }
        
        const targetTable = tableOptions.ordersTable || 'Orders';

        replicaConnection = await getConnection(targetNode);

        if (log.query_text === 'REPLICATE_CREATE_ORDER') {
          const { orderNumber, orderData, totalAmount } = queryParams;
          await executeWriteTransaction(replicaConnection, orderNumber, orderData, totalAmount, tableOptions);
        }
        else if (log.query_text === 'REPLICATE_UPDATE_ORDER') {
          const { orderNumber, orderData, totalAmount } = queryParams;
          
          if (await orderExists(replicaConnection, orderNumber, targetTable)) {
             await executeUpdateTransaction(replicaConnection, orderNumber, orderData, totalAmount, tableOptions);
          } else {
             await executeWriteTransaction(replicaConnection, orderNumber, orderData, totalAmount, tableOptions);
          }
        }
        else if (log.query_text === 'REPLICATE_DELETE_ORDER') {
          const { orderNumber } = queryParams;
          await executeDeleteTransaction(replicaConnection, orderNumber, tableOptions);
        }

        await centralConnection.execute(
          "UPDATE REPLICATION_LOG SET status = 'COMPLETED' WHERE id = ?",
          [log.id]
        );

        totalReplicated++;

      } catch (jobErr: any) {
        console.warn(jobErr.message);
      } finally {
        if (replicaConnection) await replicaConnection.end();
      }
    }

    return { status: 'OK', totalReplicated };

  } catch (err: any) {
    return { status: 'ERROR', message: 'Node 0 is unavailable.' };
  } finally {
    if (centralConnection) await centralConnection.end();
  }
};

const orderExists = async (connection: Connection, orderNumber: string, tableName: string = 'Orders'): Promise<boolean> => {
  try {
    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT 1 FROM ${tableName} WHERE orderNumber = ? LIMIT 1`,
      [orderNumber]
    );
    return (rows as any[]).length > 0;
  } catch (err) {
    return false;
  }
};