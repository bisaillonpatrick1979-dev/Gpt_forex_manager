import { createHash } from "node:crypto";
import type { AlphaHypothesis, ExecutableStrategyTemplate } from "@/lib/agents/alpha-research";
import type { BacktestEvidence } from "@/lib/backtest-audit";
import type { Candle } from "@/lib/types";

export const BACKTEST_ENGINE_VERSION = "deterministic-backtest-v1.0.0";

export type BacktestTrade = {
  direction: "LONG" | "SHORT";
  entryTime: string;
  exitTime: string;
  entryPrice: number;
  exitPrice: number;
  barsHeld: number;
  grossReturnPercent: number;
  netReturnPercent: number;
  exitReason: "SIGNAL" | "STOP_ATR" | "MAX_HOLDING" | "END_OF_SAMPLE";
};

export type WalkForwardWindow = {
  window: number;
  startIndex: number;
  endIndex: number;
  trades: number;
  netReturnPercent: number;
  maxDrawdownPercent: number;
};

export type HypothesisBacktestResult = {
  hypothesisId: string;
  title: string;
  template: ExecutableStrategyTemplate;
  evidence: BacktestEvidence;
  trades: BacktestTrade[];
  walkForward: WalkForwardWindow[];
  warnings: string[];
};

export type DeterministicBacktestRun = {
  runId: string;
  engineVersion: string;
  pair: string;
  interval: string;
  source: string;
  generatedAt: string;
  candleCount: number;
  chronologicalSplit: {
    trainPercent: 60;
    validationPercent: 10;
    testPercent: 30;
    testStartIndex: number;
  };
  costModel: {
    model: "STANDARDIZED_FX_PROXY_STRESSED";
    commissionBpsPerSide: number;
    spreadBpsPerSide: number;
    slippageBpsPerSide: number;
    stressMultiplier: number;
    roundTripCostBps: number;
  };
  results: HypothesisBacktestResult[];
  limitations: string[];
};

type Direction = 1 | -1;

type Position = {
  direction: Direction;
  entryIndex: number;
  entryPrice: number;
  atrAtEntry: number;
};

const COST_MODEL = {
  model: "STANDARDIZED_FX_PROXY_STRESSED" as const,
  commissionBpsPerSide: 0.15,
  spreadBpsPerSide: 0.6,
  slippageBpsPerSide: 0.25,
  stressMultiplier: 1.5
};

const roundTripCostBps = Number((
  2 *
  (COST_MODEL.commissionBpsPerSide + COST_MODEL.spreadBpsPerSide + COST_MODEL.slippageBpsPerSide) *
  COST_MODEL.stressMultiplier
).toFixed(4));

function round(value: number, decimals = 4) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(decimals));
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return 0;
  const mean = average(values);
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function sma(candles: Candle[], index: number, period: number) {
  const start = index - period + 1;
  if (start < 0) return null;
  return average(candles.slice(start, index + 1).map((candle) => candle.close));
}

function stdevClose(candles: Candle[], index: number, period: number) {
  const start = index - period + 1;
  if (start < 0) return null;
  return standardDeviation(candles.slice(start, index + 1).map((candle) => candle.close));
}

function atr(candles: Candle[], index: number, period: number) {
  if (index < 1) return null;
  const start = Math.max(1, index - period + 1);
  const ranges: number[] = [];
  for (let cursor = start; cursor <= index; cursor += 1) {
    const candle = candles[cursor];
    const previousClose = candles[cursor - 1].close;
    ranges.push(Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose)
    ));
  }
  return ranges.length === 0 ? null : average(ranges);
}

function priorHigh(candles: Candle[], index: number, lookback: number) {
  const start = index - lookback;
  if (start < 0) return null;
  return Math.max(...candles.slice(start, index).map((candle) => candle.high));
}

function priorLow(candles: Candle[], index: number, lookback: number) {
  const start = index - lookback;
  if (start < 0) return null;
  return Math.min(...candles.slice(start, index).map((candle) => candle.low));
}

