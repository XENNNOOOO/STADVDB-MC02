import { getConnection } from './connections';
import { executeWriteTransaction, executeUpdateTransaction, executeDeleteTransaction } from './db-write';
import { getAllProducts } from './db-read'; 
import type { Connection, RowDataPacket } from 'mysql2/promise';
import type { NodeName, OrderFormData, Product } from './types';

/**
 * AUTOMATED RECOVERY SYSTEM - EXECUTION MODULE
 */

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

// Interface for dynamic table selection
interface TableOptions {
  ordersTable?: string;
  itemsTable?: string;
  productsTable?: string;
}

/**
 * WRAPPER FOR API COMPATIBILITY
 */
export const runRecovery = async () => {
  const results = {
    masterToSlaves: 0,
    slavesToMaster: 0,
    errors: [] as string[]
  };

  try {
    // 1. Recover Slaves -> Master (Sync)
    const syncResult = await runPendingSync();
    if (syncResult.status === 'OK') {
        results.slavesToMaster = syncResult.totalSynced || 0;
    } else {
        results.errors.push(syncResult.message || 'Sync failed');
    }

    // 2. Recover Master -> Slaves (Replicate)
    const replResult = await runReplicationLog();
    if (replResult.status === 'OK') {
        results.masterToSlaves = replResult.totalReplicated || 0;
    } else {
        results.errors.push(replResult.message || 'Replication failed');
    }
    
  } catch (err: any) {
    console.error("CRITICAL RECOVERY ERROR:", err.message);
    results.errors.push(err.message);
  }

  return results;
};

const readPendingSyncLog = async (node: 'node1' | 'node2'): Promise<PendingSyncLog[]> => {
  let connection: Connection | undefined;
  try {
    console.log(`RECOVERY: Reading PENDING_SYNC from ${node}...`);
    connection = await getConnection(node);
    const [rows] = await connection.execute('SELECT * FROM PENDING_SYNC WHERE status = "PENDING"');
    await connection.end();
    return rows as PendingSyncLog[];
  } catch (err: any) {
    console.warn(`RECOVERY: Could not read PENDING_SYNC from ${node}. It might be down.`, err.message);
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
    console.error(`RECOVERY: FAILED TO MARK PENDING_SYNC ${log_id} COMPLETED from ${node}.`, err.message);
    if (connection) await connection.end();
  }
};

/**
 * SLAVE -> MASTER SYNC
 * Always writes to 'Orders' table on Central Node (Node 0)
 */
export const runPendingSync = async () => {
  let centralConnection: Connection | undefined;
  try {
    centralConnection = await getConnection('central');
    console.log("RECOVERY (SYNC): Connected to Node 0.");

    let productPriceMap = new Map<string, number>();
    try {
      const products: Product[] = await getAllProducts();
      products.forEach(p => {
        productPriceMap.set(p.PRODUCT_NUMBER, p.UNIT_PRICE);
      });
      console.log(`RECOVERY (SYNC): Product price map loaded with ${products.length} items.`);
    } catch (err: any) {
      throw new Error(`Could not load product prices. Recovery aborted: ${err.message}`);
    }

    const nodesToCheck: NodeName[] = ['node1', 'node2'];
    let totalSynced = 0;

    for (const node of nodesToCheck) {
      const logs = await readPendingSyncLog(node as 'node1' | 'node2');
      if (logs.length === 0) continue;

      console.log(`RECOVERY (SYNC): Found ${logs.length} pending jobs on ${node}.`);

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
            console.log(`RECOVERY (SYNC): Re-running DELETE ${orderNumber} on Node 0...`);
            await executeDeleteTransaction(centralConnection, orderNumber);
          }
          // Node 0 always uses the standard 'Orders' table, so we check that
          else if (await orderExists(centralConnection, orderNumber, 'Orders')) {
            console.log(`RECOVERY (SYNC): Re-running UPDATE ${orderNumber} on Node 0...`);
            await executeUpdateTransaction(centralConnection, orderNumber, orderData, totalAmount);
          }
          else {
            console.log(`RECOVERY (SYNC): Re-running CREATE ${orderNumber} on Node 0...`);
            await executeWriteTransaction(centralConnection, orderNumber, orderData, totalAmount);
          }

          await markPendingSyncComplete(node as 'node1' | 'node2', log.id);
          totalSynced++;

        } catch (jobErr: any) {
          console.error(`RECOVERY (SYNC): FAILED to process job ${log.id} from ${node}.`, jobErr.message);
        }
      }
    }

    return { status: 'OK', totalSynced };

  } catch (err: any) {
    console.error("RECOVERY (SYNC): FAILED to connect to Node 0. Recovery aborted.", err.message);
    return { status: 'ERROR', message: 'Node 0 is unavailable.' };
  } finally {
    if (centralConnection) await centralConnection.end();
  }
};

