"use client";

import { useMemo, useState } from "react";
import { Activity, Brain, CheckCircle2, ClipboardList, Database, FlaskConical, Play, ShieldCheck, TriangleAlert } from "lucide-react";
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

type DataAuditOutput = {
  auditStatus: "ACCEPT" | "RESTRICT" | "BLOCK";
  dataClass: "LIVE_OR_DELAYED" | "HISTORICAL_RESEARCH" | "SYNTHETIC" | "INVALID";
  summary: string;
  confirmedFindings: string[];
  unresolvedRisks: string[];
  permittedUses: string[];
  prohibitedUses: string[];
  remediationSteps: string[];
  specialistsMayProceed: boolean;
  tradeDecision: "NO_TRADE_DECISION";
};

type MarketRegimeOutput = {
  regimeStatus: "USABLE" | "RESTRICTED" | "BLOCKED";
  primaryRegime: "TREND_UP" | "TREND_DOWN" | "RANGE" | "HIGH_VOLATILITY" | "LOW_VOLATILITY" | "TRANSITIONAL" | "BLOCKED_BY_DATA";
  trendRegime: "UP" | "DOWN" | "RANGE" | "TRANSITIONAL" | "BLOCKED";
  volatilityRegime: "HIGH" | "NORMAL" | "LOW" | "UNKNOWN";
  confidenceScore: number;
  summary: string;
  confirmedEvidence: string[];
  uncertainties: string[];
  admissibleStrategyFamilies: string[];
  excludedStrategyFamilies: string[];
  externalDataRequired: string[];
  specialistsMayProceed: boolean;
  tradeDecision: "NO_TRADE_DECISION";
};

type AlphaHypothesis = {
  hypothesisId: string;
  family: string;
  title: string;
  directionalBias: "LONG_ONLY" | "SHORT_ONLY" | "BOTH" | "NEUTRAL";
  economicIntuition: string;
  marketCondition: string;
  candidateCondition: string;
  candidateExitCondition: string;
  features: string[];
  holdingPeriodResearch: string;
  targetMetric: string;
  invalidationCriteria: string[];
  expectedFailureModes: string[];
  requiredData: string[];
  backtestSpecification: {
    researchOnly: true;
    liveTradingAllowed: false;
    paperOrderAllowed: false;
    minimumObservations: number;
    minimumOutOfSamplePercent: 30;
    minimumTrades: 50;
    maxFreeParameters: 6;
    requiredValidation: string[];
    robustnessTests: string[];
  };
  status: "SPECIFICATION_ONLY";
};

type AlphaResearchOutput = {
  researchStatus: "OPEN" | "RESTRICTED" | "BLOCKED";
  summary: string;
  allowedFamilies: string[];
  excludedFamilies: string[];
  hypotheses: AlphaHypothesis[];
  rejectedHypothesisCount: number;
  uncertainties: string[];
  nextStep: string;
  specialistsMayProceed: boolean;
  liveTradingAllowed: false;
  paperOrderAllowed: false;
  tradeDecision: "NO_TRADE_DECISION";
};

