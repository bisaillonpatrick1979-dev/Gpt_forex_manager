# GPT Forex Manager — Quant Firm OS

GPT Forex Manager is being transformed from a demonstration dashboard into a controlled quantitative research and paper-trading operating system.

## Current safety boundary

- Paper trading and research only.
- No real broker connection.
- No agent can execute a real-money order.
- Risk rules remain deterministic application code.
- The Risk Governor will keep an independent veto.
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

## OpenAI multi-agent plan

The application uses a manager-with-specialists architecture. Agents will be created one at a time in OpenAI Platform and connected server-side afterward.

Planned connection slots:

```env
OPENAI_AGENT_MASTER_ID=
OPENAI_AGENT_DATA_QUALITY_ID=
OPENAI_AGENT_MARKET_REGIME_ID=
OPENAI_AGENT_ALPHA_RESEARCH_ID=
OPENAI_AGENT_BACKTEST_AUDITOR_ID=
OPENAI_AGENT_PORTFOLIO_ID=
OPENAI_AGENT_RISK_ID=
OPENAI_AGENT_EXECUTION_ID=
OPENAI_AGENT_MONITORING_ID=
OPENAI_AGENT_JOURNAL_ID=
```

These names are application configuration slots. The application never returns the configured identifier values to the browser.

## Core Vercel variables

```env
OPENAI_API_KEY=sk-your-openai-key
OPENAI_MODEL=gpt-4.1-mini
ALPHA_VANTAGE_API_KEY=your-alpha-vantage-key

NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
APP_USER_ID=patrick-main
```

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
- Existing OpenAI analysis endpoint with a deterministic local fallback
- Local browser journal for paper-plan drafts

## Run locally

```bash
npm install
npm run typecheck
npm run dev
```

## Important limitation

A visually convincing interface is not evidence of an edge. Strategy performance must be established through out-of-sample tests, walk-forward validation, realistic costs, stress tests and live paper trading before any separate real-money phase is considered.
