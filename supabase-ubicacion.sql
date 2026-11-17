-- =====================================================================
-- Mi Fútbol JV32 · UBICACIÓN DEL CAMPO (v11.44)
-- Ejecutar en Supabase → SQL Editor. Se puede repetir sin riesgo.
-- El campo de cada PARTIDO va dentro de la alineación (no necesita SQL).
-- Esto añade:
--   1) entrenamientos.lugar: dónde se entrena ese día (nombre + punto del mapa)
--   2) directos.lugar: para que la familia vea el campo y «Cómo llegar»
--      en el enlace del directo.
-- =====================================================================

alter table public.entrenamientos add column if not exists lugar jsonb;
alter table public.entrenamientos drop constraint if exists entrenamientos_lugar_len;
alter table public.entrenamientos add constraint entrenamientos_lugar_len
  check (lugar is null or (jsonb_typeof(lugar) = 'object' and pg_column_size(lugar) <= 1000));

alter table public.directos add column if not exists lugar jsonb;
alter table public.directos drop constraint if exists directos_lugar_len;
alter table public.directos add constraint directos_lugar_len
  check (lugar is null or (jsonb_typeof(lugar) = 'object' and pg_column_size(lugar) <= 1000));

create or replace function public.ver_directo(codigo uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'equipo', equipo, 'rival', rival, 'modalidad', modalidad,
    'gf', gf, 'gc', gc, 'estado', estado, 'parte_min', parte_min,
    'acum_ms', acum_ms, 'desde', desde, 'eventos', eventos,
    'actualizado', actualizado, 'ahora', now(), 'video_desde', video_desde,
    'jornada', jornada, 'lugar', lugar)
  from public.directos where id = codigo;
$$;
revoke all on function public.ver_directo(uuid) from public;
grant execute on function public.ver_directo(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

-- Comprobación: debe salir "ok"
select case when
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='entrenamientos' and column_name='lugar')
  and exists (select 1 from information_schema.columns where table_schema='public' and table_name='directos' and column_name='lugar')
  and position('lugar' in pg_get_functiondef('public.ver_directo(uuid)'::regprocedure)) > 0
then 'ok' else 'falta algo' end as ubicacion_campo;
