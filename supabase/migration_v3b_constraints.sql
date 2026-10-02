-- ============================================================
-- Diagnóstico + corrección de constraints (importar / borrar)
-- Ejecutar en el SQL Editor de Supabase.
-- 1) La primera mitad solo MUESTRA el estado actual (no cambia nada).
-- 2) La segunda mitad aplica correcciones idempotentes y seguras.
-- ============================================================

-- ---------- 1. DIAGNÓSTICO (solo lectura) ----------

-- CHECKs y su definición en exams / questions
select c.conname as constraint_name,
       t.relname as table_name,
       pg_get_constraintdef(c.oid) as definition
from pg_constraint c
join pg_class t on t.oid = c.conrelid
where t.relname in ('exams', 'questions')
  and c.contype = 'c'
order by t.relname, c.conname;

-- Columnas NOT NULL en exams / questions
select c.relname as table_name,
       a.attname as column_name
from pg_attribute a
join pg_class c on c.oid = a.attrelid
where c.relname in ('exams', 'questions')
  and a.attnotnull
  and a.attnum > 0
  and not a.attisdropped
order by c.relname, a.attname;

-- Claves foráneas que APUNTAN a exams / questions (bloquean los DELETE → 409)
select c.conname as constraint_name,
       src.relname as from_table,
       pg_get_constraintdef(c.oid) as definition
from pg_constraint c
join pg_class src on src.oid = c.conrelid
join pg_class dst on dst.oid = c.confrelid
where dst.relname in ('exams', 'questions')
  and c.contype = 'f'
order by src.relname, c.conname;

-- Claves foráneas que SALEN de las tablas de duelos (orden de borrado)
select c.conname as constraint_name,
       src.relname as from_table,
       dst.relname as to_table,
       pg_get_constraintdef(c.oid) as definition
from pg_constraint c
join pg_class src on src.oid = c.conrelid
join pg_class dst on dst.oid = c.confrelid
where src.relname in ('room_answers', 'room_participants', 'rooms')
  and c.contype = 'f'
order by src.relname, c.conname;

-- ---------- 2. CORRECCIONES (idempotentes) ----------

-- 2a. exams.periodo debe aceptar NULL (simulacros de institutos, JSON v3)
alter table public.exams alter column periodo drop not null;

-- 2b. exams.tipo debe aceptar 'examen_real' y 'simulacro' (JSON v3 usa
-- 'simulacro' cuando year es null; el CHECK viejo solo admitía 'examen_real'
-- y eso devuelve 400 al importar).
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.exams'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%tipo%'
  loop
    execute format('alter table public.exams drop constraint %I', r.conname);
  end loop;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.exams'::regclass
      and conname = 'exams_tipo_check'
  ) then
    alter table public.exams
      add constraint exams_tipo_check
      check (tipo is null or tipo in ('examen_real', 'simulacro'));
  end if;
end $$;

-- 2c. room_answers.question_id → ON DELETE CASCADE.
-- Sin esto, borrar una pregunta usada en un duelo falla con 409 y, por
-- arrastre, tampoco se puede borrar su examen ni vaciar todo.
do $$
declare r record;
begin
  for r in
    select c.conname from pg_constraint c
    where c.conrelid = 'public.room_answers'::regclass
      and c.contype = 'f'
      and c.confrelid = 'public.questions'::regclass
  loop
    execute format('alter table public.room_answers drop constraint %I', r.conname);
  end loop;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.room_answers'::regclass
      and conname = 'room_answers_question_id_fkey'
  ) then
    alter table public.room_answers
      add constraint room_answers_question_id_fkey
      foreign key (question_id)
      references public.questions (id)
      on delete cascade;
  end if;
end $$;

-- 2d. Duelos que referencian al examen/sala → ON DELETE CASCADE.
-- rooms.exam_id bloquea el borrado del examen; room_participants.room_id y
-- room_answers.room_id bloquearían el borrado de esas salas.
-- (El código también borra en orden explícito; esto es red de seguridad.)
do $$
declare r record;
begin
  -- rooms.exam_id → exams
  for r in
    select c.conname from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.conrelid = 'public.rooms'::regclass
      and c.contype = 'f'
      and c.confrelid = 'public.exams'::regclass
      and a.attname = 'exam_id'
  loop
    execute format('alter table public.rooms drop constraint %I', r.conname);
  end loop;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.rooms'::regclass
      and conname = 'rooms_exam_id_fkey'
  ) then
    alter table public.rooms
      add constraint rooms_exam_id_fkey
      foreign key (exam_id)
      references public.exams (id)
      on delete cascade;
  end if;

  -- room_participants.room_id → rooms
  for r in
    select c.conname from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.conrelid = 'public.room_participants'::regclass
      and c.contype = 'f'
      and c.confrelid = 'public.rooms'::regclass
      and a.attname = 'room_id'
  loop
    execute format('alter table public.room_participants drop constraint %I', r.conname);
  end loop;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.room_participants'::regclass
      and conname = 'room_participants_room_id_fkey'
  ) then
    alter table public.room_participants
      add constraint room_participants_room_id_fkey
      foreign key (room_id)
      references public.rooms (id)
      on delete cascade;
  end if;

  -- room_answers.room_id → rooms
  for r in
    select c.conname from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.conrelid = 'public.room_answers'::regclass
      and c.contype = 'f'
      and c.confrelid = 'public.rooms'::regclass
      and a.attname = 'room_id'
  loop
    execute format('alter table public.room_answers drop constraint %I', r.conname);
  end loop;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.room_answers'::regclass
      and conname = 'room_answers_room_id_fkey'
  ) then
    alter table public.room_answers
      add constraint room_answers_room_id_fkey
      foreign key (room_id)
      references public.rooms (id)
      on delete cascade;
  end if;
end $$;

-- 2e. rooms.host_id → anulable + ON DELETE SET NULL.
-- Si se elimina a un usuario que creó salas de duelo, la sala se conserva
-- para los demás participantes quedando sin anfitrión (la app ya trata
-- host_id nulo como "sin privilegios de anfitrión").
alter table public.rooms alter column host_id drop not null;

do $$
declare r record;
begin
  for r in
    select c.conname from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.conrelid = 'public.rooms'::regclass
      and c.contype = 'f'
      and c.confrelid = 'public.profiles'::regclass
      and a.attname = 'host_id'
  loop
    execute format('alter table public.rooms drop constraint %I', r.conname);
  end loop;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.rooms'::regclass
      and conname = 'rooms_host_id_fkey'
  ) then
    alter table public.rooms
      add constraint rooms_host_id_fkey
      foreign key (host_id)
      references public.profiles (id)
      on delete set null;
  end if;
end $$;
