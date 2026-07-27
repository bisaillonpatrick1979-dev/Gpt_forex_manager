"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Brain,
  CheckCircle2,
  Database,
  FileCheck2,
  FlaskConical,
  Gauge,
  Network,
  Play,
  RefreshCcw,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  Unplug
} from "lucide-react";
import TradingViewCandleChart from "@/components/TradingViewCandleChart";
import { firmModules, riskPolicy } from "@/lib/firm-config";
import { AiAnalysis, MarketResponse } from "@/lib/types";

const tabs = [
  "Vue d’ensemble",
  "Marchés",
  "Pipeline quant",
  "Validation",
  "Risque",
  "Agents OpenAI",
  "Journal",
  "Paramètres"
] as const;

const pairs = ["EUR/USD", "GBP/USD", "USD/JPY", "USD/CAD", "AUD/USD", "NZD/USD", "EUR/JPY", "GBP/JPY"];
const intervals = [
  ["1min", "M1"],
  ["5min", "M5"],
  ["15min", "M15"],
  ["30min", "M30"],
  ["60min", "H1"]
] as const;

const validationGates = [
  ["Hypothèse écrite", "L’idée et la raison économique sont enregistrées avant le premier test."],
  ["Données verrouillées", "La période hors-échantillon ne peut pas être utilisée pour optimiser."],
  ["Coûts réalistes", "Spread, commission, slippage et remplissages défavorables sont inclus."],
  ["Walk-forward", "Les paramètres sont réévalués chronologiquement sans regarder le futur."],
  ["Stress tests", "Les frais, délais et volatilités sont aggravés pour tenter de casser la stratégie."],
  ["Paper trading", "La stratégie doit survivre en temps réel avant toute discussion de capital réel."]
];

type Tab = (typeof tabs)[number];
type ChartMode = "candles" | "bars" | "line" | "area";

type RegistryAgent = {
  key: string;
  name: string;
  role: string;
  responsibility: string;
  connectionEnvVar: string;
  connected: boolean;
  status: "configured" | "awaiting-agent";
  mayExecuteOrders: boolean;
};

type RegistryResponse = {
  architecture: string;
  openAiApiConfigured: boolean;
  connectedAgents: number;
  totalAgents: number;
  agents: RegistryAgent[];
  generatedAt: string;
};

type PaperPlan = {
  id: string;
  createdAt: string;
  pair: string;
  side: "BUY" | "SELL";
  riskCad: number;
  riskPercent: number;
  stopLoss: string;
  takeProfit: string;
  status: "DRAFT";
};

function formatPrice(value?: number | null) {
  if (value == null) return "—";
  return value.toFixed(value > 20 ? 3 : 5);
}

function cad(value: number) {
  return `${value.toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $ CA`;
}

