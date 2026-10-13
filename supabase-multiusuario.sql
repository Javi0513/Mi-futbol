-- =====================================================================
-- Mi Fútbol JV32 · MULTIUSUARIO + FÚTBOL SALA + LÍMITES · ejecutar en SQL Editor
-- Convierte la base de un solo cliente en una base para muchos entrenadores.
-- Cada usuario ve y modifica SOLO sus datos. Los datos de Juandi se conservan.
-- Es seguro volver a ejecutarlo (idempotente).
-- =====================================================================

-- 1) Perfiles: aquí vive el plan de cada usuario (gratis / pro).
create table if not exists public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'gratis' check (plan in ('gratis','pro')),
  acepto_terminos_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.perfiles add column if not exists terms_version text;
alter table public.perfiles enable row level security;
revoke all on public.perfiles from anon, authenticated;
grant select on public.perfiles to authenticated;      -- solo lectura: nadie se cambia el plan
drop policy if exists "Ver mi perfil" on public.perfiles;
create policy "Ver mi perfil" on public.perfiles
  for select to authenticated using (id = (select auth.uid()));

-- 2) Al registrarse alguien, se crea su perfil automáticamente.
create or replace function public.crear_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, terms_version)
  values (new.id, nullif(left(coalesce(new.raw_user_meta_data->>'terms_version', ''), 20), ''))
  on conflict (id) do nothing;
  return new;
end $$;
revoke all on function public.crear_perfil() from public, anon, authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.crear_perfil();

-- 3) Usuarios que ya existen (Juandi y tú) pasan a plan PRO, sin límites.
insert into public.perfiles (id, plan)
  select id, 'pro' from auth.users
  on conflict (id) do update set plan = 'pro';

-- 4) Seguridad por usuario: cada fila solo la ve y toca su dueño.
drop policy if exists "Solo cliente jugadores" on public.futbol_personal_jugadores;
drop policy if exists "Solo cliente partidos"  on public.futbol_personal_partidos;
drop policy if exists "Mis jugadores" on public.futbol_personal_jugadores;
drop policy if exists "Mis partidos"  on public.futbol_personal_partidos;
create policy "Mis jugadores" on public.futbol_personal_jugadores
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "Mis partidos" on public.futbol_personal_partidos
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- 5) Tamaños máximos (protegen la base de abusos). Solo afectan a filas nuevas.
alter table public.futbol_personal_jugadores drop constraint if exists jugadores_foto_max;
alter table public.futbol_personal_jugadores
  add constraint jugadores_foto_max check (char_length(foto) <= 90000) not valid;
alter table public.futbol_personal_partidos drop constraint if exists partidos_tam_max;
alter table public.futbol_personal_partidos
  add constraint partidos_tam_max check (
    char_length(participaciones) <= 60000 and char_length(alineacion) <= 20000) not valid;

-- 5b) Nueva modalidad: Fútbol sala ('fs'). Se amplía la lista de modalidades permitidas.
alter table public.futbol_personal_jugadores drop constraint if exists futbol_personal_jugadores_modalidad_check;
alter table public.futbol_personal_jugadores add constraint futbol_personal_jugadores_modalidad_check
  check (modalidad in ('7','11','fs'));
alter table public.futbol_personal_partidos drop constraint if exists futbol_personal_partidos_modalidad_check;
alter table public.futbol_personal_partidos add constraint futbol_personal_partidos_modalidad_check
  check (modalidad in ('7','11','fs'));

-- 6) Límites del plan GRATIS, por modalidad (el plan pro no tiene límites):
--    jugadores: Fútbol 11 = 25 · Fútbol 7 = 14 · Fútbol sala = 16   |   partidos: 10 en cada modalidad
--    Se aplican al CREAR y también al MOVER filas a otra modalidad (así no se pueden saltar).
create or replace function public.limite_plan()
returns trigger language plpgsql security definer set search_path = public as $$
declare p text; n int; lim int;
begin
  -- Un UPDATE que no cambia de modalidad (p. ej. editar el nombre) no cuenta.
  if tg_op = 'UPDATE' and new.modalidad is not distinct from old.modalidad then
    return new;
  end if;
  select plan into p from public.perfiles where id = new.owner_id;
  if coalesce(p, 'gratis') = 'pro' then return new; end if;
  if tg_table_name = 'futbol_personal_jugadores' then
    lim := case new.modalidad when '11' then 25 when '7' then 14 else 16 end;
  else
    lim := 10;
  end if;
  execute format('select count(*) from public.%I
                  where owner_id = $1 and modalidad = $2 and id <> $3', tg_table_name)
    into n using new.owner_id, new.modalidad, new.id;
  if n >= lim then raise exception 'LIMITE_PLAN'; end if;
  return new;
end $$;
revoke all on function public.limite_plan() from public, anon, authenticated;
drop trigger if exists limite_jugadores on public.futbol_personal_jugadores;
create trigger limite_jugadores
  before insert or update of modalidad on public.futbol_personal_jugadores
  for each row execute function public.limite_plan();
drop trigger if exists limite_partidos on public.futbol_personal_partidos;
create trigger limite_partidos
  before insert or update of modalidad on public.futbol_personal_partidos
  for each row execute function public.limite_plan();

-- 7) Borrar mi cuenta (derecho de supresión): la llama el botón «Borrar mi cuenta».
create or replace function public.borrar_mi_cuenta()
returns void language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'No autenticado'; end if;
  delete from public.futbol_personal_partidos  where owner_id = uid;
  delete from public.futbol_personal_jugadores where owner_id = uid;
  delete from public.perfiles where id = uid;
  delete from auth.users where id = uid;
end $$;
revoke all on function public.borrar_mi_cuenta() from public, anon;
grant execute on function public.borrar_mi_cuenta() to authenticated;

-- 8) Para subir un usuario a PRO cuando pague (cambia el email):
--    update public.perfiles set plan = 'pro'
--    where id = (select id from auth.users where email = 'entrenador@correo.com');
