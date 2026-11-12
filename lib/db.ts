import mysql from "mysql2/promise";
import type { Data } from "./types";

const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]; // asumsi 0=Sunday
const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

// Koneksi dibaca dari .env.local (lihat README); default = XAMPP/MySQL lokal tanpa password
const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME ?? "sie_instacart",
  decimalNumbers: true,
  connectionLimit: 4,
});

async function q<T>(sql: string): Promise<T[]> {
  const [rows] = await pool.query(sql);
  return rows as T[];
}

let cache: Data | null = null; // data statis → cukup dihitung sekali

export async function getDashboardData(): Promise<Data> {
  if (cache) return cache;

  const [k] = await q<Record<string, number>>(`
    SELECT (SELECT COUNT(*) FROM orders) AS total_orders,
           (SELECT COUNT(DISTINCT user_id) FROM orders) AS total_users,
           (SELECT COUNT(*) FROM order_items) AS total_items,
           (SELECT AVG(reordered) FROM order_items) AS reorder_rate,
           (SELECT AVG(days_since_prior_order) FROM orders) AS avg_days,
           (SELECT COUNT(DISTINCT product_id) FROM order_items) AS total_products`);

  const by_dow = (await q<{ order_dow: number; orders: number; items: number; reordered_items: number }>(`
    SELECT o.order_dow, COUNT(DISTINCT o.order_id) AS orders, COUNT(*) AS items, SUM(oi.reordered) AS reordered_items
    FROM order_items oi JOIN orders o USING (order_id) GROUP BY o.order_dow ORDER BY o.order_dow`))
    .map((r) => ({ ...r, order_dow_name: DOW[r.order_dow] }));

  const by_hour = await q<{ order_hour_of_day: number; orders: number; items: number; reordered_items: number }>(`
    SELECT o.order_hour_of_day, COUNT(DISTINCT o.order_id) AS orders, COUNT(*) AS items, SUM(oi.reordered) AS reordered_items
    FROM order_items oi JOIN orders o USING (order_id) GROUP BY o.order_hour_of_day ORDER BY o.order_hour_of_day`);

  const heatmap_dow_hour = await q<{ order_dow: number; order_hour_of_day: number; orders: number }>(`
    SELECT order_dow, order_hour_of_day, COUNT(*) AS orders FROM orders GROUP BY order_dow, order_hour_of_day`);

  const products = (await q<{ product_id: number; product_name: string; aisle: string; department_label: string;
    orders: number; items: number; reordered_items: number }>(`
    SELECT p.product_id, p.product_name, a.aisle, d.department_label,
           COUNT(*) AS orders, COUNT(*) AS items, SUM(oi.reordered) AS reordered_items
    FROM order_items oi JOIN products p USING (product_id)
    JOIN aisles a ON a.aisle_id = p.aisle_id JOIN departments d ON d.department_id = a.department_id
    GROUP BY p.product_id, p.product_name, a.aisle, d.department_label`))
    .map((r) => ({ ...r, reorder_rate: round(r.reordered_items / r.items) }));

  const roll = (keys: string[]) => {
    const m = new Map<string, Record<string, any>>();
    for (const p of products as Record<string, any>[]) {
      const id = keys.map((x) => p[x]).join("|");
      const e = m.get(id) ?? { ...Object.fromEntries(keys.map((x) => [x, p[x]])), items: 0, reordered_items: 0 };
      e.items += p.items; e.reordered_items += p.reordered_items; m.set(id, e);
    }
    return [...m.values()]
      .map((e): Record<string, any> => ({ ...e, reorder_rate: round(e.reordered_items / e.items) }))
      .sort((x, y) => y.items - x.items);
  };

  cache = {
    meta: {
      source: "Instacart Market Basket (sampel terpotong product_id 1-2057) – MySQL",
      dow_mapping_assumption: "0=Sunday",
      warning: "Basket size & komposisi department bias karena data terpotong.",
    },
    kpi: { total_orders: k.total_orders, total_users: k.total_users, total_items: k.total_items,
      reorder_rate: round(k.reorder_rate), avg_days_between_orders: round(k.avg_days, 2), total_products: k.total_products },
    by_dow, by_hour, heatmap_dow_hour,
    departments: roll(["department_label"]) as Data["departments"],
    aisles: roll(["department_label", "aisle"]) as Data["aisles"],
    products,
  };
  return cache;
}