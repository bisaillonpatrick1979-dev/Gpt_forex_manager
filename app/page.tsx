"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, Brain, Database, ShieldCheck } from "lucide-react";
import { AiAnalysis, Candle, MarketResponse } from "@/lib/types";
import { calculateMarketStats, getPipSize } from "@/lib/market";

type TradeSide = "BUY" | "SELL";

type PaperTrade = {
  id: string;
  pair: string;
  side: TradeSide;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  confidence: number;
  openedAt: string;
  status: "OPEN" | "CLOSED";
  exit?: number;
  pnlCad?: number;
  pips?: number;
  lesson?: string;
};

type TradeResponse = {
  enabled: boolean;
  reason?: string;
  trades?: PaperTrade[];
};

type AnalysisSaveResponse = {
  enabled: boolean;
  saved?: boolean;
  reason?: string;
};

const PAIRS = [
  ["EUR", "USD"],
  ["GBP", "USD"],
  ["USD", "JPY"],
  ["USD", "CAD"],
  ["AUD", "USD"],
  ["NZD", "USD"],
  ["EUR", "JPY"],
  ["GBP", "JPY"]
];

function money(value: number) {
  return `${value.toFixed(2)} $ CAD`;
}

function price(value?: number | null) {
  if (value == null) return "—";
  return value.toFixed(value > 20 ? 3 : 5);
}

function Chart({ candles }: { candles: Candle[] }) {
  const visible = candles.slice(-52);
  const high = Math.max(...visible.map((c) => c.high));
  const low = Math.min(...visible.map((c) => c.low));
  const range = high - low || 1;

  return (
    <div className="chart">
      {visible.map((candle) => {
        const height = Math.max(4, ((candle.high - candle.low) / range) * 100);
        const up = candle.close >= candle.open;
        return (
          <div
            key={candle.time}
            className={`bar ${up ? "buy" : "sell"}`}
            style={{ height: `${height}%` }}
            title={`${candle.time} ${candle.close}`}
          />
        );
      })}
    </div>
  );
}

