import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { diagnoseMarketData } from "@/lib/data-quality";
import { diagnoseMarketRegime } from "@/lib/market-regime";
import { buildAlphaResearchEnvelope } from "@/lib/alpha-research";
import { buildBacktestAuditEnvelope } from "@/lib/backtest-audit";
import { runDataQualityAgent } from "@/lib/agents/data-quality";
import { runMarketRegimeAgent } from "@/lib/agents/market-regime";
import { runAlphaResearchAgent } from "@/lib/agents/alpha-research";
import { runBacktestAuditor } from "@/lib/agents/backtest-auditor";

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

const BacktestEvidenceSchema = z.object({
  hypothesisId: z.string().trim().min(1).max(80),
  evidenceVersion: z.string().trim().min(1).max(80),
  generatedAt: z.string().trim().min(1).max(100),
  sourceHash: z.string().trim().min(1).max(200),
  observations: z.number().int().nonnegative(),
  trades: z.number().int().nonnegative(),
  outOfSamplePercent: z.number().min(0).max(100),
  chronologicalSplit: z.boolean(),
  walkForwardWindows: z.number().int().nonnegative(),
  costsIncluded: z.boolean(),
  spreadIncluded: z.boolean(),
  slippageIncluded: z.boolean(),
  lookaheadPrevented: z.boolean(),
  multipleTestingAdjusted: z.boolean(),
  parameterCount: z.number().int().nonnegative(),
  outOfSampleNetReturnPercent: z.number(),
  outOfSampleSharpe: z.number(),
  profitFactor: z.number().nonnegative(),
  maxDrawdownPercent: z.number().nonnegative(),
  stabilityScore: z.number().min(0).max(1)
});

const RequestSchema = z.object({
  objective: z.string().trim().min(10).max(3000),
  pair: z.string().trim().min(3).max(20),
  interval: z.string().trim().min(1).max(20),
  source: z.string().trim().min(1).max(80),
  warning: z.string().trim().max(1500).optional(),
  candles: z.array(CandleSchema).min(10).max(1000),
  evidence: z.array(BacktestEvidenceSchema).max(3).optional()
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
      error: "Dossier de backtest invalide.",
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
    const alphaEnvelope = buildAlphaResearchEnvelope({
      pair: parsed.pair,
      interval: parsed.interval,
      availableObservations: parsed.candles.length,
      dataDecision: dataAudit.auditStatus,
      dataClass: dataAudit.dataClass,
      regimeAudit
    });
    const alphaResearch = await runAlphaResearchAgent({
      objective: parsed.objective,
      envelope: alphaEnvelope
    });
    const auditEnvelope = buildBacktestAuditEnvelope({
      alphaResearch,
      evidence: parsed.evidence
    });
    const output = await runBacktestAuditor({
      alphaResearch,
      envelope: auditEnvelope
    });
    const usesStoredPrompt = Boolean(process.env.OPENAI_PROMPT_BACKTEST_AUDITOR_ID);

    return NextResponse.json({
      agent: "Backtest Auditor",
      mode: usesStoredPrompt ? "stored-prompt" : "code-instructions",
      model: usesStoredPrompt ? "Défini dans OpenAI Platform" : process.env.OPENAI_AGENT_MODEL || "gpt-5.1",
      prerequisites: {
        dataQuality: dataAudit.auditStatus,
        marketRegime: regimeAudit.primaryRegime,
        alphaResearch: alphaResearch.researchStatus,
        hypothesisCount: alphaResearch.hypotheses.length
      },
      envelope: auditEnvelope,
      output,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Backtest Auditor run failed", error);
    return NextResponse.json({
      error: "Le Backtest Auditor n'a pas pu terminer l'audit.",
      code: "BACKTEST_AUDITOR_FAILED"
    }, { status: 502 });
  }
}
