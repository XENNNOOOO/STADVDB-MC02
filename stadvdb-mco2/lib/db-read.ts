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

const getUnionQuery = (
  tables1: { orders: string, items: string, products: string },
  tables2: { orders: string, items: string, products: string } | null,
  yearFilter: string | null,
  limit: number,
  offset: number
) => {
  const buildSelect = (t: { orders: string, items: string, products: string }) => `
    SELECT
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
    FROM ${t.orders} o
    LEFT JOIN ${t.items} oi ON o.id = oi.OrderId
    LEFT JOIN ${t.products} p ON oi.ProductId = p.id
    ${yearFilter ? `WHERE YEAR(o.deliveryDate) = '${yearFilter}'` : ''}
    GROUP BY o.id, o.orderNumber, o.userId, o.deliveryRiderId, o.createdAt, o.deliveryDate
  `;

  if (!tables2) {
    return `${buildSelect(tables1)} ORDER BY DELIVERY_DATE DESC LIMIT ${limit} OFFSET ${offset}`;
  }

  return `
    SELECT * FROM (
      ${buildSelect(tables1)}
      UNION ALL
      ${buildSelect(tables2)}
    ) as combined_results
    ORDER BY DELIVERY_DATE DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
};

const getUnionCountQuery = (
  tables1: { orders: string, items: string, products: string },
  tables2: { orders: string, items: string, products: string } | null,
  yearFilter: string | null
) => {
  const q1 = `SELECT COUNT(DISTINCT id) as cnt FROM ${tables1.orders} ${yearFilter ? `WHERE YEAR(deliveryDate) = '${yearFilter}'` : ''}`;
  
  if (!tables2) {
    return `SELECT (${q1}) as total_count`;
  }

  const q2 = `SELECT COUNT(DISTINCT id) as cnt FROM ${tables2.orders} ${yearFilter ? `WHERE YEAR(deliveryDate) = '${yearFilter}'` : ''}`;
  return `SELECT ((${q1}) + (${q2})) as total_count`;
};

export const getAllOrders = async (
  limit?: number,
  offset?: number
): Promise<{ orders: Order[], total: number }> => {
  const readPath: NodeName[] = ['central', 'node1', 'node2'];
  const actualLimit = limit || 50;
  const actualOffset = offset || 0;
  
  let connection: Connection | undefined;

  for (const node of readPath) {
    try {
      console.log(`READ [ALL]: Trying Node ${node}...`);
      connection = await getConnection(node);
      await connection.execute('SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;');

      let tablesMain = { orders: 'Orders', items: 'OrderItems', products: 'Products' };
      let tablesBackup = null;

      if (node === 'node1') {
        tablesBackup = { orders: 'Orders_2024Backup', items: 'OrderItems_2024Backup', products: 'Products_2024Backup' };
      } else if (node === 'node2') {
        tablesBackup = { orders: 'Orders_2025Backup', items: 'OrderItems_2025Backup', products: 'Products_2025Backup' };
      }

      const [countResult] = await connection.execute<RowDataPacket[]>(
        getUnionCountQuery(tablesMain, tablesBackup, null)
      );
      const total = countResult[0].total_count;

      const [rows] = await connection.execute<RowDataPacket[]>(
        getUnionQuery(tablesMain, tablesBackup, null, actualLimit, actualOffset)
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

  const actualLimit = limit || 50;
  const actualOffset = offset || 0;

  let connection: Connection | undefined;

  for (const node of readPath) {
    try {
      console.log(`READ [${year}]: Trying Node ${node}...`);
      connection = await getConnection(node);
      await connection.execute('SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;');

      let targetTables = { orders: 'Orders', items: 'OrderItems', products: 'Products' };

      if (node === 'node1' && year === '2024') {
        targetTables = { orders: 'Orders_2024Backup', items: 'OrderItems_2024Backup', products: 'Products_2024Backup' };
      } else if (node === 'node2' && year === '2025') {
        targetTables = { orders: 'Orders_2025Backup', items: 'OrderItems_2025Backup', products: 'Products_2025Backup' };
      }

      const [countResult] = await connection.execute<RowDataPacket[]>(
        `SELECT COUNT(DISTINCT id) as total_count FROM ${targetTables.orders} WHERE YEAR(deliveryDate) = ?`,
        [year]
      );
      const total = countResult[0].total_count;

      const [rows] = await connection.execute<RowDataPacket[]>(
        getUnionQuery(targetTables, null, year, actualLimit, actualOffset)
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

      let tablesToCheck = [{ orders: 'Orders', items: 'OrderItems', products: 'Products' }];
      
      if (node === 'node1') {
        tablesToCheck.push({ orders: 'Orders_2024Backup', items: 'OrderItems_2024Backup', products: 'Products_2024Backup' });
      } else if (node === 'node2') {
        tablesToCheck.push({ orders: 'Orders_2025Backup', items: 'OrderItems_2025Backup', products: 'Products_2025Backup' });
      }

      for (const t of tablesToCheck) {
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
           FROM ${t.orders} o
           LEFT JOIN ${t.items} oi ON o.id = oi.OrderId
           LEFT JOIN ${t.products} p ON oi.ProductId = p.id
           WHERE o.orderNumber = ?
           FOR UPDATE`, 
          [id]
        );

        if (rows.length > 0) {
          await connection.end();
          console.log(`READ [${id}]: Found on Node ${node} in table ${t.orders}. Parsing...`);

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
        }
      }
      
      await connection.end();

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
      
      let query = `SELECT id as PRODUCT_NUMBER, name as PRODUCT_NAME, price as UNIT_PRICE FROM Products`;
      
      if (node === 'node1' && year === '2024') {
        query = `SELECT id as PRODUCT_NUMBER, name as PRODUCT_NAME, price as UNIT_PRICE FROM Products_2024Backup`;
      } else if (node === 'node2' && year === '2025') {
        query = `SELECT id as PRODUCT_NUMBER, name as PRODUCT_NAME, price as UNIT_PRICE FROM Products_2025Backup`;
      }

      const [rows] = await connection.execute(query);
      await connection.end();
      return rows as Product[];
    } catch (err: any) {
      console.warn(`READ [Products]: Node ${node} failed. (${err.message}). Failing over...`);
      if (connection) await connection.end();
    }
  }
  throw new Error(`All nodes are unavailable. Cannot fetch products.`);
};

