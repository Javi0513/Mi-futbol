-- Mi Fútbol JV32 · v11.60 · El anotador activa o quita «🎯 Seguir la jugada» en el móvil que graba
-- Pega todo esto en Supabase › SQL Editor y pulsa «Run». Se puede ejecutar más de una vez.
-- Añade una columna a directos (cam_sig) y pone al día ver_anotador y anotar_camara.
-- No borra ni cambia datos. Sin esto la app funciona igual, pero el anotador no ve el botón.

-- 1) cam_sig: si el móvil que graba está siguiendo la jugada (lo escribe la app del entrenador)
alter table public.directos add column if not exists cam_sig boolean;

-- 2) Lo que ve el anotador (ahora también «Seguir la jugada»)
create or replace function public.ver_anotador(codigo uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'equipo', equipo, 'rival', rival, 'modalidad', modalidad,
    'gf', gf, 'gc', gc, 'estado', estado, 'parte_min', parte_min,
    'acum_ms', acum_ms, 'desde', desde, 'eventos', eventos,
    'jugadores', coalesce(anot_jug, '[]'::jsonb), 'tiros', coalesce(an_tiros, false),
    'cam', coalesce(cam_est, ''), 'cam_ord', cam_ord, 'sig', coalesce(cam_sig, false),
    'actualizado', actualizado, 'ahora', now())
  from public.directos where anotador = codigo;
$$;
revoke all on function public.ver_anotador(uuid) from public;
grant execute on function public.ver_anotador(uuid) to anon, authenticated;

-- 3) Órdenes del anotador a la cámara: además de grabar, «sig1» (seguir la jugada) y «sig0» (quitarlo)
create or replace function public.anotar_camara(codigo uuid, accion text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d public.directos;
begin
  if accion is null or accion not in ('rec','pause','resume','stop','sig1','sig0') then raise exception 'DATOS'; end if;
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
