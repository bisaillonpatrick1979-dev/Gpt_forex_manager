# GPT Forex Manager — Quant Firm OS

GPT Forex Manager is a controlled quantitative research and paper-trading operating system. It separates market data, research, validation, portfolio construction, risk governance, simulated execution and monitoring.

## Current safety boundary

- Paper trading and research only.
- No real broker connection.
- No agent can execute a real-money order.
- Risk rules remain deterministic application code.
- The Risk Governor keeps an independent veto.
- No strategy is presented as profitable until it passes every validation gate.

## Decision pipeline

1. Data quality
2. Market regime classification
3. Alpha research
4. Hostile backtest validation
5. Portfolio construction
6. Independent risk veto
7. Simulated execution planning
8. Performance monitoring and audit journal

## Active multi-agent sequence

```text
Market data
    ↓
Deterministic data diagnostics
    ↓
Agent 02 — Data Quality Agent
    ↓ ACCEPT / RESTRICT / BLOCK
Deterministic regime diagnostics
    ↓
Agent 03 — Market Regime Agent
    ↓ USABLE / RESTRICTED / BLOCKED
Deterministic research envelope
    ↓
Agent 04 — Alpha Research Agent
    ↓ SPECIFICATION_ONLY hypotheses
Deterministic backtest audit gate
    ↓
Agent 05 — Backtest Auditor
    ↓ AWAITING / REJECTED / PRELIMINARY SURVIVOR
Agent 01 — Quantitative Director
```

The gates are sequential. A blocking result prevents downstream research. Alpha hypotheses cannot move directly to portfolio construction, risk approval or simulated execution.

## Agent 01 — Quantitative Director

The Quantitative Director is available at `/directeur`.

It can:

- turn completed research into a governance decision;
- apply data-quality, market-regime, alpha-research and backtest-audit restrictions;
- separate observed facts, hypotheses, actual evidence and missing evidence;
- request portfolio, risk and journal only when the Backtest Auditor permits progression;
- return typed, validated output.

It cannot:

- emit BUY or SELL;
- choose an entry, stop, target or position size;
- execute a real or paper order;
- override deterministic gates;
- treat a preliminary candidate as proof of future profitability;
- send an unvalidated hypothesis to execution.

Instructions: `docs/agents/01-directeur-quantitatif.md`.

## Agent 02 — Data Quality Agent

The Data Quality Agent combines deterministic checks with a constrained OpenAI agent explanation.

It checks:

- candle count and numerical validity;
- OHLC consistency;
- duplicate and non-monotonic timestamps;
- missing intervals;
- data freshness;
- extreme bar-to-bar returns;
- source provenance;
- synthetic versus historical versus live/delayed classification.

Its deterministic decision is one of `ACCEPT`, `RESTRICT`, or `BLOCK`. Model output cannot upgrade or bypass that decision.

Instructions: `docs/agents/02-data-quality.md`.

## Agent 03 — Market Regime Agent

The Market Regime Agent interprets a regime classification calculated by application code.

It receives:

- fast and slow moving averages;
- moving-average spread in basis points;
- normalized price slope;
- directional efficiency and consistency;
- recent and baseline volatility;
- volatility ratio;
- average true range;
- position inside the recent range;
- restrictions inherited from Agent 02.

The primary regime is one of `TREND_UP`, `TREND_DOWN`, `RANGE`, `HIGH_VOLATILITY`, `LOW_VOLATILITY`, `TRANSITIONAL`, or `BLOCKED_BY_DATA`. The model cannot replace this classification.

Economic announcements, crises, news, spreads and real liquidity are not inferred from candle data alone. Event risk remains `UNKNOWN_REQUIRES_EXTERNAL_CALENDAR` until a reliable timestamped economic calendar is connected.

Instructions: `docs/agents/03-market-regime.md`.

## Agent 04 — Alpha Research Agent

The Alpha Research Agent creates at most three falsifiable research specifications from the strategy families authorized by Agent 03.

The deterministic research envelope imposes:

- three hypotheses maximum;
- six free parameters maximum per hypothesis;
- at least 30% strictly out-of-sample data;
- chronological train, validation and test separation;
- walk-forward validation;
- realistic transaction costs, spread and slippage;
- parameter-sensitivity and sub-period stability tests;
- correction for multiple testing and selection bias;
- at least 50 simulated trades before evaluation;
- mandatory independent review by the Backtest Auditor.

