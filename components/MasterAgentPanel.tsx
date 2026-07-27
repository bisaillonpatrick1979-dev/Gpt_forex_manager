"use client";

import { useMemo, useState } from "react";
import { Brain, CheckCircle2, ClipboardList, Play, ShieldCheck, TriangleAlert } from "lucide-react";
import { MarketResponse } from "@/lib/types";

const specialistLabels: Record<string, string> = {
  "data-quality": "Data Quality Agent",
  "market-regime": "Market Regime Agent",
  "alpha-research": "Alpha Research Agent",
  "backtest-auditor": "Backtest Auditor",
  portfolio: "Portfolio Allocator",
  risk: "Risk Governor",
  execution: "Execution Planner",
  monitoring: "Performance Monitor",
  journal: "Compliance Journal"
};

type MasterOutput = {
  mandateStatus: "READY_FOR_SPECIALISTS" | "BLOCKED_MISSING_DATA" | "REJECTED_OUT_OF_SCOPE";
  measurableObjective: string;
  marketScope: string[];
  timeHorizons: string[];
  observedFacts: string[];
  hypothesesToTest: string[];
  unknowns: string[];
  dataQuality: {
    status: "ACCEPTABLE_FOR_RESEARCH" | "SIMULATION_ONLY" | "INSUFFICIENT";
    reasons: string[];
  };
  requestedSpecialists: string[];
  researchQuestions: string[];
  riskConstraints: {
    mode: "paper-only";
    baseCurrency: "CAD";
    maxRiskPerTradePercent: number;
    maxDailyLossPercent: number;
    maxPortfolioDrawdownPercent: number;
    maxOpenPositions: number;
    maxPairExposurePercent: number;
    maxLeverage: number;
    stopLossRequired: true;
    independentRiskVetoRequired: true;
    realBrokerEnabled: false;
  };
  prohibitedActions: string[];
  synthesis: string;
  nextStep: string;
  tradeDecision: "NO_TRADE_DECISION";
};

type MasterResponse = {
  agent: string;
  mode: string;
  model: string;
  output: MasterOutput;
  generatedAt: string;
};

type Props = {
  pair: string;
  interval: string;
  capitalCad: number;
  market: MarketResponse | null;
  apiConfigured: boolean;
};

function statusLabel(status: MasterOutput["mandateStatus"]) {
  if (status === "READY_FOR_SPECIALISTS") return "Prêt pour les spécialistes";
  if (status === "BLOCKED_MISSING_DATA") return "Bloqué : données manquantes";
  return "Mandat refusé";
}

export default function MasterAgentPanel({ pair, interval, capitalCad, market, apiConfigured }: Props) {
  const [objective, setObjective] = useState(
    "Déterminer quelles hypothèses de stratégie sur cette paire méritent un backtest rigoureux, sans produire de signal de transaction."
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<MasterResponse | null>(null);

  const canRun = useMemo(
    () => Boolean(apiConfigured && market && market.candles.length >= 10 && objective.trim().length >= 10),
    [apiConfigured, market, objective]
  );

  async function runDirector() {
    if (!market || !canRun) return;

    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/agents/master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objective: objective.trim(),
          pair,
          interval,
          capitalCad,
          source: market.source,
          warning: market.warning,
          updatedAt: market.updatedAt,
          candles: market.candles.slice(-120)
        })
      });

      const payload = await response.json() as MasterResponse & { error?: string };
      if (!response.ok || !payload.output) throw new Error(payload.error || "Le mandat n’a pas été produit.");
      setResult(payload);
    } catch (runError) {
      setResult(null);
      setError(runError instanceof Error ? runError.message : "Erreur inconnue.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card master-agent-console">
      <div className="card-heading-row">
        <div>
          <h2><Brain size={21} /> Agent 01 — Directeur quantitatif</h2>
          <p className="small">Il prépare le mandat et choisit les spécialistes. Il ne peut pas émettre d’ordre ni de signal BUY/SELL.</p>
        </div>
        <div className="actions">
          <span className={apiConfigured ? "badge buy" : "badge sell"}>{apiConfigured ? "OpenAI prêt" : "Clé OpenAI requise"}</span>
          <span className="badge">{pair} · {interval.toUpperCase()}</span>
        </div>
      </div>

      <label>Mandat de recherche</label>
      <textarea
        className="textarea master-objective"
        value={objective}
        onChange={(event) => setObjective(event.target.value)}
        maxLength={3000}
      />
      <div className="master-run-row">
        <div className="small">Capital fictif : {capitalCad.toLocaleString("fr-CA", { style: "currency", currency: "CAD" })}</div>
        <button className="btn green" onClick={runDirector} disabled={!canRun || loading}>
          <Play size={16} /> {loading ? "Préparation du mandat..." : "Lancer le Directeur"}
        </button>
      </div>

      {!apiConfigured && <div className="warning">OPENAI_API_KEY doit être configurée dans Vercel avant d’exécuter cet agent.</div>}
      {error && <div className="system-banner system-banner-warning"><TriangleAlert size={20} /><div><b>Échec du mandat</b><div>{error}</div></div></div>}

      {result && (
        <div className="master-output">
          <div className="grid grid4">
            <div className="kpi"><div className="name">État</div><div className="value small-value">{statusLabel(result.output.mandateStatus)}</div></div>
            <div className="kpi"><div className="name">Qualité des données</div><div className="value small-value yellow">{result.output.dataQuality.status}</div></div>
            <div className="kpi"><div className="name">Spécialistes requis</div><div className="value">{result.output.requestedSpecialists.length}</div></div>
            <div className="kpi"><div className="name">Décision de transaction</div><div className="value small-value green">Aucune</div></div>
          </div>

          <div className="master-summary">
            <h2><ClipboardList size={19} /> Objectif mesurable</h2>
            <p>{result.output.measurableObjective}</p>
            <div className="data-alert">{result.output.synthesis}</div>
          </div>

          <div className="grid grid2 master-detail-grid">
            <div className="agent">
              <h2><CheckCircle2 size={18} /> Faits observés</h2>
              <ul>{result.output.observedFacts.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
            <div className="agent">
              <h2><TriangleAlert size={18} /> Inconnues</h2>
              <ul>{result.output.unknowns.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
            <div className="agent">
              <h2><Brain size={18} /> Hypothèses à tester</h2>
              <ul>{result.output.hypothesesToTest.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
            <div className="agent">
              <h2><ShieldCheck size={18} /> Qualité des données</h2>
              <ul>{result.output.dataQuality.reasons.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          </div>

          <div className="card master-specialists-card">
            <h2>Spécialistes demandés</h2>
            <div className="actions">
              {result.output.requestedSpecialists.map((key) => <span className="badge" key={key}>{specialistLabels[key] || key}</span>)}
            </div>
            <h2 className="master-subheading">Questions de recherche</h2>
            <ol>{result.output.researchQuestions.map((item) => <li key={item}>{item}</li>)}</ol>
          </div>

          <div className="system-banner system-banner-safe">
            <CheckCircle2 size={20} />
            <div><b>Prochaine étape</b><div>{result.output.nextStep}</div></div>
          </div>

          <p className="small">Moteur : {result.model} · Configuration : {result.mode} · Généré le {new Date(result.generatedAt).toLocaleString("fr-CA")}</p>
        </div>
      )}
    </section>
  );
}
