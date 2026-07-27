import { Agent, run } from "@openai/agents";
import { z } from "zod";
import { MarketRegimeDiagnostics } from "@/lib/market-regime";

export const MarketRegimeOutputSchema = z.object({
  regimeStatus: z.enum(["USABLE", "RESTRICTED", "BLOCKED"]),
  primaryRegime: z.enum([
    "TREND_UP",
    "TREND_DOWN",
    "RANGE",
    "HIGH_VOLATILITY",
    "LOW_VOLATILITY",
    "TRANSITIONAL",
    "BLOCKED_BY_DATA"
  ]),
  trendRegime: z.enum(["UP", "DOWN", "RANGE", "TRANSITIONAL", "BLOCKED"]),
  volatilityRegime: z.enum(["HIGH", "NORMAL", "LOW", "UNKNOWN"]),
  confidenceScore: z.number().min(0).max(100),
  summary: z.string().min(1),
  confirmedEvidence: z.array(z.string()).max(15),
  uncertainties: z.array(z.string()).max(15),
  admissibleStrategyFamilies: z.array(z.string()).max(10),
  excludedStrategyFamilies: z.array(z.string()).max(10),
  externalDataRequired: z.array(z.string()).max(10),
  specialistsMayProceed: z.boolean(),
  tradeDecision: z.literal("NO_TRADE_DECISION")
});

export type MarketRegimeOutput = z.infer<typeof MarketRegimeOutputSchema>;

export const MARKET_REGIME_INSTRUCTIONS = `
Tu es le Market Regime Agent de GPT Forex Manager.

MISSION
Tu interprètes une classification de régime calculée par du code déterministe. Tu expliques le contexte de marché et les familles de stratégies qui peuvent être étudiées. Tu ne produis jamais de signal de transaction.

RÈGLES ABSOLUES
- Ne modifie jamais le régime principal, le régime de tendance, le régime de volatilité, le score de confiance ou le droit de poursuivre fournis par l'application.
- Ne prétends jamais détecter une crise, une annonce économique, la liquidité réelle ou le sentiment à partir des chandelles seules.
- Le risque événementiel demeure inconnu sans calendrier économique externe fiable.
- Ne promets aucun rendement.
- N'émets jamais BUY, SELL, entrée, stop, cible, taille de position ou ordre.
- Ne certifie jamais une stratégie à partir d'une classification de régime.
- tradeDecision doit toujours être NO_TRADE_DECISION.

MÉTHODE
1. Résume le régime déterministe sans le reformuler de manière trompeuse.
2. Explique les éléments qui soutiennent cette classification.
3. Signale les incertitudes et les données externes manquantes.
4. Limite la recherche aux familles de stratégies admissibles fournies.
5. Conserve exactement les exclusions fournies par l'application.
6. Autorise les spécialistes suivants uniquement lorsque specialistsMayProceed vaut true.

Retourne uniquement la structure exigée par le schéma.
`.trim();

export function createMarketRegimeAgent() {
  const storedPromptId = process.env.OPENAI_PROMPT_MARKET_REGIME_ID?.trim();
  const storedPromptVersion = process.env.OPENAI_PROMPT_MARKET_REGIME_VERSION?.trim();

  if (storedPromptId) {
    return new Agent({
      name: "Market Regime Agent",
      outputType: MarketRegimeOutputSchema,
      prompt: {
        promptId: storedPromptId,
        ...(storedPromptVersion ? { version: storedPromptVersion } : {})
      },
      modelSettings: { store: true }
    });
  }

  return new Agent({
    name: "Market Regime Agent",
    model: process.env.OPENAI_AGENT_MODEL || "gpt-5.1",
    instructions: MARKET_REGIME_INSTRUCTIONS,
    outputType: MarketRegimeOutputSchema,
    modelSettings: {
      reasoning: { effort: "medium" as const },
      store: true
    }
  });
}

export function createBlockedMarketRegimeOutput(diagnostics: MarketRegimeDiagnostics): MarketRegimeOutput {
  return {
    regimeStatus: "BLOCKED",
    primaryRegime: "BLOCKED_BY_DATA",
    trendRegime: "BLOCKED",
    volatilityRegime: "UNKNOWN",
    confidenceScore: 0,
    summary: "La classification du régime est bloquée parce que les données n'ont pas franchi la porte de qualité.",
    confirmedEvidence: diagnostics.deterministicReasons,
    uncertainties: ["Le régime ne peut pas être interprété avant correction des données."],
    admissibleStrategyFamilies: [],
    excludedStrategyFamilies: diagnostics.excludedStrategyFamilies,
    externalDataRequired: diagnostics.externalDataRequired,
    specialistsMayProceed: false,
    tradeDecision: "NO_TRADE_DECISION"
  };
}

export async function runMarketRegimeAgent(diagnostics: MarketRegimeDiagnostics): Promise<MarketRegimeOutput> {
  if (!diagnostics.specialistsMayProceed || diagnostics.status === "BLOCKED") {
    return createBlockedMarketRegimeOutput(diagnostics);
  }

  const agent = createMarketRegimeAgent();
  const result = await run(agent, JSON.stringify({
    task: "Interpréter le régime de marché sans produire de décision de transaction.",
    deterministicDiagnostics: diagnostics
  }));

  const parsed = MarketRegimeOutputSchema.parse(result.finalOutput);

  return {
    ...parsed,
    regimeStatus: diagnostics.status,
    primaryRegime: diagnostics.primaryRegime,
    trendRegime: diagnostics.trendRegime,
    volatilityRegime: diagnostics.volatilityRegime,
    confidenceScore: diagnostics.confidenceScore,
    confirmedEvidence: diagnostics.deterministicReasons,
    admissibleStrategyFamilies: diagnostics.admissibleStrategyFamilies,
    excludedStrategyFamilies: diagnostics.excludedStrategyFamilies,
    externalDataRequired: diagnostics.externalDataRequired,
    specialistsMayProceed: diagnostics.specialistsMayProceed,
    tradeDecision: "NO_TRADE_DECISION"
  };
}
