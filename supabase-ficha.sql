-- Mi Fútbol JV32 · v11.21 · Ficha del jugador
-- Añade la posición habitual, otra posición y el pie de cada jugador.
-- Se puede ejecutar varias veces sin problema (SQL Editor de Supabase › pegar › Run).

alter table public.futbol_personal_jugadores add column if not exists posicion text;
alter table public.futbol_personal_jugadores add column if not exists posicion2 text;
alter table public.futbol_personal_jugadores add column if not exists pie text;

alter table public.futbol_personal_jugadores drop constraint if exists jugadores_ficha_max;
alter table public.futbol_personal_jugadores
  add constraint jugadores_ficha_max check (
    coalesce(char_length(posicion), 0) <= 10
    and coalesce(char_length(posicion2), 0) <= 10
    and coalesce(char_length(pie), 0) <= 2
  ) not valid;

-- Comprobación: deben salir las 3 columnas
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'futbol_personal_jugadores'
  and column_name in ('posicion', 'posicion2', 'pie')
order by column_name;
