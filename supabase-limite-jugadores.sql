-- =====================================================================
-- Mi Fútbol JV32 · NUEVO LÍMITE DE JUGADORES DEL PLAN GRATUITO (v11.23)
-- Ejecutar en Supabase → SQL Editor. Se puede repetir sin riesgo.
-- Jugadores en gratis: Fútbol 7 = 10 · Fútbol sala = 10 · Fútbol 11 = 16 (antes 14 / 16 / 25).
-- Partidos: 5 por modalidad (sin cambios). Plan Pro: sin límites.
-- No borra nada: quien ya tenga más jugadores los conserva; el límite solo
-- se comprueba al CREAR un jugador o al MOVERLO a otra modalidad.
-- =====================================================================
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
    lim := case new.modalidad when '11' then 16 else 10 end;
  else
    lim := 5;
  end if;
  execute format('select count(*) from public.%I
                  where owner_id = $1 and modalidad = $2 and id <> $3', tg_table_name)
    into n using new.owner_id, new.modalidad, new.id;
  if n >= lim then raise exception 'LIMITE_PLAN'; end if;
  return new;
end $$;
revoke all on function public.limite_plan() from public, anon, authenticated;

-- Comprobación: debe salir «16 else 10».
select position('16 else 10' in pg_get_functiondef('public.limite_plan'::regproc)) > 0 as limite_nuevo_ok;
