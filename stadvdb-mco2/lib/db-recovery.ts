import { getPool } from './connections';
import { executeWriteTransaction, executeUpdateTransaction, executeDeleteTransaction } from './db-write';
import { getProductsFromMaster } from './db-read'; 
import type { PoolClient } from 'pg';
import type { NodeName, OrderFormData, Product } from './types';

interface PendingSyncLog {
  log_id: number;
  origin_node: NodeName;
  delivery_date: string;
  order_data: any; // JSONB 
}

interface ReplicationLog {
  log_id: number;
  target_node: NodeName;
  query_text: string;
  query_params: any; // JSONB 
}

/**
 * reads the PENDING_SYNC log from a local node
 */
const readPendingSyncLog = async (node: 'node1' | 'node2'): Promise<PendingSyncLog[]> => {
  let client: PoolClient | undefined;
  try {
    console.log(`RECOVERY: Reading PENDING_SYNC log from ${node}...`);
    const pool = getPool(node);
    client = await pool.connect();
    const { rows } = await client.query('SELECT * FROM PENDING_SYNC');
    return rows as PendingSyncLog[];
  } catch (err: any) {
    console.warn(`RECOVERY: Could not read PENDING_SYNC log from ${node}. It might be down.`, err.message);
    return []; 
    // return empty array if node is down
  } finally {
    if (client) client.release();
  }
};

/**
 * clears A completed log from a PENDING_SYNC table
 */
const clearPendingSyncLog = async (node: 'node1' | 'node2', log_id: number) => {
  let client: PoolClient | undefined;
  try {
    const pool = getPool(node);
    client = await pool.connect();
    await client.query('DELETE FROM PENDING_SYNC WHERE log_id = $1', [log_id]);
  } catch (err: any) {
    console.error(`RECOVERY: FAILED TO CLEAR PENDING_SYNC log ${log_id} from ${node}.`, err.message);
  } finally {
    if (client) client.release();
  }
};

/**
 * processes all PENDING_SYNC logs from local nodes (1 & 2)
 * and syncs them back to the master (Node 0).
 */
export const runPendingSync = async () => {
  let centralClient: PoolClient | undefined;
  try {
    const centralPool = getPool('central');
    centralClient = await centralPool.connect();
    console.log("RECOVERY (SYNC): Connected to Node 0.");

    // fetch all product prices first to calculate totals
    let productPriceMap = new Map<string, number>();
    try {
      // uses centralConnection because we are syncing to central
      const products: Product[] = await getProductsFromMaster(centralClient); 
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
          const orderData = log.order_data as OrderFormData;
          const orderNumber = orderData.orderNumber;

          // recalculate the total amount using the price map
          let totalAmount = 0;
          for (const item of orderData.items) {
            const price = productPriceMap.get(item.productNumber);
            if (!price) {
              throw new Error(`Invalid product number ${item.productNumber} in log ${log.log_id}`);
            }
            totalAmount += price * item.quantity;
          }
          
          // check if this was a DELETE action
          if ((orderData as any)._action === 'DELETE') {
            console.log(`RECOVERY (SYNC): Re-running DELETE ${orderNumber} on Node 0...`);
            await executeDeleteTransaction(centralClient, orderNumber);
          } 
          // check if this was an UPDATE action
          else if (await orderExists(centralClient, orderNumber)) {
            console.log(`RECOVERY (SYNC): Re-running UPDATE ${orderNumber} on Node 0...`);
            await executeUpdateTransaction(centralClient, orderNumber, orderData, totalAmount);
          }
          // else, it's a CREATE
          else {
            console.log(`RECOVERY (SYNC): Re-running CREATE ${orderNumber} on Node 0...`);
            await executeWriteTransaction(centralClient, orderNumber, orderData, totalAmount);
          }

          // if successful, clear the log from the local node
          await clearPendingSyncLog(node as 'node1' | 'node2', log.log_id);
          totalSynced++;

        } catch (jobErr: any) {
          console.error(`RECOVERY (SYNC): FAILED to process job ${log.log_id} from ${node}.`, jobErr.message);
          // we don't clear the log, so it will be retried next time.
        }
      }
    }
    
    return { status: 'OK', totalSynced };

  } catch (err: any) {
    console.error("RECOVERY (SYNC): FAILED to connect to Node 0. Recovery aborted.", err.message);
    return { status: 'ERROR', message: 'Node 0 is unavailable.' };
  } finally {
    if (centralClient) centralClient.release();
  }
};

