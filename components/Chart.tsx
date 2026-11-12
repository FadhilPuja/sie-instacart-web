"use client";
import * as echarts from "echarts";
import { useEffect, useRef } from "react";

type Props = { option: echarts.EChartsOption; height?: number; onClick?: (p: { name: string }) => void };

export default function Chart({ option, height = 320, onClick }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    chart.current = echarts.init(el.current!);
    const resize = () => chart.current?.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.current?.dispose();
    };
  }, []);

  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    c.setOption(option, true);
    c.off("click");
    if (onClick) c.on("click", (p) => onClick({ name: String(p.name) }));
  }, [option, onClick]);

  return <div ref={el} style={{ height }} className="w-full" />;
}
