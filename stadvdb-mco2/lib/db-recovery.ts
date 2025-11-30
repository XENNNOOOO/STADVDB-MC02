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

/**
 * reads the PENDING_SYNC_LOG from a local node
 */
const readPendingSyncLog = async (node: 'node1' | 'node2'): Promise<PendingSyncLog[]> => {
  let connection: Connection | undefined;
  try {
    console.log(`RECOVERY: Reading PENDING_SYNC_LOG from ${node}...`);
    connection = await getConnection(node);
    const [rows] = await connection.execute('SELECT * FROM PENDING_SYNC_LOG');
    await connection.end();
    return rows as PendingSyncLog[];
  } catch (err: any) {
    console.warn(`RECOVERY: Could not read PENDING_SYNC_LOG from ${node}. It might be down.`, err.message);
    if (connection) await connection.end();
    return [];
  }
};

/**
 * clears a completed log from a PENDING_SYNC_LOG table
 */
const clearPendingSyncLog = async (node: 'node1' | 'node2', log_id: number) => {
  let connection: Connection | undefined;
  try {
    connection = await getConnection(node);
    // Fixed Table Name & ID Column
    await connection.execute('DELETE FROM PENDING_SYNC_LOG WHERE id = ?', [log_id]);
    await connection.end();
  } catch (err: any) {
    console.error(`RECOVERY: FAILED TO CLEAR PENDING_SYNC_LOG ${log_id} from ${node}.`, err.message);
    if (connection) await connection.end();
  }
};

/**
 * processes all PENDING_SYNC_LOG logs from local nodes (1 & 2)
 * and syncs them back to the master (Node 0).
 */
export const runPendingSync = async () => {
  let centralConnection: Connection | undefined;
  try {
    centralConnection = await getConnection('central');
    console.log("RECOVERY (SYNC): Connected to Node 0.");

    // fetch all product prices first to calculate totals
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

    // check both replica nodes for pending logs
    const nodesToCheck: NodeName[] = ['node1', 'node2'];
    let totalSynced = 0;

    for (const node of nodesToCheck) {
      const logs = await readPendingSyncLog(node as 'node1' | 'node2');
      if (logs.length === 0) continue;

      console.log(`RECOVERY (SYNC): Found ${logs.length} pending jobs on ${node}.`);

      // loop through each log and write it to Node 0
      for (const log of logs) {
        try {
          const orderData = JSON.parse(log.order_data) as OrderFormData;
          const orderNumber = orderData.orderNumber;

          // recalculate the total amount using the price map
          let totalAmount = 0;
          if (orderData.items) {
            for (const item of orderData.items) {
                // Ensure productNumber is string for map lookup
                const price = productPriceMap.get(String(item.productNumber));
                if (price) {
                    totalAmount += price * item.quantity;
                }
            }
          }

          // check if this was a DELETE action
          if ((orderData as any)._action === 'DELETE') {
            console.log(`RECOVERY (SYNC): Re-running DELETE ${orderNumber} on Node 0...`);
            await executeDeleteTransaction(centralConnection, orderNumber);
          }
          // check if this was an UPDATE action (or create if exists)
          else if (await orderExists(centralConnection, orderNumber)) {
            console.log(`RECOVERY (SYNC): Re-running UPDATE ${orderNumber} on Node 0...`);
            await executeUpdateTransaction(centralConnection, orderNumber, orderData, totalAmount);
          }
          // else, it's a CREATE
          else {
            console.log(`RECOVERY (SYNC): Re-running CREATE ${orderNumber} on Node 0...`);
            await executeWriteTransaction(centralConnection, orderNumber, orderData, totalAmount);
          }

          // if successful, clear the log from the local node
          // Log ID is mapped from 'id' in DB
          await clearPendingSyncLog(node as 'node1' | 'node2', log.id);
          totalSynced++;

        } catch (jobErr: any) {
          console.error(`RECOVERY (SYNC): FAILED to process job ${log.id} from ${node}.`, jobErr.message);
          // we don't clear the log, so it will be retried next time.
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
 * processes all REPLICATION_LOG jobs from Node 0
 * and re-replicates them to the failed replica nodes (1 & 2).
 */
export const runReplicationLog = async () => {
  let centralConnection: Connection | undefined;
  let replicaConnection: Connection | undefined;

  try {
    // get all pending replication tasks from Node 0
    centralConnection = await getConnection('central');
    console.log("RECOVERY (REPLICATE): Connected to Node 0.");
    const [logs] = await centralConnection.execute(
      "SELECT * FROM REPLICATION_LOG WHERE status = 'PENDING'"
    );

    const pendingLogs = logs as ReplicationLog[];
    if (pendingLogs.length === 0) {
      await centralConnection.end(); // Close connection early
      return { status: 'OK', message: 'No pending replications found.' };
    }

    console.log(`RECOVERY (REPLICATE): Found ${pendingLogs.length} pending replication jobs.`);
    let totalReplicated = 0;

    // loop through each log and try to execute it
    for (const log of pendingLogs) {
      try {
        const targetNode = log.target_node as NodeName;

        // connect to the (now online) replica node
        replicaConnection = await getConnection(targetNode);

        // handle all 3 query types
        if (log.query_text === 'REPLICATE_CREATE_ORDER') {
          const { orderNumber, orderData, totalAmount } = JSON.parse(log.query_params);
          await executeWriteTransaction(replicaConnection, orderNumber, orderData, totalAmount);
        }
        else if (log.query_text === 'REPLICATE_UPDATE_ORDER') {
          const { orderNumber, orderData, totalAmount } = JSON.parse(log.query_params);
          await executeUpdateTransaction(replicaConnection, orderNumber, orderData, totalAmount);
        }
        else if (log.query_text === 'REPLICATE_DELETE_ORDER') {
          const { orderNumber } = JSON.parse(log.query_params);
          await executeDeleteTransaction(replicaConnection, orderNumber);
        }

        // if successful, update the log on Node 0 to 'COMPLETED'
        await centralConnection.execute(
          "UPDATE REPLICATION_LOG SET status = 'COMPLETED' WHERE id = ?",
          [log.id]
        );

        totalReplicated++;

      } catch (jobErr: any) {
        console.warn(`RECOVERY (REPLICATE): FAILED to process job ${log.id} for ${log.target_node}.`, jobErr.message);
        // we don't delete the log, it will be retried next time.
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
 * Helper function to check if an order already exists on Node 0.
 * Used by the sync recovery to decide between INSERT and UPDATE.
 */
const orderExists = async (connection: Connection, orderNumber: string): Promise<boolean> => {
  try {
    const [rows] = await connection.execute<RowDataPacket[]>(
      'SELECT 1 FROM Orders WHERE orderNumber = ? LIMIT 1',
      [orderNumber]
    );
    return (rows as any[]).length > 0;
  } catch (err) {
    return false;
  }
};