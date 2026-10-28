-- =====================================================================
-- Mi Fútbol JV32 · CONTROL DE ENTRENAMIENTOS (v9.1)
-- Ejecutar en Supabase → SQL Editor. Se puede repetir sin riesgo.
-- No toca tus jugadores ni tus partidos: solo crea la tabla nueva.
-- =====================================================================

-- 1) Un entrenamiento por fila: fecha, hora y nota opcionales, y la asistencia
--    de cada jugador en JSON: {"<id del jugador>": "si" | "no" | "jus"}.
create table if not exists public.entrenamientos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  modalidad text not null check (modalidad in ('7','11','fs')),
  equipo_id uuid references public.equipos(id) on delete cascade,
  fecha date not null,
  hora text check (hora is null or hora ~ '^[0-2][0-9]:[0-5][0-9]$'),
  nota text check (nota is null or char_length(nota) <= 300),
  asistencia jsonb not null default '{}'::jsonb check (jsonb_typeof(asistencia) = 'object'),
  created_at timestamptz not null default now()
);
create index if not exists entrenamientos_owner_idx on public.entrenamientos (owner_id, modalidad, fecha);
create index if not exists entrenamientos_equipo_idx on public.entrenamientos (equipo_id);

-- 2) Seguridad: cada entrenador solo ve y toca sus entrenamientos.
alter table public.entrenamientos enable row level security;
revoke all on public.entrenamientos from anon, authenticated;
grant select, insert, update, delete on public.entrenamientos to authenticated;
drop policy if exists "Mis entrenamientos" on public.entrenamientos;
create policy "Mis entrenamientos" on public.entrenamientos
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- 3) El equipo tiene que ser tuyo y de la misma modalidad (misma regla que jugadores y partidos).
drop trigger if exists equipo_valido on public.entrenamientos;
create trigger equipo_valido
  before insert or update of equipo_id, modalidad on public.entrenamientos
  for each row execute function public.equipo_valido();

-- 4) Plan gratuito: hasta 5 entrenamientos por modalidad. Plan Pro: sin límite.
--    (El mismo número está en MODES.maxE de app.js.)
create or replace function public.limite_entrenamientos()
returns trigger language plpgsql security definer set search_path = public as $$
declare p text; n int;
begin
  if tg_op = 'UPDATE' and new.modalidad is not distinct from old.modalidad then
    return new;
  end if;
  select plan into p from public.perfiles where id = new.owner_id;
  if coalesce(p, 'gratis') = 'pro' then return new; end if;
  select count(*) into n from public.entrenamientos
   where owner_id = new.owner_id and modalidad = new.modalidad and id <> new.id;
  if n >= 5 then raise exception 'LIMITE_PLAN'; end if;
  return new;
end $$;
revoke all on function public.limite_entrenamientos() from public, anon, authenticated;
drop trigger if exists limite_entrenamientos on public.entrenamientos;
create trigger limite_entrenamientos
  before insert or update of modalidad on public.entrenamientos
  for each row execute function public.limite_entrenamientos();
