-- Migración JSON v3: category + confidence + difficulty + sharedTexts
-- Ejecutar en el SQL Editor de Supabase (proyecto simulacros-udea).
-- Es idempotente: puede correrse varias veces sin error.

-- 1. Campos nuevos por pregunta (JSON v3)
alter table public.questions
  add column if not exists category text,
  add column if not exists confidence text
    check (confidence is null or confidence in ('high', 'medium', 'low')),
  add column if not exists difficulty text not null default 'medium'
    check (difficulty in ('easy', 'medium', 'hard'));

-- 2. Textos de lectura compartidos por examen (JSON v3)
-- Estructura: [{ id, title, text, appliesToQuestions: [16, 17] }]
alter table public.exams
  add column if not exists shared_texts jsonb not null default '[]'::jsonb;

-- 3. Simulacros de institutos: year/semester pueden ser null.
-- El `periodo` ya es nullable; solo se documenta el convenio:
--   periodo = '2024-1' | '2024' | null
--   tipo    = 'examen_real' | 'simulacro' (simulacro cuando year is null)
-- Sin cambios de esquema necesarios.
