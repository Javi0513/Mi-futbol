-- =====================================================================
-- Mi Fútbol JV32 · VÍDEO EN EL DIRECTO (Cloudflare Realtime)
-- Ejecutar en Supabase → SQL Editor DESPUÉS de supabase-directo.sql. Se puede repetir sin riesgo.
-- =====================================================================

-- 1) Dónde se está emitiendo el vídeo de cada directo (lo rellena la Edge Function "video-directo").
--    "video" guarda la sesión de Cloudflare; "video_desde" cuándo empezó (null = sin vídeo).
alter table public.directos add column if not exists video jsonb;
alter table public.directos add column if not exists video_desde timestamptz;

-- 2) La página pública sabe si hay vídeo (solo la hora; la sesión no sale nunca de aquí).
create or replace function public.ver_directo(codigo uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'equipo', equipo, 'rival', rival, 'modalidad', modalidad,
    'gf', gf, 'gc', gc, 'estado', estado, 'parte_min', parte_min,
    'acum_ms', acum_ms, 'desde', desde, 'eventos', eventos,
    'actualizado', actualizado, 'ahora', now(), 'video_desde', video_desde)
  from public.directos where id = codigo;
$$;
revoke all on function public.ver_directo(uuid) from public;
grant execute on function public.ver_directo(uuid) to anon, authenticated;
