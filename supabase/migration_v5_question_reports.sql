-- ============================================================
-- Reportes de preguntas: los usuarios reportan errores y el admin los revisa
-- Ejecutar en el SQL Editor de Supabase.
-- Todo pasa por funciones SECURITY DEFINER (omiten las RLS).
-- ============================================================

create table if not exists public.question_reports (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  user_email text,
  reason text not null default '',
  message text not null default '',
  status text not null default 'pendiente'
    check (status in ('pendiente', 'resuelta', 'descartada')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- Motivos permitidos (la app ofrece estos + texto libre).
-- respuesta-mala | enunciado-error | opciones-error | explicacion-error | imagen-error | otro

-- 1. Enviar reporte (cualquiera autenticado; sin duplicados pendientes).
create or replace function public.submit_question_report(p_question_id uuid, p_reason text, p_message text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_msg text := trim(coalesce(p_message, ''));
  v_reason text := trim(coalesce(p_reason, 'otro'));
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Sin sesión.';
  end if;
  if not exists (select 1 from public.questions where id = p_question_id) then
    raise exception 'La pregunta no existe.';
  end if;
  if char_length(v_msg) < 3 then
    raise exception 'Cuéntanos brevemente cuál es el problema (mínimo 3 caracteres).';
  end if;
  if exists (
    select 1 from public.question_reports
    where question_id = p_question_id and user_id = auth.uid() and status = 'pendiente'
  ) then
    raise exception 'Ya enviaste un reporte pendiente para esta pregunta.';
  end if;
  select u.email into v_email from auth.users u where u.id = auth.uid();
  insert into public.question_reports (question_id, user_id, user_email, reason, message)
  values (p_question_id, auth.uid(), v_email, v_reason, v_msg);
end;
$$;

-- 2. Listar reportes con contexto (solo admin; pendientes primero).
create or replace function public.admin_list_reports()
returns table (
  id uuid,
  question_id uuid,
  question_number integer,
  exam_id uuid,
  exam_title text,
  area text,
  topic text,
  statement text,
  reporter_email text,
  reason text,
  message text,
  status text,
  created_at timestamptz
)
language sql
security definer
set search_path = public, auth
as $$
  select r.id,
         r.question_id,
         q.numero_original,
         q.exam_id,
         e.nombre,
         q.area,
         q.tema,
         q.enunciado_md,
         coalesce(r.user_email, ''),
         r.reason,
         r.message,
         r.status,
         r.created_at
  from public.question_reports r
  join public.questions q on q.id = r.question_id
  left join public.exams e on e.id = q.exam_id
  where exists (
    select 1 from public.profiles me
    where me.id = auth.uid() and me.role = 'admin'
  )
  order by case r.status when 'pendiente' then 0 else 1 end, r.created_at desc;
$$;

-- 3. Resolver / descartar (solo admin).
create or replace function public.admin_resolve_report(p_report_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'admin') then
    raise exception 'Sin permiso: solo administradores.';
  end if;
  if p_status not in ('resuelta', 'descartada') then
    raise exception 'Estado inválido.';
  end if;
  update public.question_reports
  set status = p_status, resolved_at = now()
  where id = p_report_id;
end;
$$;

alter table public.question_reports enable row level security;
revoke all on table public.question_reports from anon, authenticated;
grant execute on function public.submit_question_report(uuid, text, text) to authenticated;
grant execute on function public.admin_list_reports() to authenticated;
grant execute on function public.admin_resolve_report(uuid, text) to authenticated;
