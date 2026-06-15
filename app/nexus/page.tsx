"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Brain, Gauge, Newspaper, RefreshCcw, Settings, ShieldCheck, SlidersHorizontal, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import TradingViewCandleChart from "@/components/TradingViewCandleChart";
import { MarketResponse } from "@/lib/types";

type ChartMode = "candles" | "bars" | "line" | "area";
type Side = "BUY" | "SELL";

const TABS = ["Dashboard", "Market", "News & Sentiment", "Prediction Lab", "Paper Trading", "AI Agents", "Evolution & Learning", "Settings"];
const PAIRS = ["EUR/USD", "GBP/USD", "USD/JPY", "USD/CAD", "AUD/USD", "NZD/USD", "EUR/JPY", "GBP/JPY"];

function price(value?: number | null) {
  if (value == null) return "—";
  return value.toFixed(value > 20 ? 3 : 5);
}

function cad(value: number) {
  return `${value.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $ CAD`;
}

export default function NexusPage() {
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [pair, setPair] = useState("EUR/USD");
  const [interval, setIntervalValue] = useState("5min");
  const [mode, setMode] = useState<ChartMode>("candles");
  const [market, setMarket] = useState<MarketResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Terminal Nexus prêt.");
  const [side, setSide] = useState<Side>("BUY");
  const [volume, setVolume] = useState("1.0");
  const [leverage, setLeverage] = useState("30");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");

  const equity = 10000;
  const balance = 10000;
  const marginUsed = Number(volume || 0) * (market?.price || 1) * 100000 / Number(leverage || 1);
  const freeMargin = Math.max(0, equity - marginUsed);
  const winRate = 62;

  async function loadMarket() {
    const [from, to] = pair.split("/");
    setBusy(true);
    setStatus("Chargement du marché...");
    try {
      const res = await fetch(`/api/market?from=${from}&to=${to}&interval=${interval}`, { cache: "no-store" });
      const data = (await res.json()) as MarketResponse;
      setMarket(data);
      setStatus(data.warning || `${data.pair} chargé depuis ${data.source}.`);
    } catch {
      setStatus("Erreur: impossible de charger les données marché.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void loadMarket();
  }, [pair, interval]);

  const consensus = useMemo(() => {
    const candles = market?.candles || [];
    if (candles.length < 2) return { action: "WAIT", score: 50, bias: "En attente de données" };
    const first = candles[0].close;
    const last = candles.at(-1)?.close || first;
    const change = ((last - first) / first) * 100;
    if (change > 0.08) return { action: "BUY", score: 74, bias: "Biais haussier court terme" };
    if (change < -0.08) return { action: "SELL", score: 71, bias: "Biais baissier court terme" };
    return { action: "WAIT", score: 55, bias: "Range / consolidation" };
  }, [market]);

  return (
    <main className="container master-container">
      <section className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <span className="badge">Nexus AI Trading Lab</span>
            <h1 style={{ marginBottom: 6 }}>GPT Forex <span>Nexus</span></h1>
            <p className="small">Terminal visuel inspiré du ZIP Nexus: métriques compte, onglets, graphique, consensus, paper trading et contrôle débit.</p>
          </div>
          <div className="actions">
            <a className="btn secondary" href="/">Dashboard actuel</a>
            <a className="btn secondary" href="/terminal">Terminal TV</a>
            <a className="btn secondary" href="/history">Import Data</a>
          </div>
        </div>
      </section>

      <section className="grid grid4" style={{ marginBottom: 16 }}>
        <div className="kpi"><div className="name"><Wallet size={14} /> Balance</div><div className="value">{cad(balance)}</div></div>
        <div className="kpi"><div className="name">Équité</div><div className="value green">{cad(equity)}</div></div>
        <div className="kpi"><div className="name">Marge utilisée</div><div className="value yellow">{cad(marginUsed)}</div></div>
        <div className="kpi"><div className="name">Win rate</div><div className="value">{winRate}%</div></div>
      </section>

      <section className="card" style={{ marginBottom: 16, padding: 12 }}>
        <div className="actions" style={{ gap: 8 }}>
          {TABS.map((tab) => (
            <button key={tab} className={activeTab === tab ? "btn green" : "btn secondary"} onClick={() => setActiveTab(tab)} style={{ minHeight: 42, padding: "9px 12px" }}>{tab}</button>
          ))}
        </div>
      </section>

      <section className="grid" style={{ gridTemplateColumns: "260px minmax(0,1fr) 330px", marginBottom: 16 }}>
        <div className="card">
          <h2><Activity size={20} /> Market</h2>
          <label>Actif</label>
          <select className="select" value={pair} onChange={(event) => setPair(event.target.value)}>{PAIRS.map((item) => <option key={item}>{item}</option>)}</select>
          <label style={{ marginTop: 10 }}>Timeframe</label>
          <select className="select" value={interval} onChange={(event) => setIntervalValue(event.target.value)}><option value="1min">M1</option><option value="5min">M5</option><option value="15min">M15</option><option value="30min">M30</option><option value="60min">H1</option></select>
          <label style={{ marginTop: 10 }}>Graphique</label>
          <select className="select" value={mode} onChange={(event) => setMode(event.target.value as ChartMode)}><option value="candles">Candles</option><option value="bars">OHLC</option><option value="line">Line</option><option value="area">Area</option></select>
          <button className="btn green" onClick={loadMarket} disabled={busy} style={{ width: "100%", marginTop: 12 }}><RefreshCcw size={16} /> Rafraîchir</button>
          <div className="system-list" style={{ marginTop: 16 }}>
            <div><b>Prix</b><span>{price(market?.price)}</span></div>
            <div><b>Source</b><span>{market?.source || "—"}</span></div>
            <div><b>Chandelles</b><span>{market?.candles?.length || 0}</span></div>
            <div><b>Marge libre</b><span>{cad(freeMargin)}</span></div>
          </div>
        </div>

        <div className="card chart-card">
          <div className="chart-header">
            <div>
              <h2>Graphique principal</h2>
              <p className="small">Indicateurs légende: EMA, tendance, range, volatilité. Crosshair et zoom TradingView.</p>
            </div>
            <div className="indicator-actions"><span className="badge">EMA 9</span><span className="badge">EMA 21</span><span className="badge">Range</span><span className="badge">Volatility</span></div>
          </div>
          <TradingViewCandleChart candles={market?.candles || []} mode={mode} />
          <p className="warning" style={{ marginTop: 12 }}>{status}</p>
        </div>

        <div className="card">
          <h2><Brain size={20} /> Consensus des agents</h2>
          <div className="kpi"><div className="name">Décision IA</div><div className={`value ${consensus.action === "BUY" ? "green" : consensus.action === "SELL" ? "red" : "yellow"}`}>{consensus.action}</div></div>
          <div className="kpi" style={{ marginTop: 10 }}><div className="name">Confiance</div><div className="value">{consensus.score}%</div></div>
          <p className="small">{consensus.bias}</p>
          {[
            ["Market Watcher", "Structure", consensus.score],
            ["Scalping Agent", "M1/M5", Math.max(45, consensus.score - 7)],
            ["News Analyst", "Macro", 58],
            ["Risk Manager", "Marge/Risque", 64]
          ].map(([name, role, score]) => <div className="agent" key={String(name)}><b>{name}</b><br /><span className="badge">{role} · {score}%</span></div>)}
        </div>
      </section>

      <section className="grid" style={{ gridTemplateColumns: "340px minmax(0,1fr)", marginBottom: 16 }}>
        <div className="card">
          <h2><ShieldCheck size={20} /> Passer un ordre PaperTrader</h2>
          <div className="grid grid2"><button className={side === "BUY" ? "btn green" : "btn secondary"} onClick={() => setSide("BUY")}><TrendingUp size={16} /> BUY</button><button className={side === "SELL" ? "btn red" : "btn secondary"} onClick={() => setSide("SELL")}><TrendingDown size={16} /> SELL</button></div>
          <label style={{ marginTop: 12 }}>Volume lots</label><input className="input" value={volume} onChange={(e) => setVolume(e.target.value.replace(/[^0-9.]/g, ""))} />
          <label style={{ marginTop: 12 }}>Levier</label><input className="input" value={leverage} onChange={(e) => setLeverage(e.target.value.replace(/[^0-9]/g, ""))} />
          <div className="grid grid2" style={{ marginTop: 12 }}><div><label>Stop loss</label><input className="input" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} placeholder="Optionnel" /></div><div><label>Take profit</label><input className="input" value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} placeholder="Optionnel" /></div></div>
          <button className="btn green" style={{ width: "100%", marginTop: 14 }}>Négocier sur compte démo</button>
        </div>

        <div className="card">
          <h2><Gauge size={20} /> Contrôle débit / Simulation</h2>
          <div className="grid grid4">
            <div className="kpi"><div className="name">Tick Speed</div><div className="value">1.5s</div></div>
            <div className="kpi"><div className="name">Volatilité</div><div className="value yellow">1.0x</div></div>
            <div className="kpi"><div className="name">Agent learning</div><div className="value green">ON</div></div>
            <div className="kpi"><div className="name">Mode</div><div className="value">Paper</div></div>
          </div>
          <div className="grid grid3" style={{ marginTop: 14 }}>
            <div className="agent"><b>Dashboard</b><p className="small">Vue globale du compte et métriques.</p></div>
            <div className="agent"><b>Market</b><p className="small">Graphiques, source, watchlist.</p></div>
            <div className="agent"><b>Settings</b><p className="small">Réglages agents, risque, API, source data.</p></div>
          </div>
        </div>
      </section>

      <section className="card">
        <h2><SlidersHorizontal size={20} /> Settings</h2>
        <div className="grid grid3">
          <div className="agent"><b>Risk Controls</b><p className="small">Risque max, marge, levier, stop obligatoire à venir.</p></div>
          <div className="agent"><b>Data Source</b><p className="small">Supabase historique, Alpha Vantage, fallback spot.</p></div>
          <div className="agent"><b>AI Agents</b><p className="small">Activer/désactiver Market Watcher, Scalper, News, Risk.</p></div>
        </div>
      </section>
    </main>
  );
}
