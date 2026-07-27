import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { diagnoseMarketData } from "@/lib/data-quality";
import { diagnoseMarketRegime } from "@/lib/market-regime";
import { buildAlphaResearchEnvelope } from "@/lib/alpha-research";
import { runDataQualityAgent } from "@/lib/agents/data-quality";
import { runMarketRegimeAgent } from "@/lib/agents/market-regime";
import { runAlphaResearchAgent } from "@/lib/agents/alpha-research";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

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
      error: "Mandat de recherche invalide.",
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
    const regimeAudit = await runMarketRegimeAgent(regimeDiagnostics);
    const envelope = buildAlphaResearchEnvelope({
      pair: parsed.pair,
      interval: parsed.interval,
      availableObservations: parsed.candles.length,
      dataDecision: dataAudit.auditStatus,
      dataClass: dataAudit.dataClass,
      regimeAudit
    });
    const output = await runAlphaResearchAgent({
      objective: parsed.objective,
      envelope
    });
    const usesStoredPrompt = Boolean(process.env.OPENAI_PROMPT_ALPHA_RESEARCH_ID);

    return NextResponse.json({
      agent: "Alpha Research Agent",
      mode: usesStoredPrompt ? "stored-prompt" : "code-instructions",
      model: usesStoredPrompt ? "Défini dans OpenAI Platform" : process.env.OPENAI_AGENT_MODEL || "gpt-5.1",
      prerequisites: {
        dataQuality: {
          auditStatus: dataAudit.auditStatus,
          dataClass: dataAudit.dataClass
        },
        marketRegime: {
          regimeStatus: regimeAudit.regimeStatus,
          primaryRegime: regimeAudit.primaryRegime,
          confidenceScore: regimeAudit.confidenceScore
        }
      },
      envelope,
      output,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Alpha Research Agent run failed", error);
    return NextResponse.json({
      error: "L'Alpha Research Agent n'a pas pu terminer la recherche.",
      code: "ALPHA_RESEARCH_AGENT_FAILED"
    }, { status: 502 });
  }
}
