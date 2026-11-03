-- =====================================================================
-- Mi Fútbol JV32 · MIS EJERCICIOS (v11.1)
-- Ejecutar en Supabase → SQL Editor. Se puede repetir sin riesgo.
-- No toca nada de lo que ya hay: solo crea una tabla nueva.
-- =====================================================================

-- 1) Los ejercicios que el entrenador guarda para reutilizarlos en otros entrenos:
--    datos = {"n": nombre, "d": cómo se hace, "t": segundos}
create table if not exists public.ejercicios_guardados (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  datos jsonb not null check (jsonb_typeof(datos) = 'object' and pg_column_size(datos) < 4000),
  created_at timestamptz not null default now()
);
create index if not exists ejercicios_guardados_owner_idx on public.ejercicios_guardados (owner_id, created_at);

-- 2) Seguridad: cada entrenador solo ve y toca sus ejercicios.
alter table public.ejercicios_guardados enable row level security;
revoke all on public.ejercicios_guardados from anon, authenticated;
grant select, insert, update, delete on public.ejercicios_guardados to authenticated;
drop policy if exists "Mis ejercicios" on public.ejercicios_guardados;
create policy "Mis ejercicios" on public.ejercicios_guardados
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- 3) Gratis para todos, con un tope de seguridad de 200 por entrenador
--    (el mismo número está en EG_MAX de app.js).
create or replace function public.limite_ejercicios_guardados()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) into n from public.ejercicios_guardados where owner_id = new.owner_id and id <> new.id;
  if n >= 200 then raise exception 'Puedes guardar hasta 200 ejercicios'; end if;
  return new;
end $$;
revoke all on function public.limite_ejercicios_guardados() from public, anon, authenticated;
drop trigger if exists limite_ejercicios_guardados on public.ejercicios_guardados;
create trigger limite_ejercicios_guardados
  before insert on public.ejercicios_guardados
  for each row execute function public.limite_ejercicios_guardados();

-- Comprobación: debe salir «ejercicios_guardados».
select table_name as listo from information_schema.tables
 where table_schema = 'public' and table_name = 'ejercicios_guardados';
