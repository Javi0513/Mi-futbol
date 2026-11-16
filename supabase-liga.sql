-- =====================================================================
-- Mi Fútbol JV32 · CLASIFICACIÓN DE LA LIGA (v11.41)
-- Ejecutar en Supabase → SQL Editor. Se puede repetir sin riesgo. No borra nada.
-- Guarda por equipo el enlace de su liga en la web de la federación, la
-- clasificación pegada y los resultados de cada jornada. Ejemplo:
--   {"url": "https://…", "nom": "Alevín 2ª G3", "yo": "CD Norte", "act": "2026-11-16",
--    "tabla": [{"n": "CD Norte", "pts": 25, "pj": 10, "g": 8, "e": 1, "p": 1, "gf": 30, "gc": 8}],
--    "res": [{"j": 10, "l": "CD Norte", "v": "UD Sur", "gl": 2, "gv": 1}]}
-- Solo lo ve y lo cambia el entrenador del equipo (las reglas de equipos ya lo hacen).
-- =====================================================================
alter table public.equipos
  add column if not exists liga jsonb;
alter table public.equipos
  drop constraint if exists equipos_liga_check;
alter table public.equipos
  add constraint equipos_liga_check
  check (liga is null or (jsonb_typeof(liga) = 'object' and pg_column_size(liga) < 60000));

-- Comprobación: debe salir una fila con «liga | jsonb»
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'equipos' and column_name = 'liga';
