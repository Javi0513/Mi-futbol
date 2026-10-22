-- =====================================================================
-- Mi Fútbol JV32 · VARIOS EQUIPOS POR MODALIDAD (v8.0)
-- Ejecutar en Supabase → SQL Editor. Se puede repetir sin riesgo.
-- No borra nada: tus jugadores y partidos actuales pasan a tu primer equipo.
-- =====================================================================

-- 1) Tabla de equipos (uno o varios por modalidad).
create table if not exists public.equipos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  modalidad text not null check (modalidad in ('7','11','fs')),
  nombre text not null check (char_length(nombre) between 1 and 40),
  created_at timestamptz not null default now()
);
create index if not exists equipos_owner_idx on public.equipos (owner_id, modalidad);

-- 2) Seguridad: cada entrenador solo ve y toca sus equipos.
alter table public.equipos enable row level security;
revoke all on public.equipos from anon, authenticated;
grant select, insert, update, delete on public.equipos to authenticated;
drop policy if exists "Mis equipos" on public.equipos;
create policy "Mis equipos" on public.equipos
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- 3) Cada jugador y cada partido puede ir en un equipo.
--    Si se borra el equipo, se borran sus jugadores y partidos.
alter table public.futbol_personal_jugadores
  add column if not exists equipo_id uuid references public.equipos(id) on delete cascade;
alter table public.futbol_personal_partidos
  add column if not exists equipo_id uuid references public.equipos(id) on delete cascade;
create index if not exists jugadores_equipo_idx on public.futbol_personal_jugadores (equipo_id);
create index if not exists partidos_equipo_idx on public.futbol_personal_partidos (equipo_id);

-- 4) El equipo tiene que ser tuyo y de la misma modalidad.
create or replace function public.equipo_valido()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.equipo_id is not null and not exists (
    select 1 from public.equipos e
    where e.id = new.equipo_id and e.owner_id = new.owner_id and e.modalidad = new.modalidad
  ) then
    raise exception 'EQUIPO_NO_VALIDO';
  end if;
  return new;
end $$;
revoke all on function public.equipo_valido() from public, anon, authenticated;
drop trigger if exists equipo_valido on public.futbol_personal_jugadores;
create trigger equipo_valido
  before insert or update of equipo_id, modalidad on public.futbol_personal_jugadores
  for each row execute function public.equipo_valido();
drop trigger if exists equipo_valido on public.futbol_personal_partidos;
create trigger equipo_valido
  before insert or update of equipo_id, modalidad on public.futbol_personal_partidos
  for each row execute function public.equipo_valido();

-- 5) Plan gratuito: 1 equipo por modalidad. Plan Pro: sin límite.
create or replace function public.limite_equipos()
returns trigger language plpgsql security definer set search_path = public as $$
declare p text; n int;
begin
  select plan into p from public.perfiles where id = new.owner_id;
  if coalesce(p, 'gratis') = 'pro' then return new; end if;
  select count(*) into n from public.equipos
   where owner_id = new.owner_id and modalidad = new.modalidad and id <> new.id;
  if n >= 1 then raise exception 'LIMITE_PLAN'; end if;
  return new;
end $$;
revoke all on function public.limite_equipos() from public, anon, authenticated;
drop trigger if exists limite_equipos on public.equipos;
create trigger limite_equipos
  before insert or update of modalidad on public.equipos
  for each row execute function public.limite_equipos();
