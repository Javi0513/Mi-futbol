-- Mi Fútbol JV32 · v11.30 · El anotador también lleva el reloj (empezar, pausar, descanso, 2ª parte, terminar)
-- Pega todo esto en Supabase › SQL Editor y pulsa «Run». Se puede ejecutar más de una vez.
-- Añade una sola función nueva (anotar_reloj). No toca tablas ni datos.
-- Sin esto la app funciona igual, pero los botones del reloj del anotador avisan de que falta este paso.

create or replace function public.anotar_reloj(codigo uuid, accion text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d public.directos;
  ms bigint;
begin
  if accion is null or accion not in ('start','pause','resume','half','start2','end') then raise exception 'DATOS'; end if;
  select * into d from public.directos where anotador = codigo for update;
  if not found then raise exception 'NO_EXISTE'; end if;

  -- Tiempo que lleva la parte ahora mismo (lo que ya había + lo que ha corrido desde que arrancó)
  ms := least(36000000, d.acum_ms + case when d.desde is not null
          then greatest(0, (extract(epoch from now() - d.desde) * 1000)::bigint) else 0 end);

  -- Solo se hace si toca (si el entrenador ya lo ha hecho a la vez, no cambia nada).
  -- La hora de arranque (desde) la pone el disparador directo_hora con la hora del servidor.
  if accion = 'start' and d.estado = 'pre' then
    update public.directos set estado = '1T', acum_ms = 0, desde = now() where id = d.id;
  elsif accion = 'pause' and d.estado in ('1T','2T') and d.desde is not null then
    update public.directos set acum_ms = ms, desde = null where id = d.id;
  elsif accion = 'resume' and d.estado in ('1T','2T') and d.desde is null then
    update public.directos set desde = now() where id = d.id;
  elsif accion = 'half' and d.estado = '1T' then
    update public.directos set estado = 'DES', acum_ms = ms, desde = null where id = d.id;
  elsif accion = 'start2' and d.estado = 'DES' then
    update public.directos set estado = '2T', acum_ms = 0, desde = now() where id = d.id;
  elsif accion = 'end' and d.estado = '2T' then
    update public.directos set estado = 'FIN', acum_ms = ms, desde = null where id = d.id;
  end if;
  return public.ver_anotador(codigo);
end $$;
revoke all on function public.anotar_reloj(uuid, text) from public;
grant execute on function public.anotar_reloj(uuid, text) to anon, authenticated;
