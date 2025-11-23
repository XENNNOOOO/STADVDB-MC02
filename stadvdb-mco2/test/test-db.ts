// npx tsx test/test-db.ts

import mysql from 'mysql2/promise';

// Simulation Flags
let SIMULATE_NODE0_DOWN = false;
let SIMULATE_NODE1_DOWN = false;

// Mock Data
const MOCK_PRODUCTS = [
  { PRODUCT_NUMBER: 'P-101', PRODUCT_NAME: 'Tent', UNIT_PRICE: 100 },
  { PRODUCT_NUMBER: 'P-102', PRODUCT_NAME: 'Backpack', UNIT_PRICE: 50 },
  { PRODUCT_NUMBER: 'P-103', PRODUCT_NAME: 'Filter', UNIT_PRICE: 25 },
];

// Override createConnection
(mysql as any).createConnection = async (config: any) => {
  const dbName = config.database;

  if (dbName === 'go_sales_all' && SIMULATE_NODE0_DOWN) {
    const err: any = new Error('connect ECONNREFUSED 127.0.0.1:3306');
    err.code = 'ECONNREFUSED';
    throw err;
  }
  if (dbName === 'go_sales_node1' && SIMULATE_NODE1_DOWN) {
    const err: any = new Error('connect ECONNREFUSED 192.168.1.11:3306');
    err.code = 'ECONNREFUSED';
    throw err;
  }

  // return Mock Connection
  return {
    execute: async (query: string, params: any[]) => {
      const q = query.trim().toUpperCase();

      // Handle Product Lookup (for calculateTotalAmount)
      if (q.includes('FROM PRODUCT')) {
        return [ MOCK_PRODUCTS, [] ];
      }
      // Handle Order Lookup (for getOrderById)
      if (q.includes('FROM ORDER_HEADER') && q.includes('SELECT')) {
        // Return a dummy order if found
        if (q.includes('WHERE ORDER_NUMBER = ?')) return [ [{ ORDER_NUMBER: params[0] }], [] ];
        return [ [], [] ];
      }
      // Handle Locking Checks (SELECT 1 ... FOR UPDATE)
      if (q.includes('SELECT 1 FROM ORDER_HEADER')) {
        return [ [{ 1: 1 }], [] ]; // Simulate row exists
      }

      // Default Write Success
      return [ { affectedRows: 1 }, [] ];
    },
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    end: async () => {},
  };
};


import { createOrder, updateOrder, deleteOrder } from '../lib/db-write';
import { getOrderById } from '../lib/db-read';
import { runPendingSync, runReplicationLog } from '../lib/db-recovery';
import type { OrderFormData } from '../lib/types';

const order2025: OrderFormData = {
  orderNumber: 'ORD-2025-001',
  customerNumber: 'CUST-001',
  deliveryDate: '2025-12-25',
  items: [{ productNumber: 'P-101', quantity: 2 }]
};

const order2024: OrderFormData = {
  orderNumber: 'ORD-2024-001',
  customerNumber: 'CUST-002',
  deliveryDate: '2024-11-15',
  items: [{ productNumber: 'P-103', quantity: 5 }]
};

async function runTests() {
  console.log("==================================================");
  console.log("   Orders Route - MOCK TEST");
  console.log("==================================================\n");

  try {
    console.log("\nTEST 1: ALL NODES ONLINE");
    
    console.log("1. Creating 2025 Order...");
    // Expected: Write Node 0 (Success) -> Replicate Node 1 (Success)
    const res1 = await createOrder(order2025);
    console.log(`   > RESULT: ${res1}`);

    console.log("2. Creating 2024 Order...");
    // Expected: Write Node 0 (Success) -> Replicate Node 2 (Success)
    const res2 = await createOrder(order2024);
    console.log(`   > RESULT: ${res2}`);

    console.log("3. Reading 2025 Order...");
    // Expected: Try Node 1 (Success)
    const read1 = await getOrderById(order2025.orderNumber, '2025');
    console.log(`   > RESULT: ${read1 ? 'Found' : 'Not Found'} (Read from Node 1)`);

    console.log("4. Updating 2025 Order...");
    // Expected: Update Node 0 (Success) -> Replicate Node 1 (Success)
    const resUpdate = await updateOrder(order2025.orderNumber, { ...order2025, customerNumber: 'CUST-NEW' });
    console.log(`   > RESULT: ${resUpdate}`);

    console.log("5. Deleting 2025 Order...");
    // Expected: Delete Node 0 (Success) -> Replicate Node 1 (Success)
    const resDelete = await deleteOrder(order2025.orderNumber, '2025');
    console.log(`   > RESULT: ${resDelete}`);



    console.log("\nTEST 2: NODE 0 (CENTRAL) DOWN");
    SIMULATE_NODE0_DOWN = true; // KILL NODE 0
    
    console.log("1. Creating 2025 Order (Failover Expected)...");
    // Expected: Node 0 Fail -> Node 1 Success -> Log Pending
    try {
      const resFailover = await createOrder({ ...order2025, orderNumber: 'ORD-2025-FAILOVER' });
      console.log(`   > RESULT: ${resFailover}`);
    } catch (e: any) { console.error(e.message); }

    console.log("2. Updating 2025 Order (Failover Expected)...");
    // Expected: Node 0 Fail -> Node 1 Success -> Log Pending
    try {
      const resUpdateFailover = await updateOrder(order2025.orderNumber, { ...order2025, customerNumber: 'CUST-FAIL' });
      console.log(`   > RESULT: ${resUpdateFailover}`);
    } catch (e: any) { console.error(e.message); }



    console.log("\nTEST 3: RECOVERY (NODE 0 COMES BACK)");
    SIMULATE_NODE0_DOWN = false; // START NODE 0
    
    console.log("1. Running Pending Sync Script...");
    // Expected: Read from Node 1 Log -> Write to Node 0
    const syncRes = await runPendingSync();
    console.log(`   > RESULT: Status=${syncRes.status}, Synced=${syncRes.totalSynced || 0}`);



    console.log("\nTEST 4: NODE 1 (REPLICA) DOWN");
    SIMULATE_NODE1_DOWN = true; // KILL NODE 1
    
    console.log("1. Creating 2025 Order (Replication Failure Expected)...");
    // Expected: Write Node 0 (Success) -> Replicate Node 1 (Fail) -> Log to RepLog on Node 0
    try {
      const resRepFail = await createOrder({ ...order2025, orderNumber: 'ORD-2025-REPFAIL' });
      console.log(`   > RESULT: ${resRepFail} (Success on Master, failed on Replica)`);
    } catch (e: any) { console.error(e.message); }

    console.log("2. Running Replication Log Recovery...");
    // Expected: Should fail because Node 1 is still down, but function should run
    const repResFail = await runReplicationLog();
    console.log(`   > RESULT: ${repResFail.status} (This is expected to retry next time)`);

    

    console.log("\n[CLEANUP] Resetting simulation flags...");
    SIMULATE_NODE1_DOWN = false;

  } catch (error: any) {
    console.error("\n!!! TEST SCRIPT CRASHED !!!");
    console.error(error);
  }
  process.exit(0);
}

runTests();