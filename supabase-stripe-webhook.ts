// Mi Fútbol JV32 · Edge Function "stripe-webhook"
// Stripe avisa aquí cuando alguien paga, renueva o cancela el plan Pro, y esta
// función cambia perfiles.plan. También gestiona los packs de club (tabla clubes, v8.9):
// el enlace de pago del club lleva client_reference_id=club_<id> y metadata.plazas. Necesita el secreto STRIPE_WEBHOOK_SECRET (whsec_...).
// Desplegar con "Verify JWT" DESACTIVADO (Stripe no manda token de Supabase).

const SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const URL_DB = Deno.env.get("SUPABASE_URL") ?? "";
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIVOS = ["active", "trialing", "past_due"];

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) =>
  [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

function iguales(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// Comprueba la firma Stripe-Signature (t=...,v1=...) y que no tenga más de 5 minutos.
async function firmaValida(body: string, cabecera: string) {
  const partes = cabecera.split(",").map((p) => p.split("="));
  const t = partes.find(([k]) => k === "t")?.[1];
  const firmas = partes.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || !firmas.length || !SECRET) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const clave = await crypto.subtle.importKey(
    "raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const esperada = hex(await crypto.subtle.sign("HMAC", clave, enc.encode(`${t}.${body}`)));
  return firmas.some((f) => iguales(f, esperada));
}

// Solo se aplica si el aviso es más nuevo que el último aplicado (Stripe puede desordenarlos).
async function actualizar(filtro: string, cuando: number, datos: Record<string, unknown>, tabla = "perfiles") {
  const orden = `or=(stripe_evento_at.is.null,stripe_evento_at.lte.${cuando})`;
  const r = await fetch(`${URL_DB}/rest/v1/${tabla}?${filtro}&${orden}`, {
    method: "PATCH",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      ...datos,
      stripe_evento_at: cuando,
      ...(tabla === "perfiles" ? { plan_actualizado_at: new Date().toISOString() } : {}),
    }),
  });
  if (!r.ok) throw new Error(`${tabla} ${r.status}: ${await r.text()}`);
}

// Número de entrenadores del pack (metadata.plazas del enlace de pago o de la suscripción)
const plazasDe = (m: Record<string, string> | undefined) => {
  const n = parseInt(m?.plazas ?? "", 10);
  return n > 0 && n <= 500 ? { plazas: n } : {};
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  const body = await req.text();
  if (!(await firmaValida(body, req.headers.get("stripe-signature") ?? "")))
    return new Response("firma no valida", { status: 400 });

  const ev = JSON.parse(body);
  const o = ev.data?.object ?? {};
  const cuando = Number(ev.created) || Math.floor(Date.now() / 1000);
  try {
    if (ev.type === "checkout.session.completed" && String(o.client_reference_id ?? "").startsWith("club_")) {
      const cid = String(o.client_reference_id).slice(5);
      if (!UUID.test(cid)) return new Response("sin club", { status: 200 });
      const pagado = o.payment_status === "paid" || o.payment_status === "no_payment_required";
      await actualizar(`id=eq.${cid}`, cuando, {
        stripe_customer: o.customer ?? null,
        stripe_subscription: o.subscription ?? null,
        stripe_estado: pagado ? "active" : "incomplete",
        ...plazasDe(o.metadata),
      }, "clubes");
    } else if (ev.type === "checkout.session.completed") {
      const uid = String(o.client_reference_id ?? "");
      if (!UUID.test(uid)) return new Response("sin usuario", { status: 200 });
      const pagado = o.payment_status === "paid" || o.payment_status === "no_payment_required";
      await actualizar(`id=eq.${uid}`, cuando, {
        stripe_customer: o.customer ?? null,
        stripe_subscription: o.subscription ?? null,
        stripe_estado: pagado ? "active" : "incomplete",
        ...(pagado ? { plan: "pro" } : {}),
      });
    } else if (
      ev.type === "customer.subscription.updated" ||
      ev.type === "customer.subscription.deleted"
    ) {
      const activo = ev.type !== "customer.subscription.deleted" && ACTIVOS.includes(o.status);
      // Si está cancelada pero sigue pagada, el día en que acaba el Pro (para mostrarlo en la app)
      const fin = o.cancel_at ??
        (o.cancel_at_period_end ? (o.current_period_end ?? o.items?.data?.[0]?.current_period_end) : null);
      const hasta = activo && fin ? new Date(fin * 1000).toISOString() : null;
      const filtro = `stripe_customer=eq.${encodeURIComponent(o.customer)}`;
      if (o.metadata?.club) {
        await actualizar(filtro, cuando, {
          stripe_subscription: o.id,
          stripe_estado: o.status,
          pro_hasta: hasta,
          ...plazasDe(o.metadata),
        }, "clubes");
      } else {
        await actualizar(filtro, cuando, {
          stripe_subscription: o.id,
          stripe_estado: o.status,
          plan: activo ? "pro" : "gratis",
          pro_hasta: hasta,
        });
      }
    }
  } catch (e) {
    console.error(e);
    return new Response("error", { status: 500 }); // Stripe lo reintentará
  }
  return new Response("ok");
});
