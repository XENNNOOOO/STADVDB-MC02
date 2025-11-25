import { getConnection } from './connections';
import type { ReplicationLogData, PendingSyncData, NodeName } from './types';
import type { Connection } from 'mysql2/promise';

/**
 * AUTOMATED RECOVERY SYSTEM - LOGGING MODULE
 *
 * This module handles the automatic logging of failed operations that need recovery.
 * The recovery process is fully automated and occurs when nodes come back online:
 *
 * AUTOMATIC EXECUTION FLOW:
 * 1. When a node fails, operations are logged here automatically
 * 2. When the failed node comes back online, the system detects this automatically
 * 3. Recovery operations are triggered automatically (no manual intervention)
 * 4. The logged operations are re-executed automatically
 *
 * The automation is handled by:
 * - Node health monitoring (continuous background checks)
 * - Automatic failover detection
 * - Auto-triggered recovery scripts when nodes recover
 *
 * This file only handles the LOGGING part - the actual recovery execution
 * is handled by db-recovery.ts when nodes come back online.
 */

/**
 * Replication Failure Log
 * Called when a write to Node 0 SUCCEEDS, but the copy to a replica FAILS.
 * This function writes the *failed task* to the `REPLICATION_LOG` table on **Node 0**.
 *
 * AUTOMATION: When the target replica node comes back online, the system will
 * automatically detect this and re-execute all logged operations from REPLICATION_LOG.
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
 *
 * AUTOMATION: When Node 0 (central) comes back online, the system will
 * automatically detect this and synchronize all logged operations from
 * PENDING_SYNC tables on all replica nodes back to the central node.
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