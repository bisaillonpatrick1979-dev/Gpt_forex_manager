import { Candle } from "@/lib/types";

export type DataDecision = "ACCEPT" | "RESTRICT" | "BLOCK";
export type DataClass = "LIVE_OR_DELAYED" | "HISTORICAL_RESEARCH" | "SYNTHETIC" | "INVALID";

export type DataDiagnostics = {
  decision: DataDecision;
  dataClass: DataClass;
  source: string;
  warning: string | null;
  candleCount: number;
  expectedIntervalSeconds: number | null;
  estimatedIntervalSeconds: number | null;
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  staleMinutes: number | null;
  nonFiniteValueCount: number;
  invalidOhlcCount: number;
  duplicateTimestampCount: number;
  nonMonotonicTimestampCount: number;
  missingIntervalCount: number;
  missingIntervalRatio: number;
  extremeReturnCount: number;
  deterministicReasons: string[];
  permittedUses: string[];
  prohibitedUses: string[];
};

const intervalSeconds: Record<string, number> = {
  "1min": 60,
  "5min": 300,
  "15min": 900,
  "30min": 1800,
  "60min": 3600
};

function parseTime(value: string): number | null {
  const parsed = Date.parse(value.includes("T") ? value : value.replace(" ", "T") + "Z");
  return Number.isFinite(parsed) ? parsed : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export function diagnoseMarketData(args: {
  candles: Candle[];
  interval: string;
  source: string;
  warning?: string;
  now?: Date;
}): DataDiagnostics {
  const { candles, interval, source } = args;
  const warning = args.warning?.trim() || null;
  const now = args.now || new Date();
  const expected = intervalSeconds[interval] ?? null;

  let nonFiniteValueCount = 0;
  let invalidOhlcCount = 0;
  let duplicateTimestampCount = 0;
  let nonMonotonicTimestampCount = 0;
  let missingIntervalCount = 0;
  let extremeReturnCount = 0;

  const seen = new Set<number>();
  const timestamps: number[] = [];
  const positiveDeltas: number[] = [];

  candles.forEach((candle, index) => {
    const values = [candle.open, candle.high, candle.low, candle.close];
    if (values.some((value) => !Number.isFinite(value))) nonFiniteValueCount += 1;

    if (
      candle.high < Math.max(candle.open, candle.close) ||
      candle.low > Math.min(candle.open, candle.close) ||
      candle.high < candle.low
    ) {
      invalidOhlcCount += 1;
    }

    const timestamp = parseTime(candle.time);
    if (timestamp == null) {
      nonMonotonicTimestampCount += 1;
    } else {
      if (seen.has(timestamp)) duplicateTimestampCount += 1;
      seen.add(timestamp);
      timestamps.push(timestamp);

      if (index > 0) {
        const previousTimestamp = parseTime(candles[index - 1].time);
        if (previousTimestamp != null) {
          const deltaSeconds = (timestamp - previousTimestamp) / 1000;
          if (deltaSeconds <= 0) nonMonotonicTimestampCount += 1;
          if (deltaSeconds > 0) positiveDeltas.push(deltaSeconds);
          if (expected && deltaSeconds > expected * 1.5) {
            missingIntervalCount += Math.max(1, Math.round(deltaSeconds / expected) - 1);
          }
        }

        const previousClose = candles[index - 1].close;
        if (Number.isFinite(previousClose) && previousClose !== 0 && Number.isFinite(candle.close)) {
          const absoluteReturnPercent = Math.abs((candle.close - previousClose) / previousClose) * 100;
          if (absoluteReturnPercent > 2) extremeReturnCount += 1;
        }
      }
    }
  });

  const estimatedIntervalSeconds = median(positiveDeltas);
  const lastTimestampMs = timestamps.length ? Math.max(...timestamps) : null;
  const firstTimestampMs = timestamps.length ? Math.min(...timestamps) : null;
  const staleMinutes = lastTimestampMs == null ? null : Math.max(0, (now.getTime() - lastTimestampMs) / 60000);
  const possibleIntervals = Math.max(1, candles.length - 1 + missingIntervalCount);
  const missingIntervalRatio = missingIntervalCount / possibleIntervals;
  const warningLower = warning?.toLowerCase() || "";
  const fromSupabaseHistory = warningLower.includes("supabase") || warningLower.includes("histor");
  const explicitlySimulated = warningLower.includes("simul") || warningLower.includes("demo");

  let dataClass: DataClass;
  if (
    candles.length < 10 ||
    nonFiniteValueCount > 0 ||
    invalidOhlcCount > 0 ||
    nonMonotonicTimestampCount > 0
  ) {
    dataClass = "INVALID";
  } else if (fromSupabaseHistory) {
    dataClass = "HISTORICAL_RESEARCH";
  } else if (source === "demo" || explicitlySimulated) {
    dataClass = "SYNTHETIC";
  } else {
    dataClass = "LIVE_OR_DELAYED";
  }

  let decision: DataDecision = "ACCEPT";
  if (dataClass === "INVALID" || duplicateTimestampCount > 0) {
    decision = "BLOCK";
  } else if (
    dataClass === "SYNTHETIC" ||
    missingIntervalRatio > 0.05 ||
    extremeReturnCount > 0 ||
    (dataClass === "LIVE_OR_DELAYED" && staleMinutes != null && staleMinutes > 180)
  ) {
    decision = "RESTRICT";
  }

  const deterministicReasons: string[] = [];
  deterministicReasons.push(`${candles.length} chandelles reçues pour l'intervalle ${interval}.`);
  deterministicReasons.push(`Classe déterministe : ${dataClass}.`);
  if (warning) deterministicReasons.push(`Avertissement de la source : ${warning}`);
  if (duplicateTimestampCount) deterministicReasons.push(`${duplicateTimestampCount} horodatage(s) dupliqué(s).`);
  if (nonMonotonicTimestampCount) deterministicReasons.push(`${nonMonotonicTimestampCount} anomalie(s) chronologique(s).`);
  if (invalidOhlcCount) deterministicReasons.push(`${invalidOhlcCount} bougie(s) avec OHLC incohérent.`);
  if (missingIntervalCount) deterministicReasons.push(`${missingIntervalCount} intervalle(s) probablement manquant(s), soit ${(missingIntervalRatio * 100).toFixed(2)} %.`);
  if (extremeReturnCount) deterministicReasons.push(`${extremeReturnCount} variation(s) extrême(s) supérieure(s) à 2 % entre deux bougies.`);
  if (staleMinutes != null) deterministicReasons.push(`Dernière bougie âgée d'environ ${Math.round(staleMinutes)} minute(s).`);

  const permittedUses = dataClass === "HISTORICAL_RESEARCH"
    ? ["Backtests exploratoires", "Ingénierie de variables", "Validation hors-échantillon après séparation temporelle"]
    : dataClass === "LIVE_OR_DELAYED" && decision === "ACCEPT"
      ? ["Surveillance de marché", "Recherche paper trading", "Détection de régime"]
      : dataClass === "SYNTHETIC"
        ? ["Tests d'interface", "Tests du pipeline", "Démonstration sans conclusion de performance"]
        : [];

  const prohibitedUses = [
    "Exécution réelle",
    "Affirmation de rendement garanti",
    "Certification d'une stratégie sans validation indépendante"
  ];
  if (dataClass === "SYNTHETIC") prohibitedUses.push("Backtest présenté comme preuve d'un avantage de marché");
  if (decision === "BLOCK") prohibitedUses.push("Toute analyse quantitative jusqu'à correction des anomalies");

  return {
    decision,
    dataClass,
    source,
    warning,
    candleCount: candles.length,
    expectedIntervalSeconds: expected,
    estimatedIntervalSeconds,
    firstTimestamp: firstTimestampMs == null ? null : new Date(firstTimestampMs).toISOString(),
    lastTimestamp: lastTimestampMs == null ? null : new Date(lastTimestampMs).toISOString(),
    staleMinutes,
    nonFiniteValueCount,
    invalidOhlcCount,
    duplicateTimestampCount,
    nonMonotonicTimestampCount,
    missingIntervalCount,
    missingIntervalRatio,
    extremeReturnCount,
    deterministicReasons,
    permittedUses,
    prohibitedUses
  };
}
