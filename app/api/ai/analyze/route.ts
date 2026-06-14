import { NextRequest, NextResponse } from "next/server";
import { AiAnalysis, Candle } from "@/lib/types";
import { calculateMarketStats, detectTrend, getPipSize, roundPrice } from "@/lib/market";

export const dynamic = "force-dynamic";

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
    learningPlan: ["Comparer le résultat après 10, 20 et 30 chandelles.", "Noter si le stop était trop serré.", "Réduire la confiance des setups perdants répétitifs."],
    finalDecision: action === "HOLD" ? "Attendre." : `Setup ${action} possible en simulation seulement.`
  };
}

export async function POST(request: NextRequest) {
  const body = await request.json() as { pair?: string; candles?: Candle[]; accountCad?: number; notes?: string };
  const pair = body.pair || "EUR/USD";
  const candles = Array.isArray(body.candles) ? body.candles.slice(-80) : [];
  const accountCad = Number(body.accountCad || 1000);
  const notes = String(body.notes || "").slice(0, 1200);

  if (candles.length < 10) return NextResponse.json({ error: "Pas assez de chandelles." }, { status: 400 });
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

  if (!key) return NextResponse.json({ analysis: localAnalysis(pair, candles), mode: "fallback", warning: "OPENAI_API_KEY manquante." });

  try {
    const stats = calculateMarketStats(candles);
    const prompt = `Analyse Forex paper trading. Paire ${pair}. Capital fictif ${accountCad} CAD. Variation ${stats.changePercent.toFixed(3)}%. Notes: ${notes || "Aucune"}. Chandelles: ${JSON.stringify(candles.slice(-50))}. Retourne seulement JSON avec: pair, action BUY SELL HOLD WAIT, confidence, marketBias, entry, stopLoss, takeProfit, riskScore, maxRiskPercent maximum 1, agents, reasons, risks, learningPlan, finalDecision. Aucune exécution réelle.`;
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
    const analysis = JSON.parse(payload.choices?.[0]?.message?.content || "{}") as AiAnalysis;
    return NextResponse.json({ analysis, mode: "openai", model });
  } catch {
    return NextResponse.json({ analysis: localAnalysis(pair, candles), mode: "fallback", warning: "Erreur OpenAI. Analyse locale utilisée." });
  }
}
