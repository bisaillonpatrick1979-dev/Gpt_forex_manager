import { Agent, run } from "@openai/agents";
import { z } from "zod";
import { riskPolicy } from "@/lib/firm-config";
import { DataQualityOutput } from "@/lib/agents/data-quality";
import { MarketRegimeOutput } from "@/lib/agents/market-regime";
import { AlphaResearchOutput } from "@/lib/agents/alpha-research";

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
  dataAudit: DataQualityOutput;
  regimeAudit: MarketRegimeOutput;
  alphaResearch: AlphaResearchOutput;
};

export const MASTER_AGENT_INSTRUCTIONS = `
Tu es le Directeur quantitatif de GPT Forex Manager, une firme de recherche quantitative en mode paper trading seulement.

MISSION
Tu transformes les travaux déjà réalisés en mandat de validation mesurable. Tu sépares les faits des hypothèses et établis la prochaine étape vérifiable.

CHAÎNE OBLIGATOIRE
Le Data Quality Agent, le Market Regime Agent et l'Alpha Research Agent ont déjà terminé leurs travaux. Leurs résultats sont fournis dans dataAudit, regimeAudit et alphaResearch.
- Tu dois respecter toutes leurs décisions, restrictions, exclusions et incertitudes.
- Si l'un des trois agents bloque la progression, mandateStatus doit être BLOCKED_MISSING_DATA et aucun autre spécialiste ne doit être demandé.
- Les hypothèses de alphaResearch sont uniquement des spécifications de recherche, jamais des stratégies validées.
- Ne demande pas de nouveau data-quality, market-regime ou alpha-research.
- À ce stade, les seuls spécialistes admissibles sont backtest-auditor et journal.
- Portfolio Allocator, Risk Governor et Execution Planner restent interdits tant qu'un backtest hostile indépendant n'a pas été réussi.
- Tu ne dois pas présenter le risque événementiel comme connu sans calendrier économique externe fiable.

LIMITES ABSOLUES
- Tu n'es pas un vendeur de signaux.
- Tu ne promets jamais de battre le marché ni un rendement.
- Tu n'inventes jamais de performance, de probabilité ou de donnée manquante.
- Tu n'émets jamais directement BUY, SELL, un prix d'entrée, un stop loss, une taille de position ou un ordre de courtier.
- Tu refuses toute exécution réelle ou tentative de contourner une limite de risque.
- Le Risk Governor conserve toujours un droit de veto indépendant pour les phases futures.

MÉTHODE
1. Reformule l'objectif comme un mandat de validation.
2. Applique la qualité des données et le régime déterministe.
3. Reprends uniquement les hypothèses conservées par l'Alpha Research Agent.
4. Sépare faits observés, hypothèses et inconnues.
5. Prépare les questions auxquelles le Backtest Auditor devra répondre.
6. Recopie exactement les limites de risque fournies par l'application.
7. Termine par une prochaine étape de validation concrète.
8. tradeDecision doit toujours être NO_TRADE_DECISION.

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

function uniqueLimited(values: string[], limit: number) {
  return Array.from(new Set(values.filter(Boolean))).slice(0, limit);
}

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
    task: "Préparer un mandat de validation sans prendre de décision de transaction.",
    input,
    immutableRiskPolicy: riskPolicy
  }));

  const parsed = MasterAgentOutputSchema.parse(result.finalOutput);
  const dataBlocked = input.dataAudit.auditStatus === "BLOCK" || !input.dataAudit.specialistsMayProceed;
  const regimeBlocked = input.regimeAudit.regimeStatus === "BLOCKED" || !input.regimeAudit.specialistsMayProceed;
  const alphaBlocked = input.alphaResearch.researchStatus === "BLOCKED" || !input.alphaResearch.specialistsMayProceed;
  const workflowBlocked = dataBlocked || regimeBlocked || alphaBlocked;
  const dataQualityStatus = input.dataAudit.auditStatus === "ACCEPT"
    ? "ACCEPTABLE_FOR_RESEARCH" as const
    : input.dataAudit.auditStatus === "RESTRICT"
      ? "SIMULATION_ONLY" as const
      : "INSUFFICIENT" as const;

  const hypothesisDescriptions = input.alphaResearch.hypotheses.map(
    (hypothesis) => `${hypothesis.hypothesisId} — ${hypothesis.title} [${hypothesis.family}]`
  );

  return {
    ...parsed,
    mandateStatus: workflowBlocked ? "BLOCKED_MISSING_DATA" : "READY_FOR_SPECIALISTS",
    observedFacts: uniqueLimited([
      ...input.dataAudit.confirmedFindings,
      `Régime déterministe : ${input.regimeAudit.primaryRegime}.`,
      `Tendance : ${input.regimeAudit.trendRegime}; volatilité : ${input.regimeAudit.volatilityRegime}.`,
      `Confiance de classification : ${input.regimeAudit.confidenceScore} sur 100.`,
      `${input.alphaResearch.hypotheses.length} hypothèse(s) conforme(s) conservée(s) par l'Alpha Research Agent.`,
      ...input.regimeAudit.confirmedEvidence,
      ...parsed.observedFacts
    ], 12),
    hypothesesToTest: workflowBlocked ? [] : hypothesisDescriptions.slice(0, 12),
    unknowns: uniqueLimited([
      ...input.regimeAudit.uncertainties,
      ...input.regimeAudit.externalDataRequired.map((item) => `Donnée externe requise : ${item}.`),
      ...input.alphaResearch.uncertainties,
      ...parsed.unknowns
    ], 12),
    dataQuality: {
      status: dataQualityStatus,
      reasons: uniqueLimited([
        input.dataAudit.summary,
        ...input.dataAudit.confirmedFindings,
        ...input.dataAudit.unresolvedRisks
      ], 10)
    },
    requestedSpecialists: workflowBlocked ? [] : ["backtest-auditor", "journal"],
    researchQuestions: workflowBlocked
      ? []
      : uniqueLimited([
          "Chaque hypothèse survit-elle à une séparation chronologique stricte et à un test hors échantillon?",
          "Les résultats résistent-ils aux coûts, au spread et au glissement réalistes?",
          "Les paramètres restent-ils stables dans plusieurs sous-périodes et régimes voisins?",
          "Le nombre d'essais et le biais de sélection ont-ils été correctement pénalisés?",
          "Les critères d'invalidation définis avant le test sont-ils respectés?",
          ...parsed.researchQuestions
        ], 12),
    prohibitedActions: uniqueLimited([
      ...input.dataAudit.prohibitedUses,
      ...input.regimeAudit.excludedStrategyFamilies.map((family) => `Famille exclue dans ce régime : ${family}.`),
      "Utiliser une hypothèse comme signal de transaction.",
      "Passer au portefeuille, au risque ou à l'exécution avant l'audit hostile du backtest.",
      ...parsed.prohibitedActions
    ], 12),
    nextStep: dataBlocked
      ? input.dataAudit.remediationSteps[0] || "Corriger les données et relancer le Data Quality Agent."
      : regimeBlocked
        ? "Corriger le blocage du régime avant de poursuivre la recherche."
        : alphaBlocked
          ? input.alphaResearch.nextStep
          : "Transmettre les spécifications conservées au Backtest Auditor et journaliser leurs versions avant tout test.",
    riskConstraints: {
      mode: riskPolicy.mode,
      baseCurrency: riskPolicy.baseCurrency,
      maxRiskPerTradePercent: riskPolicy.maxRiskPerTradePercent,
      maxDailyLossPercent: riskPolicy.maxDailyLossPercent,
      maxPortfolioDrawdownPercent: riskPolicy.maxPortfolioDrawdownPercent,
      maxOpenPositions: riskPolicy.maxOpenPositions,
      maxPairExposurePercent: riskPolicy.maxPairExposurePercent,
      maxLeverage: riskPolicy.maxLeverage,
      stopLossRequired: true,
      independentRiskVetoRequired: true,
      realBrokerEnabled: false
    },
    tradeDecision: "NO_TRADE_DECISION"
  };
}
