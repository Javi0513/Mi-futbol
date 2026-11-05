-- =====================================================================
-- Mi Fútbol JV32 · ENLACE DEL EQUIPO + MIS JUGADAS (v11.5)
-- Ejecutar en Supabase → SQL Editor. Se puede repetir sin riesgo.
-- 1-4) Enlace del equipo: los jugadores ven convocatoria, entrenos y jugadas y avisan si no pueden ir.
-- 5)   Vídeos de jugadas compartidos (Storage): gratis 2, Pro sin límite. Máx. 50 MB cada uno.
-- 6)   Mis jugadas (pizarra guardada con nombre): gratis 3, Pro sin límite.
-- =====================================================================

-- 1) Un enlace por equipo. Su "id" es el código secreto del enlace.
--    "datos" lo escribe la app del entrenador: equipo, jugadores (nombre y dorsal),
--    próximo partido, próximos entrenos y vídeos compartidos.
create table if not exists public.espacios (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  modalidad text not null check (modalidad in ('7','11','fs')),
  equipo_id text not null default '' check (char_length(equipo_id) <= 64),
  datos jsonb not null default '{}'::jsonb check (jsonb_typeof(datos) = 'object' and pg_column_size(datos) <= 300000),
  actualizado timestamptz not null default now(),
  unique (owner_id, modalidad, equipo_id)
);
alter table public.espacios enable row level security;
revoke all on public.espacios from anon, authenticated;
grant select, insert, update, delete on public.espacios to authenticated;
drop policy if exists "Mis enlaces de equipo" on public.espacios;
create policy "Mis enlaces de equipo" on public.espacios
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create or replace function public.espacio_hora()
returns trigger language plpgsql set search_path = public as $$
begin
  new.actualizado := now();
  return new;
end $$;
revoke all on function public.espacio_hora() from public, anon, authenticated;
drop trigger if exists espacio_hora on public.espacios;
create trigger espacio_hora before insert or update on public.espacios
  for each row execute function public.espacio_hora();

-- 2) Lo que contestan los jugadores: «Voy» o «No puedo ir» (con motivo).
create table if not exists public.espacio_respuestas (
  espacio_id uuid not null references public.espacios(id) on delete cascade,
  tipo text not null check (tipo in ('entreno','partido')),
  ref text not null check (char_length(ref) between 1 and 64),
  jugador_id text not null check (char_length(jugador_id) between 1 and 64),
  estado text not null check (estado in ('voy','no')),
  motivo text not null default '' check (char_length(motivo) <= 200),
  creado timestamptz not null default now(),
  primary key (espacio_id, tipo, ref, jugador_id)
);
alter table public.espacio_respuestas enable row level security;
revoke all on public.espacio_respuestas from anon, authenticated;
grant select, delete on public.espacio_respuestas to authenticated;
drop policy if exists "Respuestas de mis equipos" on public.espacio_respuestas;
create policy "Respuestas de mis equipos" on public.espacio_respuestas
  for all to authenticated
  using (exists (select 1 from public.espacios e where e.id = espacio_id and e.owner_id = (select auth.uid())));

-- 3) Página del jugador (sin cuenta, solo con el código del enlace).
--    Las respuestas salen sin el motivo: el motivo solo lo ve el entrenador.
create or replace function public.ver_espacio(codigo uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'datos', e.datos,
    'actualizado', e.actualizado,
    'respuestas', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', r.tipo, 'ref', r.ref, 'j', r.jugador_id, 'estado', r.estado))
        from public.espacio_respuestas r where r.espacio_id = e.id), '[]'::jsonb))
  from public.espacios e where e.id = codigo;
$$;
revoke all on function public.ver_espacio(uuid) from public;
grant execute on function public.ver_espacio(uuid) to anon, authenticated;

