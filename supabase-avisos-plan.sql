-- =====================================================================
-- Mi Fútbol JV32 · AVISOS DEL PLAN PRO (v11.14)
-- 1) Te llega un email cada vez que alguien pasa al plan Pro
--    (pago con Stripe, prueba gratis de tester o Pro gracias a un club)
--    y cada vez que un club paga su pack.
-- 2) Cada mañana te llega un email con los planes Pro que terminan en
--    2 días, y (opcional) se avisa también por email a cada usuario.
-- Usa la clave de Resend y tu email que ya están en ajustes_privados
-- (supabase-avisos-pro.sql). Ejecutar en Supabase → SQL Editor.
-- Se puede repetir sin riesgo.
-- =====================================================================

-- Para no avisar dos veces del mismo final del plan
alter table public.perfiles add column if not exists aviso_fin_at timestamptz;

-- Envía un email con Resend. Si falta la clave o el correo falla, no pasa nada.
create or replace function public.enviar_email(para text, asunto text, texto text, remitente text default null)
returns void language plpgsql security definer set search_path = public as $$
declare k text; de text;
begin
  select valor into k from public.ajustes_privados where clave = 'resend_key';
  if k is null or para is null then return; end if;
  de := coalesce(remitente, 'Mi Futbol JV32 <onboarding@resend.dev>');
  perform net.http_post(
    url     := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Authorization', 'Bearer ' || k, 'Content-Type', 'application/json'),
    body    := jsonb_build_object('from', de, 'to', jsonb_build_array(para), 'subject', asunto, 'text', texto));
exception when others then
  null;
end $$;
revoke all on function public.enviar_email(text, text, text, text) from public, anon, authenticated;

-- Email para ti (aviso_email de ajustes_privados)
create or replace function public.avisar_javi(asunto text, texto text)
returns void language plpgsql security definer set search_path = public as $$
declare dest text;
begin
  select valor into dest from public.ajustes_privados where clave = 'aviso_email';
  perform public.enviar_email(dest, asunto, texto);
end $$;
revoke all on function public.avisar_javi(text, text) from public, anon, authenticated;

-- 1) Alguien pasa al plan Pro
create or replace function public.aviso_nuevo_pro()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare correo text; como text; n int;
begin
  begin
    if new.plan <> 'pro' or (tg_op = 'UPDATE' and old.plan = 'pro') then return new; end if;
    select email into correo from auth.users where id = new.id;
    como := case
      when new.pro_por_club then 'gracias a su club (se ha unido con el código del club)'
      when coalesce(new.stripe_estado, '') in ('active', 'trialing', 'past_due') then 'ha PAGADO con Stripe (39,99 €/año)'
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
drop trigger if exists aviso_nuevo_pro on public.perfiles;
create trigger aviso_nuevo_pro after insert or update of plan on public.perfiles
  for each row execute function public.aviso_nuevo_pro();

-- 1b) Un club paga su pack
create or replace function public.aviso_club_pagado()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare correo text;
begin
  begin
    if coalesce(new.stripe_estado, '') <> 'active'
       or coalesce(old.stripe_estado, '') in ('active', 'trialing', 'past_due') then return new; end if;
    select email into correo from auth.users where id = new.admin_id;
    perform public.avisar_javi(
      'Nuevo club de pago: ' || new.nombre,
      'El club «' || new.nombre || '» ha pagado su pack de ' || new.plazas || ' entrenadores.' || chr(10) ||
      'Encargado: ' || coalesce(correo, '?') || chr(10) ||
      'Fecha: ' || to_char(now() at time zone 'Europe/Madrid', 'DD/MM/YYYY HH24:MI') || chr(10) || chr(10) ||
      '— Mi Fútbol JV32');
  exception when others then
    null;
  end;
  return new;
end $$;
revoke all on function public.aviso_club_pagado() from public, anon, authenticated;
drop trigger if exists aviso_club_pagado on public.clubes;
create trigger aviso_club_pagado after update of stripe_estado on public.clubes
  for each row when (old.stripe_estado is distinct from new.stripe_estado)
  execute function public.aviso_club_pagado();

