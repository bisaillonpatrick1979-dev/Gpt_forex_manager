"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, FileWarning, FlaskConical, Play, ShieldX, TriangleAlert } from "lucide-react";
import type { MarketResponse } from "@/lib/types";

 type AuditReview = {
  hypothesisId: string;
  title: string;
  specificationVerdict: "READY_TO_IMPLEMENT" | "NEEDS_REVISION" | "BLOCKED";
  resultVerdict: "NOT_RUN" | "INSUFFICIENT_EVIDENCE" | "REJECTED" | "CANDIDATE_SURVIVED_PRELIMINARY";
  hostileSummary: string;
  deterministicReasons: string[];
  missingRequirements: string[];
  likelyBiases: string[];
  specificationDefects: string[];
  requiredTestMatrix: string[];
  rejectionTriggers: string[];
  evidencePresent: boolean;
  candidateMayAdvance: boolean;
};

type BacktestAuditorResponse = {
  agent: string;
  mode: string;
  model: string;
  envelope: {
    overallStatus: "BLOCKED" | "NEEDS_REVISION" | "AWAITING_BACKTEST_RESULTS" | "EVIDENCE_REJECTED" | "CANDIDATE_SURVIVED_PRELIMINARY";
    performanceClaimAllowed: false;
    hypotheses: Array<{
      hypothesisId: string;
      evidencePresent: boolean;
      candidateMayAdvance: boolean;
    }>;
  };
  output: {
    auditStatus: "BLOCKED" | "NEEDS_REVISION" | "AWAITING_BACKTEST_RESULTS" | "EVIDENCE_REJECTED" | "CANDIDATE_SURVIVED_PRELIMINARY";
    summary: string;
    reviews: AuditReview[];
    crossHypothesisRisks: string[];
    unresolvedRisks: string[];
    requiredAuditTrail: string[];
    nextStep: string;
    specialistsMayProceed: boolean;
    performanceClaimAllowed: false;
    liveTradingAllowed: false;
    paperOrderAllowed: false;
    tradeDecision: "NO_TRADE_DECISION";
  };
  generatedAt: string;
};

type Props = {
  pair: string;
  interval: string;
  market: MarketResponse | null;
  apiConfigured: boolean;
};

function tone(status: BacktestAuditorResponse["output"]["auditStatus"]) {
  if (status === "CANDIDATE_SURVIVED_PRELIMINARY") return "green";
  if (status === "AWAITING_BACKTEST_RESULTS" || status === "NEEDS_REVISION") return "yellow";
  return "red";
}

