import type { AlphaHypothesis, AlphaResearchOutput } from "@/lib/agents/alpha-research";

export type BacktestEvidence = {
  hypothesisId: string;
  evidenceVersion: string;
  generatedAt: string;
  sourceHash: string;
  observations: number;
  trades: number;
  outOfSamplePercent: number;
  chronologicalSplit: boolean;
  walkForwardWindows: number;
  costsIncluded: boolean;
  spreadIncluded: boolean;
  slippageIncluded: boolean;
  lookaheadPrevented: boolean;
  multipleTestingAdjusted: boolean;
  parameterCount: number;
  outOfSampleNetReturnPercent: number;
  outOfSampleSharpe: number;
  profitFactor: number;
  maxDrawdownPercent: number;
  stabilityScore: number;
};

export type BacktestHypothesisDiagnostics = {
  hypothesisId: string;
  title: string;
  specificationVerdict: "READY_TO_IMPLEMENT" | "NEEDS_REVISION" | "BLOCKED";
  resultVerdict: "NOT_RUN" | "INSUFFICIENT_EVIDENCE" | "REJECTED" | "CANDIDATE_SURVIVED_PRELIMINARY";
  deterministicReasons: string[];
  missingRequirements: string[];
  requiredTestMatrix: string[];
  candidateMayAdvance: boolean;
  evidencePresent: boolean;
};

export type BacktestAuditEnvelope = {
  overallStatus: "BLOCKED" | "NEEDS_REVISION" | "AWAITING_BACKTEST_RESULTS" | "EVIDENCE_REJECTED" | "CANDIDATE_SURVIVED_PRELIMINARY";
  researchOnly: true;
  liveTradingAllowed: false;
  paperOrderAllowed: false;
  performanceClaimAllowed: false;
  hypotheses: BacktestHypothesisDiagnostics[];
  deterministicReasons: string[];
  requiredAuditTrail: string[];
  specialistsMayProceed: boolean;
};

const LOOKAHEAD_PATTERNS = [
  /future/i,
  /next candle/i,
  /next bar/i,
  /prochaine chandelle/i,
  /prochaine bougie/i,
  /prix futur/i,
  /subsequent close/i,
  /clôture suivante/i
];

function specificationDiagnostics(hypothesis: AlphaHypothesis) {
  const missingRequirements: string[] = [];
  const deterministicReasons: string[] = [];

  if (hypothesis.status !== "SPECIFICATION_ONLY") {
    missingRequirements.push("Le statut de l'hypothèse doit rester SPECIFICATION_ONLY.");
  }
  if (!hypothesis.candidateCondition.trim()) {
    missingRequirements.push("Condition candidate manquante.");
  }
  if (!hypothesis.candidateExitCondition.trim()) {
    missingRequirements.push("Condition de sortie candidate manquante.");
  }
  if (hypothesis.features.length === 0) {
    missingRequirements.push("Aucune variable de recherche déclarée.");
  }
  if (hypothesis.invalidationCriteria.length === 0) {
    missingRequirements.push("Aucun critère d'invalidation défini avant le test.");
  }
  if (hypothesis.expectedFailureModes.length === 0) {
    missingRequirements.push("Aucun mode d'échec anticipé.");
  }
  if (hypothesis.requiredData.length === 0) {
    missingRequirements.push("Données requises non précisées.");
  }
  if (hypothesis.backtestSpecification.robustnessTests.length === 0) {
    missingRequirements.push("Aucun test de robustesse propre à l'hypothèse.");
  }

  const combinedRules = `${hypothesis.candidateCondition} ${hypothesis.candidateExitCondition}`;
  if (LOOKAHEAD_PATTERNS.some((pattern) => pattern.test(combinedRules))) {
    missingRequirements.push("Risque explicite de fuite temporelle ou d'utilisation d'une information future.");
  }

  deterministicReasons.push(
    `${hypothesis.hypothesisId} reste une spécification de recherche, pas une stratégie validée.`,
    `${hypothesis.features.length} variable(s) déclarée(s); maximum interne de ${hypothesis.backtestSpecification.maxFreeParameters} paramètres libres.`,
    `Minimum exigé : ${hypothesis.backtestSpecification.minimumObservations} observations, ${hypothesis.backtestSpecification.minimumTrades} transactions simulées et ${hypothesis.backtestSpecification.minimumOutOfSamplePercent} % hors échantillon.`
  );

  const specificationVerdict = missingRequirements.length === 0 ? "READY_TO_IMPLEMENT" as const : "NEEDS_REVISION" as const;
  return { specificationVerdict, missingRequirements, deterministicReasons };
}