type MasterResponse = {
  agent: string;
  mode: string;
  model: string;
  orchestration: string;
  dataQuality: {
    mode: string;
    diagnostics: {
      decision: "ACCEPT" | "RESTRICT" | "BLOCK";
      dataClass: string;
      candleCount: number;
      missingIntervalCount: number;
      invalidOhlcCount: number;
      duplicateTimestampCount: number;
      staleMinutes: number | null;
    };
    output: DataAuditOutput;
  };
  marketRegime: {
    mode: string;
    diagnostics: {
      status: "USABLE" | "RESTRICTED" | "BLOCKED";
      primaryRegime: string;
      trendRegime: string;
      volatilityRegime: string;
      confidenceScore: number;
      movingAverageSpreadBps: number | null;
      slopeBpsPerBar: number | null;
      efficiencyRatio: number | null;
      volatilityRatio: number | null;
      eventRisk: string;
    };
    output: MarketRegimeOutput;
  };
  alphaResearch: {
    mode: string;
    envelope: {
      status: "OPEN" | "RESTRICTED" | "BLOCKED";
      availableObservations: number;
      minimumObservations: number;
      insufficientForBacktest: boolean;
      maxHypotheses: 3;
      minimumOutOfSamplePercent: 30;
      minimumTrades: 50;
      allowedFamilies: string[];
      excludedFamilies: string[];
      researchHorizons: string[];
      requiredValidation: string[];
    };
    output: AlphaResearchOutput;
  };
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
  if (status === "READY_FOR_SPECIALISTS") return "Prêt pour la validation";
  if (status === "BLOCKED_MISSING_DATA") return "Bloqué : prérequis manquant";
  return "Mandat refusé";
}

function auditTone(status: DataAuditOutput["auditStatus"]) {
  if (status === "ACCEPT") return "green";
  if (status === "BLOCK") return "red";
  return "yellow";
}

function regimeTone(status: MarketRegimeOutput["regimeStatus"]) {
  if (status === "USABLE") return "green";
  if (status === "BLOCKED") return "red";
  return "yellow";
}

function alphaTone(status: AlphaResearchOutput["researchStatus"]) {
  if (status === "OPEN") return "green";
  if (status === "BLOCKED") return "red";
  return "yellow";
}

