# GPT Forex Manager

AI-assisted Forex paper trading dashboard for Vercel.

## Safety

This project is for education and simulation only. It does not execute real-money trades and does not provide financial advice.

## Vercel variables

Add these environment variables:

- OPENAI_API_KEY
- OPENAI_MODEL, example: gpt-4.1-mini
- ALPHA_VANTAGE_API_KEY

## Features

- Alpha Vantage Forex data with demo fallback
- OpenAI analysis endpoint with safe local fallback
- AI-style specialist panel
- Candlestick dashboard
- Paper trading journal in localStorage
- CAD fictive profit/loss display

## Run

```bash
npm install
npm run dev
```
