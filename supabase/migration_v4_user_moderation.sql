-- ============================================================
-- Moderación de usuarios: última conexión, veto y borrado
-- Ejecutar en el SQL Editor de Supabase.
-- Todo el acceso pasa por funciones SECURITY DEFINER que verifican
-- que quien llama sea admin (profiles.role = 'admin').
-- ============================================================

-- 1. Lista de veto. Si el usuario se borra de auth.users, su veto se va en cascada.
create table if not exists public.banned_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  reason text not null default '',
  banned_at timestamptz not null default now(),
  banned_by uuid
);

-- 2. Actividad de todos los usuarios (solo admin).
-- Incluye última conexión real (auth.users.last_sign_in_at) y estado de veto.
create or replace function public.admin_user_activity()
returns table (
  id uuid,
  email text,
  nombre text,
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
as $$
  select u.id,
         u.email,
         p.nombre,
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
$$;

-- 3. ¿Estoy vetado? (lo llama la app al iniciar sesión para bloquear el ingreso)
create or replace function public.am_i_banned()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from public.banned_users where user_id = auth.uid());
$$;

-- 4. Vetar (solo admin; nunca a otro admin ni a sí mismo).
create or replace function public.admin_ban_user(p_user_id uuid, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
begin
  if not exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'admin') then
    raise exception 'Sin permiso: solo administradores.';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'No puedes vetarte a ti mismo.';
  end if;
  if exists (select 1 from public.profiles p where p.id = p_user_id and p.role = 'admin') then
    raise exception 'No se puede vetar a un administrador (degrádalo primero).';
  end if;
  select u.email into v_email from auth.users u where u.id = p_user_id;
  insert into public.banned_users (user_id, email, reason, banned_by)
  values (p_user_id, v_email, nullif(trim(coalesce(p_reason, '')), ''), auth.uid())
  on conflict (user_id) do update
    set reason = excluded.reason, banned_at = now(), banned_by = excluded.banned_by;
end;
$$;

-- 5. Quitar veto (solo admin).
create or replace function public.admin_unban_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'admin') then
    raise exception 'Sin permiso: solo administradores.';
  end if;
  delete from public.banned_users where user_id = p_user_id;
end;
$$;

-- 6. Borrar datos del usuario: intentos, respuestas y participaciones de
-- duelos, y su fila de profiles (solo admin).
-- NOTA: la cuenta de auth.users NO se borra desde aquí (requiere service_role):
-- para eliminarla del todo usa Dashboard → Authentication → Users.
-- Si además agregas el veto (la app lo hace al "Eliminar"), no podrá reingresar.
create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'admin') then
    raise exception 'Sin permiso: solo administradores.';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'No puedes eliminar tu propia cuenta.';
  end if;
  if exists (select 1 from public.profiles p where p.id = p_user_id and p.role = 'admin') then
    raise exception 'No se puede eliminar a un administrador (degrádalo primero).';
  end if;
  delete from public.attempts where user_id = p_user_id;
  delete from public.room_answers where user_id = p_user_id;
  delete from public.room_participants where user_id = p_user_id;
  delete from public.profiles where id = p_user_id;
end;
$$;

-- 7. Permisos: la tabla solo se toca vía funciones; las funciones las puede
-- llamar cualquier usuario autenticado (cada una valida el rol por dentro).
-- Se activa RLS en banned_users como defensa en profundidad (las funciones
-- SECURITY DEFINER la omiten, así que siguen funcionando igual).
alter table public.banned_users enable row level security;
revoke all on table public.banned_users from anon, authenticated;
grant execute on function public.admin_user_activity() to authenticated;
grant execute on function public.am_i_banned() to authenticated;
grant execute on function public.admin_ban_user(uuid, text) to authenticated;
grant execute on function public.admin_unban_user(uuid) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
