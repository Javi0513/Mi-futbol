-- =====================================================================
-- Mi Fútbol JV32 · MEJORAS DE SEGURIDAD (v7.9)
-- Ejecutar en Supabase → SQL Editor. Se puede repetir sin riesgo.
-- No borra ni cambia ningún dato que ya tengas.
-- =====================================================================

-- 1) Las fotos de jugadores solo pueden ser imágenes (nada de texto raro ni enlaces).
alter table public.futbol_personal_jugadores drop constraint if exists jugadores_foto_imagen;
alter table public.futbol_personal_jugadores
  add constraint jugadores_foto_imagen
  check (foto is null or foto = '' or foto like 'data:image/%') not valid;

-- 2) En la lista de avisos Pro, cada uno solo puede apuntar SU propio email.
drop policy if exists "Apuntarme" on public.interesados_pro;
create policy "Apuntarme" on public.interesados_pro
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and lower(email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
  );

-- 3) Mover la extensión pg_net (la que envía los emails de aviso) fuera del
--    esquema público, como recomienda Supabase. Los avisos siguen funcionando igual.
do $$
begin
  if exists (select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace
             where e.extname = 'pg_net' and n.nspname = 'public') then
    drop extension pg_net;
    create extension pg_net with schema extensions;
  end if;
end $$;
