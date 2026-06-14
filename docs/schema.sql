-- GPT Forex Manager Supabase memory schema
-- Run this file once in Supabase SQL Editor.

create table if not exists public.paper_trades (
  id text primary key,
  user_id text not null default 'default-user',
  pair text not null,
  side text not null check (side in ('BUY', 'SELL')),
  entry numeric not null,
  stop_loss numeric not null,
  take_profit numeric not null,
  confidence numeric not null,
  opened_at timestamptz not null,
  status text not null check (status in ('OPEN', 'CLOSED')),
  exit numeric,
  pnl_cad numeric,
  pips numeric,
  lesson text,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists paper_trades_user_opened_idx
  on public.paper_trades (user_id, opened_at desc);

create table if not exists public.ai_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'default-user',
  pair text not null,
  action text not null check (action in ('BUY', 'SELL', 'HOLD', 'WAIT')),
  confidence numeric not null,
  market_bias text,
  entry numeric,
  stop_loss numeric,
  take_profit numeric,
  risk_score numeric,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_analyses_user_created_idx
  on public.ai_analyses (user_id, created_at desc);

alter table public.paper_trades enable row level security;
alter table public.ai_analyses enable row level security;

-- This app writes through the server using SUPABASE_SERVICE_ROLE_KEY.
-- The service role bypasses RLS. Do not expose that key in frontend code.
