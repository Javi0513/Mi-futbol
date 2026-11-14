-- Mi Fútbol JV32 · v11.37 · Plan para clubes: aviso claro si el club aún no ha pagado
-- Antes, si un entrenador escribía el código de un club que todavía no había pagado su pack,
-- le salía «Ese club ya tiene todas sus plazas ocupadas» (porque el club aún tiene 0 plazas).
-- Ahora le sale que el club todavía no ha pagado. No cambia nada más.
-- Cómo se usa: Supabase › SQL Editor › New query › pega todo › Run.

create or replace function public.unirse_club(codigo text, acepto boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c record; usadas int; ok boolean := coalesce(acepto, false);
begin
  if uid is null then raise exception 'No autenticado'; end if;
  if exists (select 1 from public.club_miembros where user_id = uid) then raise exception 'YA_EN_CLUB'; end if;
  select * into c from public.clubes cl
   where cl.codigo = upper(regexp_replace(coalesce(unirse_club.codigo, ''), '[^A-Za-z0-9]', '', 'g'))
   for update;
  if not found then raise exception 'CODIGO_NO_VALIDO'; end if;
  -- Club que todavía no ha pagado ningún pack (sin plazas)
  if coalesce(c.plazas, 0) < 1 then raise exception 'CLUB_SIN_PAGAR'; end if;
  select count(*) into usadas from public.club_miembros where club_id = c.id;
  if usadas >= c.plazas then raise exception 'CLUB_LLENO'; end if;
  insert into public.club_miembros (user_id, club_id, comparte, comparte_at)
    values (uid, c.id, ok, case when ok then now() end);
  return c.nombre;
end $$;

revoke all on function public.unirse_club(text, boolean) from public, anon;
grant execute on function public.unirse_club(text, boolean) to authenticated;