function allowsDirection(template: ExecutableStrategyTemplate, direction: Direction) {
  if (template.direction === "BOTH") return true;
  if (template.direction === "LONG_ONLY") return direction === 1;
  if (template.direction === "SHORT_ONLY") return direction === -1;
  return false;
}

function entrySignal(candles: Candle[], index: number, template: ExecutableStrategyTemplate): Direction | 0 {
  const parameters = template.parameters;

  if (template.templateKey === "MA_TREND") {
    const fast = sma(candles, index, parameters.fastPeriod ?? 9);
    const slow = sma(candles, index, parameters.slowPeriod ?? 21);
    if (fast == null || slow == null) return 0;
    if (fast > slow && allowsDirection(template, 1)) return 1;
    if (fast < slow && allowsDirection(template, -1)) return -1;
    return 0;
  }

  if (template.templateKey === "DONCHIAN_BREAKOUT") {
    const lookback = parameters.entryLookback ?? 20;
    const high = priorHigh(candles, index, lookback);
    const low = priorLow(candles, index, lookback);
    if (high == null || low == null) return 0;
    if (candles[index].close > high && allowsDirection(template, 1)) return 1;
    if (candles[index].close < low && allowsDirection(template, -1)) return -1;
    return 0;
  }

  if (template.templateKey === "ZSCORE_MEAN_REVERSION") {
    const lookback = parameters.lookback ?? 20;
    const mean = sma(candles, index, lookback);
    const deviation = stdevClose(candles, index, lookback);
    if (mean == null || deviation == null || deviation === 0) return 0;
    const zScore = (candles[index].close - mean) / deviation;
    if (zScore <= -(parameters.entryZ ?? 1.25) && allowsDirection(template, 1)) return 1;
    if (zScore >= (parameters.entryZ ?? 1.25) && allowsDirection(template, -1)) return -1;
    return 0;
  }

  if (template.templateKey === "VOLATILITY_EXPANSION") {
    const lookback = parameters.lookback ?? 20;
    const high = priorHigh(candles, index, lookback);
    const low = priorLow(candles, index, lookback);
    const currentAtr = atr(candles, index, parameters.atrPeriod ?? 14);
    if (high == null || low == null || currentAtr == null || index < 1) return 0;
    const trueRange = Math.max(
      candles[index].high - candles[index].low,
      Math.abs(candles[index].high - candles[index - 1].close),
      Math.abs(candles[index].low - candles[index - 1].close)
    );
    const expanded = trueRange >= currentAtr * (parameters.expansionMultiplier ?? 1.2);
    if (!expanded) return 0;
    if (candles[index].close > high && allowsDirection(template, 1)) return 1;
    if (candles[index].close < low && allowsDirection(template, -1)) return -1;
  }

  return 0;
}

function exitSignal(candles: Candle[], index: number, template: ExecutableStrategyTemplate, direction: Direction) {
  const parameters = template.parameters;

  if (template.templateKey === "MA_TREND") {
    const fast = sma(candles, index, parameters.fastPeriod ?? 9);
    const slow = sma(candles, index, parameters.slowPeriod ?? 21);
    if (fast == null || slow == null) return false;
    return direction === 1 ? fast < slow : fast > slow;
  }

  if (template.templateKey === "DONCHIAN_BREAKOUT") {
    const lookback = parameters.exitLookback ?? 10;
    const high = priorHigh(candles, index, lookback);
    const low = priorLow(candles, index, lookback);
    if (high == null || low == null) return false;
    return direction === 1 ? candles[index].close < low : candles[index].close > high;
  }

  if (template.templateKey === "ZSCORE_MEAN_REVERSION") {
    const lookback = parameters.lookback ?? 20;
    const mean = sma(candles, index, lookback);
    const deviation = stdevClose(candles, index, lookback);
    if (mean == null || deviation == null || deviation === 0) return false;
    const zScore = (candles[index].close - mean) / deviation;
    const exitZ = parameters.exitZ ?? 0.25;
    return direction === 1 ? zScore >= -exitZ : zScore <= exitZ;
  }

  if (template.templateKey === "VOLATILITY_EXPANSION") {
    const fast = sma(candles, index, 5);
    if (fast == null) return false;
    return direction === 1 ? candles[index].close < fast : candles[index].close > fast;
  }

  return true;
}

