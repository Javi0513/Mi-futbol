-- =====================================================================
-- Mi Fútbol JV32 · EJERCICIOS SUELTOS EN LOS ENTRENOS (v11.0)
-- Ejecutar en Supabase → SQL Editor. Se puede repetir sin riesgo.
-- No toca jugadores, partidos, asistencia, circuitos ni carga: solo añade una columna.
-- =====================================================================

-- Ejercicios del entreno que no son de ningún circuito, con su nombre, explicación y tiempo:
-- [{"n": "Rondo 4 contra 2", "d": "…", "t": 600}, ...]   (t en segundos)
alter table public.entrenamientos
  add column if not exists ejercicios jsonb
  check (ejercicios is null or (jsonb_typeof(ejercicios) = 'array' and pg_column_size(ejercicios) < 32000));

-- Comprobación: debe salir «ejercicios».
select column_name as listo from information_schema.columns
 where table_schema = 'public' and table_name = 'entrenamientos' and column_name = 'ejercicios';
