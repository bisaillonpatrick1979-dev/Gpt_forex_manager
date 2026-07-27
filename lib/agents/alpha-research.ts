import { Agent, run } from "@openai/agents";
import { z } from "zod";
import { AlphaResearchEnvelope } from "@/lib/alpha-research";

const AlphaModelOutputSchema = z.object({
  summary: z.string().min(1),
  uncertainties: z.array(z.string()).max(12),
  hypotheses: z.array(z.object({
    familyIndex: z.number().int().min(0).max(9),
    title: z.string().min(1).max(160),
    directionalBias: z.enum(["LONG_ONLY", "SHORT_ONLY", "BOTH", "NEUTRAL"]),
    economicIntuition: z.string().min(1).max(1200),
    marketCondition: z.string().min(1).max(1000),
    candidateCondition: z.string().min(1).max(1200),
    candidateExitCondition: z.string().min(1).max(1200),
    features: z.array(z.string()).min(1).max(8),
    holdingPeriodResearch: z.string().min(1).max(200),
    targetMetric: z.string().min(1).max(300),
    invalidationCriteria: z.array(z.string()).min(1).max(8),
    expectedFailureModes: z.array(z.string()).min(1).max(8),
    requiredData: z.array(z.string()).min(1).max(10),
    robustnessTests: z.array(z.string()).min(1).max(10)
  })).max(3),
  nextStep: z.string().min(1),
  tradeDecision: z.literal("NO_TRADE_DECISION")
});

type AlphaModelOutput = z.infer<typeof AlphaModelOutputSchema>;

export type AlphaHypothesis = {
  hypothesisId: string;
  family: string;
  title: string;
  directionalBias: "LONG_ONLY" | "SHORT_ONLY" | "BOTH" | "NEUTRAL";
  economicIntuition: string;
  marketCondition: string;
  candidateCondition: string;
  candidateExitCondition: string;
  features: string[];
  holdingPeriodResearch: string;
  targetMetric: string;
  invalidationCriteria: string[];
  expectedFailureModes: string[];
  requiredData: string[];
  backtestSpecification: {
    researchOnly: true;
    liveTradingAllowed: false;
    paperOrderAllowed: false;
    minimumObservations: number;
    minimumOutOfSamplePercent: 30;
    minimumTrades: 50;
    maxFreeParameters: 6;
    requiredValidation: string[];
    robustnessTests: string[];
  };
  status: "SPECIFICATION_ONLY";
};

export type AlphaResearchOutput = {
  researchStatus: "OPEN" | "RESTRICTED" | "BLOCKED";
  summary: string;
  allowedFamilies: string[];
  excludedFamilies: string[];
  hypotheses: AlphaHypothesis[];
  rejectedHypothesisCount: number;
  uncertainties: string[];
  nextStep: string;
  specialistsMayProceed: boolean;
  liveTradingAllowed: false;
  paperOrderAllowed: false;
  tradeDecision: "NO_TRADE_DECISION";
};

export const ALPHA_RESEARCH_INSTRUCTIONS = `
Tu es l'Alpha Research Agent de GPT Forex Manager.

MISSION
Tu transformes un régime de marché autorisé en un maximum de trois hypothèses de recherche précises, falsifiables et prêtes à être confiées au Backtest Auditor. Tu ne produis jamais de signal de transaction.

ENTRÉE CONTRÔLÉE
L'application fournit un researchEnvelope déterministe contenant les familles autorisées, les familles exclues, les horizons de recherche et les exigences de validation.

RÈGLES ABSOLUES
- Utilise uniquement une famille autorisée en copiant son index depuis allowedFamilies. familyIndex commence à 0.
- Ne propose jamais une famille exclue.
- Ne donne jamais de prix actuel, d'ordre, de taille de position ni d'instruction d'exécution.
- candidateCondition et candidateExitCondition décrivent uniquement une règle candidate destinée au backtest; elles ne sont jamais un conseil d'action immédiate.
- Ne promets aucun rendement, taux de réussite ou avantage statistique.
- Ne présente jamais une hypothèse comme validée.
- Limite chaque hypothèse à six paramètres libres maximum.
- Les données synthétiques ou insuffisantes permettent seulement une spécification, jamais une conclusion de performance.
- Chaque hypothèse doit pouvoir être invalidée.
- tradeDecision doit toujours être NO_TRADE_DECISION.

MÉTHODE
1. Choisis jusqu'à trois hypothèses distinctes et simples.
2. Explique l'intuition économique ou microstructurelle sans inventer de fait.
3. Définis les conditions de marché nécessaires.
4. Décris une condition candidate et une condition de sortie uniquement pour la recherche historique.
5. Énumère les variables, les données, les échecs possibles et les critères d'invalidation.
6. Prépare des tests de robustesse qui complètent les exigences déterministes.
7. Termine par la prochaine étape de validation.

Retourne uniquement la structure exigée par le schéma.
`.trim();

