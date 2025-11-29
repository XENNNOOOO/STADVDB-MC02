import mysql from 'mysql2/promise';
import type { NodeName } from './types';

const baseConfig = {
  user: process.env.DB_USER || 'app_user',
  password: process.env.DB_PASSWORD, 
  connectTimeout: 5000,
  ssl: { rejectUnauthorized: false }
};

// Node 0 
const node0_Central_Config: mysql.ConnectionOptions = {
  ...baseConfig,
  host: process.env.NODE0_HOST,
  port: Number(process.env.NODE0_PORT),
  database: process.env.NODE0_DB,
};

// Node 1
const node1_Config: mysql.ConnectionOptions = {
  ...baseConfig,
  host: process.env.NODE1_HOST,
  port: Number(process.env.NODE1_PORT),
  database: process.env.NODE1_DB,
};

// Node 2
const node2_Config: mysql.ConnectionOptions = {
  ...baseConfig,
  host: process.env.NODE2_HOST,
  port: Number(process.env.NODE2_PORT),
  database: process.env.NODE2_DB,
};

export const getConnection = async (node: NodeName) => {

  if (node === 'node1') {
    return mysql.createConnection(node1_Config);
  }
  if (node === 'node2') {
    return mysql.createConnection(node2_Config);
  }
  return mysql.createConnection(node0_Central_Config);
};