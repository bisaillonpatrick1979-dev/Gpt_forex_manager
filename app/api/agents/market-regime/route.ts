import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { diagnoseMarketData } from "@/lib/data-quality";
import { diagnoseMarketRegime } from "@/lib/market-regime";
import { runDataQualityAgent } from "@/lib/agents/data-quality";
import { runMarketRegimeAgent } from "@/lib/agents/market-regime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const CandleSchema = z.object({
  time: z.string(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number()
});

const RequestSchema = z.object({
  interval: z.string().trim().min(1).max(20),
  source: z.string().trim().min(1).max(80),
  warning: z.string().trim().max(1500).optional(),
  candles: z.array(CandleSchema).min(10).max(1000)
});

export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({
      error: "OPENAI_API_KEY n'est pas configurée sur le serveur.",
      code: "OPENAI_NOT_CONFIGURED"
    }, { status: 503 });
  }

  let parsed: z.infer<typeof RequestSchema>;
  try {
    parsed = RequestSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json({
      error: "Données de régime invalides.",
      details: error instanceof z.ZodError ? error.issues : undefined
    }, { status: 400 });
  }

  const dataDiagnostics = diagnoseMarketData({
    candles: parsed.candles,
    interval: parsed.interval,
    source: parsed.source,
    warning: parsed.warning
  });

  try {
    const dataAudit = await runDataQualityAgent(dataDiagnostics);
    const regimeDiagnostics = diagnoseMarketRegime({
      candles: parsed.candles,
      dataDecision: dataAudit.auditStatus,
      dataClass: dataAudit.dataClass
    });
    const output = await runMarketRegimeAgent(regimeDiagnostics);
    const usesStoredPrompt = Boolean(process.env.OPENAI_PROMPT_MARKET_REGIME_ID);

    return NextResponse.json({
      agent: "Market Regime Agent",
      mode: usesStoredPrompt ? "stored-prompt" : "code-instructions",
      model: usesStoredPrompt ? "Défini dans OpenAI Platform" : process.env.OPENAI_AGENT_MODEL || "gpt-5.1",
      prerequisite: {
        agent: "Data Quality Agent",
        auditStatus: dataAudit.auditStatus,
        dataClass: dataAudit.dataClass
      },
      diagnostics: regimeDiagnostics,
      output,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Market Regime Agent run failed", error);
    return NextResponse.json({
      error: "Le Market Regime Agent n'a pas pu terminer la classification.",
      code: "MARKET_REGIME_AGENT_FAILED"
    }, { status: 502 });
  }
}