Every retained hypothesis remains `SPECIFICATION_ONLY`. Insufficient or synthetic data may be used to test the workflow, but never to claim performance.

Instructions: `docs/agents/04-alpha-research.md`.

## Agent 05 — Backtest Auditor

The Backtest Auditor is an adversarial reviewer. It audits each hypothesis specification, checks the completeness of any supplied backtest evidence and tries to identify why the apparent result may be false.

It checks:

- missing entry, exit or invalidation rules;
- explicit lookahead or future-information language;
- insufficient observations or simulated trades;
- inadequate out-of-sample allocation;
- missing chronological split or walk-forward tests;
- omitted costs, spread or slippage;
- excessive parameters;
- missing multiple-testing correction;
- instability, drawdown and weak out-of-sample evidence;
- missing version, timestamp and data/code hash.

Without a versioned evidence dossier, the result remains `AWAITING_BACKTEST_RESULTS`. The model cannot invent returns, Sharpe, drawdown or trade counts.

A dossier that passes the conservative structural and numerical gates receives only `CANDIDATE_SURVIVED_PRELIMINARY`. This does not prove a durable edge or future return.

Instructions: `docs/agents/05-backtest-auditor.md`.

## OpenAI stored prompts

All five implemented agents work immediately from code instructions when `OPENAI_API_KEY` is configured. Versioned prompts created in OpenAI Platform can replace the code instructions without changing the API routes.

```env
OPENAI_PROMPT_MASTER_ID=pmpt_...
OPENAI_PROMPT_MASTER_VERSION=
OPENAI_PROMPT_DATA_QUALITY_ID=pmpt_...
OPENAI_PROMPT_DATA_QUALITY_VERSION=
OPENAI_PROMPT_MARKET_REGIME_ID=pmpt_...
OPENAI_PROMPT_MARKET_REGIME_VERSION=
OPENAI_PROMPT_ALPHA_RESEARCH_ID=pmpt_...
OPENAI_PROMPT_ALPHA_RESEARCH_VERSION=
OPENAI_PROMPT_BACKTEST_AUDITOR_ID=pmpt_...
OPENAI_PROMPT_BACKTEST_AUDITOR_VERSION=
OPENAI_PROMPT_PORTFOLIO_ID=
OPENAI_PROMPT_RISK_ID=
OPENAI_PROMPT_EXECUTION_ID=
OPENAI_PROMPT_MONITORING_ID=
OPENAI_PROMPT_JOURNAL_ID=
```

Prompt identifier values remain server-side and are never returned to the browser.

## Core Vercel variables

```env
OPENAI_API_KEY=sk-your-openai-key
OPENAI_AGENT_MODEL=gpt-5.1
ALPHA_VANTAGE_API_KEY=your-alpha-vantage-key

NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
APP_USER_ID=patrick-main
```

`OPENAI_MODEL` is still used by the older temporary analysis endpoint. `OPENAI_AGENT_MODEL` is reserved for the Agents SDK workflow.

## Supabase setup

1. Open Supabase.
2. Go to SQL Editor.
3. Paste and run `supabase/schema.sql`.
4. Add the variables above in Vercel.
5. Redeploy.

## Risk policy in this phase

- Maximum planned risk per paper trade: 0.5%
- Maximum paper daily loss: 2%
- Maximum portfolio drawdown threshold: 8%
- Maximum open positions: 4
- Maximum exposure per currency pair: 20%
- Maximum simulated leverage: 3x
- Stop loss required for every paper plan
- Real broker access disabled

## Existing data and analysis services

- Supabase historical candles when available
- Alpha Vantage Forex data when configured
- Frankfurter real spot fallback with simulated candles
- Local demo candle fallback
- Deterministic market-data diagnostics
- Deterministic market-regime diagnostics
- Deterministic alpha-research envelope
- Deterministic backtest audit gate
- OpenAI Agents SDK Data Quality Agent
- OpenAI Agents SDK Market Regime Agent
- OpenAI Agents SDK Alpha Research Agent
- OpenAI Agents SDK Backtest Auditor
- OpenAI Agents SDK Quantitative Director
- Existing temporary OpenAI analysis endpoint with a deterministic local fallback
- Local browser journal for paper-plan drafts

## Run locally

```bash
npm install
npm run typecheck
npm run dev
```

## Important limitation

A visually convincing interface is not evidence of an edge. Strategy performance must be established through reproducible out-of-sample tests, walk-forward validation, realistic costs, stress tests and live paper trading before any separate real-money phase is considered.
