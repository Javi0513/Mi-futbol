-- =====================================================================
-- Mi Fútbol JV32 · PLAN CLUB (v8.9) · ejecutar en Supabase → SQL Editor
-- Un club paga una suscripción y todos sus entrenadores tienen el plan Pro.
-- Cada entrenador sigue teniendo su cuenta privada: ni los demás entrenadores
-- ni el encargado del club pueden ver ni tocar sus jugadores, partidos o equipos
-- (esas tablas siguen protegidas solo por su dueño; aquí no se cambia nada de eso).
-- El encargado solo ve el email de cada entrenador y puede quitarlo del club.
-- Es seguro volver a ejecutarlo (idempotente). No borra ningún dato.
-- =====================================================================

-- 1) Clubes. Solo el encargado (admin_id) lo gestiona. La suscripción de
--    Stripe la escribe únicamente la función stripe-webhook.
create table if not exists public.clubes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(nombre) between 2 and 60),
  admin_id uuid not null unique references auth.users(id) on delete cascade,
  codigo text not null unique,
  plazas int not null default 0 check (plazas between 0 and 500),
  stripe_customer text,
  stripe_subscription text,
  stripe_estado text,
  stripe_evento_at bigint,
  pro_hasta timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists clubes_stripe_customer_key
  on public.clubes (stripe_customer) where stripe_customer is not null;
alter table public.clubes enable row level security;
revoke all on public.clubes from anon, authenticated;   -- solo a través de las funciones de abajo

-- 2) Entrenadores de cada club. Cada persona solo puede estar en un club.
create table if not exists public.club_miembros (
  user_id uuid primary key references auth.users(id) on delete cascade,
  club_id uuid not null references public.clubes(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists club_miembros_club_idx on public.club_miembros (club_id);
alter table public.club_miembros enable row level security;
revoke all on public.club_miembros from anon, authenticated;

-- 3) Marca para saber si el Pro de alguien viene del club (y quitárselo al salir).
--    Quien ya era Pro por su cuenta no lo pierde nunca por salir de un club.
alter table public.perfiles add column if not exists pro_por_club boolean not null default false;

create or replace function public.club_activo(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.club_miembros m join public.clubes c on c.id = m.club_id
     where m.user_id = uid and c.stripe_estado in ('active', 'trialing', 'past_due'));
$$;
revoke all on function public.club_activo(uuid) from public, anon, authenticated;

-- Mientras estés en un club pagado, nada te baja al plan gratuito
-- (ni que acabe tu prueba de tester ni que canceles tu Pro individual).
create or replace function public.plan_con_club()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.plan <> 'pro' and public.club_activo(new.id) then
    new.plan := 'pro';
    new.pro_por_club := true;
  end if;
  return new;
end $$;
revoke all on function public.plan_con_club() from public, anon, authenticated;
drop trigger if exists plan_con_club on public.perfiles;
create trigger plan_con_club before insert or update of plan on public.perfiles
  for each row execute function public.plan_con_club();

-- Pone el plan correcto a un entrenador según su club y su propia suscripción.
create or replace function public.aplicar_plan_club(uid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.club_activo(uid) then
    update public.perfiles set plan = 'pro', pro_por_club = true
     where id = uid and plan <> 'pro';
  else
    update public.perfiles
       set plan = case
             when coalesce(stripe_estado, '') in ('active', 'trialing', 'past_due') then 'pro'
             when prueba_hasta > now() then 'pro'
             else 'gratis' end,
           pro_por_club = false
     where id = uid and pro_por_club;
  end if;
end $$;
revoke all on function public.aplicar_plan_club(uuid) from public, anon, authenticated;

-- Al entrar o salir de un club (también si se borra el club o la cuenta).
create or replace function public.club_miembros_cambio()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.aplicar_plan_club(case when tg_op = 'DELETE' then old.user_id else new.user_id end);
  return null;
end $$;
revoke all on function public.club_miembros_cambio() from public, anon, authenticated;
drop trigger if exists club_miembros_cambio on public.club_miembros;
create trigger club_miembros_cambio after insert or delete on public.club_miembros
  for each row execute function public.club_miembros_cambio();

-- Cuando el club paga, renueva o cancela: se actualiza a todos sus entrenadores.
create or replace function public.club_pago_cambio()
returns trigger language plpgsql security definer set search_path = public as $$
declare m record;
begin
  for m in select user_id from public.club_miembros where club_id = new.id loop
    perform public.aplicar_plan_club(m.user_id);
  end loop;
  return null;
end $$;
revoke all on function public.club_pago_cambio() from public, anon, authenticated;
drop trigger if exists club_pago_cambio on public.clubes;
create trigger club_pago_cambio after update of stripe_estado on public.clubes
  for each row when (old.stripe_estado is distinct from new.stripe_estado)
  execute function public.club_pago_cambio();

-- 4) Código de invitación: 10 letras/números fáciles de leer (sin 0/O ni 1/I).
create or replace function public.club_codigo_nuevo()
returns text language plpgsql volatile set search_path = public as $$
declare a text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; r text;
begin
  loop
    select string_agg(substr(a, 1 + floor(random() * 32)::int, 1), '') into r
      from generate_series(1, 10);
    exit when not exists (select 1 from public.clubes where codigo = r);
  end loop;
  return r;
end $$;
revoke all on function public.club_codigo_nuevo() from public, anon, authenticated;

-- 5) Lo que ve la app. A un entrenador: solo el nombre del club y si está activo.
--    Al encargado, además: código, plazas y el email de cada entrenador (nada más).
create or replace function public.mi_club()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare uid uuid := auth.uid(); c record; usadas int; r jsonb;
begin
  if uid is null then return null; end if;
  select cl.* into c from public.club_miembros m join public.clubes cl on cl.id = m.club_id
   where m.user_id = uid;
  if not found then return null; end if;
  select count(*) into usadas from public.club_miembros where club_id = c.id;
  r := jsonb_build_object(
    'id', c.id, 'nombre', c.nombre,
    'activo', coalesce(c.stripe_estado, '') in ('active', 'trialing', 'past_due'),
    'pro_hasta', c.pro_hasta,
    'soy_admin', c.admin_id = uid);
  if c.admin_id = uid then
    r := r || jsonb_build_object(
      'codigo', c.codigo, 'plazas', c.plazas, 'usadas', usadas,
      'pagado', c.stripe_customer is not null,
      'miembros', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', m.user_id, 'email', u.email, 'desde', m.created_at,
                 'admin', m.user_id = c.admin_id) order by m.created_at)
          from public.club_miembros m join auth.users u on u.id = m.user_id
         where m.club_id = c.id), '[]'::jsonb));
  end if;
  return r;