export default function BacktestAuditorPanel({ pair, interval, market, apiConfigured }: Props) {
  const [objective, setObjective] = useState("Tenter de réfuter les hypothèses produites et préparer un dossier de backtest hostile, sans inventer de performance.");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<BacktestAuditorResponse | null>(null);

  const canRun = useMemo(
    () => Boolean(apiConfigured && market && market.candles.length >= 10 && objective.trim().length >= 10),
    [apiConfigured, market, objective]
  );

  async function runAudit() {
    if (!market || !canRun) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/agents/backtest-auditor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objective: objective.trim(),
          pair,
          interval,
          source: market.source,
          warning: market.warning,
          candles: market.candles.slice(-120)
        })
      });
      const payload = await response.json() as BacktestAuditorResponse & { error?: string };
      if (!response.ok || !payload.output) throw new Error(payload.error || "L’audit n’a pas été produit.");
      setResult(payload);
    } catch (runError) {
      setResult(null);
      setError(runError instanceof Error ? runError.message : "Erreur inconnue.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card backtest-auditor-console">
      <div className="card-heading-row">
        <div>
          <h2><ShieldX size={21} /> Agent 05 — Backtest Auditor</h2>
          <p className="small">Auditeur hostile : il cherche les fuites de données, le surajustement, les coûts oubliés et les preuves insuffisantes.</p>
        </div>
        <div className="actions">
          <span className={apiConfigured ? "badge buy" : "badge sell"}>{apiConfigured ? "Agent OpenAI prêt" : "Clé OpenAI requise"}</span>
          <span className="badge">{pair} · {interval.toUpperCase()}</span>
        </div>
      </div>

      <label>Mandat hostile</label>
      <textarea className="textarea" value={objective} onChange={(event) => setObjective(event.target.value)} maxLength={3000} />
      <div className="master-run-row">
        <div className="small">Aucun résultat financier n’est présumé ni calculé par le modèle.</div>
        <button className="btn green" onClick={runAudit} disabled={!canRun || loading}>
          <Play size={16} /> {loading ? "Audit hostile en cours..." : "Lancer l’audit hostile"}
        </button>
      </div>

      {error && <div className="system-banner system-banner-warning"><TriangleAlert size={20} /><div><b>Échec de l’audit</b><div>{error}</div></div></div>}

      {result && (
        <div className="backtest-audit-output">
          <div className="card-heading-row">
            <div>
              <div className="eyebrow">Verdict déterministe</div>
              <h2>{result.output.auditStatus}</h2>
            </div>
            <span className={`badge ${tone(result.output.auditStatus)}`}>{result.output.specialistsMayProceed ? "Progression préliminaire" : "Progression bloquée"}</span>
          </div>

          <div className="grid grid4">
            <div className="kpi"><div className="name">Hypothèses auditées</div><div className="value">{result.output.reviews.length}</div></div>
            <div className="kpi"><div className="name">Dossiers de preuve</div><div className="value">{result.output.reviews.filter((review) => review.evidencePresent).length}</div></div>
            <div className="kpi"><div className="name">Candidatures admissibles</div><div className="value">{result.output.reviews.filter((review) => review.candidateMayAdvance).length}</div></div>
            <div className="kpi"><div className="name">Performance revendiquable</div><div className="value small-value red">NON</div></div>
          </div>

          <p>{result.output.summary}</p>
          {result.output.auditStatus === "AWAITING_BACKTEST_RESULTS" && (
            <div className="warning"><b>Backtest non exécuté :</b> l’agent examine les spécifications, mais aucun dossier chiffré, versionné et reproductible n’a été fourni.</div>
          )}

          <div className="audit-review-list">
            {result.output.reviews.map((review) => (
              <article className="audit-review-card" key={review.hypothesisId}>
                <div className="agent-card-topline">
                  <div><div className="eyebrow">{review.hypothesisId}</div><h2>{review.title}</h2></div>
                  <div className="actions">
                    <span className="badge">{review.specificationVerdict}</span>
                    <span className={`badge ${review.candidateMayAdvance ? "green" : "yellow"}`}>{review.resultVerdict}</span>
                  </div>
                </div>
                <p>{review.hostileSummary}</p>
                <div className="grid grid2 master-detail-grid">
                  <div className="agent">
                    <h2><FileWarning size={18} /> Exigences manquantes</h2>
                    {review.missingRequirements.length === 0 ? <p className="small">Aucune lacune déterministe détectée dans la spécification.</p> : <ul>{review.missingRequirements.map((item) => <li key={item}>{item}</li>)}</ul>}
                  </div>
                  <div className="agent">
                    <h2><TriangleAlert size={18} /> Biais probables</h2>
                    {review.likelyBiases.length === 0 ? <p className="small">Aucun biais supplémentaire formulé.</p> : <ul>{review.likelyBiases.map((item) => <li key={item}>{item}</li>)}</ul>}
                  </div>
                </div>
                <div className="audit-test-matrix">
                  <h2><FlaskConical size={18} /> Matrice obligatoire</h2>
                  <ol>{review.requiredTestMatrix.slice(0, 10).map((item) => <li key={item}>{item}</li>)}</ol>
                </div>
              </article>
            ))}
          </div>

          <div className="grid grid2 master-detail-grid">
            <div className="agent"><h2>Risques communs</h2><ul>{result.output.crossHypothesisRisks.map((item) => <li key={item}>{item}</li>)}</ul></div>
            <div className="agent"><h2>Traçabilité obligatoire</h2><ul>{result.output.requiredAuditTrail.map((item) => <li key={item}>{item}</li>)}</ul></div>
          </div>

          <div className="system-banner system-banner-safe">
            <CheckCircle2 size={20} />
            <div><b>Prochaine étape factuelle</b><div>{result.output.nextStep}</div></div>
          </div>
          <p className="small">Mode : {result.mode} · Modèle : {result.model} · Généré le {new Date(result.generatedAt).toLocaleString("fr-CA")}</p>
        </div>
      )}
    </section>
  );
}
