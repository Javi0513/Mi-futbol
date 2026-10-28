-- =====================================================================
-- Mi Fútbol JV32 · SUPERVISOR DEL CLUB (v9.2) · ejecutar en Supabase → SQL Editor
-- Requiere haber ejecutado antes supabase-clubes.sql (v8.9).
--
-- El encargado del club es siempre supervisor y puede nombrar supervisores a
-- otros entrenadores del club (por ejemplo, un director deportivo o gerente).
-- Un supervisor puede VER (nunca cambiar) los equipos, jugadores, partidos,
-- alineaciones, convocatorias y entrenamientos de los entrenadores del club que
-- hayan aceptado compartirlos. Nunca ve contraseñas ni datos de la cuenta.
-- Los entrenadores siguen sin poder ver nada de los demás entrenadores.
-- Quien ya estaba en un club NO comparte nada hasta que lo acepte en la app.
-- Solo funciona mientras el club esté pagado.
-- Es seguro volver a ejecutarlo (idempotente). No borra ningún dato.
-- =====================================================================

-- 1) Nuevas marcas en cada entrenador del club.
alter table public.club_miembros add column if not exists supervisor boolean not null default false;
alter table public.club_miembros add column if not exists comparte boolean not null default false;
alter table public.club_miembros add column if not exists comparte_at timestamptz;

-- 2) ¿Es esta persona supervisora de su club (y el club está pagado)?
create or replace function public.club_supervisor_de(uid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select c.id from public.club_miembros m join public.clubes c on c.id = m.club_id
   where m.user_id = uid
     and (m.supervisor or c.admin_id = uid)
     and coalesce(c.stripe_estado, '') in ('active', 'trialing', 'past_due');
$$;
revoke all on function public.club_supervisor_de(uuid) from public, anon, authenticated;

-- 3) Lo que ve la app (sustituye a la versión de v8.9).
--    Entrenador: nombre del club, si está activo y si comparte sus datos.
--    Supervisor: además, la lista de entrenadores (email y si comparten).
--    Encargado: además, código, plazas y quién es supervisor.
create or replace function public.mi_club()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare uid uuid := auth.uid(); c record; yo record; usadas int; r jsonb; sup boolean;
begin
  if uid is null then return null; end if;
  select cl.* into c from public.club_miembros m join public.clubes cl on cl.id = m.club_id
   where m.user_id = uid;
  if not found then return null; end if;
  select * into yo from public.club_miembros where user_id = uid;
  select count(*) into usadas from public.club_miembros where club_id = c.id;
  sup := yo.supervisor or c.admin_id = uid;
  r := jsonb_build_object(
    'id', c.id, 'nombre', c.nombre,
    'activo', coalesce(c.stripe_estado, '') in ('active', 'trialing', 'past_due'),
    'pro_hasta', c.pro_hasta,
    'soy_admin', c.admin_id = uid,
    'soy_supervisor', sup,
    'comparto', yo.comparte);
  if sup then
    r := r || jsonb_build_object(
      'miembros', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', m.user_id, 'email', u.email, 'desde', m.created_at,
                 'admin', m.user_id = c.admin_id,
                 'supervisor', m.supervisor or m.user_id = c.admin_id,
                 'comparte', m.comparte) order by m.created_at)
          from public.club_miembros m join auth.users u on u.id = m.user_id
         where m.club_id = c.id), '[]'::jsonb));
  end if;
  if c.admin_id = uid then
    r := r || jsonb_build_object(
      'codigo', c.codigo, 'plazas', c.plazas, 'usadas', usadas,
      'pagado', c.stripe_customer is not null);
  end if;
  return r;
end $$;
revoke all on function public.mi_club() from public, anon;
grant execute on function public.mi_club() to authenticated;