function grossReturnPercent(direction: Direction, entry: number, exit: number) {
  if (entry <= 0 || exit <= 0) return 0;
  return direction === 1 ? ((exit / entry) - 1) * 100 : ((entry / exit) - 1) * 100;
}

function maxDrawdownPercent(tradeReturns: number[]) {
  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  for (const tradeReturn of tradeReturns) {
    equity *= 1 + tradeReturn / 100;
    peak = Math.max(peak, equity);
    const drawdown = peak === 0 ? 0 : ((peak - equity) / peak) * 100;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
  }
  return maxDrawdown;
}

function closeTrade(args: {
  candles: Candle[];
  position: Position;
  exitIndex: number;
  exitPrice: number;
  exitReason: BacktestTrade["exitReason"];
}) {
  const gross = grossReturnPercent(args.position.direction, args.position.entryPrice, args.exitPrice);
  const net = gross - roundTripCostBps / 100;
  return {
    direction: args.position.direction === 1 ? "LONG" as const : "SHORT" as const,
    entryTime: args.candles[args.position.entryIndex].time,
    exitTime: args.candles[args.exitIndex].time,
    entryPrice: round(args.position.entryPrice, 6),
    exitPrice: round(args.exitPrice, 6),
    barsHeld: Math.max(1, args.exitIndex - args.position.entryIndex + 1),
    grossReturnPercent: round(gross, 4),
    netReturnPercent: round(net, 4),
    exitReason: args.exitReason
  } satisfies BacktestTrade;
}

function simulateRange(args: {
  candles: Candle[];
  template: ExecutableStrategyTemplate;
  startIndex: number;
  endIndex: number;
}) {
  const { candles, template } = args;
  const trades: BacktestTrade[] = [];
  if (template.templateKey === "OBSERVATION_ONLY" || template.direction === "NEUTRAL") return trades;

  const atrPeriod = template.parameters.atrPeriod ?? 14;
  const maxHoldingBars = template.parameters.maxHoldingBars ?? 20;
  const stopAtr = template.parameters.stopAtr ?? 2;
  let position: Position | null = null;

  for (let index = Math.max(1, args.startIndex); index < args.endIndex; index += 1) {
    const candle = candles[index];

    if (position) {
      const stopPrice = position.direction === 1
        ? position.entryPrice - position.atrAtEntry * stopAtr
        : position.entryPrice + position.atrAtEntry * stopAtr;
      const stopHit = position.direction === 1 ? candle.low <= stopPrice : candle.high >= stopPrice;

      if (stopHit) {
        trades.push(closeTrade({
          candles,
          position,
          exitIndex: index,
          exitPrice: stopPrice,
          exitReason: "STOP_ATR"
        }));
        position = null;
        continue;
      }

      const barsHeld = index - position.entryIndex + 1;
      const shouldExit = exitSignal(candles, index, template, position.direction);
      const maxHoldingReached = barsHeld >= maxHoldingBars;
      if ((shouldExit || maxHoldingReached) && index + 1 < args.endIndex) {
        trades.push(closeTrade({
          candles,
          position,
          exitIndex: index + 1,
          exitPrice: candles[index + 1].open,
          exitReason: shouldExit ? "SIGNAL" : "MAX_HOLDING"
        }));
        position = null;
        continue;
      }
    }

    if (!position && index + 1 < args.endIndex) {
      const signal = entrySignal(candles, index, template);
      if (signal !== 0) {
        const entryAtr = atr(candles, index, atrPeriod);
        if (entryAtr != null && entryAtr > 0) {
          position = {
            direction: signal,
            entryIndex: index + 1,
            entryPrice: candles[index + 1].open,
            atrAtEntry: entryAtr
          };
        }
      }
    }
  }

  if (position) {
    const exitIndex = Math.max(position.entryIndex, args.endIndex - 1);
    trades.push(closeTrade({
      candles,
      position,
      exitIndex,
      exitPrice: candles[exitIndex].close,
      exitReason: "END_OF_SAMPLE"
    }));
  }

  return trades;
}

