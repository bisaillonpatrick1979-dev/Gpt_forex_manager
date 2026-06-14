import { NextRequest, NextResponse } from "next/server";
import { getAppUserId, getMemoryStatus, getSupabaseAdmin } from "@/lib/memory-store";
import { AiAnalysis, MarketResponse } from "@/lib/types";
import { getPipSize } from "@/lib/market";

export const dynamic = "force-dynamic";

type WatchRow = {
  id: string;
  pair: string;
  action: "BUY" | "SELL" | "HOLD" | "WAIT";
  start_price: number;
  horizon_minutes: number;
};

type ResultRow = {
  id: string;
  pair: string;
  action: "BUY" | "SELL" | "HOLD" | "WAIT";
  confidence: number;
  horizon_minutes: number;
  start_price: number;
  end_price: number | null;
  pips: number | null;
  success: boolean | null;
  status: "PENDING" | "DONE" | "ERROR";
  predicted_at: string;
  checked_at: string | null;
};

function getPairs() {
  return (process.env.MARKET_WATCHLIST || "EUR/USD,GBP/USD,USD/JPY,USD/CAD")
    .split(",")
    .map((pair) => pair.trim().toUpperCase())
    .filter(Boolean)
    .map((pair) => {
      const [from, to] = pair.split("/");
      return { pair: `${from}/${to}`, from, to };
    })
    .filter((item) => item.from && item.to);
}

function isAllowed(request: NextRequest) {
  const expected = process.env.CRON_SECRET || process.env.WATCH_SECRET;
  if (!expected) return true;

  const authHeader = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-watch-secret");
  const querySecret = request.nextUrl.searchParams.get("secret");

  return authHeader === `Bearer ${expected}` || headerSecret === expected || querySecret === expected;
}

function scorePrediction(row: WatchRow, endPrice: number) {
  const pipSize = getPipSize(row.pair);
  const rawPips = (endPrice - row.start_price) / pipSize;
  const signedPips = row.action === "SELL" ? rawPips * -1 : rawPips;
  const flatMove = Math.abs(rawPips);
  const success = row.action === "BUY" || row.action === "SELL" ? signedPips > 0 : flatMove < 5;

  return {
    pips: row.action === "HOLD" || row.action === "WAIT" ? rawPips : signedPips,
    success
  };
}

async function fetchMarket(origin: string, from: string, to: string) {
  const res = await fetch(`${origin}/api/market?from=${from}&to=${to}&interval=5min`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Market fetch failed for ${from}/${to}`);
  return (await res.json()) as MarketResponse;
}

async function fetchAnalysis(origin: string, market: MarketResponse) {
  const res = await fetch(`${origin}/api/ai/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pair: market.pair,
      candles: market.candles,
      accountCad: 1000,
      notes: "Automated market watch. Paper trading only. No real trade execution."
    })
  });

  if (!res.ok) throw new Error(`AI analysis failed for ${market.pair}`);
  const data = (await res.json()) as { analysis?: AiAnalysis };
  if (!data.analysis) throw new Error(`AI analysis missing for ${market.pair}`);
  return data.analysis;
}

async function getResultsSummary() {
  const supabase = getSupabaseAdmin();
  const status = getMemoryStatus();

  if (!status.enabled || !supabase) {
    return {
      enabled: false,
      reason: status.reason,
      summary: { total: 0, done: 0, pending: 0, wins: 0, losses: 0, successRate: 0, netPips: 0 },
      rows: [] as ResultRow[]
    };
  }

  const { data, error } = await supabase
    .from("prediction_results")
    .select("id,pair,action,confidence,horizon_minutes,start_price,end_price,pips,success,status,predicted_at,checked_at")
    .eq("user_id", getAppUserId())
    .order("predicted_at", { ascending: false })
    .limit(100);

  if (error) {
    return {
      enabled: true,
      reason: error.message,
      summary: { total: 0, done: 0, pending: 0, wins: 0, losses: 0, successRate: 0, netPips: 0 },
      rows: [] as ResultRow[]
    };
  }

  const rows = (data || []) as ResultRow[];
  const doneRows = rows.filter((row) => row.status === "DONE");
  const pendingRows = rows.filter((row) => row.status === "PENDING");
  const wins = doneRows.filter((row) => row.success === true).length;
  const losses = doneRows.filter((row) => row.success === false).length;
  const netPips = doneRows.reduce((sum, row) => sum + Number(row.pips || 0), 0);
  const successRate = doneRows.length ? (wins / doneRows.length) * 100 : 0;

  return {
    enabled: true,
    summary: {
      total: rows.length,
      done: doneRows.length,
      pending: pendingRows.length,
      wins,
      losses,
      successRate,
      netPips
    },
    rows
  };
}

