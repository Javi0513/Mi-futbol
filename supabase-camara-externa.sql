-- =====================================================================
-- Mi Fútbol JV32 · CÁMARA EXTERNA EN EL ENLACE DEL DIRECTO (v11.55)
-- Ejecutar en Supabase → SQL Editor. Se puede repetir sin riesgo. No toca datos.
-- El entrenador pega el enlace de YouTube (o Veo…) de su cámara externa
-- (XbotGo, Veo…) y la familia lo ve en el enlace del directo, debajo del marcador.
-- =====================================================================

alter table public.directos add column if not exists video_ext text;
alter table public.directos drop constraint if exists directos_video_ext_len;
alter table public.directos add constraint directos_video_ext_len
  check (video_ext is null or (char_length(video_ext) <= 300 and video_ext ~ '^https://'));

create or replace function public.ver_directo(codigo uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'equipo', equipo, 'rival', rival, 'modalidad', modalidad,
    'gf', gf, 'gc', gc, 'estado', estado, 'parte_min', parte_min,
    'acum_ms', acum_ms, 'desde', desde, 'eventos', eventos,
    'actualizado', actualizado, 'ahora', now(), 'video_desde', video_desde,
    'jornada', jornada, 'lugar', lugar, 'video_ext', video_ext)
  from public.directos where id = codigo;
$$;
revoke all on function public.ver_directo(uuid) from public;
grant execute on function public.ver_directo(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

-- Comprobación: debe salir "ok"
select case when
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='directos' and column_name='video_ext')
  and position('video_ext' in pg_get_functiondef('public.ver_directo(uuid)'::regprocedure)) > 0
then 'ok' else 'falta algo' end as camara_externa;
