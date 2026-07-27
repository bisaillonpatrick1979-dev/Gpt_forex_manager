import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { calculateMarketStats, detectTrend } from "@/lib/market";
import { diagnoseMarketData } from "@/lib/data-quality";
import { diagnoseMarketRegime } from "@/lib/market-regime";
import { buildAlphaResearchEnvelope } from "@/lib/alpha-research";
import { buildBacktestAuditEnvelope } from "@/lib/backtest-audit";
import { runDataQualityAgent } from "@/lib/agents/data-quality";
import { runMarketRegimeAgent } from "@/lib/agents/market-regime";
import { runAlphaResearchAgent } from "@/lib/agents/alpha-research";
import { runBacktestAuditor } from "@/lib/agents/backtest-auditor";
import { runMasterAgent } from "@/lib/agents/master";
import { Candle } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;

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
  const dataDiagnostics = diagnoseMarketData({
    candles,
    interval: parsed.interval,
    source: parsed.source,
    warning: parsed.warning
  });

  try {
    const dataAudit = await runDataQualityAgent(dataDiagnostics);
    const regimeDiagnostics = diagnoseMarketRegime({
      candles,
      dataDecision: dataAudit.auditStatus,
      dataClass: dataAudit.dataClass
    });
    const regimeAudit = await runMarketRegimeAgent(regimeDiagnostics);
    const alphaEnvelope = buildAlphaResearchEnvelope({
      pair: parsed.pair,
      interval: parsed.interval,
      availableObservations: candles.length,
      dataDecision: dataAudit.auditStatus,
      dataClass: dataAudit.dataClass,
      regimeAudit
    });
    const alphaResearch = await runAlphaResearchAgent({
      objective: parsed.objective,
      envelope: alphaEnvelope
    });
    const backtestEnvelope = buildBacktestAuditEnvelope({ alphaResearch });
    const backtestAudit = await runBacktestAuditor({
      alphaResearch,
      envelope: backtestEnvelope
    });

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
      dataAudit,
      regimeAudit,
      alphaResearch,
      backtestAudit
    });

    const masterUsesStoredPrompt = Boolean(process.env.OPENAI_PROMPT_MASTER_ID);
    const dataQualityUsesStoredPrompt = Boolean(process.env.OPENAI_PROMPT_DATA_QUALITY_ID);
    const marketRegimeUsesStoredPrompt = Boolean(process.env.OPENAI_PROMPT_MARKET_REGIME_ID);
    const alphaResearchUsesStoredPrompt = Boolean(process.env.OPENAI_PROMPT_ALPHA_RESEARCH_ID);
    const backtestAuditorUsesStoredPrompt = Boolean(process.env.OPENAI_PROMPT_BACKTEST_AUDITOR_ID);

    return NextResponse.json({
      agent: "Directeur quantitatif",
      mode: masterUsesStoredPrompt ? "stored-prompt" : "code-instructions",
      model: masterUsesStoredPrompt ? "Défini dans OpenAI Platform" : process.env.OPENAI_AGENT_MODEL || "gpt-5.1",
      orchestration: "Data Quality Agent → Market Regime Agent → Alpha Research Agent → Backtest Auditor → Directeur quantitatif",
      dataQuality: {
        mode: dataQualityUsesStoredPrompt ? "stored-prompt" : "code-instructions",
        diagnostics: dataDiagnostics,
        output: dataAudit
      },
      marketRegime: {
        mode: marketRegimeUsesStoredPrompt ? "stored-prompt" : "code-instructions",
        diagnostics: regimeDiagnostics,
        output: regimeAudit
      },
      alphaResearch: {
        mode: alphaResearchUsesStoredPrompt ? "stored-prompt" : "code-instructions",
        envelope: alphaEnvelope,
        output: alphaResearch
      },
      backtestAudit: {
        mode: backtestAuditorUsesStoredPrompt ? "stored-prompt" : "code-instructions",
        envelope: backtestEnvelope,
        output: backtestAudit
      },
      output,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Quant workflow failed", error);
    return NextResponse.json({
      error: "La chaîne Qualité → Régime → Alpha → Backtest → Directeur n'a pas pu terminer le mandat.",
      code: "QUANT_WORKFLOW_FAILED",
      dataDiagnostics
    }, { status: 502 });
  }
}