function evidenceDiagnostics(hypothesis: AlphaHypothesis, evidence?: BacktestEvidence) {
  if (!evidence) {
    return {
      resultVerdict: "NOT_RUN" as const,
      evidenceReasons: ["Aucun résultat de backtest versionné n'a été fourni."],
      evidenceMissing: ["Exécuter le backtest déterministe et fournir un dossier de résultats complet."],
      candidateMayAdvance: false
    };
  }

  const evidenceMissing: string[] = [];
  const evidenceReasons: string[] = [];
  if (!evidence.evidenceVersion.trim()) evidenceMissing.push("Version du dossier de preuve manquante.");
  if (!evidence.generatedAt.trim()) evidenceMissing.push("Horodatage du dossier de preuve manquant.");
  if (!evidence.sourceHash.trim()) evidenceMissing.push("Empreinte des données ou du code manquante.");
  if (evidence.hypothesisId !== hypothesis.hypothesisId) evidenceMissing.push("Le dossier ne correspond pas à l'hypothèse auditée.");
  if (evidence.observations < hypothesis.backtestSpecification.minimumObservations) evidenceMissing.push("Nombre d'observations inférieur au minimum exigé.");
  if (evidence.trades < hypothesis.backtestSpecification.minimumTrades) evidenceMissing.push("Nombre de transactions simulées inférieur au minimum exigé.");
  if (evidence.outOfSamplePercent < hypothesis.backtestSpecification.minimumOutOfSamplePercent) evidenceMissing.push("Part hors échantillon insuffisante.");
  if (!evidence.chronologicalSplit) evidenceMissing.push("Séparation chronologique non confirmée.");
  if (evidence.walkForwardWindows < 3) evidenceMissing.push("Moins de trois fenêtres walk-forward.");
  if (!evidence.costsIncluded) evidenceMissing.push("Coûts de transaction non inclus.");
  if (!evidence.spreadIncluded) evidenceMissing.push("Spread non inclus.");
  if (!evidence.slippageIncluded) evidenceMissing.push("Glissement non inclus.");
  if (!evidence.lookaheadPrevented) evidenceMissing.push("Prévention de la fuite temporelle non démontrée.");
  if (!evidence.multipleTestingAdjusted) evidenceMissing.push("Correction des essais multiples non démontrée.");
  if (evidence.parameterCount > hypothesis.backtestSpecification.maxFreeParameters) evidenceMissing.push("Nombre de paramètres libres supérieur à la limite.");

  evidenceReasons.push(
    `Résultat hors échantillon net : ${evidence.outOfSampleNetReturnPercent.toFixed(2)} %.`,
    `Sharpe hors échantillon : ${evidence.outOfSampleSharpe.toFixed(2)}.`,
    `Profit factor : ${evidence.profitFactor.toFixed(2)}.`,
    `Drawdown maximal : ${evidence.maxDrawdownPercent.toFixed(2)} %.`,
    `Score de stabilité fourni : ${evidence.stabilityScore.toFixed(2)}.`
  );

  if (evidenceMissing.length > 0) {
    return {
      resultVerdict: "INSUFFICIENT_EVIDENCE" as const,
      evidenceReasons,
      evidenceMissing,
      candidateMayAdvance: false
    };
  }

  const failedPerformanceGate =
    evidence.outOfSampleNetReturnPercent <= 0 ||
    evidence.outOfSampleSharpe < 0.5 ||
    evidence.profitFactor < 1.1 ||
    evidence.maxDrawdownPercent > 8 ||
    evidence.stabilityScore < 0.6;

  if (failedPerformanceGate) {
    return {
      resultVerdict: "REJECTED" as const,
      evidenceReasons: [
        ...evidenceReasons,
        "Au moins un seuil conservateur de performance ou de stabilité hors échantillon n'est pas respecté."
      ],
      evidenceMissing: [],
      candidateMayAdvance: false
    };
  }

  return {
    resultVerdict: "CANDIDATE_SURVIVED_PRELIMINARY" as const,
    evidenceReasons: [
      ...evidenceReasons,
      "Le dossier franchit uniquement la porte préliminaire; il ne prouve pas un avantage durable."
    ],
    evidenceMissing: [],
    candidateMayAdvance: true
  };
}

