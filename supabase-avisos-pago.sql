-- =====================================================================
-- Mi Fútbol JV32 · EMAIL CON EL ENLACE DE PAGO ANTES DE QUE TERMINE LA PRUEBA (v11.17)
-- Cambia el aviso diario (avisar_fin_pro, de supabase-avisos-plan.sql) para que el
-- email a cada usuario lleve su enlace personal de pago del Pro. Así los testers
-- de Android, que no pueden pagar dentro de la app, saben cómo seguir con el Pro.
-- Ejecutar en Supabase → SQL Editor. Se puede repetir sin riesgo.
-- Los emails a los usuarios solo salen si está puesto el remitente (paso final).
-- =====================================================================

create or replace function public.avisar_fin_pro()
returns int language plpgsql security definer set search_path = public, auth as $$
declare r record; lista text := ''; n int := 0; rem text; cuando text; pago text; enlace text;
begin
  select valor into rem from public.ajustes_privados where clave = 'remitente';
  -- Enlace de pago del Pro (el mismo que proUrl de config.js). Se puede cambiar con ajustes_privados 'pro_url'.
  select valor into pago from public.ajustes_privados where clave = 'pro_url';
  pago := coalesce(pago, 'https://buy.stripe.com/00w4gz4S06fBaMC2NAcbC00');
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
    -- Enlace personal: al pagar, el Pro se activa solo en su cuenta (también en la app de Android)
    enlace := pago || case when pago like '%?%' then '&' else '?' end ||
              'client_reference_id=' || r.id || '&prefilled_email=' ||
              replace(replace(r.email, '+', '%2B'), '@', '%40') || '&locale=es';
    lista := lista || '· ' || r.email || ' — ' || case when r.prueba then 'prueba gratis' else 'suscripción cancelada' end
             || ', termina el ' || cuando || chr(10) ||
             case when r.prueba then '  Su enlace de pago (puedes mandárselo por WhatsApp): ' || enlace || chr(10) else '' end;
    -- Email al usuario: solo si has puesto un remitente de tu dominio verificado en Resend
    if rem is not null then
      perform public.enviar_email(r.email,
        'Tu plan Pro de Mi Fútbol JV32 termina el ' || cuando,
        'Hola:' || chr(10) || chr(10) ||
        case when r.prueba then 'Tu prueba gratis del plan Pro termina el ' || cuando || '. '
             else 'Cancelaste tu suscripción y tu plan Pro termina el ' || cuando || '. ' end ||
        'Después pasarás al plan gratuito: no pierdes nada de lo que tienes guardado, solo vuelven los límites del plan gratuito.' || chr(10) || chr(10) ||
        case when r.prueba then
          'Si quieres seguir con el Pro (39,99 €/año, unos 3,33 € al mes), págalo aquí con tarjeta, de forma segura con Stripe:' || chr(10) ||
          enlace || chr(10) || chr(10) ||
          'Es tu misma cuenta: en cuanto pagues tendrás el Pro en la web y en la app del móvil (también en la de Android).' || chr(10) ||
          'También puedes entrar en app.monetizaplus.com desde el navegador › Mi cuenta › Pasar a Pro.'
        else
          'Si quieres seguir con el Pro, entra en app.monetizaplus.com desde el navegador › Mi cuenta › Gestionar o cancelar mi suscripción, y reactívala.'
        end || chr(10) || chr(10) ||
        '— Mi Fútbol JV32', rem);
    end if;
    update public.perfiles set aviso_fin_at = now() where id = r.id;
  end loop;
  if n > 0 then
    perform public.avisar_javi(
      n || CASE WHEN n = 1 THEN ' plan Pro termina' ELSE ' planes Pro terminan' END || ' en 2 días',
      'Estos usuarios pasarán al plan gratuito en 2 días o menos:' || chr(10) || chr(10) || lista || chr(10) ||
      case when rem is null then 'En la app ya les sale un aviso. (Para que además les llegue un email, mira el paso final de supabase-avisos-pago.sql.)'
           else 'A cada uno le ha llegado un email y en la app les sale un aviso.' end || chr(10) || chr(10) ||
      '— Mi Fútbol JV32');
  end if;
  return n;
end $$;
revoke all on function public.avisar_fin_pro() from public, anon, authenticated;

-- PASO FINAL (una sola vez, cuando monetizaplus.com salga «Verified» en Resend):
-- insert into public.ajustes_privados (clave, valor) values
--   ('remitente', 'Mi Futbol JV32 <avisos@monetizaplus.com>')
-- on conflict (clave) do update set valor = excluded.valor;
