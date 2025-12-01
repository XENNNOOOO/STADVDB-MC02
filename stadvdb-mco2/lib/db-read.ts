import { getConnection } from './connections';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import type { Order, Product, NodeName } from './types';

const parseOrderItems = (rows: any[]): Order[] => {
  return rows.map(row => {
    let parsedItems = [];
    try {
      if (typeof row.items === 'string') {
        parsedItems = JSON.parse(row.items);
      } else if (Array.isArray(row.items)) {
        parsedItems = row.items;
      }
    } catch (e) {
      parsedItems = [];
    }

    const cleanItems = parsedItems.filter((i: any) => i && i.productName);

    return {
      ORDER_NUMBER: row.ORDER_NUMBER,
      CUSTOMER_NUMBER: row.CUSTOMER_NUMBER,
      ORDER_DATE: row.ORDER_DATE,
      DELIVERY_DATE: row.DELIVERY_DATE,
      DELIVERY_RIDER_ID: row.DELIVERY_RIDER_ID,
      TOTAL_AMOUNT: row.TOTAL_AMOUNT || 0,
      items: cleanItems 
    } as unknown as Order;
  });
};

const fetchOrdersFromNode = async (
  node: NodeName, 
  ordersTable: string, 
  itemsTable: string,
  productsTable: string = 'Products'
): Promise<Order[]> => {
  let connection: Connection | undefined;
  try {
    connection = await getConnection(node);
    
    await connection.execute('SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;');

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT
          o.orderNumber as ORDER_NUMBER,
          o.userId as CUSTOMER_NUMBER,
          o.deliveryRiderId as DELIVERY_RIDER_ID,
          o.createdAt as ORDER_DATE,
          o.deliveryDate as DELIVERY_DATE,
          COALESCE(SUM(oi.quantity * p.price), 0) as TOTAL_AMOUNT,
          JSON_ARRAYAGG(
            JSON_OBJECT(
              'productNumber', p.id,
              'productName', p.name,
              'quantity', oi.quantity,
              'unitPrice', p.price
            )
          ) as items
       FROM ${ordersTable} o
       LEFT JOIN ${itemsTable} oi ON o.id = oi.OrderId
       LEFT JOIN ${productsTable} p ON oi.ProductId = p.id
       GROUP BY o.id, o.orderNumber, o.userId, o.deliveryRiderId, o.createdAt, o.deliveryDate
       ORDER BY o.deliveryDate DESC`
    );

    await connection.end();
    return parseOrderItems(rows);

  } catch (err: any) {
    if (connection) await connection.end();
    throw new Error(`Failed to fetch from ${node}: ${err.message}`);
  }
};

export const getAllOrders = async (
  limit: number = 50,
  offset: number = 0
): Promise<{ orders: Order[], total: number }> => {

  try {
    const connection = await getConnection('central');
    await connection.execute('SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;');

    const [countResult] = await connection.execute<RowDataPacket[]>(`SELECT COUNT(DISTINCT id) as total_count FROM Orders`);
    const total = countResult[0].total_count;

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT
          o.orderNumber as ORDER_NUMBER,
          o.userId as CUSTOMER_NUMBER,
          o.deliveryRiderId as DELIVERY_RIDER_ID,
          o.createdAt as ORDER_DATE,
          o.deliveryDate as DELIVERY_DATE,
          COALESCE(SUM(oi.quantity * p.price), 0) as TOTAL_AMOUNT,
          JSON_ARRAYAGG(
            JSON_OBJECT(
              'productNumber', p.id,
              'productName', p.name,
              'quantity', oi.quantity,
              'unitPrice', p.price
            )
          ) as items
       FROM Orders o
       LEFT JOIN OrderItems oi ON o.id = oi.OrderId
       LEFT JOIN Products p ON oi.ProductId = p.id
       GROUP BY o.id, o.orderNumber, o.userId, o.deliveryRiderId, o.createdAt, o.deliveryDate
       ORDER BY o.deliveryDate DESC
       LIMIT ${limit} OFFSET ${offset}`
    );

    await connection.end();
    return { orders: parseOrderItems(rows), total };

  } catch (err: any) {
    // Failover
  }

  let orders2025: Order[] = [];
  let orders2024: Order[] = [];

  try {
    orders2025 = await fetchOrdersFromNode('node1', 'Orders', 'OrderItems');
  } catch (e) {
    try {
      orders2025 = await fetchOrdersFromNode('node2', 'Orders_2025Backup', 'OrderItems_2025Backup', 'Products_2025Backup');
    } catch (e2) {}
  }

  try {
    orders2024 = await fetchOrdersFromNode('node2', 'Orders', 'OrderItems');
  } catch (e) {
    try {
      orders2024 = await fetchOrdersFromNode('node1', 'Orders_2024Backup', 'OrderItems_2024Backup', 'Products_2024Backup');
    } catch (e2) {}
  }

  const allOrders = [...orders2025, ...orders2024];
  
  // Sort by Delivery Date DESC
  allOrders.sort((a, b) => new Date(b.DELIVERY_DATE).getTime() - new Date(a.DELIVERY_DATE).getTime());

  const paginatedOrders = allOrders.slice(offset, offset + limit);

  if (allOrders.length === 0) {
    throw new Error("All nodes are unavailable. Cannot fetch data.");
  }

  return { orders: paginatedOrders, total: allOrders.length };
};

