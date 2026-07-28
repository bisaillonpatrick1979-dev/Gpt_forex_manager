import { DataClass, DataDecision } from "@/lib/data-quality";
import { MarketRegimeOutput } from "@/lib/agents/market-regime";

export type AlphaResearchStatus = "OPEN" | "RESTRICTED" | "BLOCKED";

export type AlphaResearchEnvelope = {
  status: AlphaResearchStatus;
  researchOnly: true;
  liveTradingAllowed: false;
  paperOrderAllowed: false;
  pair: string;
  interval: string;
  dataClass: DataClass;
  dataDecision: DataDecision;
  primaryRegime: string;
  regimeConfidenceScore: number;
  availableObservations: number;
  minimumObservations: number;
  insufficientForBacktest: boolean;
  maxHypotheses: 3;
  maxFreeParameters: 6;
  minimumOutOfSamplePercent: 30;
  minimumTrades: 50;
  allowedFamilies: string[];
  excludedFamilies: string[];
  researchHorizons: string[];
  requiredValidation: string[];
  deterministicReasons: string[];
  specialistsMayProceed: boolean;
};

const minimumObservationsByInterval: Record<string, number> = {
  "1min": 5000,
  "5min": 3000,
  "15min": 2000,
  "30min": 1500,
  "60min": 1000
};

const horizonsByInterval: Record<string, string[]> = {
  "1min": ["5 à 30 minutes", "30 à 120 minutes"],
  "5min": ["30 minutes à 4 heures", "4 à 12 heures"],
  "15min": ["1 à 8 heures", "8 à 24 heures"],
  "30min": ["2 à 12 heures", "12 à 48 heures"],
  "60min": ["4 à 24 heures", "1 à 5 jours"]
};

export function buildAlphaResearchEnvelope(args: {
  pair: string;
  interval: string;
  availableObservations: number;
  dataDecision: DataDecision;
  dataClass: DataClass;
  regimeAudit: MarketRegimeOutput;
}): AlphaResearchEnvelope {
  const minimumObservations = minimumObservationsByInterval[args.interval] ?? 1500;
  const insufficientForBacktest = args.availableObservations < minimumObservations;
  const blocked =
    args.dataDecision === "BLOCK" ||
    args.regimeAudit.regimeStatus === "BLOCKED" ||
    !args.regimeAudit.specialistsMayProceed ||
    args.regimeAudit.admissibleStrategyFamilies.length === 0;

  let status: AlphaResearchStatus = "OPEN";
  if (blocked) status = "BLOCKED";
  else if (
    args.dataDecision === "RESTRICT" ||
    args.regimeAudit.regimeStatus === "RESTRICTED" ||
    args.dataClass === "SYNTHETIC" ||
    insufficientForBacktest
  ) {
    status = "RESTRICTED";
  }

  const deterministicReasons = [
    `Statut de recherche : ${status}.`,
    `Régime autorisé : ${args.regimeAudit.primaryRegime}, confiance ${args.regimeAudit.confidenceScore}/100.`,
    `${args.availableObservations} observations disponibles; minimum interne pour un backtest complet : ${minimumObservations}.`,
    `Maximum de 3 hypothèses et 6 paramètres libres par hypothèse.`,
    `Au moins 30 % des données doivent rester strictement hors échantillon.`,
    `Les coûts, le spread et le glissement doivent être inclus avant toute conclusion.`
  ];
  if (insufficientForBacktest) {
    deterministicReasons.push("L'échantillon actuel permet de rédiger une spécification, mais pas de valider une performance.");
  }
  if (args.dataClass === "SYNTHETIC") {
    deterministicReasons.push("Les données synthétiques ne peuvent servir qu'à tester le pipeline et la structure du backtest.");
  }

  return {
    status,
    researchOnly: true,
    liveTradingAllowed: false,
    paperOrderAllowed: false,
    pair: args.pair,
    interval: args.interval,
    dataClass: args.dataClass,
    dataDecision: args.dataDecision,
    primaryRegime: args.regimeAudit.primaryRegime,
    regimeConfidenceScore: args.regimeAudit.confidenceScore,
    availableObservations: args.availableObservations,
    minimumObservations,
    insufficientForBacktest,
    maxHypotheses: 3,
    maxFreeParameters: 6,
    minimumOutOfSamplePercent: 30,
    minimumTrades: 50,
    allowedFamilies: args.regimeAudit.admissibleStrategyFamilies,
    excludedFamilies: args.regimeAudit.excludedStrategyFamilies,
    researchHorizons: horizonsByInterval[args.interval] ?? ["Intrajournalier", "Plusieurs séances"],
    requiredValidation: [
      "Séparation chronologique entraînement, validation et test",
      "Test strictement hors échantillon d'au moins 30 %",
      "Validation walk-forward",
      "Coûts de transaction, spread et glissement réalistes",
      "Analyse de sensibilité des paramètres",
      "Test de stabilité sur plusieurs sous-périodes",
      "Correction du biais de sélection et des essais multiples",
      "Minimum de 50 transactions simulées avant évaluation",
      "Audit indépendant par le Backtest Auditor"
    ],
    deterministicReasons,
    specialistsMayProceed: !blocked
  };
}
