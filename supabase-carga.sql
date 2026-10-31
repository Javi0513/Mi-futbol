-- =====================================================================
-- Mi Fútbol JV32 · CARGA FÍSICA POR JUGADOR (v10.5)
-- Ejecutar en Supabase → SQL Editor. Se puede repetir sin riesgo.
-- No toca jugadores, partidos, asistencia ni circuitos: solo añade una columna.
-- (En los partidos el esfuerzo va dentro de cada jugador, no hace falta nada.)
-- =====================================================================

-- Esfuerzo de cada jugador en el entreno (1 a 10) y minutos que duró:
-- {"dur": 75, "rpe": {"<id del jugador>": 6, ...}}
alter table public.entrenamientos
  add column if not exists carga jsonb
  check (carga is null or (jsonb_typeof(carga) = 'object' and pg_column_size(carga) < 16000));

-- Comprobación: debe salir «carga».
select column_name as listo from information_schema.columns
 where table_schema = 'public' and table_name = 'entrenamientos' and column_name = 'carga';
