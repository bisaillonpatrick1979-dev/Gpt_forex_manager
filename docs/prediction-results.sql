-- Add real prediction tracking for GPT Forex Manager.
-- Run this once in Supabase SQL Editor after the first schema.

create table if not exists public.prediction_results (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'default-user',
  analysis_id uuid,
  pair text not null,
  action text not null check (action in ('BUY', 'SELL', 'HOLD', 'WAIT')),
  confidence numeric not null,
  predicted_at timestamptz not null default now(),
  due_at timestamptz not null,
  checked_at timestamptz,
  horizon_minutes integer not null,
  start_price numeric not null,
  end_price numeric,
  pips numeric,
  success boolean,
  status text not null default 'PENDING' check (status in ('PENDING', 'DONE', 'ERROR')),
  payload jsonb not null default '{}'::jsonb,
  result_payload jsonb not null default '{}'::jsonb
);

create index if not exists prediction_results_due_idx
  on public.prediction_results (user_id, status, due_at);

create index if not exists prediction_results_pair_idx
  on public.prediction_results (user_id, pair, predicted_at desc);

alter table public.prediction_results enable row level security;
