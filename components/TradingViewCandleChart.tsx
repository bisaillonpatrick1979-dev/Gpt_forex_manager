"use client";

import { useEffect, useRef, useState } from "react";
import { Candle } from "@/lib/types";

type ChartMode = "candles" | "bars" | "line" | "area";
type Props = { candles: Candle[]; mode: ChartMode };

type ChartApi = {
  addCandlestickSeries: (options?: Record<string, unknown>) => { setData: (data: unknown[]) => void };
  addBarSeries: (options?: Record<string, unknown>) => { setData: (data: unknown[]) => void };
  addLineSeries: (options?: Record<string, unknown>) => { setData: (data: unknown[]) => void };
  addAreaSeries: (options?: Record<string, unknown>) => { setData: (data: unknown[]) => void };
  timeScale: () => { fitContent: () => void };
  applyOptions: (options: Record<string, unknown>) => void;
  remove: () => void;
};

type LightweightChartsGlobal = {
  createChart: (element: HTMLElement, options: Record<string, unknown>) => ChartApi;
  ColorType: { Solid: string };
  CrosshairMode: { Normal: number };
};

declare global { interface Window { LightweightCharts?: LightweightChartsGlobal } }

let loadingPromise: Promise<void> | null = null;

function loadChartLibrary() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.LightweightCharts) return Promise.resolve();
  if (loadingPromise) return loadingPromise;
  loadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://unpkg.com/lightweight-charts@4.2.3/dist/lightweight-charts.standalone.production.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("TradingView chart library failed to load"));
    document.head.appendChild(script);
  });
  return loadingPromise;
}

function timestamp(value: string) {
  const time = Math.floor(new Date(value).getTime() / 1000);
  return Number.isFinite(time) ? time : Math.floor(Date.now() / 1000);
}

function seriesData(candles: Candle[]) {
  return candles.filter((c) => Number.isFinite(c.close)).map((c) => ({ time: timestamp(c.time), open: c.open, high: c.high, low: c.low, close: c.close, value: c.close }));
}

function localPrice(value: number) {
  return value.toFixed(value > 20 ? 3 : 5);
}

function FallbackChart({ candles, mode }: Props) {
  const visible = candles.filter((c) => Number.isFinite(c.close)).slice(-90);
  if (visible.length === 0) return <div className="tv-chart-status">Aucune chandelle disponible.</div>;
  const high = Math.max(...visible.map((c) => c.high));
  const low = Math.min(...visible.map((c) => c.low));
  const range = high - low || 1;
  const y = (value: number) => ((high - value) / range) * 100;
  const points = visible.map((c, i) => `${(i / Math.max(1, visible.length - 1)) * 100},${y(c.close)}`).join(" ");
  const area = `0,100 ${points} 100,100`;
  const last = visible.at(-1)!;

  if (mode === "line" || mode === "area") {
    return <div className="chart pro-chart"><svg className="line-plot" viewBox="0 0 100 100" preserveAspectRatio="none">{mode === "area" && <polygon points={area} className="area-fill" />}<polyline points={points} className="price-line" /></svg><div className="chart-price-tag">{localPrice(last.close)}</div></div>;
  }

  return <div className="chart pro-chart">{visible.map((c) => {
    const up = c.close >= c.open;
    const wickTop = y(c.high);
    const wickBottom = y(c.low);
    const bodyTop = Math.min(y(c.open), y(c.close));
    const bodyBottom = Math.max(y(c.open), y(c.close));
    if (mode === "bars") return <div className="candle-slot" key={c.time}><span className={`ohlc-bar ${up ? "up" : "down"}`} style={{ top: `${wickTop}%`, height: `${Math.max(1, wickBottom - wickTop)}%` }} /></div>;
    return <div className="candle-slot" key={c.time}><span className={`wick ${up ? "up" : "down"}`} style={{ top: `${wickTop}%`, height: `${Math.max(1, wickBottom - wickTop)}%` }} /><span className={`candle-body ${up ? "up" : "down"}`} style={{ top: `${bodyTop}%`, height: `${Math.max(1.2, bodyBottom - bodyTop)}%` }} /></div>;
  })}<div className="chart-price-tag">{localPrice(last.close)}</div><div className="chart-scale top">H {localPrice(high)}</div><div className="chart-scale bottom">L {localPrice(low)}</div></div>;
}

export default function TradingViewCandleChart({ candles, mode }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState("Chargement du graphique...");
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    let disposed = false;
    let chart: ChartApi | null = null;
    async function render() {
      setFallback(false);
      setStatus("Chargement du graphique...");
      try {
        await loadChartLibrary();
        if (disposed || !containerRef.current || !window.LightweightCharts) return;
        const data = seriesData(candles.slice(-500));
        if (data.length === 0) { setStatus("Aucune chandelle disponible."); setFallback(true); return; }
        containerRef.current.innerHTML = "";
        const lib = window.LightweightCharts;
        const height = Math.max(280, containerRef.current.clientHeight || 440);
        chart = lib.createChart(containerRef.current, {
          width: containerRef.current.clientWidth,
          height,
          layout: { background: { type: lib.ColorType.Solid, color: "#020617" }, textColor: "#cbd5e1" },
          grid: { vertLines: { color: "rgba(148,163,184,0.12)" }, horzLines: { color: "rgba(148,163,184,0.12)" } },
          crosshair: { mode: lib.CrosshairMode.Normal },
          rightPriceScale: { borderColor: "rgba(148,163,184,0.25)" },
          timeScale: { borderColor: "rgba(148,163,184,0.25)", timeVisible: true, secondsVisible: false }
        });
        if (mode === "bars") chart.addBarSeries({ upColor: "#22c55e", downColor: "#ef4444" }).setData(data);
        else if (mode === "line") chart.addLineSeries({ color: "#38bdf8", lineWidth: 2 }).setData(data.map((d) => ({ time: d.time, value: d.value })));
        else if (mode === "area") chart.addAreaSeries({ lineColor: "#38bdf8", topColor: "rgba(56,189,248,0.35)", bottomColor: "rgba(56,189,248,0.02)", lineWidth: 2 }).setData(data.map((d) => ({ time: d.time, value: d.value })));
        else chart.addCandlestickSeries({ upColor: "#22c55e", downColor: "#ef4444", borderUpColor: "#86efac", borderDownColor: "#fca5a5", wickUpColor: "#86efac", wickDownColor: "#fca5a5" }).setData(data);
        chart.timeScale().fitContent();
        setStatus("");
      } catch {
        setStatus("Mode graphique local actif.");
        setFallback(true);
      }
    }
    void render();
    const onResize = () => { if (chart && containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth, height: Math.max(280, containerRef.current.clientHeight || 440) }); };
    window.addEventListener("resize", onResize);
    return () => { disposed = true; window.removeEventListener("resize", onResize); if (chart) chart.remove(); };
  }, [candles, mode]);

  return <div className="tv-chart-shell"><div ref={containerRef} className="tv-chart" />{fallback && <FallbackChart candles={candles} mode={mode} />}{status && !fallback && <div className="tv-chart-status">{status}</div>}{status && fallback && <div className="badge" style={{ position: "absolute", left: 10, top: 10 }}>{status}</div>}</div>;
}
