-- =====================================================================
-- Mi Fútbol JV32 · CIRCUITOS DE FUERZA Y COORDINACIÓN (v10.4)
-- Ejecutar en Supabase → SQL Editor. Se puede repetir sin riesgo.
-- No toca tus jugadores, partidos ni la asistencia: solo añade cosas nuevas.
-- =====================================================================

-- 1) Cada entrenamiento puede llevar un circuito (ejercicios, tiempos y series) en JSON.
alter table public.entrenamientos
  add column if not exists circuito jsonb
  check (circuito is null or (jsonb_typeof(circuito) = 'object' and pg_column_size(circuito) < 32000));

-- 2) «Mis circuitos»: los circuitos que el entrenador guarda para reutilizarlos.
create table if not exists public.circuitos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre text not null check (char_length(nombre) between 1 and 60),
  datos jsonb not null check (jsonb_typeof(datos) = 'object' and pg_column_size(datos) < 32000),
  created_at timestamptz not null default now()
);
create index if not exists circuitos_owner_idx on public.circuitos (owner_id, created_at);

-- 3) Seguridad: cada entrenador solo ve y toca sus circuitos.
alter table public.circuitos enable row level security;
revoke all on public.circuitos from anon, authenticated;
grant select, insert, update, delete on public.circuitos to authenticated;
drop policy if exists "Mis circuitos" on public.circuitos;
create policy "Mis circuitos" on public.circuitos
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- 4) Plan gratuito: hasta 3 circuitos guardados. Plan Pro: sin límite.
--    (El mismo número está en CI_MAX de app.js.)
create or replace function public.limite_circuitos()
returns trigger language plpgsql security definer set search_path = public as $$
declare p text; n int;
begin
  select plan into p from public.perfiles where id = new.owner_id;
  if coalesce(p, 'gratis') = 'pro' then return new; end if;
  select count(*) into n from public.circuitos where owner_id = new.owner_id and id <> new.id;
  if n >= 3 then raise exception 'LIMITE_PLAN'; end if;
  return new;
end $$;
revoke all on function public.limite_circuitos() from public, anon, authenticated;
drop trigger if exists limite_circuitos on public.circuitos;
create trigger limite_circuitos
  before insert on public.circuitos
  for each row execute function public.limite_circuitos();

-- Comprobación: debe salir «circuito» y «circuitos».
select column_name as listo from information_schema.columns
 where table_schema = 'public' and table_name = 'entrenamientos' and column_name = 'circuito'
union all
select table_name from information_schema.tables
 where table_schema = 'public' and table_name = 'circuitos';
