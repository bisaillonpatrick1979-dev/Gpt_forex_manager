import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { calculateMarketStats, detectTrend } from "@/lib/market";
import { diagnoseMarketData } from "@/lib/data-quality";
import { runDataQualityAgent } from "@/lib/agents/data-quality";
import { runMasterAgent } from "@/lib/agents/master";
import { Candle } from "@/lib/types";

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
  objective: z.string().trim().min(10).max(3000),
  pair: z.string().trim().min(3).max(20),
  interval: z.string().trim().min(1).max(20),
  capitalCad: z.number().positive().max(100_000_000),
  source: z.string().trim().min(1).max(80),
  warning: z.string().trim().max(1500).optional(),
  updatedAt: z.string().trim().min(1).max(100),
  candles: z.array(CandleSchema).min(10).max(150)
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
      error: "Mandat invalide.",
      details: error instanceof z.ZodError ? error.issues : undefined
    }, { status: 400 });
  }

  const candles = parsed.candles as Candle[];
  const stats = calculateMarketStats(candles);
  const firstClose = candles.at(0)?.close ?? null;
  const lastClose = candles.at(-1)?.close ?? null;
  const diagnostics = diagnoseMarketData({
    candles,
    interval: parsed.interval,
    source: parsed.source,
    warning: parsed.warning
  });

  try {
    const dataAudit = await runDataQualityAgent(diagnostics);
    const output = await runMasterAgent({
      objective: parsed.objective,
      pair: parsed.pair,
      interval: parsed.interval,
      capitalCad: parsed.capitalCad,
      market: {
        source: parsed.source,
        warning: parsed.warning,
        updatedAt: parsed.updatedAt,
        candleCount: candles.length,
        firstClose,
        lastClose,
        changePercent: stats.changePercent,
        volatilityPercent: stats.volatility,
        trend: detectTrend(candles)
      },
      dataAudit
    });

    const usesStoredPrompt = Boolean(process.env.OPENAI_PROMPT_MASTER_ID);
    const dataQualityUsesStoredPrompt = Boolean(process.env.OPENAI_PROMPT_DATA_QUALITY_ID);

    return NextResponse.json({
      agent: "Directeur quantitatif",
      mode: usesStoredPrompt ? "stored-prompt" : "code-instructions",
      model: usesStoredPrompt ? "Défini dans OpenAI Platform" : process.env.OPENAI_AGENT_MODEL || "gpt-5.1",
      orchestration: "Data Quality Agent → Directeur quantitatif",
      dataQuality: {
        mode: dataQualityUsesStoredPrompt ? "stored-prompt" : "code-instructions",
        diagnostics,
        output: dataAudit
      },
      output,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Quant workflow failed", error);
    return NextResponse.json({
      error: "La chaîne Data Quality → Directeur quantitatif n'a pas pu terminer le mandat.",
      code: "QUANT_WORKFLOW_FAILED",
      diagnostics
    }, { status: 502 });
  }
}
