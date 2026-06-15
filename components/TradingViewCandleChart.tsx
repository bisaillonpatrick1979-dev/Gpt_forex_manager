"use client";

import { useEffect, useRef, useState } from "react";
import { Candle } from "@/lib/types";

type ChartMode = "candles" | "bars" | "line" | "area";

type Props = {
  candles: Candle[];
  mode: ChartMode;
};

type LightweightChartsGlobal = {
  createChart: (element: HTMLElement, options: Record<string, unknown>) => {
    addCandlestickSeries: (options?: Record<string, unknown>) => { setData: (data: unknown[]) => void };
    addBarSeries: (options?: Record<string, unknown>) => { setData: (data: unknown[]) => void };
    addLineSeries: (options?: Record<string, unknown>) => { setData: (data: unknown[]) => void };
    addAreaSeries: (options?: Record<string, unknown>) => { setData: (data: unknown[]) => void };
    timeScale: () => { fitContent: () => void };
    applyOptions: (options: Record<string, unknown>) => void;
    remove: () => void;
  };
  ColorType: { Solid: string };
  CrosshairMode: { Normal: number };
};

declare global {
  interface Window {
    LightweightCharts?: LightweightChartsGlobal;
  }
}

let loadingPromise: Promise<void> | null = null;

function loadChartLibrary() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.LightweightCharts) return Promise.resolve();
  if (loadingPromise) return loadingPromise;

  loadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://unpkg.com/lightweight-charts/dist/lightweight-charts.standalone.production.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("TradingView chart library failed to load"));
    document.head.appendChild(script);
  });

  return loadingPromise;
}

function toTimestamp(value: string) {
  const time = Math.floor(new Date(value).getTime() / 1000);
  return Number.isFinite(time) ? time : Math.floor(Date.now() / 1000);
}

function toSeriesData(candles: Candle[]) {
  return candles
    .filter((candle) => Number.isFinite(candle.close))
    .map((candle) => ({
      time: toTimestamp(candle.time),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      value: candle.close
    }));
}

export default function TradingViewCandleChart({ candles, mode }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState("Chargement du graphique...");

  useEffect(() => {
    let disposed = false;
    let chart: ReturnType<LightweightChartsGlobal["createChart"]> | null = null;

    async function render() {
      try {
        await loadChartLibrary();
        if (disposed || !containerRef.current || !window.LightweightCharts) return;

        containerRef.current.innerHTML = "";
        const data = toSeriesData(candles.slice(-500));

        if (data.length === 0) {
          setStatus("Aucune chandelle disponible.");
          return;
        }

        const lib = window.LightweightCharts;
        chart = lib.createChart(containerRef.current, {
          width: containerRef.current.clientWidth,
          height: 440,
          layout: {
            background: { type: lib.ColorType.Solid, color: "#020617" },
            textColor: "#cbd5e1"
          },
          grid: {
            vertLines: { color: "rgba(148,163,184,0.12)" },
            horzLines: { color: "rgba(148,163,184,0.12)" }
          },
          crosshair: { mode: lib.CrosshairMode.Normal },
          rightPriceScale: { borderColor: "rgba(148,163,184,0.25)" },
          timeScale: { borderColor: "rgba(148,163,184,0.25)", timeVisible: true, secondsVisible: false }
        });

        if (mode === "bars") {
          const series = chart.addBarSeries({ upColor: "#22c55e", downColor: "#ef4444" });
          series.setData(data);
        } else if (mode === "line") {
          const series = chart.addLineSeries({ color: "#38bdf8", lineWidth: 2 });
          series.setData(data.map((item) => ({ time: item.time, value: item.value })));
        } else if (mode === "area") {
          const series = chart.addAreaSeries({ lineColor: "#38bdf8", topColor: "rgba(56,189,248,0.35)", bottomColor: "rgba(56,189,248,0.02)", lineWidth: 2 });
          series.setData(data.map((item) => ({ time: item.time, value: item.value })));
        } else {
          const series = chart.addCandlestickSeries({ upColor: "#22c55e", downColor: "#ef4444", borderUpColor: "#86efac", borderDownColor: "#fca5a5", wickUpColor: "#86efac", wickDownColor: "#fca5a5" });
          series.setData(data);
        }

        chart.timeScale().fitContent();
        setStatus("");
      } catch {
        setStatus("Graphique TradingView indisponible. Le réseau bloque peut-être le chargement CDN.");
      }
    }

    void render();

    const onResize = () => {
      if (chart && containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    };
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      if (chart) chart.remove();
    };
  }, [candles, mode]);

  return (
    <div className="tv-chart-shell">
      <div ref={containerRef} className="tv-chart" />
      {status && <div className="tv-chart-status">{status}</div>}
    </div>
  );
}
