"use client";

import { useEffect, useState } from "react";
import { Activity, ArrowLeft, RefreshCcw, ShieldCheck } from "lucide-react";
import MasterAgentPanel from "@/components/MasterAgentPanel";
import BacktestAuditorPanel from "@/components/BacktestAuditorPanel";
import TradingViewCandleChart from "@/components/TradingViewCandleChart";
import { MarketResponse } from "@/lib/types";
import { riskPolicy } from "@/lib/firm-config";

const pairs = ["EUR/USD", "GBP/USD", "USD/JPY", "USD/CAD", "AUD/USD", "NZD/USD", "EUR/JPY", "GBP/JPY"];
const intervals = [
  ["1min", "M1"],
  ["5min", "M5"],
  ["15min", "M15"],
  ["30min", "M30"],
  ["60min", "H1"]
] as const;

export default function QuantDirectorPage() {
  const [pair, setPair] = useState("EUR/USD");
  const [interval, setInterval] = useState("5min");
  const [capital, setCapital] = useState("10000");
  const [market, setMarket] = useState<MarketResponse | null>(null);
  const [apiConfigured, setApiConfigured] = useState(false);
  const [status, setStatus] = useState("Chargement...");

  async function loadMarket() {
    const [from, to] = pair.split("/");
    setStatus("Chargement du marché...");
    try {
      const response = await fetch(`/api/market?from=${from}&to=${to}&interval=${interval}`, { cache: "no-store" });
      const data = await response.json() as MarketResponse;
      setMarket(data);
      setStatus(data.warning || `${data.pair} chargé depuis ${data.source}.`);
    } catch {
      setMarket(null);
      setStatus("Impossible de charger le marché.");
    }
  }

  async function loadRegistry() {
    try {
      const response = await fetch("/api/agents/registry", { cache: "no-store" });
      const data = await response.json() as { openAiApiConfigured?: boolean };
      setApiConfigured(Boolean(data.openAiApiConfigured));
    } catch {
      setApiConfigured(false);
    }
  }

  useEffect(() => {
    void loadMarket();
  }, [pair, interval]);

  useEffect(() => {
    void loadRegistry();
  }, []);

  return (
    <main className="container director-page">
      <header className="card director-page-header">
        <div>
          <a className="btn secondary compact-button" href="/"><ArrowLeft size={16} /> Retour à la firme</a>
          <div className="eyebrow director-eyebrow">Poste de commandement</div>
          <h1 className="firm-title">Chaîne quantitative <span>5 agents actifs</span></h1>
          <p className="muted">Les données, le régime, les hypothèses et l’audit hostile précèdent toute future allocation ou gestion du risque.</p>
        </div>
        <div className="director-policy">
          <span className="badge buy">Paper trading seulement</span>
          <span className="badge sell">Aucun ordre réel</span>
          <span className="badge">Veto du risque obligatoire</span>
        </div>
      </header>

      <section className="grid director-market-layout">
        <div className="card">
          <h2><Activity size={20} /> Contexte du mandat</h2>
          <label>Paire étudiée</label>
          <select className="select" value={pair} onChange={(event) => setPair(event.target.value)}>
            {pairs.map((item) => <option key={item}>{item}</option>)}
          </select>
          <label>Horizon</label>
          <select className="select" value={interval} onChange={(event) => setInterval(event.target.value)}>
            {intervals.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <label>Capital fictif en dollars canadiens</label>
          <input className="input" inputMode="decimal" value={capital} onChange={(event) => setCapital(event.target.value.replace(/[^0-9.]/g, ""))} />
          <button className="btn secondary full-button" onClick={loadMarket}><RefreshCcw size={16} /> Actualiser le contexte</button>
          <div className="system-list director-facts">
            <div><b>Source</b><span>{market?.source || "—"}</span></div>
            <div><b>Chandelles</b><span>{market?.candles.length || 0}</span></div>
            <div><b>Risque maximal</b><span>{riskPolicy.maxRiskPerTradePercent} %</span></div>
            <div><b>Levier maximal</b><span>{riskPolicy.maxLeverage}×</span></div>
          </div>
          <div className="warning">{status}</div>
        </div>

        <div className="card chart-card director-chart-card">
          <h2><ShieldCheck size={20} /> Données transmises à la chaîne</h2>
          <TradingViewCandleChart candles={market?.candles || []} mode="candles" />
        </div>
      </section>

      <MasterAgentPanel
        pair={pair}
        interval={interval}
        capitalCad={Math.max(1, Number(capital) || 10000)}
        market={market}
        apiConfigured={apiConfigured}
      />

      <BacktestAuditorPanel
        pair={pair}
        interval={interval}
        market={market}
        apiConfigured={apiConfigured}
      />
    </main>
  );
}