async function savePrediction(origin: string, market: MarketResponse, analysis: AiAnalysis) {
  const supabase = getSupabaseAdmin();
  const status = getMemoryStatus();

  if (!status.enabled || !supabase) return { saved: false, reason: status.reason };

  const { data: inserted, error: analysisError } = await supabase
    .from("ai_analyses")
    .insert({
      user_id: getAppUserId(),
      pair: analysis.pair,
      action: analysis.action,
      confidence: analysis.confidence,
      market_bias: analysis.marketBias,
      entry: analysis.entry,
      stop_loss: analysis.stopLoss,
      take_profit: analysis.takeProfit,
      risk_score: analysis.riskScore,
      payload: { ...analysis, source: "watch", market }
    })
    .select("id")
    .single();

  if (analysisError) return { saved: false, reason: analysisError.message };

  const horizons = [5, 15, 30, 60];
  const now = new Date();
  const rows = horizons.map((minutes) => ({
    user_id: getAppUserId(),
    analysis_id: inserted?.id ?? null,
    pair: market.pair,
    action: analysis.action,
    confidence: analysis.confidence,
    predicted_at: now.toISOString(),
    due_at: new Date(now.getTime() + minutes * 60_000).toISOString(),
    horizon_minutes: minutes,
    start_price: market.price,
    status: "PENDING",
    payload: { analysis, market }
  }));

  const { error } = await supabase.from("prediction_results").insert(rows);
  if (error) return { saved: false, reason: error.message };

  return { saved: true, count: rows.length };
}

async function evaluateDue(origin: string) {
  const supabase = getSupabaseAdmin();
  const status = getMemoryStatus();

  if (!status.enabled || !supabase) return { checked: 0, updated: 0, reason: status.reason };

  const { data, error } = await supabase
    .from("prediction_results")
    .select("id,pair,action,start_price,horizon_minutes")
    .eq("user_id", getAppUserId())
    .eq("status", "PENDING")
    .lte("due_at", new Date().toISOString())
    .limit(25);

  if (error) return { checked: 0, updated: 0, reason: error.message };

  let updated = 0;

  for (const row of (data || []) as WatchRow[]) {
    const [from, to] = row.pair.split("/");
    const market = await fetchMarket(origin, from, to);
    const score = scorePrediction(row, market.price);

    const { error: updateError } = await supabase
      .from("prediction_results")
      .update({
        status: "DONE",
        checked_at: new Date().toISOString(),
        end_price: market.price,
        pips: score.pips,
        success: score.success,
        result_payload: { market, score }
      })
      .eq("id", row.id);

    if (!updateError) updated += 1;
  }

  return { checked: data?.length || 0, updated };
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("mode") || "run";

  if (mode === "summary") {
    const summary = await getResultsSummary();
    return NextResponse.json({ ok: true, mode, ...summary });
  }

  if (!isAllowed(request)) {
    return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 401 });
  }

  const origin = request.nextUrl.origin;
  const pairs = getPairs();
  const created = [];
  const errors = [];

  for (const item of pairs) {
    try {
      const market = await fetchMarket(origin, item.from, item.to);
      const analysis = await fetchAnalysis(origin, market);
      const saved = await savePrediction(origin, market, analysis);
      created.push({ pair: item.pair, action: analysis.action, confidence: analysis.confidence, price: market.price, saved });
    } catch (error) {
      errors.push({ pair: item.pair, error: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  const evaluation = await evaluateDue(origin);
  const results = await getResultsSummary();

  return NextResponse.json({
    ok: true,
    mode,
    ranAt: new Date().toISOString(),
    pairs: pairs.map((item) => item.pair),
    created,
    evaluation,
    results,
    errors
  });
}
