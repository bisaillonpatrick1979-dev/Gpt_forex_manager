import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { diagnoseMarketData } from "@/lib/data-quality";
import { runDataQualityAgent } from "@/lib/agents/data-quality";

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
  candles: z.array(CandleSchema).min(1).max(1000)
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
      error: "Données d'audit invalides.",
      details: error instanceof z.ZodError ? error.issues : undefined
    }, { status: 400 });
  }

  const diagnostics = diagnoseMarketData({
    candles: parsed.candles,
    interval: parsed.interval,
    source: parsed.source,
    warning: parsed.warning
  });

  try {
    const output = await runDataQualityAgent(diagnostics);
    const usesStoredPrompt = Boolean(process.env.OPENAI_PROMPT_DATA_QUALITY_ID);

    return NextResponse.json({
      agent: "Data Quality Agent",
      mode: usesStoredPrompt ? "stored-prompt" : "code-instructions",
      model: usesStoredPrompt ? "Défini dans OpenAI Platform" : process.env.OPENAI_AGENT_MODEL || "gpt-5.1",
      diagnostics,
      output,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Data Quality Agent run failed", error);
    return NextResponse.json({
      error: "Le Data Quality Agent n'a pas pu terminer l'audit.",
      code: "DATA_QUALITY_AGENT_FAILED",
      diagnostics
    }, { status: 502 });
  }
}
