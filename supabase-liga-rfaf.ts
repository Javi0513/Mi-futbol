// Mi Fútbol JV32 · Clasificación automática de la Federación Andaluza (v11.41)
// Edge function «liga-rfaf» de Supabase. Lee la clasificación y los resultados de
// stars.rfaf.es (su robots.txt permite leerla) para el entrenador que la pide.
// Solo entrenadores con sesión en la app. Guarda en memoria 15 minutos lo leído para
// no cargar la web de la federación.
//   POST {op:"comps", d}            → competiciones de una delegación
//   POST {op:"grupos", d, c}        → grupos de una competición
//   POST {op:"liga", d, c, g, j?}   → clasificación + resultados de la jornada j (o la última) + jornadas
//   POST {op:"jornada", d, c, g, j} → resultados de una jornada (fecha, hora, campo y estado) (v11.42)
const BASE = "https://stars.rfaf.es/";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const cache = new Map<string, { t: number; v: string }>();
async function lee(params: Record<string, string>): Promise<string> {
  const u = BASE + "?" + new URLSearchParams(params).toString();
  const c = cache.get(u);
  if (c && Date.now() - c.t < 15 * 60 * 1000) return c.v;
  const r = await fetch(u, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; MiFutbolJV32/1.0; +https://app.monetizaplus.com)",
      "X-Requested-With": "XMLHttpRequest",
      Accept: "text/html",
    },
  });
  if (!r.ok) throw new Error("La web de la federación no responde (" + r.status + ").");
  const v = await r.text();
  /* A veces la web de la federación no consigue entrar en su propio sistema (Novanet)
     y enseña la página vacía («No hay partidos publicados») aunque la jornada exista. No se
     guarda en memoria y se avisa claro, para que no parezca que la jornada no está. */
  if (caida(v)) return v;
  if (cache.size > 300) cache.clear();
  cache.set(u, { t: Date.now(), v });
  return v;
}
const caida = (v: string) => /No se pudo validar la sesi(ó|o|&oacute;)n de Novanet/i.test(v);
const CAIDA = "La web de la Federación Andaluza está fallando ahora mismo y no da los grupos ni los partidos. Vuelve a probar en un rato.";
const txt = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
function opciones(html: string, nombre: string) {
  const i = html.indexOf('name="' + nombre + '"');
  if (i < 0) return [];
  const fin = html.indexOf("</select>", i);
  const trozo = html.slice(i, fin > 0 ? fin : i + 30000);
  const out: { id: string; n: string }[] = [];
  for (const m of trozo.matchAll(/<option value="(\d+)"[^>]*>([^<]*)/g)) out.push({ id: m[1], n: txt(m[2]) });
  return out;
}
function tabla(html: string) {
  const i = html.indexOf("<tbody");
  if (i < 0) return [];
  const fin = html.indexOf("</tbody>", i);
  const out = [];
  for (const tr of html.slice(i, fin).split(/<tr[\s>]/).slice(1)) {
    const celdas = tr.split(/<td[\s>]/).slice(1).map((c) => c.slice(0, c.indexOf("</td>") >= 0 ? c.indexOf("</td>") : c.length));
    const sp = tr.match(/<span class="font-medium[^"]*">([^<]+)<\/span>/) || tr.match(/alt="([^"]+)"/);
    const N = celdas.map((c) => txt(c.replace(/^[^>]*>/, ""))).filter((s) => /^-?\d+$/.test(s)).map(Number);
    if (!sp || N.length < 8) continue;
    out.push({ n: txt(sp[1]), pts: N[1], pj: N[2], g: N[3], e: N[4], p: N[5], gf: N[6], gc: N[7] });
  }
  return out;
}
function resultados(html: string) {
  const jm = html.match(/Jornada:\s*(\d+)/);
  const out = [];
  for (const a of html.split("<article").slice(1)) {
    if (!/sm:hidden/.test(a.slice(0, 300))) continue;
    const art = a.slice(0, a.indexOf("</article>"));
    const eq = [...art.matchAll(/<span class="min-w-0 break-words[^"]*">([^<]+)<\/span>/g)].map((m) => txt(m[1]));
    const al = eq.length >= 2 ? eq : [...art.matchAll(/alt="([^"]+)"/g)].map((m) => txt(m[1]));
    const sc = art.match(/>\s*(\d{1,2})\s*-\s*(\d{1,2})\s*</);
    const est = (art.match(/Estado:<\/span>\s*([^<]+)/) || [])[1] || "";
    const fecha = (art.match(/Fecha:<\/span>\s*([^<]+)/) || [])[1] || "";
    const hora = (art.match(/Hora:<\/span>\s*([^<]+)/) || [])[1] || "";
    const lugar = (art.match(/Lugar:<\/span>\s*([^<]+)/) || [])[1] || "";
    if (al.length < 2) continue;
    out.push({ l: al[0], v: al[1], gl: sc ? +sc[1] : null, gv: sc ? +sc[2] : null, est: txt(est), f: txt(fecha), h: txt(hora), lu: txt(lugar).slice(0, 120) });
  }
  return { j: jm ? +jm[1] : 0, partidos: out };
}
function jornadas(html: string) {
  /* [{id: "12", n: "12 · 13-12-2026"}] del desplegable «Jornadas» de la clasificación */
  return opciones(html, "jornada");
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const resp = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
  /* Solo entrenadores con sesión en la app */
  const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const dentro =
    tok &&
    (await fetch(Deno.env.get("SUPABASE_URL") + "/auth/v1/user", {
      headers: { Authorization: "Bearer " + tok, apikey: Deno.env.get("SUPABASE_ANON_KEY") || "" },
    })
      .then((r) => r.ok)
      .catch(() => false));
  if (!dentro) return resp({ error: "Inicia sesión en la app para leer la federación." }, 401);
  try {
    const b = await req.json().catch(() => ({}));
    const d = String(b.d || "").replace(/\D/g, ""),
      c = String(b.c || "").replace(/\D/g, ""),
      g = String(b.g || "").replace(/\D/g, ""),
      j = String(b.j || "").replace(/\D/g, "");
    if (!d) return resp({ error: "Falta la delegación." }, 400);
    if (b.op === "comps") return resp({ comps: opciones(await lee({ widget_view: "classification", delegacion: d }), "competicion") });
    if (!c) return resp({ error: "Falta la competición." }, 400);
    if (b.op === "grupos") {
      const h = await lee({ widget_view: "classification", delegacion: d, competicion: c });
      if (caida(h)) return resp({ error: CAIDA }, 503);
      return resp({ grupos: opciones(h, "grupo") });
    }
    if (b.op === "liga") {
      if (!g) return resp({ error: "Falta el grupo." }, 400);
      const p = { delegacion: d, competicion: c, grupo: g };
      const [ht, hr] = await Promise.all([
        lee({ widget_view: "classification", ...p }),
        lee({ widget_view: "results", ...p, ...(j ? { jornada: j } : {}) }),
      ]);
      if (caida(ht) || caida(hr)) return resp({ error: CAIDA }, 503);
      return resp({ tabla: tabla(ht), res: resultados(hr), jornadas: jornadas(ht) });
    }
    if (b.op === "jornada") {
      if (!g || !j) return resp({ error: "Falta el grupo o la jornada." }, 400);
      const h = await lee({ widget_view: "results", delegacion: d, competicion: c, grupo: g, jornada: j });
      if (caida(h)) return resp({ error: CAIDA }, 503);
      return resp({ res: resultados(h) });
    }
    return resp({ error: "Operación no válida." }, 400);
  } catch (e) {
    return resp({ error: String((e && (e as Error).message) || e) }, 502);
  }
});
