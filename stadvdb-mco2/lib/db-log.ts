import { getConnection } from './connections';
import type { ReplicationLogData, PendingSyncData, NodeName } from './types';
import type { Connection } from 'mysql2/promise';

/**
 * Replication Failure Log
 * Called when a write to Node 0 SUCCEEDS, but the copy to a replica FAILS.
 * This function writes the *failed task* to the `REPLICATION_LOG` table on **Node 0**.
 */
export const logReplicationFailure = async (logData: ReplicationLogData) => {
  let connection: Connection | undefined;
  try {
    // log goes to the central node.
    connection = await getConnection('central');
    
    await connection.execute(
      `INSERT INTO REPLICATION_LOG (target_node, status, query_text, query_params)
       VALUES (?, ?, ?, ?)`,
      [logData.target_node, 'pending', logData.query_text, logData.query_params]
    );
    console.log(`RECOVERY: Logged replication failure for ${logData.target_node} to Node 0.`);
  } catch (err: any) {
    // If Node 0 is ALSO down, we have a  failure.
    console.error(`CRITICAL: FAILED TO LOG REPLICATION FAILURE. ${err.message}`);
  } finally {
    if (connection) await connection.end();
  }
};

/**
 * Pending Sync Queue (Failover)
 * Called when a write to Node 0 FAILS, and the failover write to a
 * local node (1 or 2) SUCCEEDS.
 * writes the successful failover to the `PENDING_SYNC` table
 * on the local node that succeeded.
 */
export const logPendingSync = async (node: 'node1' | 'node2', logData: PendingSyncData) => {
  let connection: Connection | undefined;
  try {
    // log goes to the local node that handled the failover.
    connection = await getConnection(node);
    
    await connection.execute(
      `INSERT INTO PENDING_SYNC (origin_node, delivery_date, order_data)
       VALUES (?, ?, ?)`,
      [logData.origin_node, logData.delivery_date, logData.order_data]
    );
    console.log(`RECOVERY: Logged pending sync on ${node}.`);
  } catch (err: any) {
    // This should not happen (we just successfully wrote here), but good to have.
    console.error(`CRITICAL: FAILED TO LOG PENDING SYNC ON ${node}. ${err.message}`);
  } finally {
    if (connection) await connection.end();
  }
};

/**
 * Emergency Failover (e.g., Nodes 0 & 1 are down)
 * Called when a write to Node 0 AND Node 1 FAILS.
 * writes the pending task to the *last available node*.
 */
export const logEmergencyPendingSync = async (emergencyNode: 'node1' | 'node2', logData: PendingSyncData) => {
  let connection: Connection | undefined;
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
    // All 3 nodes are down.
    console.error(`CRITICAL: FAILED TO LOG EMERGENCY SYNC. All nodes are down. ${err.message}`);
    throw new Error("All database nodes are unavailable. Write failed.");
  } finally {
    if (connection) await connection.end();
  }
};