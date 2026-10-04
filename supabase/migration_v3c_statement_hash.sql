-- Detección de duplicados al importar (JSON v3+).
-- statement_hash: hash del enunciado normalizado (lo calcula la app).
-- duplicada_de: referencia legible ("Q12 · Examen 2024-1") cuando entra a
-- revisión como posible duplicada. Se limpia al publicar.
-- Ejecutar en el SQL Editor de Supabase.

alter table public.questions
  add column if not exists statement_hash text,
  add column if not exists duplicada_de text;

create index if not exists questions_statement_hash_idx
  on public.questions (statement_hash);