-- 4) El jugador contesta. Solo vale un jugador y un entreno/partido que estén en el enlace.
create or replace function public.responder_espacio(codigo uuid, p_tipo text, p_ref text, p_jugador text, p_estado text, p_motivo text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare d jsonb;
begin
  select datos into d from public.espacios where id = codigo;
  if d is null then raise exception 'Este enlace no existe'; end if;
  if p_estado not in ('voy','no') or p_tipo not in ('entreno','partido') then raise exception 'Respuesta no válida'; end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(d->'jugadores', '[]'::jsonb)) x where x->>'id' = p_jugador) then
    raise exception 'Ese jugador no está en el equipo';
  end if;
  if p_tipo = 'entreno' and not exists (select 1 from jsonb_array_elements(coalesce(d->'entrenos', '[]'::jsonb)) x where x->>'id' = p_ref) then
    raise exception 'Ese entreno ya no está';
  end if;
  if p_tipo = 'partido' and coalesce(d->'partido'->>'ref', '') <> p_ref then
    raise exception 'Ese partido ya no está';
  end if;
  insert into public.espacio_respuestas (espacio_id, tipo, ref, jugador_id, estado, motivo)
  values (codigo, p_tipo, p_ref, p_jugador, p_estado, left(coalesce(p_motivo, ''), 200))
  on conflict (espacio_id, tipo, ref, jugador_id)
  do update set estado = excluded.estado, motivo = excluded.motivo, creado = now();
  delete from public.espacio_respuestas where espacio_id = codigo and creado < now() - interval '120 days';
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.responder_espacio(uuid, text, text, text, text, text) from public;
grant execute on function public.responder_espacio(uuid, text, text, text, text, text) to anon, authenticated;

-- 5) Vídeos de jugadas para el enlace del equipo. Carpeta = id del entrenador.
--    Se ven con el enlace público del vídeo. Gratis: 2. Pro: sin límite (300 de seguridad).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('jugadas', 'jugadas', true, 52428800, array['video/*'])
on conflict (id) do update set public = true, file_size_limit = 52428800, allowed_mime_types = array['video/*'];

create or replace function public.jugadas_puede_subir()
returns boolean language plpgsql stable security definer set search_path = public, storage as $$
declare n int; p text;
begin
  select count(*) into n from storage.objects
   where bucket_id = 'jugadas' and name like (auth.uid())::text || '/%';
  select plan into p from public.perfiles where id = auth.uid();
  return n < (case when coalesce(p, 'gratis') = 'pro' then 300 else 2 end);
end $$;
revoke all on function public.jugadas_puede_subir() from public, anon;
grant execute on function public.jugadas_puede_subir() to authenticated;

drop policy if exists "Jugadas: subir las mías" on storage.objects;
create policy "Jugadas: subir las mías" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'jugadas' and (storage.foldername(name))[1] = (select auth.uid())::text and public.jugadas_puede_subir());
drop policy if exists "Jugadas: ver las mías" on storage.objects;
create policy "Jugadas: ver las mías" on storage.objects
  for select to authenticated
  using (bucket_id = 'jugadas' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Jugadas: borrar las mías" on storage.objects;
create policy "Jugadas: borrar las mías" on storage.objects
  for delete to authenticated
  using (bucket_id = 'jugadas' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 6) Mis jugadas: la pizarra guardada con nombre (se ve en el móvil y en el ordenador).
create table if not exists public.jugadas_guardadas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  modalidad text not null check (modalidad in ('7','11','fs')),
  nombre text not null check (char_length(nombre) between 1 and 60),
  datos jsonb not null check (jsonb_typeof(datos) = 'object' and pg_column_size(datos) <= 300000),
  creado timestamptz not null default now()
);
alter table public.jugadas_guardadas enable row level security;
revoke all on public.jugadas_guardadas from anon, authenticated;
grant select, insert, update, delete on public.jugadas_guardadas to authenticated;
drop policy if exists "Mis jugadas" on public.jugadas_guardadas;
create policy "Mis jugadas" on public.jugadas_guardadas
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create or replace function public.limite_jugadas_guardadas()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int; p text;
begin
  select count(*) into n from public.jugadas_guardadas where owner_id = new.owner_id;
  select plan into p from public.perfiles where id = new.owner_id;
  if n >= (case when coalesce(p, 'gratis') = 'pro' then 2000 else 3 end) then
    raise exception 'En el plan gratuito puedes guardar 3 jugadas. Con el plan Pro, sin límite.';
  end if;
  return new;
end $$;
revoke all on function public.limite_jugadas_guardadas() from public, anon, authenticated;
drop trigger if exists limite_jugadas_guardadas on public.jugadas_guardadas;
create trigger limite_jugadas_guardadas before insert on public.jugadas_guardadas
  for each row execute function public.limite_jugadas_guardadas();
