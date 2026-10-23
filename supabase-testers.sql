-- =====================================================================
-- Mi Fútbol JV32 · PRUEBA DEL PLAN PRO PARA TESTERS · ejecutar en SQL Editor
-- Los emails de la lista "testers_pro" reciben el plan Pro gratis durante
-- unos días (15 por defecto), contados desde que abren la app por primera vez.
-- Al acabar vuelven solos al plan gratuito (salvo que se hayan suscrito con Stripe).
-- Es seguro volver a ejecutarlo (idempotente).
-- =====================================================================

alter table public.perfiles add column if not exists prueba_hasta timestamptz;

create table if not exists public.testers_pro (
  email text primary key check (email = lower(btrim(email))),
  dias int not null default 15 check (dias between 1 and 90),
  activado_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.testers_pro enable row level security;
revoke all on public.testers_pro from anon, authenticated;   -- nadie la ve desde la app

-- La app la llama al entrar. Devuelve 'activada', 'terminada' o ''.
create or replace function public.revisar_prueba_pro()
returns text language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid(); p record; correo text; d int;
begin
  if uid is null then return ''; end if;
  select plan, prueba_hasta, stripe_estado into p from public.perfiles where id = uid;
  if not found then return ''; end if;

  -- Prueba terminada: vuelve al plan gratuito, salvo que pague con Stripe.
  if p.prueba_hasta is not null and p.prueba_hasta <= now() then
    if p.plan = 'pro' and coalesce(p.stripe_estado, '') not in ('active', 'trialing', 'past_due') then
      update public.perfiles set plan = 'gratis', prueba_hasta = null where id = uid;
      return 'terminada';
    end if;
    update public.perfiles set prueba_hasta = null where id = uid;
    return '';
  end if;

  -- Tester que entra por primera vez: se le activa la prueba (una sola vez).
  if p.plan = 'gratis' and p.prueba_hasta is null then
    select lower(email) into correo from auth.users where id = uid;
    update public.testers_pro set activado_at = now()
     where email = correo and activado_at is null
     returning dias into d;
    if found then
      update public.perfiles set plan = 'pro', prueba_hasta = now() + make_interval(days => d)
       where id = uid;
      return 'activada';
    end if;
  end if;
  return '';
end $$;
revoke all on function public.revisar_prueba_pro() from public, anon;
grant execute on function public.revisar_prueba_pro() to authenticated;

-- ---------------------------------------------------------------------
-- AÑADIR TESTERS: cambia los emails y ejecuta solo este bloque.
-- Tienen que ser los emails con los que se registran en la app.
-- (No guardes esta lista en GitHub.)
--
-- insert into public.testers_pro (email) values
--   ('tester1@gmail.com'),
--   ('tester2@gmail.com')
-- on conflict (email) do nothing;
--
-- VER CÓMO VAN:
-- select t.email, t.activado_at, p.plan, p.prueba_hasta
--   from public.testers_pro t
--   left join auth.users u on lower(u.email) = t.email
--   left join public.perfiles p on p.id = u.id
--  order by t.email;
-- ---------------------------------------------------------------------
