-- =====================================================================
-- Mi Fútbol JV32 · PAGOS CON STRIPE (plan Pro) · ejecutar en SQL Editor
-- Guarda en cada perfil su cliente y su suscripción de Stripe.
-- La función stripe-webhook (Edge Function) es la única que cambia el plan.
-- Es seguro volver a ejecutarlo (idempotente).
-- =====================================================================

alter table public.perfiles add column if not exists stripe_customer text;
alter table public.perfiles add column if not exists stripe_subscription text;
alter table public.perfiles add column if not exists stripe_estado text;
alter table public.perfiles add column if not exists plan_actualizado_at timestamptz;
alter table public.perfiles add column if not exists stripe_evento_at bigint;

create unique index if not exists perfiles_stripe_customer_key
  on public.perfiles (stripe_customer) where stripe_customer is not null;

-- Los usuarios siguen pudiendo LEER solo su perfil y no pueden cambiarlo.
revoke insert, update, delete on public.perfiles from anon, authenticated;
