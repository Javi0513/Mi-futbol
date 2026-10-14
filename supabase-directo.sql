-- =====================================================================
-- Mi Fútbol JV32 · DIRECTO DE PARTIDOS (marcador en vivo + enlace para compartir)
-- Ejecutar en Supabase → SQL Editor. Se puede repetir sin riesgo.
-- =====================================================================

-- 1) Un directo por partido. Su "id" es el código secreto del enlace que se comparte.
create table if not exists public.directos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  partido_id text not null unique check (char_length(partido_id) <= 64),
  modalidad text not null check (modalidad in ('7','11','fs')),
  equipo text not null default 'Mi equipo' check (char_length(equipo) between 1 and 60),
  rival text not null default '' check (char_length(rival) <= 100),
  gf int not null default 0 check (gf between 0 and 99),
  gc int not null default 0 check (gc between 0 and 99),
  estado text not null default 'pre' check (estado in ('pre','1T','DES','2T','FIN')),
  parte_min int not null default 30 check (parte_min between 5 and 60),
  acum_ms bigint not null default 0 check (acum_ms between 0 and 36000000),
  desde timestamptz,
  eventos jsonb not null default '[]'::jsonb check (jsonb_typeof(eventos) = 'array' and pg_column_size(eventos) <= 20000),
  actualizado timestamptz not null default now()
);

-- 2) Seguridad: cada entrenador solo ve y toca sus directos. Nadie anónimo lee la tabla.
alter table public.directos enable row level security;
revoke all on public.directos from anon, authenticated;
grant select, insert, update, delete on public.directos to authenticated;
drop policy if exists "Mis directos" on public.directos;
create policy "Mis directos" on public.directos
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- 3) La hora del reloj la pone el servidor (así el minuto es igual en todos los móviles).
create or replace function public.directo_hora()
returns trigger language plpgsql set search_path = public as $$
begin
  new.actualizado := now();
  if new.desde is not null then
    if tg_op = 'INSERT' then
      new.desde := now();          -- el reloj arranca ahora
    elsif new.desde is distinct from old.desde then
      new.desde := now();          -- el reloj arranca (o vuelve a arrancar) ahora
    end if;                        -- si no cambia, sigue corriendo desde que arrancó
  end if;
  return new;
end $$;
revoke all on function public.directo_hora() from public, anon, authenticated;
drop trigger if exists directo_hora on public.directos;
create trigger directo_hora before insert or update on public.directos
  for each row execute function public.directo_hora();

-- 4) Lectura pública de UN directo, solo con su código (el del enlace). Sin cuenta.
--    Devuelve solo lo que se ve en la pantalla del directo.
create or replace function public.ver_directo(codigo uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'equipo', equipo, 'rival', rival, 'modalidad', modalidad,
    'gf', gf, 'gc', gc, 'estado', estado, 'parte_min', parte_min,
    'acum_ms', acum_ms, 'desde', desde, 'eventos', eventos,
    'actualizado', actualizado, 'ahora', now())
  from public.directos where id = codigo;
$$;
revoke all on function public.ver_directo(uuid) from public;
grant execute on function public.ver_directo(uuid) to anon, authenticated;
