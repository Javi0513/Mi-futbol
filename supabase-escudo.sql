-- =====================================================================
-- Mi Fútbol JV32 · ESCUDO DEL CLUB Y FOTO DEL ENTRENADOR (v10.2)
-- Ejecutar en Supabase → SQL Editor.
-- Requiere haber ejecutado antes supabase-clubes.sql (v8.9) y
-- supabase-supervisor.sql (v9.2).
--
-- · El encargado del club puede poner (o quitar) el escudo del club. Lo ven
--   todos los entrenadores del club.
-- · Cada entrenador puede poner su nombre y su foto de perfil. Solo los ve el
--   supervisor del club (el encargado y quien él nombre), para saber de quién
--   es cada cuenta. Los demás entrenadores siguen sin ver nada.
-- · Las imágenes se guardan pequeñas (la app las reduce antes de subirlas).
-- Es seguro volver a ejecutarlo (idempotente). No borra ningún dato.
-- =====================================================================

-- 1) Columnas nuevas.
alter table public.clubes add column if not exists escudo text;
alter table public.perfiles add column if not exists nombre text;
alter table public.perfiles add column if not exists foto text;
alter table public.clubes drop constraint if exists clubes_escudo_ok;
alter table public.clubes add constraint clubes_escudo_ok
  check (escudo is null or (escudo like 'data:image/%' and length(escudo) <= 150000));
alter table public.perfiles drop constraint if exists perfiles_foto_ok;
alter table public.perfiles add constraint perfiles_foto_ok
  check (foto is null or (foto like 'data:image/%' and length(foto) <= 60000));
alter table public.perfiles drop constraint if exists perfiles_nombre_ok;
alter table public.perfiles add constraint perfiles_nombre_ok
  check (nombre is null or char_length(nombre) <= 40);

-- 2) El encargado pone o quita el escudo (null = quitar).
create or replace function public.club_escudo(escudo text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); e text := nullif(club_escudo.escudo, '');
begin
  if uid is null or not exists (select 1 from public.clubes where admin_id = uid) then
    raise exception 'NO_ERES_ENCARGADO';
  end if;
  if e is not null and (e not like 'data:image/%' or length(e) > 150000) then
    raise exception 'IMAGEN_NO_VALIDA';
  end if;
  update public.clubes set escudo = e where admin_id = uid;
end $$;
revoke all on function public.club_escudo(text) from public, anon;
grant execute on function public.club_escudo(text) to authenticated;

-- 3) Cada uno guarda su nombre y su foto (null = quitar).
--    perfiles sigue siendo de solo lectura para la app: solo se cambia por aquí.
create or replace function public.guardar_mi_perfil(nombre text, foto text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
        n text := nullif(btrim(coalesce(guardar_mi_perfil.nombre, '')), '');
        f text := nullif(guardar_mi_perfil.foto, '');
begin
  if uid is null then raise exception 'No autenticado'; end if;
  if n is not null and char_length(n) > 40 then raise exception 'NOMBRE_LARGO'; end if;
  if f is not null and (f not like 'data:image/%' or length(f) > 60000) then
    raise exception 'IMAGEN_NO_VALIDA';
  end if;
  update public.perfiles set nombre = n, foto = f where id = uid;
  if not found then
    insert into public.perfiles (id, nombre, foto) values (uid, n, f);
  end if;
end $$;
revoke all on function public.guardar_mi_perfil(text, text) from public, anon;
grant execute on function public.guardar_mi_perfil(text, text) to authenticated;

-- 4) Lo que ve la app (sustituye a la versión de v9.2).
--    Todos: además, el escudo del club.
--    Supervisor: además, el nombre y la foto de cada entrenador.
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
    'escudo', c.escudo,
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
                 'comparte', m.comparte,
                 'nombre', p.nombre, 'foto', p.foto) order by m.created_at)
          from public.club_miembros m join auth.users u on u.id = m.user_id
          left join public.perfiles p on p.id = m.user_id
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