export const getAllProducts = async (): Promise<Product[]> => {
  const readPath: NodeName[] = ['central', 'node1', 'node2'];
  
  let connection: Connection | undefined;

  for (const node of readPath) {
    try {
      console.log(`READ [Products, ALL]: Trying Node ${node}...`);
      connection = await getConnection(node);
      await connection.execute('SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;');
      
      let query = `SELECT id as PRODUCT_NUMBER, name as PRODUCT_NAME, price as UNIT_PRICE FROM Products`;

      if (node === 'node1') {
        query = `
          SELECT id as PRODUCT_NUMBER, name as PRODUCT_NAME, price as UNIT_PRICE FROM Products
          UNION
          SELECT id as PRODUCT_NUMBER, name as PRODUCT_NAME, price as UNIT_PRICE FROM Products_2024Backup
        `;
      } else if (node === 'node2') {
        query = `
          SELECT id as PRODUCT_NUMBER, name as PRODUCT_NAME, price as UNIT_PRICE FROM Products
          UNION
          SELECT id as PRODUCT_NUMBER, name as PRODUCT_NAME, price as UNIT_PRICE FROM Products_2025Backup
        `;
      }

      const [rows] = await connection.execute(query);
      
      await connection.end();
      console.log(`READ [Products, ALL]: Success on Node ${node}.`);
      return rows as Product[]; 
    
    } catch (err: any) {
      console.warn(`READ [Products, ALL]: Node ${node} failed. (${err.message}). Failing over...`);
      if (connection) await connection.end();
    }
  }
  
  throw new Error(`All nodes are unavailable. Cannot fetch products.`);
};