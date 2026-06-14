export type Candle = { time: string; open: number; high: number; low: number; close: number };

export type MarketResponse = {
  pair: string;
  from: string;
  to: string;
  interval: string;
  price: number;
  candles: Candle[];
  source: "alpha-vantage" | "demo";
  warning?: string;
  updatedAt: string;
};

export type AgentOpinion = {
  name: string;
  vote: "BUY" | "SELL" | "HOLD" | "WAIT";
  confidence: number;
  note: string;
};

export type AiAnalysis = {
  pair: string;
  action: "BUY" | "SELL" | "HOLD" | "WAIT";
  confidence: number;
  marketBias: string;
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  riskScore: number;
  maxRiskPercent: number;
  agents: AgentOpinion[];
  reasons: string[];
  risks: string[];
  learningPlan: string[];
  finalDecision: string;
};