-- 2) Cada mañana: planes Pro que terminan en 2 días o menos
--    (prueba de tester, o suscripción cancelada que sigue pagada hasta una fecha).
--    Las suscripciones que se renuevan solas NO terminan, así que no salen.
create or replace function public.avisar_fin_pro()
returns int language plpgsql security definer set search_path = public, auth as $$
declare r record; lista text := ''; n int := 0; rem text; cuando text;
begin
  select valor into rem from public.ajustes_privados where clave = 'remitente';
  for r in
    select p.id, u.email,
           case when p.prueba_hasta is not null and coalesce(p.stripe_estado, '') not in ('active', 'trialing', 'past_due')
                then p.prueba_hasta else p.pro_hasta end as fin,
           p.prueba_hasta is not null and coalesce(p.stripe_estado, '') not in ('active', 'trialing', 'past_due') as prueba
      from public.perfiles p join auth.users u on u.id = p.id
     where p.plan = 'pro' and not p.pro_por_club
  loop
    continue when r.fin is null or r.fin <= now() or r.fin > now() + interval '2 days 12 hours';
    continue when exists (select 1 from public.perfiles where id = r.id and aviso_fin_at is not null
                          and aviso_fin_at > r.fin - interval '5 days');
    n := n + 1;
    cuando := to_char(r.fin at time zone 'Europe/Madrid', 'DD/MM/YYYY');
    lista := lista || '· ' || r.email || ' — ' || case when r.prueba then 'prueba gratis' else 'suscripción cancelada' end
             || ', termina el ' || cuando || chr(10);
    -- Email al usuario: solo si has puesto un remitente de tu dominio verificado en Resend
    if rem is not null then
      perform public.enviar_email(r.email,
        'Tu plan Pro de Mi Fútbol JV32 termina el ' || cuando,
        'Hola:' || chr(10) || chr(10) ||
        case when r.prueba then 'Tu prueba gratis del plan Pro termina el ' || cuando || '. '
             else 'Cancelaste tu suscripción y tu plan Pro termina el ' || cuando || '. ' end ||
        'Después pasarás al plan gratuito: no pierdes nada de lo que tienes guardado, solo vuelven los límites del plan gratuito.' || chr(10) || chr(10) ||
        'Si quieres seguir con el Pro (39,99 €/año), entra en app.monetizaplus.com › Mi cuenta' ||
        case when r.prueba then ' › Pasar a Pro.' else ' › Gestionar o cancelar mi suscripción, y reactívala.' end || chr(10) || chr(10) ||
        '— Mi Fútbol JV32', rem);
    end if;
    update public.perfiles set aviso_fin_at = now() where id = r.id;
  end loop;
  if n > 0 then
    perform public.avisar_javi(
      n || CASE WHEN n = 1 THEN ' plan Pro termina' ELSE ' planes Pro terminan' END || ' en 2 días',
      'Estos usuarios pasarán al plan gratuito en 2 días o menos:' || chr(10) || chr(10) || lista || chr(10) ||
      case when rem is null then 'En la app ya les sale un aviso. (Para que además les llegue un email, mira el paso 4 de supabase-avisos-plan.sql.)'
           else 'A cada uno le ha llegado un email y en la app les sale un aviso.' end || chr(10) || chr(10) ||
      '— Mi Fútbol JV32');
  end if;
  return n;
end $$;
revoke all on function public.avisar_fin_pro() from public, anon, authenticated;

-- 3) Se ejecuta solo cada día a las 8:00 UTC (9:00 en invierno, 10:00 en verano en España)
create extension if not exists pg_cron with schema pg_catalog;
select cron.unschedule('avisos-fin-pro') where exists (select 1 from cron.job where jobname = 'avisos-fin-pro');
select cron.schedule('avisos-fin-pro', '0 8 * * *', 'select public.avisar_fin_pro()');

-- PRUEBA (opcional): te manda un email de prueba ahora mismo.
-- select public.avisar_javi('Prueba de avisos de Mi Fútbol JV32', 'Si te llega este correo, los avisos de nuevos Pro funcionan.');

-- 4) OPCIONAL · Email también a los usuarios 2 días antes.
--    Resend solo deja enviar a otras personas desde un dominio tuyo verificado
--    (resend.com › Domains › Add domain › monetizaplus.com y añadir los registros DNS).
--    Cuando el dominio salga «Verified», ejecuta esto una vez:
-- insert into public.ajustes_privados (clave, valor) values
--   ('remitente', 'Mi Futbol JV32 <avisos@monetizaplus.com>')
-- on conflict (clave) do update set valor = excluded.valor;