function formatMetric(value: number | null, decimals = 2) {
  return value == null ? "—" : value.toFixed(decimals);
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
          <h2><Brain size={21} /> Chaîne Agents 02 → 03 → 04 → 01</h2>
          <p className="small">Les données, le régime et les hypothèses sont contrôlés avant que le Directeur prépare le mandat de validation.</p>
        </div>
        <div className="actions">
          <span className={apiConfigured ? "badge buy" : "badge sell"}>{apiConfigured ? "4 agents OpenAI prêts" : "Clé OpenAI requise"}</span>
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
          <Play size={16} /> {loading ? "Audit, régime, hypothèses et mandat..." : "Lancer la chaîne quant"}
        </button>
      </div>

      {!apiConfigured && <div className="warning">OPENAI_API_KEY doit être configurée dans Vercel avant d’exécuter les agents.</div>}
      {error && <div className="system-banner system-banner-warning"><TriangleAlert size={20} /><div><b>Échec du mandat</b><div>{error}</div></div></div>}

      {result && (
        <div className="master-output">
          <div className="data-quality-result">
            <div className="card-heading-row">
              <div>
                <h2><Database size={20} /> Agent 02 — Data Quality Agent</h2>
                <p className="small">Verdict déterministe appliqué avant toute classification.</p>
              </div>
              <span className={`badge ${auditTone(result.dataQuality.output.auditStatus)}`}>{result.dataQuality.output.auditStatus}</span>
            </div>
            <div className="grid grid4">
              <div className="kpi"><div className="name">Classe</div><div className="value small-value">{result.dataQuality.output.dataClass}</div></div>
              <div className="kpi"><div className="name">Chandelles</div><div className="value">{result.dataQuality.diagnostics.candleCount}</div></div>
              <div className="kpi"><div className="name">Intervalles manquants</div><div className="value">{result.dataQuality.diagnostics.missingIntervalCount}</div></div>
              <div className="kpi"><div className="name">Peut poursuivre</div><div className={`value small-value ${result.dataQuality.output.specialistsMayProceed ? "green" : "red"}`}>{result.dataQuality.output.specialistsMayProceed ? "OUI" : "NON"}</div></div>
            </div>
            <p>{result.dataQuality.output.summary}</p>
            <div className="grid grid2 master-detail-grid">
              <div className="agent">
                <h2><CheckCircle2 size={18} /> Usages permis</h2>
                <ul>{result.dataQuality.output.permittedUses.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
              <div className="agent">
                <h2><TriangleAlert size={18} /> Usages interdits</h2>
                <ul>{result.dataQuality.output.prohibitedUses.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
            </div>
            {result.dataQuality.output.remediationSteps.length > 0 && (
              <div className="warning"><b>Corrections proposées :</b> {result.dataQuality.output.remediationSteps.join(" · ")}</div>
            )}
          </div>

          <div className="regime-result">
            <div className="card-heading-row">
              <div>
                <h2><Activity size={20} /> Agent 03 — Market Regime Agent</h2>
                <p className="small">Classification déterministe de la tendance et de la volatilité.</p>
              </div>
              <span className={`badge ${regimeTone(result.marketRegime.output.regimeStatus)}`}>{result.marketRegime.output.regimeStatus}</span>
            </div>
            <div className="grid grid4">
              <div className="kpi"><div className="name">Régime principal</div><div className="value small-value">{result.marketRegime.output.primaryRegime}</div></div>
              <div className="kpi"><div className="name">Tendance</div><div className="value small-value">{result.marketRegime.output.trendRegime}</div></div>
              <div className="kpi"><div className="name">Volatilité</div><div className="value small-value yellow">{result.marketRegime.output.volatilityRegime}</div></div>
              <div className="kpi"><div className="name">Confiance</div><div className="value">{result.marketRegime.output.confidenceScore}/100</div></div>
            </div>
            <p>{result.marketRegime.output.summary}</p>
            <div className="regime-metrics">
              <span>Écart MM : <b>{formatMetric(result.marketRegime.diagnostics.movingAverageSpreadBps, 2)} pb</b></span>
              <span>Pente : <b>{formatMetric(result.marketRegime.diagnostics.slopeBpsPerBar, 3)} pb/barre</b></span>
              <span>Efficacité : <b>{formatMetric(result.marketRegime.diagnostics.efficiencyRatio, 3)}</b></span>
              <span>Ratio volatilité : <b>{formatMetric(result.marketRegime.diagnostics.volatilityRatio, 2)}</b></span>
            </div>
            <div className="grid grid2 master-detail-grid">
              <div className="agent">
                <h2><CheckCircle2 size={18} /> Familles admissibles</h2>
                <ul>{result.marketRegime.output.admissibleStrategyFamilies.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
              <div className="agent">
                <h2><TriangleAlert size={18} /> Familles exclues</h2>
                <ul>{result.marketRegime.output.excludedStrategyFamilies.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
            </div>
            <div className="warning"><b>Risque événementiel inconnu :</b> un calendrier économique fiable doit être ajouté avant toute conclusion liée aux annonces ou aux crises.</div>
          </div>

          <div className="alpha-result">
            <div className="card-heading-row">
              <div>
                <h2><FlaskConical size={20} /> Agent 04 — Alpha Research Agent</h2>
                <p className="small">Hypothèses falsifiables destinées uniquement aux futurs backtests.</p>
              </div>
              <span className={`badge ${alphaTone(result.alphaResearch.output.researchStatus)}`}>{result.alphaResearch.output.researchStatus}</span>
            </div>
            <div className="grid grid4">
              <div className="kpi"><div className="name">Hypothèses conservées</div><div className="value">{result.alphaResearch.output.hypotheses.length}</div></div>
              <div className="kpi"><div className="name">Observations disponibles</div><div className="value">{result.alphaResearch.envelope.availableObservations}</div></div>
              <div className="kpi"><div className="name">Minimum exigé</div><div className="value">{result.alphaResearch.envelope.minimumObservations}</div></div>
              <div className="kpi"><div className="name">Transaction autorisée</div><div className="value small-value red">NON</div></div>
            </div>
            <p>{result.alphaResearch.output.summary}</p>
            {result.alphaResearch.envelope.insufficientForBacktest && (
              <div className="warning"><b>Échantillon insuffisant :</b> les idées peuvent être spécifiées, mais aucune performance ne peut être validée avec les chandelles actuellement chargées.</div>
            )}
            <div className="alpha-hypotheses">
              {result.alphaResearch.output.hypotheses.length === 0 && <div className="empty-state">Aucune hypothèse conforme n’a été conservée.</div>}
              {result.alphaResearch.output.hypotheses.map((hypothesis) => (
                <article className="alpha-hypothesis" key={hypothesis.hypothesisId}>
                  <div className="agent-card-topline">
                    <div>
                      <div className="eyebrow">{hypothesis.hypothesisId}</div>
                      <h2>{hypothesis.title}</h2>
                    </div>
                    <div className="actions">
                      <span className="badge">{hypothesis.directionalBias}</span>
                      <span className="badge yellow">{hypothesis.status}</span>
                    </div>
                  </div>
                  <p><b>Famille :</b> {hypothesis.family}</p>
                  <p><b>Intuition :</b> {hypothesis.economicIntuition}</p>
                  <div className="grid grid2 alpha-rule-grid">
                    <div><b>Condition candidate de recherche</b><p>{hypothesis.candidateCondition}</p></div>
                    <div><b>Condition de sortie à tester</b><p>{hypothesis.candidateExitCondition}</p></div>
                  </div>
                  <div className="alpha-meta">
                    <span>Horizon : <b>{hypothesis.holdingPeriodResearch}</b></span>
                    <span>Minimum : <b>{hypothesis.backtestSpecification.minimumObservations} observations</b></span>
                    <span>Hors échantillon : <b>{hypothesis.backtestSpecification.minimumOutOfSamplePercent} %</b></span>
                    <span>Transactions simulées : <b>{hypothesis.backtestSpecification.minimumTrades} minimum</b></span>
                  </div>
                  <div className="grid grid2 master-detail-grid">
                    <div className="agent">
                      <h2>Critères d’invalidation</h2>
                      <ul>{hypothesis.invalidationCriteria.map((item) => <li key={item}>{item}</li>)}</ul>
                    </div>
                    <div className="agent">
                      <h2>Échecs possibles</h2>
                      <ul>{hypothesis.expectedFailureModes.map((item) => <li key={item}>{item}</li>)}</ul>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="grid grid4">
            <div className="kpi"><div className="name">État du Directeur</div><div className="value small-value">{statusLabel(result.output.mandateStatus)}</div></div>
            <div className="kpi"><div className="name">Qualité transmise</div><div className="value small-value yellow">{result.output.dataQuality.status}</div></div>
            <div className="kpi"><div className="name">Prochains spécialistes</div><div className="value">{result.output.requestedSpecialists.length}</div></div>
            <div className="kpi"><div className="name">Décision de transaction</div><div className="value small-value green">Aucune</div></div>
          </div>

          <div className="master-summary">
            <h2><ClipboardList size={19} /> Agent 01 — Mandat de validation</h2>
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
            <h2>Prochains spécialistes autorisés</h2>
            <div className="actions">
              {result.output.requestedSpecialists.length === 0 && <span className="badge">Aucun tant que le blocage n’est pas corrigé</span>}
              {result.output.requestedSpecialists.map((key) => <span className="badge" key={key}>{specialistLabels[key] || key}</span>)}
            </div>
            <h2 className="master-subheading">Questions de validation</h2>
            <ol>{result.output.researchQuestions.map((item) => <li key={item}>{item}</li>)}</ol>
          </div>

          <div className="system-banner system-banner-safe">
            <CheckCircle2 size={20} />
            <div><b>Prochaine étape</b><div>{result.output.nextStep}</div></div>
          </div>

          <p className="small">Orchestration : {result.orchestration} · Directeur : {result.model} · Généré le {new Date(result.generatedAt).toLocaleString("fr-CA")}</p>
        </div>
      )}
    </section>
  );
}
