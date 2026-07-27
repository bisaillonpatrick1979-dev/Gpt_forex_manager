export type FirmModule = {
  id: string;
  name: string;
  mission: string;
  gate: string;
};

export type AgentDefinition = {
  key: string;
  name: string;
  role: string;
  responsibility: string;
  connectionEnvVar: string;
  mayExecuteOrders: boolean;
};

export const firmModules: FirmModule[] = [
  {
    id: "data",
    name: "Qualité des données",
    mission: "Valider les prix, les fuseaux horaires, les trous de données et les sources avant toute analyse.",
    gate: "Bloque la recherche quand les données sont incomplètes ou incohérentes."
  },
  {
    id: "regime",
    name: "Régime de marché",
    mission: "Classer tendance, volatilité, liquidité et risque événementiel.",
    gate: "Autorise seulement les stratégies compatibles avec le régime détecté."
  },
  {
    id: "research",
    name: "Recherche alpha",
    mission: "Proposer des hypothèses testables, simples et explicables.",
    gate: "Aucune stratégie n'avance sans hypothèse écrite avant le backtest."
  },
  {
    id: "validation",
    name: "Validation hostile",
    mission: "Rechercher le sur-ajustement, les fuites de données et les coûts oubliés.",
    gate: "Exige hors-échantillon, walk-forward, stress tests et simulation temps réel."
  },
  {
    id: "portfolio",
    name: "Portefeuille",
    mission: "Combiner les stratégies selon leur risque, leur corrélation et leur capacité.",
    gate: "Empêche plusieurs stratégies de créer la même exposition cachée."
  },
  {
    id: "risk",
    name: "Gouvernance du risque",
    mission: "Imposer les limites de perte, d'exposition, de levier et les arrêts d'urgence.",
    gate: "Possède un droit de veto indépendant de tous les agents de recherche."
  },
  {
    id: "execution",
    name: "Exécution",
    mission: "Transformer une décision autorisée en ordre simulé traçable.",
    gate: "Aucun accès à un courtier réel dans cette phase."
  },
  {
    id: "monitoring",
    name: "Surveillance",
    mission: "Comparer backtest, paper trading et comportement récent.",
    gate: "Met une stratégie en quarantaine quand elle sort de ses limites prévues."
  }
];

export const agentCatalog: AgentDefinition[] = [
  {
    key: "master",
    name: "Directeur quantitatif",
    role: "Agent principal",
    responsibility: "Transformer le mandat en plan de recherche, sélectionner les spécialistes et synthétiser leurs rapports sans émettre d’ordre.",
    connectionEnvVar: "OPENAI_PROMPT_MASTER_ID",
    mayExecuteOrders: false
  },
  {
    key: "data-quality",
    name: "Data Quality Agent",
    role: "Données",
    responsibility: "Contrôler la fraîcheur, les trous, les anomalies et la provenance des données.",
    connectionEnvVar: "OPENAI_PROMPT_DATA_QUALITY_ID",
    mayExecuteOrders: false
  },
  {
    key: "market-regime",
    name: "Market Regime Agent",
    role: "Contexte",
    responsibility: "Classifier le régime et déterminer quelles familles de stratégies sont admissibles.",
    connectionEnvVar: "OPENAI_PROMPT_MARKET_REGIME_ID",
    mayExecuteOrders: false
  },
  {
    key: "alpha-research",
    name: "Alpha Research Agent",
    role: "Recherche",
    responsibility: "Proposer des hypothèses et des règles de stratégie mesurables.",
    connectionEnvVar: "OPENAI_PROMPT_ALPHA_RESEARCH_ID",
    mayExecuteOrders: false
  },
  {
    key: "backtest-auditor",
    name: "Backtest Auditor",
    role: "Validation",
    responsibility: "Tenter de réfuter chaque stratégie et vérifier les biais de backtest.",
    connectionEnvVar: "OPENAI_PROMPT_BACKTEST_AUDITOR_ID",
    mayExecuteOrders: false
  },
  {
    key: "portfolio",
    name: "Portfolio Allocator",
    role: "Portefeuille",
    responsibility: "Calculer les allocations et limiter les corrélations et expositions communes.",
    connectionEnvVar: "OPENAI_PROMPT_PORTFOLIO_ID",
    mayExecuteOrders: false
  },
  {
    key: "risk",
    name: "Risk Governor",
    role: "Veto",
    responsibility: "Appliquer les limites déterministes et refuser toute proposition non conforme.",
    connectionEnvVar: "OPENAI_PROMPT_RISK_ID",
    mayExecuteOrders: false
  },
  {
    key: "execution",
    name: "Execution Planner",
    role: "Ordres simulés",
    responsibility: "Préparer le type d’ordre simulé, le prix limite, l’expiration et le contrôle du spread.",
    connectionEnvVar: "OPENAI_PROMPT_EXECUTION_ID",
    mayExecuteOrders: false
  },
  {
    key: "monitoring",
    name: "Performance Monitor",
    role: "Surveillance",
    responsibility: "Détecter la dérive, le slippage anormal et la dégradation des stratégies.",
    connectionEnvVar: "OPENAI_PROMPT_MONITORING_ID",
    mayExecuteOrders: false
  },
  {
    key: "journal",
    name: "Compliance Journal",
    role: "Audit",
    responsibility: "Conserver les versions, décisions, refus, données utilisées et résultats.",
    connectionEnvVar: "OPENAI_PROMPT_JOURNAL_ID",
    mayExecuteOrders: false
  }
];

export const riskPolicy = {
  mode: "paper-only" as const,
  baseCurrency: "CAD" as const,
  maxRiskPerTradePercent: 0.5,
  maxDailyLossPercent: 2,
  maxPortfolioDrawdownPercent: 8,
  maxOpenPositions: 4,
  maxPairExposurePercent: 20,
  maxLeverage: 3,
  requireStopLoss: true,
  requireRiskVeto: true,
  realBrokerEnabled: false
};
