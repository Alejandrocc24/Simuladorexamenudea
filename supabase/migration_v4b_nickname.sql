-- ============================================================
-- Nickname editable por el propio usuario + visible para el admin
-- Ejecutar en el SQL Editor de Supabase.
-- - profiles.nickname: nickname público (duelos, rankings). NULL = sin definir.
-- - profiles.nombre: nombre de registro, no se toca.
-- - update_my_nickname(): valida, evita duplicados y omite las RLS.
-- - admin_user_activity(): ahora también devuelve nickname (solo si la
--   migración v4 ya se aplicó; si no, se omite sin error).
-- ============================================================

-- 1. Columna nickname + unicidad (insensible a mayúsculas).
alter table public.profiles add column if not exists nickname text;

do $$
begin
  if not exists (select 1 from pg_indexes where indexname = 'profiles_nickname_unique') then
    create unique index profiles_nickname_unique
      on public.profiles (lower(nickname)) where nickname is not null;
  end if;
end $$;

-- 2. Guardar mi nickname (cualquiera autenticado, solo el suyo).
create or replace function public.update_my_nickname(p_nickname text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nick text := trim(regexp_replace(coalesce(p_nickname, ''), '\s+', ' ', 'g'));
begin
  if auth.uid() is null then
    raise exception 'Sin sesión.';
  end if;
  if char_length(v_nick) < 3 then
    raise exception 'El nickname debe tener al menos 3 caracteres.';
  end if;
  if char_length(v_nick) > 30 then
    raise exception 'Máximo 30 caracteres.';
  end if;
  if v_nick !~ '^[A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ ._\-]+$' then
    raise exception 'Solo letras, números, espacios, puntos y guiones.';
  end if;
  if exists (
    select 1 from public.profiles
    where id <> auth.uid() and lower(nickname) = lower(v_nick)
  ) then
    raise exception 'Ese nickname ya está en uso. Elige otro.';
  end if;
  insert into public.profiles (id, nombre, email, nickname, role)
  select auth.uid(),
         coalesce(
           nullif(trim(u.raw_user_meta_data->>'displayName'), ''),
           nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
           nullif(trim(split_part(coalesce(u.email, ''), '@', 1)), ''),
           'Aspirante'
         ),
         u.email,
         v_nick,
         'user'
  from auth.users u
  where u.id = auth.uid()
  on conflict (id) do update set nickname = excluded.nickname;
  return v_nick;
exception
  when unique_violation then
    raise exception 'Ese nickname ya está en uso. Elige otro.';
end;
$$;

grant execute on function public.update_my_nickname(text) to authenticated;

-- 3. Actividad del admin con nickname (solo si existe la v4).
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'banned_users') then
    -- Postgres no permite OR REPLACE con distinto tipo de retorno: se recrea.
    drop function if exists public.admin_user_activity();
    create function public.admin_user_activity()
    returns table (
      id uuid,
      email text,
      nombre text,
      nickname text,
      role text,
      profile_created timestamptz,
      user_created timestamptz,
      last_sign_in_at timestamptz,
      is_banned boolean,
      ban_reason text,
      banned_at timestamptz
    )
    language sql
    security definer
    set search_path = public, auth
    as $fn$
      select u.id,
             u.email,
             p.nombre,
             p.nickname,
             p.role,
             p.created_at,
             u.created_at,
             u.last_sign_in_at,
             (b.user_id is not null),
             b.reason,
             b.banned_at
      from auth.users u
      left join public.profiles p on p.id = u.id
      left join public.banned_users b on b.user_id = u.id
      where exists (
        select 1 from public.profiles me
        where me.id = auth.uid() and me.role = 'admin'
      )
      order by u.created_at desc;
    $fn$;
    grant execute on function public.admin_user_activity() to authenticated;
  end if;
end $$;