function createAlphaResearchAgent() {
  const storedPromptId = process.env.OPENAI_PROMPT_ALPHA_RESEARCH_ID?.trim();
  const storedPromptVersion = process.env.OPENAI_PROMPT_ALPHA_RESEARCH_VERSION?.trim();

  if (storedPromptId) {
    return new Agent({
      name: "Alpha Research Agent",
      outputType: AlphaModelOutputSchema,
      prompt: {
        promptId: storedPromptId,
        ...(storedPromptVersion ? { version: storedPromptVersion } : {})
      },
      modelSettings: { store: true }
    });
  }

  return new Agent({
    name: "Alpha Research Agent",
    model: process.env.OPENAI_AGENT_MODEL || "gpt-5.1",
    instructions: ALPHA_RESEARCH_INSTRUCTIONS,
    outputType: AlphaModelOutputSchema,
    modelSettings: {
      reasoning: { effort: "medium" as const },
      store: true
    }
  });
}

function blockedOutput(envelope: AlphaResearchEnvelope): AlphaResearchOutput {
  return {
    researchStatus: "BLOCKED",
    summary: "La recherche alpha est bloquée par une porte précédente. Aucune hypothèse n'a été créée.",
    allowedFamilies: envelope.allowedFamilies,
    excludedFamilies: envelope.excludedFamilies,
    hypotheses: [],
    rejectedHypothesisCount: 0,
    uncertainties: envelope.deterministicReasons,
    nextStep: "Corriger la porte bloquante avant de relancer l'Alpha Research Agent.",
    specialistsMayProceed: false,
    liveTradingAllowed: false,
    paperOrderAllowed: false,
    tradeDecision: "NO_TRADE_DECISION"
  };
}

function mapHypotheses(modelOutput: AlphaModelOutput, envelope: AlphaResearchEnvelope) {
  let rejectedHypothesisCount = 0;
  const hypotheses: AlphaHypothesis[] = [];

  modelOutput.hypotheses.slice(0, envelope.maxHypotheses).forEach((hypothesis, index) => {
    const family = envelope.allowedFamilies[hypothesis.familyIndex];
    if (!family) {
      rejectedHypothesisCount += 1;
      return;
    }

    hypotheses.push({
      hypothesisId: `HYP-${String(index + 1).padStart(2, "0")}`,
      family,
      title: hypothesis.title,
      directionalBias: hypothesis.directionalBias,
      economicIntuition: hypothesis.economicIntuition,
      marketCondition: hypothesis.marketCondition,
      candidateCondition: hypothesis.candidateCondition,
      candidateExitCondition: hypothesis.candidateExitCondition,
      features: hypothesis.features.slice(0, 8),
      holdingPeriodResearch: hypothesis.holdingPeriodResearch,
      targetMetric: hypothesis.targetMetric,
      invalidationCriteria: hypothesis.invalidationCriteria.slice(0, 8),
      expectedFailureModes: hypothesis.expectedFailureModes.slice(0, 8),
      requiredData: hypothesis.requiredData.slice(0, 10),
      backtestSpecification: {
        researchOnly: true,
        liveTradingAllowed: false,
        paperOrderAllowed: false,
        minimumObservations: envelope.minimumObservations,
        minimumOutOfSamplePercent: 30,
        minimumTrades: 50,
        maxFreeParameters: 6,
        requiredValidation: envelope.requiredValidation,
        robustnessTests: hypothesis.robustnessTests.slice(0, 10)
      },
      status: "SPECIFICATION_ONLY"
    });
  });

  return { hypotheses, rejectedHypothesisCount };
}

export async function runAlphaResearchAgent(args: {
  objective: string;
  envelope: AlphaResearchEnvelope;
}): Promise<AlphaResearchOutput> {
  if (!args.envelope.specialistsMayProceed || args.envelope.status === "BLOCKED") {
    return blockedOutput(args.envelope);
  }

  const agent = createAlphaResearchAgent();
  const result = await run(agent, JSON.stringify({
    task: "Créer des hypothèses de recherche falsifiables sans produire de décision de transaction.",
    objective: args.objective,
    researchEnvelope: args.envelope
  }));

  const parsed = AlphaModelOutputSchema.parse(result.finalOutput);
  const { hypotheses, rejectedHypothesisCount } = mapHypotheses(parsed, args.envelope);
  const specialistsMayProceed = hypotheses.length > 0;

  return {
    researchStatus: args.envelope.status,
    summary: parsed.summary,
    allowedFamilies: args.envelope.allowedFamilies,
    excludedFamilies: args.envelope.excludedFamilies,
    hypotheses,
    rejectedHypothesisCount,
    uncertainties: Array.from(new Set([
      ...args.envelope.deterministicReasons,
      ...parsed.uncertainties
    ])).slice(0, 15),
    nextStep: specialistsMayProceed
      ? parsed.nextStep
      : "Aucune hypothèse conforme n'a été conservée; reformuler le mandat ou corriger les contraintes.",
    specialistsMayProceed,
    liveTradingAllowed: false,
    paperOrderAllowed: false,
    tradeDecision: "NO_TRADE_DECISION"
  };
}