end $$;
revoke all on function public.mi_club() from public, anon;
grant execute on function public.mi_club() to authenticated;

-- 6) Crear un club (quien lo crea es el encargado y también cuenta como entrenador).
create or replace function public.crear_club(nombre text)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n text := btrim(coalesce(nombre, '')); cid uuid;
begin
  if uid is null then raise exception 'No autenticado'; end if;
  if char_length(n) < 2 or char_length(n) > 60 then raise exception 'CLUB_NOMBRE'; end if;
  if exists (select 1 from public.club_miembros where user_id = uid) then raise exception 'YA_EN_CLUB'; end if;
  insert into public.clubes (nombre, admin_id, codigo) values (n, uid, public.club_codigo_nuevo())
    returning id into cid;
  insert into public.club_miembros (user_id, club_id) values (uid, cid);
  return cid;
end $$;
revoke all on function public.crear_club(text) from public, anon;
grant execute on function public.crear_club(text) to authenticated;

-- 7) Unirse con el código que te da el encargado.
create or replace function public.unirse_club(codigo text)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c record; usadas int;
begin
  if uid is null then raise exception 'No autenticado'; end if;
  if exists (select 1 from public.club_miembros where user_id = uid) then raise exception 'YA_EN_CLUB'; end if;
  select * into c from public.clubes cl
   where cl.codigo = upper(regexp_replace(coalesce(unirse_club.codigo, ''), '[^A-Za-z0-9]', '', 'g'))
   for update;
  if not found then raise exception 'CODIGO_NO_VALIDO'; end if;
  select count(*) into usadas from public.club_miembros where club_id = c.id;
  if usadas >= greatest(c.plazas, 1) then raise exception 'CLUB_LLENO'; end if;
  insert into public.club_miembros (user_id, club_id) values (uid, c.id);
  return c.nombre;
