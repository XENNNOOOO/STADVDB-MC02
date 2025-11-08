import { getConnection } from './connections';
import { executeWriteTransaction, executeUpdateTransaction, executeDeleteTransaction } from './db-write';
import { getProductsFromMaster } from './db-read'; 
import type { Connection } from 'mysql2/promise';
import type { NodeName, OrderFormData } from './types';

interface PendingSyncLog {
  log_id: number;
  origin_node: NodeName;
  delivery_date: string;
  order_data: string; // JSON string
}

interface ReplicationLog {
  log_id: number;
  target_node: NodeName;
  query_text: string;
  query_params: string; // JSON string
}

/**
 * recovery: reads the PENDING_SYNC log from a local node.
 * 'runPendingSync' to gather all failed jobs
 */
const readPendingSyncLog = async (node: 'node1' | 'node2'): Promise<PendingSyncLog[]> => {
  let connection;
  try {
    console.log(`RECOVERY: Reading PENDING_SYNC log from ${node}...`);
    connection = await getConnection(node);
    const [rows] = await connection.execute('SELECT * FROM PENDING_SYNC');
    await connection.end();
    return rows as PendingSyncLog[];
  } catch (err: any) {
    console.warn(`RECOVERY: Could not read PENDING_SYNC log from ${node}. It might be down.`, err.message);
    if (connection) await connection.end();
    return []; 
    // return empty array if node is down
  }
};

/**
 * recovery: clears a completed log from a PENDING_SYNC table
 */
const clearPendingSyncLog = async (node: 'node1' | 'node2', log_id: number) => {
  let connection;
  try {
    connection = await getConnection(node);
    await connection.execute('DELETE FROM PENDING_SYNC WHERE log_id = ?', [log_id]);
    await connection.end();
  } catch (err: any) {
    console.error(`RECOVERY: FAILED TO CLEAR PENDING_SYNC log ${log_id} from ${node}.`, err.message);
    if (connection) await connection.end();
  }
};

/**
 * recovery: processes all PENDING_SYNC logs from local nodes (1 & 2)
 * and syncs them back to the master (Node 0).
 */
export const runPendingSync = async () => {
  let centralConnection;
  try {
    centralConnection = await getConnection('central');
    console.log("RECOVERY (SYNC): Connected to Node 0.");

    // fetch all product prices first to calculate totals
    // the product table on central node.
    let productPriceMap = new Map<string, number>();
    try {
      // This uses the centralConnection we already have.
      const products = await getProductsFromMaster(centralConnection); 
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

          // re-calculate the total amount 
          let totalAmount = 0;
          for (const item of orderData.items) {
            const price = productPriceMap.get(item.productNumber) || 0;
            totalAmount += price * item.quantity;
          }
          
          // check if this was a DELETE action
          if ((orderData as any)._action === 'DELETE') {
            console.log(`RECOVERY (SYNC): Re-running DELETE ${orderNumber} on Node 0...`);
            await executeDeleteTransaction(centralConnection, orderNumber);
          } 
          // check if this was an UPDATE action
          else if (await orderExists(centralConnection, orderNumber)) {
            console.log(`RECOVERY (SYNC): Re-running UPDATE ${orderNumber} on Node 0...`);
            await executeUpdateTransaction(centralConnection, orderNumber, orderData, totalAmount, 'REPLICATED');
          }
          // else, it's a CREATE
          else {
            console.log(`RECOVERY (SYNC): Re-running CREATE ${orderNumber} on Node 0...`);
            await executeWriteTransaction(centralConnection, orderNumber, orderData, totalAmount, 'REPLICATED');
          }

          // if successful, clear the log from the local node
          await clearPendingSyncLog(node as 'node1' | 'node2', log.log_id);
          totalSynced++;

        } catch (jobErr: any) {
          console.error(`RECOVERY (SYNC): FAILED to process job ${log.log_id} from ${node}.`, jobErr.message);
          // We don't clear the log, so it will be retried next time.
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
 * recovery: processes all REPLICATION_LOG jobs from Node 0
 * and re-replicates them to the failed replica nodes (1 & 2)
*/
export const runReplicationLog = async () => {
  let centralConnection;
  let replicaConnection;
  
  try {
    // get all pending replication tasks from Node 0
    centralConnection = await getConnection('central');
    console.log("RECOVERY (REPLICATE): Connected to Node 0.");
    const [logs] = await centralConnection.execute(
      "SELECT * FROM REPLICATION_LOG WHERE status = 'pending'"
    );
    
    const pendingLogs = logs as ReplicationLog[];
    if (pendingLogs.length === 0) {
      await centralConnection.end();
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
          await executeWriteTransaction(replicaConnection, orderNumber, orderData, totalAmount, 'REPLICATED');
        } 
        else if (log.query_text === 'REPLICATE_UPDATE_ORDER') {
          const { orderNumber, orderData, totalAmount } = JSON.parse(log.query_params);
          await executeUpdateTransaction(replicaConnection, orderNumber, orderData, totalAmount, 'REPLICATED');
        }
        else if (log.query_text === 'REPLICATE_DELETE_ORDER') {
          const { orderNumber } = JSON.parse(log.query_params);
          await executeDeleteTransaction(replicaConnection, orderNumber);
        }
        
        // if successful, update the log on Node 0 to 'completed'
        await centralConnection.execute(
          "UPDATE REPLICATION_LOG SET status = 'completed' WHERE log_id = ?",
          [log.log_id]
        );
        
        totalReplicated++;

      } catch (jobErr: any) {
        console.warn(`RECOVERY (REPLICATE): FAILED to process job ${log.log_id} for ${log.target_node}.`, jobErr.message);
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
 * Helper function to check if an order already exists on Node 0
 * Used by the sync recovery to decide between INSERT and UPDATE
 */
const orderExists = async (connection: Connection, orderNumber: string): Promise<boolean> => {
  try {
    const [rows] = await connection.execute(
      'SELECT 1 FROM ORDER_HEADER WHERE ORDER_NUMBER = ? LIMIT 1',
      [orderNumber]
    );
    return (rows as any[]).length > 0;
  } catch (err) {
    return false;
  }
};