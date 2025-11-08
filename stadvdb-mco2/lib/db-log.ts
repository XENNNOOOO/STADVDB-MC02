import { getConnection } from './connections';
import type { ReplicationLogData, PendingSyncData } from './types';

/**
 * Replication Failure Log
 * called when a write to Node 0 Succeeds but the copy to a replica Fails.
 * this function writes the failed task to the REPLICATION_LOG table on Node 0.
 */
export const logReplicationFailure = async (logData: ReplicationLogData) => {
  let connection;
  try {
    // this log always goes to the central node.
    connection = await getConnection('central');
    await connection.execute(
      `INSERT INTO REPLICATION_LOG (target_node, status, query_text, query_params)
       VALUES (?, ?, ?, ?)`,
      [logData.target_node, 'pending', logData.query_text, logData.query_params]
    );
    console.log(`RECOVERY: Logged replication failure for ${logData.target_node} to Node 0.`);
  } catch (err: any) {
    // if node 0 is also down, we have a catastrophic failure.
    console.error(`CRITICAL: FAILED TO LOG REPLICATION FAILURE. ${err.message}`);
  } finally {
    if (connection) await connection.end();
  }
};

/**
 * Pending Sync Queue (Failover)
 * called when a write to Node 0 fails, and the failover write to a
 * local node (1 or 2) SUCCEEDS.
 * This function writes the successful failover to the `PENDING_SYNC` table
 * on the local node that succeeded
 */
export const logPendingSync = async (node: 'node1' | 'node2', logData: PendingSyncData) => {
  let connection;
  try {
    // this log goes to the local node that handled the failover.
    connection = await getConnection(node);
    await connection.execute(
      `INSERT INTO PENDING_SYNC (origin_node, delivery_date, order_data)
       VALUES (?, ?, ?)`,
      [logData.origin_node, logData.delivery_date, logData.order_data]
    );
    console.log(`RECOVERY: Logged pending sync on ${node}.`);
  } catch (err: any) {
    // prolly not gonna happen
    console.error(`CRITICAL: FAILED TO LOG PENDING SYNC ON ${node}. ${err.message}`);
  } finally {
    if (connection) await connection.end();
  }
};

/**
 * Emergency Failover (Nodes 0 & 1 are down, Nodes 0 and 2 are down)
 * called when a write to Node 0 AND Node 1 FAILS | Node 0 AND Node 2 FAILS.
 * writes the pending task to the last available node.
 */
export const logEmergencyPendingSync = async (emergencyNode: 'node1' | 'node2', logData: PendingSyncData) => {
  let connection;
  try {
    // log goes to the only node that is still online.
    connection = await getConnection(emergencyNode);
    await connection.execute(
      `INSERT INTO PENDING_SYNC (origin_node, delivery_date, order_data)
       VALUES (?, ?, ?)`,
      [logData.origin_node, logData.delivery_date, logData.order_data]
    );
    console.log(`RECOVERY: Logged emergency pending sync on ${emergencyNode}.`);
  } catch (err: any) {
    // all 3 nodes are down: bruh ure dead
    console.error(`CRITICAL: FAILED TO LOG EMERGENCY SYNC. All nodes are down. ${err.message}`);
    throw new Error("All database nodes are unavailable. Write failed.");
  } finally {
    if (connection) await connection.end();
  }
};