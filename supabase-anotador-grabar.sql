-- Mi Fútbol JV32 · v11.53 (+v11.54: también «stop») · El anotador empieza, pausa, reanuda y para la grabación del móvil que graba
-- Pega todo esto en Supabase › SQL Editor y pulsa «Run». Se puede ejecutar más de una vez.
-- Añade dos columnas a directos y una función nueva (anotar_camara), y pone al día ver_anotador.
-- No borra ni cambia datos. Sin esto la app funciona igual, pero el anotador no ve la grabación.

-- 1) cam_est: cómo está la cámara del móvil que graba (lo escribe la app del entrenador):
--    null = cerrada · 'lista' = abierta sin grabar · 'rec' = grabando · 'pausa' = grabación en pausa
--    'listo' = hay un vídeo terminado sin guardar en ese móvil.
--    cam_ord: la última orden del anotador ({a: 'rec'|'pause'|'resume'|'stop', n: número, at: hora}).
alter table public.directos add column if not exists cam_est text;
alter table public.directos add column if not exists cam_ord jsonb;
alter table public.directos drop constraint if exists directos_cam_est_check;
alter table public.directos add constraint directos_cam_est_check
  check (cam_est is null or cam_est in ('lista','rec','pausa','listo'));

-- 2) Lo que ve el anotador (ahora también la cámara y su última orden).
create or replace function public.ver_anotador(codigo uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'equipo', equipo, 'rival', rival, 'modalidad', modalidad,
    'gf', gf, 'gc', gc, 'estado', estado, 'parte_min', parte_min,
    'acum_ms', acum_ms, 'desde', desde, 'eventos', eventos,
    'jugadores', coalesce(anot_jug, '[]'::jsonb), 'tiros', coalesce(an_tiros, false),
    'cam', coalesce(cam_est, ''), 'cam_ord', cam_ord,
    'actualizado', actualizado, 'ahora', now())
  from public.directos where anotador = codigo;
$$;
revoke all on function public.ver_anotador(uuid) from public;
grant execute on function public.ver_anotador(uuid) to anon, authenticated;

-- 3) Orden del anotador a la cámara. El móvil que graba la ve en unos segundos y la hace.
create or replace function public.anotar_camara(codigo uuid, accion text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d public.directos;
begin
  if accion is null or accion not in ('rec','pause','resume','stop') then raise exception 'DATOS'; end if;
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
