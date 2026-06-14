"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Brain, ShieldCheck } from "lucide-react";
import { AiAnalysis, Candle, MarketResponse } from "@/lib/types";
import { calculateMarketStats, getPipSize } from "@/lib/market";

type PaperTrade = {
  id: string;
  pair: string;
  side: "BUY" | "SELL";
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

const PAIRS = [["EUR","USD"],["GBP","USD"],["USD","JPY"],["USD","CAD"],["AUD","USD"],["NZD","USD"],["EUR","JPY"],["GBP","JPY"]];

function money(v: number) { return `${v.toFixed(2)} $ CAD`; }
function price(v?: number | null) { return v == null ? "—" : v.toFixed(v > 20 ? 3 : 5); }

function Chart({ candles }: { candles: Candle[] }) {
  const visible = candles.slice(-52);
  const high = Math.max(...visible.map((c) => c.high));
  const low = Math.min(...visible.map((c) => c.low));
  const range = high - low || 1;
  return (
    <div className="chart">
      {visible.map((c) => {
        const h = Math.max(4, ((c.high - c.low) / range) * 100);
        const up = c.close >= c.open;
        return <div key={c.time} className={`bar ${up ? "buy" : "sell"}`} style={{ height: `${h}%` }} title={`${c.time} ${c.close}`} />;
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

  useEffect(() => {
    try { setTrades(JSON.parse(localStorage.getItem("gpt-forex-paper-trades") || "[]")); } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem("gpt-forex-paper-trades", JSON.stringify(trades));
  }, [trades]);

  async function loadMarket() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(`/api/market?from=${from}&to=${to}&interval=${interval}`, { cache: "no-store" });
      const data = await res.json() as MarketResponse;
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
      if (data.analysis) setAnalysis(data.analysis);
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
    if (!analysis.entry || !analysis.stopLoss || !analysis.takeProfit) return;
    setTrades((old) => [{
      id: crypto.randomUUID(),
      pair: market.pair,
      side: analysis.action,
      entry: analysis.entry!,
      stopLoss: analysis.stopLoss!,
      takeProfit: analysis.takeProfit!,
      confidence: analysis.confidence,
      openedAt: new Date().toISOString(),
      status: "OPEN"
    }, ...old]);
    setMessage("Trade fictif ouvert. Aucun argent réel engagé.");
  }

  function closeTrade(id: string) {
    if (!market) return;
    setTrades((old) => old.map((t) => {
      if (t.id !== id || t.status === "CLOSED") return t;
      const direction = t.side === "BUY" ? 1 : -1;
      const pips = ((market.price - t.entry) / getPipSize(t.pair)) * direction;
      const pnlCad = pips;
      return { ...t, status: "CLOSED", exit: market.price, pips, pnlCad, lesson: pnlCad >= 0 ? "Setup gagnant: vérifier si la sortie aurait pu être optimisée." : "Setup perdant: revoir entrée, stop et confirmation." };
    }));
  }

  useEffect(() => { loadMarket(); }, []);

  const stats = useMemo(() => market ? calculateMarketStats(market.candles) : null, [market]);
  const closed = trades.filter((t) => t.status === "CLOSED");
  const pnl = closed.reduce((s, t) => s + (t.pnlCad || 0), 0);
  const winRate = closed.length ? (closed.filter((t) => (t.pnlCad || 0) > 0).length / closed.length) * 100 : 0;
  const actionClass = analysis?.action === "BUY" ? "buy" : analysis?.action === "SELL" ? "sell" : "hold";

  return (
    <main className="container">
      <section className="hero">
        <div className="card">
          <span className="badge">AI Forex Paper Trading</span><span className="badge">OpenAI</span><span className="badge">Alpha Vantage</span>
          <h1>GPT Forex <span>Manager</span></h1>
          <p className="muted">Application IA pour analyser le Forex, proposer des setups, ouvrir des trades fictifs et apprendre des erreurs dans un journal local.</p>
          <div className="warning">Simulation seulement. Aucun trade réel. Aucun conseil financier.</div>
        </div>
        <div className="card">
          <h2>Compte fictif</h2>
          <label>Capital</label>
          <input className="input" type="number" value={accountCad} onChange={(e) => setAccountCad(Number(e.target.value || 0))} />
          <div className="grid grid2" style={{ marginTop: 14 }}>
            <div className="kpi"><div className="name">P/L fictif</div><div className={`value ${pnl >= 0 ? "green" : "red"}`}>{money(pnl)}</div></div>
            <div className="kpi"><div className="name">Win rate</div><div className="value yellow">{winRate.toFixed(0)} %</div></div>
          </div>
        </div>
      </section>

      <section className="grid grid3">
        <div className="card">
          <h2>Marché</h2>
          <label>Paire</label>
          <select className="select" value={`${from}/${to}`} onChange={(e) => { const [a,b] = e.target.value.split("/"); setFrom(a); setTo(b); }}>
            {PAIRS.map(([a,b]) => <option key={`${a}/${b}`}>{a}/{b}</option>)}
          </select>
          <label style={{ marginTop: 10 }}>Intervalle</label>
          <select className="select" value={interval} onChange={(e) => setInterval(e.target.value)}>
            <option value="1min">1 minute</option><option value="5min">5 minutes</option><option value="15min">15 minutes</option><option value="30min">30 minutes</option><option value="60min">60 minutes</option>
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
        <div className="card"><h2><Brain size={22} /> Notes IA</h2><textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex: évite les trades avant nouvelles économiques, cherche fausse cassure, risque faible..." /></div>
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
        <div className="card"><h2>Agents spécialisés</h2>{analysis?.agents?.map((a) => <div className="agent" key={a.name}><b>{a.name}</b><br/><span className="badge">{a.vote} · {a.confidence}%</span><p className="small">{a.note}</p></div>) || <p className="small">Aucun agent chargé.</p>}</div>
      </section>

      <div style={{ height: 18 }} />
      <section className="card">
        <h2>Journal paper trading</h2>
        <button className="btn secondary" onClick={() => setTrades([])}>Réinitialiser</button>
        <div className="grid grid2" style={{ marginTop: 14 }}>
          {trades.length === 0 ? <p className="small">Aucun trade fictif.</p> : trades.map((t) => <div className="trade" key={t.id}>
            <b>{t.side} {t.pair}</b> <span className={`badge ${t.status === "OPEN" ? "hold" : (t.pnlCad || 0) >= 0 ? "buy" : "sell"}`}>{t.status}</span>
            <p className="small">Entrée {price(t.entry)} · Stop {price(t.stopLoss)} · Target {price(t.takeProfit)}</p>
            {t.status === "OPEN" ? <button className="btn secondary" onClick={() => closeTrade(t.id)}>Fermer au prix actuel</button> : <p className="small">{money(t.pnlCad || 0)} · {t.pips?.toFixed(1)} pips · {t.lesson}</p>}
          </div>)}
        </div>
      </section>
    </main>
  );
}