/**
 * processes all REPLICATION_LOG jobs from Node 0
 * and re-replicates them to the failed replica nodes (1 & 2).
 */
export const runReplicationLog = async () => {
  let centralClient: PoolClient | undefined;
  let replicaClient: PoolClient | undefined;
  
  try {
    // get all pending replication tasks from Node 0
    const centralPool = getPool('central');
    centralClient = await centralPool.connect();
    console.log("RECOVERY (REPLICATE): Connected to Node 0.");
    const { rows } = await centralClient.query(
      "SELECT * FROM REPLICATION_LOG WHERE status = 'pending'"
    );
    
    const pendingLogs = rows as ReplicationLog[];
    if (pendingLogs.length === 0) {
      return { status: 'OK', message: 'No pending replications found.' };
    }

    console.log(`RECOVERY (REPLICATE): Found ${pendingLogs.length} pending replication jobs.`);
    let totalReplicated = 0;

    // loop through each log and try to execute it
    for (const log of pendingLogs) {
      try {
        const targetNode = log.target_node as NodeName;
        
        // connect to the (now online) replica node
        const replicaPool = getPool(targetNode);
        replicaClient = await replicaPool.connect();
        
        // handle all 3 query types 
        if (log.query_text === 'REPLICATE_CREATE_ORDER') {
          const { orderNumber, orderData, totalAmount } = log.query_params;
          await executeWriteTransaction(replicaClient, orderNumber, orderData, totalAmount);
        } 
        else if (log.query_text === 'REPLICATE_UPDATE_ORDER') {
          const { orderNumber, orderData, totalAmount } = log.query_params;
          await executeUpdateTransaction(replicaClient, orderNumber, orderData, totalAmount);
        }
        else if (log.query_text === 'REPLICATE_DELETE_ORDER') {
          const { orderNumber } = log.query_params;
          await executeDeleteTransaction(replicaClient, orderNumber);
        }
        
        // if successful, update the log on Node 0 to 'completed
        await centralClient.query(
          "UPDATE REPLICATION_LOG SET status = 'completed' WHERE log_id = $1",
          [log.log_id]
        );
        
        totalReplicated++;

      } catch (jobErr: any) {
        console.warn(`RECOVERY (REPLICATE): FAILED to process job ${log.log_id} for ${log.target_node}.`, jobErr.message);
        // we don't delete the log, it will be retried next time.
      } finally {
        if (replicaClient) replicaClient.release();
      }
    }
    
    return { status: 'OK', totalReplicated };

  } catch (err: any) {
    console.error("RECOVERY (REPLICATE): FAILED to connect to Node 0. Recovery aborted.", err.message);
    return { status: 'ERROR', message: 'Node 0 is unavailable.' };
  } finally {
    if (centralClient) centralClient.release();
  }
};

/**
 * Helper function to check if an order already exists on Node 0.
 * Used by the sync recovery to decide between INSERT and UPDATE.
 */
const orderExists = async (client: PoolClient, orderNumber: string): Promise<boolean> => {
  try {
    const { rows } = await client.query(
      'SELECT 1 FROM ORDER_HEADER WHERE ORDER_NUMBER = $1 LIMIT 1',
      [orderNumber]
    );
    return rows.length > 0;
  } catch (err) {
    return false;
  }
};