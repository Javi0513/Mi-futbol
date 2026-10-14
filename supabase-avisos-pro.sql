-- =====================================================================
-- Mi Fútbol JV32 · LISTA DE AVISOS DEL PLAN PRO (+ aviso por email para ti)
-- Ejecutar en Supabase → SQL Editor. Se puede repetir sin riesgo.
-- =====================================================================

-- 1) Lista de usuarios que pulsan «Avísame cuando esté disponible».
create table if not exists public.interesados_pro (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  email text not null check (char_length(email) between 3 and 254),
  created_at timestamptz not null default now(),
  unique (user_id)
);
alter table public.interesados_pro enable row level security;
revoke all on public.interesados_pro from anon, authenticated;
grant select, insert on public.interesados_pro to authenticated;
drop policy if exists "Ver mi aviso" on public.interesados_pro;
create policy "Ver mi aviso" on public.interesados_pro
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Apuntarme" on public.interesados_pro;
create policy "Apuntarme" on public.interesados_pro
  for insert to authenticated with check (user_id = (select auth.uid()));

-- 2) Ajustes privados (clave de Resend y tu email). Nadie desde la app puede leerlos.
create table if not exists public.ajustes_privados (
  clave text primary key,
  valor text not null
);
alter table public.ajustes_privados enable row level security;
revoke all on public.ajustes_privados from anon, authenticated;

-- 3) Envío de correo desde la base de datos (extensión pg_net de Supabase).
create extension if not exists pg_net;

create or replace function public.avisar_interesado()
returns trigger language plpgsql security definer set search_path = public as $$
declare k text; dest text; n int;
begin
  begin
    select valor into k    from public.ajustes_privados where clave = 'resend_key';
    select valor into dest from public.ajustes_privados where clave = 'aviso_email';
    if k is null or dest is null then return new; end if;
    select count(*) into n from public.interesados_pro;
    perform net.http_post(
      url     := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization', 'Bearer ' || k, 'Content-Type', 'application/json'),
      body    := jsonb_build_object(
        'from',    'Mi Futbol JV32 <onboarding@resend.dev>',
        'to',      jsonb_build_array(dest),
        'subject', 'Nuevo interesado en el plan Pro (' || n || ' en total)',
        'text',    'Se ha apuntado ' || new.email || ' para que le avises cuando el plan Pro esté disponible. Total de interesados: ' || n || '.')
    );
  exception when others then
    null;  -- si el correo falla, el usuario se apunta igualmente
  end;
  return new;
end $$;
revoke all on function public.avisar_interesado() from public, anon, authenticated;
drop trigger if exists avisar_interesado on public.interesados_pro;
create trigger avisar_interesado after insert on public.interesados_pro
  for each row execute function public.avisar_interesado();

-- 4) PARA ACTIVAR EL AVISO POR CORREO, ejecuta esto UNA VEZ con tus datos
--    (quita los dos guiones del principio de las 3 líneas y cambia los textos):
-- insert into public.ajustes_privados (clave, valor) values
--   ('resend_key',  're_TU_CLAVE_DE_RESEND'),
--   ('aviso_email', 'tu-correo@ejemplo.com')
-- on conflict (clave) do update set valor = excluded.valor;
