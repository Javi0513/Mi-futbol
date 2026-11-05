-- =====================================================================
-- Mi Fútbol JV32 · LÍMITES DEL PLAN GRATUITO (v11.4)
-- Ejecutar en Supabase → SQL Editor. Se puede repetir sin riesgo.
-- 1-3) Dispositivos: la misma cuenta en 3 como máximo en gratis; con Pro, sin límite.
-- 4)   «Mis ejercicios»: 5 en gratis; con Pro, sin límite.
-- =====================================================================

-- 1) Los dispositivos (móvil, tablet, ordenador) donde cada entrenador usa la app.
--    id = código al azar que la app guarda en ese dispositivo.
create table if not exists public.dispositivos (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null check (char_length(id) between 8 and 64),
  nombre text not null default 'Dispositivo' check (char_length(nombre) <= 60),
  visto timestamptz not null default now(),
  primary key (owner_id, id)
);

-- 2) Seguridad: cada entrenador ve y quita solo los suyos. Se añaden solo con la función de abajo.
alter table public.dispositivos enable row level security;
revoke all on public.dispositivos from anon, authenticated;
grant select, delete on public.dispositivos to authenticated;
drop policy if exists "Mis dispositivos" on public.dispositivos;
create policy "Mis dispositivos" on public.dispositivos
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- 3) La app la llama al entrar. Si el dispositivo ya está, solo apunta la fecha.
--    Si es nuevo: con Pro entra siempre; en gratis, solo si hay menos de 3.
--    Los que lleven más de 60 días sin abrir la app se quitan solos.
create or replace function public.registrar_dispositivo(p_id text, p_nombre text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); p text; n int;
begin
  if uid is null then raise exception 'No autenticado'; end if;
  if p_id is null or char_length(p_id) not between 8 and 64 then raise exception 'Dispositivo no válido'; end if;
  delete from public.dispositivos where owner_id = uid and visto < now() - interval '60 days';
  update public.dispositivos set visto = now(), nombre = left(coalesce(nullif(p_nombre, ''), nombre), 60)
   where owner_id = uid and id = p_id;
  if found then return jsonb_build_object('ok', true); end if;
  select plan into p from public.perfiles where id = uid;
  select count(*) into n from public.dispositivos where owner_id = uid;
  if coalesce(p, 'gratis') <> 'pro' and n >= 3 then
    return jsonb_build_object('ok', false, 'max', 3, 'lista',
      (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre, 'visto', visto) order by visto desc), '[]'::jsonb)
         from public.dispositivos where owner_id = uid));
  end if;
  insert into public.dispositivos (owner_id, id, nombre)
  values (uid, p_id, left(coalesce(nullif(p_nombre, ''), 'Dispositivo'), 60))
  on conflict (owner_id, id) do update set visto = now();
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.registrar_dispositivo(text, text) from public, anon;
grant execute on function public.registrar_dispositivo(text, text) to authenticated;

-- 4) «Mis ejercicios»: gratis 5, Pro sin límite (5000 solo como tope de seguridad).
create or replace function public.limite_ejercicios_guardados()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int; p text;
begin
  select plan into p from public.perfiles where id = new.owner_id;
  select count(*) into n from public.ejercicios_guardados where owner_id = new.owner_id and id <> new.id;
  if coalesce(p, 'gratis') <> 'pro' and n >= 5 then
    raise exception 'En el plan gratuito puedes guardar 5 ejercicios. Con el plan Pro, sin límite.';
  end if;
  if n >= 5000 then raise exception 'Has llegado al máximo de ejercicios guardados'; end if;
  return new;
end $$;
revoke all on function public.limite_ejercicios_guardados() from public, anon, authenticated;

-- Comprobación: debe salir «dispositivos».
select table_name as listo from information_schema.tables
 where table_schema = 'public' and table_name = 'dispositivos';
