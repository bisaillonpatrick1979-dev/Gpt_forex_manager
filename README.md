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
Deterministic diagnostics
    ↓
Agent 02 — Data Quality Agent
    ↓ ACCEPT / RESTRICT / BLOCK
Agent 01 — Quantitative Director
    ↓
Next specialists selected by the mandate
```

The Data Quality Agent always runs before the Quantitative Director. A `BLOCK` result prevents the Director from requesting any additional specialist.

## Agent 01 — Quantitative Director

The Quantitative Director is available at `/directeur`.

It can:

- turn a research request into a measurable mandate;
- apply the mandatory Data Quality Agent verdict;
- separate observed facts, hypotheses and unknowns;
- select the specialist agents needed for the next phase;
- return typed, validated output.

It cannot:

- emit BUY or SELL;
- choose an entry, stop, target or position size;
- execute a real or paper order;
- override data quality or deterministic risk controls;
- promise returns or claim that an unvalidated strategy beats the market.

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

## OpenAI stored prompts

Both implemented agents work immediately from code instructions when `OPENAI_API_KEY` is configured. Versioned prompts created in OpenAI Platform can replace the code instructions without changing the API routes.

```env
OPENAI_PROMPT_MASTER_ID=pmpt_...
OPENAI_PROMPT_MASTER_VERSION=
OPENAI_PROMPT_DATA_QUALITY_ID=pmpt_...
OPENAI_PROMPT_DATA_QUALITY_VERSION=
OPENAI_PROMPT_MARKET_REGIME_ID=
OPENAI_PROMPT_ALPHA_RESEARCH_ID=
OPENAI_PROMPT_BACKTEST_AUDITOR_ID=
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
- OpenAI Agents SDK Data Quality Agent
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

A visually convincing interface is not evidence of an edge. Strategy performance must be established through out-of-sample tests, walk-forward validation, realistic costs, stress tests and live paper trading before any separate real-money phase is considered.
