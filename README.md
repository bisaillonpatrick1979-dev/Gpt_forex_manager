# GPT Forex Manager

AI-assisted Forex paper trading dashboard for Vercel.

## Safety

This project is for education and simulation only. It does not execute real-money trades and does not provide financial advice.

## Vercel variables

Add these environment variables:

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

## Features

- Alpha Vantage Forex data with demo fallback
- OpenAI analysis endpoint with safe local fallback
- AI-style specialist panel
- Candlestick dashboard
- Paper trading journal
- Supabase cloud memory for trades and AI analyses
- localStorage fallback when Supabase is not configured
- CAD fictive profit/loss display

## Run

```bash
npm install
npm run dev
```
