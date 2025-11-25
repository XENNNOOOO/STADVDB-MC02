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
      TOTAL_AMOUNT: row.TOTAL_AMOUNT || 0,
      items: cleanItems 
    } as unknown as Order;
  });
};


export const getAllOrders = async (
  limit?: number,
  offset?: number
): Promise<{ orders: Order[], total: number }> => {
  const readPath: NodeName[] = ['central', 'node1', 'node2'];
  
  let connection: Connection | undefined;

  for (const node of readPath) {
    try {
      console.log(`READ [ALL]: Trying Node ${node}...`);
      connection = await getConnection(node);

      await connection.execute('SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;');

      const [countResult] = await connection.execute<RowDataPacket[]>(
        `SELECT COUNT(DISTINCT id) as total_count FROM Orders`
      );
      const total = countResult[0].total_count;

      const actualLimit = limit || 50;
      const actualOffset = offset || 0;

      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT
            o.orderNumber as ORDER_NUMBER,
            o.userId as CUSTOMER_NUMBER,
            o.createdAt as ORDER_DATE,
            o.deliveryDate as DELIVERY_DATE,
            COALESCE(SUM(oi.quantity * p.price), 0) as TOTAL_AMOUNT,
            JSON_ARRAYAGG(
              JSON_OBJECT(
                'productName', p.name,
                'quantity', oi.quantity,
                'unitPrice', p.price
              )
            ) as items
         FROM Orders o
         LEFT JOIN OrderItems oi ON o.id = oi.OrderId
         LEFT JOIN Products p ON oi.ProductId = p.id
         GROUP BY o.id, o.orderNumber, o.userId, o.createdAt, o.deliveryDate
         ORDER BY o.createdAt DESC
         LIMIT ${actualLimit} OFFSET ${actualOffset}`
      );

      await connection.end();
      console.log(`READ [ALL]: Success on Node ${node}. Fetched ${rows.length} orders.`);

      const orders = parseOrderItems(rows);

      return { orders, total };

    } catch (err: any) {
      console.warn(`READ [ALL]: Node ${node} failed. (${err.message}). Failing over...`);
      if (connection) await connection.end();
    }
  }

  throw new Error("All nodes are unavailable. Cannot fetch complete order list.");
};


export const getOrdersByYear = async (
  year: '2024' | '2025',
  limit?: number,
  offset?: number
): Promise<{ orders: Order[], total: number }> => {
  const readPath: NodeName[] =
    year === '2025'
      ? ['node1', 'central', 'node2']
      : ['node2', 'central', 'node1'];

  let connection: Connection | undefined;

  for (const node of readPath) {
    try {
      console.log(`READ [${year}]: Trying Node ${node}...`);
      connection = await getConnection(node);

      await connection.execute('SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;');

      const [countResult] = await connection.execute<RowDataPacket[]>(
        `SELECT COUNT(DISTINCT o.id) as total_count
         FROM Orders o
         WHERE YEAR(o.deliveryDate) = ?`,
        [year]
      );
      const total = countResult[0].total_count;

      const actualLimit = limit || 50;
      const actualOffset = offset || 0;

      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT
            o.orderNumber as ORDER_NUMBER,
            o.userId as CUSTOMER_NUMBER,
            o.createdAt as ORDER_DATE,
            o.deliveryDate as DELIVERY_DATE,
            COALESCE(SUM(oi.quantity * p.price), 0) as TOTAL_AMOUNT,
            JSON_ARRAYAGG(
              JSON_OBJECT(
                'productName', p.name,
                'quantity', oi.quantity,
                'unitPrice', p.price
              )
            ) as items
         FROM Orders o
         LEFT JOIN OrderItems oi ON o.id = oi.OrderId
         LEFT JOIN Products p ON oi.ProductId = p.id
         WHERE YEAR(o.deliveryDate) = ?
         GROUP BY o.id, o.orderNumber, o.userId, o.createdAt, o.deliveryDate
         ORDER BY o.createdAt DESC
         LIMIT ${actualLimit} OFFSET ${actualOffset}`,
        [year]
      );

      await connection.end();
      console.log(`READ [${year}]: Success on Node ${node}. Fetched ${rows.length} orders.`);

      const orders = parseOrderItems(rows);

      return { orders, total };

    } catch (err: any) {
      console.warn(`READ: Node ${node} failed. (${err.message}). Failing over...`);
      if (connection) await connection.end();
    }
  }

  throw new Error(`All nodes for ${year} data are unavailable.`);
};

export const getOrderById = async (id: string, year: '2024' | '2025'): Promise<any | null> => {
  const readPath: NodeName[] =
    year === '2025'
      ? ['node1', 'central', 'node2']
      : ['node2', 'central', 'node1'];

  let connection: Connection | undefined;

  for (const node of readPath) {
    try {
      console.log(`READ [${id}]: Trying Node ${node}...`);
      connection = await getConnection(node);
      await connection.execute('SET TRANSACTION ISOLATION LEVEL READ COMMITTED;');

      const [rows]: any[] = await connection.execute(
        `SELECT
           o.orderNumber,
           o.userId,
           o.deliveryDate,
           o.createdAt,
           oi.quantity,
           p.name as productName,
           p.price as unitPrice
         FROM Orders o
         LEFT JOIN OrderItems oi ON o.id = oi.OrderId
         LEFT JOIN Products p ON oi.ProductId = p.id
         WHERE o.orderNumber = ?`,
        [id]
      );

      await connection.end();
      if (rows.length === 0) continue;

      console.log(`READ [${id}]: Found on Node ${node}. Parsing...`);

      const order = {
        orderNumber: rows[0].orderNumber,
        customerNumber: rows[0].userId,
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
            productName: row.productName,
            quantity: row.quantity,
            unitPrice: row.unitPrice,
            lineTotal: lineTotal
          });
        }
      });
      return order;
    } catch (err: any) {
      console.warn(`READ: Node ${node} failed. (${err.message}). skipping...`);
      if (connection) await connection.end();
    }
  }
  console.error(`Order ${id} not found on any available node.`);
  return null;
};

export const getProducts = async (year: '2024' | '2025'): Promise<Product[]> => {
  const readPath: NodeName[] =
    year === '2025'
      ? ['node1', 'central', 'node2'] 
      : ['node2', 'central', 'node1']; 

  let connection: Connection | undefined;
  for (const node of readPath) {
    try {
      console.log(`READ [Products, context=${year}]: Trying Node ${node}...`);
      connection = await getConnection(node);
      await connection.execute('SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;');
      const [rows] = await connection.execute(
        `SELECT id as PRODUCT_NUMBER, name as PRODUCT_NAME, price as UNIT_PRICE FROM Products`
      );
      await connection.end();
      return rows as Product[];
    } catch (err: any) {
      console.warn(`READ [Products]: Node ${node} failed. (${err.message}). Failing over...`);
      if (connection) await connection.end();
    }
  }
  throw new Error(`All nodes are unavailable. Cannot fetch products.`);
};

export const getProductsFromMaster = async (connection: Connection): Promise<Product[]> => {
  try {
    await connection.execute('SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;');
    const [rows] = await connection.execute(
      `SELECT id as PRODUCT_NUMBER, name as PRODUCT_NAME, price as UNIT_PRICE FROM Products`
    );
    return rows as Product[];
  } catch (err: any) {
    console.error("RECOVERY: FAILED to get product list from master.", err.message);
    throw err; 
  }
};