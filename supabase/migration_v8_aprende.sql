-- Migración Supabase v8: sección "Aprende" (lecciones y ejercicios independientes)
-- Ejecutar en el SQL Editor de Supabase.
-- Todas las tablas tienen RLS habilitado para que cada usuario solo vea/edite su progreso.
-- Las lecciones y ejercicios son públicas (lectura para cualquier usuario autenticado);
-- solo un administrador puede insertar/actualizar/borrar.

-- 1. Lecciones de Aprende (contenido importado desde JSON v3 de convertir.py)
create table if not exists public.aprende_lecciones (
  id text primary key,
  modulo text not null,
  titulo text not null,
  alcance text,
  requisitos text[] not null default '{}',
  json_completo jsonb not null default '{}'::jsonb,
  creado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now()
);

-- 2. Ejercicios de Aprende (independientes de questions/exams del simulador)
create table if not exists public.aprende_ejercicios (
  id text primary key, -- formato: tema-nivel-numero (ej. 16-1-01)
  tema text not null,
  nivel integer not null default 1,
  enunciado text not null,
  descripcion text,
  svg text,
  opciones jsonb not null default '[]'::jsonb,
  correcta text,
  pista text,
  explicacion jsonb not null default '[]'::jsonb,
  errores jsonb not null default '{}'::jsonb,
  tip text,
  comprobacion text,
  leccion_id text references public.aprende_lecciones(id) on delete set null,
  verificado boolean not null default false
);

-- 3. Progreso de usuario por ejercicio (paridad con study_sessions de simulacros)
create table if not exists public.aprende_progreso (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ejercicio_id text not null references public.aprende_ejercicios(id) on delete cascade,
  estado text not null check (estado in ('correcto','incorrecto','omitido')),
  intentos integer not null default 1,
  ultimo_intento_en timestamptz not null default now(),
  unique (user_id, ejercicio_id)
);

-- 4. Row Level Security
alter table public.aprende_lecciones enable row level security;
alter table public.aprende_ejercicios enable row level security;
alter table public.aprende_progreso enable row level security;

-- Lectura pública para usuarios autenticados
drop policy if exists aprende_lecciones_select on public.aprende_lecciones;
create policy aprende_lecciones_select on public.aprende_lecciones
  for select to authenticated using (true);

drop policy if exists aprende_ejercicios_select on public.aprende_ejercicios;
create policy aprende_ejercicios_select on public.aprende_ejercicios
  for select to authenticated using (true);

drop policy if exists aprende_progreso_select on public.aprende_progreso;
create policy aprende_progreso_select on public.aprende_progreso
  for select to authenticated using (auth.uid() = user_id);

-- Inserción/actualización/borrado de progreso solo por el propietario
drop policy if exists aprende_progreso_insert on public.aprende_progreso;
create policy aprende_progreso_insert on public.aprende_progreso
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists aprende_progreso_update on public.aprende_progreso;
create policy aprende_progreso_update on public.aprende_progreso
  for update to authenticated using (auth.uid() = user_id);

drop policy if exists aprende_progreso_delete on public.aprende_progreso;
create policy aprende_progreso_delete on public.aprende_progreso
  for delete to authenticated using (auth.uid() = user_id);

-- Escritura de lecciones y ejercicios solo para administradores (role = 'admin' en profiles)
drop policy if exists aprende_lecciones_admin on public.aprende_lecciones;
create policy aprende_lecciones_admin on public.aprende_lecciones
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists aprende_ejercicios_admin on public.aprende_ejercicios;
create policy aprende_ejercicios_admin on public.aprende_ejercicios
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
