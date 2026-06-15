-- Historical market candles for GPT Forex Manager.
-- Run this once in Supabase SQL Editor.

create table if not exists public.market_candles (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'default-user',
  pair text not null,
  interval text not null default '1min',
  source text not null default 'csv-import',
  candle_time timestamptz not null,
  open numeric not null,
  high numeric not null,
  low numeric not null,
  close numeric not null,
  volume numeric,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(user_id, pair, interval, candle_time)
);

create index if not exists market_candles_pair_time_idx
  on public.market_candles (user_id, pair, interval, candle_time desc);

alter table public.market_candles enable row level security;
