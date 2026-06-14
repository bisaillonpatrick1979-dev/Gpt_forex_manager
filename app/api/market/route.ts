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

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  const from = cleanSymbol(search.get("from"), "EUR");
  const to = cleanSymbol(search.get("to"), "USD");
  const interval = search.get("interval") || "5min";
  const pair = `${from}/${to}`;
  const key = process.env.ALPHA_VANTAGE_API_KEY;

  if (!key) {
    const candles = generateDemoCandles(from, to);
    const response: MarketResponse = { pair, from, to, interval, price: candles.at(-1)!.close, candles, source: "demo", warning: "Mode demo: ajoute ALPHA_VANTAGE_API_KEY dans Vercel.", updatedAt: new Date().toISOString() };
    return NextResponse.json(response);
  }

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
    if (!res.ok || candles.length === 0) throw new Error("No candles");
    const response: MarketResponse = { pair, from, to, interval, price: candles.at(-1)!.close, candles, source: "alpha-vantage", updatedAt: new Date().toISOString() };
    return NextResponse.json(response);
  } catch {
    const candles = generateDemoCandles(from, to);
    const response: MarketResponse = { pair, from, to, interval, price: candles.at(-1)!.close, candles, source: "demo", warning: "Fallback demo: Alpha Vantage indisponible ou quota atteint.", updatedAt: new Date().toISOString() };
    return NextResponse.json(response);
  }
}