/**
 * MASTER -> SLAVE REPLICATION
 * Must intelligently select Primary vs Backup tables
 */
export const runReplicationLog = async () => {
  let centralConnection: Connection | undefined;
  let replicaConnection: Connection | undefined;

  try {
    centralConnection = await getConnection('central');
    console.log("RECOVERY (REPLICATE): Connected to Node 0.");
    const [logs] = await centralConnection.execute(
      "SELECT * FROM REPLICATION_LOG WHERE status = 'PENDING'"
    );

    const pendingLogs = logs as ReplicationLog[];
    if (pendingLogs.length === 0) {
      await centralConnection.end();
      return { status: 'OK', message: 'No pending replications found.' };
    }

    console.log(`RECOVERY (REPLICATE): Found ${pendingLogs.length} pending replication jobs.`);
    let totalReplicated = 0;

    for (const log of pendingLogs) {
      try {
        const targetNode = log.target_node as NodeName;
        const queryParams = JSON.parse(log.query_params);
        
        // Extract deliveryDate to determine Year
        // orderData is usually nested inside query_params for create/update
        const orderData = queryParams.orderData || {}; 
        const deliveryDate = orderData.deliveryDate || new Date().toISOString(); 
        
        const year = new Date(deliveryDate).getFullYear() >= 2025 ? '2025' : '2024';

        // --- DYNAMIC TABLE LOGIC ---
        // Determine if we are writing to Primary or Backup tables on the target node
        let tableOptions: TableOptions = { ordersTable: 'Orders', itemsTable: 'OrderItems', productsTable: 'Products' };
        
        if (year === '2025' && targetNode === 'node2') {
            // 2025 data on Node 2 -> Backup Tables
            tableOptions = { ordersTable: 'Orders_2025Backup', itemsTable: 'OrderItems_2025Backup', productsTable: 'Products_2025Backup' };
        } else if (year === '2024' && targetNode === 'node1') {
            // 2024 data on Node 1 -> Backup Tables
            tableOptions = { ordersTable: 'Orders_2024Backup', itemsTable: 'OrderItems_2024Backup', productsTable: 'Products_2024Backup' };
        }
        
        const targetTable = tableOptions.ordersTable || 'Orders';
        console.log(`RECOVERY (REPLICATE): Target ${targetNode} [${year}] -> Using table: ${targetTable}`);

        replicaConnection = await getConnection(targetNode);

        if (log.query_text === 'REPLICATE_CREATE_ORDER') {
          const { orderNumber, orderData, totalAmount } = queryParams;
          await executeWriteTransaction(replicaConnection, orderNumber, orderData, totalAmount, tableOptions);
        }
        else if (log.query_text === 'REPLICATE_UPDATE_ORDER') {
          const { orderNumber, orderData, totalAmount } = queryParams;
          
          // Check existence in the CORRECT table
          if (await orderExists(replicaConnection, orderNumber, targetTable)) {
             await executeUpdateTransaction(replicaConnection, orderNumber, orderData, totalAmount, tableOptions);
          } else {
             console.warn(`RECOVERY (REPLICATE): Order ${orderNumber} missing in ${targetTable} on ${targetNode}. Converting UPDATE to CREATE.`);
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
        console.warn(`RECOVERY (REPLICATE): FAILED to process job ${log.id} for ${log.target_node}.`, jobErr.message);
      } finally {
        if (replicaConnection) await replicaConnection.end();
      }
    }

    return { status: 'OK', totalReplicated };

  } catch (err: any) {
    console.error("RECOVERY (REPLICATE): FAILED to connect to Node 0. Recovery aborted.", err.message);
    return { status: 'ERROR', message: 'Node 0 is unavailable.' };
  } finally {
    if (centralConnection) await centralConnection.end();
  }
};

/**
 * Checks if an order exists in a specific table.
 */
const orderExists = async (connection: Connection, orderNumber: string, tableName: string = 'Orders'): Promise<boolean> => {
  try {
    // Dynamic table name injection
    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT 1 FROM ${tableName} WHERE orderNumber = ? LIMIT 1`,
      [orderNumber]
    );
    return (rows as any[]).length > 0;
  } catch (err) {
    return false;
  }
};