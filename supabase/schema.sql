-- Clasament pentru "Mai mare sau mai mic".
-- Ruleaza o singura data in Supabase -> SQL Editor.

create table if not exists public.scores (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  mode        text    not null check (mode in ('classic', 'timed', 'pro', 'calib')),
  name        text    not null check (char_length(name) between 1 and 20),
  score       integer not null check (score between -4500 and 6000),
  answered    integer not null check (answered between 0 and 3000),
  correct     integer not null check (correct between 0 and answered)
);

create index if not exists scores_mode_score on public.scores (mode, score desc, created_at);

-- Cheia "anon" e publica (sta in config.js), deci accesul e limitat prin RLS:
-- oricine poate citi si adauga scoruri, nimeni nu poate modifica sau sterge.
alter table public.scores enable row level security;

drop policy if exists "scores: citire publica" on public.scores;
create policy "scores: citire publica" on public.scores
  for select to anon using (true);

drop policy if exists "scores: inserare publica" on public.scores;
create policy "scores: inserare publica" on public.scores
  for insert to anon with check (true);
