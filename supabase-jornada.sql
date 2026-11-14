-- =====================================================================
-- Mi Fútbol JV32 · JORNADA DEL PARTIDO EN EL ENLACE DEL DIRECTO (v11.32)
-- Ejecutar en Supabase → SQL Editor. Se puede repetir sin riesgo.
-- La jornada de cada partido se guarda en la alineación (no necesita SQL);
-- esto solo hace que la familia la vea también en el enlace del directo.
-- =====================================================================

alter table public.directos add column if not exists jornada text;
alter table public.directos drop constraint if exists directos_jornada_len;
alter table public.directos add constraint directos_jornada_len check (jornada is null or char_length(jornada) <= 40);

create or replace function public.ver_directo(codigo uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'equipo', equipo, 'rival', rival, 'modalidad', modalidad,
    'gf', gf, 'gc', gc, 'estado', estado, 'parte_min', parte_min,
    'acum_ms', acum_ms, 'desde', desde, 'eventos', eventos,
    'actualizado', actualizado, 'ahora', now(), 'video_desde', video_desde,
    'jornada', jornada)
  from public.directos where id = codigo;
$$;
revoke all on function public.ver_directo(uuid) from public;
grant execute on function public.ver_directo(uuid) to anon, authenticated;