function requiredTestMatrix(hypothesis: AlphaHypothesis) {
  return Array.from(new Set([
    "Backtest chronologique sans mélange aléatoire des observations",
    `Réserver au moins ${hypothesis.backtestSpecification.minimumOutOfSamplePercent} % des données au test hors échantillon`,
    "Au moins trois fenêtres walk-forward",
    "Coûts, spread et glissement réalistes et majorés dans un scénario de stress",
    "Test explicite de fuite temporelle et de contamination des variables",
    "Analyse de sensibilité autour de chaque paramètre libre",
    "Ablation de chaque variable pour vérifier sa contribution",
    "Stabilité sur plusieurs sous-périodes et régimes voisins",
    "Correction du nombre d'essais et du biais de sélection",
    `Au moins ${hypothesis.backtestSpecification.minimumTrades} transactions simulées`,
    ...hypothesis.backtestSpecification.requiredValidation,
    ...hypothesis.backtestSpecification.robustnessTests
  ])).slice(0, 18);
}

export function buildBacktestAuditEnvelope(args: {
  alphaResearch: AlphaResearchOutput;
  evidence?: BacktestEvidence[];
}): BacktestAuditEnvelope {
  const evidenceByHypothesis = new Map((args.evidence ?? []).map((item) => [item.hypothesisId, item]));

  if (args.alphaResearch.researchStatus === "BLOCKED" || args.alphaResearch.hypotheses.length === 0) {
    return {
      overallStatus: "BLOCKED",
      researchOnly: true,
      liveTradingAllowed: false,
      paperOrderAllowed: false,
      performanceClaimAllowed: false,
      hypotheses: [],
      deterministicReasons: ["Aucune hypothèse conforme n'est disponible pour l'audit."],
      requiredAuditTrail: ["Version de l'hypothèse", "Version du code", "Empreinte des données", "Journal des paramètres"],
      specialistsMayProceed: false
    };
  }

  const hypotheses = args.alphaResearch.hypotheses.map((hypothesis) => {
    const spec = specificationDiagnostics(hypothesis);
    const evidence = evidenceDiagnostics(hypothesis, evidenceByHypothesis.get(hypothesis.hypothesisId));
    const specificationBlocked = spec.specificationVerdict !== "READY_TO_IMPLEMENT";

    return {
      hypothesisId: hypothesis.hypothesisId,
      title: hypothesis.title,
      specificationVerdict: spec.specificationVerdict,
      resultVerdict: specificationBlocked ? "NOT_RUN" as const : evidence.resultVerdict,
      deterministicReasons: [...spec.deterministicReasons, ...evidence.evidenceReasons],
      missingRequirements: [...spec.missingRequirements, ...evidence.evidenceMissing],
      requiredTestMatrix: requiredTestMatrix(hypothesis),
      candidateMayAdvance: !specificationBlocked && evidence.candidateMayAdvance,
      evidencePresent: evidenceByHypothesis.has(hypothesis.hypothesisId)
    };
  });

  let overallStatus: BacktestAuditEnvelope["overallStatus"] = "AWAITING_BACKTEST_RESULTS";
  if (hypotheses.every((item) => item.specificationVerdict !== "READY_TO_IMPLEMENT")) overallStatus = "NEEDS_REVISION";
  else if (hypotheses.some((item) => item.resultVerdict === "INSUFFICIENT_EVIDENCE")) overallStatus = "EVIDENCE_REJECTED";
  else if (hypotheses.some((item) => item.resultVerdict === "REJECTED")) overallStatus = "EVIDENCE_REJECTED";
  else if (hypotheses.some((item) => item.candidateMayAdvance)) overallStatus = "CANDIDATE_SURVIVED_PRELIMINARY";

  return {
    overallStatus,
    researchOnly: true,
    liveTradingAllowed: false,
    paperOrderAllowed: false,
    performanceClaimAllowed: false,
    hypotheses,
    deterministicReasons: [
      `Audit de ${hypotheses.length} hypothèse(s).`,
      "Aucun résultat absent ne peut être remplacé par une estimation du modèle.",
      "Un passage préliminaire ne constitue pas une preuve de rentabilité future.",
      "Portfolio, risque et exécution restent bloqués sans dossier de preuve complet."
    ],
    requiredAuditTrail: [
      "Version immuable de l'hypothèse",
      "Commit du moteur de backtest",
      "Empreinte cryptographique des données",
      "Horodatage de chaque exécution",
      "Liste complète des paramètres et essais",
      "Résultats entraînement, validation et hors échantillon séparés",
      "Hypothèses rejetées et raisons du rejet"
    ],
    specialistsMayProceed: hypotheses.some((item) => item.candidateMayAdvance)
  };
}
