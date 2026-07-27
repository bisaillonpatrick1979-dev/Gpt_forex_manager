import { Agent, run } from "@openai/agents";
import { z } from "zod";
import type { AlphaResearchOutput } from "@/lib/agents/alpha-research";
import type { BacktestAuditEnvelope } from "@/lib/backtest-audit";

const BacktestModelOutputSchema = z.object({
  summary: z.string().min(1),
  reviews: z.array(z.object({
    hypothesisIndex: z.number().int().min(0).max(9),
    hostileSummary: z.string().min(1).max(1600),
    likelyBiases: z.array(z.string()).max(12),
    specificationDefects: z.array(z.string()).max(12),
    additionalStressTests: z.array(z.string()).max(12),
    rejectionTriggers: z.array(z.string()).max(12)
  })).max(3),
  crossHypothesisRisks: z.array(z.string()).max(12),
  unresolvedRisks: z.array(z.string()).max(12),
  nextStep: z.string().min(1),
  tradeDecision: z.literal("NO_TRADE_DECISION")
});

type BacktestModelOutput = z.infer<typeof BacktestModelOutputSchema>;

export type BacktestHypothesisReview = {
  hypothesisId: string;
  title: string;
  specificationVerdict: "READY_TO_IMPLEMENT" | "NEEDS_REVISION" | "BLOCKED";
  resultVerdict: "NOT_RUN" | "INSUFFICIENT_EVIDENCE" | "REJECTED" | "CANDIDATE_SURVIVED_PRELIMINARY";
  hostileSummary: string;
  deterministicReasons: string[];
  missingRequirements: string[];
  likelyBiases: string[];
  specificationDefects: string[];
  requiredTestMatrix: string[];
  rejectionTriggers: string[];
  evidencePresent: boolean;
  candidateMayAdvance: boolean;
};

export type BacktestAuditorOutput = {
  auditStatus: "BLOCKED" | "NEEDS_REVISION" | "AWAITING_BACKTEST_RESULTS" | "EVIDENCE_REJECTED" | "CANDIDATE_SURVIVED_PRELIMINARY";
  summary: string;
  reviews: BacktestHypothesisReview[];
  crossHypothesisRisks: string[];
  unresolvedRisks: string[];
  requiredAuditTrail: string[];
  nextStep: string;
  specialistsMayProceed: boolean;
  performanceClaimAllowed: false;
  liveTradingAllowed: false;
  paperOrderAllowed: false;
  tradeDecision: "NO_TRADE_DECISION";
};

export const BACKTEST_AUDITOR_INSTRUCTIONS = `
Tu es le Backtest Auditor de GPT Forex Manager.

MISSION
Tu es un auditeur hostile. Tu essaies de réfuter les hypothèses de recherche, de détecter les biais et de préciser les tests qui pourraient les invalider. Tu ne produis jamais de résultats de backtest qui ne sont pas fournis.

ENTRÉES CONTRÔLÉES
L'application fournit :
- alphaResearch : les hypothèses de l'Agent 04;
- auditEnvelope : les verdicts et exigences déterministes;
- les résultats de backtest peuvent être absents.

RÈGLES ABSOLUES
- Ne change jamais auditStatus, specificationVerdict, resultVerdict, candidateMayAdvance ou specialistsMayProceed.
- N'invente jamais un rendement, un Sharpe, un drawdown, un taux de réussite ou un nombre de transactions.
- Si resultVerdict vaut NOT_RUN, dis clairement que le backtest n'a pas été exécuté.
- Si la preuve est insuffisante, ne transforme jamais le verdict en succès.
- Un statut CANDIDATE_SURVIVED_PRELIMINARY n'est pas une validation définitive et ne prédit pas le futur.
- Recherche activement : surajustement, fuite temporelle, biais de sélection, coûts oubliés, faible échantillon, instabilité des paramètres, dépendance à une période et multiplication des essais.
- Ne donne jamais BUY, SELL, prix d'entrée, stop, cible, taille de position ou ordre.
- tradeDecision doit toujours être NO_TRADE_DECISION.

MÉTHODE
1. Examine chaque hypothèse sans présumer qu'elle fonctionne.
2. Explique la manière la plus probable dont elle pourrait échouer.
3. Dresse les biais possibles et les défauts de spécification.
4. Ajoute des tests de stress complémentaires sans supprimer les tests déterministes.
5. Définis des déclencheurs de rejet observables avant l'exécution du test.
6. Identifie les risques communs aux hypothèses, notamment la redondance et la sélection opportuniste.
7. Termine par la prochaine étape factuelle.

Retourne uniquement la structure exigée par le schéma.
`.trim();

