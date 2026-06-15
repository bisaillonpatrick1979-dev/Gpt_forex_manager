import { NextRequest, NextResponse } from "next/server";
import { getAppUserId, getMemoryStatus, getSupabaseAdmin } from "@/lib/memory-store";
import { AiAnalysis, Candle, MarketResponse } from "@/lib/types";
import { calculateMarketStats, detectTrend, generateDemoCandles, getPipSize, roundPrice } from "@/lib/market";

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

function parseAlpha(payload: Record<string, unknown>, interval: string): Candle[] {
  const key = `Time Series FX (${interval})`;
  const series = payload[key] as Record<string, Record<string, string>> | undefined;
  if (!series) return [];

  return Object.entries(series)
    .map(([time, item]) => ({
      time,
      open: Number(item["1. open"]),
      high: Number(item["2. high"]),
      low: Number(item["3. low"]),
      close: Number(item["4. close"])
    }))
    .filter((candle) => Number.isFinite(candle.close))
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

async function getMarketData(from: string, to: string, interval = "5min"): Promise<MarketResponse> {
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
      const payload = (await res.json()) as Record<string, unknown>;
      const candles = parseAlpha(payload, interval);

      if (res.ok && candles.length >= 10) {
        return {
          pair,
          from,
          to,
          interval,
          price: candles.at(-1)!.close,
          candles,
          source: "alpha-vantage",
          updatedAt: new Date().toISOString()
        };
      }
    } catch {
      // fallback below
    }
  }

  const candles = generateDemoCandles(from, to);
  return {
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
}

function localAnalysis(pair: string, candles: Candle[]): AiAnalysis {
  const last = candles.at(-1)?.close || 1;
  const trend = detectTrend(candles);
  const stats = calculateMarketStats(candles);
  const pip = getPipSize(pair);
  const action = trend === "BULLISH" ? "BUY" : trend === "BEARISH" ? "SELL" : "HOLD";
  const confidence = action === "HOLD" ? 48 : Math.min(78, Math.round(58 + Math.abs(stats.changePercent) * 8));
  const stop = pip * 18;
  const target = pip * 32;

  return {
    pair,
    action,
    confidence,
    marketBias: trend === "BULLISH" ? "Biais haussier modéré." : trend === "BEARISH" ? "Biais baissier modéré." : "Marché neutre.",
    entry: action === "HOLD" ? null : roundPrice(last),
    stopLoss: action === "BUY" ? roundPrice(last - stop) : action === "SELL" ? roundPrice(last + stop) : null,
    takeProfit: action === "BUY" ? roundPrice(last + target) : action === "SELL" ? roundPrice(last - target) : null,
    riskScore: action === "HOLD" ? 45 : 58,
    maxRiskPercent: 1,
    agents: [
      { name: "Market Structure Agent", vote: action, confidence, note: `Tendance détectée: ${trend}.` },
      { name: "Risk Manager", vote: confidence >= 65 ? action : "WAIT", confidence: Math.max(35, confidence - 12), note: "Risque limité à 1% du capital fictif." },
      { name: "Learning Agent", vote: "HOLD", confidence: 60, note: "Journaliser le résultat et apprendre après fermeture." }
    ],
    reasons: ["Signal basé sur structure courte et volatilité récente.", "Paper trading seulement.", "Aucune exécution réelle."],
    risks: ["Données potentiellement retardées.", "Nouvelles économiques peuvent invalider le setup.", "Ne pas utiliser comme conseil financier."],
    learningPlan: ["Comparer le résultat après 5, 15, 30 et 60 minutes.", "Noter si le stop était trop serré.", "Réduire la confiance des setups perdants répétitifs."],
    finalDecision: action === "HOLD" ? "Attendre." : `Setup ${action} possible en simulation seulement.`
  };
}

async function analyzeMarket(market: MarketResponse) {
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

  if (!key) return localAnalysis(market.pair, market.candles);

  try {
    const stats = calculateMarketStats(market.candles);
    const prompt = `Analyse Forex paper trading. Paire ${market.pair}. Capital fictif 1000 CAD. Variation ${stats.changePercent.toFixed(3)}%. Chandelles: ${JSON.stringify(market.candles.slice(-50))}. Retourne seulement JSON avec: pair, action BUY SELL HOLD WAIT, confidence, marketBias, entry, stopLoss, takeProfit, riskScore, maxRiskPercent maximum 1, agents, reasons, risks, learningPlan, finalDecision. Aucune exécution réelle.`;
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0.25,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Tu es un comité d'agents Forex. Paper trading seulement. Retourne JSON valide seulement." },
          { role: "user", content: prompt }
        ]
      })
    });

    const payload = await res.json();
    if (!res.ok) throw new Error("OpenAI error");
    return JSON.parse(payload.choices?.[0]?.message?.content || "{}") as AiAnalysis;
  } catch {
    return localAnalysis(market.pair, market.candles);
  }
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

async function savePrediction(market: MarketResponse, analysis: AiAnalysis) {
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

async function evaluateDue() {
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
    const market = await getMarketData(from, to);
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

  const pairs = getPairs();
  const created = [];
  const errors = [];

  for (const item of pairs) {
    try {
      const market = await getMarketData(item.from, item.to);
      const analysis = await analyzeMarket(market);
      const saved = await savePrediction(market, analysis);
      created.push({ pair: item.pair, action: analysis.action, confidence: analysis.confidence, price: market.price, source: market.source, saved });
    } catch (error) {
      errors.push({ pair: item.pair, error: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  const evaluation = await evaluateDue();
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
