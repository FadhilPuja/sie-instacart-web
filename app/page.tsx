"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import Chart from "@/components/Chart";
import type { Data } from "@/lib/types";

const fmt = (n: number) => Math.round(n).toLocaleString("id-ID");
const pct = (n: number) => (n * 100).toFixed(1) + "%";
const signed = (v: number) => (v > 0 ? "+" : "") + Math.round(v * 100) + "%";

function Card({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 ${className}`}>
      {title && <h2 className="mb-2 text-sm font-semibold text-slate-700">{title}</h2>}
      {children}
    </section>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </Card>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block text-sm">
      <span className="flex justify-between font-medium text-slate-700">
        {label}
        <span className={value === 0 ? "text-slate-400" : value > 0 ? "text-emerald-600" : "text-rose-600"}>{signed(value)}</span>
      </span>
      <input type="range" min={-0.5} max={0.5} step={0.05} value={value}
        onChange={(e) => onChange(Number(e.target.value))} className="mt-2 w-full accent-indigo-600" />
    </label>
  );
}

export default function Dashboard() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [wk, setWk] = useState(0);
  const [hr, setHr] = useState(0);
  const [ro, setRo] = useState(0);
  const [path, setPath] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/dashboard").then((r) => r.json()).then(setD).catch((e) => setErr(String(e)));
  }, []);

  const peak = useMemo(
    () => new Set([...(d?.by_hour ?? [])].sort((a, b) => b.orders - a.orders).slice(0, 6).map((h) => h.order_hour_of_day)),
    [d]
  );

  const sim = useMemo(() => {
    if (!d) return null;
    const orders = d.by_dow.reduce((s, x) => s + x.orders * (1 + wk), 0);
    const R = d.kpi.reorder_rate * d.kpi.total_items;
    const R2 = R * (1 + ro);
    return { orders, rate: R2 / (d.kpi.total_items - R + R2) };
  }, [d, wk, ro]);

  const weeklyOpt: EChartsOption = useMemo(() => ({
    tooltip: { trigger: "axis" }, grid: { left: 50, right: 10, top: 20, bottom: 30 },
    xAxis: { type: "category", data: (d?.by_dow ?? []).map((x) => x.order_dow_name.slice(0, 3)) },
    yAxis: { type: "value" },
    series: [{ type: "bar", name: "Orders (simulasi)", itemStyle: { color: "#4f46e5", borderRadius: [4, 4, 0, 0] },
      data: (d?.by_dow ?? []).map((x) => Math.round(x.orders * (1 + wk))) }],
  }), [d, wk]);

  const hourlyOpt: EChartsOption = useMemo(() => ({
    tooltip: { trigger: "axis" }, grid: { left: 50, right: 10, top: 20, bottom: 30 },
    xAxis: { type: "category", data: (d?.by_hour ?? []).map((x) => String(x.order_hour_of_day)) },
    yAxis: { type: "value" },
    series: [{ type: "bar", name: "Orders (simulasi)", itemStyle: { borderRadius: [4, 4, 0, 0] },
      data: (d?.by_hour ?? []).map((x) => ({
        value: Math.round(x.orders * (peak.has(x.order_hour_of_day) ? 1 + hr : 1)),
        itemStyle: { color: peak.has(x.order_hour_of_day) ? "#f59e0b" : "#a5b4fc" },
      })) }],
  }), [d, hr, peak]);

  const heatOpt: EChartsOption = useMemo(() => {
    const cells = d?.heatmap_dow_hour ?? [];
    const days = (d?.by_dow ?? []).map((x) => x.order_dow_name);
    const max = Math.max(1, ...cells.map((x) => x.orders));
    return {
      tooltip: {
        formatter: (p: any) =>
          `${days[p.value[1]]}, jam ${String(p.value[0]).padStart(2, "0")}:00<br/><b>${fmt(p.value[2])}</b> orders`,
      },
      grid: { left: 90, right: 20, top: 10, bottom: 90 },
      xAxis: { type: "category", data: Array.from({ length: 24 }, (_, i) => String(i)), name: "Jam", nameLocation: "middle", nameGap: 28 },
      yAxis: { type: "category", data: days, inverse: true },
      visualMap: {
        min: 0, max, calculable: false, orient: "horizontal", left: "center", bottom: 0,
        formatter: (v: any) => fmt(Number(v)),
        inRange: { color: ["#eef2ff", "#a5b4fc", "#4f46e5", "#1e1b4b"] },
      },
      series: [{
        type: "heatmap",
        data: cells.map((x) => ({
          value: [x.order_hour_of_day, x.order_dow, x.orders],
          label: { color: x.orders > max * 0.45 ? "#ffffff" : "#334155" },
        })),
        itemStyle: { borderColor: "#ffffff", borderWidth: 2, borderRadius: 3 },
        label: { show: true, fontSize: 10, formatter: (p: any) => (p.value[2] / 1000).toFixed(1) + "k" },
        emphasis: { itemStyle: { borderColor: "#f59e0b", borderWidth: 2 } },
      }],
    };
  }, [d]);

  const breakdown = useMemo(() => {
    if (!d) return [];
    const rows =
      path.length === 0 ? d.departments.map((x) => ({ name: x.department_label, items: x.items, re: x.reordered_items }))
      : path.length === 1 ? d.aisles.filter((a) => a.department_label === path[0]).map((x) => ({ name: x.aisle, items: x.items, re: x.reordered_items }))
      : d.products.filter((p) => p.department_label === path[0] && p.aisle === path[1]).map((x) => ({ name: x.product_name, items: x.items, re: x.reordered_items }));
    return rows.sort((a, b) => b.items - a.items).slice(0, 15);
  }, [d, path]);

  const breakOpt: EChartsOption = useMemo(() => ({
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } }, legend: { top: 0 },
    grid: { left: 140, right: 20, top: 30, bottom: 20 },
    xAxis: { type: "value" }, yAxis: { type: "category", inverse: true, data: breakdown.map((r) => r.name) },
    series: [
      { type: "bar", stack: "t", name: "Item baru", itemStyle: { color: "#a5b4fc" }, data: breakdown.map((r) => r.items - r.re) },
      { type: "bar", stack: "t", name: "Reorder (simulasi)", itemStyle: { color: "#4f46e5" }, data: breakdown.map((r) => Math.round(r.re * (1 + ro))) },
    ],
  }), [breakdown, ro]);

  const drill = useCallback((p: { name: string }) => setPath((cur) => (cur.length < 2 ? [...cur, p.name] : cur)), []);

  if (err) return <main className="p-8 text-rose-600">Gagal memuat data: {err}</main>;
  if (!d || !sim) return <main className="p-8 text-slate-500">Memuat data…</main>;

  const k = d.kpi;
  return (
    <main className="mx-auto max-w-7xl space-y-4 p-4 md:p-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">SIE Instacart – Executive Dashboard</h1>
        <p className="text-sm text-slate-500">Ringkasan perilaku order pelanggan, pola waktu, dan simulasi what-if.</p>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Total Orders" value={fmt(sim.orders)} sub={wk !== 0 ? `Asli: ${fmt(k.total_orders)}` : "Order unik"} />
        <Kpi label="Total Users" value={fmt(k.total_users)} sub="Pengguna unik" />
        <Kpi label="Reorder Rate" value={pct(sim.rate)} sub={ro !== 0 ? `Asli: ${pct(k.reorder_rate)}` : "% item dipesan ulang"} />
        <Kpi label="Rata-rata Jeda Order" value={`${k.avg_days_between_orders} hari`} sub="Antar order user" />
      </div>

      <Card title="Simulasi What-If">
        <div className="grid gap-6 md:grid-cols-3">
          <Slider label="Weekly (semua hari)" value={wk} onChange={setWk} />
          <Slider label="Peak Hours (6 jam tersibuk)" value={hr} onChange={setHr} />
          <Slider label="Reorder" value={ro} onChange={setRo} />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Weekly Breakdown – orders per hari"><Chart option={weeklyOpt} /></Card>
        <Card title="Hourly Breakdown – orders per jam (kuning = peak hours)"><Chart option={hourlyOpt} /></Card>
      </div>

      <Card title="Heatmap Orders: hari × jam (angka dalam ribuan order; makin gelap = makin ramai)"><Chart option={heatOpt} height={460} /></Card>

      <Card title="Items Breakdown (klik bar untuk drill-down)">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
          <button onClick={() => setPath([])} className="rounded bg-indigo-50 px-2 py-1 text-indigo-700 hover:bg-indigo-100">Department</button>
          {path.map((p, i) => (
            <span key={i} className="flex items-center gap-2">
              <span className="text-slate-400">›</span>
              <button onClick={() => setPath(path.slice(0, i + 1))} className="rounded bg-indigo-50 px-2 py-1 text-indigo-700 hover:bg-indigo-100">{p}</button>
            </span>
          ))}
          <span className="ml-auto text-xs text-slate-400">{["Department", "Aisle", "Produk"][path.length]} · top 15</span>
        </div>
        <Chart option={breakOpt} height={480} onClick={drill} />
      </Card>
      <footer className="pt-2 text-xs text-slate-400">
        Catatan data: {d.meta.warning} Pemetaan hari: {d.meta.dow_mapping_assumption}.
      </footer>
    </main>
  );
}