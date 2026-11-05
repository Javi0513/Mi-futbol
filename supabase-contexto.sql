-- =====================================================================
-- Mi Fútbol JV32 · CONTEXTO DE LA CARGA FÍSICA (v11.7)
-- Ejecutar en Supabase → SQL Editor. Se puede repetir sin riesgo. No borra nada.
-- Guarda por equipo los días de entreno a la semana, el horario (mañana, tarde
-- o noche) y el periodo de la temporada (pretemporada, competición, parón)
-- con su historial. Ejemplo:
--   {"dias": 3, "hora": "t", "per": [{"d": "2026-08-18", "p": "pre"}]}
-- =====================================================================
alter table public.equipos
  add column if not exists contexto jsonb;
alter table public.equipos
  drop constraint if exists equipos_contexto_check;
alter table public.equipos
  add constraint equipos_contexto_check
  check (contexto is null or (jsonb_typeof(contexto) = 'object' and pg_column_size(contexto) < 8000));
