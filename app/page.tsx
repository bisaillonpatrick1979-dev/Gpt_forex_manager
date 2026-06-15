"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, Bell, Brain, Database, LineChart, PlayCircle, RefreshCcw, ShieldCheck, Target, Zap } from "lucide-react";
import { AiAnalysis, Candle, MarketResponse } from "@/lib/types";
import { calculateMarketStats, getPipSize } from "@/lib/market";

type TradeSide = "BUY" | "SELL";
type ChartMode = "candles" | "bars" | "line" | "area";

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

type PredictionResultRow = {
  id: string;
  pair: string;
  action: "BUY" | "SELL" | "HOLD" | "WAIT";
  confidence: number;
  horizon_minutes: number;
  start_price: number;
  end_price: number | null;
  pips: number | null;
  success: boolean | null;
  status: "PENDING" | "DONE" | "ERROR";
  predicted_at: string;
  checked_at: string | null;
};

type WatchSummary = {
  enabled?: boolean;
  reason?: string;
  summary?: {
    total: number;
    done: number;
    pending: number;
    wins: number;
    losses: number;
    successRate: number;
    netPips: number;
  };
  rows?: PredictionResultRow[];
};

type WatchResponse = {
  ok?: boolean;
  ranAt?: string;
  pairs?: string[];
  created?: Array<{
    pair: string;
    action: string;
    confidence: number;
    price: number;
    source?: string;
    saved?: { saved?: boolean; count?: number; reason?: string };
  }>;
  evaluation?: { checked?: number; updated?: number; reason?: string };
  results?: WatchSummary;
  errors?: Array<{ pair: string; error: string }>;
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

const MASTER_MODULES = [
  { title: "Pro Chart", detail: "Chandelles, barres, ligne, area, multi-timeframe", icon: LineChart },
  { title: "AI Committee", detail: "Agents structure, risque, apprentissage", icon: Brain },
  { title: "Scanner", detail: "Watchlist Forex et signaux filtrés", icon: Zap },
  { title: "Backtest", detail: "Résultats 5/15/30/60 minutes", icon: Activity },
  { title: "Risk Desk", detail: "Stop, target, risque max, pips", icon: ShieldCheck },
  { title: "Alerts", detail: "Signaux, seuils, webhooks à venir", icon: Bell }
];

function money(value: number) {
  return `${value.toFixed(2)} $ CAD`;
}

function price(value?: number | null) {
  if (value == null) return "—";
  return value.toFixed(value > 20 ? 3 : 5);
}

function pips(value?: number | null) {
  if (value == null) return "—";
  return `${value.toFixed(1)} pips`;
}

function timeLabel(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function sma(values: number[], period: number) {
  if (values.length < period) return null;
  return values.slice(-period).reduce((sum, value) => sum + value, 0) / period;
}

function ProfessionalChart({ candles, mode }: { candles: Candle[]; mode: ChartMode }) {
  const visible = candles.slice(-72);
  if (visible.length === 0) {
    return <div className="chart empty-chart">Aucune chandelle chargée.</div>;
  }

  const high = Math.max(...visible.map((c) => c.high));
  const low = Math.min(...visible.map((c) => c.low));
  const range = high - low || 1;
  const scale = (value: number) => ((high - value) / range) * 100;
  const closes = visible.map((c) => c.close);
  const points = visible.map((candle, index) => {
    const x = (index / Math.max(1, visible.length - 1)) * 100;
    const y = scale(candle.close);
    return `${x},${y}`;
  }).join(" ");
  const areaPoints = `0,100 ${points} 100,100`;
  const last = visible.at(-1)!;
  const emaFast = sma(closes, 9);
  const emaSlow = sma(closes, 21);

  if (mode === "line" || mode === "area") {
    return (
      <div className="chart pro-chart">
        <svg className="line-plot" viewBox="0 0 100 100" preserveAspectRatio="none">
          {mode === "area" && <polygon points={areaPoints} className="area-fill" />}
          <polyline points={points} className="price-line" />
        </svg>
        <div className="chart-price-tag">{price(last.close)}</div>
      </div>
    );
  }

  return (
    <div className="chart pro-chart">
      <div className="chart-scale top">H {price(high)}</div>
      <div className="chart-scale bottom">L {price(low)}</div>
      {visible.map((candle) => {
        const up = candle.close >= candle.open;
        const wickTop = scale(candle.high);
        const wickBottom = scale(candle.low);
        const bodyTop = Math.min(scale(candle.open), scale(candle.close));
        const bodyBottom = Math.max(scale(candle.open), scale(candle.close));
        const bodyHeight = Math.max(1.2, bodyBottom - bodyTop);

        if (mode === "bars") {
          return (
            <div className="candle-slot" key={candle.time} title={`${candle.time} O ${price(candle.open)} H ${price(candle.high)} L ${price(candle.low)} C ${price(candle.close)}`}>
              <span className={`ohlc-bar ${up ? "up" : "down"}`} style={{ top: `${wickTop}%`, height: `${Math.max(1, wickBottom - wickTop)}%` }} />
            </div>
          );
        }

        return (
          <div className="candle-slot" key={candle.time} title={`${candle.time} O ${price(candle.open)} H ${price(candle.high)} L ${price(candle.low)} C ${price(candle.close)}`}>
            <span className={`wick ${up ? "up" : "down"}`} style={{ top: `${wickTop}%`, height: `${Math.max(1, wickBottom - wickTop)}%` }} />
            <span className={`candle-body ${up ? "up" : "down"}`} style={{ top: `${bodyTop}%`, height: `${bodyHeight}%` }} />
          </div>
        );
      })}
      <div className="chart-price-tag">{price(last.close)}</div>
      <div className="indicator-strip">
        <span>EMA 9: {price(emaFast)}</span>
        <span>EMA 21: {price(emaSlow)}</span>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [from, setFrom] = useState("EUR");
  const [to, setTo] = useState("USD");
  const [interval, setIntervalValue] = useState("5min");
  const [chartMode, setChartMode] = useState<ChartMode>("candles");
  const [accountInput, setAccountInput] = useState("1000");
  const accountCad = Number(accountInput || 0);
  const [notes, setNotes] = useState("");
  const [market, setMarket] = useState<MarketResponse | null>(null);
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [memoryEnabled, setMemoryEnabled] = useState(false);
  const [memoryMessage, setMemoryMessage] = useState("Mémoire locale seulement");
  const [liveMode, setLiveMode] = useState(false);
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [watchBusy, setWatchBusy] = useState(false);
  const [watchResult, setWatchResult] = useState<WatchResponse | null>(null);
  const [watchSummary, setWatchSummary] = useState<WatchSummary | null>(null);
  const initializedRef = useRef(false);
  const lastAnalyzedRefreshRef = useRef<string | null>(null);

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

  async function loadWatchSummary() {
    try {
      const res = await fetch("/api/watch?mode=summary", { cache: "no-store" });
      const data = (await res.json()) as WatchSummary;
      setWatchSummary(data);
    } catch {
      setWatchSummary({ reason: "Résumé non disponible." });
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
    void loadWatchSummary();
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
      const now = new Date().toISOString();
      setLastRefresh(now);
      if (data.warning) setMessage(data.warning);
    } catch {
      setMessage("Erreur marché: impossible de charger les chandelles.");
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

  async function runWatch() {
    setWatchBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/watch", { cache: "no-store" });
      const data = (await res.json()) as WatchResponse;
      setWatchResult(data);
      if (data.ok) {
        setMemoryMessage("Scan serveur terminé · prédictions sauvegardées/vérifiées");
        setWatchSummary(data.results || null);
        void loadWatchSummary();
      } else {
        setMessage("Le scan serveur n'a pas retourné ok:true.");
      }
    } catch {
      setMessage("Erreur pendant le scan serveur.");
    } finally {
      setWatchBusy(false);
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
        const pipsValue = ((market.price - trade.entry) / getPipSize(trade.pair)) * direction;
        const pnlCad = pipsValue;
        return {
          ...trade,
          status: "CLOSED",
          exit: market.price,
          pips: pipsValue,
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

  useEffect(() => {
    if (!liveMode) return;
    const timer = window.setInterval(() => {
      void loadMarket();
    }, 30000);

    return () => window.clearInterval(timer);
  }, [liveMode, from, to, interval]);

  useEffect(() => {
    if (!liveMode || !autoAnalyze || !market || !lastRefresh) return;
    if (lastAnalyzedRefreshRef.current === lastRefresh) return;
    lastAnalyzedRefreshRef.current = lastRefresh;
    void analyze();
  }, [liveMode, autoAnalyze, market, lastRefresh]);

  const stats = useMemo(() => (market ? calculateMarketStats(market.candles) : null), [market]);
  const closed = trades.filter((trade) => trade.status === "CLOSED");
  const open = trades.filter((trade) => trade.status === "OPEN");
  const pnl = closed.reduce((sum, trade) => sum + (trade.pnlCad || 0), 0);
  const winRate = closed.length ? (closed.filter((trade) => (trade.pnlCad || 0) > 0).length / closed.length) * 100 : 0;
  const actionClass = analysis?.action === "BUY" ? "buy" : analysis?.action === "SELL" ? "sell" : "hold";
  const createdCount = watchResult?.created?.length || 0;
  const errorCount = watchResult?.errors?.length || 0;
  const summary = watchSummary?.summary;
  const rows = watchSummary?.rows || [];
  const marketIsDemo = !market || market.source === "demo";
  const marketBadge = marketIsDemo ? "DEMO" : "RÉEL";

  return (
    <main className="container master-container">
      <section className="hero master-hero">
        <div className="card hero-main">
          <span className="badge">Master Trading Lab</span>
          <span className={`badge ${marketIsDemo ? "hold" : "buy"}`}>Données {marketBadge}</span>
          <span className={`badge ${memoryEnabled ? "buy" : "hold"}`}><Database size={14} /> {memoryEnabled ? "Supabase Memory" : "Local Memory"}</span>
          <span className={`badge ${liveMode ? "buy" : "hold"}`}><PlayCircle size={14} /> {liveMode ? "LIVE ON" : "LIVE OFF"}</span>
          <h1>GPT Forex <span>Master</span></h1>
          <p className="muted">Une interface inspirée des plateformes professionnelles: graphiques multi-styles, IA, paper trading, scanner, backtest, risque et journal d'apprentissage.</p>
          <div className="warning">Simulation seulement. Aucun trade réel. Aucun conseil financier.</div>
        </div>
        <div className="card status-card">
          <h2>État du système</h2>
          <div className="system-list">
            <div><b>Marché</b><span className={marketIsDemo ? "yellow" : "green"}>{marketBadge}</span></div>
            <div><b>Source</b><span>{market?.source || "chargement"}</span></div>
            <div><b>Mémoire</b><span>{memoryEnabled ? "Supabase" : "Locale"}</span></div>
            <div><b>Dernier refresh</b><span>{timeLabel(lastRefresh || market?.updatedAt)}</span></div>
          </div>
          <p className="small">{memoryMessage}</p>
        </div>
      </section>

      <section className="module-grid">
        {MASTER_MODULES.map((item) => {
          const Icon = item.icon;
          return <div className="module-card" key={item.title}><Icon size={20} /><b>{item.title}</b><span>{item.detail}</span></div>;
        })}
      </section>

      <div style={{ height: 18 }} />
      <section className="grid grid3">
        <div className="card controls-card">
          <h2>Contrôle marché</h2>
          <label>Paire</label>
          <select className="select" value={`${from}/${to}`} onChange={(event) => { const [a, b] = event.target.value.split("/"); setFrom(a); setTo(b); }}>
            {PAIRS.map(([a, b]) => <option key={`${a}/${b}`}>{a}/{b}</option>)}
          </select>
          <label style={{ marginTop: 10 }}>Intervalle</label>
          <select className="select" value={interval} onChange={(event) => setIntervalValue(event.target.value)}>
            <option value="1min">1 minute</option>
            <option value="5min">5 minutes</option>
            <option value="15min">15 minutes</option>
            <option value="30min">30 minutes</option>
            <option value="60min">60 minutes</option>
          </select>
          <label style={{ marginTop: 10 }}>Type de graphique</label>
          <select className="select" value={chartMode} onChange={(event) => setChartMode(event.target.value as ChartMode)}>
            <option value="candles">Chandelles japonaises</option>
            <option value="bars">Barres OHLC</option>
            <option value="line">Ligne</option>
            <option value="area">Area</option>
          </select>
          <div className="actions" style={{ marginTop: 14 }}>
            <button className="btn" onClick={loadMarket} disabled={busy}><RefreshCcw size={16} /> Rafraîchir</button>
            <button className="btn secondary" onClick={analyze} disabled={busy || !market}>Analyser IA</button>
            <button className={liveMode ? "btn green" : "btn secondary"} onClick={() => setLiveMode((value) => !value)}>{liveMode ? "Arrêter live" : "Démarrer live"}</button>
          </div>
          {message && <p className="warning">{message}</p>}
        </div>
        <div className="card"><h2>Prix</h2><div className="kpi"><div className="name">{market?.pair || `${from}/${to}`}</div><div className="value">{price(market?.price)}</div></div><p className="small">Source: {market?.source || "—"} · chandelles: {market?.candles?.length || 0}</p></div>
        <div className="card"><h2>Mouvement</h2><div className="kpi"><div className="name">Variation</div><div className={`value ${stats && stats.change >= 0 ? "green" : "red"}`}>{stats ? `${stats.changePercent.toFixed(2)} %` : "—"}</div></div><p className="small">Haut {price(stats?.high)} · Bas {price(stats?.low)} · Volatilité {stats ? stats.volatility.toFixed(2) : "—"}%</p></div>
      </section>

      {marketIsDemo && <div className="data-alert"><b>Données en mode DEMO.</b> L'application fonctionne, mais Alpha Vantage ne fournit pas encore les vraies chandelles sur ce déploiement. Vérifie la clé, le quota ou la source de données.</div>}

      <div style={{ height: 18 }} />
      <section className="card chart-card">
        <div className="chart-header">
          <div>
            <h2><Activity size={22} /> Graphique professionnel</h2>
            <p className="small">Chandelles OHLC avec mèches, prix haut/bas, dernier prix et indicateurs rapides.</p>
          </div>
          <div className="indicator-actions">
            <span className="badge">EMA 9</span>
            <span className="badge">EMA 21</span>
            <span className="badge">Range</span>
            <span className="badge">Replay à venir</span>
          </div>
        </div>
        {market ? <ProfessionalChart candles={market.candles} mode={chartMode} /> : <ProfessionalChart candles={[]} mode={chartMode} />}
      </section>

      <div style={{ height: 18 }} />
      <section className="grid grid2">
        <div className="card">
          <h2><Brain size={22} /> Comité IA</h2>
          <textarea className="textarea" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ex: cherche fausse cassure, confirmer avec tendance 15 min, éviter les nouvelles, risque faible..." />
          <div className="actions" style={{ marginTop: 12 }}>
            <button className="btn green" onClick={analyze} disabled={busy || !market}>Lancer analyse complète</button>
            <button className={autoAnalyze ? "btn green" : "btn secondary"} onClick={() => setAutoAnalyze((value) => !value)}>{autoAnalyze ? "Analyse auto ON" : "Analyse auto OFF"}</button>
          </div>
        </div>
        <div className="card">
          <h2><ShieldCheck size={22} /> Décision IA</h2>
          {!analysis ? <p className="small">Charge les chandelles, puis lance l'analyse IA.</p> : <>
            <span className={`badge ${actionClass}`}>Action: {analysis.action}</span><span className="badge">Confiance: {analysis.confidence}%</span><span className="badge">Risque max: {analysis.maxRiskPercent}%</span>
            <div className="grid grid3"><div className="kpi"><div className="name">Entrée</div><div className="value">{price(analysis.entry)}</div></div><div className="kpi"><div className="name">Stop</div><div className="value red">{price(analysis.stopLoss)}</div></div><div className="kpi"><div className="name">Profit</div><div className="value green">{price(analysis.takeProfit)}</div></div></div>
            <p>{analysis.marketBias}</p><p className="small">{analysis.finalDecision}</p><button className="btn green" onClick={openPaperTrade}>Ouvrir trade fictif</button>
          </>}
        </div>
      </section>

      <div style={{ height: 18 }} />
      <section className="grid grid3">
        <div className="card">
          <h2><Target size={22} /> Compte fictif</h2>
          <label>Capital</label>
          <input className="input" inputMode="decimal" value={accountInput} onChange={(event) => setAccountInput(event.target.value.replace(/[^0-9.]/g, ""))} />
          <div className="grid grid2" style={{ marginTop: 14 }}>
            <div className="kpi"><div className="name">P/L fictif</div><div className={`value ${pnl >= 0 ? "green" : "red"}`}>{money(pnl)}</div></div>
            <div className="kpi"><div className="name">Win rate</div><div className="value yellow">{winRate.toFixed(0)} %</div></div>
          </div>
        </div>
        <div className="card"><h2>Agents spécialisés</h2>{analysis?.agents?.map((agent) => <div className="agent" key={agent.name}><b>{agent.name}</b><br /><span className="badge">{agent.vote} · {agent.confidence}%</span><p className="small">{agent.note}</p></div>) || <p className="small">Aucun agent chargé.</p>}</div>
        <div className="card"><h2>Scanner watchlist</h2><p className="small">Paires surveillées: EUR/USD, GBP/USD, USD/JPY, USD/CAD. Le scan serveur crée des prédictions mesurables dans Supabase.</p><button className="btn green" onClick={runWatch} disabled={watchBusy}>{watchBusy ? "Scan en cours..." : "Lancer scan serveur"}</button></div>
      </section>

      <div style={{ height: 18 }} />
      <section className="card">
        <h2>Backtest réel / résultats</h2>
        <div className="actions">
          <button className="btn secondary" onClick={loadWatchSummary}>Rafraîchir résultats</button>
          <span className="badge">Créées: {createdCount}</span>
          <span className="badge">Vérifiées: {watchResult?.evaluation?.updated || 0}</span>
          <span className={`badge ${errorCount === 0 ? "buy" : "sell"}`}>Erreurs: {errorCount}</span>
        </div>
        <div className="grid grid4" style={{ marginTop: 14 }}>
          <div className="kpi"><div className="name">Prédictions</div><div className="value">{summary?.total || 0}</div></div>
          <div className="kpi"><div className="name">En attente</div><div className="value yellow">{summary?.pending || 0}</div></div>
          <div className="kpi"><div className="name">Réussite réelle</div><div className={`value ${(summary?.successRate || 0) >= 50 ? "green" : "red"}`}>{(summary?.successRate || 0).toFixed(0)} %</div></div>
          <div className="kpi"><div className="name">Pips nets</div><div className={`value ${(summary?.netPips || 0) >= 0 ? "green" : "red"}`}>{pips(summary?.netPips || 0)}</div></div>
        </div>
        {watchSummary?.reason && <p className="warning">{watchSummary.reason}</p>}
        <div className="grid grid2" style={{ marginTop: 14 }}>
          {rows.length === 0 ? <p className="small">Aucun résultat encore. Lance un scan serveur, attends 5 minutes, puis relance.</p> : rows.slice(0, 12).map((row) => <div className="trade" key={row.id}>
            <b>{row.pair}</b> <span className={`badge ${row.action === "BUY" ? "buy" : row.action === "SELL" ? "sell" : "hold"}`}>{row.action}</span> <span className={`badge ${row.status === "DONE" ? (row.success ? "buy" : "sell") : "hold"}`}>{row.status}</span>
            <p className="small">Horizon {row.horizon_minutes} min · Confiance {row.confidence}% · Départ {price(row.start_price)} · Fin {price(row.end_price)}</p>
            <p className="small">{pips(row.pips)} · {row.success == null ? "Résultat en attente" : row.success ? "Prédiction réussie" : "Prédiction ratée"}</p>
          </div>)}
        </div>
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