function aggregateNetReturnPercent(trades: BacktestTrade[]) {
  let equity = 1;
  for (const trade of trades) equity *= 1 + trade.netReturnPercent / 100;
  return (equity - 1) * 100;
}

function profitFactor(trades: BacktestTrade[]) {
  const gains = trades.filter((trade) => trade.netReturnPercent > 0).reduce((sum, trade) => sum + trade.netReturnPercent, 0);
  const losses = Math.abs(trades.filter((trade) => trade.netReturnPercent < 0).reduce((sum, trade) => sum + trade.netReturnPercent, 0));
  if (losses === 0) return gains > 0 ? 99 : 0;
  return gains / losses;
}

function tradeSharpe(trades: BacktestTrade[]) {
  const returns = trades.map((trade) => trade.netReturnPercent);
  const deviation = standardDeviation(returns);
  return deviation === 0 ? 0 : average(returns) / deviation;
}

function buildWalkForward(candles: Candle[], template: ExecutableStrategyTemplate, testStartIndex: number) {
  const testLength = candles.length - testStartIndex;
  const windowSize = Math.max(1, Math.floor(testLength / 3));
  const windows: WalkForwardWindow[] = [];
  for (let window = 0; window < 3; window += 1) {
    const startIndex = testStartIndex + window * windowSize;
    const endIndex = window === 2 ? candles.length : Math.min(candles.length, startIndex + windowSize);
    if (endIndex - startIndex < 2) continue;
    const trades = simulateRange({ candles, template, startIndex, endIndex });
    windows.push({
      window: window + 1,
      startIndex,
      endIndex,
      trades: trades.length,
      netReturnPercent: round(aggregateNetReturnPercent(trades), 4),
      maxDrawdownPercent: round(maxDrawdownPercent(trades.map((trade) => trade.netReturnPercent)), 4)
    });
  }
  return windows;
}

function stabilityScore(windows: WalkForwardWindow[]) {
  if (windows.length === 0) return 0;
  const positiveShare = windows.filter((window) => window.netReturnPercent > 0).length / windows.length;
  const activeShare = windows.filter((window) => window.trades > 0).length / windows.length;
  const returns = windows.map((window) => window.netReturnPercent);
  const mean = Math.abs(average(returns));
  const dispersion = standardDeviation(returns);
  const consistency = mean === 0 ? 0 : Math.max(0, 1 - dispersion / (mean + 0.0001));
  return Math.min(1, Math.max(0, positiveShare * 0.5 + activeShare * 0.25 + consistency * 0.25));
}