end $$;
revoke all on function public.unirse_club(text) from public, anon;
grant execute on function public.unirse_club(text) to authenticated;

-- 8) Salir del club por tu cuenta (el encargado no puede salir de su propio club).
create or replace function public.salir_club()
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'No autenticado'; end if;
  if exists (select 1 from public.clubes where admin_id = uid) then raise exception 'ADMIN_NO_PUEDE_SALIR'; end if;
  delete from public.club_miembros where user_id = uid;
end $$;
revoke all on function public.salir_club() from public, anon;
grant execute on function public.salir_club() to authenticated;

-- 9) El encargado quita a un entrenador del club. Solo pierde el Pro del club:
--    su cuenta, sus equipos, jugadores y partidos siguen intactos y siguen siendo solo suyos.
create or replace function public.quitar_del_club(entrenador uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); cid uuid;
begin
  select id into cid from public.clubes where admin_id = uid;
  if uid is null or cid is null then raise exception 'NO_ERES_ENCARGADO'; end if;
  if entrenador = uid then raise exception 'ADMIN_NO_PUEDE_SALIR'; end if;
  delete from public.club_miembros where user_id = entrenador and club_id = cid;
end $$;
revoke all on function public.quitar_del_club(uuid) from public, anon;
grant execute on function public.quitar_del_club(uuid) to authenticated;

-- 10) El encargado cambia el código (el antiguo deja de valer; nadie sale del club).
create or replace function public.club_cambiar_codigo()
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r text := public.club_codigo_nuevo();
begin
  update public.clubes set codigo = r where admin_id = uid;
  if not found then raise exception 'NO_ERES_ENCARGADO'; end if;
  return r;
end $$;
revoke all on function public.club_cambiar_codigo() from public, anon;
grant execute on function public.club_cambiar_codigo() to authenticated;

-- 11) El encargado borra el club (solo si no tiene una suscripción en marcha).
--     Todos sus entrenadores salen del club; sus cuentas y datos no se tocan.
create or replace function public.borrar_club()
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c record;
begin
  select * into c from public.clubes where admin_id = uid;
  if uid is null or not found then raise exception 'NO_ERES_ENCARGADO'; end if;
  if coalesce(c.stripe_estado, '') in ('active', 'trialing', 'past_due') then raise exception 'CLUB_PAGADO'; end if;
  delete from public.clubes where id = c.id;
end $$;
revoke all on function public.borrar_club() from public, anon;
grant execute on function public.borrar_club() to authenticated;

-- 12) «Borrar mi cuenta»: si eres encargado de un club pagado, primero hay que cancelar.
--     (Si no, al borrar tu cuenta se borra también el club y sus entrenadores salen de él.)
create or replace function public.borrar_mi_cuenta()
returns void language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'No autenticado'; end if;
  if exists (select 1 from public.clubes where admin_id = uid
              and coalesce(stripe_estado, '') in ('active', 'trialing', 'past_due')) then
    raise exception 'CLUB_PAGADO';
  end if;
  delete from public.futbol_personal_partidos  where owner_id = uid;
  delete from public.futbol_personal_jugadores where owner_id = uid;
  delete from public.perfiles where id = uid;
  delete from auth.users where id = uid;
end $$;
revoke all on function public.borrar_mi_cuenta() from public, anon;
grant execute on function public.borrar_mi_cuenta() to authenticated;

-- ---------------------------------------------------------------------
-- VER LOS CLUBES (solo para ti, desde el SQL Editor):
-- select c.nombre, u.email as encargado, c.stripe_estado, c.plazas,
--        (select count(*) from public.club_miembros m where m.club_id = c.id) as entrenadores
--   from public.clubes c join auth.users u on u.id = c.admin_id order by c.created_at;
-- ---------------------------------------------------------------------
