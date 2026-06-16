"use client";

import { useEffect, useState } from "react";
import { Activity, Brain, Gauge, RefreshCcw, ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";
import TradingViewCandleChart from "@/components/TradingViewCandleChart";
import { MarketResponse } from "@/lib/types";

const tabs = ["Dashboard", "Markets", "News & Sentiment", "Prediction Lab", "Paper Trading", "Agents IA", "Evolution & Learn", "Settings"];
const pairs = ["EUR/USD", "GBP/USD", "USD/JPY", "USD/CAD", "AUD/USD", "NZD/USD", "EUR/JPY", "GBP/JPY"];
const agents = ["Market Watcher", "Scalping Agent", "News Analyst", "Market Sentiment", "Risk Manager", "Execution Agent", "Learning Agent", "Strategy Evolution"];
const newsItems = [
  ["Annonce CPI US : Inflation à 3.4%", "Impact high", "Bearish biased"],
  ["NFP US supérieur aux attentes", "Impact high", "Bullish biased"],
  ["Calendrier FOMC attendu mercredi", "Impact high", "Neutral biased"],
  ["La BCE envisage une baisse prudente", "Impact medium", "Bearish biased"]
];
const predictions = [
  ["EUR/USD", "M15", "SELL", "82%", "WIN"],
  ["NAS100", "M5", "BUY", "76%", "WIN"],
  ["GBP/USD", "M1", "BUY", "65%", "LOSS"],
  ["USD/JPY", "H1", "BUY", "88%", "EN ATTENTE"]
];
const rules = ["Filtre Volatilité Pré-CPI", "Confirmation EMA 50/200", "Refus de Trade Confidence < 70%", "Anti-Fomo Sentiment Extrême"];

type ChartMode = "candles" | "bars" | "line" | "area";
type Side = "BUY" | "SELL";

function price(value?: number | null) { if (value == null) return "—"; return value.toFixed(value > 20 ? 3 : 5); }
function cad(value: number) { return `${value.toLocaleString("en-CA", { maximumFractionDigits: 2 })} $ CAD`; }

export default function NexusV2Page() {
  const [tab, setTab] = useState("Dashboard");
  const [pair, setPair] = useState("EUR/USD");
  const [interval, setInterval] = useState("5min");
  const [mode, setMode] = useState<ChartMode>("candles");
  const [market, setMarket] = useState<MarketResponse | null>(null);
  const [side, setSide] = useState<Side>("BUY");
  const [volume, setVolume] = useState("1");
  const [leverage, setLeverage] = useState("30");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [tick, setTick] = useState("2500");
  const [volatility, setVolatility] = useState("3.8");
  const [status, setStatus] = useState("Terminal prêt.");

  const balance = 10000;
  const equity = 10000;
  const margin = Number(volume || 0) * (market?.price || 1) * 100000 / Number(leverage || 1);
  const freeMargin = Math.max(0, equity - margin);
  const signal = (market?.candles?.at(-1)?.close || 0) >= (market?.candles?.[0]?.close || 0) ? "BUY" : "SELL";

  async function loadMarket() {
    const [from, to] = pair.split("/");
    setStatus("Chargement du marché...");
    try {
      const res = await fetch(`/api/market?from=${from}&to=${to}&interval=${interval}`, { cache: "no-store" });
      const data = await res.json() as MarketResponse;
      setMarket(data);
      setStatus(data.warning || `${data.pair} chargé depuis ${data.source}`);
    } catch { setStatus("Erreur de chargement du marché."); }
  }
  useEffect(() => { void loadMarket(); }, [pair, interval]);

  function Header() { return <div style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(15,23,42,.97)", borderBottom: "1px solid rgba(148,163,184,.18)", margin: "-18px -18px 18px", padding: "12px 18px" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}><div className="actions"><span className="badge buy">● Agent engines: active</span><span className="badge">Paper trading only</span></div><div className="actions"><button className="btn secondary" onClick={loadMarket} style={{ minHeight: 34, padding: "7px 12px" }}><RefreshCcw size={14} /> Next Tick</button><span className="badge">UTC {new Date().toISOString().slice(11, 19)}</span></div></div><div style={{ display: "grid", gridTemplateColumns: "minmax(280px,1.4fr) repeat(4,minmax(145px,.55fr))", gap: 12 }}><div className="card" style={{ padding: 14, boxShadow: "none" }}><h2 style={{ margin: 0 }}><Brain size={24} /> Laboratoire de Prédiction Forex / Nasdaq</h2><p className="small" style={{ margin: 0 }}>IA Multi-Agents & Simulation Quant</p></div><div className="kpi"><div className="name">Balance compte</div><div className="value small-value">{cad(balance)}</div></div><div className="kpi"><div className="name">Equity</div><div className="value small-value green">{cad(equity)}</div></div><div className="kpi"><div className="name">Marge utilisée</div><div className="value small-value yellow">{cad(margin)}</div></div><div className="kpi"><div className="name">Win rate</div><div className="value small-value">62%</div></div></div><div className="actions" style={{ flexWrap: "nowrap", overflowX: "auto", marginTop: 12 }}>{tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={tab === item ? "btn green" : "btn secondary"} style={{ minHeight: 40, flex: "0 0 auto", padding: "8px 12px" }}>{item}</button>)}</div></div>; }
  function ChartCard() { return <div className="card chart-card"><div className="chart-header"><div><h2>Nasdaq / Forex Monitor</h2><p className="small">Actif: {pair} · Source: {market?.source || "—"}</p></div><div className="indicator-actions"><span className="badge">Bougies</span><span className="badge">Bollinger</span><span className="badge">Fibonacci</span><span className="badge">Pivot S/R</span></div></div><TradingViewCandleChart candles={market?.candles || []} mode={mode} /><p className="warning" style={{ marginTop: 12 }}>{status}</p></div>; }
  function PairList() { return <div className="card"><h2><Activity size={20} /> Watchlist</h2>{pairs.map((p) => <button key={p} className={pair === p ? "btn green" : "btn secondary"} onClick={() => setPair(p)} style={{ width: "100%", marginBottom: 8, justifyContent: "space-between" }}><span>{p}</span><span>{p === pair ? price(market?.price) : "—"}</span></button>)}</div>; }
  function PaperTicket() { return <div className="card"><h2><ShieldCheck size={20} /> Passer un ordre PaperTrader</h2><div className="grid grid2"><button className={side === "BUY" ? "btn green" : "btn secondary"} onClick={() => setSide("BUY")}><TrendingUp size={16} /> Acheter</button><button className={side === "SELL" ? "btn red" : "btn secondary"} onClick={() => setSide("SELL")}><TrendingDown size={16} /> Vendeur</button></div><label>Lots</label><input className="input" value={volume} onChange={(e) => setVolume(e.target.value.replace(/[^0-9.]/g, ""))} /><label>Levier</label><input className="input" value={leverage} onChange={(e) => setLeverage(e.target.value.replace(/[^0-9]/g, ""))} /><div className="grid grid2"><div><label>Stop loss</label><input className="input" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} placeholder="Optionnel" /></div><div><label>Take profit</label><input className="input" value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} placeholder="Optionnel" /></div></div><div className="grid grid2" style={{ marginTop: 12 }}><div className="kpi"><div className="name">Marge requise</div><div className="value small-value">{cad(margin)}</div></div><div className="kpi"><div className="name">Marge libre</div><div className="value small-value green">{cad(freeMargin)}</div></div></div><button className="btn green" style={{ width: "100%", marginTop: 14 }}>Négocier sur compte démo</button></div>; }
  function FlowControl() { return <div className="card"><h2><Gauge size={20} /> Contrôle des Flux Infinis & Vitesse</h2><div className="warning">Défilement automatique · génération continue</div><label>Fréquence du tick: {tick} ms</label><input type="range" min="100" max="4000" value={tick} onChange={(e) => setTick(e.target.value)} style={{ width: "100%" }} /><label>Intensité volatilité: {volatility}x</label><input type="range" min="0.2" max="5" step="0.1" value={volatility} onChange={(e) => setVolatility(e.target.value)} style={{ width: "100%" }} /><div className="grid grid2" style={{ marginTop: 12 }}><div className="kpi"><div className="name">Automations</div><div className="value green">PLAY</div></div><div className="kpi"><div className="name">Flux</div><div className="value green">ON</div></div></div></div>; }
  function Consensus() { return <div className="card"><h2>Consensus des agents</h2><div className="grid grid4"><div className="kpi"><div className="name">Signal</div><div className={`value ${signal === "BUY" ? "green" : "red"}`}>{signal}</div></div><div className="kpi"><div className="name">Confiance</div><div className="value">74%</div></div><div className="kpi"><div className="name">Risque</div><div className="value yellow">Moyen</div></div><div className="kpi"><div className="name">Mode</div><div className="value">Paper</div></div></div></div>; }
  function NewsPanel() { return <section className="grid" style={{ gridTemplateColumns: "360px minmax(0,1fr)" }}><div className="card"><h2>Sentiment global</h2><div className="kpi"><div className="name">Index acheteur</div><div className="value yellow">39%</div></div><p className="small">Consolidation neutre. Le marché reste indécis avant les prochains communiqués macro.</p><button className="btn green" style={{ width: "100%" }}>Lancer l’analyse News Analyst IA</button></div><div className="card"><h2>Flux nouvelles macro</h2>{newsItems.map(([title, impact, bias]) => <div className="agent" key={title}><b>{title}</b><br /><span className="badge sell">{impact}</span><span className="badge">{bias}</span></div>)}</div></section>; }
  function PredictionPanel() { return <section className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) 360px" }}><div className="card"><h2>Archive des Prédictions Résolues</h2>{predictions.map(([m, tf, sig, conf, result]) => <div className="agent" key={`${m}-${tf}`} style={{ display: "grid", gridTemplateColumns: "1fr .8fr .8fr .8fr .9fr", gap: 10 }}><b>{m}</b><span>{tf}</span><span className={sig === "BUY" ? "green" : "red"}>{sig}</span><span>{conf}</span><span className={result === "WIN" ? "badge buy" : result === "LOSS" ? "badge sell" : "badge"}>{result}</span></div>)}</div><div className="card"><h2>Séquence Multi-Agents</h2><label>Actif de référence</label><select className="select" value={pair} onChange={(e) => setPair(e.target.value)}>{pairs.map((p) => <option key={p}>{p}</option>)}</select><label>Timeframe</label><select className="select" value={interval} onChange={(e) => setInterval(e.target.value)}><option value="1min">M1</option><option value="5min">M5</option><option value="15min">M15</option><option value="60min">H1</option></select><button className="btn green" style={{ width: "100%", marginTop: 12 }}>Lancer la séquence IA</button><Consensus /></div></section>; }
  function LearningPanel() { return <section className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}><div className="card"><h2>Logique des règles actives</h2>{rules.map((rule, i) => <div className="agent" key={rule}><span className={i < 3 ? "badge buy" : "badge"}>{i < 3 ? "ON" : "OBSERVE"}</span><b> {rule}</b><p className="small">Taux de résolution historique : {85 - i * 7}% · Utilisations : {22 + i * 13}</p></div>)}</div><div className="card"><h2>Registre d’apprentissage d’erreurs</h2>{["Glissement de spread ayant déclenché le stop loss prématurément", "Achat de contre-tendance M5 sans confirmation EMA 200", "Signal social trop spéculatif ignoré trop tard"].map((err) => <div className="agent" key={err}><span className="badge sell">Erreur détectée</span><p><b>{err}</b></p><div className="warning">Leçon apprise : attendre un pullback validé et réduire le levier avant news importantes.</div></div>)}</div></section>; }

  return <main className="container master-container"><Header />{tab === "Dashboard" && <><section className="card" style={{ marginBottom: 16 }}><span className="badge buy">Laboratoire de simulation active</span><span className="badge yellow">Era: Hyper2020</span><span className="badge buy">Automations: PLAY</span><span className="badge buy">Alertes de flux: ON</span></section><section className="grid" style={{ gridTemplateColumns: "minmax(0,2fr) 430px", marginBottom: 16 }}><ChartCard /><FlowControl /></section><section className="grid" style={{ gridTemplateColumns: "350px minmax(0,1fr)" }}><PaperTicket /><Consensus /></section></>}
  {tab === "Markets" && <section className="grid" style={{ gridTemplateColumns: "320px minmax(0,1fr)" }}><PairList /><div><section className="card" style={{ marginBottom: 16 }}><h2>Contrôles marché</h2><div className="grid grid3"><div><label>Timeframe</label><select className="select" value={interval} onChange={(e) => setInterval(e.target.value)}><option value="1min">M1</option><option value="5min">M5</option><option value="15min">M15</option><option value="30min">M30</option><option value="60min">H1</option></select></div><div><label>Graphique</label><select className="select" value={mode} onChange={(e) => setMode(e.target.value as ChartMode)}><option value="candles">Candles</option><option value="bars">OHLC</option><option value="line">Line</option><option value="area">Area</option></select></div><div><label>Prix</label><div className="kpi"><div className="value small-value">{price(market?.price)}</div></div></div></div></section><ChartCard /></div></section>}
  {tab === "News & Sentiment" && <NewsPanel />}
  {tab === "Prediction Lab" && <PredictionPanel />}
  {tab === "Evolution & Learn" && <LearningPanel />}
  {tab === "Paper Trading" && <section className="grid" style={{ gridTemplateColumns: "380px minmax(0,1fr)" }}><PaperTicket /><div className="card"><h2>Positions ouvertes</h2><p className="muted">Aucune position ouverte pour l’instant. Le prochain branchement va sauvegarder les ordres dans Supabase.</p><Consensus /></div></section>}
  {tab === "Agents IA" && <section className="grid" style={{ gridTemplateColumns: "360px minmax(0,1fr)" }}><div className="card"><h2>Agents</h2>{agents.map((a, i) => <div className="agent" key={a}><b>{a}</b><br /><span className={i < 4 ? "badge buy" : "badge"}>{i < 4 ? "ACTIVE" : "IDLE"}</span></div>)}</div><div className="card"><h2>Prompt système</h2><textarea className="textarea" defaultValue="Analyse le marché, identifie la structure, estime le risque, puis propose une décision paper trading seulement." /><button className="btn green" style={{ marginTop: 12 }}>Sauvegarder directives</button></div></section>}
  {tab === "Settings" && <section className="card"><h2>Settings</h2><div className="grid grid3"><div className="agent"><b>Data source</b><p className="small">Supabase historique, Alpha Vantage, fallback local.</p></div><div className="agent"><b>Risk controls</b><p className="small">Levier, marge, stop loss obligatoire à venir.</p></div><div className="agent"><b>Interface</b><p className="small">Mode mobile compact et thème Nexus sombre.</p></div></div></section>}</main>;
}
