-- Mi Fútbol JV32 · v11.39 · Tiros a puerta y tiros fuera desde el enlace del anotador
-- Pega todo esto en Supabase › SQL Editor y pulsa «Run». Se puede ejecutar más de una vez.
-- Añade una columna (directos.an_tiros: si el anotador puede apuntar tiros) y pone al día
-- las funciones ver_anotador y anotar. No borra ni cambia datos.
-- Sin esto la app funciona igual, pero el anotador no ve los botones de tiros.

-- 1) ¿Puede el anotador apuntar tiros? Lo activa la app del entrenador (Pro, o dentro del plan gratuito).
alter table public.directos add column if not exists an_tiros boolean not null default false;

-- 2) Lo que ve el anotador (ahora también si puede apuntar tiros).
create or replace function public.ver_anotador(codigo uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'equipo', equipo, 'rival', rival, 'modalidad', modalidad,
    'gf', gf, 'gc', gc, 'estado', estado, 'parte_min', parte_min,
    'acum_ms', acum_ms, 'desde', desde, 'eventos', eventos,
    'jugadores', coalesce(anot_jug, '[]'::jsonb), 'tiros', coalesce(an_tiros, false),
    'actualizado', actualizado, 'ahora', now())
  from public.directos where anotador = codigo;
$$;
revoke all on function public.ver_anotador(uuid) from public;
grant execute on function public.ver_anotador(uuid) to anon, authenticated;

-- 3) Apuntar algo. Nuevo: t 'tp' (tiro a puerta) y 'tf' (tiro fuera) de un jugador (pid),
--    y 'tr' (tiro del rival). Hasta 60 tiros por partido.
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
  if t is null or t not in ('f','c','fa','s','a','r','tp','tf','tr') then raise exception 'DATOS'; end if;
  select * into d from public.directos where anotador = codigo for update;
  if not found then raise exception 'NO_EXISTE'; end if;

  -- v11.39: los tiros solo si el entrenador los tiene activados (Pro, o dentro del plan gratuito)
  if t in ('tp','tf','tr') and not coalesce(d.an_tiros, false) then raise exception 'PRO_TIROS'; end if;

  if t = 'fa' then
    if (select count(*) from jsonb_array_elements(d.eventos) x where x->>'t' = 'fa') >= 40 then raise exception 'DEMASIADOS'; end if;
  elsif t in ('tp','tf','tr') then
    if (select count(*) from jsonb_array_elements(d.eventos) x where x->>'t' in ('tp','tf','tr')) >= 60 then raise exception 'DEMASIADOS'; end if;
  elsif (select count(*) from jsonb_array_elements(d.eventos) x where coalesce(x->>'t','') not in ('fa','tp','tf','tr')) >= 80 then
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

  -- v11.12: los cambios llevan la parte (p) y los del descanso ds:1 (no gastan ventana).
  -- En el descanso son siempre del descanso; en la 2ª parte o al final, si el anotador lo marca (ds = 1).
  if t = 's' then
    if d.estado = 'DES' or (ev->>'ds' = '1' and d.estado in ('2T','FIN')) then
      e := e || jsonb_build_object('m', d.parte_min, 'ds', 1, 'p', 2);
    else
      e := e || jsonb_build_object('p', case when d.estado in ('2T','FIN') then 2 else 1 end);
    end if;
  end if;

  if t in ('tp','tf') then
    -- Tiro de un jugador tuyo (a puerta o fuera): tiene que estar en la convocatoria.
    -- Se guarda corto (sin nombre) para que quepan muchos.
    select x into j from jsonb_array_elements(coalesce(d.anot_jug, '[]'::jsonb)) x where x->>'id' = ev->>'pid' limit 1;
    if j is null then raise exception 'JUGADOR'; end if;
    e := e || jsonb_build_object('pid', j->>'id', 'p', case when d.estado in ('2T','FIN') then 2 else 1 end);
  elsif t = 'tr' then
    e := e || jsonb_build_object('p', case when d.estado in ('2T','FIN') then 2 else 1 end);
  elsif t = 'fa' then
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
