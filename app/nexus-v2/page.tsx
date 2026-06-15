"use client";

import { useEffect, useState } from "react";
import { Activity, Brain, Gauge, RefreshCcw, ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";
import TradingViewCandleChart from "@/components/TradingViewCandleChart";
import { MarketResponse } from "@/lib/types";

const tabs = ["Dashboard", "Markets", "News & Sentiment", "Prediction Lab", "Paper Trading", "Agents IA", "Evolution & Learn", "Settings"];
const pairs = ["EUR/USD", "GBP/USD", "USD/JPY", "USD/CAD", "AUD/USD", "NZD/USD", "EUR/JPY", "GBP/JPY"];

type ChartMode = "candles" | "bars" | "line" | "area";
type Side = "BUY" | "SELL";

function price(value?: number | null) {
  if (value == null) return "—";
  return value.toFixed(value > 20 ? 3 : 5);
}

function cad(value: number) {
  return `${value.toLocaleString("en-CA", { maximumFractionDigits: 2 })} $ CAD`;
}

export default function NexusV2Page() {
  const [tab, setTab] = useState("Dashboard");
  const [pair, setPair] = useState("EUR/USD");
  const [interval, setInterval] = useState("5min");
  const [mode, setMode] = useState<ChartMode>("candles");
  const [market, setMarket] = useState<MarketResponse | null>(null);
  const [side, setSide] = useState<Side>("BUY");
  const [volume, setVolume] = useState("1");
  const [leverage, setLeverage] = useState("30");
  const [tick, setTick] = useState("2500");
  const [volatility, setVolatility] = useState("3.8");
  const [status, setStatus] = useState("Terminal prêt.");

  const balance = 10000;
  const equity = 10000;
  const margin = Number(volume || 0) * (market?.price || 1) * 100000 / Number(leverage || 1);

  async function loadMarket() {
    const [from, to] = pair.split("/");
    setStatus("Chargement du marché...");
    try {
      const res = await fetch(`/api/market?from=${from}&to=${to}&interval=${interval}`, { cache: "no-store" });
      const data = await res.json() as MarketResponse;
      setMarket(data);
      setStatus(data.warning || `${data.pair} chargé depuis ${data.source}`);
    } catch {
      setStatus("Erreur de chargement du marché.");
    }
  }

  useEffect(() => { void loadMarket(); }, [pair, interval]);

  return (
    <main className="container master-container">
      <div style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(15,23,42,.97)", borderBottom: "1px solid rgba(148,163,184,.18)", margin: "-18px -18px 18px", padding: "12px 18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <div className="actions"><span className="badge buy">● Agent engines: active</span><span className="badge">Paper trading only</span></div>
          <div className="actions"><button className="btn secondary" onClick={loadMarket} style={{ minHeight: 34, padding: "7px 12px" }}><RefreshCcw size={14} /> Next Tick</button><span className="badge">UTC {new Date().toISOString().slice(11, 19)}</span></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(280px,1.4fr) repeat(4,minmax(145px,.55fr))", gap: 12 }}>
          <div className="card" style={{ padding: 14, boxShadow: "none" }}><h2 style={{ margin: 0 }}><Brain size={24} /> Laboratoire de Prédiction Forex / Nasdaq</h2><p className="small" style={{ margin: 0 }}>IA Multi-Agents & Simulation Quant</p></div>
          <div className="kpi"><div className="name">Balance compte</div><div className="value small-value">{cad(balance)}</div></div>
          <div className="kpi"><div className="name">Equity</div><div className="value small-value green">{cad(equity)}</div></div>
          <div className="kpi"><div className="name">Marge utilisée</div><div className="value small-value yellow">{cad(margin)}</div></div>
          <div className="kpi"><div className="name">Win rate</div><div className="value small-value">62%</div></div>
        </div>
        <div className="actions" style={{ flexWrap: "nowrap", overflowX: "auto", marginTop: 12 }}>
          {tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={tab === item ? "btn green" : "btn secondary"} style={{ minHeight: 40, flex: "0 0 auto", padding: "8px 12px" }}>{item}</button>)}
        </div>
      </div>

      {tab === "Dashboard" && <>
        <section className="card" style={{ marginBottom: 16 }}><span className="badge buy">Laboratoire de simulation active</span><span className="badge yellow">Era: Hyper2020</span><span className="badge buy">Automations: PLAY</span><span className="badge buy">Alertes de flux: ON</span></section>
        <section className="grid" style={{ gridTemplateColumns: "minmax(0,2fr) 430px", marginBottom: 16 }}>
          <div className="card chart-card"><div className="chart-header"><div><h2>Nasdaq / Forex Monitor</h2><p className="small">Formation directe retenue : canal AI</p></div><div className="indicator-actions"><span className="badge">Bougies</span><span className="badge">Bollinger</span><span className="badge">Fibonacci</span><span className="badge">Pivot S/R</span></div></div><TradingViewCandleChart candles={market?.candles || []} mode={mode} /><p className="warning" style={{ marginTop: 12 }}>{status}</p></div>
          <div className="card"><h2><Gauge size={20} /> Contrôle des Flux Infinis & Vitesse</h2><div className="warning">Défilement automatique · génération continue</div><label>Fréquence du tick: {tick} ms</label><input type="range" min="100" max="4000" value={tick} onChange={(e) => setTick(e.target.value)} style={{ width: "100%" }} /><label>Intensité volatilité: {volatility}x</label><input type="range" min="0.2" max="5" step="0.1" value={volatility} onChange={(e) => setVolatility(e.target.value)} style={{ width: "100%" }} /><div className="grid grid2" style={{ marginTop: 12 }}><div className="kpi"><div className="name">Automations</div><div className="value green">PLAY</div></div><div className="kpi"><div className="name">Flux</div><div className="value green">ON</div></div></div></div>
        </section>
        <section className="grid" style={{ gridTemplateColumns: "350px minmax(0,1fr)" }}>
          <div className="card"><h2><ShieldCheck size={20} /> Passer un ordre PaperTrader</h2><div className="grid grid2"><button className={side === "BUY" ? "btn green" : "btn secondary"} onClick={() => setSide("BUY")}><TrendingUp size={16} /> Acheter</button><button className={side === "SELL" ? "btn red" : "btn secondary"} onClick={() => setSide("SELL")}><TrendingDown size={16} /> Vendeur</button></div><label>Lots</label><input className="input" value={volume} onChange={(e) => setVolume(e.target.value.replace(/[^0-9.]/g, ""))} /><label>Levier</label><input className="input" value={leverage} onChange={(e) => setLeverage(e.target.value.replace(/[^0-9]/g, ""))} /><button className="btn green" style={{ width: "100%", marginTop: 14 }}>Négocier sur compte démo</button></div>
          <div className="card"><h2>Consensus des agents</h2><div className="grid grid4"><div className="kpi"><div className="name">Signal</div><div className="value green">BUY</div></div><div className="kpi"><div className="name">Confiance</div><div className="value">74%</div></div><div className="kpi"><div className="name">Risque</div><div className="value yellow">Moyen</div></div><div className="kpi"><div className="name">Mode</div><div className="value">Paper</div></div></div></div>
        </section>
      </>}

      {tab !== "Dashboard" && <section className="grid" style={{ gridTemplateColumns: "340px minmax(0,1fr)" }}><div className="card"><h2>{tab}</h2>{pairs.map((p) => <button key={p} className={pair === p ? "btn green" : "btn secondary"} onClick={() => setPair(p)} style={{ width: "100%", marginBottom: 8, justifyContent: "space-between" }}><span>{p}</span><span>{p === pair ? price(market?.price) : "—"}</span></button>)}</div><div className="card"><h2>Workspace {tab}</h2><p className="muted">Section prête pour brancher les fonctions réelles: news, prédictions, paper trades, agents, apprentissage et settings.</p><div className="grid grid3"><div className="agent"><b>Market Watcher</b><p className="small">Analyse structure.</p></div><div className="agent"><b>Risk Manager</b><p className="small">Marge et risque.</p></div><div className="agent"><b>Learning Agent</b><p className="small">Mémoire des erreurs.</p></div></div></div></section>}
    </main>
  );
}
