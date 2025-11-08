import mysql from 'mysql2/promise';

// Connection Configs

// TODO: Update with the actual DB credentials
// Node 0 (Server 0) - Master, All Data
const node0_Central_Config: mysql.ConnectionOptions = {
  host: '127.0.0.1', 
  port: 3306,
  user: 'webapp_user',
  password: 'password',
  database: 'go_sales_all', 
  connectTimeout: 3000, 
};

// TODO: Update with the actual DB credentials
// Node 1 (Server 1) - 2025 (Primary) + 2024 (Backup)
const node1_Config: mysql.ConnectionOptions = {
  host: '192.168.1.11', 
  port: 3306,
  user: 'webapp_user',
  password: 'password',
  database: 'go_sales_node1', 
  connectTimeout: 3000,
};

// Node 2 (Server 2) - 2024 (Primary) + 2025 (Backup)
const node2_Config: mysql.ConnectionOptions = {
  host: '192.168.1.12', 
  port: 3306,
  user: 'webapp_user',
  password: 'password',
  database: 'go_sales_node2', 
  connectTimeout: 3000,
};

/**
 * Creates a single, one-time connection to the specified node.
 * We use createConnection (not a pool) to make it possible
 * to catch and demonstrate connection failures for MCO2.
 */
export const getConnection = (node: 'central' | 'node1' | 'node2') => {
  if (node === 'node1') {
    return mysql.createConnection(node1_Config);
  }
  if (node === 'node2') {
    return mysql.createConnection(node2_Config);
  }
  return mysql.createConnection(node0_Central_Config);
};