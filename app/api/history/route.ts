import { NextRequest, NextResponse } from "next/server";
import { getAppUserId, getMemoryStatus, getSupabaseAdmin } from "@/lib/memory-store";

export const dynamic = "force-dynamic";

type IncomingCandle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
};

type CandleRow = {
  user_id: string;
  pair: string;
  interval: string;
  source: string;
  candle_time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  payload: Record<string, unknown>;
};

function normalizePair(pair: string) {
  const clean = pair.toUpperCase().replace(/[^A-Z/]/g, "");
  if (clean.includes("/")) return clean;
  if (clean.length === 6) return `${clean.slice(0, 3)}/${clean.slice(3)}`;
  return clean || "EUR/USD";
}

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value.replace(",", "."));
  return NaN;
}

function isValidCandle(candle: IncomingCandle) {
  return Boolean(
    candle.time &&
    Number.isFinite(candle.open) &&
    Number.isFinite(candle.high) &&
    Number.isFinite(candle.low) &&
    Number.isFinite(candle.close)
  );
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

export async function GET(request: NextRequest) {
  const status = getMemoryStatus();
  const supabase = getSupabaseAdmin();
  if (!status.enabled || !supabase) {
    return NextResponse.json({ enabled: false, reason: status.reason, candles: [] });
  }

  const search = request.nextUrl.searchParams;
  const pair = normalizePair(search.get("pair") || "EUR/USD");
  const interval = search.get("interval") || "1min";
  const limit = Math.min(Number(search.get("limit") || 500), 5000);

  const { data, error } = await supabase
    .from("market_candles")
    .select("candle_time,open,high,low,close,volume,source")
    .eq("user_id", getAppUserId())
    .eq("pair", pair)
    .eq("interval", interval)
    .order("candle_time", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ enabled: true, reason: error.message, candles: [] }, { status: 200 });

  const candles = (data || [])
    .reverse()
    .map((row) => ({
      time: String(row.candle_time),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: row.volume == null ? null : Number(row.volume),
      source: row.source
    }));

  return NextResponse.json({ enabled: true, pair, interval, count: candles.length, candles });
}

export async function POST(request: NextRequest) {
  const status = getMemoryStatus();
  const supabase = getSupabaseAdmin();
  if (!status.enabled || !supabase) {
    return NextResponse.json({ enabled: false, reason: status.reason, inserted: 0 });
  }

  const body = await request.json() as {
    pair?: string;
    interval?: string;
    source?: string;
    candles?: Array<Record<string, unknown>>;
  };

  const pair = normalizePair(body.pair || "EUR/USD");
  const interval = body.interval || "1min";
  const source = body.source || "csv-import";
  const candles = Array.isArray(body.candles) ? body.candles : [];
  const rows: CandleRow[] = [];

  for (const raw of candles) {
    const candle: IncomingCandle = {
      time: String(raw.time || raw.date || raw.datetime || raw.timestamp || ""),
      open: toNumber(raw.open),
      high: toNumber(raw.high),
      low: toNumber(raw.low),
      close: toNumber(raw.close),
      volume: raw.volume == null ? null : toNumber(raw.volume)
    };

    if (!isValidCandle(candle)) continue;

    rows.push({
      user_id: getAppUserId(),
      pair,
      interval,
      source,
      candle_time: new Date(candle.time).toISOString(),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume ?? null,
      payload: raw
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({ enabled: true, inserted: 0, error: "Aucune chandelle valide." }, { status: 400 });
  }

  let inserted = 0;
  for (const batch of chunk(rows, 500)) {
    const { error } = await supabase
      .from("market_candles")
      .upsert(batch, { onConflict: "user_id,pair,interval,candle_time" });

    if (error) {
      return NextResponse.json({ enabled: true, inserted, error: error.message }, { status: 500 });
    }

    inserted += batch.length;
  }

  return NextResponse.json({ enabled: true, pair, interval, source, inserted });
}
