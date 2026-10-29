-- Mi Fútbol JV32 · v9.3 · Dorsales de los jugadores
-- Pégalo en Supabase › SQL Editor y pulsa «Run». Se puede ejecutar varias veces sin problema.
-- No borra nada: añade una columna opcional «dorsal» (0 a 99) a los jugadores.

alter table public.futbol_personal_jugadores
  add column if not exists dorsal smallint;

alter table public.futbol_personal_jugadores drop constraint if exists jugadores_dorsal_rango;
alter table public.futbol_personal_jugadores
  add constraint jugadores_dorsal_rango check (dorsal is null or dorsal between 0 and 99);

-- Para que la app vea la columna nueva al momento.
notify pgrst, 'reload schema';
