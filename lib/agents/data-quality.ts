import { Agent, run } from "@openai/agents";
import { z } from "zod";
import { DataDiagnostics } from "@/lib/data-quality";

export const DataQualityOutputSchema = z.object({
  auditStatus: z.enum(["ACCEPT", "RESTRICT", "BLOCK"]),
  dataClass: z.enum(["LIVE_OR_DELAYED", "HISTORICAL_RESEARCH", "SYNTHETIC", "INVALID"]),
  summary: z.string().min(1),
  confirmedFindings: z.array(z.string()).max(15),
  unresolvedRisks: z.array(z.string()).max(15),
  permittedUses: z.array(z.string()).max(12),
  prohibitedUses: z.array(z.string()).min(3).max(15),
  remediationSteps: z.array(z.string()).max(12),
  specialistsMayProceed: z.boolean(),
  tradeDecision: z.literal("NO_TRADE_DECISION")
});

export type DataQualityOutput = z.infer<typeof DataQualityOutputSchema>;

export const DATA_QUALITY_INSTRUCTIONS = `
Tu es le Data Quality Agent de GPT Forex Manager.

MISSION
Tu audites les données de marché avant toute recherche quantitative. Tu reçois un diagnostic déterministe calculé par l'application. Tu dois l'interpréter, expliquer les limites et décider si les autres spécialistes peuvent poursuivre.

RÈGLES ABSOLUES
- Ne modifie jamais les mesures déterministes fournies.
- Ne transforme jamais une source synthétique en donnée réelle.
- Ne déduis jamais qu'une stratégie est rentable à partir de la qualité des données.
- N'émets jamais BUY, SELL, entrée, stop, cible, taille de position ou ordre.
- Une décision BLOCK doit empêcher les spécialistes de poursuivre.
- Une décision RESTRICT doit conserver exactement les usages permis et interdits fournis.
- L'exécution réelle demeure interdite dans tous les cas.
- tradeDecision doit toujours être NO_TRADE_DECISION.

AUDIT
1. Confirme la provenance et la classe des données.
2. Analyse la chronologie, les doublons, les trous, la cohérence OHLC, la fraîcheur et les variations extrêmes.
3. Distingue les anomalies certaines des risques non résolus.
4. Explique les usages permis sans exagération.
5. Donne les corrections nécessaires dans un ordre concret.

Retourne uniquement la structure exigée par le schéma.
`.trim();

export function createDataQualityAgent() {
  const storedPromptId = process.env.OPENAI_PROMPT_DATA_QUALITY_ID?.trim();
  const storedPromptVersion = process.env.OPENAI_PROMPT_DATA_QUALITY_VERSION?.trim();

  if (storedPromptId) {
    return new Agent({
      name: "Data Quality Agent",
      outputType: DataQualityOutputSchema,
      prompt: {
        promptId: storedPromptId,
        ...(storedPromptVersion ? { version: storedPromptVersion } : {})
      },
      modelSettings: { store: true }
    });
  }

  return new Agent({
    name: "Data Quality Agent",
    model: process.env.OPENAI_AGENT_MODEL || "gpt-5.1",
    instructions: DATA_QUALITY_INSTRUCTIONS,
    outputType: DataQualityOutputSchema,
    modelSettings: {
      reasoning: { effort: "medium" as const },
      store: true
    }
  });
}

export async function runDataQualityAgent(diagnostics: DataDiagnostics): Promise<DataQualityOutput> {
  const agent = createDataQualityAgent();
  const result = await run(agent, JSON.stringify({
    task: "Auditer les données de marché sans produire de décision de transaction.",
    deterministicDiagnostics: diagnostics
  }));

  const parsed = DataQualityOutputSchema.parse(result.finalOutput);

  return {
    ...parsed,
    auditStatus: diagnostics.decision,
    dataClass: diagnostics.dataClass,
    confirmedFindings: diagnostics.deterministicReasons,
    permittedUses: diagnostics.permittedUses,
    prohibitedUses: diagnostics.prohibitedUses,
    specialistsMayProceed: diagnostics.decision !== "BLOCK",
    tradeDecision: "NO_TRADE_DECISION"
  };
}