function createBacktestAuditorAgent() {
  const storedPromptId = process.env.OPENAI_PROMPT_BACKTEST_AUDITOR_ID?.trim();
  const storedPromptVersion = process.env.OPENAI_PROMPT_BACKTEST_AUDITOR_VERSION?.trim();

  if (storedPromptId) {
    return new Agent({
      name: "Backtest Auditor",
      outputType: BacktestModelOutputSchema,
      prompt: {
        promptId: storedPromptId,
        ...(storedPromptVersion ? { version: storedPromptVersion } : {})
      },
      modelSettings: { store: true }
    });
  }

  return new Agent({
    name: "Backtest Auditor",
    model: process.env.OPENAI_AGENT_MODEL || "gpt-5.1",
    instructions: BACKTEST_AUDITOR_INSTRUCTIONS,
    outputType: BacktestModelOutputSchema,
    modelSettings: {
      reasoning: { effort: "high" as const },
      store: true
    }
  });
}

function defaultReviewSummary(resultVerdict: BacktestHypothesisReview["resultVerdict"]) {
  if (resultVerdict === "NOT_RUN") return "La spécification peut être examinée, mais aucun résultat de backtest versionné n'est disponible.";
  if (resultVerdict === "INSUFFICIENT_EVIDENCE") return "Le dossier fourni ne satisfait pas toutes les exigences minimales de preuve.";
  if (resultVerdict === "REJECTED") return "Les résultats fournis échouent à au moins une porte conservatrice hors échantillon.";
  return "La candidature franchit une porte préliminaire seulement et doit encore subir des contrôles indépendants.";
}

export async function runBacktestAuditor(args: {
  alphaResearch: AlphaResearchOutput;
  envelope: BacktestAuditEnvelope;
}): Promise<BacktestAuditorOutput> {
  if (args.envelope.overallStatus === "BLOCKED" || args.envelope.hypotheses.length === 0) {
    return {
      auditStatus: "BLOCKED",
      summary: "Aucune hypothèse conforme n'est disponible pour l'audit hostile.",
      reviews: [],
      crossHypothesisRisks: [],
      unresolvedRisks: args.envelope.deterministicReasons,
      requiredAuditTrail: args.envelope.requiredAuditTrail,
      nextStep: "Corriger les portes précédentes avant de relancer le Backtest Auditor.",
      specialistsMayProceed: false,
      performanceClaimAllowed: false,
      liveTradingAllowed: false,
      paperOrderAllowed: false,
      tradeDecision: "NO_TRADE_DECISION"
    };
  }

  const agent = createBacktestAuditorAgent();
  const result = await run(agent, JSON.stringify({
    task: "Effectuer un audit hostile des spécifications et des preuves disponibles sans inventer de résultats.",
    alphaResearch: args.alphaResearch,
    auditEnvelope: args.envelope
  }));

  const parsed = BacktestModelOutputSchema.parse(result.finalOutput);
  const modelReviews = new Map(
    parsed.reviews
      .filter((review) => Boolean(args.envelope.hypotheses[review.hypothesisIndex]))
      .map((review) => [args.envelope.hypotheses[review.hypothesisIndex].hypothesisId, review])
  );

  const reviews: BacktestHypothesisReview[] = args.envelope.hypotheses.map((diagnostics) => {
    const modelReview = modelReviews.get(diagnostics.hypothesisId);
    return {
      hypothesisId: diagnostics.hypothesisId,
      title: diagnostics.title,
      specificationVerdict: diagnostics.specificationVerdict,
      resultVerdict: diagnostics.resultVerdict,
      hostileSummary: modelReview?.hostileSummary || defaultReviewSummary(diagnostics.resultVerdict),
      deterministicReasons: diagnostics.deterministicReasons,
      missingRequirements: diagnostics.missingRequirements,
      likelyBiases: modelReview?.likelyBiases.slice(0, 12) || [],
      specificationDefects: modelReview?.specificationDefects.slice(0, 12) || [],
      requiredTestMatrix: Array.from(new Set([
        ...diagnostics.requiredTestMatrix,
        ...(modelReview?.additionalStressTests || [])
      ])).slice(0, 20),
      rejectionTriggers: modelReview?.rejectionTriggers.slice(0, 12) || [],
      evidencePresent: diagnostics.evidencePresent,
      candidateMayAdvance: diagnostics.candidateMayAdvance
    };
  });

  return {
    auditStatus: args.envelope.overallStatus,
    summary: parsed.summary,
    reviews,
    crossHypothesisRisks: parsed.crossHypothesisRisks,
    unresolvedRisks: Array.from(new Set([
      ...args.envelope.deterministicReasons,
      ...parsed.unresolvedRisks
    ])).slice(0, 15),
    requiredAuditTrail: args.envelope.requiredAuditTrail,
    nextStep: args.envelope.specialistsMayProceed
      ? parsed.nextStep
      : args.envelope.overallStatus === "AWAITING_BACKTEST_RESULTS"
        ? "Implémenter les règles dans un moteur de backtest déterministe, exécuter les tests et fournir un dossier de preuve versionné."
        : parsed.nextStep,
    specialistsMayProceed: args.envelope.specialistsMayProceed,
    performanceClaimAllowed: false,
    liveTradingAllowed: false,
    paperOrderAllowed: false,
    tradeDecision: "NO_TRADE_DECISION"
  };
}
