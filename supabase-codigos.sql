-- =====================================================================
-- Mi Fútbol JV32 · CÓDIGOS PROMOCIONALES DEL PLAN PRO · ejecutar en SQL Editor
-- El usuario escribe un código en la app (Mi cuenta › «Tengo un código») y
-- recibe el plan Pro gratis unos días (7 por defecto), sin tarjeta.
-- Cada cuenta puede usar cada código una sola vez. Al acabar vuelve sola al
-- plan gratuito (la misma «prueba» de los testers: perfiles.prueba_hasta,
-- revisar_prueba_pro() y los avisos de fin del Pro ya funcionan con esto).
-- Necesita antes supabase-testers.sql (ya aplicado).
-- Es seguro volver a ejecutarlo (idempotente).
-- =====================================================================

create table if not exists public.codigos_promo (
  codigo text primary key check (codigo = upper(btrim(codigo)) and length(codigo) between 3 and 30),
  dias int not null default 7 check (dias between 1 and 90),
  usos_max int check (usos_max is null or usos_max > 0),   -- null = sin límite de usos
  usos int not null default 0,
  caduca timestamptz,                                       -- null = no caduca
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.codigos_promo enable row level security;
revoke all on public.codigos_promo from anon, authenticated;   -- nadie ve los códigos desde la app

create table if not exists public.codigos_canjeados (
  codigo text not null references public.codigos_promo(codigo) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  canjeado_at timestamptz not null default now(),
  primary key (codigo, user_id)
);
alter table public.codigos_canjeados enable row level security;
revoke all on public.codigos_canjeados from anon, authenticated;

-- La app la llama al pulsar «Canjear». Devuelve un json:
--   {"r":"ok","hasta":"..."}  o  {"r":"no_existe" | "caducado" | "agotado" | "ya_usado" | "ya_pro"}
create or replace function public.canjear_codigo(p_codigo text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid(); c record; p record; hasta timestamptz;
  cod text := upper(regexp_replace(coalesce(p_codigo, ''), '\s', '', 'g'));
begin
  if uid is null then return jsonb_build_object('r', 'no_existe'); end if;
  select * into c from public.codigos_promo where codigo = cod for update;
  if not found or not c.activo then return jsonb_build_object('r', 'no_existe'); end if;
  if c.caduca is not null and c.caduca <= now() then return jsonb_build_object('r', 'caducado'); end if;
  if exists (select 1 from public.codigos_canjeados where codigo = cod and user_id = uid) then
    return jsonb_build_object('r', 'ya_usado');
  end if;
  select plan, prueba_hasta into p from public.perfiles where id = uid;
  if not found then return jsonb_build_object('r', 'no_existe'); end if;
  if p.plan = 'pro' then return jsonb_build_object('r', 'ya_pro'); end if;
  if c.usos_max is not null and c.usos >= c.usos_max then return jsonb_build_object('r', 'agotado'); end if;

  hasta := now() + make_interval(days => c.dias);
  insert into public.codigos_canjeados (codigo, user_id) values (cod, uid);
  update public.codigos_promo set usos = usos + 1 where codigo = cod;
  update public.perfiles set plan = 'pro', prueba_hasta = hasta where id = uid;
  return jsonb_build_object('r', 'ok', 'hasta', hasta, 'dias', c.dias);
end $$;
revoke all on function public.canjear_codigo(text) from public, anon;
grant execute on function public.canjear_codigo(text) to authenticated;

-- El email que te llega con cada nuevo Pro ahora dice si ha sido con un código.
create or replace function public.aviso_nuevo_pro()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare correo text; como text; n int; cod text;
begin
  begin
    if new.plan <> 'pro' or (tg_op = 'UPDATE' and old.plan = 'pro') then return new; end if;
    select email into correo from auth.users where id = new.id;
    select codigo into cod from public.codigos_canjeados
     where user_id = new.id and canjeado_at > now() - interval '1 minute'
     order by canjeado_at desc limit 1;
    como := case
      when new.pro_por_club then 'gracias a su club (se ha unido con el código del club)'
      when coalesce(new.stripe_estado, '') in ('active', 'trialing', 'past_due') then 'ha PAGADO con Stripe'
      when cod is not null and new.prueba_hasta is not null then 'prueba gratis con el código promocional ' || cod || ' hasta el ' || to_char(new.prueba_hasta at time zone 'Europe/Madrid', 'DD/MM/YYYY')
      when new.prueba_hasta is not null then 'prueba gratis de tester hasta el ' || to_char(new.prueba_hasta at time zone 'Europe/Madrid', 'DD/MM/YYYY')
      else 'activado a mano (sin pago)'
    end;
    select count(*) into n from public.perfiles where plan = 'pro';
    perform public.avisar_javi(
      'Nuevo usuario Pro: ' || coalesce(correo, '?'),
      coalesce(correo, 'Un usuario') || ' tiene ahora el plan Pro: ' || como || '.' || chr(10) || chr(10) ||
      'Usuarios con plan Pro en total: ' || n || '.' || chr(10) ||
      'Fecha: ' || to_char(now() at time zone 'Europe/Madrid', 'DD/MM/YYYY HH24:MI') || chr(10) || chr(10) ||
      '— Mi Fútbol JV32');
  exception when others then
    null;  -- el aviso nunca bloquea el cambio de plan
  end;
  return new;
end $$;
revoke all on function public.aviso_nuevo_pro() from public, anon, authenticated;

-- Código de lanzamiento en Google Play: 7 días de Pro gratis.
-- Para ponerle tope de usos o fecha de fin, cambia usos_max / caduca, por ejemplo:
--   update public.codigos_promo set usos_max = 100, caduca = '2026-12-31 23:59+01' where codigo = 'JV32PLAY';
insert into public.codigos_promo (codigo, dias) values ('JV32PLAY', 7)
on conflict (codigo) do nothing;

-- ---------------------------------------------------------------------
-- CREAR OTRO CÓDIGO (ejemplo: 14 días, 50 usos, hasta fin de año):
--   insert into public.codigos_promo (codigo, dias, usos_max, caduca)
--   values ('NAVIDAD14', 14, 50, '2026-12-31 23:59+01');
-- DESACTIVAR UN CÓDIGO:
--   update public.codigos_promo set activo = false where codigo = 'JV32PLAY';
-- VER CÓMO VA:
--   select c.codigo, c.usos, c.usos_max, c.caduca, c.activo from public.codigos_promo c;
--   select k.codigo, u.email, k.canjeado_at, p.plan, p.prueba_hasta
--     from public.codigos_canjeados k
--     join auth.users u on u.id = k.user_id
--     left join public.perfiles p on p.id = k.user_id
--    order by k.canjeado_at desc;
-- ---------------------------------------------------------------------
