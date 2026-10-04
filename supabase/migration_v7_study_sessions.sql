-- ============================================================
-- Sesiones de estudio en curso (retomar práctica/simulacro)
-- Una fila por usuario y modo. Sin localStorage: todo en Supabase.
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  modo text not null check (modo in ('practica', 'simulacro')),
  question_ids jsonb not null default '[]'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  current_index integer not null default 0,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, modo)
);

alter table public.study_sessions enable row level security;

drop policy if exists study_sessions_owner_all on public.study_sessions;
create policy study_sessions_owner_all on public.study_sessions
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
