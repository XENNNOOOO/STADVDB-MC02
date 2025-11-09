import { Pool, PoolConfig } from 'pg';

// Connection Configs

// TODO: Update with the actual DB credentials @Luwes6174 @leebrien
// Node 0 (Server 0) - Master, All Data
const node0_Central_Config: PoolConfig = {
  host: '127.0.0.1', 
  port: 5432,     
  user: 'webapp_user',
  password: 'password',
  database: 'go_sales_all', 
  connectionTimeoutMillis: 3000, 
  max: 10, 
  idleTimeoutMillis: 30000, // How long a client is allowed to remain idle
};

// TODO: Update with the actual DB credentials
// Node 1 (Server 1) - 2025 (Primary) + 2024 (Backup)
const node1_Config: PoolConfig = {
  host: '192.168.1.11', 
  port: 5432, 
  user: 'webapp_user',
  password: 'password',
  database: 'go_sales_node1', 
  connectionTimeoutMillis: 3000,
  max: 10,
  idleTimeoutMillis: 30000,
};

// Node 2 (Server 2) - 2024 (Primary) + 2025 (Backup)
const node2_Config: PoolConfig = {
  host: '192.168.1.12', 
  port: 5432,
  user: 'webapp_user',
  password: 'password',
  database: 'go_sales_node2', 
  connectionTimeoutMillis: 3000,
  max: 10,
  idleTimeoutMillis: 30000,
};

// Connection Pools 
// get a "client" from the pool for each transaction.
const pool0 = new Pool(node0_Central_Config);
const pool1 = new Pool(node1_Config);
const pool2 = new Pool(node2_Config);

// log any pool errors
pool0.on('error', (err) => console.error('Node 0 Pool Error:', err.message));
pool1.on('error', (err) => console.error('Node 1 Pool Error:', err.message));
pool2.on('error', (err) => console.error('Node 2 Pool Error:', err.message));


/**
 * Returns the connection POOL for the specified node.
 * The calling function will then get a CLIENT from this pool
 * by calling `pool.connect()`.
 */
export const getPool = (node: 'central' | 'node1' | 'node2'): Pool => {
  if (node === 'node1') {
    return pool1;
  }
  if (node === 'node2') {
    return pool2;
  }
  return pool0;
};