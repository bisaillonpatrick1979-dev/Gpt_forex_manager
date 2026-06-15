"use client";

import { useEffect, useState } from "react";
import { Activity, Database, RefreshCcw } from "lucide-react";
import TradingViewCandleChart from "@/components/TradingViewCandleChart";
import { MarketResponse } from "@/lib/types";

type ChartMode = "candles" | "bars" | "line" | "area";

const PAIRS = ["EUR/USD", "GBP/USD", "USD/JPY", "USD/CAD", "AUD/USD", "NZD/USD", "EUR/JPY", "GBP/JPY"];

function price(value?: number | null) {
  if (value == null) return "—";
  return value.toFixed(value > 20 ? 3 : 5);
}

export default function TerminalPage() {
  const [pair, setPair] = useState("EUR/USD");
  const [interval, setIntervalValue] = useState("5min");
  const [mode, setMode] = useState<ChartMode>("candles");
  const [market, setMarket] = useState<MarketResponse | null>(null);
  const [status, setStatus] = useState("Chargement du terminal...");
  const [busy, setBusy] = useState(false);

  async function loadMarket() {
    const [from, to] = pair.split("/");
    setBusy(true);
    setStatus("Chargement des chandelles...");
    try {
      const res = await fetch(`/api/market?from=${from}&to=${to}&interval=${interval}`, { cache: "no-store" });
      const data = (await res.json()) as MarketResponse;
      setMarket(data);
      setStatus(data.warning || `Marché chargé: ${data.pair}`);
    } catch {
      setStatus("Erreur: impossible de charger le marché.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void loadMarket();
  }, [pair, interval]);

  return (
    <main className="container master-container">
      <section className="hero master-hero">
        <div className="card hero-main">
          <span className="badge">Nexus Terminal</span>
          <span className={`badge ${market?.source === "alpha-vantage" ? "buy" : "hold"}`}>{market?.source === "alpha-vantage" ? "Données réelles" : "Fallback / historique"}</span>
          <h1>Trading <span>Terminal</span></h1>
          <p className="muted">Graphique TradingView Lightweight Charts branché sur les données de l’application. C’est la base du vrai terminal professionnel.</p>
          <div className="warning">Simulation seulement. Aucun trade réel. Aucun conseil financier.</div>
        </div>
        <div className="card status-card">
          <h2><Database size={22} /> État</h2>
          <div className="system-list">
            <div><b>Paire</b><span>{market?.pair || pair}</span></div>
            <div><b>Prix</b><span>{price(market?.price)}</span></div>
            <div><b>Source</b><span>{market?.source || "—"}</span></div>
            <div><b>Chandelles</b><span>{market?.candles?.length || 0}</span></div>
          </div>
          <p className="small">{status}</p>
        </div>
      </section>

      <section className="grid grid3">
        <div className="card">
          <h2>Contrôles</h2>
          <label>Paire</label>
          <select className="select" value={pair} onChange={(event) => setPair(event.target.value)}>
            {PAIRS.map((item) => <option key={item}>{item}</option>)}
          </select>
          <label style={{ marginTop: 10 }}>Timeframe</label>
          <select className="select" value={interval} onChange={(event) => setIntervalValue(event.target.value)}>
            <option value="1min">1 minute</option>
            <option value="5min">5 minutes</option>
            <option value="15min">15 minutes</option>
            <option value="30min">30 minutes</option>
            <option value="60min">1 heure</option>
          </select>
          <label style={{ marginTop: 10 }}>Graphique</label>
          <select className="select" value={mode} onChange={(event) => setMode(event.target.value as ChartMode)}>
            <option value="candles">Chandelles</option>
            <option value="bars">OHLC bars</option>
            <option value="line">Ligne</option>
            <option value="area">Area</option>
          </select>
          <div className="actions" style={{ marginTop: 14 }}>
            <button className="btn green" onClick={loadMarket} disabled={busy}><RefreshCcw size={16} /> Rafraîchir</button>
            <a className="btn secondary" href="/">Dashboard</a>
            <a className="btn secondary" href="/history">Import CSV</a>
          </div>
        </div>
        <div className="card"><h2>Prix</h2><div className="kpi"><div className="name">{market?.pair || pair}</div><div className="value">{price(market?.price)}</div></div></div>
        <div className="card"><h2><Activity size={22} /> Données</h2><div className="kpi"><div className="name">Source</div><div className="value small-value">{market?.source || "—"}</div></div><p className="small">{market?.warning || "Terminal prêt."}</p></div>
      </section>

      <div style={{ height: 18 }} />
      <section className="card chart-card">
        <div className="chart-header">
          <div>
            <h2>Graphique TradingView</h2>
            <p className="small">Zoom, déplacement, crosshair et rendu chandelles professionnel.</p>
          </div>
          <div className="indicator-actions"><span className="badge">Crosshair</span><span className="badge">Zoom</span><span className="badge">Pan</span><span className="badge">OHLC</span></div>
        </div>
        <TradingViewCandleChart candles={market?.candles || []} mode={mode} />
      </section>
    </main>
  );
}
