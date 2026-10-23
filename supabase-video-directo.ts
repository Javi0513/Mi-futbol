// Mi Fútbol JV32 · Edge Function "video-directo"
// Reparte el vídeo del directo con Cloudflare Realtime (SFU): el móvil del entrenador
// manda el vídeo una vez y Cloudflare lo reparte a quien abra el enlace del directo.
// Necesita los secretos CF_APP_ID y CF_APP_TOKEN (Cloudflare → Realtime → Serverless SFU).
// Desplegar con "Verify JWT" DESACTIVADO: la función comprueba ella misma quién emite.
//
// Acciones (POST JSON):
//   emitir    {directo, sdp, pistas:[{mid, trackName}]}  entrenador Pro dueño del directo
//   parar     {directo}                                   entrenador dueño del directo
//   ver       {codigo}                                    cualquiera con el enlace
//   responder {sesion, sdp}                               el espectador acepta la oferta

const CF_APP = Deno.env.get("CF_APP_ID") ?? "";
const CF_TOKEN = Deno.env.get("CF_APP_TOKEN") ?? "";
const URL_DB = Deno.env.get("SUPABASE_URL") ?? "";
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CF = `https://rtc.live.cloudflare.com/v1/apps/${CF_APP}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESION = /^[0-9a-zA-Z_-]{8,128}$/;
const PISTA = /^[0-9a-zA-Z_-]{1,64}$/;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const res = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function cf(path: string, method: string, body?: unknown) {
  const r = await fetch(CF + path, {
    method,
    headers: { Authorization: `Bearer ${CF_TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.errorCode) throw new Error(d.errorDescription || `Cloudflare ${r.status}`);
  return d;
}

async function db(path: string, init: RequestInit = {}) {
  const r = await fetch(`${URL_DB}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`BD ${r.status}`);
  return r.status === 204 ? null : r.json();
}

// Quién llama (por su sesión de Supabase)
async function usuario(req: Request) {
  const t = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!t) return null;
  const r = await fetch(`${URL_DB}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${t}` } });
  if (!r.ok) return null;
  const u = await r.json();
  return UUID.test(u?.id ?? "") ? (u.id as string) : null;
}

async function miDirecto(req: Request, id: unknown) {
  if (typeof id !== "string" || !UUID.test(id)) throw new Error("Directo no válido.");
  const uid = await usuario(req);
  if (!uid) throw new Error("Inicia sesión de nuevo.");
  const f = await db(`directos?id=eq.${id}&owner_id=eq.${uid}&select=id`);
  if (!f?.length) throw new Error("Este directo no es tuyo.");
  return uid;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return res("ok");
  if (req.method !== "POST") return res({ error: "Solo POST" }, 405);
  if (!CF_APP || !CF_TOKEN) return res({ error: "El vídeo en directo aún no está configurado (faltan CF_APP_ID y CF_APP_TOKEN)." }, 503);
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return res({ error: "Petición no válida." }, 400);
  }
  try {
    if (b.accion === "emitir") {
      const uid = await miDirecto(req, b.directo);
      const p = await db(`perfiles?id=eq.${uid}&select=plan`);
      if (p?.[0]?.plan !== "pro") return res({ error: "El vídeo en directo es del plan Pro." }, 403);
      const pistas = Array.isArray(b.pistas) ? b.pistas : [];
      if (typeof b.sdp !== "string" || b.sdp.length > 20000 || !pistas.length || pistas.length > 2 ||
          !pistas.every((t) => t && PISTA.test(String(t.trackName)) && typeof t.mid === "string" && t.mid.length < 10))
        return res({ error: "Datos de vídeo no válidos." }, 400);
      const s = await cf("/sessions/new", "POST");
      const r = await cf(`/sessions/${s.sessionId}/tracks/new`, "POST", {
        sessionDescription: { type: "offer", sdp: b.sdp },
        tracks: pistas.map((t) => ({ location: "local", mid: t.mid, trackName: t.trackName })),
      });
      await db(`directos?id=eq.${b.directo}`, {
        method: "PATCH",
        body: JSON.stringify({ video: { s: s.sessionId, p: pistas.map((t) => t.trackName) }, video_desde: new Date().toISOString() }),
      });
      return res({ sdp: r.sessionDescription.sdp });
    }
    if (b.accion === "parar") {
      await miDirecto(req, b.directo);
      await db(`directos?id=eq.${b.directo}`, { method: "PATCH", body: JSON.stringify({ video: null, video_desde: null }) });
      return res({ ok: true });
    }
    if (b.accion === "ver") {
      if (typeof b.codigo !== "string" || !UUID.test(b.codigo)) return res({ error: "Enlace no válido." }, 400);
      const f = await db(`directos?id=eq.${b.codigo}&select=video`);
      const v = f?.[0]?.video;
      if (!v?.s || !Array.isArray(v.p)) return res({ video: false });
      const s = await cf("/sessions/new", "POST");
      const r = await cf(`/sessions/${s.sessionId}/tracks/new`, "POST", {
        tracks: v.p.map((t: string) => ({ location: "remote", sessionId: v.s, trackName: t })),
      });
      if (r.tracks?.some((t: { errorCode?: string }) => t.errorCode)) return res({ video: false });
      return res({ video: true, sesion: s.sessionId, sdp: r.sessionDescription?.sdp, renegociar: !!r.requiresImmediateRenegotiation });
    }
    if (b.accion === "responder") {
      if (typeof b.sesion !== "string" || !SESION.test(b.sesion) || typeof b.sdp !== "string" || b.sdp.length > 20000)
        return res({ error: "Datos no válidos." }, 400);
      await cf(`/sessions/${b.sesion}/renegotiate`, "PUT", { sessionDescription: { type: "answer", sdp: b.sdp } });
      return res({ ok: true });
    }
    return res({ error: "Acción desconocida." }, 400);
  } catch (e) {
    return res({ error: (e as Error).message }, 400);
  }
});
