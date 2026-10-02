-- ============================================================
-- Reparación de duelos 1v1: crear sala funciona, pero unirse/iniciar no.
-- Causas: faltan las funciones RPC, columnas de apoyo, políticas RLS y
-- el realtime. Todo defensivo (IF NOT EXISTS): seguro de correr.
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

-- ---------- 1. Columnas de apoyo (solo si faltan) ----------
alter table public.rooms add column if not exists codigo text;
alter table public.rooms add column if not exists host_id uuid;
alter table public.rooms add column if not exists estado text default 'esperando';
alter table public.rooms add column if not exists question_ids jsonb default '[]'::jsonb;
alter table public.rooms add column if not exists exam_id uuid;
alter table public.rooms add column if not exists max_participants integer default 15;
alter table public.rooms add column if not exists created_at timestamptz default now();

alter table public.room_participants add column if not exists id uuid default gen_random_uuid();
alter table public.room_participants add column if not exists room_id uuid;
alter table public.room_participants add column if not exists user_id uuid;
alter table public.room_participants add column if not exists puntaje integer default 0;
alter table public.room_participants add column if not exists joined_at timestamptz default now();

alter table public.room_answers add column if not exists id uuid default gen_random_uuid();
alter table public.room_answers add column if not exists room_id uuid;
alter table public.room_answers add column if not exists question_id uuid;
alter table public.room_answers add column if not exists user_id uuid;
alter table public.room_answers add column if not exists respuesta text;
alter table public.room_answers add column if not exists correcta boolean default false;
alter table public.room_answers add column if not exists created_at timestamptz default now();

-- ---------- 2. RLS: acceso total para logueados (los duelos lo exigen:
-- cada jugador lee/escribe filas de los demás en la misma sala) ----------
alter table public.rooms enable row level security;
alter table public.room_participants enable row level security;
alter table public.room_answers enable row level security;

drop policy if exists rooms_all_authenticated on public.rooms;
create policy rooms_all_authenticated on public.rooms
  for all to authenticated using (true) with check (true);

drop policy if exists room_participants_all_authenticated on public.room_participants;
create policy room_participants_all_authenticated on public.room_participants
  for all to authenticated using (true) with check (true);

drop policy if exists room_answers_all_authenticated on public.room_answers;
create policy room_answers_all_authenticated on public.room_answers
  for all to authenticated using (true) with check (true);

-- ---------- 3. Realtime (sin esto el anfitrión nunca ve entrar a nadie) ----------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'rooms') then
    execute 'alter publication supabase_realtime add table public.rooms';
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'room_participants') then
    execute 'alter publication supabase_realtime add table public.room_participants';
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'room_answers') then
    execute 'alter publication supabase_realtime add table public.room_answers';
  end if;
end $$;

-- ---------- 4. Funciones RPC del duelo ----------
-- (DROP previo por introspección: Postgres no permite OR REPLACE con
-- distinto retorno, y la existente puede tener otra firma.)
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('join_room', 'start_room', 'finish_room', 'leave_room')
  loop
    execute format('drop function if exists %s', r.sig);
  end loop;
end $$;

create or replace function public.join_room(p_code text, p_user_id uuid)
returns table (ok boolean, message text, room_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room uuid;
  v_estado text;
  v_max integer;
  v_count integer;
begin
  select r.id, r.estado, coalesce(r.max_participants, 15)
    into v_room, v_estado, v_max
  from public.rooms r
  where r.codigo = upper(trim(p_code))
  order by r.created_at desc
  limit 1;

  if v_room is null then
    return query select false, 'NO_ENCONTRADA', null::uuid;
    return;
  end if;
  if v_estado <> 'esperando' then
    return query select false, 'SALA_NO_DISPONIBLE', null::uuid;
    return;
  end if;
  if exists (select 1 from public.room_participants where room_id = v_room and user_id = p_user_id) then
    return query select true, 'YA_DENTRO', v_room;
    return;
  end if;
  select count(*) into v_count from public.room_participants where room_id = v_room;
  if v_count >= v_max then
    return query select false, 'SALA_LLENA', null::uuid;
    return;
  end if;
  insert into public.room_participants (room_id, user_id, puntaje)
  values (v_room, p_user_id, 0);
  return query select true, 'OK', v_room;
end;
$$;

create or replace function public.start_room(p_room_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host uuid;
  v_estado text;
  v_count integer;
begin
  select r.host_id, r.estado into v_host, v_estado
  from public.rooms r where r.id = p_room_id;
  if v_host is null or v_host <> p_user_id then
    raise exception 'SOLO_HOST';
  end if;
  if v_estado <> 'esperando' then
    raise exception 'SALA_NO_DISPONIBLE';
  end if;
  select count(*) into v_count from public.room_participants where room_id = p_room_id;
  if v_count < 2 then
    raise exception 'MINIMO_2_JUGADORES';
  end if;
  update public.rooms set estado = 'en_curso' where id = p_room_id;
end;
$$;

create or replace function public.finish_room(p_room_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.rooms set estado = 'finalizada'
  where id = p_room_id and estado <> 'finalizada';
$$;

create or replace function public.leave_room(p_room_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host uuid;
  v_nuevo_host uuid;
begin
  delete from public.room_answers where room_id = p_room_id and user_id = p_user_id;
  delete from public.room_participants where room_id = p_room_id and user_id = p_user_id;

  if not exists (select 1 from public.room_participants where room_id = p_room_id) then
    update public.rooms set estado = 'finalizada' where id = p_room_id;
    return;
  end if;

  -- Si se fue el anfitrión, asciende al participante más antiguo.
  select r.host_id into v_host from public.rooms r where r.id = p_room_id;
  if v_host = p_user_id then
    select rp.user_id into v_nuevo_host
    from public.room_participants rp
    where rp.room_id = p_room_id
    order by rp.joined_at nulls last
    limit 1;
    update public.rooms set host_id = v_nuevo_host where id = p_room_id;
  end if;
end;
$$;

grant execute on function public.join_room(text, uuid) to authenticated;
grant execute on function public.start_room(uuid, uuid) to authenticated;
grant execute on function public.finish_room(uuid) to authenticated;
grant execute on function public.leave_room(uuid, uuid) to authenticated;

-- ---------- 5. Limpieza: salas atoradas (como la en_curso del 11-sep) ----------
update public.rooms set estado = 'finalizada'
where estado = 'en_curso' and created_at < now() - interval '3 hours';

update public.rooms set estado = 'finalizada'
where estado = 'esperando' and created_at < now() - interval '2 hours';
