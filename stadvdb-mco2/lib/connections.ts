import mysql from 'mysql2/promise';
import type { NodeName } from './types';

// Connection Configs

// Node 0 (Server 0) - Master, All Data
const node0_Central_Config: mysql.ConnectionOptions = {
  host: '10.2.14.135', // localhost via SSH tunnel
  port: 3306, // tunneled from Server0
  user: 'app_user',
  password: 'xACmJk5u4QNK3ESHvW7XrpFg@123',
  database: 'node0',
  connectTimeout: 3000,
};

// Node 1 (Server 1) - 2025 (Primary) + 2024 (Backup)
const node1_Config: mysql.ConnectionOptions = {
  host: '10.2.14.136', // localhost via SSH tunnel
  port: 3307, // tunneled from Server1
  user: 'app_user',
  password: 'xACmJk5u4QNK3ESHvW7XrpFg@123',
  database: 'node1',
  connectTimeout: 3000,
};

// Node 2 (Server 2) - 2024 (Primary) + 2025 (Backup)
const node2_Config: mysql.ConnectionOptions = {
  host: '10.2.14.137', // localhost via SSH tunnel
  port: 3308, // tunneled from Server2
  user: 'app_user',
  password: 'xACmJk5u4QNK3ESHvW7XrpFg@123',
  database: 'node2',
  connectTimeout: 3000,
};

/**
 * Creates a single, one-time connection to the specified node.
 * We use createConnection (not a pool) to make it possible
 * to catch and demonstrate connection failures for MCO2.
 */
export const getConnection = (node: NodeName) => {
  if (node === 'node1') {
    return mysql.createConnection(node1_Config);
  }
  if (node === 'node2') {
    return mysql.createConnection(node2_Config);
  }
  return mysql.createConnection(node0_Central_Config);
};