import { Candle } from "@/lib/types";
import { DataClass, DataDecision } from "@/lib/data-quality";

export type PrimaryRegime =
  | "TREND_UP"
  | "TREND_DOWN"
  | "RANGE"
  | "HIGH_VOLATILITY"
  | "LOW_VOLATILITY"
  | "TRANSITIONAL"
  | "BLOCKED_BY_DATA";

export type TrendRegime = "UP" | "DOWN" | "RANGE" | "TRANSITIONAL" | "BLOCKED";
export type VolatilityRegime = "HIGH" | "NORMAL" | "LOW" | "UNKNOWN";
export type RegimeStatus = "USABLE" | "RESTRICTED" | "BLOCKED";

export type MarketRegimeDiagnostics = {
  status: RegimeStatus;
  primaryRegime: PrimaryRegime;
  trendRegime: TrendRegime;
  volatilityRegime: VolatilityRegime;
  confidenceScore: number;
  sampleSize: number;
  fastMovingAverage: number | null;
  slowMovingAverage: number | null;
  movingAverageSpreadBps: number | null;
  slopeBpsPerBar: number | null;
  efficiencyRatio: number | null;
  directionalConsistency: number | null;
  recentVolatilityBps: number | null;
  baselineVolatilityBps: number | null;
  volatilityRatio: number | null;
  averageTrueRangePercent: number | null;
  rangePosition: number | null;
  eventRisk: "UNKNOWN_REQUIRES_EXTERNAL_CALENDAR";
  deterministicReasons: string[];
  admissibleStrategyFamilies: string[];
  excludedStrategyFamilies: string[];
  externalDataRequired: string[];
  specialistsMayProceed: boolean;
};

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number | null {
  const mean = average(values);
  if (mean == null || values.length < 2) return null;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function movingAverage(values: number[], period: number): number | null {
  if (values.length < period) return null;
  return average(values.slice(-period));
}

function linearSlope(values: number[]): number | null {
  if (values.length < 3) return null;
  const xMean = (values.length - 1) / 2;
  const yMean = average(values);
  if (yMean == null) return null;

  let numerator = 0;
  let denominator = 0;
  values.forEach((value, index) => {
    numerator += (index - xMean) * (value - yMean);
    denominator += (index - xMean) ** 2;
  });

  return denominator === 0 ? null : numerator / denominator;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number | null, decimals = 4): number | null {
  return value == null || !Number.isFinite(value) ? null : Number(value.toFixed(decimals));
}

export function diagnoseMarketRegime(args: {
  candles: Candle[];
  dataDecision: DataDecision;
  dataClass: DataClass;
}): MarketRegimeDiagnostics {
  const { candles, dataDecision, dataClass } = args;
  const closes = candles.map((candle) => candle.close).filter(Number.isFinite);
  const sampleSize = closes.length;
  const lastClose = closes.at(-1) ?? null;

  if (dataDecision === "BLOCK" || sampleSize < 10 || lastClose == null || lastClose === 0) {
    return {
      status: "BLOCKED",
      primaryRegime: "BLOCKED_BY_DATA",
      trendRegime: "BLOCKED",
      volatilityRegime: "UNKNOWN",
      confidenceScore: 0,
      sampleSize,
      fastMovingAverage: null,
      slowMovingAverage: null,
      movingAverageSpreadBps: null,
      slopeBpsPerBar: null,
      efficiencyRatio: null,
      directionalConsistency: null,
      recentVolatilityBps: null,
      baselineVolatilityBps: null,
      volatilityRatio: null,
      averageTrueRangePercent: null,
      rangePosition: null,
      eventRisk: "UNKNOWN_REQUIRES_EXTERNAL_CALENDAR",
      deterministicReasons: ["La qualité des données bloque la classification du régime."],
      admissibleStrategyFamilies: [],
      excludedStrategyFamilies: ["Toute recherche de stratégie jusqu'à correction des données"],
      externalDataRequired: ["Calendrier économique fiable", "Heures de marché et liquidité", "Nouvelles macroéconomiques horodatées"],
      specialistsMayProceed: false
    };
  }

  const fastMovingAverage = movingAverage(closes, 9);
  const slowMovingAverage = movingAverage(closes, 21);
  const movingAverageSpreadBps = fastMovingAverage != null && slowMovingAverage != null
    ? ((fastMovingAverage - slowMovingAverage) / lastClose) * 10_000
    : null;

  const trendWindow = closes.slice(-Math.min(30, closes.length));
  const slope = linearSlope(trendWindow);
  const slopeBpsPerBar = slope == null ? null : (slope / lastClose) * 10_000;

  const lookback = closes.slice(-Math.min(20, closes.length));
  const pathDistance = lookback.slice(1).reduce(
    (sum, value, index) => sum + Math.abs(value - lookback[index]),
    0
  );
  const netDistance = lookback.length > 1 ? Math.abs(lookback.at(-1)! - lookback[0]) : 0;
  const efficiencyRatio = pathDistance === 0 ? 0 : netDistance / pathDistance;

  const netDirection = lookback.at(-1)! >= lookback[0] ? 1 : -1;
  const directionMatches = lookback.slice(1).filter((value, index) => {
    const delta = value - lookback[index];
    return delta === 0 || Math.sign(delta) === netDirection;
  }).length;
  const directionalConsistency = lookback.length > 1 ? directionMatches / (lookback.length - 1) : 0;

  const returnsBps = closes.slice(1).map((value, index) => {
    const previous = closes[index];
    return previous === 0 ? 0 : ((value - previous) / previous) * 10_000;
  });
  const recentReturns = returnsBps.slice(-Math.min(20, returnsBps.length));
  const priorReturns = returnsBps.length > recentReturns.length
    ? returnsBps.slice(0, returnsBps.length - recentReturns.length)
    : returnsBps;
  const recentVolatilityBps = standardDeviation(recentReturns);
  const baselineVolatilityBps = standardDeviation(priorReturns);
  const volatilityRatio = recentVolatilityBps != null && baselineVolatilityBps != null && baselineVolatilityBps > 0
    ? recentVolatilityBps / baselineVolatilityBps
    : null;

  const trueRanges = candles.slice(1).map((candle, index) => {
    const previousClose = candles[index].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose)
    );
  });
  const averageTrueRange = average(trueRanges.slice(-Math.min(14, trueRanges.length)));
  const averageTrueRangePercent = averageTrueRange == null ? null : (averageTrueRange / lastClose) * 100;

  const recentCandles = candles.slice(-Math.min(30, candles.length));
  const rangeHigh = Math.max(...recentCandles.map((candle) => candle.high));
  const rangeLow = Math.min(...recentCandles.map((candle) => candle.low));
  const rangePosition = rangeHigh === rangeLow ? 0.5 : (lastClose - rangeLow) / (rangeHigh - rangeLow);

  let volatilityRegime: VolatilityRegime = "NORMAL";
  if (volatilityRatio != null && volatilityRatio >= 1.6) volatilityRegime = "HIGH";
  if (volatilityRatio != null && volatilityRatio <= 0.65) volatilityRegime = "LOW";

  const spread = movingAverageSpreadBps ?? 0;
  const normalizedSlope = slopeBpsPerBar ?? 0;
  const trendUp = spread >= 1.5 && normalizedSlope > 0.12 && efficiencyRatio >= 0.34 && directionalConsistency >= 0.55;
  const trendDown = spread <= -1.5 && normalizedSlope < -0.12 && efficiencyRatio >= 0.34 && directionalConsistency >= 0.55;
  const rangeLike = Math.abs(spread) < 3 && efficiencyRatio <= 0.3;

  let trendRegime: TrendRegime = "TRANSITIONAL";
  if (trendUp) trendRegime = "UP";
  else if (trendDown) trendRegime = "DOWN";
  else if (rangeLike) trendRegime = "RANGE";

  let primaryRegime: PrimaryRegime = "TRANSITIONAL";
  if (volatilityRegime === "HIGH" && trendRegime !== "UP" && trendRegime !== "DOWN") {
    primaryRegime = "HIGH_VOLATILITY";
  } else if (trendRegime === "UP") {
    primaryRegime = "TREND_UP";
  } else if (trendRegime === "DOWN") {
    primaryRegime = "TREND_DOWN";
  } else if (trendRegime === "RANGE" && volatilityRegime === "LOW") {
    primaryRegime = "LOW_VOLATILITY";
  } else if (trendRegime === "RANGE") {
    primaryRegime = "RANGE";
  }

  let confidenceScore = 35;
  confidenceScore += Math.min(20, Math.floor(sampleSize / 5));
  if (trendRegime === "UP" || trendRegime === "DOWN") {
    confidenceScore += Math.round(efficiencyRatio * 20);
    confidenceScore += Math.round(Math.max(0, directionalConsistency - 0.5) * 30);
  } else if (trendRegime === "RANGE") {
    confidenceScore += Math.round((1 - efficiencyRatio) * 15);
  }
  if (volatilityRatio != null) confidenceScore += 5;
  if (dataDecision === "RESTRICT") confidenceScore -= 20;
  if (dataClass === "SYNTHETIC") confidenceScore = Math.min(confidenceScore, 35);
  if (sampleSize < 40) confidenceScore -= 10;
  confidenceScore = Math.round(clamp(confidenceScore, 15, 90));

  const deterministicReasons = [
    `Régime principal : ${primaryRegime}.`,
    `Tendance : ${trendRegime}; volatilité : ${volatilityRegime}.`,
    `Échantillon analysé : ${sampleSize} chandelles.`,
    `Écart moyenne mobile rapide/lente : ${round(movingAverageSpreadBps, 2) ?? "indisponible"} points de base.`,
    `Pente normalisée : ${round(slopeBpsPerBar, 3) ?? "indisponible"} points de base par chandelle.`,
    `Ratio d'efficacité directionnelle : ${round(efficiencyRatio, 3)}.`,
    `Cohérence directionnelle : ${round(directionalConsistency * 100, 1)} %.`,
    `Ratio de volatilité récente : ${round(volatilityRatio, 2) ?? "indisponible"}.`,
    "Le risque d'annonce économique n'est pas déduit des prix seuls."
  ];

  let admissibleStrategyFamilies: string[] = [];
  let excludedStrategyFamilies: string[] = [];

  if (primaryRegime === "TREND_UP" || primaryRegime === "TREND_DOWN") {
    admissibleStrategyFamilies = [
      "Suivi de tendance multi-horizon",
      "Cassures confirmées avec filtre de volatilité",
      "Retours contrôlés vers une moyenne mobile à tester"
    ];
    excludedStrategyFamilies = [
      "Retour à la moyenne sans filtre de tendance",
      "Prise de position contraire à la tendance dominante"
    ];
  } else if (primaryRegime === "RANGE" || primaryRegime === "LOW_VOLATILITY") {
    admissibleStrategyFamilies = [
      "Retour à la moyenne borné",
      "Oscillation entre niveaux testés",
      "Compression puis expansion à étudier"
    ];
    excludedStrategyFamilies = [
      "Suivi de tendance directionnel sans confirmation",
      "Cassure immédiate sans filtre de faux signal"
    ];
  } else if (primaryRegime === "HIGH_VOLATILITY") {
    admissibleStrategyFamilies = [
      "Cassure avec filtre de volatilité",
      "Recherche de volatilité avec exposition réduite",
      "Observation du changement de régime"
    ];
    excludedStrategyFamilies = [
      "Stops très serrés",
      "Levier élevé",
      "Retour à la moyenne sans protection contre les sauts"
    ];
  } else {
    admissibleStrategyFamilies = [
      "Détection de changement de régime",
      "Observation et collecte de données supplémentaires"
    ];
    excludedStrategyFamilies = [
      "Nouvelle stratégie directionnelle avant confirmation",
      "Optimisation agressive sur ce seul échantillon"
    ];
  }

  const status: RegimeStatus = dataDecision === "RESTRICT" || confidenceScore < 50 ? "RESTRICTED" : "USABLE";

  return {
    status,
    primaryRegime,
    trendRegime,
    volatilityRegime,
    confidenceScore,
    sampleSize,
    fastMovingAverage: round(fastMovingAverage, 6),
    slowMovingAverage: round(slowMovingAverage, 6),
    movingAverageSpreadBps: round(movingAverageSpreadBps, 3),
    slopeBpsPerBar: round(slopeBpsPerBar, 4),
    efficiencyRatio: round(efficiencyRatio, 4),
    directionalConsistency: round(directionalConsistency, 4),
    recentVolatilityBps: round(recentVolatilityBps, 3),
    baselineVolatilityBps: round(baselineVolatilityBps, 3),
    volatilityRatio: round(volatilityRatio, 4),
    averageTrueRangePercent: round(averageTrueRangePercent, 5),
    rangePosition: round(rangePosition, 4),
    eventRisk: "UNKNOWN_REQUIRES_EXTERNAL_CALENDAR",
    deterministicReasons,
    admissibleStrategyFamilies,
    excludedStrategyFamilies,
    externalDataRequired: [
      "Calendrier économique fiable et horodaté",
      "Nouvelles macroéconomiques avec heure de publication",
      "Mesures de spread, liquidité et profondeur de marché"
    ],
    specialistsMayProceed: true
  };
}
