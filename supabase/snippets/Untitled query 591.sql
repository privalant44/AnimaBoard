-- Journal des exécutions du batch quotidien (cron + lancement manuel)

create table if not exists public.batch_sync_logs (
  id bigserial primary key,
  run_date date not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  duration_ms integer,
  success boolean not null default false,
  trigger_source text not null default 'cron',
  triggered_by text,
  steps jsonb not null default '[]',
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_batch_sync_logs_run_date on public.batch_sync_logs (run_date desc);
create index if not exists idx_batch_sync_logs_started_at on public.batch_sync_logs (started_at desc);