export default function HomePage() {
  const [from, setFrom] = useState("EUR");
  const [to, setTo] = useState("USD");
  const [interval, setInterval] = useState("5min");
  const [accountCad, setAccountCad] = useState(1000);
  const [notes, setNotes] = useState("");
  const [market, setMarket] = useState<MarketResponse | null>(null);
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [memoryEnabled, setMemoryEnabled] = useState(false);
  const [memoryMessage, setMemoryMessage] = useState("Mémoire locale seulement");
  const initializedRef = useRef(false);

  async function saveTradesToCloud(nextTrades: PaperTrade[]) {
    try {
      const res = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trades: nextTrades })
      });

      const data = (await res.json()) as TradeResponse & { saved?: boolean };

      if (data.enabled && data.saved) {
        setMemoryEnabled(true);
        setMemoryMessage(`Supabase connecté · ${nextTrades.length} trade(s) sauvegardés`);
      } else if (data.reason) {
        setMemoryEnabled(false);
        setMemoryMessage(data.reason);
      }
    } catch {
      setMemoryEnabled(false);
      setMemoryMessage("Supabase non disponible · sauvegarde locale active");
    }
  }

  async function saveAnalysisToCloud(nextAnalysis: AiAnalysis) {
    try {
      const res = await fetch("/api/analysis-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis: nextAnalysis })
      });
      const data = (await res.json()) as AnalysisSaveResponse;

      if (data.enabled && data.saved) {
        setMemoryEnabled(true);
        setMemoryMessage("Supabase connecté · analyse sauvegardée");
      } else if (data.reason) {
        setMemoryMessage(data.reason);
      }
    } catch {
      setMemoryMessage("Analyse gardée localement seulement");
    }
  }

  useEffect(() => {
    async function hydrateMemory() {
      let localTrades: PaperTrade[] = [];

      try {
        localTrades = JSON.parse(localStorage.getItem("gpt-forex-paper-trades") || "[]") as PaperTrade[];
        setTrades(localTrades);
      } catch {
        localTrades = [];
        setTrades([]);
      }

      try {
        const res = await fetch("/api/data", { cache: "no-store" });
        const data = (await res.json()) as TradeResponse;

        setMemoryEnabled(Boolean(data.enabled));

        if (data.enabled && Array.isArray(data.trades)) {
          if (data.trades.length > 0) {
            setTrades(data.trades);
            localStorage.setItem("gpt-forex-paper-trades", JSON.stringify(data.trades));
            setMemoryMessage(`Supabase connecté · ${data.trades.length} trade(s) chargés`);
          } else {
            setMemoryMessage("Supabase connecté · aucun trade sauvegardé");
            if (localTrades.length > 0) {
              void saveTradesToCloud(localTrades);
            }
          }
        } else {
          setMemoryMessage(data.reason || "Mémoire locale seulement");
        }
      } catch {
        setMemoryEnabled(false);
        setMemoryMessage("Mémoire locale seulement");
      } finally {
        initializedRef.current = true;
      }
    }

    void hydrateMemory();
  }, []);

  useEffect(() => {
    localStorage.setItem("gpt-forex-paper-trades", JSON.stringify(trades));

    if (initializedRef.current && memoryEnabled) {
      void saveTradesToCloud(trades);
    }
  }, [trades, memoryEnabled]);

  async function loadMarket() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(`/api/market?from=${from}&to=${to}&interval=${interval}`, { cache: "no-store" });
      const data = (await res.json()) as MarketResponse;
      setMarket(data);
      setAnalysis(null);
      if (data.warning) setMessage(data.warning);
    } catch {
      setMessage("Erreur marché.");
    } finally {
      setBusy(false);
    }
  }

  async function analyze() {
    if (!market) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pair: market.pair, candles: market.candles, accountCad, notes })
      });
      const data = await res.json();
      if (data.warning) setMessage(data.warning);
      if (data.analysis) {
        const nextAnalysis = data.analysis as AiAnalysis;
        setAnalysis(nextAnalysis);
        void saveAnalysisToCloud(nextAnalysis);
      }
    } catch {
      setMessage("Erreur analyse IA.");
    } finally {
      setBusy(false);
    }
  }

  function openPaperTrade() {
    if (!analysis || !market) return;
    if (analysis.action !== "BUY" && analysis.action !== "SELL") {
      setMessage("Pas de signal assez clair. Aucun trade fictif ouvert.");
      return;
    }

    const side: TradeSide = analysis.action;
    const entry = analysis.entry;
    const stopLoss = analysis.stopLoss;
    const takeProfit = analysis.takeProfit;

    if (entry == null || stopLoss == null || takeProfit == null) return;

    const trade: PaperTrade = {
      id: crypto.randomUUID(),
      pair: market.pair,
      side,
      entry,
      stopLoss,
      takeProfit,
      confidence: analysis.confidence,
      openedAt: new Date().toISOString(),
      status: "OPEN"
    };

    setTrades((old) => [trade, ...old]);
    setMessage("Trade fictif ouvert. Aucun argent réel engagé.");
  }

  function closeTrade(id: string) {
    if (!market) return;
    setTrades((old) =>
      old.map((trade): PaperTrade => {
        if (trade.id !== id || trade.status === "CLOSED") return trade;
        const direction = trade.side === "BUY" ? 1 : -1;
        const pips = ((market.price - trade.entry) / getPipSize(trade.pair)) * direction;
        const pnlCad = pips;
        return {
          ...trade,
          status: "CLOSED",
          exit: market.price,
          pips,
          pnlCad,
          lesson: pnlCad >= 0 ? "Setup gagnant: vérifier si la sortie aurait pu être optimisée." : "Setup perdant: revoir entrée, stop et confirmation."
        };
      })
    );
  }

  async function resetJournal() {
    setTrades([]);
    localStorage.removeItem("gpt-forex-paper-trades");

    if (memoryEnabled) {
      try {
        await fetch("/api/data", { method: "DELETE" });
        setMemoryMessage("Supabase connecté · journal vidé");
      } catch {
        setMemoryMessage("Journal local vidé · erreur Supabase");
      }
    }
  }

  useEffect(() => {
    void loadMarket();
  }, []);

  const stats = useMemo(() => (market ? calculateMarketStats(market.candles) : null), [market]);
  const closed = trades.filter((trade) => trade.status === "CLOSED");
  const open = trades.filter((trade) => trade.status === "OPEN");
  const pnl = closed.reduce((sum, trade) => sum + (trade.pnlCad || 0), 0);
  const winRate = closed.length ? (closed.filter((trade) => (trade.pnlCad || 0) > 0).length / closed.length) * 100 : 0;
  const actionClass = analysis?.action === "BUY" ? "buy" : analysis?.action === "SELL" ? "sell" : "hold";

  return (
    <main className="container">
      <section className="hero">
        <div className="card">
          <span className="badge">AI Forex Paper Trading</span>
          <span className="badge">OpenAI</span>
          <span className="badge">Alpha Vantage</span>
          <span className={`badge ${memoryEnabled ? "buy" : "hold"}`}><Database size={14} /> {memoryEnabled ? "Supabase Memory" : "Local Memory"}</span>
          <h1>GPT Forex <span>Manager</span></h1>
          <p className="muted">Application IA pour analyser le Forex, proposer des setups, ouvrir des trades fictifs et apprendre des erreurs dans un journal sauvegardé.</p>
          <div className="warning">Simulation seulement. Aucun trade réel. Aucun conseil financier.</div>
        </div>
        <div className="card">
          <h2>Compte fictif</h2>
          <label>Capital</label>
          <input className="input" type="number" value={accountCad} onChange={(event) => setAccountCad(Number(event.target.value || 0))} />
          <div className="grid grid2" style={{ marginTop: 14 }}>
            <div className="kpi"><div className="name">P/L fictif</div><div className={`value ${pnl >= 0 ? "green" : "red"}`}>{money(pnl)}</div></div>
            <div className="kpi"><div className="name">Win rate</div><div className="value yellow">{winRate.toFixed(0)} %</div></div>
          </div>
          <p className="small">{memoryMessage}</p>
        </div>
      </section>

      <section className="grid grid3">
        <div className="card">
          <h2>Marché</h2>
          <label>Paire</label>
          <select className="select" value={`${from}/${to}`} onChange={(event) => { const [a, b] = event.target.value.split("/"); setFrom(a); setTo(b); }}>
            {PAIRS.map(([a, b]) => <option key={`${a}/${b}`}>{a}/{b}</option>)}
          </select>
          <label style={{ marginTop: 10 }}>Intervalle</label>
          <select className="select" value={interval} onChange={(event) => setInterval(event.target.value)}>
            <option value="1min">1 minute</option>
            <option value="5min">5 minutes</option>
            <option value="15min">15 minutes</option>
            <option value="30min">30 minutes</option>
            <option value="60min">60 minutes</option>
          </select>
          <div className="actions" style={{ marginTop: 14 }}>
            <button className="btn" onClick={loadMarket} disabled={busy}>Rafraîchir</button>
            <button className="btn secondary" onClick={analyze} disabled={busy || !market}>Analyser IA</button>
          </div>
          {message && <p className="warning">{message}</p>}
        </div>
        <div className="card"><h2>Prix</h2><div className="kpi"><div className="name">{market?.pair || `${from}/${to}`}</div><div className="value">{price(market?.price)}</div></div><p className="small">Source: {market?.source || "—"}</p></div>
        <div className="card"><h2>Mouvement</h2><div className="kpi"><div className="name">Variation</div><div className={`value ${stats && stats.change >= 0 ? "green" : "red"}`}>{stats ? `${stats.changePercent.toFixed(2)} %` : "—"}</div></div></div>
      </section>

      <div style={{ height: 18 }} />
      <section className="grid grid2">
        <div className="card"><h2><Activity size={22} /> Chandelles</h2>{market ? <Chart candles={market.candles} /> : <div className="chart" />}</div>
        <div className="card"><h2><Brain size={22} /> Notes IA</h2><textarea className="textarea" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ex: évite les trades avant nouvelles économiques, cherche fausse cassure, risque faible..." /></div>
      </section>

      <div style={{ height: 18 }} />
      <section className="grid grid2">
        <div className="card">
          <h2><ShieldCheck size={22} /> Décision IA</h2>
          {!analysis ? <p className="small">Clique Analyser IA.</p> : <>
            <span className={`badge ${actionClass}`}>Action: {analysis.action}</span><span className="badge">Confiance: {analysis.confidence}%</span><span className="badge">Risque max: {analysis.maxRiskPercent}%</span>
            <div className="grid grid3"><div className="kpi"><div className="name">Entrée</div><div className="value">{price(analysis.entry)}</div></div><div className="kpi"><div className="name">Stop</div><div className="value red">{price(analysis.stopLoss)}</div></div><div className="kpi"><div className="name">Profit</div><div className="value green">{price(analysis.takeProfit)}</div></div></div>
            <p>{analysis.marketBias}</p><p className="small">{analysis.finalDecision}</p><button className="btn green" onClick={openPaperTrade}>Ouvrir trade fictif</button>
          </>}
        </div>
        <div className="card"><h2>Agents spécialisés</h2>{analysis?.agents?.map((agent) => <div className="agent" key={agent.name}><b>{agent.name}</b><br /><span className="badge">{agent.vote} · {agent.confidence}%</span><p className="small">{agent.note}</p></div>) || <p className="small">Aucun agent chargé.</p>}</div>
      </section>

      <div style={{ height: 18 }} />
      <section className="card">
        <h2>Journal paper trading</h2>
        <div className="actions">
          <span className="badge">Ouverts: {open.length}</span>
          <span className="badge">Fermés: {closed.length}</span>
          <span className={`badge ${memoryEnabled ? "buy" : "hold"}`}>{memoryEnabled ? "Cloud actif" : "Local actif"}</span>
          <button className="btn secondary" onClick={resetJournal}>Réinitialiser</button>
        </div>
        <div className="grid grid2" style={{ marginTop: 14 }}>
          {trades.length === 0 ? <p className="small">Aucun trade fictif.</p> : trades.map((trade) => <div className="trade" key={trade.id}>
            <b>{trade.side} {trade.pair}</b> <span className={`badge ${trade.status === "OPEN" ? "hold" : (trade.pnlCad || 0) >= 0 ? "buy" : "sell"}`}>{trade.status}</span>
            <p className="small">Entrée {price(trade.entry)} · Stop {price(trade.stopLoss)} · Target {price(trade.takeProfit)}</p>
            {trade.status === "OPEN" ? <button className="btn secondary" onClick={() => closeTrade(trade.id)}>Fermer au prix actuel</button> : <p className="small">{money(trade.pnlCad || 0)} · {trade.pips?.toFixed(1)} pips · {trade.lesson}</p>}
          </div>)}
        </div>
      </section>
    </main>
  );
}