export const getOrdersByYear = async (
  year: '2024' | '2025',
  limit: number = 50,
  offset: number = 0
): Promise<{ orders: Order[], total: number }> => {
  
  const primaryNode = year === '2025' ? 'node1' : 'node2';
  const backupNode = year === '2025' ? 'node2' : 'node1';
  
  const primaryTables = { orders: 'Orders', items: 'OrderItems', prod: 'Products' };
  const backupTables = year === '2025' 
    ? { orders: 'Orders_2025Backup', items: 'OrderItems_2025Backup', prod: 'Products_2025Backup' }
    : { orders: 'Orders_2024Backup', items: 'OrderItems_2024Backup', prod: 'Products_2024Backup' };

  try {
    const orders = await fetchOrdersFromNode(primaryNode, primaryTables.orders, primaryTables.items, primaryTables.prod);
    const paginated = orders.slice(offset, offset + limit);
    return { orders: paginated, total: orders.length };
  } catch (e) {}

  try {
    const conn = await getConnection('central');
    const [countResult] = await conn.execute<RowDataPacket[]>(
        `SELECT COUNT(DISTINCT o.id) as total_count FROM Orders o WHERE YEAR(o.deliveryDate) = ?`, [year]
    );
    const total = countResult[0].total_count;

    const [rows] = await conn.execute<RowDataPacket[]>(
        `SELECT
          o.orderNumber as ORDER_NUMBER,
          o.userId as CUSTOMER_NUMBER,
          o.deliveryRiderId as DELIVERY_RIDER_ID,
          o.createdAt as ORDER_DATE,
          o.deliveryDate as DELIVERY_DATE,
          COALESCE(SUM(oi.quantity * p.price), 0) as TOTAL_AMOUNT,
          JSON_ARRAYAGG(JSON_OBJECT('productNumber', p.id, 'productName', p.name, 'quantity', oi.quantity, 'unitPrice', p.price)) as items
         FROM Orders o 
         LEFT JOIN OrderItems oi ON o.id = oi.OrderId 
         LEFT JOIN Products p ON oi.ProductId = p.id
         WHERE YEAR(o.deliveryDate) = ? 
         GROUP BY o.id, o.orderNumber, o.userId, o.deliveryRiderId, o.createdAt, o.deliveryDate
         ORDER BY o.deliveryDate DESC 
         LIMIT ? OFFSET ?`,
         [year, limit, offset]
    );
    await conn.end();
    return { orders: parseOrderItems(rows), total };
  } catch (e) {}

  try {
    const orders = await fetchOrdersFromNode(backupNode, backupTables.orders, backupTables.items, backupTables.prod);
    const paginated = orders.slice(offset, offset + limit);
    return { orders: paginated, total: orders.length };
  } catch (e) {
    throw new Error(`All nodes for ${year} unavailable.`);
  }
};

export const getOrderById = async (id: string, year: '2024' | '2025'): Promise<any | null> => {
  const primaryNode = year === '2025' ? 'node1' : 'node2';
  const backupNode = year === '2025' ? 'node2' : 'node1';
  
  const primaryTables = { orders: 'Orders', items: 'OrderItems', prod: 'Products' };
  const backupTables = year === '2025' 
    ? { orders: 'Orders_2025Backup', items: 'OrderItems_2025Backup', prod: 'Products_2025Backup' }
    : { orders: 'Orders_2024Backup', items: 'OrderItems_2024Backup', prod: 'Products_2024Backup' };

  const attemptPath = [
    { node: primaryNode, tables: primaryTables },
    { node: 'central', tables: primaryTables },
    { node: backupNode, tables: backupTables }
  ];

  for (const attempt of attemptPath) {
    let connection: Connection | undefined;
    try {
      connection = await getConnection(attempt.node as NodeName);
      await connection.execute('SET TRANSACTION ISOLATION LEVEL READ COMMITTED;');

      const [rows]: any[] = await connection.execute(
        `SELECT
            o.orderNumber,
            o.userId,
            o.deliveryRiderId, 
            o.deliveryDate,
            o.createdAt,
            oi.quantity,
            p.name as productName,
            p.price as unitPrice,
            p.id as productNumber
          FROM ${attempt.tables.orders} o
          LEFT JOIN ${attempt.tables.items} oi ON o.id = oi.OrderId
          LEFT JOIN ${attempt.tables.prod} p ON oi.ProductId = p.id
          WHERE o.orderNumber = ?
          FOR SHARE`, 
        [id]
      );

      await connection.end();
      if (rows.length === 0) continue;

      const order = {
        orderNumber: rows[0].orderNumber,
        customerNumber: rows[0].userId,
        deliveryRiderId: rows[0].deliveryRiderId, 
        orderDate: rows[0].createdAt,
        deliveryDate: rows[0].deliveryDate,
        totalAmount: 0,
        items: [] as any[]
      };

      rows.forEach((row: any) => {
        if (row.productName) {
          const lineTotal = row.quantity * row.unitPrice;
          order.totalAmount += lineTotal;
          order.items.push({
            productNumber: row.productNumber,
            productName: row.productName,
            quantity: row.quantity,
            unitPrice: row.unitPrice,
            lineTotal: lineTotal
          });
        }
      });
      return order;

    } catch (err: any) {
      if (connection) await connection.end();
    }
  }
  return null;
};

export const getProducts = async (year: '2024' | '2025'): Promise<Product[]> => {
    return getAllProducts();
};

export const getAllProducts = async (): Promise<Product[]> => {
  const nodes: NodeName[] = ['central', 'node1', 'node2'];
  for (const node of nodes) {
    try {
      const conn = await getConnection(node);
      const [rows] = await conn.execute('SELECT id as PRODUCT_NUMBER, name as PRODUCT_NAME, price as UNIT_PRICE FROM Products');
      await conn.end();
      return rows as Product[];
    } catch (e) {}
  }
  return [];
};