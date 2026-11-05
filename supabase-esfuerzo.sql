-- =====================================================================
-- Mi Fútbol JV32 · ESFUERZO DE LOS JUGADORES + PREPARADOR FÍSICO (v11.6)
-- Ejecutar en Supabase → SQL Editor. Se puede repetir sin riesgo.
-- Necesita antes supabase-equipo.sql (v11.5). No borra nada.
-- 1) Los jugadores anotan su esfuerzo (1 a 10) desde el enlace del equipo.
-- 2) Enlace aparte, solo para mirar, para el preparador físico (?carga=<código>).
-- =====================================================================

-- 1) Código secreto del enlace del preparador físico (vacío = no hay enlace)
alter table public.espacios add column if not exists codigo_pf uuid;
create unique index if not exists espacios_codigo_pf on public.espacios (codigo_pf) where codigo_pf is not null;

-- 2) Esfuerzo que anota cada jugador después de un entreno o un partido
create table if not exists public.espacio_esfuerzos (
  espacio_id uuid not null references public.espacios(id) on delete cascade,
  tipo text not null check (tipo in ('entreno','partido')),
  ref text not null check (char_length(ref) between 1 and 64),
  jugador_id text not null check (char_length(jugador_id) between 1 and 64),
  rpe smallint not null check (rpe between 1 and 10),
  creado timestamptz not null default now(),
  primary key (espacio_id, tipo, ref, jugador_id)
);
alter table public.espacio_esfuerzos enable row level security;
revoke all on public.espacio_esfuerzos from anon, authenticated;
grant select, delete on public.espacio_esfuerzos to authenticated;
drop policy if exists "Esfuerzos de mis equipos" on public.espacio_esfuerzos;
create policy "Esfuerzos de mis equipos" on public.espacio_esfuerzos
  for all to authenticated
  using (exists (select 1 from public.espacios e where e.id = espacio_id and e.owner_id = (select auth.uid())));

-- 3) El jugador anota su esfuerzo. Solo vale una sesión que el entrenador haya puesto
--    en el enlace (los últimos días) y un jugador que pueda anotarla.
create or replace function public.anotar_esfuerzo(codigo uuid, p_tipo text, p_ref text, p_jugador text, p_rpe int)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare d jsonb; s jsonb;
begin
  select datos into d from public.espacios where id = codigo;
  if d is null then raise exception 'Este enlace no existe'; end if;
  if coalesce(d->>'pideEsf', 'true') = 'false' then raise exception 'El entrenador no pide el esfuerzo'; end if;
  if p_rpe is null or p_rpe < 1 or p_rpe > 10 or p_tipo not in ('entreno','partido') then raise exception 'Respuesta no válida'; end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(d->'jugadores', '[]'::jsonb)) x where x->>'id' = p_jugador) then
    raise exception 'Ese jugador no está en el equipo';
  end if;
  select x into s from jsonb_array_elements(coalesce(d->'esf', '[]'::jsonb)) x
   where x->>'t' = p_tipo and x->>'ref' = p_ref limit 1;
  if s is null then raise exception 'Esa sesión ya no está'; end if;
  if jsonb_typeof(s->'j') = 'array' and not (s->'j') ? p_jugador then
    raise exception 'No estás en esa sesión';
  end if;
  insert into public.espacio_esfuerzos (espacio_id, tipo, ref, jugador_id, rpe)
  values (codigo, p_tipo, p_ref, p_jugador, p_rpe)
  on conflict (espacio_id, tipo, ref, jugador_id)
  do update set rpe = excluded.rpe, creado = now();
  delete from public.espacio_esfuerzos where espacio_id = codigo and creado < now() - interval '120 days';
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.anotar_esfuerzo(uuid, text, text, text, int) from public;
grant execute on function public.anotar_esfuerzo(uuid, text, text, text, int) to anon, authenticated;

-- 4) Página del jugador: igual que antes y además quién ha anotado ya su esfuerzo
--    (sin el número: el esfuerzo solo lo ven el entrenador y el preparador).
create or replace function public.ver_espacio(codigo uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'datos', e.datos,
    'actualizado', e.actualizado,
    'respuestas', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', r.tipo, 'ref', r.ref, 'j', r.jugador_id, 'estado', r.estado))
        from public.espacio_respuestas r where r.espacio_id = e.id), '[]'::jsonb),
    'esfuerzos', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', f.tipo, 'ref', f.ref, 'j', f.jugador_id))
        from public.espacio_esfuerzos f where f.espacio_id = e.id), '[]'::jsonb))
  from public.espacios e where e.id = codigo;
$$;
revoke all on function public.ver_espacio(uuid) from public;
grant execute on function public.ver_espacio(uuid) to anon, authenticated;

-- 5) Página del preparador físico (solo mirar): equipo, jugadores, sesiones con carga
--    y el esfuerzo que han anotado los jugadores. No da convocatorias, motivos ni vídeos.
create or replace function public.ver_carga(codigo uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'equipo', e.datos->'equipo',
    'modalidad', e.datos->'modalidad',
    'jugadores', coalesce(e.datos->'jugadores', '[]'::jsonb),
    'cg', e.datos->'cg',
    'actualizado', e.actualizado,
    'esfuerzos', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', f.tipo, 'ref', f.ref, 'j', f.jugador_id, 'rpe', f.rpe))
        from public.espacio_esfuerzos f where f.espacio_id = e.id), '[]'::jsonb))
  from public.espacios e where e.codigo_pf = codigo;
$$;
revoke all on function public.ver_carga(uuid) from public;
grant execute on function public.ver_carga(uuid) to anon, authenticated;

-- Comprobación: debe salir una fila con «listo».
select 'listo' as resultado
 where exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'espacios' and column_name = 'codigo_pf')
   and to_regclass('public.espacio_esfuerzos') is not null
   and to_regprocedure('public.anotar_esfuerzo(uuid,text,text,text,integer)') is not null
   and to_regprocedure('public.ver_carga(uuid)') is not null;
