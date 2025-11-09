import { getPool } from './connections';
import type { ReplicationLogData, PendingSyncData } from './types';
import type { PoolClient } from 'pg';

/**
 * Replication Failure Log
 * called when a write to Node 0 Succeeds but the copy to a replica Fails.
 * writes the failed task to the REPLICATION_LOG table on Node 0.
 */
export const logReplicationFailure = async (logData: ReplicationLogData) => {
  let client: PoolClient | undefined;
  try {
    // this log always goes to the central node.
    const pool = getPool('central');
    client = await pool.connect();
    
    // Use $1, $2, $3... for PostgreSQL
    await client.query(
      `INSERT INTO REPLICATION_LOG (target_node, status, query_text, query_params)
       VALUES ($1, $2, $3, $4)`,
      [logData.target_node, 'pending', logData.query_text, logData.query_params]
    );
    console.log(`RECOVERY: Logged replication failure for ${logData.target_node} to Node 0.`);
  } catch (err: any) {
    // if node 0 is also down, we have a catastrophic failure.
    console.error(`CRITICAL: FAILED TO LOG REPLICATION FAILURE. ${err.message}`);
  } finally {
    if (client) client.release();
  }
};

/**
 * Pending Sync Queue (Failover)
 * called when a write to Node 0 fails, and the failover write to a local node (1 or 2) SUCCEEDS.
 * writes the successful failover to the `PENDING_SYNC` table
 * on the local node that succeeded
 */
export const logPendingSync = async (node: 'node1' | 'node2', logData: PendingSyncData) => {
  let client: PoolClient | undefined;
  try {
    // this log goes to the local node that handled the failover.
    const pool = getPool(node);
    client = await pool.connect();
    
    // Use $1, $2, $3... for PostgreSQL
    // NOTE: in postgreSQL, order_data will be stored as JSONB
    await client.query(
      `INSERT INTO PENDING_SYNC (origin_node, delivery_date, order_data)
       VALUES ($1, $2, $3)`,
      [logData.origin_node, logData.delivery_date, logData.order_data]
    );
    console.log(`RECOVERY: Logged pending sync on ${node}.`);
  } catch (err: any) {
    // prolly not gonna happen
    console.error(`CRITICAL: FAILED TO LOG PENDING SYNC ON ${node}. ${err.message}`);
  } finally {
    if (client) client.release();
  }
};

/**
 * Emergency Failover (Nodes 0 & 1 are down, Nodes 0 and 2 are down)
 * called when a write to Node 0 AND Node 1 FAILS | Node 0 AND Node 2 FAILS.
 * writes the pending task to the last available node.
 */
export const logEmergencyPendingSync = async (emergencyNode: 'node1' | 'node2', logData: PendingSyncData) => {
  let client: PoolClient | undefined;
  try {
    // log goes to the only node that is still online.
    const pool = getPool(emergencyNode);
    client = await pool.connect();
    
    // Use $1, $2, $3... for PostgreSQL
    await client.query(
      `INSERT INTO PENDING_SYNC (origin_node, delivery_date, order_data)
       VALUES ($1, $2, $3)`,
      [logData.origin_node, logData.delivery_date, logData.order_data]
    );
    console.log(`RECOVERY: Logged emergency pending sync on ${emergencyNode}.`);
  } catch (err: any) {
    // all 3 nodes are down: bruh ure dead
    console.error(`CRITICAL: FAILED TO LOG EMERGENCY SYNC. All nodes are down. ${err.message}`);
    throw new Error("All database nodes are unavailable. Write failed.");
  } finally {
    if (client) client.release();
  }
};