import { NextRequest, NextResponse } from "next/server";
import { Candle, MarketResponse } from "@/lib/types";
import { generateDemoCandles } from "@/lib/market";

export const dynamic = "force-dynamic";

function cleanSymbol(value: string | null, fallback: string) {
  return (value || fallback).replace(/[^A-Z]/g, "").slice(0, 3) || fallback;
}

function parseAlpha(payload: Record<string, unknown>, interval: string): Candle[] {
  const key = `Time Series FX (${interval})`;
  const series = payload[key] as Record<string, Record<string, string>> | undefined;
  if (!series) return [];
  return Object.entries(series).map(([time, item]) => ({
    time,
    open: Number(item["1. open"]),
    high: Number(item["2. high"]),
    low: Number(item["3. low"]),
    close: Number(item["4. close"])
  })).filter((c) => Number.isFinite(c.close)).sort((a,b)=>new Date(a.time).getTime()-new Date(b.time).getTime());
}

function candlesAroundSpot(from: string, to: string, spot: number): Candle[] {
  const demo = generateDemoCandles(from, to);
  const last = demo.at(-1)?.close || spot;
  const factor = spot / last;
  return demo.map((candle) => ({
    ...candle,
    open: Number((candle.open * factor).toFixed(spot > 20 ? 3 : 5)),
    high: Number((candle.high * factor).toFixed(spot > 20 ? 3 : 5)),
    low: Number((candle.low * factor).toFixed(spot > 20 ? 3 : 5)),
    close: Number((candle.close * factor).toFixed(spot > 20 ? 3 : 5))
  }));
}

async function fetchFrankfurterSpot(from: string, to: string): Promise<number | null> {
  if (from === to) return 1;
  try {
    const url = new URL("https://api.frankfurter.app/latest");
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);
    const res = await fetch(url.toString(), { cache: "no-store" });
    const payload = await res.json() as { rates?: Record<string, number> };
    const value = payload.rates?.[to];
    return Number.isFinite(value) ? Number(value) : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  const from = cleanSymbol(search.get("from"), "EUR");
  const to = cleanSymbol(search.get("to"), "USD");
  const interval = search.get("interval") || "5min";
  const pair = `${from}/${to}`;
  const key = process.env.ALPHA_VANTAGE_API_KEY;

  if (key) {
    try {
      const url = new URL("https://www.alphavantage.co/query");
      url.searchParams.set("function", "FX_INTRADAY");
      url.searchParams.set("from_symbol", from);
      url.searchParams.set("to_symbol", to);
      url.searchParams.set("interval", interval);
      url.searchParams.set("outputsize", "compact");
      url.searchParams.set("apikey", key);
      const res = await fetch(url.toString(), { cache: "no-store" });
      const payload = await res.json() as Record<string, unknown>;
      const candles = parseAlpha(payload, interval);
      if (res.ok && candles.length > 0) {
        const response: MarketResponse = { pair, from, to, interval, price: candles.at(-1)!.close, candles, source: "alpha-vantage", updatedAt: new Date().toISOString() };
        return NextResponse.json(response);
      }
    } catch {
      // Continue to fallback providers.
    }
  }

  const spot = await fetchFrankfurterSpot(from, to);
  if (spot != null) {
    const candles = candlesAroundSpot(from, to, spot);
    const response: MarketResponse = {
      pair,
      from,
      to,
      interval,
      price: spot,
      candles,
      source: "frankfurter-spot",
      warning: "Prix courant réel disponible, mais chandelles simulées autour du spot. Pour vraies chandelles intraday, il faut une source market data plus robuste.",
      updatedAt: new Date().toISOString()
    };
    return NextResponse.json(response);
  }

  const candles = generateDemoCandles(from, to);
  const response: MarketResponse = {
    pair,
    from,
    to,
    interval,
    price: candles.at(-1)!.close,
    candles,
    source: "demo",
    warning: key ? "Fallback demo: Alpha Vantage indisponible ou quota atteint." : "Mode demo: ajoute ALPHA_VANTAGE_API_KEY dans Vercel.",
    updatedAt: new Date().toISOString()
  };
  return NextResponse.json(response);
}
