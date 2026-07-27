import { Agent, run } from "@openai/agents";
import { z } from "zod";
import { riskPolicy } from "@/lib/firm-config";

const SpecialistKeySchema = z.enum([
  "data-quality",
  "market-regime",
  "alpha-research",
  "backtest-auditor",
  "portfolio",
  "risk",
  "execution",
  "monitoring",
  "journal"
]);

export const MasterAgentOutputSchema = z.object({
  mandateStatus: z.enum([
    "READY_FOR_SPECIALISTS",
    "BLOCKED_MISSING_DATA",
    "REJECTED_OUT_OF_SCOPE"
  ]),
  measurableObjective: z.string().min(1),
  marketScope: z.array(z.string()).max(10),
  timeHorizons: z.array(z.string()).max(8),
  observedFacts: z.array(z.string()).max(12),
  hypothesesToTest: z.array(z.string()).max(12),
  unknowns: z.array(z.string()).max(12),
  dataQuality: z.object({
    status: z.enum(["ACCEPTABLE_FOR_RESEARCH", "SIMULATION_ONLY", "INSUFFICIENT"]),
    reasons: z.array(z.string()).max(10)
  }),
  requestedSpecialists: z.array(SpecialistKeySchema).max(9),
  researchQuestions: z.array(z.string()).max(12),
  riskConstraints: z.object({
    mode: z.literal("paper-only"),
    baseCurrency: z.literal("CAD"),
    maxRiskPerTradePercent: z.number(),
    maxDailyLossPercent: z.number(),
    maxPortfolioDrawdownPercent: z.number(),
    maxOpenPositions: z.number().int(),
    maxPairExposurePercent: z.number(),
    maxLeverage: z.number(),
    stopLossRequired: z.literal(true),
    independentRiskVetoRequired: z.literal(true),
    realBrokerEnabled: z.literal(false)
  }),
  prohibitedActions: z.array(z.string()).min(3).max(12),
  synthesis: z.string().min(1),
  nextStep: z.string().min(1),
  tradeDecision: z.literal("NO_TRADE_DECISION")
});

export type MasterAgentOutput = z.infer<typeof MasterAgentOutputSchema>;

export type MasterAgentInput = {
  objective: string;
  pair: string;
  interval: string;
  capitalCad: number;
  market: {
    source: string;
    warning?: string;
    updatedAt: string;
    candleCount: number;
    firstClose: number | null;
    lastClose: number | null;
    changePercent: number;
    volatilityPercent: number;
    trend: string;
  };
};

export const MASTER_AGENT_INSTRUCTIONS = `
Tu es le Directeur quantitatif de GPT Forex Manager, une firme de recherche quantitative en mode paper trading seulement.

MISSION
Tu transformes une demande de recherche en mandat mesurable. Tu vérifies les données disponibles, sélectionnes les spécialistes requis, sépares les faits des hypothèses et établis la prochaine étape vérifiable.

LIMITES ABSOLUES
- Tu n'es pas un vendeur de signaux.
- Tu ne promets jamais de battre le marché ni un rendement.
- Tu n'inventes jamais de performance, de probabilité ou de donnée manquante.
- Tu n'émets jamais directement BUY, SELL, un prix d'entrée, un stop loss, une taille de position ou un ordre de courtier.
- Tu refuses toute exécution réelle ou tentative de contourner une limite de risque.
- Tu bloques le mandat lorsque les données sont insuffisantes au lieu de deviner.
- Le Risk Governor conserve toujours un droit de veto indépendant.

MÉTHODE
1. Reformule l'objectif en résultat mesurable.
2. Évalue la provenance, la fraîcheur et la suffisance des données.
3. Détermine les marchés et horizons étudiés.
4. Sépare faits observés, hypothèses et inconnues.
5. Choisis uniquement les spécialistes nécessaires parmi : data-quality, market-regime, alpha-research, backtest-auditor, portfolio, risk, execution, monitoring et journal.
6. Énonce les questions auxquelles chaque phase doit répondre.
7. Recopie exactement les limites de risque fournies par l'application.
8. Termine par une prochaine étape concrète.
9. tradeDecision doit toujours être NO_TRADE_DECISION.

POLITIQUE PERMANENTE
- Mode paper-only.
- Devise de référence CAD.
- Risque maximal par transaction simulée : ${riskPolicy.maxRiskPerTradePercent} %.
- Perte quotidienne maximale : ${riskPolicy.maxDailyLossPercent} %.
- Drawdown maximal : ${riskPolicy.maxPortfolioDrawdownPercent} %.
- Positions ouvertes : ${riskPolicy.maxOpenPositions} maximum.
- Exposition par paire : ${riskPolicy.maxPairExposurePercent} % maximum.
- Levier simulé : ${riskPolicy.maxLeverage}x maximum.
- Stop loss obligatoire.
- Courtier réel désactivé.

Retourne uniquement la structure exigée par le schéma de sortie.
`.trim();

function createMasterAgent() {
  const storedPromptId = process.env.OPENAI_PROMPT_MASTER_ID?.trim();
  const storedPromptVersion = process.env.OPENAI_PROMPT_MASTER_VERSION?.trim();

  if (storedPromptId) {
    return new Agent({
      name: "Directeur quantitatif",
      outputType: MasterAgentOutputSchema,
      prompt: {
        promptId: storedPromptId,
        ...(storedPromptVersion ? { version: storedPromptVersion } : {})
      },
      modelSettings: { store: true }
    });
  }

  return new Agent({
    name: "Directeur quantitatif",
    model: process.env.OPENAI_AGENT_MODEL || "gpt-5.1",
    instructions: MASTER_AGENT_INSTRUCTIONS,
    outputType: MasterAgentOutputSchema,
    modelSettings: {
      reasoning: { effort: "medium" as const },
      store: true
    }
  });
}

export async function runMasterAgent(input: MasterAgentInput): Promise<MasterAgentOutput> {
  const agent = createMasterAgent();
  const result = await run(agent, JSON.stringify({
    task: "Préparer un mandat quantitatif sans prendre de décision de transaction.",
    input,
    immutableRiskPolicy: riskPolicy
  }), {
    workflowName: "GPT Forex Manager / Directeur quantitatif",
    traceMetadata: {
      pair: input.pair,
      interval: input.interval,
      marketSource: input.market.source,
      mode: riskPolicy.mode
    }
  });

  const parsed = MasterAgentOutputSchema.parse(result.finalOutput);

  return {
    ...parsed,
    riskConstraints: {
      mode: riskPolicy.mode,
      baseCurrency: riskPolicy.baseCurrency,
      maxRiskPerTradePercent: riskPolicy.maxRiskPerTradePercent,
      maxDailyLossPercent: riskPolicy.maxDailyLossPercent,
      maxPortfolioDrawdownPercent: riskPolicy.maxPortfolioDrawdownPercent,
      maxOpenPositions: riskPolicy.maxOpenPositions,
      maxPairExposurePercent: riskPolicy.maxPairExposurePercent,
      maxLeverage: riskPolicy.maxLeverage,
      stopLossRequired: riskPolicy.requireStopLoss,
      independentRiskVetoRequired: riskPolicy.requireRiskVeto,
      realBrokerEnabled: riskPolicy.realBrokerEnabled
    },
    tradeDecision: "NO_TRADE_DECISION"
  };
}