-- 4) Unirse con el código. Ahora se puede aceptar a la vez que el supervisor vea
--    tus datos (la app lo pide siempre). Si una versión antigua de la app no lo
--    manda, entras sin compartir y la app te lo preguntará después.
drop function if exists public.unirse_club(text);
create or replace function public.unirse_club(codigo text, acepto boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c record; usadas int; ok boolean := coalesce(acepto, false);
begin
  if uid is null then raise exception 'No autenticado'; end if;
  if exists (select 1 from public.club_miembros where user_id = uid) then raise exception 'YA_EN_CLUB'; end if;
  select * into c from public.clubes cl
   where cl.codigo = upper(regexp_replace(coalesce(unirse_club.codigo, ''), '[^A-Za-z0-9]', '', 'g'))
   for update;
  if not found then raise exception 'CODIGO_NO_VALIDO'; end if;
  select count(*) into usadas from public.club_miembros where club_id = c.id;
  if usadas >= greatest(c.plazas, 1) then raise exception 'CLUB_LLENO'; end if;
  insert into public.club_miembros (user_id, club_id, comparte, comparte_at)
    values (uid, c.id, ok, case when ok then now() end);
  return c.nombre;
end $$;
revoke all on function public.unirse_club(text, boolean) from public, anon;
grant execute on function public.unirse_club(text, boolean) to authenticated;

-- 5) Cada entrenador acepta o deja de compartir sus datos con el supervisor.
create or replace function public.club_compartir(si boolean)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'No autenticado'; end if;
  update public.club_miembros
     set comparte = coalesce(si, false), comparte_at = case when si then now() end
   where user_id = uid;
  if not found then raise exception 'NO_EN_CLUB'; end if;
end $$;
revoke all on function public.club_compartir(boolean) from public, anon;
grant execute on function public.club_compartir(boolean) to authenticated;

-- 6) El encargado nombra o quita supervisores (él lo es siempre).
create or replace function public.club_hacer_supervisor(entrenador uuid, si boolean)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); cid uuid;
begin
  select id into cid from public.clubes where admin_id = uid;
  if uid is null or cid is null then raise exception 'NO_ERES_ENCARGADO'; end if;
  update public.club_miembros set supervisor = coalesce(si, false)
   where user_id = entrenador and club_id = cid and user_id <> uid;
  if not found then raise exception 'NO_EN_CLUB'; end if;
end $$;
revoke all on function public.club_hacer_supervisor(uuid, boolean) from public, anon;
grant execute on function public.club_hacer_supervisor(uuid, boolean) to authenticated;

-- 7) El supervisor ve los datos de un entrenador de su club (solo lectura).
--    Solo equipos, jugadores, partidos (con alineación y convocatoria) y
--    entrenamientos. Nada de la cuenta: ni contraseña, ni plan, ni pagos.
create or replace function public.club_datos_entrenador(entrenador uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare uid uuid := auth.uid(); cid uuid; ok boolean;
begin
  if uid is null then raise exception 'No autenticado'; end if;
  cid := public.club_supervisor_de(uid);
  if cid is null then raise exception 'NO_ERES_SUPERVISOR'; end if;
  select m.comparte into ok from public.club_miembros m
   where m.user_id = entrenador and m.club_id = cid;
  if not found then raise exception 'NO_EN_CLUB'; end if;
  if not ok then raise exception 'NO_COMPARTE'; end if;
  return jsonb_build_object(
    'email', (select email from auth.users where id = entrenador),
    'jugadores', coalesce((select jsonb_agg(to_jsonb(j) - 'owner_id' order by j.nombre)
                             from public.futbol_personal_jugadores j where j.owner_id = entrenador), '[]'::jsonb),
    'partidos', coalesce((select jsonb_agg(to_jsonb(p) - 'owner_id' order by p.fecha desc)
                            from public.futbol_personal_partidos p where p.owner_id = entrenador), '[]'::jsonb),
    'equipos', coalesce((select jsonb_agg(to_jsonb(e) - 'owner_id' order by e.created_at)
                           from public.equipos e where e.owner_id = entrenador), '[]'::jsonb),
    'entrenamientos', coalesce((select jsonb_agg(to_jsonb(t) - 'owner_id' order by t.fecha)
                                  from public.entrenamientos t where t.owner_id = entrenador), '[]'::jsonb));
end $$;
revoke all on function public.club_datos_entrenador(uuid) from public, anon;
grant execute on function public.club_datos_entrenador(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- COMPROBAR (solo para ti, desde el SQL Editor):
-- select c.nombre, u.email, m.supervisor, m.comparte
--   from public.club_miembros m join public.clubes c on c.id = m.club_id
--   join auth.users u on u.id = m.user_id order by c.nombre, m.created_at;
-- ---------------------------------------------------------------------
