import { NextRequest, NextResponse } from "next/server";
import { getAppUserId, getMemoryStatus, getSupabaseAdmin } from "@/lib/memory-store";
import { AiAnalysis } from "@/lib/types";

export const dynamic = "force-dynamic";

function toDbAnalysis(analysis: AiAnalysis) {
  return {
    user_id: getAppUserId(),
    pair: analysis.pair,
    action: analysis.action,
    confidence: analysis.confidence,
    market_bias: analysis.marketBias,
    entry: analysis.entry,
    stop_loss: analysis.stopLoss,
    take_profit: analysis.takeProfit,
    risk_score: analysis.riskScore,
    payload: analysis
  };
}

export async function GET() {
  const status = getMemoryStatus();
  const supabase = getSupabaseAdmin();

  if (!status.enabled || !supabase) {
    return NextResponse.json({ enabled: false, reason: status.reason, analyses: [] });
  }

  const { data, error } = await supabase
    .from("ai_analyses")
    .select("*")
    .eq("user_id", getAppUserId())
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ enabled: false, reason: error.message, analyses: [] }, { status: 200 });
  }

  return NextResponse.json({ enabled: true, analyses: data || [] });
}

export async function POST(request: NextRequest) {
  const status = getMemoryStatus();
  const supabase = getSupabaseAdmin();

  if (!status.enabled || !supabase) {
    return NextResponse.json({ enabled: false, reason: status.reason, saved: false });
  }

  const body = (await request.json()) as { analysis?: AiAnalysis };
  const analysis = body.analysis;

  if (!analysis) {
    return NextResponse.json({ enabled: true, saved: false, error: "Analyse manquante." }, { status: 400 });
  }

  const { error } = await supabase
    .from("ai_analyses")
    .insert(toDbAnalysis(analysis));

  if (error) {
    return NextResponse.json({ enabled: true, saved: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ enabled: true, saved: true });
}
