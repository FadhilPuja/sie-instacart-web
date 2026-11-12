export type Dow = { order_dow: number; order_dow_name: string; orders: number; items: number; reordered_items: number };
export type Hour = { order_hour_of_day: number; orders: number; items: number; reordered_items: number };
export type Heat = { order_dow: number; order_hour_of_day: number; orders: number };
export type Dept = { department_label: string; items: number; reordered_items: number; reorder_rate: number };
export type Aisle = Dept & { aisle: string };
export type Product = {
  product_id: number; product_name: string; aisle: string; department_label: string;
  orders: number; items: number; reordered_items: number; reorder_rate: number;
};
export type Data = {
  meta: { source: string; dow_mapping_assumption: string; warning: string };
  kpi: {
    total_orders: number; total_users: number; total_items: number;
    reorder_rate: number; avg_days_between_orders: number; total_products: number;
  };
  by_dow: Dow[]; by_hour: Hour[]; heatmap_dow_hour: Heat[];
  departments: Dept[]; aisles: Aisle[]; products: Product[];
};
