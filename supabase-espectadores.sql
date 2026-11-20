-- =====================================================================
-- Mi Fútbol JV32 · ESPECTADORES DEL DIRECTO (v11.51)
-- Cuántas personas tienen abierto ahora mismo el enlace del directo (lo ven el entrenador y quien lo sigue).
-- Ejecutar en Supabase → SQL Editor DESPUÉS de supabase-directo.sql. Se puede repetir sin riesgo.
-- =====================================================================

-- 1) Quién está viendo: cada página del enlace avisa cada 10 s con un código al azar (sin datos personales).
create table if not exists public.directo_vistas (
  directo uuid not null references public.directos(id) on delete cascade,
  quien text not null,
  visto timestamptz not null default now(),
  primary key (directo, quien)
);
alter table public.directo_vistas enable row level security;
-- Sin políticas: solo se toca desde las funciones de abajo.

-- 2) La página del enlace (sin cuenta) dice «sigo mirando» y recibe cuántos están viendo ahora.
drop function if exists public.directo_visto(uuid, text);
create or replace function public.directo_visto(codigo uuid, quien text)
returns integer language plpgsql volatile security definer set search_path = public as $$
declare n integer;
begin
  if quien is null or length(quien) < 8 or length(quien) > 40 then return null; end if;
  if not exists (select 1 from public.directos where id = codigo) then return null; end if;
  insert into public.directo_vistas (directo, quien, visto) values (codigo, quien, now())
  on conflict (directo, quien) do update set visto = now();
  -- limpieza: lo de hace más de un día ya no sirve
  delete from public.directo_vistas where directo = codigo and visto < now() - interval '1 day';
  select count(*)::int into n from public.directo_vistas where directo = codigo and visto > now() - interval '35 seconds';
  return n;
end $$;
revoke all on function public.directo_visto(uuid, text) from public;
grant execute on function public.directo_visto(uuid, text) to anon, authenticated;

-- 3) El entrenador (solo el dueño del directo) ve cuántos lo están viendo ahora (último aviso hace menos de 35 s).
create or replace function public.directo_viendo(codigo uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from public.directo_vistas v
  join public.directos d on d.id = v.directo
  where v.directo = codigo and d.owner_id = auth.uid() and v.visto > now() - interval '35 seconds';
$$;
revoke all on function public.directo_viendo(uuid) from public;
grant execute on function public.directo_viendo(uuid) to authenticated;