export default function NexusV2Page() {
  const [tab, setTab] = useState<Tab>("Vue d’ensemble");
  const [pair, setPair] = useState("EUR/USD");
  const [interval, setInterval] = useState("5min");
  const [mode, setMode] = useState<ChartMode>("candles");
  const [market, setMarket] = useState<MarketResponse | null>(null);
  const [registry, setRegistry] = useState<RegistryResponse | null>(null);
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [analysisMode, setAnalysisMode] = useState("not-run");
  const [status, setStatus] = useState("Système prêt. Aucune stratégie n’est encore certifiée.");
  const [loading, setLoading] = useState(false);
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [capital, setCapital] = useState("10000");
  const [riskPercent, setRiskPercent] = useState(String(riskPolicy.maxRiskPerTradePercent));
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [plans, setPlans] = useState<PaperPlan[]>([]);

  const riskCad = useMemo(() => {
    const parsedCapital = Math.max(0, Number(capital) || 0);
    const parsedRisk = Math.min(riskPolicy.maxRiskPerTradePercent, Math.max(0, Number(riskPercent) || 0));
    return parsedCapital * parsedRisk / 100;
  }, [capital, riskPercent]);

  async function loadMarket() {
    const [from, to] = pair.split("/");
    setStatus("Chargement et contrôle de la source de marché...");
    try {
      const response = await fetch(`/api/market?from=${from}&to=${to}&interval=${interval}`, { cache: "no-store" });
      const data = await response.json() as MarketResponse;
      setMarket(data);
      setStatus(data.warning || `${data.pair} chargé depuis ${data.source}.`);
    } catch {
      setStatus("Le marché n’a pas pu être chargé. Aucun signal ne doit être utilisé.");
    }
  }

  async function loadRegistry() {
    try {
      const response = await fetch("/api/agents/registry", { cache: "no-store" });
      const data = await response.json() as RegistryResponse;
      setRegistry(data);
    } catch {
      setRegistry(null);
    }
  }

  async function runAnalysis() {
    if (!market || market.candles.length < 10) {
      setStatus("Pas assez de chandelles validées pour lancer une analyse.");
      return;
    }

    setLoading(true);
    setStatus("Analyse en cours. Le résultat ne peut produire aucun ordre réel.");
    try {
      const response = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pair,
          candles: market.candles,
          accountCad: Number(capital) || 10000,
          notes: "Architecture quant en mode paper-only. Le Risk Governor doit conserver son veto."
        })
      });
      const payload = await response.json() as { analysis?: AiAnalysis; mode?: string; warning?: string; error?: string };
      if (!response.ok || !payload.analysis) throw new Error(payload.error || "Analyse indisponible");
      setAnalysis(payload.analysis);
      setAnalysisMode(payload.mode || "unknown");
      setStatus(payload.warning || "Analyse terminée. Elle doit encore passer les contrôles de risque et de validation.");
    } catch {
      setStatus("Échec de l’analyse. Aucune décision n’a été créée.");
    } finally {
      setLoading(false);
    }
  }

  function createPaperPlan() {
    const parsedRisk = Number(riskPercent) || 0;
    if (!stopLoss.trim()) {
      setStatus("Plan refusé : le stop loss est obligatoire.");
      return;
    }
    if (parsedRisk <= 0 || parsedRisk > riskPolicy.maxRiskPerTradePercent) {
      setStatus(`Plan refusé : le risque doit être entre 0 et ${riskPolicy.maxRiskPerTradePercent} %.`);
      return;
    }

    const plan: PaperPlan = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      pair,
      side,
      riskCad,
      riskPercent: parsedRisk,
      stopLoss: stopLoss.trim(),
      takeProfit: takeProfit.trim(),
      status: "DRAFT"
    };
    setPlans((current) => [plan, ...current].slice(0, 20));
    setStatus("Brouillon paper créé. Il n’a pas été envoyé à un courtier.");
  }

  useEffect(() => {
    void loadMarket();
  }, [pair, interval]);

  useEffect(() => {
    void loadRegistry();
    try {
      const saved = window.localStorage.getItem("gpt-forex-paper-plans");
      if (saved) setPlans(JSON.parse(saved) as PaperPlan[]);
    } catch {
      // A local journal is optional; the app remains usable without it.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("gpt-forex-paper-plans", JSON.stringify(plans));
    } catch {
      // Ignore unavailable local storage.
    }
  }, [plans]);

  function Header() {
    return (
      <header className="firm-header">
        <div className="firm-topline">
          <div className="actions">
            <span className="badge buy">Paper trading seulement</span>
            <span className="badge sell">Courtier réel désactivé</span>
            <span className="badge">0 stratégie certifiée</span>
          </div>
          <div className="actions">
            <button className="btn secondary compact-button" onClick={() => { void loadMarket(); void loadRegistry(); }}>
              <RefreshCcw size={15} /> Actualiser
            </button>
            <span className="badge">{pair} · {interval.toUpperCase()}</span>
          </div>
        </div>

        <div className="firm-title-grid">
          <div className="card firm-brand-card">
            <div className="eyebrow">GPT Forex Manager</div>
            <h1 className="firm-title">Quant Firm <span>Operating System</span></h1>
            <p className="small">Recherche, validation, risque, portefeuille, exécution simulée et futurs agents OpenAI.</p>
          </div>
          <Metric title="Source marché" value={market?.source || "—"} tone={market?.source === "alpha-vantage" ? "green" : "yellow"} />
          <Metric title="Agents connectés" value={`${registry?.connectedAgents || 0}/${registry?.totalAgents || 10}`} tone={(registry?.connectedAgents || 0) > 0 ? "green" : "yellow"} />
          <Metric title="Risque / trade" value={`${riskPolicy.maxRiskPerTradePercent} % max`} tone="green" />
          <Metric title="Perte quotidienne" value={`${riskPolicy.maxDailyLossPercent} % max`} tone="yellow" />
        </div>

        <nav className="firm-tabs" aria-label="Sections de la firme">
          {tabs.map((item) => (
            <button key={item} onClick={() => setTab(item)} className={tab === item ? "btn green" : "btn secondary"}>
              {item}
            </button>
          ))}
        </nav>
      </header>
    );
  }

  function Metric({ title, value, tone }: { title: string; value: string; tone?: string }) {
    return <div className="kpi"><div className="name">{title}</div><div className={`value small-value ${tone || ""}`}>{value}</div></div>;
  }

  function SystemStatus() {
    const dataIsSimulated = market?.source === "demo";
    return (
      <section className={`system-banner ${dataIsSimulated ? "system-banner-warning" : "system-banner-safe"}`}>
        {dataIsSimulated ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
        <div>
          <b>{dataIsSimulated ? "Données non admissibles au trading réel" : "Source de marché connectée"}</b>
          <div>{status}</div>
        </div>
      </section>
    );
  }

  function MarketChart() {
    return (
      <div className="card chart-card">
        <div className="chart-header">
          <div>
            <h2><BarChart3 size={20} /> Moniteur de marché</h2>
            <p className="small">{pair} · Prix {formatPrice(market?.price)} · Mise à jour {market?.updatedAt ? new Date(market.updatedAt).toLocaleString("fr-CA") : "—"}</p>
          </div>
          <div className="indicator-actions">
            <select className="select compact-select" value={mode} onChange={(event) => setMode(event.target.value as ChartMode)}>
              <option value="candles">Chandelles</option>
              <option value="bars">OHLC</option>
              <option value="line">Ligne</option>
              <option value="area">Zone</option>
            </select>
          </div>
        </div>
        <TradingViewCandleChart candles={market?.candles || []} mode={mode} />
      </div>
    );
  }

  function MarketControls() {
    return (
      <div className="card">
        <h2><Activity size={20} /> Univers de recherche</h2>
        <label>Paire</label>
        <select className="select" value={pair} onChange={(event) => setPair(event.target.value)}>
          {pairs.map((item) => <option key={item}>{item}</option>)}
        </select>
        <label>Horizon</label>
        <select className="select" value={interval} onChange={(event) => setInterval(event.target.value)}>
          {intervals.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select>
        <div className="system-list market-facts">
          <div><b>Provenance</b><span>{market?.source || "—"}</span></div>
          <div><b>Chandelles</b><span>{market?.candles.length || 0}</span></div>
          <div><b>Usage permis</b><span>{market?.source === "demo" ? "Interface et essais" : "Recherche contrôlée"}</span></div>
        </div>
      </div>
    );
  }

  function Pipeline() {
    return (
      <section>
        <div className="pipeline-flow">
          {firmModules.map((module, index) => (
            <div className="pipeline-step" key={module.id}>
              <span className="pipeline-number">{index + 1}</span>
              <b>{module.name}</b>
              <p>{module.mission}</p>
              <div className="pipeline-gate">{module.gate}</div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  function AnalysisPanel() {
    return (
      <div className="card">
        <div className="card-heading-row">
          <div>
            <h2><Brain size={20} /> Analyse contrôlée</h2>
            <p className="small">Le moteur actuel est temporaire. Les spécialistes OpenAI seront branchés un par un.</p>
          </div>
          <button className="btn green" onClick={runAnalysis} disabled={loading || !market}>
            <Play size={16} /> {loading ? "Analyse..." : "Lancer"}
          </button>
        </div>
        {!analysis ? (
          <div className="empty-state">Aucune analyse lancée. Aucun chiffre de performance inventé n’est affiché.</div>
        ) : (
          <div className="analysis-result">
            <div className="grid grid4">
              <Metric title="Action proposée" value={analysis.action} tone={analysis.action === "BUY" ? "green" : analysis.action === "SELL" ? "red" : "yellow"} />
              <Metric title="Confiance" value={`${analysis.confidence} %`} />
              <Metric title="Risque calculé" value={`${analysis.riskScore}/100`} tone="yellow" />
              <Metric title="Moteur" value={analysisMode} />
            </div>
            <div className="analysis-copy">
              <b>{analysis.marketBias}</b>
              <p>{analysis.finalDecision}</p>
              <div className="actions">
                <span className="badge">Entrée {formatPrice(analysis.entry)}</span>
                <span className="badge sell">Stop {formatPrice(analysis.stopLoss)}</span>
                <span className="badge buy">Cible {formatPrice(analysis.takeProfit)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function RiskWorkbench() {
    return (
      <section className="grid risk-layout">
        <div className="card">
          <h2><ShieldCheck size={20} /> Politique de risque obligatoire</h2>
          <div className="risk-policy-grid">
            <Metric title="Risque par transaction" value={`${riskPolicy.maxRiskPerTradePercent} %`} tone="green" />
            <Metric title="Perte quotidienne" value={`${riskPolicy.maxDailyLossPercent} %`} tone="yellow" />
            <Metric title="Drawdown portefeuille" value={`${riskPolicy.maxPortfolioDrawdownPercent} %`} tone="yellow" />
            <Metric title="Positions ouvertes" value={`${riskPolicy.maxOpenPositions} max`} />
            <Metric title="Exposition par paire" value={`${riskPolicy.maxPairExposurePercent} % max`} />
            <Metric title="Levier" value={`${riskPolicy.maxLeverage}× max`} tone="red" />
          </div>
          <div className="data-alert">Le Risk Governor conservera le droit de veto. Un agent de recherche ne pourra jamais désactiver ces limites.</div>
        </div>

        <div className="card">
          <h2><Target size={20} /> Brouillon paper</h2>
          <div className="grid grid2">
            <button className={side === "BUY" ? "btn green" : "btn secondary"} onClick={() => setSide("BUY")}><TrendingUp size={16} /> Achat</button>
            <button className={side === "SELL" ? "btn red" : "btn secondary"} onClick={() => setSide("SELL")}><TrendingDown size={16} /> Vente</button>
          </div>
          <label>Capital fictif en dollars canadiens</label>
          <input className="input" inputMode="decimal" value={capital} onChange={(event) => setCapital(event.target.value.replace(/[^0-9.]/g, ""))} />
          <label>Risque par transaction (%)</label>
          <input className="input" inputMode="decimal" value={riskPercent} onChange={(event) => setRiskPercent(event.target.value.replace(/[^0-9.]/g, ""))} />
          <div className="grid grid2">
            <div><label>Stop loss obligatoire</label><input className="input" value={stopLoss} onChange={(event) => setStopLoss(event.target.value)} placeholder="Ex. 1.08420" /></div>
            <div><label>Take profit</label><input className="input" value={takeProfit} onChange={(event) => setTakeProfit(event.target.value)} placeholder="Ex. 1.08950" /></div>
          </div>
          <div className="kpi risk-amount"><div className="name">Perte maximale planifiée</div><div className="value green">{cad(riskCad)}</div></div>
          <button className="btn green full-button" onClick={createPaperPlan}><FileCheck2 size={17} /> Créer le brouillon paper</button>
        </div>
      </section>
    );
  }

  function AgentRegistry() {
    return (
      <section>
        <div className="card agent-registry-summary">
          <div>
            <h2><Network size={20} /> Architecture : directeur principal avec spécialistes</h2>
            <p className="small">Chaque agent sera créé séparément dans OpenAI Platform, puis son identifiant sera ajouté comme variable serveur. Les identifiants ne seront jamais exposés dans le navigateur.</p>
          </div>
          <div className="actions">
            <span className={registry?.openAiApiConfigured ? "badge buy" : "badge sell"}>{registry?.openAiApiConfigured ? "Clé OpenAI configurée" : "Clé OpenAI absente"}</span>
            <span className="badge">{registry?.connectedAgents || 0} connecté(s)</span>
          </div>
        </div>
        <div className="agent-registry-grid">
          {(registry?.agents || []).map((agent, index) => (
            <article className="agent-registry-card" key={agent.key}>
              <div className="agent-card-topline">
                <span className="pipeline-number">{index + 1}</span>
                {agent.connected ? <CheckCircle2 className="green" size={20} /> : <Unplug className="yellow" size={20} />}
              </div>
              <h2>{agent.name}</h2>
              <span className="badge">{agent.role}</span>
              <p>{agent.responsibility}</p>
              <code>{agent.connectionEnvVar}</code>
              <div className={agent.connected ? "agent-status connected" : "agent-status waiting"}>{agent.connected ? "Configuré" : "À créer dans OpenAI Platform"}</div>
            </article>
          ))}
        </div>
      </section>
    );
  }

  function ValidationPanel() {
    return (
      <section className="grid validation-layout">
        <div className="card">
          <h2><FlaskConical size={20} /> Portes de validation</h2>
          {validationGates.map(([title, description], index) => (
            <div className="validation-row" key={title}>
              <span>{index + 1}</span>
              <div><b>{title}</b><p>{description}</p></div>
              <strong>REQUIS</strong>
            </div>
          ))}
        </div>
        <div className="card">
          <h2><Gauge size={20} /> État de certification</h2>
          <div className="certification-zero">0</div>
          <p className="muted">Aucune stratégie n’a encore réussi toutes les portes. L’application ne prétend donc pas posséder un avantage statistique.</p>
          <div className="system-list">
            <div><b>Backtests vérifiés</b><span>0</span></div>
            <div><b>Walk-forward réussis</b><span>0</span></div>
            <div><b>Stratégies en paper</b><span>0</span></div>
            <div><b>Stratégies certifiées</b><span>0</span></div>
          </div>
        </div>
      </section>
    );
  }

  function JournalPanel() {
    return (
      <section className="card">
        <div className="card-heading-row">
          <div><h2><Database size={20} /> Journal local des brouillons</h2><p className="small">Ce journal ne représente pas des transactions exécutées.</p></div>
          {plans.length > 0 && <button className="btn secondary compact-button" onClick={() => setPlans([])}>Effacer</button>}
        </div>
        {plans.length === 0 ? <div className="empty-state">Aucun brouillon paper enregistré.</div> : plans.map((plan) => (
          <div className="journal-row" key={plan.id}>
            <div><b>{plan.pair} · {plan.side}</b><p>{new Date(plan.createdAt).toLocaleString("fr-CA")}</p></div>
            <span className="badge">Risque {plan.riskPercent} %</span>
            <span className="badge sell">Stop {plan.stopLoss}</span>
            <span className="badge buy">Cible {plan.takeProfit || "non définie"}</span>
            <strong>{cad(plan.riskCad)}</strong>
          </div>
        ))}
      </section>
    );
  }

  function SettingsPanel() {
    return (
      <section className="grid grid2">
        <div className="card">
          <h2><Database size={20} /> Connexions actuelles</h2>
          <div className="system-list">
            <div><b>Alpha Vantage</b><span>{market?.source === "alpha-vantage" ? "Actif" : "Non confirmé"}</span></div>
            <div><b>Supabase historique</b><span>{market?.warning?.includes("Supabase") ? "Actif" : "À vérifier"}</span></div>
            <div><b>OpenAI API</b><span>{registry?.openAiApiConfigured ? "Configurée" : "Absente"}</span></div>
            <div><b>Courtier réel</b><span>Bloqué</span></div>
          </div>
        </div>
        <div className="card">
          <h2><ShieldCheck size={20} /> Règles non négociables</h2>
          <ul className="policy-list">
            <li>Aucun agent ne possède directement les clés d’un courtier.</li>
            <li>Les règles de risque restent dans du code déterministe.</li>
            <li>Les sorties des agents sont structurées, journalisées et vérifiables.</li>
            <li>Toute future exécution réelle exigera une phase séparée et une approbation explicite.</li>
          </ul>
        </div>
      </section>
    );
  }

  return (
    <main className="container master-container">
      <Header />
      <SystemStatus />

      {tab === "Vue d’ensemble" && (
        <>
          <section className="grid overview-layout">
            <MarketChart />
            <div className="grid">
              <MarketControls />
              <AnalysisPanel />
            </div>
          </section>
          <section className="section-block">
            <div className="section-heading"><h2><Network size={20} /> Chaîne de décision de la firme</h2><span className="badge">Séparation stricte des responsabilités</span></div>
            <Pipeline />
          </section>
        </>
      )}

      {tab === "Marchés" && <section className="grid markets-layout"><MarketControls /><MarketChart /></section>}
      {tab === "Pipeline quant" && <Pipeline />}
      {tab === "Validation" && <ValidationPanel />}
      {tab === "Risque" && <RiskWorkbench />}
      {tab === "Agents OpenAI" && <AgentRegistry />}
      {tab === "Journal" && <JournalPanel />}
      {tab === "Paramètres" && <SettingsPanel />}
    </main>
  );
}
