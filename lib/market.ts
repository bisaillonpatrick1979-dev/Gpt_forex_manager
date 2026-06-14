import { Candle } from "./types";

export function roundPrice(value: number, decimals = 5) {
  return Number(value.toFixed(decimals));
}

export function generateDemoCandles(from: string, to: string, count = 72): Candle[] {
  const seed = `${from}${to}`.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const base = from === "USD" && to === "JPY" ? 157 : from === "GBP" ? 1.27 : from === "EUR" ? 1.08 : 0.91;
  const candles: Candle[] = [];
  let price = base + (seed % 17) * 0.0007;

  for (let i = count - 1; i >= 0; i--) {
    const wave = Math.sin((count - i + seed) / 5) * 0.0018;
    const noise = Math.cos((count - i + seed) / 3) * 0.0008;
    const open = price;
    const close = price + wave + noise;
    const high = Math.max(open, close) + Math.abs(Math.sin(i + seed)) * 0.0014;
    const low = Math.min(open, close) - Math.abs(Math.cos(i + seed)) * 0.0014;
    candles.push({ time: new Date(Date.now() - i * 5 * 60 * 1000).toISOString(), open: roundPrice(open), high: roundPrice(high), low: roundPrice(low), close: roundPrice(close) });
    price = close;
  }
  return candles;
}

export function calculateMarketStats(candles: Candle[]) {
  if (candles.length < 2) return { change: 0, changePercent: 0, high: 0, low: 0, range: 0, volatility: 0 };
  const first = candles[0].close;
  const last = candles[candles.length - 1].close;
  const high = Math.max(...candles.map((c) => c.high));
  const low = Math.min(...candles.map((c) => c.low));
  const change = last - first;
  const changePercent = first ? (change / first) * 100 : 0;
  const range = high - low;
  const volatility = last ? (range / last) * 100 : 0;
  return { change, changePercent, high, low, range, volatility };
}

export function movingAverage(values: number[], period: number) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((sum, value) => sum + value, 0) / slice.length;
}

export function detectTrend(candles: Candle[]) {
  const closes = candles.map((c) => c.close);
  const fast = movingAverage(closes, 9);
  const slow = movingAverage(closes, 21);
  if (!fast || !slow) return "NEUTRAL";
  if (fast > slow) return "BULLISH";
  if (fast < slow) return "BEARISH";
  return "NEUTRAL";
}

export function getPipSize(pair: string) {
  return pair.includes("JPY") ? 0.01 : 0.0001;
}
