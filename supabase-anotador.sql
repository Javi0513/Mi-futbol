-- =====================================================================
-- Mi Fútbol JV32 · ANOTADOR DEL DIRECTO (v11.8)
-- Otra persona (delegado, un padre…) apunta goles, faltas, cambios y tarjetas
-- desde su móvil con un enlace secreto (?anotar=<código>), sin cuenta.
-- Ejecutar en Supabase → SQL Editor DESPUÉS de supabase-directo.sql. Se puede repetir sin riesgo.
-- =====================================================================

-- 1) Código secreto del anotador (null = sin anotador) y la lista de convocados que ve
--    (solo id, nombre, dorsal y si es titular).
alter table public.directos add column if not exists anotador uuid;
alter table public.directos add column if not exists anot_jug jsonb;
create unique index if not exists directos_anotador_key on public.directos (anotador) where anotador is not null;
alter table public.directos drop constraint if exists directos_anot_jug_check;
alter table public.directos add constraint directos_anot_jug_check
  check (anot_jug is null or (jsonb_typeof(anot_jug) = 'array' and pg_column_size(anot_jug) <= 8000));

-- 2) Lo que ve el anotador: el marcador, el reloj, lo apuntado y los convocados.
create or replace function public.ver_anotador(codigo uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'equipo', equipo, 'rival', rival, 'modalidad', modalidad,
    'gf', gf, 'gc', gc, 'estado', estado, 'parte_min', parte_min,
    'acum_ms', acum_ms, 'desde', desde, 'eventos', eventos,
    'jugadores', coalesce(anot_jug, '[]'::jsonb),
    'actualizado', actualizado, 'ahora', now())
  from public.directos where anotador = codigo;
$$;
revoke all on function public.ver_anotador(uuid) from public;
grant execute on function public.ver_anotador(uuid) to anon, authenticated;

-- 3) Apuntar algo. El minuto lo calcula el servidor con el reloj del entrenador.
--    ev: {t:'f'|'c'|'fa'|'s'|'a'|'r', pid?, pin?, r?:1, d?, di?, n?}
drop function if exists public.anotar(uuid, jsonb);
create or replace function public.anotar(codigo uuid, ev jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d public.directos;
  t text := ev->>'t';
  e jsonb;
  j jsonb;
  ms bigint;
  mn int;
  dor text;
  nom text;
begin
  if t is null or t not in ('f','c','fa','s','a','r') then raise exception 'DATOS'; end if;
  select * into d from public.directos where anotador = codigo for update;
  if not found then raise exception 'NO_EXISTE'; end if;

  if t = 'fa' then
    if (select count(*) from jsonb_array_elements(d.eventos) x where x->>'t' = 'fa') >= 40 then raise exception 'DEMASIADOS'; end if;
  elsif (select count(*) from jsonb_array_elements(d.eventos) x where x->>'t' is distinct from 'fa') >= 80 then
    raise exception 'DEMASIADOS';
  end if;

  ms := d.acum_ms + case when d.desde is not null then greatest(0, (extract(epoch from now() - d.desde) * 1000)::bigint) else 0 end;
  mn := case d.estado
          when 'pre' then 0
          when 'DES' then d.parte_min
          when 'FIN' then d.parte_min * 2
          else (ms / 60000)::int + 1 + case when d.estado = '2T' then d.parte_min else 0 end
        end;
  e := jsonb_build_object('id', 'an' || substr(md5(random()::text || clock_timestamp()::text), 1, 8), 'm', mn, 't', t, 'an', 1);

  if t = 'fa' then
    e := e || jsonb_build_object('p', case when d.estado in ('2T','FIN') then 2 else 1 end);
    if ev->>'r' = '1' then e := e || '{"r":1}'::jsonb; end if;
  elsif t in ('s','a','r') and ev->>'r' = '1' then
    -- Del rival: solo dorsales (0-99) y nombre opcional
    e := e || '{"r":1}'::jsonb;
    dor := case when coalesce(ev->>'d','') ~ '^[0-9]{1,2}$' then ev->>'d' end;
    if dor is not null then e := e || jsonb_build_object('d', dor); end if;
    if t = 's' then
      dor := case when coalesce(ev->>'di','') ~ '^[0-9]{1,2}$' then ev->>'di' end;
      if dor is not null then e := e || jsonb_build_object('di', dor); end if;
      if not (e ? 'd' or e ? 'di') then raise exception 'DATOS'; end if;
    else
      nom := left(btrim(coalesce(ev->>'n','')), 30);
      if nom <> '' then e := e || jsonb_build_object('n', nom); end if;
      if not (e ? 'd' or e ? 'n') then raise exception 'DATOS'; end if;
    end if;
  elsif t in ('f','s','a','r') then
    -- De tu equipo: el jugador tiene que estar en la convocatoria
    if coalesce(ev->>'pid','') <> '' then
      select x into j from jsonb_array_elements(coalesce(d.anot_jug, '[]'::jsonb)) x where x->>'id' = ev->>'pid' limit 1;
      if j is null then raise exception 'JUGADOR'; end if;
      e := e || jsonb_build_object('pid', j->>'id', 'n', j->>'n') || case when coalesce(j->>'d','') <> '' then jsonb_build_object('d', j->>'d') else '{}'::jsonb end;
    elsif t <> 'f' then
      raise exception 'JUGADOR';
    end if;
    if t = 's' then
      j := null;
      select x into j from jsonb_array_elements(coalesce(d.anot_jug, '[]'::jsonb)) x where x->>'id' = ev->>'pin' limit 1;
      if j is null then raise exception 'JUGADOR'; end if;
      e := e || jsonb_build_object('pin', j->>'id', 'ni', j->>'n') || case when coalesce(j->>'d','') <> '' then jsonb_build_object('di', j->>'d') else '{}'::jsonb end;
    end if;
  end if;

  update public.directos set
    eventos = eventos || jsonb_build_array(e),
    gf = case when t = 'f' then least(99, gf + 1) else gf end,
    gc = case when t = 'c' then least(99, gc + 1) else gc end
  where id = d.id;
  return public.ver_anotador(codigo);
end $$;
revoke all on function public.anotar(uuid, jsonb) from public;
grant execute on function public.anotar(uuid, jsonb) to anon, authenticated;

-- 4) Quitar algo apuntado DESDE EL ANOTADOR (lo del entrenador no se puede tocar desde aquí).
create or replace function public.anotar_quitar(codigo uuid, evento text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d public.directos;
  e jsonb;
begin
  select * into d from public.directos where anotador = codigo for update;
  if not found then raise exception 'NO_EXISTE'; end if;
  select x into e from jsonb_array_elements(d.eventos) x where x->>'id' = evento and x->>'an' = '1' limit 1;
  if e is null then return public.ver_anotador(codigo); end if;
  update public.directos set
    eventos = (select coalesce(jsonb_agg(x order by o), '[]'::jsonb)
               from jsonb_array_elements(d.eventos) with ordinality as z(x, o)
               where x->>'id' is distinct from evento),
    gf = case when e->>'t' = 'f' then greatest(0, gf - 1) else gf end,
    gc = case when e->>'t' = 'c' then greatest(0, gc - 1) else gc end
  where id = d.id;
  return public.ver_anotador(codigo);
end $$;
revoke all on function public.anotar_quitar(uuid, text) from public;
grant execute on function public.anotar_quitar(uuid, text) to anon, authenticated;
