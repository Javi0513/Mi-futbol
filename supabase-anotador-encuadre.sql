-- Mi Fútbol JV32 · v11.69 · El anotador cambia el «🔍 Encuadre» de «Seguir la jugada»
-- Pega todo esto en Supabase › SQL Editor y pulsa «Run». Se puede ejecutar más de una vez. No toca datos.
-- cam_enc = encuadre del móvil que graba: 'a' (Abierto), 'm' (Medio) o 'c' (Cerrado).
-- Órdenes nuevas: enca, encm, encc. Sin esto la app funciona igual, pero el anotador no ve el encuadre.
alter table public.directos add column if not exists cam_enc text;

create or replace function public.ver_anotador(codigo uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'equipo', equipo, 'rival', rival, 'modalidad', modalidad,
    'gf', gf, 'gc', gc, 'estado', estado, 'parte_min', parte_min,
    'acum_ms', acum_ms, 'desde', desde, 'eventos', eventos,
    'jugadores', coalesce(anot_jug, '[]'::jsonb), 'tiros', coalesce(an_tiros, false),
    'cam', coalesce(cam_est, ''), 'cam_ord', cam_ord, 'sig', coalesce(cam_sig, false),
    'emi', coalesce(cam_emi, false), 'enc', coalesce(cam_enc, 'a'),
    'actualizado', actualizado, 'ahora', now())
  from public.directos where anotador = codigo;
$$;
revoke all on function public.ver_anotador(uuid) from public;
grant execute on function public.ver_anotador(uuid) to anon, authenticated;

create or replace function public.anotar_camara(codigo uuid, accion text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d public.directos;
begin
  if accion is null or accion not in ('rec','pause','resume','stop','sig1','sig0','abrir','emit1','emit0','enca','encm','encc') then raise exception 'DATOS'; end if;
  select * into d from public.directos where anotador = codigo for update;
  if not found then raise exception 'NO_EXISTE'; end if;
  if d.cam_est is null then raise exception 'SIN_CAMARA'; end if;
  update public.directos set cam_ord = jsonb_build_object(
      'a', accion,
      'n', coalesce((d.cam_ord->>'n')::int, 0) + 1,
      'at', now())
    where id = d.id;
  return public.ver_anotador(codigo);
end $$;
revoke all on function public.anotar_camara(uuid, text) from public;
grant execute on function public.anotar_camara(uuid, text) to anon, authenticated;