function canonicalHash(payload: unknown) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function runDeterministicBacktests(args: {
  pair: string;
  interval: string;
  source: string;
  candles: Candle[];
  hypotheses: AlphaHypothesis[];
  generatedAt?: string;
}): DeterministicBacktestRun {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const candles = [...args.candles].sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  const testStartIndex = Math.max(1, Math.floor(candles.length * 0.7));
  const runHash = canonicalHash({
    engineVersion: BACKTEST_ENGINE_VERSION,
    pair: args.pair,
    interval: args.interval,
    source: args.source,
    candles,
    templates: args.hypotheses.map((hypothesis) => hypothesis.executableTemplate)
  });

  const results = args.hypotheses.map((hypothesis) => {
    const trades = simulateRange({
      candles,
      template: hypothesis.executableTemplate,
      startIndex: testStartIndex,
      endIndex: candles.length
    });
    const walkForward = buildWalkForward(candles, hypothesis.executableTemplate, testStartIndex);
    const netReturnPercent = aggregateNetReturnPercent(trades);
    const drawdown = maxDrawdownPercent(trades.map((trade) => trade.netReturnPercent));
    const evidenceHash = canonicalHash({
      runHash,
      hypothesisId: hypothesis.hypothesisId,
      template: hypothesis.executableTemplate,
      trades,
      walkForward
    });
    const warnings: string[] = [];
    if (candles.length < hypothesis.backtestSpecification.minimumObservations) {
      warnings.push(`Échantillon insuffisant : ${candles.length} observations sur ${hypothesis.backtestSpecification.minimumObservations} exigées.`);
    }
    if (trades.length < hypothesis.backtestSpecification.minimumTrades) {
      warnings.push(`Transactions insuffisantes : ${trades.length} sur ${hypothesis.backtestSpecification.minimumTrades} exigées.`);
    }
    if (hypothesis.executableTemplate.templateKey === "OBSERVATION_ONLY") {
      warnings.push("Hypothèse non exécutable avec les gabarits déterministes actuels.");
    }
    warnings.push("Le modèle de coûts est un proxy standardisé majoré, pas un spread réel horodaté de courtier.");

    const evidence: BacktestEvidence = {
      hypothesisId: hypothesis.hypothesisId,
      evidenceVersion: `bt-v1-${evidenceHash.slice(0, 12)}`,
      generatedAt,
      sourceHash: evidenceHash,
      engineVersion: BACKTEST_ENGINE_VERSION,
      templateKey: hypothesis.executableTemplate.templateKey,
      observations: candles.length,
      outOfSampleObservations: candles.length - testStartIndex,
      trades: trades.length,
      outOfSamplePercent: 30,
      chronologicalSplit: true,
      walkForwardWindows: walkForward.length,
      costsIncluded: true,
      spreadIncluded: true,
      slippageIncluded: true,
      lookaheadPrevented: true,
      multipleTestingAdjusted: args.hypotheses.length <= 3,
      multipleTestingMethod: "FIXED_PARAMETERS_MAX_THREE_HYPOTHESES",
      parameterCount: Object.keys(hypothesis.executableTemplate.parameters).length,
      roundTripCostBps,
      outOfSampleNetReturnPercent: round(netReturnPercent, 4),
      outOfSampleSharpe: round(tradeSharpe(trades), 4),
      profitFactor: round(profitFactor(trades), 4),
      maxDrawdownPercent: round(drawdown, 4),
      stabilityScore: round(stabilityScore(walkForward), 4)
    };

    return {
      hypothesisId: hypothesis.hypothesisId,
      title: hypothesis.title,
      template: hypothesis.executableTemplate,
      evidence,
      trades,
      walkForward,
      warnings
    };
  });

  return {
    runId: `run-${runHash.slice(0, 16)}`,
    engineVersion: BACKTEST_ENGINE_VERSION,
    pair: args.pair,
    interval: args.interval,
    source: args.source,
    generatedAt,
    candleCount: candles.length,
    chronologicalSplit: {
      trainPercent: 60,
      validationPercent: 10,
      testPercent: 30,
      testStartIndex
    },
    costModel: {
      ...COST_MODEL,
      roundTripCostBps
    },
    results,
    limitations: [
      "Les paramètres sont fixes et définis dans le code; aucune optimisation n'est effectuée.",
      "Les signaux sont calculés à la clôture et exécutés au prochain open pour réduire le look-ahead.",
      "Les coûts utilisent un proxy FX standardisé majoré, faute de spread de courtier horodaté.",
      "Le moteur ne modélise pas encore les gaps d'exécution complexes, la profondeur de marché ou le financement overnight.",
      "Un résultat historique positif ne prédit pas un rendement futur."
    ]
  };
}
