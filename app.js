(() => {
  /* iPad y iPhone antiguos (iOS 15.3 o anterior) no tienen crypto.randomUUID: lo creamos con getRandomValues */
  if (window.crypto && !crypto.randomUUID)
    crypto.randomUUID = () =>
      "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
        (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16),
      );
  /* Antisuplantación: la app no se deja meter dentro de otra web (clickjacking) */
  try {
    if (window.top !== window.self && window.top.location.origin !== location.origin)
      throw 0;
  } catch (e) {
    document.documentElement.style.display = "none";
    try {
      window.top.location = location.href;
    } catch (x) {}
    return;
  }
  /* Autorreparación: borra el modo sin conexión y las copias guardadas y recarga */
  const EYE =
    '<svg class="ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF =
    '<svg class="ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.9 10.9 0 0 1 12 19c-6.5 0-10-7-10-7a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A10.9 10.9 0 0 1 12 4c6.5 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/></svg>';
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest(".eye");
    if (!b) return;
    e.preventDefault();
    const inp = b.parentElement.querySelector("input");
    const show = inp.type === "password";
    inp.type = show ? "text" : "password";
    b.innerHTML = show ? EYE_OFF : EYE;
    b.setAttribute("aria-pressed", show ? "true" : "false");
    b.setAttribute(
      "aria-label",
      show ? "Ocultar contraseña" : "Mostrar contraseña",
    );
  });
  async function repairApp() {
    try {
      const rs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(rs.map((r) => r.unregister()));
    } catch (e) {}
    try {
      const ks = await caches.keys();
      await Promise.all(ks.map((k) => caches.delete(k)));
    } catch (e) {}
    location.replace(location.pathname + "?r=" + Date.now());
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest && e.target.closest("[data-repair]")) {
      e.preventDefault();
      repairApp();
    }
  });
  if (!window.supabase) {
    let tried = false;
    try {
      tried = sessionStorage.getItem("repaired");
      sessionStorage.setItem("repaired", "1");
    } catch (e) {}
    if (!tried) {
      repairApp();
      return;
    }
    const m = document.getElementById("loginmsg");
    if (m)
      m.innerHTML =
        '<div class="message" role="alert"><span>No se han cargado todos los archivos de la app.</span><button type="button" class="lnk" data-repair>Reparar</button></div>';
    return;
  }
  const c = window.APP_CONFIG || {};
  /* Dentro de la app Android (Google Play) no se puede cobrar con Stripe: allí no se muestra el pago */
  const enAndroid = (() => {
    try {
      if (/^android-app:\/\/com\.monetizaplus\.mifutbol/.test(document.referrer))
        sessionStorage.setItem("mf_twa", "1");
      return sessionStorage.getItem("mf_twa") === "1";
    } catch (e) {
      return /^android-app:/.test(document.referrer);
    }
  })();
  const TERMS_VERSION = "2026-10";
  const db = window.supabase.createClient(c.supabaseUrl, c.supabaseAnonKey);
  /* Supervisor del club: mientras miras los datos de otro entrenador (viendo),
     la app no puede guardar, cambiar ni borrar nada en la base de datos. */
  let viendo = null;
  const SOLO_VER = "Estás viendo los datos de otro entrenador: solo puedes mirar, no cambiar nada.";
  const dbFrom = db.from.bind(db);
  db.from = (t) => {
    let q = dbFrom(t);
    if (!viendo) return q;
    const no = new Proxy(() => {}, {
      get: (o, k) => (k === "then" ? (ok) => ok({ data: null, error: { message: SOLO_VER } }) : () => no),
    });
    return new Proxy(q, {
      get: (o, k) =>
        ["insert", "update", "upsert", "delete"].includes(k)
          ? () => no
          : typeof o[k] === "function"
            ? o[k].bind(o)
            : o[k],
    });
  };
  /* Enlace público de un directo: ?directo=<código>. Se ve sin cuenta. */
  const PUB = (() => {
    let t = new URLSearchParams(location.search).get("directo") || "";
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)
      ? t
      : null;
  })();
  /* Enlace del equipo para los jugadores: ?equipo=<código>. Se ve sin cuenta. */
  const EQ = (() => {
    let t = new URLSearchParams(location.search).get("equipo") || "";
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t) ? t : null;
  })();
  /* Enlace del preparador físico: ?carga=<código>. Solo para mirar, sin cuenta (v11.6). */
  const PF = (() => {
    let t = new URLSearchParams(location.search).get("carga") || "";
    return !EQ && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t) ? t : null;
  })();
  /* Enlace del anotador del directo: ?anotar=<código>. Otra persona apunta los goles sin cuenta (v11.8). */
  const AN = (() => {
    let t = new URLSearchParams(location.search).get("anotar") || "";
    return !PUB && !EQ && !PF && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t) ? t : null;
  })();
  const state = {
    mode: "7",
    tab: "plantilla",
    players: [],
    matches: [],
    draft: null,
    editing: null,
    selectedSlot: null,
    selectedChip: null,
    justDragged: false,
    playerId: null,
    busy: false,
    live: null,
    livePick: false,
    teams: [],
    teamsOk: false,
    team: {},
    trainings: [],
    trOk: false,
    circs: [],
    ciOk: false,
    cgOk: false,
    ejOk: false,
    egOk: false,
    ejGuard: [],
    trMonth: "",
    trDay: "",
    boardMenu: false,
    boardPick: null,
  };
  const MODES = {
    7: { name: "Fútbol 7", n: 7, maxP: 14, maxM: 5, maxE: 5, cap: 14 },
    11: { name: "Fútbol 11", n: 11, maxP: 25, maxM: 5, maxE: 5, cap: 0 },
    fs: { name: "Fútbol sala", n: 5, maxP: 16, maxM: 5, maxE: 5, cap: 14 },
  };
  const MN = (k) => (MODES[k || state.mode] || MODES["7"]).name,
    MFN = (k) => (k === "fs" ? "fs" : "f" + k);
  const mk = (...L) => {
    const n = L.length,
      o = [["POR", 50, 92]];
    L.forEach((c, li) => {
      const y = Math.round((76 - li * (52 / (n - 1))) * 10) / 10,
        lab = li === 0 ? "DEF" : li === n - 1 ? "ATA" : "MED",
        m = c === 2 ? 30 : c === 3 ? 19 : c === 4 ? 13 : 10;
      for (let k = 0; k < c; k++)
        o.push([
          lab,
          c === 1
            ? 50
            : Math.round((m + (k * (100 - 2 * m)) / (c - 1)) * 10) / 10,
          y,
        ]);
    });
    return o;
  };
  function fieldMarks() {
    let base =
      '<div class="wm"></div><div class="line mid"></div><div class="circle"></div><div class="spot"></div><div class="box t"></div><div class="box b"></div>';
    return (
      base +
      (state.mode === "fs"
        ? '<div class="pen t"></div><div class="pen b"></div><div class="pen2 t"></div><div class="pen2 b"></div><div class="corner c1"></div><div class="corner c2"></div><div class="corner c3"></div><div class="corner c4"></div>'
        : '<div class="six t"></div><div class="six b"></div>')
    );
  }
  const formations = {
    fs: {
      "2-2": mk(2, 2),
      "1-2-1": mk(1, 2, 1),
      "3-1": mk(3, 1),
      "1-1-2": mk(1, 1, 2),
    },
    7: {
      "2-3-1": mk(2, 3, 1),
      "3-2-1": mk(3, 2, 1),
      "3-3": mk(3, 3),
      "2-2-2": mk(2, 2, 2),
      "3-1-2": mk(3, 1, 2),
      "1-3-2": mk(1, 3, 2),
      "1-2-3": mk(1, 2, 3),
      "2-1-2-1": mk(2, 1, 2, 1),
    },
    11: {
      "4-3-3": mk(4, 3, 3),
      "4-4-2": mk(4, 4, 2),
      "3-4-3": mk(3, 4, 3),
      "4-2-3-1": mk(4, 2, 3, 1),
      "4-5-1": mk(4, 5, 1),
      "3-5-2": mk(3, 5, 2),
      "5-3-2": mk(5, 3, 2),
      "5-4-1": mk(5, 4, 1),
      "4-1-4-1": mk(4, 1, 4, 1),
      "4-3-2-1": mk(4, 3, 2, 1),
      "4-4-1-1": mk(4, 4, 1, 1),
    },
  };

  const IC = {
    users:
      '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    calendar:
      '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    chart:
      '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    pencil: '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
    trash:
      '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    download:
      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    image:
      '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
    eraser:
      '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>',
    logout:
      '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    penline:
      '<path d="M12 20h9"/><path d="M16.4 3.6a2.1 2.1 0 0 1 3 3L7.4 18.6a2 2 0 0 1-.9.5l-3 .9a.5.5 0 0 1-.6-.6l.9-3a2 2 0 0 1 .5-.9z"/>',
    arrow: '<path d="M7 17 17 7"/><path d="M7 7h10v10"/>',
    live: '<circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.5M7.8 16.2a6 6 0 0 1 0-8.5M19.1 4.9a10 10 0 0 1 0 14.2M4.9 19.1a10 10 0 0 1 0-14.2"/>',
    share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="m16 6-4-4-4 4"/><path d="M12 2v13"/>',
    undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
    whistle:
      '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    play: '<path d="M7 4.5v15l12-7.5z"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    film: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m22 8-6 4 6 4z"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    hand: '<path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-6-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    maximize:
      '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  };
  const ic = (n, s = 20) =>
    `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]}</svg>`;
  const empty = (i, t, s) =>
    `<div class="blank">${ic(i, 34)}<b>${t}</b><span>${s}</span></div>`;
  const mini = (t) =>
    `<div class="mini" aria-label="${t.games} partidos, ${t.minutes} minutos, ${t.goals} goles, ${t.starts} titularidades${t.amarillas ? ", " + t.amarillas + " amarillas" : ""}${t.rojas ? ", " + t.rojas + " rojas" : ""}"><span><b>${t.games}</b>partidos</span><span><b>${t.minutes}</b>min</span><span><b>${t.goals}</b>goles</span><span><b>${t.starts}</b>titular</span>${t.cap ? `<span><b>${t.cap}</b>capitán</span>` : ""}${t.amarillas ? `<span class="tjm"><i class="tj a"></i><b>${t.amarillas}</b></span>` : ""}${t.rojas ? `<span class="tjm"><i class="tj r"></i><b>${t.rojas}</b></span>` : ""}</div>`;
  /* Robos, pérdidas, tiros… de la temporada (solo los que tengan algo) */
  const miniSt = (t) => {
    let v = [
      ["rob", "robos"],
      ["per", "pérdidas"],
      ["tir", "tiros", t.tp + t.tf],
      ["tp", "a puerta"],
      ["par", "paradas"],
      ["asi", "asist."],
      ["fal", "faltas"],
    ].filter((z) => (z[2] ?? t[z[0]]) > 0);
    return v.length ? `<div class="mini mst">${v.map((z) => `<span><b>${z[2] ?? t[z[0]]}</b>${z[1]}</span>`).join("")}</div>` : "";
  };
  const MES = [
    "ene",
    "feb",
    "mar",
    "abr",
    "may",
    "jun",
    "jul",
    "ago",
    "sep",
    "oct",
    "nov",
    "dic",
  ];
  const dtile = (f) => {
    let p = String(f || "").split("-");
    return `<div class="dtile" role="img" aria-label="${esc(f)}"><b>${esc(p[2] || "·")}</b><span>${MES[Number(p[1]) - 1] || ""}</span></div>`;
  };
  let lastKey = "",
    noteT;

  const $ = (id) => document.getElementById(id),
    esc = (v) =>
      String(v ?? "").replace(
        /[&<>"']/g,
        (x) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[x],
      ),
    avatar = (p, z) =>
      p?.foto?.startsWith("data:")
        ? `<img class="avatar${z ? " zoomable" : ""}" src="${esc(p.foto)}" alt="${z ? "Ampliar foto de " + esc(p.nombre) : ""}"${z ? ' tabindex="0" role="button"' : ""}>`
        : `<div class="avatar">${esc((p?.nombre || "?")[0].toUpperCase())}</div>`,
    modeCount = () => MODES[state.mode].n,
    /* Equipos: varios por modalidad. Sin equipo guardado = el primero de su modalidad. */
    teamsOf = (k) =>
      state.teams
        .filter((t) => t.modalidad === (k || state.mode))
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))),
    curTeam = (k) => {
      let L = teamsOf(k),
        id = state.team[k || state.mode];
      return L.some((t) => t.id === id) ? id : L[0] ? L[0].id : null;
    },
    teamOf = (x) => {
      let L = teamsOf(x.modalidad);
      return L.some((t) => t.id === x.equipo_id)
        ? x.equipo_id
        : L[0]
          ? L[0].id
          : null;
    },
    inTeam = (x) => x.modalidad === state.mode && teamOf(x) === curTeam(),
    teamName = (k, id) =>
      (state.teams.find((t) => t.id === (id === undefined ? curTeam(k) : id)) || {})
        .nombre || "Mi equipo",
    roster = () =>
      state.players
        .filter(inTeam)
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    games = () =>
      state.matches
        .filter(inTeam)
        .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    entries = (m) =>
      Array.isArray(m.participaciones) ? m.participaciones : [],
    name = (id) => state.players.find((p) => p.id === id)?.nombre || "Jugador";
  /* Dorsal del jugador como texto ("" si no tiene). */
  const dorsal = (p) => {
    let n = p ? parseInt(p.dorsal) : NaN;
    return n >= 0 && n <= 99 ? String(n) : "";
  };
  /* Datos del partido (dentro de alineacion): capitan, portero, cambios [{id,m,sale,entra}]
     y tarjetas [{id,m,pid,c:"a"|"r"}]. Los que vienen del Directo llevan lv:1. */
  const dname = (id) => {
      let d = dorsal(state.players.find((p) => p.id === id));
      return (d ? d + " · " : "") + name(id);
    },
    gkOf = (al, ids) => {
      let g = al && al.portero;
      if (g && (!ids || ids.includes(g))) return g;
      return (al && al.slots && al.slots[0]) || "";
    },
    mdList = (al, k) =>
      (al && Array.isArray(al[k]) ? al[k] : []).filter((z) => z && typeof z === "object"),
    rid = () => Math.random().toString(36).slice(2, 10);
  /* Minutos jugados según titulares, cambios y expulsiones (roja o 2ª amarilla). */
  function calcMin(players, cambios, tarjetas, total) {
    let on = {},
      out = {},
      am = {},
      ev = [];
    players.forEach((p) => {
      out[p.id] = 0;
      if (p.starter) on[p.id] = 0;
    });
    cambios.forEach((c) => ev.push({ m: Number(c.m) || 0, s: c.sale, e: c.entra }));
    tarjetas
      .slice()
      .sort((a, b) => (Number(a.m) || 0) - (Number(b.m) || 0))
      .forEach((t) => {
        if (t.c === "a") am[t.pid] = (am[t.pid] || 0) + 1;
        if (t.c === "r" || am[t.pid] === 2) ev.push({ m: Number(t.m) || 0, s: t.pid, x: 1 });
      });
    ev.sort((a, b) => a.m - b.m);
    let fuera = {};
    ev.forEach((e) => {
      let m = Math.min(total, Math.max(0, e.m));
      if (e.s in on) {
        out[e.s] += m - on[e.s];
        delete on[e.s];
      }
      if (e.x) fuera[e.s] = 1;
      if (e.e && e.e in out && !(e.e in on) && !fuera[e.e]) on[e.e] = m;
    });
    Object.keys(on).forEach((id) => (out[id] += total - on[id]));
    return out;
  }
  /* Estadísticas de cada jugador en el partido (v11.2). Van en su ficha de convocado:
     st {rob, per, tp, tf, par, asi, fal}. [clave, botón, plural, corto] */
  const ESTP = [
      ["rob", "Robo", "Balones robados", "Rob."],
      ["per", "Pérdida", "Balones perdidos", "Pérd."],
      ["tp", "Tiro a puerta", "Tiros a puerta", "T. pta"],
      ["tf", "Tiro fuera", "Tiros fuera", "T. fuera"],
      ["par", "Parada", "Paradas", "Par."],
      ["asi", "Asistencia", "Asistencias", "Asist."],
      ["fal", "Falta", "Faltas cometidas", "Faltas"],
    ],
    stv = (e, k) => Math.max(0, Number(e && e.st && e.st[k]) || 0);
  /* Suma (o pone, si fija) un dato: crea un objeto nuevo para no tocar la copia del partido guardado */
  function stSet(e, k, v, fija) {
    let s = { ...(e.st && typeof e.st === "object" ? e.st : {}) };
    s[k] = Math.min(999, Math.max(0, fija ? Number(v) || 0 : (Number(s[k]) || 0) + v));
    if (!s[k]) delete s[k];
    if (Object.keys(s).length) e.st = s;
    else delete e.st;
  }
  function parseJson(v, fb) {
    if (v && typeof v === "object") return v;
    try {
      let x = JSON.parse(v || "");
      return x && typeof x === "object" ? x : fb;
    } catch {
      return fb;
    }
  }
  function friendly(t) {
    t = String(t || "");
    if (/Failed to fetch|NetworkError|Load failed|network/i.test(t))
      return "Sin conexión con el servidor. Revisa tu internet e inténtalo de nuevo.";
    if (/JWT|expired|not authenticated/i.test(t))
      return "Tu sesión ha caducado. Cierra sesión y vuelve a entrar.";
    if (/row-level security|violates row/i.test(t))
      return "No tienes permiso para hacer eso.";
    if (/duplicate key|already exists/i.test(t)) return "Eso ya existe.";
    if (/violates check constraint/i.test(t))
      return /foto/i.test(t)
        ? "La foto es demasiado grande. Prueba con otra."
        : "Algún dato no es válido. Revísalo e inténtalo de nuevo.";
    return t;
  }
  function note(t, ok = false) {
    if (/LIMITE_PLAN/.test(t || "")) {
      $("modal").classList.add("hidden");
      showInfo(state.tab === "entrenos" ? "proentreno" : "pro");
      return;
    }
    if (!ok) t = friendly(t);
    clearTimeout(noteT);
    $("message").innerHTML = t
      ? `<div class="message ${ok ? "ok" : ""}" role="${ok ? "status" : "alert"}"><span>${esc(t)}</span><button class="x" data-dismiss aria-label="Cerrar aviso">${ic("x", 18)}</button></div>`
      : "";
    if (t && ok)
      noteT = setTimeout(() => {
        $("message").innerHTML = "";
      }, 4500);
  }
  async function load() {
    if (viendo) return render();
    /* Sin conexión con la cuenta no se carga nada: se dejaría la plantilla y el directo vacíos */
    if (sesPerdida) return render();
    let [{ data: ps, error: pe }, { data: ms, error: me }, tr, en, ci, cg, ej, eg] = await Promise.all([
      db
        .from("futbol_personal_jugadores")
        .select("*")
        .order("nombre"),
      db
        .from("futbol_personal_partidos")
        .select("*")
        .order("fecha", { ascending: false }),
      (async () => {
        try {
          return await db.from("equipos").select("*").order("created_at");
        } catch (e) {
          return { data: null, error: e };
        }
      })(),
      (async () => {
        try {
          return await db.from("entrenamientos").select("*").order("fecha");
        } catch (e) {
          return { data: null, error: e };
        }
      })(),
      (async () => {
        try {
          return await db.from("circuitos").select("*").order("created_at");
        } catch (e) {
          return { data: null, error: e };
        }
      })(),
      (async () => {
        try {
          return await db.from("entrenamientos").select("id,carga").limit(1);
        } catch (e) {
          return { data: null, error: e };
        }
      })(),
      (async () => {
        try {
          return await db.from("entrenamientos").select("id,ejercicios").limit(1);
        } catch (e) {
          return { data: null, error: e };
        }
      })(),
      (async () => {
        try {
          return await db.from("ejercicios_guardados").select("*").order("created_at");
        } catch (e) {
          return { data: null, error: e };
        }
      })(),
    ]);
    if (pe || me) throw pe || me;
    state.teamsOk = !tr.error;
    state.teams = tr.data || [];
    state.trOk = !en.error;
    /* Circuitos (v10.4): si falta ejecutar supabase-circuitos.sql, la app sigue igual sin ellos */
    state.ciOk = state.trOk && !!ci && !ci.error;
    /* Carga física (v10.5): hace falta la columna entrenamientos.carga (supabase-carga.sql) */
    state.cgOk = state.trOk && !!cg && !cg.error;
    /* Ejercicios sueltos (v11.0): hace falta la columna entrenamientos.ejercicios (supabase-ejercicios.sql) */
    state.ejOk = state.trOk && !!ej && !ej.error;
    /* Mis ejercicios (v11.1): tabla ejercicios_guardados (supabase-mis-ejercicios.sql) */
    state.egOk = state.ejOk && !!eg && !eg.error;
    state.ejGuard = ((eg && eg.data) || []).map((x) => ({ id: x.id, s: ejDe([parseJson(x.datos, {})])[0] })).filter((x) => x.s);
    state.circs = ((ci && ci.data) || []).map((x) => ({ id: x.id, c: ciLimpio(parseJson(x.datos, {})) }));
    state.trainings = (en.data || []).map((x) => ({
      ...x,
      asistencia: parseJson(x.asistencia, {}),
    }));
    try {
      state.team = JSON.parse(localStorage.getItem("mf_equipo_sel") || "{}") || {};
    } catch (e) {}
    state.players = ps || [];
    state.matches = (ms || []).map((m) => ({
      ...m,
      participaciones: parseJson(m.participaciones, []),
      alineacion: parseJson(m.alineacion, {}),
    }));
    await Promise.all([espCarga(), jgCarga()]);
    await loadLive();
    render();
  }
  function totals(pid) {
    return games().reduce(
      (r, m) => {
        let e = entries(m).find((x) => x.id === pid);
        if (e) {
          r.games++;
          r.starts += e.starter ? 1 : 0;
          r.minutes += Number(e.minutes) || 0;
          r.goals += Number(e.goals) || 0;
          ESTP.forEach((s) => (r[s[0]] += stv(e, s[0])));
          mdList(m.alineacion, "tarjetas").forEach((t) => {
            if (t.pid === pid) r[t.c === "r" ? "rojas" : "amarillas"]++;
          });
          if (m.alineacion && m.alineacion.capitan === pid) r.cap++;
        }
        return r;
      },
      { games: 0, starts: 0, minutes: 0, goals: 0, amarillas: 0, rojas: 0, cap: 0, rob: 0, per: 0, tp: 0, tf: 0, par: 0, asi: 0, fal: 0 },
    );
  }
  function render() {
    directoRecuerda();
    let eo = entrenosOn();
    if (!eo && state.tab === "entrenos") state.tab = "plantilla";
    document.querySelectorAll("[data-mode]").forEach((b) => {
      let on = b.dataset.mode === state.mode;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    });
    document.querySelectorAll("[data-tab]").forEach((b) => {
      let on = b.dataset.tab === state.tab;
      b.classList.toggle("on", on);
      if (on) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    $("trTab").classList.toggle("hidden", !eo);
    document.querySelector(".dock").classList.toggle("d5", eo);
    $("teams").innerHTML = teamBar();
    let all = games().flatMap(entries);
    $("stats").innerHTML = [
      ["Jugadores", roster().length],
      ["Partidos", games().length],
      ["Minutos", all.reduce((a, x) => a + (Number(x.minutes) || 0), 0)],
      ["Goles", all.reduce((a, x) => a + (Number(x.goals) || 0), 0)],
    ]
      .map(
        (x) => `<div class="stat"><small>${x[0]}</small><b>${x[1]}</b></div>`,
      )
      .join("");
    let v = $("view"),
      key =
        state.mode + state.tab + (state.draft ? "e" : "") + (state.live ? "l" : "");
    /* Móvil en horizontal: la pizarra se abre a pantalla completa (no cabe con la cabecera). */
    if (state.tab !== "pizarra" || state.draft) state.present = false;
    else if (boardPhoneLand() && !state.presentOff && !state.present) {
      state.present = true;
      state.autoPres = true;
    }
    document.body.classList.toggle("presenting", !!state.present);
    document.body.classList.toggle(
      "tab-pizarra",
      state.tab === "pizarra" && !state.draft,
    );
    document.body.style.overflow = state.present ? "hidden" : "";
    v.innerHTML = state.live
      ? liveView()
      : state.draft
      ? editor()
      : state.tab === "plantilla"
        ? players()
        : state.tab === "partidos"
          ? matches()
          : state.tab === "pizarra"
            ? boardView()
            : state.tab === "entrenos"
              ? entrenosView()
              : summary();
    if (!state.draft && state.tab === "pizarra") initBoard();
    espSync();
    if (key !== lastKey && espOk && espDe() && (state.tab === "entrenos" || state.tab === "partidos")) espRefresca();
    if (key !== lastKey) {
      lastKey = key;
      v.classList.remove("enter");
      void v.offsetWidth;
      v.classList.add("enter");
    }
  }
  function teamBar() {
    let L = teamsOf(),
      cur = curTeam(),
      chips = L.length
        ? L.map(
            (t) =>
              `<button type="button" data-team="${esc(t.id)}" class="${t.id === cur ? "on" : ""}" aria-pressed="${t.id === cur}">${esc(t.nombre)}</button>`,
          ).join("")
        : `<button type="button" class="on" aria-pressed="true">Mi equipo</button>`;
    return `<div class="team-chips" role="group" aria-label="Equipos de ${esc(MN())}">${chips}</div><button type="button" class="ib" data-teamact="rename" aria-label="Cambiar el nombre del equipo" title="Cambiar nombre">${ic("pencil", 18)}</button>${L.length > 1 ? `<button type="button" class="ib d" data-teamact="del" aria-label="Borrar este equipo" title="Borrar equipo">${ic("trash", 18)}</button>` : ""}<button type="button" class="ib add" data-teamact="add" aria-label="Añadir otro equipo" title="Añadir equipo">${ic("plus", 18)}<span>Equipo</span></button>${viendo ? "" : `<button type="button" class="ib add esp-b" data-esp="abrir" aria-label="Enlace del equipo para los jugadores" title="Enlace del equipo">${ic("link", 18)}<span>Enlace</span></button>`}${catSel()}`;
  }
  /* Categoría del equipo: marca cuánto dura cada parte (para el Directo y los minutos) */
  /* [clave, nombre, minutos por parte en F7/F11, minutos por parte en fútbol sala] */
  const CATS = [
    ["prebenjamin", "Prebenjamín", 25, 25],
    ["benjamin", "Benjamín", 30, 25],
    ["alevin", "Alevín", 35, 25],
    ["infantil", "Infantil", 40, 25],
    ["cadete", "Cadete", 45, 20],
    ["juvenil", "Juvenil", 45, 20],
    ["senior", "Senior / Aficionado", 45, 20],
  ];
  const catMin = (c, k) => c[(k || state.mode) === "fs" ? 3 : 2];
  const catKey = (k, id) => "mf_cat:" + (id || k || state.mode),
    catOf = (k, id) => {
      let t = state.teams.find((z) => z.id === id),
        c = t && t.categoria;
      if (!c)
        try {
          c = localStorage.getItem(catKey(k, id)) || "";
        } catch (e) {}
      return CATS.find((z) => z[0] === c) || null;
    },
    /* Minutos por parte: los de la categoría del equipo, o los normales de la modalidad */
    parteDe = (k, id) => {
      let c = catOf(k, id);
      return c ? catMin(c, k) : LIVE_PARTE[k] || 30;
    };
  function catSel() {
    let c = catOf(state.mode, curTeam());
    return `<label class="tcat"><span>Categoría</span><select id="teamCat" aria-label="Categoría del equipo"><option value="">Sin categoría (${LIVE_PARTE[state.mode] || 30}' por parte)</option>${CATS.map((z) => `<option value="${z[0]}" ${c && c[0] === z[0] ? "selected" : ""}>${z[1]} · 2 × ${catMin(z)}'</option>`).join("")}</select></label>`;
  }
  async function setCat(v) {
    if (viendo) return note(SOLO_VER), render();
    let id = curTeam(),
      local = false;
    try {
      if (!id && state.teamsOk) id = await firstTeam(teamName());
      if (!id) throw Error("categoria");
      let r = await db.from("equipos").update({ categoria: v || null }).eq("id", id);
      if (r.error) throw r.error;
      try {
        localStorage.removeItem(catKey(state.mode, id));
      } catch (e) {}
    } catch (e) {
      if (!/categor/i.test((e && e.message) || "")) return note(e.message || String(e));
      /* Sin la columna en el servidor: se guarda en este dispositivo */
      local = true;
      try {
        if (v) localStorage.setItem(catKey(state.mode, id), v);
        else localStorage.removeItem(catKey(state.mode, id));
      } catch (z) {}
    }
    await load();
    let c = CATS.find((z) => z[0] === v);
    note(
      (c ? `Categoría ${c[1]}: partes de ${catMin(c)} minutos.` : `Sin categoría: partes de ${LIVE_PARTE[state.mode] || 30} minutos.`) +
        (local ? " De momento se guarda solo en este dispositivo (falta un paso en el servidor)." : ""),
      !local,
    );
  }
  $("teams").addEventListener("change", (e) => {
    if (e.target.id === "teamCat") setCat(e.target.value);
  });
  function pickTeam(id) {
    state.team[state.mode] = id;
    if (!viendo) try {
      localStorage.setItem("mf_equipo_sel", JSON.stringify(state.team));
    } catch (e) {}
  }
  function teamName_ask(def) {
    let n = prompt("Nombre del equipo", def || "");
    if (n === null) return null;
    n = n.trim().slice(0, 40);
    if (!n) {
      note("Escribe un nombre para el equipo.");
      return null;
    }
    return n;
  }
  /* Crea en la base de datos el equipo «virtual» de una modalidad y le pasa sus jugadores y partidos */
  async function firstTeam(nombre) {
    let row = {
        id: crypto.randomUUID(),
        owner_id: curUser,
        modalidad: state.mode,
        nombre: nombre || "Mi equipo",
      },
      r = await db.from("equipos").insert(row);
    if (r.error) throw r.error;
    await Promise.all(
      ["futbol_personal_jugadores", "futbol_personal_partidos"]
        .concat(state.trOk ? ["entrenamientos"] : [])
        .map((tb) =>
        db
          .from(tb)
          .update({ equipo_id: row.id })
          .eq("modalidad", state.mode)
          .is("equipo_id", null),
      ),
    );
    return row.id;
  }
  async function teamAct(k) {
    if (!state.teamsOk)
      return note(
        "Para tener varios equipos falta un paso en el servidor (supabase-equipos.sql).",
      );
    if (!leaveDraft()) return;
    try {
      if (k === "add") {
        if (plan !== "pro") return showInfo("proteam");
        let n = teamName_ask("");
        if (!n) return;
        if (!teamsOf().length) await firstTeam();
        let row = {
            id: crypto.randomUUID(),
            owner_id: curUser,
            modalidad: state.mode,
            nombre: n,
          },
          r = await db.from("equipos").insert(row);
        if (r.error) throw r.error;
        pickTeam(row.id);
        state.draft = null;
        state.live = null;
        await load();
        note(`Equipo «${n}» creado.`, true);
      } else if (k === "rename") {
        let n = teamName_ask(teamName());
        if (!n) return;
        let id = curTeam();
        if (!id) id = await firstTeam(n);
        else {
          let r = await db.from("equipos").update({ nombre: n }).eq("id", id);
          if (r.error) throw r.error;
        }
        await load();
        note("Nombre del equipo guardado.", true);
      } else if (k === "del") {
        let L = teamsOf(),
          id = curTeam();
        if (L.length < 2) return;
        let ps = roster().length,
          ms = games(),
          nm = teamName();
        if (
          !confirm(
            `¿Borrar el equipo «${nm}»? Se borrarán también sus ${ps} jugadores y ${ms.length} partidos${trainings().length ? ` y ${trainings().length} entrenamientos` : ""}. No se puede deshacer.`,
          )
        )
          return;
        let ids = ms.map((m) => m.id);
        if (ids.length)
          await db.from("directos").delete().in("partido_id", ids);
        if (L[0].id === id)
          await Promise.all(
            ["futbol_personal_jugadores", "futbol_personal_partidos"]
              .concat(state.trOk ? ["entrenamientos"] : [])
              .map((tb) =>
              db
                .from(tb)
                .delete()
                .eq("modalidad", state.mode)
                .is("equipo_id", null),
            ),
          );
        let r = await db.from("equipos").delete().eq("id", id);
        if (r.error) throw r.error;
        pickTeam(null);
        state.tab = "plantilla";
        state.draft = null;
        state.live = null;
        await load();
        note(`Equipo «${nm}» borrado.`, true);
      }
    } catch (x) {
      note(x.message || String(x));
    }
  }
  function players() {
    let r = roster();
    return `<section class="panel"><div class="bar"><div><div class="kicker">Plantilla</div><h2>${MN()}</h2><p class="muted">${r.length}${plan === "pro" ? "" : " / " + MODES[state.mode].maxP} ${r.length === 1 ? "jugador" : "jugadores"}</p></div><button class="primary" data-action="add-player">${ic("plus")}Jugador</button></div>${
      r.length
        ? r
            .map((p) => {
              let t = totals(p.id);
              return `<div class="row" data-pid="${p.id}">${avatar(p, true)}<div class="info"><strong>${dorsal(p) ? `<span class="dor" aria-label="Dorsal ${dorsal(p)}">${dorsal(p)}</span>` : ""}${esc(p.nombre)}</strong>${mini(t)}</div><div class="actions"><button class="ib" data-action="edit-player" data-id="${p.id}" aria-label="Editar ${esc(p.nombre)}" title="Editar">${ic("pencil")}</button><button class="ib d" data-action="delete-player" data-id="${p.id}" aria-label="Borrar ${esc(p.nombre)}" title="Borrar">${ic("trash")}</button></div></div>`;
            })
            .join("")
        : empty(
            "users",
            "Todavía no hay jugadores.",
            "Añade a tu plantilla con nombre y foto.",
          )
    }</section>`;
  }
  function matches() {
    let g = games();
    return `<section class="panel"><div class="bar"><div><div class="kicker">Partidos</div><h2>${MN()}</h2><p class="muted">${plan === "pro" ? "" : games().length + " / " + MODES[state.mode].maxM + " partidos · "}Convocatoria, titulares, posiciones y goles.</p></div><div class="mbtns">${viendo ? "" : `<button class="secondary" data-cv="abrir">${ic("users")}Convocatoria</button>`}<button class="primary" data-action="add-match">${ic("plus")}Partido</button></div></div>${cvCard()}${
      g.length
        ? g
            .map((m) => {
              let e = entries(m),
                a = m.alineacion || {};
              return `<div class="row mrow" data-mid="${m.id}">${dtile(m.fecha)}<div class="info"><strong>${esc(m.rival)}</strong><small>${liveChip(m.id)}${resChip(a)}${esc(a.formation || "Sin formación")} · ${e.length} convocados · ${e.reduce((s, x) => s + (Number(x.minutes) || 0), 0)} min · ${e.reduce((s, x) => s + (Number(x.goals) || 0), 0)} goles</small>${a.conv && (a.conv.cita || a.conv.lugar) ? `<small class="cl">${esc([a.conv.cita ? "Citación " + a.conv.cita : "", a.conv.hora ? "partido " + a.conv.hora : "", a.conv.lugar].filter(Boolean).join(" · "))}</small>` : ""}<small class="cl">Inicial: ${
                e
                  .filter((x) => x.starter)
                  .map((x) => esc(name(x.id)))
                  .join(", ") || "—"
              }</small></div><div class="actions"><button class="ib lvb" data-action="live" data-id="${m.id}" aria-label="Directo del partido contra ${esc(m.rival)}" title="Directo">${ic("live")}</button><button class="ib" data-img="${m.id}" aria-label="Descargar imagen de la alineación" title="Descargar imagen">${ic("image")}</button><button class="ib" data-action="edit-match" data-id="${m.id}" aria-label="Editar partido contra ${esc(m.rival)}" title="Editar">${ic("pencil")}</button><button class="ib d" data-action="delete-match" data-id="${m.id}" aria-label="Borrar partido contra ${esc(m.rival)}" title="Borrar">${ic("trash")}</button></div></div>`;
            })
            .join("")
        : empty(
            "calendar",
            "Todavía no hay partidos.",
            "Crea el primero y coloca a tus titulares en el campo.",
          )
    }</section>`;
  }
  function resChip(a) {
    let r = a && a.resultado;
    if (!r) return "";
    let c =
      r.gf > r.gc
        ? ["w", "Victoria"]
        : r.gf < r.gc
          ? ["l", "Derrota"]
          : ["d", "Empate"];
    return `<span class="res ${c[0]}">${c[1]} ${r.gf}-${r.gc}</span> `;
  }
  function summary() {
    let gs = games(),
      rs = gs.filter((m) => m.alineacion && m.alineacion.resultado),
      R = (m) => m.alineacion.resultado,
      W = rs.filter((m) => R(m).gf > R(m).gc).length,
      L = rs.filter((m) => R(m).gf < R(m).gc).length,
      D = rs.length - W - L,
      GF = rs.reduce((s, m) => s + R(m).gf, 0),
      GC = rs.reduce((s, m) => s + R(m).gc, 0),
      dif = GF - GC,
      tot = GF + GC;
    let last = [...rs]
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .slice(-5)
      .map((m) => {
        let r = R(m),
          k =
            r.gf > r.gc
              ? ["w", "V", "Victoria"]
              : r.gf < r.gc
                ? ["l", "D", "Derrota"]
                : ["d", "E", "Empate"];
        return `<span class="fchip ${k[0]}" title="${k[2]} ${r.gf}-${r.gc} vs ${esc(m.rival)}" aria-label="${k[2]} ${r.gf}-${r.gc} contra ${esc(m.rival)}">${k[1]}</span>`;
      })
      .join("");
    let team = `<section class="panel"><div class="kicker">Equipo</div><h2>${MN()}</h2><div style="height:14px"></div>${
      rs.length
        ? `<div class="tstats">${[
            ["Victorias", W, "w"],
            ["Empates", D, "d"],
            ["Derrotas", L, "l"],
            ["Goles a favor", GF, "g"],
            ["Goles en contra", GC, "l"],
            ["Diferencia", (dif > 0 ? "+" : "") + dif, ""],
          ]
            .map(
              (x) =>
                `<div class="stat ${x[2]}"><small>${x[0]}</small><b>${x[1]}</b></div>`,
            )
            .join(
              "",
            )}</div>${tot ? `<div class="vsbar" role="img" aria-label="Goles a favor ${GF}, en contra ${GC}"><i style="width:${Math.round((GF / tot) * 100)}%"></i></div><div class="vsleg"><span>A favor <b>${GF}</b></span><span>En contra <b>${GC}</b></span></div>` : ""}<div class="formline"><span class="muted">Últimos resultados</span>${last}</div><p class="muted" style="margin:12px 0 0">${rs.length} de ${gs.length} partidos con resultado.</p>`
        : '<p class="muted">Pon el resultado al guardar un partido y aquí saldrán victorias, empates, derrotas y goles a favor y en contra.</p>'
    }</section>`;
    let list = gs.length
      ? `<section class="panel"><h2 class="h2s">Resultados</h2><div style="height:8px"></div>${gs
          .map((m) => {
            let r = m.alineacion && m.alineacion.resultado,
              c = r ? (r.gf > r.gc ? "w" : r.gf < r.gc ? "l" : "d") : "";
            return `<div class="row"><div class="avatar res ${c}">${r ? (c === "w" ? "V" : c === "l" ? "D" : "E") : "·"}</div><div class="info"><strong>${esc(m.rival)}</strong><small>${esc(fmtDate(m.fecha))} · ${r ? `${r.gf > r.gc ? "Victoria" : r.gf < r.gc ? "Derrota" : "Empate"} ${r.gf}-${r.gc}` : "Sin resultado"}</small></div></div>`;
          })
          .join("")}</section>`
      : "";
    return team + list + playerSummary();
  }
  function playerSummary() {
    let r = roster()
      .map((p) => ({ p, t: totals(p.id) }))
      .sort(
        (a, b) =>
          b.t.goals - a.t.goals ||
          b.t.minutes - a.t.minutes ||
          a.p.nombre.localeCompare(b.p.nombre, "es"),
      );
    return `<section class="panel"><h2 class="h2s">Jugadores</h2><p class="muted">Ordenados por goles y minutos · ${MN()}</p><div style="height:6px"></div>${r.length ? r.map((x, i) => `<div class="row"><div class="rank">${i + 1}</div>${avatar(x.p)}<div class="info"><strong>${esc(x.p.nombre)}</strong>${mini(x.t)}${miniSt(x.t)}</div><div class="big"><b>${x.t.goals}</b><small>goles</small></div></div>`).join("") : empty("chart", "Aún no hay datos.", "Añade jugadores y partidos para ver el resumen.")}</section>`;
  }
  /* ===== Control de entrenamientos (opcional: se activa en Mi cuenta) =====
     Un calendario por equipo; en cada entrenamiento se marca quién vino, quién faltó
     y quién tuvo falta justificada. Asistencia: {id del jugador: "si" | "tarde" | "no" | "jus"}. «tarde» (v11.1) cuenta como que vino. */
  const MESES = [
      "enero",
      "febrero",
      "marzo",
      "abril",
      "mayo",
      "junio",
      "julio",
      "agosto",
      "septiembre",
      "octubre",
      "noviembre",
      "diciembre",
    ],
    ymd = (d) =>
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0"),
    trKey = () => "mf_entrenos:" + (curUser || ""),
    trainings = () =>
      state.trainings
        .filter(inTeam)
        .sort((a, b) =>
          (a.fecha + (a.hora || "")).localeCompare(b.fecha + (b.hora || "")),
        ),
    trCount = (t) => {
      let r = { si: 0, tarde: 0, no: 0, jus: 0 },
        ids = new Set(roster().map((p) => p.id));
      Object.entries(t.asistencia || {}).forEach(([id, v]) => {
        if (ids.has(id) && r[v] !== undefined) r[v]++;
      });
      return r;
    },
    pct = (r) => {
      let v = r.si + (r.tarde || 0),
        n = v + r.no + r.jus;
      return n ? Math.round((v * 100) / n) : null;
    };
  const RELOJ =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  let trQ = Promise.resolve();
  function entrenosOn() {
    if (viendo) return state.trainings.length > 0;
    try {
      let v = localStorage.getItem(trKey());
      if (v !== null) return v === "1";
    } catch (e) {}
    return state.trainings.length > 0;
  }
  function setEntrenos(on) {
    try {
      localStorage.setItem(trKey(), on ? "1" : "0");
    } catch (e) {}
  }
  function trDayLabel(f) {
    let d = new Date(f + "T12:00:00");
    return `${["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"][d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
  }
  function trCalendar() {
    let [y, m] = state.trMonth.split("-").map(Number),
      first = new Date(y, m - 1, 1),
      days = new Date(y, m, 0).getDate(),
      skip = (first.getDay() + 6) % 7,
      hoy = ymd(new Date()),
      byDay = {};
    trainings().forEach((t) => (byDay[t.fecha] = byDay[t.fecha] || []).push(t));
    let cells = "";
    for (let i = 0; i < skip; i++) cells += "<span></span>";
    for (let d = 1; d <= days; d++) {
      let f = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        L = byDay[f] || [],
        r = L.reduce(
          (a, t) => {
            let c = trCount(t);
            a.si += c.si;
            a.tarde += c.tarde;
            a.no += c.no;
            a.jus += c.jus;
            return a;
          },
          { si: 0, tarde: 0, no: 0, jus: 0 },
        ),
        p = pct(r),
        k = !L.length ? "" : p === null ? "p" : p >= 80 ? "w" : p >= 50 ? "d" : "l";
      cells += `<button type="button" data-tr="day" data-f="${f}" class="${k ? "has " + k : ""}${f === hoy ? " hoy" : ""}${f === state.trDay ? " on" : ""}" aria-pressed="${f === state.trDay}" aria-label="${esc(trDayLabel(f))}${L.length ? ", entrenamiento" + (p === null ? " sin marcar" : ", asistencia " + p + "%") : ""}">${d}${L.length ? "<i></i>" : ""}</button>`;
    }
    return `<div class="cal"><div class="cal-h"><button type="button" class="ib" data-tr="prev" aria-label="Mes anterior">${ic("back", 18)}</button><b>${MESES[m - 1]} ${y}</b><button type="button" class="ib flip" data-tr="next" aria-label="Mes siguiente">${ic("back", 18)}</button></div><div class="cal-w" aria-hidden="true">${["L", "M", "X", "J", "V", "S", "D"].map((x) => `<span>${x}</span>`).join("")}</div><div class="cal-g">${cells}</div><div class="cal-ley"><span><i class="w"></i>80% o más</span><span><i class="d"></i>50-79%</span><span><i class="l"></i>menos del 50%</span><span><i class="p"></i>sin marcar</span></div></div>`;
  }
  function trSession(t) {
    let c = trCount(t),
      r = roster(),
      a = t.asistencia || {},
      B = [
        ["si", "Vino", "check"],
        ["tarde", "Llegó tarde", "reloj"],
        ["no", "Faltó", "x"],
        ["jus", "Justificada", ""],
      ];
    return `<div class="trs" data-tid="${t.id}"><div class="formgrid"><label>Hora<input type="time" data-trf="hora" data-id="${t.id}" value="${esc(t.hora || "")}"></label><label>Qué vamos a trabajar<input data-trf="nota" data-id="${t.id}" maxlength="300" placeholder="Ej.: juego de 4, defensa con cambio, activación" value="${esc(t.nota || "")}" autocomplete="off"></label></div>${ciBloque(t)}${ejBloque(t)}${viendo ? "" : `<div class="btools tr-env"><button type="button" class="primary small" data-tr="enviar" data-id="${t.id}">${ic("share", 18)}Enviar el entreno a los jugadores</button></div>`}${cxMDHtml(t)}${cgTrBloque(t)}${espResumen("entreno", t.id)}<p class="muted trsum"><b class="w">${c.si + c.tarde}</b> vinieron${c.tarde ? ` (<b class="t">${c.tarde}</b> tarde)` : ""} · <b class="l">${c.no}</b> faltaron · <b class="d">${c.jus}</b> justificadas${r.length - c.si - c.tarde - c.no - c.jus > 0 ? ` · ${r.length - c.si - c.tarde - c.no - c.jus} sin marcar` : ""}</p>${
      r.length
        ? `<div class="btools"><button type="button" class="secondary small" data-tr="all" data-id="${t.id}">${ic("check", 18)}Todos vinieron</button><button type="button" class="secondary small" data-action="add-player">${ic("plus", 18)}Añadir jugador</button></div>${r
            .map(
              (p) =>
                `<div class="row trow">${avatar(p)}<div class="info"><strong>${esc(p.nombre)}</strong>${espTag("entreno", t.id, p.id)}</div><div class="asis" role="group" aria-label="Asistencia de ${esc(p.nombre)}">${B.map(
                  (b) =>
                    `<button type="button" class="${b[0]}${a[p.id] === b[0] ? " on" : ""}" data-tr="mark" data-id="${t.id}" data-pid="${p.id}" data-v="${b[0]}" aria-pressed="${a[p.id] === b[0]}" aria-label="${b[1]}" title="${b[1]}">${b[2] === "reloj" ? RELOJ : b[2] ? ic(b[2], 18) : "J"}</button>`,
                ).join("")}</div></div>`,
            )
            .join("")}`
        : empty(
            "users",
            "Todavía no hay jugadores.",
            "Añade a tus jugadores con su nombre para pasar lista.",
          ) +
          `<div class="stack"><button type="button" class="primary" data-action="add-player">${ic("plus")}Añadir jugador</button></div>`
    }<div class="btools trdel"><button type="button" class="danger small" data-tr="del" data-id="${t.id}">${ic("trash", 18)}Borrar este entrenamiento</button></div></div>`;
  }
  function trPlayers() {
    let T = trainings(),
      r = roster()
        .map((p) => {
          let x = { si: 0, tarde: 0, no: 0, jus: 0 };
          T.forEach((t) => {
            let v = (t.asistencia || {})[p.id];
            if (x[v] !== undefined) x[v]++;
          });
          return { p, x, pc: pct(x) };
        })
        .sort(
          (a, b) =>
            (b.pc ?? -1) - (a.pc ?? -1) ||
            b.x.si + b.x.tarde - (a.x.si + a.x.tarde) ||
            a.p.nombre.localeCompare(b.p.nombre, "es"),
        );
    return `<section class="panel"><h2 class="h2s">Asistencia por jugador</h2><p class="muted">${T.length} ${T.length === 1 ? "entrenamiento" : "entrenamientos"} · ${esc(teamName())}</p><div style="height:6px"></div>${
      r.length
        ? r
            .map(
              (o) =>
                `<div class="row">${avatar(o.p)}<div class="info"><strong>${esc(o.p.nombre)}</strong><small>${o.x.si + o.x.tarde} vino${o.x.tarde ? ` (${o.x.tarde} tarde)` : ""} · ${o.x.no} faltó · ${o.x.jus} justificada${o.x.jus === 1 ? "" : "s"}</small><div class="trbar" aria-hidden="true"><i style="width:${o.pc || 0}%"></i></div></div><div class="big"><b>${o.pc === null ? "–" : o.pc + "%"}</b><small>asistencia</small></div></div>`,
            )
            .join("")
        : empty("chart", "Aún no hay datos.", "Añade jugadores y pasa lista en tus entrenamientos.")
    }</section>`;
  }
  function entrenosView() {
    if (!state.trMonth) {
      let d = new Date();
      state.trMonth = ymd(d).slice(0, 7);
      state.trDay = ymd(d);
    }
    let T = trainings(),
      tot = T.reduce(
        (a, t) => {
          let c = trCount(t);
          a.si += c.si;
          a.tarde += c.tarde;
          a.no += c.no;
          a.jus += c.jus;
          return a;
        },
        { si: 0, tarde: 0, no: 0, jus: 0 },
      ),
      tp = pct(tot),
      dayT = T.filter((t) => t.fecha === state.trDay);
    if (!state.trOk)
      return `<section class="panel"><div class="kicker">Entrenamientos</div><h2>${MN()}</h2><p class="muted">El control de entrenamientos aún no está activado en el servidor (falta ejecutar supabase-entrenamientos.sql en Supabase).</p></section>`;
    return `<section class="panel"><div class="bar"><div><div class="kicker">Entrenamientos</div><h2>${MN()}</h2><p class="muted">${plan === "pro" ? "" : state.trainings.filter((t) => t.modalidad === state.mode).length + " / " + MODES[state.mode].maxE + " · "}${T.length} ${T.length === 1 ? "entrenamiento" : "entrenamientos"}${tp === null ? "" : " · " + tp + "% de asistencia"}</p></div><button class="primary" data-tr="new">${ic("plus")}Entreno</button></div>${trCalendar()}</section><section class="panel"><div class="bar"><div><div class="kicker">${esc(trDayLabel(state.trDay))}</div><h2 class="h2s">${dayT.length ? (dayT.length > 1 ? dayT.length + " entrenamientos" : "Pasar lista") : "Sin entrenamiento"}</h2></div>${dayT.length ? `<button type="button" class="secondary small" data-tr="new">${ic("plus", 18)}Otro</button>` : ""}</div>${viendo ? "" : `<div class="btools"><button type="button" class="secondary small" data-tr="rec">${ic("live", 18)}Grabar el entreno</button></div>`}${
      dayT.length
        ? dayT.map(trSession).join("")
        : `<p class="muted">Este día no hay entrenamiento.</p><div class="stack"><button type="button" class="primary" data-tr="new">${ic("plus")}Crear entrenamiento este día</button></div>`
    }</section>${ciPanel()}${cgPanel()}${faPanel()}${trPlayers()}`;
  }
  /* Mensaje del entreno para el grupo de los jugadores (v11.3): qué se trabaja y cada ejercicio
     explicado, para que lleguen sabiéndolo y se pierda menos tiempo en explicaciones. */
  const trMin = (s) => (s >= 60 ? Math.round(s / 60) + " min" : s + " s");
  function trTexto(t) {
    let L = [`🏃 *ENTRENAMIENTO* · ${teamName()}`, `📅 ${trDayLabel(t.fecha).replace(/^./, (x) => x.toUpperCase())}${t.hora ? " · " + t.hora : ""}`];
    if (t.nota) L.push("", `🎯 *Vamos a trabajar:* ${t.nota}`);
    let E = ejDe(t.ejercicios),
      c = state.ciOk ? ciDe(t.circuito) : null;
    if (E.length) {
      L.push("", "📋 *Ejercicios:*");
      E.forEach((s, i) => {
        L.push(`${i + 1}. ${s.n} (${trMin(s.t)}${s.f ? " · " + FASE[s.f][1] : ""})`);
        if (s.d) L.push(`   ${s.d}`);
      });
    }
    if (c) {
      L.push("", `💪 *Circuito: ${c.nombre}* (${c.series} ${c.series === 1 ? "serie" : "series"}, unos ${Math.max(1, Math.round(ciTotal(c) / 60))} min)`);
      c.est.forEach((s, i) => L.push(`${i + 1}. ${s.n}`));
    }
    L.push("", "Venid con esto leído y así aprovechamos más el entreno 💪");
    return L.join("\n");
  }
  async function trEnviar(t) {
    if (!t.nota && !ejDe(t.ejercicios).length && !(state.ciOk && ciDe(t.circuito)))
      return note("Escribe primero qué vais a trabajar o añade algún ejercicio.");
    let txt = trTexto(t),
      wa = "https://wa.me/?text=" + encodeURIComponent(txt);
    ciOpen(
      "Enviar el entreno",
      `<p class="muted">Este es el mensaje para el grupo de tus jugadores. Así llegan sabiendo qué se va a trabajar.</p>${envQuedan("tr")}<pre class="cv-txt">${esc(txt)}</pre><div class="stack"><a class="primary" data-trx="wa" href="${wa}" target="_blank" rel="noopener">${ic("share", 20)}Enviar por WhatsApp</a>${navigator.share ? '<button type="button" class="secondary" data-trx="share">Compartir…</button>' : ""}<button type="button" class="secondary" data-trx="copiar">Copiar el mensaje</button></div>`,
    );
    $("infoBody").scrollTop = 0;
    trTxt = txt;
    trEnvId = t.id;
  }
  let trTxt = "",
    trEnvId = "";
  $("info").addEventListener("click", async (e) => {
    let b = e.target.closest("[data-trx]");
    if (!b) return;
    if (!envPuede("tr", trEnvId)) return e.preventDefault();
    if (b.dataset.trx === "wa") return;
    if (b.dataset.trx === "share") {
      try {
        await navigator.share({ text: trTxt });
      } catch (x) {}
    } else copiaTexto(trTxt, "Mensaje copiado. Pégalo en el grupo de tus jugadores.");
  });
  async function copiaTexto(txt, ok) {
    try {
      await navigator.clipboard.writeText(txt);
      return note(ok, true);
    } catch (e) {}
    let ta = document.createElement("textarea");
    ta.value = txt;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let bien = false;
    try {
      bien = document.execCommand("copy");
    } catch (e) {}
    ta.remove();
    note(bien ? ok : "No se pudo copiar: mantén el dedo sobre el mensaje para copiarlo.", bien);
  }
  function trSave(t, patch) {
    if (viendo) return note(SOLO_VER), render();
    Object.assign(t, patch);
    trQ = trQ.then(async () => {
      let r = await db.from("entrenamientos").update(patch).eq("id", t.id);
      if (r.error) note(r.error.message);
    });
    return trQ;
  }
  async function trAct(b) {
    let k = b.dataset.tr,
      t = state.trainings.find((x) => x.id === b.dataset.id);
    if (k === "enviar") return t && trEnviar(t);
    if (k === "prev" || k === "next") {
      let [y, m] = state.trMonth.split("-").map(Number),
        d = new Date(y, m - 1 + (k === "next" ? 1 : -1), 1);
      state.trMonth = ymd(d).slice(0, 7);
      return render();
    }
    if (k === "day") {
      state.trDay = b.dataset.f;
      return render();
    }
    /* Grabar el entreno: misma cámara que el Directo, el vídeo se queda en el móvil (gratis) */
    if (k === "rec") return camAbre(null, false, { fecha: state.trDay || ymd(new Date()), equipo: teamName() });
    if (k === "new") {
      if (
        plan !== "pro" &&
        state.trainings.filter((x) => x.modalidad === state.mode).length >= MODES[state.mode].maxE
      )
        return showInfo("proentreno");
      let row = {
        id: crypto.randomUUID(),
        owner_id: curUser,
        modalidad: state.mode,
        fecha: state.trDay,
        asistencia: {},
      };
      if (curTeam()) row.equipo_id = curTeam();
      b.disabled = true;
      let r = await db.from("entrenamientos").insert(row);
      b.disabled = false;
      if (r.error) return note(r.error.message);
      state.trainings.push(row);
      render();
      return note("Entrenamiento creado. Marca quién ha venido.", true);
    }
    if (!t) return;
    if (k === "mark") {
      let a = { ...t.asistencia },
        v = b.dataset.v;
      if (a[b.dataset.pid] === v) delete a[b.dataset.pid];
      else a[b.dataset.pid] = v;
      trSave(t, { asistencia: a });
      return render();
    }
    if (k === "all") {
      let a = { ...t.asistencia };
      roster().forEach((p) => (a[p.id] = "si"));
      trSave(t, { asistencia: a });
      return render();
    }
    if (k === "del") {
      if (!confirm(`¿Borrar el entrenamiento del ${trDayLabel(t.fecha)}?`)) return;
      let r = await db.from("entrenamientos").delete().eq("id", t.id);
      if (r.error) return note(r.error.message);
      state.trainings = state.trainings.filter((x) => x.id !== t.id);
      render();
      note("Entrenamiento borrado.", true);
    }
  }
  $("view").addEventListener("click", (e) => {
    let b = e.target.closest("[data-tr]");
    if (b) trAct(b).catch((x) => note(x.message || String(x)));
  });
  $("view").addEventListener("change", (e) => {
    let f = e.target.dataset.trf,
      t = f && state.trainings.find((x) => x.id === e.target.dataset.id);
    if (!t) return;
    let v = e.target.value.trim().slice(0, 300) || null;
    if ((t[f] || null) === v) return;
    trSave(t, { [f]: v });
  });
  /* ===== Circuitos de fuerza, coordinación y velocidad (v10.4) =====
     Biblioteca de ejercicios con dibujo, circuitos dentro de cada entreno (columna entrenamientos.circuito)
     y «Mis circuitos» guardados (tabla circuitos). Gratis: CI_MAX circuitos guardados; Pro: sin límite.
     El mismo número está en limite_circuitos() de supabase-circuitos.sql. */
  const CI_MAX = 3;
  const CI_PIC = {
    sentadilla:
      '<circle cx="34" cy="13" r="4.5"/><path d="M33 18 29 32h13l-2 15M31 23h15M16 50h34"/>',
    zancada: '<circle cx="31" cy="11" r="4.5"/><path d="M31 16v16l9 7v11M31 32l-8 11-9 5M31 21l-7 8M31 21l7 7M8 51h46"/>',
    flexion: '<circle cx="14" cy="30" r="4.5"/><path d="m19 33 35 12M23 35v12M8 48h50"/>',
    plancha: '<circle cx="12" cy="31" r="4.5"/><path d="m17 34 37 10M19 36v10h8M8 47h50"/>',
    lateral: '<circle cx="14" cy="20" r="4.5"/><path d="m17 25 36 21M19 26v20M24 29l2-14M8 47h50"/>',
    puente: '<circle cx="9" cy="43" r="4.5"/><path d="m14 45 18-13 10-1 4 15M14 46h12M6 48h50"/>',
    nordico: '<circle cx="44" cy="17" r="4.5"/><path d="M41 22 25 46H10M36 29l12 6M6 48h50"/>',
    salto: '<circle cx="30" cy="11" r="4.5"/><path d="M30 16v14l-6 10M30 30l7 10M30 20l-8-9M30 20l8-9M50 46V22m-5 6 5-6 5 6M14 54h34"/>',
    equilibrio: '<circle cx="32" cy="11" r="4.5"/><path d="M32 16v16v18M32 32l8 6-4 6M32 22H19M32 22h13M20 51h24"/>',
    sprint: '<circle cx="37" cy="11" r="4.5"/><path d="m35 16-7 16 10 8-2 10M28 32l-8 10-8-2M33 21l9 6M33 21l-9 2M4 18h10M3 26h10"/>',
    escalera:
      '<path d="M22 4v56M42 4v56M22 12h20M22 24h20M22 36h20M22 48h20"/><circle cx="28" cy="18" r="2.5" fill="currentColor"/><circle cx="36" cy="30" r="2.5" fill="currentColor"/><circle cx="28" cy="42" r="2.5" fill="currentColor"/><circle cx="36" cy="54" r="2.5" fill="currentColor"/>',
    conos:
      '<path d="M16 6l-4 8h8zM48 20l-4 8h8zM16 34l-4 8h8zM48 48l-4 8h8z"/><path d="M24 12 42 24 22 38l20 12" stroke-dasharray="3 4"/>',
    vallas: '<path d="M6 50V40h12v10M26 50V40h12v10M46 50V40h12v10M4 51h56"/><path d="M8 34q8-14 16 0q8-14 16 0q8-14 16 0" stroke-dasharray="3 4"/>',
    aros: '<circle cx="18" cy="14" r="7"/><circle cx="44" cy="26" r="7"/><circle cx="18" cy="38" r="7"/><circle cx="44" cy="50" r="7"/>',
    balon:
      '<circle cx="22" cy="11" r="4.5"/><path d="M22 16v16l-2 18M22 32l11 7 7 4M22 21l-8 6M22 21l8 5M10 51h24"/><circle cx="50" cy="45" r="6"/><path d="m50 42 3 2-1 3h-4l-1-3z"/>',
  };
  const ciPic = (k, s = 56) =>
    `<svg class="ci-pic" width="${s}" height="${s}" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${CI_PIC[k] || CI_PIC.sprint}</svg>`;
  const CI_CAT = [
    ["fuerza", "Fuerza"],
    ["core", "Core"],
    ["coord", "Coordinación"],
    ["veloc", "Velocidad"],
    ["movil", "Calentamiento"],
  ];
  /* [id, categoría, dibujo, nombre, cómo se hace] — todo con el peso del cuerpo, apto para fútbol base */
  const CI_EJ = [
    ["sent", "fuerza", "sentadilla", "Sentadilla", "Pies a la anchura de los hombros. Baja como si te sentaras en una silla, espalda recta y rodillas hacia fuera. Sube despacio."],
    ["zanc", "fuerza", "zancada", "Zancadas alternas", "Da un paso largo al frente y baja hasta que la rodilla de atrás casi toque el suelo. Vuelve y cambia de pierna."],
    ["flex", "fuerza", "flexion", "Flexiones", "Manos bajo los hombros y cuerpo recto. Baja el pecho y empuja. Si cuesta, con las rodillas apoyadas."],
    ["puen", "fuerza", "puente", "Puente de glúteo", "Tumbado boca arriba con las rodillas dobladas. Sube la cadera apretando el glúteo, aguanta 2 segundos y baja."],
    ["ssal", "fuerza", "salto", "Sentadilla con salto", "Haz una sentadilla y salta lo más alto que puedas. Cae suave, con las rodillas un poco dobladas."],
    ["banc", "fuerza", "salto", "Saltos a un banco bajo", "Salta con los dos pies a un banco o escalón bajo y baja andando. Cae siempre suave y estable."],
    ["nord", "fuerza", "nordico", "Nórdico con compañero", "De rodillas, un compañero te sujeta los tobillos. Déjate caer hacia delante lo más despacio que puedas y frena con las manos. Previene lesiones de isquios."],
    ["cope", "fuerza", "lateral", "Copenhague (aductores)", "Plancha lateral con la pierna de arriba apoyada en un banco o en las manos de un compañero. Aguanta recto. Previene lesiones de ingle."],
    ["geme", "fuerza", "equilibrio", "Elevación de gemelos", "De pie, sube de puntillas despacio y baja controlando. Más difícil: a una pierna."],
    ["pzc", "fuerza", "equilibrio", "Sentadilla a una pierna", "Apoyado en una pierna, baja un poco doblando la rodilla sin que se vaya hacia dentro. Vuelve a subir. Cambia de pierna a mitad."],
    ["plan", "core", "plancha", "Plancha frontal", "Apoyado en antebrazos y puntas de los pies, cuerpo recto como una tabla. No subas ni bajes la cadera."],
    ["plat", "core", "lateral", "Plancha lateral", "De lado, apoyado en un antebrazo, cadera arriba y cuerpo recto. Cambia de lado a mitad del tiempo."],
    ["esca", "core", "plancha", "Escaladores", "En posición de flexión, lleva las rodillas al pecho una y otra vez, rápido y sin subir la cadera."],
    ["supe", "core", "plancha", "Superman", "Tumbado boca abajo, levanta a la vez brazos y piernas un poco del suelo. Aguanta 2 segundos y baja."],
    ["bich", "core", "puente", "Bicho muerto", "Boca arriba, brazos y piernas arriba. Baja a la vez un brazo y la pierna contraria sin despegar la espalda del suelo."],
    ["abal", "core", "balon", "Abdominales con pase", "Por parejas, sentados frente a frente. Sube, pasa el balón con las manos al compañero y vuelve a bajar."],
    ["esc1", "coord", "escalera", "Escalera: un pie en cada hueco", "Corre por la escalera pisando una vez en cada hueco, rápido y de puntillas, brazos activos."],
    ["esc2", "coord", "escalera", "Escalera: dos pies en cada hueco", "Pisa con los dos pies dentro de cada hueco antes de pasar al siguiente. Lo más rápido que puedas sin pisar las barras."],
    ["esc3", "coord", "escalera", "Escalera lateral", "De lado a la escalera: dentro, dentro, fuera. Ve y vuelve sin girarte."],
    ["esc4", "coord", "escalera", "Escalera: dentro y fuera", "Dentro con un pie, dentro con el otro, fuera, fuera, avanzando hueco a hueco. Mira al frente, no a los pies."],
    ["skip", "coord", "sprint", "Skipping", "Carrera en el sitio o avanzando poco, subiendo las rodillas a la altura de la cadera."],
    ["talo", "coord", "sprint", "Talones al glúteo", "Corre despacio llevando los talones a tocar el glúteo, rápido y de puntillas."],
    ["zigz", "coord", "conos", "Zigzag entre conos", "Pon 6 conos en zigzag. Corre de uno a otro con pasos cortos y cambia de dirección rápido en cada cono."],
    ["aros", "coord", "aros", "Saltos en aros", "Pon aros en el suelo. Salta de uno a otro: a pies juntos, a la pata coja o alternando pies."],
    ["slin", "coord", "salto", "Saltos laterales a una línea", "Pies juntos, salta a un lado y a otro de una línea, lo más rápido posible sin pisarla."],
    ["val1", "coord", "vallas", "Vallas bajas: rodillas arriba", "Pasa por encima de vallas bajas (o picas) subiendo bien las rodillas, un pie entre cada valla."],
    ["val2", "coord", "vallas", "Vallas bajas: pies juntos", "Salta las vallas bajas con los pies juntos, enlazando un salto con otro y cayendo suave."],
    ["slal", "coord", "conos", "Conducción en slalom", "Conduce el balón entre los conos tocándolo con las dos piernas, sin que se te escape."],
    ["toqu", "coord", "balon", "Toques de balón", "Toques con el pie, el muslo y la cabeza sin que caiga. Cuenta cuántos haces seguidos."],
    ["equi", "coord", "equilibrio", "Equilibrio con pase", "A una pierna, recibe y devuelve el balón al compañero sin apoyar el otro pie. Cambia de pierna a mitad."],
    ["spr1", "veloc", "sprint", "Sprint de 10 metros", "Salida rápida y sprint de 10 metros a tope. Vuelve andando a la salida."],
    ["reac", "veloc", "sprint", "Salida de reacción", "Tumbado, sentado o de espaldas. A la señal (palmada o un color) se levanta y sale en sprint."],
    ["5105", "veloc", "conos", "Cambio de dirección 5-10-5", "Tres conos en línea a 5 metros. Sales del centro, tocas un lado, cruzas hasta el otro y vuelves al centro."],
    ["atra", "veloc", "sprint", "Atrás y giro", "Corre hacia atrás 5 metros, gira rápido y haz sprint hacia delante."],
    ["sbal", "veloc", "balon", "Sprint con balón", "Conduce el balón a máxima velocidad 15 metros con toques largos y frena con la planta."],
    ["ldef", "veloc", "conos", "Desplazamiento lateral defensivo", "Bajo, con las piernas abiertas, desplázate de lado entre dos conos sin cruzar los pies."],
    ["cade", "movil", "equilibrio", "Abrir y cerrar la cadera", "De pie, sube la rodilla y ábrela hacia fuera dibujando un círculo. Luego al revés. Cambia de pierna."],
    ["tobi", "movil", "equilibrio", "Tobillos y rodillas", "Círculos con los tobillos y con las rodillas juntas, hacia un lado y hacia el otro."],
    ["trot", "movil", "sprint", "Carrera suave con brazos", "Trote suave haciendo círculos con los brazos hacia delante y hacia atrás."],
    ["pata", "movil", "zancada", "Patadas al frente", "Andando, sube la pierna estirada al frente intentando tocar la punta del pie con la mano contraria."],
  ];
  const ciEj = (id) => CI_EJ.find((x) => x[0] === id);
  const ciEst = (id) => {
    let e = ciEj(id);
    return { e: id, n: e[3], d: e[4] };
  };
  /* Plantillas listas para usar */
  const CI_PLANT = [
    { nombre: "Fuerza básica sin material", trabajo: 30, descanso: 15, series: 3, pausa: 60, est: ["sent", "zanc", "flex", "puen", "plan", "esca"] },
    { nombre: "Coordinación con escalera y conos", trabajo: 30, descanso: 20, series: 2, pausa: 60, est: ["esc1", "esc2", "esc3", "zigz", "val1", "slin"] },
    { nombre: "Velocidad y reacción", trabajo: 20, descanso: 40, series: 3, pausa: 90, est: ["skip", "reac", "5105", "spr1", "ldef"] },
    { nombre: "Prevención de lesiones", trabajo: 30, descanso: 20, series: 2, pausa: 60, est: ["nord", "cope", "plat", "equi", "geme", "puen"] },
    { nombre: "Calentamiento con balón", trabajo: 40, descanso: 10, series: 1, pausa: 0, est: ["trot", "cade", "pata", "talo", "slal", "toqu"] },
  ].map((p) => ({ ...p, est: p.est.map(ciEst) }));
  /* Tiempos libres (en segundos): mínimo y máximo de cada uno */
  const CI_LIM = { trabajo: [5, 1800], descanso: [0, 600], pausa: [0, 900], t: [5, 1800] };
  const ciClamp = (v, f) => Math.min(CI_LIM[f][1], Math.max(CI_LIM[f][0], Math.round(+v || 0)));
  const ciT = (c, s) => (s && s.t ? s.t : c.trabajo);
  const ciCopia = (c) => JSON.parse(JSON.stringify(c));
  const ciSeg = (s) => (s >= 60 ? Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") + " min" : s + " s");
  function ciTotal(c) {
    let n = (c.est || []).length;
    if (!n) return 0;
    let w = c.est.reduce((a, s) => a + ciT(c, s), 0);
    return c.series * (w + (n - 1) * c.descanso) + (c.series - 1) * c.pausa;
  }
  const ciMeta = (c) =>
    `${c.est.length} ${c.est.length === 1 ? "ejercicio" : "ejercicios"} · ${c.est.some((s) => s.t && s.t !== c.trabajo) ? "trabajo a medida" : ciSeg(c.trabajo) + " trabajo"} / ${ciSeg(c.descanso)} descanso · ${c.series} ${c.series === 1 ? "serie" : "series"} · unos ${Math.max(1, Math.round(ciTotal(c) / 60))} min`;
  function ciLimpio(c) {
    let num = (v, f, d) => (v === undefined || v === null || v === "" || isNaN(+v) ? d : ciClamp(v, f));
    return {
      nombre: String(c.nombre || "").trim().slice(0, 60) || "Circuito",
      trabajo: num(c.trabajo, "trabajo", 30),
      descanso: num(c.descanso, "descanso", 15),
      series: Math.min(6, Math.max(1, +c.series || 1)),
      pausa: num(c.pausa, "pausa", 60),
      est: (c.est || []).slice(0, 20).map((x) => ({
        e: x.e && ciEj(x.e) ? x.e : null,
        n: String(x.n || "").trim().slice(0, 60) || "Ejercicio",
        d: String(x.d || "").trim().slice(0, 300),
        ...(+x.t ? { t: ciClamp(x.t, "t") } : {}),
      })),
    };
  }
  const ciDe = (x) => (x ? ciLimpio(parseJson(x, {})) : null);
  const ciPicDe = (s) => (s.e && ciEj(s.e) ? ciEj(s.e)[2] : "");
  let ciEd = null;
  function ciOpen(t, h) {
    $("infoTitle").textContent = t;
    $("infoBody").innerHTML = h;
    $("info").classList.remove("hidden");
  }
  function ciLimiteHtml() {
    return `<p>En el plan gratuito puedes guardar <b>${CI_MAX} circuitos</b> en «Mis circuitos». Puedes seguir poniendo circuitos en tus entrenos y usar todas las plantillas y la biblioteca.</p><p>Con el <b>plan Pro</b> guardas <b>todos los circuitos que quieras</b>, además de jugadores, partidos y entrenamientos ilimitados y varios equipos.</p>${precioProHtml()}<div class="stack">${proBtn()}${clubLinkBtn()}</div>`;
  }
  function ciBloque(t) {
    if (!state.ciOk) return "";
    let c = ciDe(t.circuito);
    if (!c)
      return viendo
        ? ""
        : `<div class="btools ci-add"><button type="button" class="secondary small" data-ci="nuevo" data-id="${t.id}">${ic("plus", 18)}Añadir circuito de fuerza o coordinación</button></div>`;
    return `<div class="ci-card"><div class="kicker">Circuito</div><b class="ci-nom">${esc(c.nombre)}</b><p class="muted">${ciMeta(c)}</p><ol class="ci-mini">${c.est.map((s) => `<li>${esc(s.n)}</li>`).join("")}</ol><div class="btools"><button type="button" class="primary small" data-ci="run" data-id="${t.id}">▶ Iniciar</button>${viendo ? "" : `<button type="button" class="secondary small" data-ci="editar" data-id="${t.id}">Editar</button><button type="button" class="secondary small" data-ci="quitar" data-id="${t.id}">Quitar</button>`}</div></div>`;
  }
  /* --- Ejercicios sueltos del entreno (v11.0) ---
     Ejercicios que no son de ningún circuito (rondo, partidillo, finalización…), cada uno con su
     nombre, explicación y tiempo. Van en la columna entrenamientos.ejercicios (supabase-ejercicios.sql)
     como lista: [{"n": nombre, "d": cómo se hace, "t": segundos}]. Gratis hasta LIM.ej por entreno; con Pro sin límite (EJ_MAX es solo un tope de seguridad). */
  const EJ_MAX = 200;
  /* --- Fases del juego (v11.7, idea de un preparador físico) ---
     Cada ejercicio del entreno y cada jugada de la pizarra se puede marcar con su fase:
     ataque (organizado y contraataque), defensa (organizada y reorganización defensiva) y ABP
     (acciones a balón parado). El contraataque es la transición defensa-ataque y la reorganización,
     la de ataque-defensa. [clave, nombre, corto, color, fase] */
  const FASES = [
    ["at", "Ataque organizado", "Ataque organizado", "#2be36a", "Ataque"],
    ["tda", "Contraataque (transición defensa-ataque)", "Contraataque", "#facc15", "Ataque"],
    ["de", "Defensa organizada", "Defensa organizada", "#60a5fa", "Defensa"],
    ["tad", "Reorganización defensiva (transición ataque-defensa)", "Reorganización defensiva", "#f97316", "Defensa"],
    ["abp", "ABP (acciones a balón parado)", "ABP", "#c084fc", "Balón parado"],
  ];
  const FASE = {};
  FASES.forEach((x) => (FASE[x[0]] = x));
  const faseTag = (f) => (FASE[f] ? `<i class="fa-tag" style="--c:${FASE[f][3]}">${esc(FASE[f][2])}</i>` : "");
  /* Botones para elegir la fase (se puede dejar sin fase). act = data-ej="fase" o data-jg="fase" */
  const faseChips = (cur, act) =>
    `<div class="fa-pick"><span>Fase del juego (opcional)</span>${["Ataque", "Defensa", "Balón parado"]
      .map(
        (g) =>
          `<div class="fa-chips" role="group" aria-label="${g}"><small>${g}</small>${FASES.filter((x) => x[4] === g)
            .map(
              (x) =>
                `<button type="button" class="fa-chip${cur === x[0] ? " on" : ""}" style="--c:${x[3]}" data-${act === "jgfa" ? "jg" : "ej"}="fase" data-f="${x[0]}" aria-pressed="${cur === x[0]}" title="${esc(x[1])}">${esc(x[2])}</button>`,
            )
            .join("")}</div>`,
      )
      .join("")}</div>`;
  const ejMax = () => (esPro() ? EJ_MAX : LIM.ej);
  const ejLleno = () =>
    esPro()
      ? note(`Un entreno puede tener hasta ${EJ_MAX} ejercicios.`)
      : proLimite(`En el plan gratuito cada entreno puede tener <b>${LIM.ej} ejercicios</b>. Con el plan Pro, sin límite.`);
  const EG_MAX = 5000; /* tope de seguridad de «Mis ejercicios» con Pro, el mismo que en supabase-limites.sql */
  /* Sin tope a la vista: solo uno de seguridad (24 h) para que no se cuelen números absurdos */
  const EJ_LIM = [5, 86400];
  const ejClamp = (v) => Math.min(EJ_LIM[1], Math.max(EJ_LIM[0], Math.round(+v || 0)));
  function ejDe(x) {
    let l = parseJson(x, []);
    if (!Array.isArray(l)) return [];
    return l.slice(0, EJ_MAX).map((s) => ({
      n: String((s && s.n) || "").trim().slice(0, 60) || "Ejercicio",
      d: String((s && s.d) || "").trim().slice(0, 300),
      t: ejClamp((s && s.t) || 600),
      ...(s && FASE[s.f] ? { f: s.f } : {}),
    }));
  }
  let ejEd = null;
  /* Mantiene lo escrito al repintar el formulario */
  function ejLeeForm() {
    let box = $("infoBody"),
      q = (x) => box.querySelector(x);
    if (!ejEd || !q("[data-ejf=n]")) return;
    ejEd.s.n = q("[data-ejf=n]").value;
    ejEd.s.d = q("[data-ejf=d]").value;
    ejEd.s.t = (+q("[data-ejm=m]").value || 0) * 60 + (+q("[data-ejm=s]").value || 0) || 600;
    if (q("[data-ejg]")) ejEd.guardar = q("[data-ejg]").checked;
  }
  /* Guarda en «Mis ejercicios». Si ya hay uno con el mismo nombre, lo actualiza. */
  async function ejGuardar(s) {
    let ya = state.ejGuard.find((x) => x.s.n.toLowerCase() === s.n.toLowerCase());
    if (ya) {
      let r = await db.from("ejercicios_guardados").update({ datos: s }).eq("id", ya.id);
      if (r.error) return note(r.error.message);
      ya.s = { ...s };
      return;
    }
    if (!esPro() && state.ejGuard.length >= LIM.misEj)
      return proLimite(`En el plan gratuito puedes guardar <b>${LIM.misEj} ejercicios</b> en «Mis ejercicios». Con el plan Pro, sin límite.`);
    if (state.ejGuard.length >= EG_MAX) return note(`Puedes guardar hasta ${EG_MAX} ejercicios en «Mis ejercicios».`);
    let row = { id: crypto.randomUUID(), owner_id: curUser, datos: s };
    let r = await db.from("ejercicios_guardados").insert(row);
    if (r.error) return note(r.error.message);
    state.ejGuard.push({ id: row.id, s: { ...s } });
  }
  function ejBloque(t) {
    let L = ejDe(t.ejercicios);
    if (viendo ? !L.length : !state.ejOk) return "";
    let tot = L.reduce((a, s) => a + s.t, 0);
    return `<div class="ej-box">${
      L.length
        ? `<div class="ci-card ej-card"><div class="kicker">Ejercicios</div><p class="muted">${L.length} ${L.length === 1 ? "ejercicio" : "ejercicios"} · unos ${Math.max(1, Math.round(tot / 60))} min</p>${L.map(
            (s, i) =>
              `<div class="ej-it"><div class="info"><strong>${esc(s.n)}</strong><small>⏱ ${ciSeg(s.t)}${s.f ? " " + faseTag(s.f) : ""}</small>${s.d ? `<p>${esc(s.d)}</p>` : ""}</div><div class="ej-acc"><button type="button" class="primary small" data-ej="run" data-id="${t.id}" data-i="${i}" aria-label="Iniciar ${esc(s.n)}">▶ Iniciar</button>${
                viendo
                  ? ""
                  : `<button type="button" class="secondary small" data-ej="editar" data-id="${t.id}" data-i="${i}">Editar</button><button type="button" class="ib" data-ej="quitar" data-id="${t.id}" data-i="${i}" aria-label="Quitar ${esc(s.n)}">${ic("x", 18)}</button>`
              }</div></div>`,
          ).join("")}</div>`
        : ""
    }${viendo ? "" : `<div class="btools ci-add"><button type="button" class="secondary small" data-ej="nuevo" data-id="${t.id}">${ic("plus", 18)}Añadir ejercicio</button></div>`}</div>`;
  }
  function ejEditorHtml() {
    let s = ejEd.s,
      m = Math.floor(s.t / 60),
      sg = s.t % 60,
      at = (u) => `type="number" inputmode="numeric" pattern="[0-9]*" min="0" ${u === "m" ? "" : 'max="59"'} data-ejm="${u}"`;
    let G = state.egOk ? state.ejGuard : [],
      mis =
        ejEd.i === null && G.length
          ? `<h3 class="ci-h3">Mis ejercicios</h3><p class="muted">Toca uno para ponerlo en este entreno.</p><div class="eg-list">${G.map(
              (g) =>
                `<div class="eg-it"><button type="button" class="ci-opt" data-ej="usar" data-gid="${g.id}"><b>${esc(g.s.n)}</b><small>⏱ ${ciSeg(g.s.t)}${g.s.f ? " · " + FASE[g.s.f][1] : ""}${g.s.d ? " · " + esc(g.s.d.slice(0, 60)) + (g.s.d.length > 60 ? "…" : "") : ""}</small></button><button type="button" class="ib" data-ej="borrarg" data-gid="${g.id}" aria-label="Borrar ${esc(g.s.n)} de Mis ejercicios">${ic("trash", 18)}</button></div>`,
            ).join("")}</div><h3 class="ci-h3">O escribe uno nuevo</h3>`
          : "",
      chk = state.egOk ? `<label class="ci-chk"><input type="checkbox" data-ejg${ejEd.guardar ? " checked" : ""}> Guardar también en «Mis ejercicios» para reutilizarlo</label>` : "";
    return `${mis}${mis ? "" : "<p>Un ejercicio suelto, sin circuito: un rondo, un partidillo, una finalización… Pon lo que quieras con su tiempo.</p>"}<label class="ci-l">Nombre<input data-ejf="n" maxlength="60" placeholder="Ej.: Rondo 4 contra 2" value="${esc(s.n)}" autocomplete="off"></label><label class="ci-l">Cómo se hace (opcional)<textarea data-ejf="d" maxlength="300" rows="3" placeholder="Explícalo en pocas palabras">${esc(s.d)}</textarea></label><div class="ci-tl"><span>Tiempo</span><span class="ci-mmss"><input ${at("m")} aria-label="Minutos del ejercicio" value="${m}"><i>min</i><input ${at("s")} aria-label="Segundos del ejercicio" value="${sg}"><i>s</i></span></div><p class="muted ci-ayt">Escribe los minutos y segundos que quieras, sin límite.</p>${faseChips(s.f, "ejfa")}${chk}<div class="stack"><button type="button" class="primary" data-ej="ok">${ejEd.i === null ? "Añadir al entreno" : "Guardar"}</button></div>`;
  }
  async function ejAct(b) {
    let k = b.dataset.ej,
      t = b.dataset.id && state.trainings.find((x) => x.id === b.dataset.id),
      i = +b.dataset.i;
    if (k === "run" && t) {
      let s = ejDe(t.ejercicios)[i];
      if (s) ciCorre({ nombre: s.n, trabajo: s.t, descanso: 0, series: 1, pausa: 0, est: [{ e: null, n: s.n, d: s.d }] });
      return;
    }
    if (viendo) return note(SOLO_VER);
    if (k === "nuevo" && t) {
      if (ejDe(t.ejercicios).length >= ejMax()) return ejLleno();
      ciEd = null;
      ejEd = { id: t.id, i: null, s: { n: "", d: "", t: 600, f: "" }, guardar: true };
      ciOpen("Añadir ejercicio", ejEditorHtml());
      $("infoBody").scrollTop = 0;
      return;
    }
    if (k === "editar" && t) {
      let s = ejDe(t.ejercicios)[i];
      if (!s) return;
      ciEd = null;
      ejEd = { id: t.id, i, s: { ...s }, guardar: false };
      return ciOpen("Editar ejercicio", ejEditorHtml());
    }
    if (k === "quitar" && t) {
      let L = ejDe(t.ejercicios);
      if (!L[i] || !confirm(`¿Quitar «${L[i].n}» de este entreno?`)) return;
      L.splice(i, 1);
      await trSave(t, { ejercicios: L.length ? L : null });
      render();
      return note("Ejercicio quitado.", true);
    }
    if (k === "fase" && ejEd) {
      ejLeeForm();
      ejEd.s.f = ejEd.s.f === b.dataset.f ? "" : b.dataset.f;
      let y = $("infoBody").scrollTop;
      ciOpen(ejEd.i === null ? "Añadir ejercicio" : "Editar ejercicio", ejEditorHtml());
      $("infoBody").scrollTop = y;
      return;
    }
    if (k === "usar" && ejEd) {
      let g = state.ejGuard.find((x) => x.id === b.dataset.gid),
        tr = state.trainings.find((x) => x.id === ejEd.id);
      if (!g || !tr) return;
      let L = ejDe(tr.ejercicios);
      if (L.length >= ejMax()) return ejLleno();
      L.push({ ...g.s });
      await trSave(tr, { ejercicios: L });
      $("info").classList.add("hidden");
      ejEd = null;
      render();
      return note("Añadido: " + g.s.n + ".", true);
    }
    if (k === "borrarg" && ejEd) {
      let g = state.ejGuard.find((x) => x.id === b.dataset.gid);
      if (!g || !confirm(`¿Borrar «${g.s.n}» de «Mis ejercicios»? Los entrenos que ya lo tienen lo conservan.`)) return;
      let r = await db.from("ejercicios_guardados").delete().eq("id", g.id);
      if (r.error) return note(r.error.message);
      state.ejGuard = state.ejGuard.filter((x) => x !== g);
      ejLeeForm();
      return ciOpen("Añadir ejercicio", ejEditorHtml());
    }
    if (k === "ok" && ejEd) {
      let box = $("infoBody"),
        n = (box.querySelector("[data-ejf=n]").value || "").trim(),
        d = (box.querySelector("[data-ejf=d]").value || "").trim(),
        mm = box.querySelector("[data-ejm=m]").value,
        ss = box.querySelector("[data-ejm=s]").value,
        seg = (+mm || 0) * 60 + (+ss || 0);
      if (!n) return note("Escribe el nombre del ejercicio.");
      if (seg < EJ_LIM[0]) return note("Escribe cuánto dura el ejercicio.");
      let tr = state.trainings.find((x) => x.id === ejEd.id);
      if (!tr) return;
      let L = ejDe(tr.ejercicios),
        s = { n: n.slice(0, 60), d: d.slice(0, 300), t: ejClamp(seg), ...(FASE[ejEd.s.f] ? { f: ejEd.s.f } : {}) };
      if (ejEd.i === null) {
        if (L.length >= ejMax()) return ejLleno();
        L.push(s);
      } else L[ejEd.i] = s;
      let gu = $("infoBody").querySelector("[data-ejg]");
      b.disabled = true;
      try {
        await trSave(tr, { ejercicios: L });
        if (gu && gu.checked) await ejGuardar(s);
      } finally {
        b.disabled = false;
      }
      $("info").classList.add("hidden");
      ejEd = null;
      render();
      return note("Ejercicio guardado.", true);
    }
  }
  $("view").addEventListener("click", (e) => {
    let b = e.target.closest("[data-ej]");
    if (b) ejAct(b).catch((x) => note(x.message || String(x)));
  });
  $("info").addEventListener("click", (e) => {
    let b = e.target.closest("[data-ej]");
    if (b) ejAct(b).catch((x) => note(x.message || String(x)));
  });
  /* --- Límites del plan gratuito (v11.4) ---
     Lo nuevo tiene un tope en el plan gratuito y es ilimitado con el plan Pro. */
  const LIM = { an: 3, vt: 3, cv: 3, tr: 3, vid: 2, pasos: 3, ej: 3, misEj: 5, disp: 3, espTr: 2, espVid: 2, jg: 3, esf: 1, cgSem: 1 };
  /* Con Pro no hay tope de pasos: este es solo de seguridad (la pizarra se guarda en el móvil) */
  const PASOS_MAX = 200;
  const esPro = () => plan === "pro";
  function proLimite(txt) {
    ciOpen(
      "Plan Pro",
      `<p>${txt}</p><p>Con el <b>plan Pro</b> todo es <b>ilimitado</b>: anotador del directo, ventanas de cambios, convocatorias, envíos de entrenos, vídeos de jugadas, enlace del equipo (y el esfuerzo de los jugadores), enlace del preparador físico, jugadas guardadas, pizarra limpia, jugadas con todos los pasos que quieras, ejercicios, «Mis ejercicios», dispositivos, jugadores, partidos, entrenamientos y equipos.</p>${precioProHtml()}<div class="stack">${proBtn()}${clubLinkBtn()}</div>`,
    );
    $("infoBody").scrollTop = 0;
    return false;
  }
  /* Envíos del mes (convocatorias y entrenos). Cada convocatoria o entreno distinto cuenta una vez:
     volver a mandar el mismo no gasta otro. Se guarda en el dispositivo. */
  const envKey = () => `mf_envios:${curUser || ""}:${ymd(new Date()).slice(0, 7)}`;
  function envLee() {
    try {
      let x = JSON.parse(localStorage.getItem(envKey()) || "{}");
      return x && typeof x === "object" ? x : {};
    } catch (e) {
      return {};
    }
  }
  const envUsados = (tipo) => (envLee()[tipo] || []).length;
  function envPuede(tipo, clave) {
    if (esPro()) return true;
    let x = envLee(),
      L = x[tipo] || [];
    if (L.includes(clave)) return true;
    if (L.length >= LIM[tipo])
      return proLimite(
        tipo === "an"
          ? `En el plan gratuito puedes usar el <b>anotador en ${LIM.an} partidos al mes</b> y este mes ya lo has usado. El mes que viene vuelves a tener ${LIM.an}.`
          : tipo === "cv"
          ? `En el plan gratuito puedes enviar <b>${LIM.cv} convocatorias al mes</b> y este mes ya las has usado. El mes que viene vuelves a tener ${LIM.cv}.`
          : `En el plan gratuito puedes enviar <b>${LIM.tr} entrenos al mes</b> a tus jugadores y este mes ya los has usado. El mes que viene vuelves a tener ${LIM.tr}.`,
      );
    L.push(clave);
    x[tipo] = L;
    try {
      localStorage.setItem(envKey(), JSON.stringify(x));
    } catch (e) {}
    return true;
  }
  const envQuedan = (tipo) =>
    esPro() ? "" : `<p class="muted lim-q">Plan gratuito: te quedan ${Math.max(0, LIM[tipo] - envUsados(tipo))} de ${LIM[tipo]} ${tipo === "cv" ? "convocatorias" : "envíos de entreno"} este mes. Con Pro, ilimitados.</p>`;

  /* --- Dispositivos (supabase-limites.sql) ---
     Plan gratuito: la misma cuenta en 3 dispositivos. Pro: sin límite.
     Sin el SQL puesto, la app sigue funcionando igual (no se limita). */
  function dispId() {
    let id = "";
    try {
      id = localStorage.getItem("mf_disp") || "";
    } catch (e) {}
    if (!/^[\w-]{8,64}$/.test(id)) {
      id = "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      try {
        localStorage.setItem("mf_disp", id);
      } catch (e) {}
    }
    return id;
  }
  function dispNombre() {
    let u = navigator.userAgent || "",
      tactil = navigator.maxTouchPoints > 1;
    if (/iPad/.test(u) || (/Macintosh/.test(u) && tactil)) return "iPad";
    if (/iPhone/.test(u)) return "iPhone";
    if (/Android/.test(u)) return /Mobile/.test(u) ? "Móvil Android" : "Tablet Android";
    if (/Windows/.test(u)) return "Ordenador Windows";
    if (/Macintosh/.test(u)) return "Mac";
    return "Ordenador";
  }
  let dispOk = false,
    dispBloq = false;
  /* true = puede seguir. false = ha llegado al tope y se le enseña la lista. */
  async function dispRevisa() {
    let r;
    try {
      r = await db.rpc("registrar_dispositivo", { p_id: dispId(), p_nombre: dispNombre() });
    } catch (e) {
      return true;
    }
    if (!r || r.error || !r.data || typeof r.data !== "object") return true;
    dispOk = true;
    if (r.data.ok !== false) return true;
    dispBloq = true;
    dispBloqueo(Array.isArray(r.data.lista) ? r.data.lista : []);
    return false;
  }
  const dispFila = (d, quitar) =>
    `<div class="vj-it disp-it"><div class="ci-opt"><span><b>${esc(d.nombre || "Dispositivo")}${d.id === dispId() ? " · este" : ""}</b><small>Abierta por última vez: ${esc(fmtDate(String(d.visto || "").slice(0, 10)))}</small></span></div>${d.id === dispId() ? "" : `<button type="button" class="secondary small" data-dsp="quitar" data-id="${esc(d.id)}">${quitar}</button>`}</div>`;
  function dispBloqueo(L) {
    ciOpen(
      `Ya usas la app en ${LIM.disp} dispositivos`,
      `<p>En el plan gratuito puedes usar tu cuenta en <b>${LIM.disp} dispositivos</b> (móvil, tablet u ordenador). Para entrar en este, cierra la sesión en uno de estos:</p><div class="vj-list">${L.map((d) => dispFila(d, "Cerrar la sesión allí")).join("")}</div><p>Con el <b>plan Pro</b> puedes usarla en <b>todos los dispositivos que quieras</b>.</p>${precioProHtml()}<div class="stack">${proBtn()}<button type="button" class="secondary" data-dsp="salir">Salir</button></div>`,
    );
    $("closeInfo").textContent = "Salir";
  }
  async function dispLista() {
    let r = await db.from("dispositivos").select("*");
    if (r.error) throw new Error(r.error.message);
    return (r.data || []).sort((a, b) => String(b.visto).localeCompare(String(a.visto)));
  }
  async function dispVer() {
    let L = await dispLista();
    ciOpen(
      "Mis dispositivos",
      `<p>Aquí están los dispositivos donde has abierto la app con tu cuenta.${esPro() ? " Con el plan Pro no tienes límite." : ` En el plan gratuito puedes usar <b>${LIM.disp}</b>; ahora tienes <b>${L.length} de ${LIM.disp}</b>.`}</p><div class="vj-list">${L.map((d) => dispFila(d, "Quitar")).join("") || '<p class="muted">Ninguno todavía.</p>'}</div><p class="muted">Al cerrar sesión, ese dispositivo deja libre su sitio. Los que lleven 60 días sin abrir la app se quitan solos.</p>`,
    );
  }
  $("info").addEventListener("click", (e) => {
    if (e.target.closest("[data-dsp-ver]")) dispVer().catch((x) => note(x.message));
  });
  $("info").addEventListener("click", async (e) => {
    let b = e.target.closest("[data-dsp]");
    if (!b) return;
    if (b.dataset.dsp === "salir") return doLogout();
    if (b.dataset.dsp === "quitar") {
      b.disabled = true;
      let r = await db.from("dispositivos").delete().eq("id", b.dataset.id);
      if (r.error) return note(r.error.message);
      if (dispBloq) {
        if (await dispRevisa()) {
          dispBloq = false;
          $("closeInfo").textContent = "Cerrar";
          $("info").classList.add("hidden");
          note("Listo. Ya puedes usar la app en este dispositivo.", true);
          enterApp();
        }
      } else dispVer().catch((x) => note(x.message));
    }
  });
  /* --- Enlace del equipo (v11.5, supabase-equipo.sql) ---
     Una página para los jugadores (?equipo=<código>, sin cuenta): convocatoria, próximos entrenos
     y vídeos de jugadas. Cada jugador elige su nombre y avisa «Voy» o «No puedo ir» (con motivo).
     La app del entrenador sube un resumen («datos») cada vez que cambia algo de ese equipo. */
  const ESP_TR_PRO = 30,
    ESP_VID_MB = 50,
    ESP_VID_DIAS = 30,
    /* v11.6: los jugadores anotan su esfuerzo de las sesiones de los últimos 7 días (gratis: solo la última) */
    ESF_DIAS = 7,
    ESF_PRO = 20,
    CG_SEM_PRO = 6;
  /* Cada vídeo compartido se borra solo a los 30 días (del almacén y del enlace) */
  const vidCad = (v) => {
    let d = new Date(String(v.f || "").slice(0, 10) + "T12:00:00");
    if (isNaN(d)) d = new Date();
    d.setDate(d.getDate() + ESP_VID_DIAS);
    return ymd(d);
  };
  const vidVivo = (v) => vidCad(v) > ymd(new Date());
  let espOk = false,
    espL = [],
    espR = [],
    espE = [],
    espEsfOk = false,
    espPfOk = false,
    espPub = {},
    espT = null;
  const espDe = () => espL.find((e) => e.modalidad === state.mode && (e.equipo_id || "") === (curTeam() || ""));
  const espUrl = (e) => location.origin + location.pathname + "?equipo=" + e.id;
  const pfUrl = (e) => location.origin + location.pathname + "?carga=" + e.codigo_pf;
  /* ¿Se pide el esfuerzo a los jugadores en este enlace? (por defecto, sí) */
  const espEsfOn = (e) => !!(state.cgOk && espEsfOk && e && (e.datos || {}).pideEsf !== false);
  const diasAntes = (n) => {
    let d = new Date();
    d.setDate(d.getDate() - n);
    return ymd(d);
  };
  /* Sesiones de los últimos días en las que los jugadores pueden anotar su esfuerzo.
     j = quién puede (los que vinieron / jugaron); null = todos. */
  function espEsfLista() {
    let hoy = ymd(new Date()),
      desde = diasAntes(ESF_DIAS),
      R = roster().map((p) => p.id),
      L = [];
    trainings()
      .filter((t) => t.fecha >= desde && t.fecha <= hoy)
      .forEach((t) => {
        let a = t.asistencia || {},
          vin = R.filter((id) => a[id] === "si" || a[id] === "tarde");
        L.push({ t: "entreno", ref: t.id, f: t.fecha, h: t.hora || "", n: "Entreno", j: vin.length ? vin : null });
      });
    games()
      .filter((m) => m.fecha >= desde && m.fecha <= hoy)
      .forEach((m) => {
        let E = entries(m),
          con = E.filter((x) => Number(x.minutes) > 0).map((x) => x.id);
        L.push({ t: "partido", ref: m.id, f: m.fecha, h: "", n: "Partido vs " + m.rival, j: con.length ? con : E.length ? E.map((x) => x.id) : null });
      });
    L.sort((a, b) => (b.f + (b.h || "99")).localeCompare(a.f + (a.h || "99")));
    return L.slice(0, esPro() ? ESF_PRO : LIM.esf);
  }
  /* Lo que ve el preparador físico: sesiones de las últimas semanas con lo que anota el entrenador
     (lo de los jugadores se suma en su página). Gratis: la semana actual. Pro: 6 semanas. */
  function espCgDatos() {
    let sem = esPro() ? CG_SEM_PRO : LIM.cgSem,
      d = new Date(cgLunes(ymd(new Date())) + "T12:00:00");
    d.setDate(d.getDate() - 7 * (sem - 1));
    let desde = ymd(d),
      hoy = ymd(new Date());
    let cat = catOf(state.mode, curTeam()),
      fa = {},
      lun = cgLunes(hoy);
    trainings()
      .filter((t) => t.fecha >= lun && t.fecha <= hoy)
      .forEach((t) => ejDe(t.ejercicios).forEach((x) => x.f && (fa[x.f] = (fa[x.f] || 0) + Math.round(x.t / 60))));
    return {
      sem,
      pro: esPro(),
      dd: cgDur(),
      cx: { ...cxOf(), cat: cat ? cat[0] : "" },
      fa,
      s: cgBase()
        .filter((x) => x.f >= desde && x.f <= hoy)
        .map((x) => {
          let o = { t: x.t, ref: x.ref, f: x.f, n: x.n };
          if (x.t === "entreno") o.dur = x.dur || 0;
          else o.min = x.min;
          o.rpe = x.rpe;
          return o;
        }),
    };
  }
  const espVids = (e) => (e && e.datos && Array.isArray(e.datos.videos) ? e.datos.videos : []);
  async function espCarga() {
    let r;
    try {
      r = await db.from("espacios").select("id,modalidad,equipo_id,datos,actualizado,codigo_pf");
      espPfOk = !r.error;
      /* Sin supabase-esfuerzo.sql no existe codigo_pf: el enlace sigue funcionando igual */
      if (r.error) r = await db.from("espacios").select("id,modalidad,equipo_id,datos,actualizado");
    } catch (e) {
      r = { error: e };
    }
    espOk = !r.error;
    espL = ((r && r.data) || []).map((x) => ({ ...x, datos: parseJson(x.datos, {}) }));
    await espResp();
    if (!viendo) espCaducados().catch(() => {});
  }
  async function espCaducados() {
    for (let e of espL) {
      let V = espVids(e),
        viejos = V.filter((v) => !vidVivo(v));
      if (!viejos.length) continue;
      await db.storage.from("jugadas").remove(viejos.map((v) => v.id));
      let datos = { ...e.datos, videos: V.filter(vidVivo) },
        r = await db.from("espacios").update({ datos }).eq("id", e.id);
      if (!r.error) {
        e.datos = datos;
        delete espPub[e.id];
      }
    }
  }
  /* Al entrar en Entrenos o Partidos: trae lo último que han contestado los jugadores */
  async function espRefresca() {
    let antes = JSON.stringify([espR, espE]);
    await espResp();
    let f = document.activeElement;
    if (JSON.stringify([espR, espE]) !== antes && !(f && /^(INPUT|TEXTAREA|SELECT)$/.test(f.tagName)) && $("info").classList.contains("hidden")) render();
  }
  async function espResp() {
    if (!espOk || !espL.length) return (espR = espE = []);
    try {
      let [r, f] = await Promise.all([
        db.from("espacio_respuestas").select("*"),
        db.from("espacio_esfuerzos").select("espacio_id,tipo,ref,jugador_id,rpe"),
      ]);
      if (!r.error) espR = r.data || [];
      espEsfOk = !!f && !f.error;
      if (espEsfOk) espE = f.data || [];
    } catch (e) {}
  }
  /* Esfuerzo (1-10) que han anotado los jugadores desde el enlace: {id: rpe} */
  function cgJug(tipo, ref) {
    let e = espOk && espDe(),
      o = {};
    if (e) espE.forEach((x) => x.espacio_id === e.id && x.tipo === tipo && x.ref === ref && cgRpe(x.rpe) && (o[x.jugador_id] = cgRpe(x.rpe)));
    return o;
  }
  /* Lo que contestan los jugadores de este equipo para un entreno o el partido */
  function espAvisos(tipo, ref) {
    let e = espDe();
    return e ? espR.filter((r) => r.espacio_id === e.id && r.tipo === tipo && r.ref === ref) : [];
  }
  function espDatos(e) {
    let hoy = ymd(new Date()),
      c = cvLee(),
      T = trainings()
        .filter((t) => t.fecha >= hoy)
        .slice(0, esPro() ? ESP_TR_PRO : LIM.espTr);
    return {
      v: 1,
      equipo: teamName(),
      modalidad: state.mode,
      jugadores: roster().map((p) => ({ id: p.id, n: p.nombre, d: dorsal(p) || "" })),
      partido:
        c && c.fecha && c.fecha >= hoy && (c.ids.length || c.rival)
          ? { ref: c.fecha, rival: c.rival || "", fecha: c.fecha, hora: c.hora || "", cita: c.cita || "", lugar: c.lugar || "", nota: c.nota || "", conv: cvJug(c).map((p) => p.id) }
          : null,
      entrenos: T.map((t) => {
        let ci = state.ciOk ? ciDe(t.circuito) : null;
        return {
          id: t.id,
          fecha: t.fecha,
          hora: t.hora || "",
          nota: t.nota || "",
          ej: ejDe(t.ejercicios).map((s) => ({ n: s.n, t: s.t, d: s.d || "" })),
          circ: ci ? { n: ci.nombre, s: ci.series, est: ci.est.map((x) => x.n) } : null,
        };
      }),
      videos: espVids(e),
      pideEsf: !e || !e.datos || e.datos.pideEsf !== false,
      ...(espEsfOn(e) ? { esf: espEsfLista() } : {}),
      ...(state.cgOk && e && e.codigo_pf ? { cg: espCgDatos() } : {}),
    };
  }
  /* Se llama en cada render: si algo ha cambiado, sube el resumen (como mucho cada 1,5 s) */
  function espSync(ya) {
    if (!espOk || viendo || PUB || EQ || PF || AN) return;
    let e = espDe();
    if (!e) return;
    clearTimeout(espT);
    espT = setTimeout(() => espSube(e).catch(() => {}), ya ? 0 : 1500);
  }
  async function espSube(e) {
    if (espDe() !== e) return;
    let d = espDatos(e),
      s = JSON.stringify(d);
    if (espPub[e.id] === s) return;
    let r = await db.from("espacios").update({ datos: d }).eq("id", e.id);
    if (r.error) throw new Error(r.error.message);
    espPub[e.id] = s;
    e.datos = d;
  }
  function espTextoWa(e) {
    return `🔗 *Enlace del equipo · ${teamName()}*\nAquí tenéis la convocatoria, los entrenos y las jugadas. Elegid vuestro nombre y avisad si no podéis ir:\n${espUrl(e)}`;
  }
  function espAvisosHtml(e) {
    let d = e.datos || {},
      nom = (id) => (state.players.find((p) => p.id === id) || {}).nombre || "Jugador",
      fila = (tit, tipo, ref) => {
        let L = espR.filter((r) => r.espacio_id === e.id && r.tipo === tipo && r.ref === ref),
          no = L.filter((r) => r.estado === "no"),
          si = L.filter((r) => r.estado === "voy").length;
        return `<div class="esp-av-it"><b>${esc(tit)}</b><small>✓ ${si} ${si === 1 ? "va" : "van"} · ✗ ${no.length} no ${no.length === 1 ? "puede" : "pueden"}</small>${no.map((r) => `<span class="esp-no">✗ ${esc(nom(r.jugador_id))}${r.motivo ? " · " + esc(r.motivo) : ""}</span>`).join("")}</div>`;
      },
      h = [];
    if (d.partido) h.push(fila(`Partido${d.partido.rival ? " vs " + d.partido.rival : ""} · ${fmtDate(d.partido.fecha)}`, "partido", d.partido.ref));
    (d.entrenos || []).forEach((t) => h.push(fila(`Entreno · ${fmtDate(t.fecha)}${t.hora ? " " + t.hora : ""}`, "entreno", t.id)));
    return h.length ? h.join("") : '<p class="muted">Cuando hagas una convocatoria o crees entrenos de los próximos días, aquí verás quién va y quién no puede.</p>';
  }
  async function espAbre() {
    if (!espOk)
      return ciOpen(
        "Enlace del equipo",
        "<p>El enlace del equipo se está activando en el servidor. Vuelve a probar en un rato.</p>",
      );
    let e = espDe();
    if (!e)
      return ciOpen(
        "Enlace del equipo",
        `<p>Un enlace para el grupo de WhatsApp de <b>${esc(teamName())}</b>. Los jugadores lo abren <b>sin crearse cuenta</b>, eligen su nombre y ven:</p><ul class="esp-ul"><li>📋 La <b>convocatoria</b> del próximo partido (hora, citación y lugar)</li><li>🏃 Los <b>próximos entrenos</b> con la hora y qué se va a trabajar</li><li>🎬 Los <b>vídeos de las jugadas</b>, para repasarlas antes del partido</li></ul><p>Y en cada entreno y partido pueden decir <b>«Voy»</b> o <b>«No puedo ir»</b> con el motivo. Tú lo ves aquí, en el entreno y en la convocatoria.</p>${esPro() ? "" : `<p class="muted lim-q">Plan gratuito: el próximo partido, los ${LIM.espTr} próximos entrenos y ${LIM.espVid} vídeos. Con Pro, ilimitado.</p>`}<div class="stack"><button type="button" class="primary" data-esp="crear">${ic("link", 20)}Crear el enlace del equipo</button></div>`,
      );
    await espResp();
    let V = espVids(e),
      wa = "https://wa.me/?text=" + encodeURIComponent(espTextoWa(e));
    ciOpen(
      "Enlace del equipo",
      `<p class="muted">Compártelo en el grupo de <b>${esc(teamName())}</b>. Se pone al día solo cada vez que cambias la convocatoria o los entrenos.</p><input class="esp-url" readonly value="${esc(espUrl(e))}" aria-label="Enlace del equipo"><div class="stack"><a class="primary" href="${wa}" target="_blank" rel="noopener">${ic("share", 20)}Enviar por WhatsApp</a><button type="button" class="secondary" data-esp="copiar">Copiar el enlace</button><a class="secondary" href="${esc(espUrl(e))}" target="_blank" rel="noopener">${ic("eye", 20)}Ver lo que ven los jugadores</a></div>${esPro() ? "" : `<p class="muted lim-q">Plan gratuito: los jugadores ven el próximo partido y los ${LIM.espTr} próximos entrenos, y puedes compartir ${LIM.espVid} vídeos. Con Pro, todos los entrenos y vídeos ilimitados.</p>`}<h3 class="ci-h3">Quién va y quién no puede</h3><div class="esp-av">${espAvisosHtml(e)}</div>${espEsfHtml(e)}<h3 class="ci-h3">Vídeos de jugadas para el equipo</h3><p class="muted">Sube el vídeo de una jugada (por ejemplo, la que preparas en el ordenador) y los jugadores la ven desde el enlace. Máximo ${ESP_VID_MB} MB cada uno. Se borran solos a los ${ESP_VID_DIAS} días.</p><label class="primary vj-up">${ic("plus", 20)}Subir un vídeo<input type="file" accept="video/*" data-espf hidden></label>${
        V.length
          ? `<div class="vj-list">${V.map(
              (v) =>
                `<div class="vj-it"><a class="ci-opt" href="${esc(v.url)}" target="_blank" rel="noopener">${ic("play", 20)}<span><b>${esc(v.n)}</b><small>${esc(fmtDate(v.f))} · ${vjMb(v.size || 0)} · se borra el ${esc(fmtDate(vidCad(v)))}</small></span></a><button type="button" class="ib" data-esp="quitar" data-id="${esc(v.id)}" aria-label="Quitar ${esc(v.n)}">${ic("trash", 18)}</button></div>`,
            ).join("")}</div>`
          : '<p class="muted vj-vacio">Todavía no has compartido vídeos.</p>'
      }<div class="btools esp-fin"><button type="button" class="danger small" data-esp="borrar">Desactivar el enlace</button></div>`,
    );
    $("infoBody").scrollTop = 0;
  }
  /* v11.6: esfuerzo que anotan los jugadores y enlace para el preparador físico */
  function espEsfHtml(e) {
    if (!state.cgOk) return "";
    let h = `<h3 class="ci-h3">💪 Esfuerzo y carga física</h3>`;
    if (!espEsfOk) return h + '<p class="muted">Esto se está activando en el servidor. Vuelve a probar en un rato.</p>';
    let on = espEsfOn(e),
      L = on ? espEsfLista() : [],
      nom = (id) => (state.players.find((p) => p.id === id) || {}).nombre || "Jugador";
    h += `<label class="chk esp-esf"><input type="checkbox" data-esp="esf"${on ? " checked" : ""}><span>Pedir a los jugadores su <b>esfuerzo (del 1 al 10)</b> después de cada entreno y partido</span></label>`;
    if (on) {
      h += `<p class="muted">Al terminar, en el enlace les sale «¿Cuánto te ha costado?». Se suma solo a tu <b>Carga física</b> (en Entrenos) con un 📱. Si tú apuntas otro número, vale el tuyo.</p>`;
      h += L.length
        ? `<div class="esp-av">${L.map((x) => {
            let J = cgJug(x.t, x.ref),
              ids = Object.keys(J),
              tot = x.j ? x.j.length : roster().length;
            return `<div class="esp-av-it"><b>${esc(x.n)} · ${esc(fmtDate(x.f))}</b><small>📱 ${ids.length} de ${tot} han anotado su esfuerzo</small>${ids.length ? `<span class="esp-esf-l">${ids.map((id) => `<i style="--c:${cgCol(J[id])}">${esc(nom(id))} ${J[id]}</i>`).join("")}</span>` : ""}</div>`;
          }).join("")}</div>`
        : '<p class="muted">Cuando haya un entreno o un partido de los últimos días, les saldrá para anotar.</p>';
      if (!esPro()) h += `<p class="muted lim-q">Plan gratuito: anotan solo la <b>última sesión</b>. Con Pro, todas las de los últimos ${ESF_DIAS} días.</p>`;
    }
    if (!espPfOk) return h;
    h += `<h3 class="ci-h3">Enlace para el preparador físico</h3>`;
    if (!e.codigo_pf)
      return (
        h +
        `<p class="muted">Un enlace aparte, <b>solo para mirar</b>: el preparador físico ve la carga de cada jugador (esfuerzo × minutos) y el esfuerzo de cada sesión, sin cuenta y sin poder cambiar nada. Los jugadores no lo ven.</p>${esPro() ? "" : `<p class="muted lim-q">Plan gratuito: ve la semana actual. Con Pro, las últimas ${CG_SEM_PRO} semanas con el gráfico y los avisos de sobrecarga.</p>`}<div class="stack"><button type="button" class="secondary" data-esp="pf-crear">${ic("link", 20)}Crear enlace para el preparador físico</button></div>`
      );
    let wa = "https://wa.me/?text=" + encodeURIComponent(`💪 *Carga física · ${teamName()}*\nAquí ves el esfuerzo y la carga de cada jugador:\n${pfUrl(e)}`);
    return (
      h +
      `<input class="esp-url" readonly value="${esc(pfUrl(e))}" aria-label="Enlace del preparador físico"><div class="stack"><a class="secondary" href="${wa}" target="_blank" rel="noopener">${ic("share", 20)}Enviar al preparador por WhatsApp</a><button type="button" class="secondary" data-esp="pf-copiar">Copiar el enlace del preparador</button><a class="secondary" href="${esc(pfUrl(e))}" target="_blank" rel="noopener">${ic("eye", 20)}Ver lo que ve el preparador</a><button type="button" class="danger small" data-esp="pf-quitar">Quitar el enlace del preparador</button></div>${esPro() ? "" : `<p class="muted lim-q">Plan gratuito: el preparador ve la semana actual. Con Pro, las últimas ${CG_SEM_PRO} semanas con el gráfico y los avisos de sobrecarga.</p>`}`
    );
  }
  function espVidTotal() {
    return espL.reduce((n, e) => n + espVids(e).length, 0);
  }
  async function espSubeVideo(f, nombre) {
    let e = espDe();
    if (!e) return espAbre();
    if (!f) return;
    if (!/^video\//.test(f.type || "video/")) return note("Eso no parece un vídeo.");
    if (!esPro() && espVidTotal() >= LIM.espVid)
      return proLimite(`En el plan gratuito puedes compartir <b>${LIM.espVid} vídeos de jugadas</b> con tus equipos. Quita alguno para subir otro.`);
    if (f.size > ESP_VID_MB * 1048576)
      return note(`El vídeo pesa más de ${ESP_VID_MB} MB. Recórtalo o grábalo con menos calidad y vuelve a subirlo.`);
    let n = nombre;
    if (!n) {
      let def = String(f.name || "").replace(/\.[a-z0-9]+$/i, "").slice(0, 60);
      if (!def || /^(img|vid|mov|trim|video|pxl)[_-]?\d/i.test(def)) def = "Jugada " + fmtDate(ymd(new Date()));
      n = prompt("Ponle un nombre a la jugada:", def);
      if (n === null) return;
      n = n.trim().slice(0, 60) || def;
    }
    note("Subiendo el vídeo… no cierres la app hasta que termine.", true);
    let t = f.type || "video/mp4",
      ext = /quicktime/.test(t) ? "mov" : /webm/.test(t) ? "webm" : "mp4",
      path = `${curUser}/${e.id}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.${ext}`,
      r = await db.storage.from("jugadas").upload(path, f, { contentType: t, upsert: false });
    if (r.error)
      return note(
        /row-level|policy|403|Unauthorized/i.test(r.error.message || "")
          ? "Has llegado al límite de vídeos compartidos de tu plan."
          : /size|large|413/i.test(r.error.message || "")
            ? `El vídeo pesa más de ${ESP_VID_MB} MB.`
            : "No se pudo subir el vídeo: " + r.error.message,
      );
    let url = db.storage.from("jugadas").getPublicUrl(path).data.publicUrl;
    e.datos = { ...(e.datos || {}), videos: [{ id: path, n, url, f: ymd(new Date()), size: f.size }, ...espVids(e)] };
    delete espPub[e.id];
    await espSube(e);
    note("Vídeo compartido con el equipo.", true);
    espAbre();
  }
  async function espAct(b) {
    let k = b.dataset.esp,
      e = espDe();
    if (k === "abrir") return espAbre();
    if (k === "crear") {
      if (viendo) return note(SOLO_VER);
      b.disabled = true;
      let r = await db.from("espacios").insert({ modalidad: state.mode, equipo_id: curTeam() || "" }).select("id,modalidad,equipo_id,datos,actualizado");
      b.disabled = false;
      if (r.error) return note(r.error.message);
      espL.push({ ...r.data[0], datos: {} });
      await espResp();
      await espSube(espDe());
      espAbre();
      return note("Enlace creado. Compártelo en el grupo del equipo.", true);
    }
    if (!e) return;
    if (k === "copiar") return copiaTexto(espTextoWa(e), "Enlace copiado. Pégalo en el grupo del equipo.");
    if (k === "esf") {
      if (viendo) return note(SOLO_VER);
      e.datos = { ...(e.datos || {}), pideEsf: !!b.checked };
      delete espPub[e.id];
      await espSube(e);
      let y = $("infoBody").scrollTop;
      espAbre().then(() => ($("infoBody").scrollTop = y));
      return note(b.checked ? "Listo: los jugadores podrán anotar su esfuerzo en el enlace." : "Ya no se pide el esfuerzo en el enlace.", true);
    }
    if (k === "pf-crear" || k === "pf-quitar") {
      if (viendo) return note(SOLO_VER);
      if (k === "pf-quitar" && !confirm("¿Quitar el enlace del preparador físico? Ese enlace dejará de funcionar.")) return;
      let cod = k === "pf-crear" ? crypto.randomUUID() : null;
      b.disabled = true;
      let r = await db.from("espacios").update({ codigo_pf: cod }).eq("id", e.id);
      b.disabled = false;
      if (r.error) return note(r.error.message);
      e.codigo_pf = cod;
      delete espPub[e.id];
      await espSube(e);
      let y = $("infoBody").scrollTop;
      await espAbre();
      $("infoBody").scrollTop = y;
      return note(cod ? "Enlace del preparador creado. Mándaselo por WhatsApp." : "Enlace del preparador quitado.", true);
    }
    if (k === "pf-copiar") return copiaTexto(pfUrl(e), "Enlace del preparador copiado.");
    if (k === "quitar") {
      let v = espVids(e).find((x) => x.id === b.dataset.id);
      if (!v || !confirm(`¿Quitar «${v.n}» del enlace del equipo?`)) return;
      await db.storage.from("jugadas").remove([v.id]);
      e.datos = { ...e.datos, videos: espVids(e).filter((x) => x.id !== v.id) };
      await espSube(e);
      return espAbre();
    }
    if (k === "borrar") {
      if (!confirm("¿Desactivar el enlace del equipo? Los jugadores ya no podrán abrirlo y se borran sus avisos y los vídeos compartidos.")) return;
      let V = espVids(e).map((x) => x.id);
      if (V.length) await db.storage.from("jugadas").remove(V);
      let r = await db.from("espacios").delete().eq("id", e.id);
      if (r.error) return note(r.error.message);
      espL = espL.filter((x) => x !== e);
      $("info").classList.add("hidden");
      render();
      return note("Enlace desactivado.", true);
    }
  }
  $("info").addEventListener("click", (e) => {
    let b = e.target.closest("[data-esp]");
    if (b) espAct(b).catch((x) => note(x.message || String(x)));
  });
  document.addEventListener("click", (e) => {
    let b = e.target.closest("#teams [data-esp], #view [data-esp]");
    if (b) espAct(b).catch((x) => note(x.message || String(x)));
  });
  $("info").addEventListener("change", (e) => {
    if (!e.target.matches("[data-espf]")) return;
    let f = e.target.files && e.target.files[0];
    e.target.value = "";
    espSubeVideo(f).catch((x) => note(x.message || String(x)));
  });
  /* Etiqueta junto al jugador: lo que ha contestado desde el enlace */
  function espTag(tipo, ref, pid) {
    let r = espAvisos(tipo, ref).find((x) => x.jugador_id === pid);
    if (!r) return "";
    return r.estado === "no"
      ? `<small class="esp-no">Avisó: no puede${r.motivo ? " · " + esc(r.motivo) : ""}</small>`
      : '<small class="esp-si">Dijo que va</small>';
  }
  function espResumen(tipo, ref) {
    let L = espAvisos(tipo, ref);
    if (!L.length) return "";
    let no = L.filter((r) => r.estado === "no").length;
    return `<p class="muted esp-res">Desde el enlace del equipo: <b class="w">${L.length - no}</b> ${L.length - no === 1 ? "va" : "van"} · <b class="l">${no}</b> no ${no === 1 ? "puede" : "pueden"}</p>`;
  }

  /* --- Mis jugadas (v11.5): la pizarra guardada con nombre, en la cuenta (móvil y ordenador) --- */
  let jgOk = false,
    jgL = [];
  async function jgCarga() {
    try {
      let r = await db.from("jugadas_guardadas").select("id,modalidad,nombre,datos,creado").order("creado", { ascending: false });
      jgOk = !r.error;
      jgL = ((r && r.data) || []).map((x) => ({ ...x, datos: parseJson(x.datos, {}) }));
    } catch (e) {
      jgOk = false;
    }
  }
  const jgMode = () => jgL.filter((x) => x.modalidad === state.mode);
  let jgFil = "";
  function jgAbre() {
    if (!jgOk) return ciOpen("Mis jugadas", "<p>Guardar jugadas se está activando en el servidor. Vuelve a probar en un rato.</p>");
    let T = jgMode(),
      hayF = T.some((j) => FASE[j.datos.f]);
    if (!hayF) jgFil = "";
    let L = T.filter((j) => !jgFil || j.datos.f === jgFil);
    ciOpen(
      "Mis jugadas",
      `<p class="muted">Guarda con un nombre la jugada que tienes en la pizarra y vuelve a abrirla cuando quieras, también desde el ordenador o la tablet entrando con tu cuenta.</p>${esPro() ? "" : `<p class="muted lim-q">Plan gratuito: ${jgL.length} de ${LIM.jg} jugadas guardadas. Con Pro, ilimitadas.</p>`}${faseChips(bd().f || "", "jgfa")}<div class="stack"><button type="button" class="primary" data-jg="guardar">${ic("download", 20)}Guardar la jugada de la pizarra</button></div>${
        hayF
          ? `<div class="est-chips fa-fil" role="group" aria-label="Ver por fase"><button type="button" class="est-chip" data-jg="filtro" data-f="" aria-pressed="${!jgFil}">Todas</button>${FASES.filter((x) => T.some((j) => j.datos.f === x[0]))
              .map((x) => `<button type="button" class="est-chip" data-jg="filtro" data-f="${x[0]}" aria-pressed="${jgFil === x[0]}">${esc(x[2])}</button>`)
              .join("")}</div>`
          : ""
      }${
        L.length
          ? `<div class="vj-list">${L.map(
              (j) =>
                `<div class="vj-it"><button type="button" class="ci-opt" data-jg="abrir" data-id="${esc(j.id)}">${ic("play", 20)}<span><b>${esc(j.nombre)}</b><small>${Math.max(1, parseInt(j.datos.steps) || 1)} ${(parseInt(j.datos.steps) || 1) === 1 ? "paso" : "pasos"} · ${esc(fmtDate(String(j.creado || "").slice(0, 10)))}${FASE[j.datos.f] ? " " + faseTag(j.datos.f) : ""}</small></span></button><button type="button" class="ib" data-jg="borrar" data-id="${esc(j.id)}" aria-label="Borrar ${esc(j.nombre)}">${ic("trash", 18)}</button></div>`,
            ).join("")}</div>`
          : `<p class="muted vj-vacio">${jgFil ? "No tienes jugadas de esta fase." : `Todavía no tienes jugadas guardadas en ${esc(MN())}.`}</p>`
      }`,
    );
    $("infoBody").scrollTop = 0;
  }
  async function jgGuarda() {
    if (viendo) return note(SOLO_VER);
    if (!jgOk) return jgAbre();
    let b = bd();
    if (!b.strokes.length && !b.items.length) return note("La pizarra está vacía: pon jugadores o dibuja la jugada y luego guárdala.");
    let e = b.est ? estDe(b.est) : null,
      def = (e && e.n) || "Jugada " + fmtDate(ymd(new Date())),
      n = prompt("Nombre de la jugada:", def);
    if (n === null) return;
    n = n.trim().slice(0, 60) || def;
    let datos = { strokes: b.strokes, items: b.items, steps: b.steps, tcol: b.tcol, bg: b.bg || "", clean: !!b.clean, est: b.est || "", f: FASE[b.f] ? b.f : e ? estFase(e) : "" },
      ya = jgMode().find((x) => x.nombre.toLowerCase() === n.toLowerCase());
    if (ya) {
      if (!confirm(`Ya tienes una jugada llamada «${ya.nombre}». ¿Cambiarla por la de ahora?`)) return;
      let r = await db.from("jugadas_guardadas").update({ datos }).eq("id", ya.id);
      if (r.error) return note(r.error.message);
      ya.datos = datos;
    } else {
      if (!esPro() && jgL.length >= LIM.jg)
        return proLimite(`En el plan gratuito puedes guardar <b>${LIM.jg} jugadas</b>. Borra alguna para guardar otra.`);
      let row = { id: crypto.randomUUID(), modalidad: state.mode, nombre: n, datos },
        r = await db.from("jugadas_guardadas").insert(row);
      if (r.error) return note(/plan gratuito/.test(r.error.message) ? r.error.message : "No se pudo guardar: " + r.error.message);
      jgL.unshift({ ...row, creado: new Date().toISOString() });
    }
    note(`Jugada «${n}» guardada en «Mis jugadas».`, true);
    if (!$("info").classList.contains("hidden") && $("infoTitle").textContent === "Mis jugadas") jgAbre();
  }
  function jgCargaEnPizarra(j) {
    let b = bd(),
      d = j.datos || {};
    if ((b.strokes.length || b.items.length) && !confirm("Se cambia lo que tienes en la pizarra por esta jugada. Si te arrepientes, pulsa «Deshacer». ¿Seguir?")) return;
    stopAnim();
    pushHist(b);
    let n = Math.min(PASOS_MAX, Math.max(1, parseInt(d.steps) || 1));
    b.strokes = Array.isArray(d.strokes) ? d.strokes.filter((s) => s && Array.isArray(s.p)) : [];
    b.items = cleanItems(d.items, n);
    b.steps = n;
    b.step = 0;
    b.tcol = d.tcol && typeof d.tcol === "object" ? d.tcol : {};
    b.bg = d.bg || "";
    b.clean = !!d.clean;
    b.est = typeof d.est === "string" && estDe(d.est) ? d.est : "";
    b.f = FASE[d.f] ? d.f : "";
    b.tool = "move";
    state.boardPick = null;
    saveBoard();
    $("info").classList.add("hidden");
    render();
    note(`Jugada «${j.nombre}» en la pizarra.`, true);
  }
  $("info").addEventListener("click", async (e) => {
    let b = e.target.closest("[data-jg]");
    if (!b) return;
    let k = b.dataset.jg,
      j = jgL.find((x) => x.id === b.dataset.id);
    try {
      if (k === "guardar") return await jgGuarda();
      if (k === "fase") {
        let bb = bd();
        bb.f = bb.f === b.dataset.f ? "" : b.dataset.f;
        saveBoard();
        return jgAbre();
      }
      if (k === "filtro") {
        jgFil = b.dataset.f || "";
        return jgAbre();
      }
      if (k === "abrir" && j) return jgCargaEnPizarra(j);
      if (k === "borrar" && j) {
        if (!confirm(`¿Borrar la jugada «${j.nombre}»?`)) return;
        let r = await db.from("jugadas_guardadas").delete().eq("id", j.id);
        if (r.error) return note(r.error.message);
        jgL = jgL.filter((x) => x !== j);
        jgAbre();
      }
    } catch (x) {
      note(x.message || String(x));
    }
  });

  /* --- Convocatoria (v11.3) ---
     Antes del partido: eliges a los convocados, rival, lugar, día, hora y citación, y la app
     escribe el mensaje para el grupo de WhatsApp. Se guarda en este dispositivo (una por equipo),
     sin servidor. «Crear el partido» abre el partido nuevo con esos convocados ya marcados. */
  const cvKey = () => `mf_conv:${curUser || ""}:${state.mode}:${curTeam() || ""}`;
  let cv = null;
  function cvLee() {
    try {
      let x = JSON.parse(localStorage.getItem(cvKey()) || "null");
      if (x && typeof x === "object") return { ...cvNuevo(), ...x, ids: Array.isArray(x.ids) ? x.ids : [] };
    } catch (e) {}
    return null;
  }
  function cvNuevo() {
    return { rival: "", fecha: ymd(new Date()), hora: "", cita: "", lugar: "", nota: "", ids: [] };
  }
  function cvGuarda() {
    if (!cv) return;
    try {
      localStorage.setItem(cvKey(), JSON.stringify(cv));
    } catch (e) {}
    espSync();
  }
  function cvBorra() {
    try {
      localStorage.removeItem(cvKey());
    } catch (e) {}
  }
  /* Sólo los jugadores que siguen en la plantilla, en el orden de la plantilla */
  const cvJug = (c) => roster().filter((p) => c.ids.includes(p.id));
  function cvTexto(c) {
    let J = cvJug(c),
      L = [`⚽ *CONVOCATORIA* · ${teamName()}`];
    if (c.rival) L.push(`🆚 Rival: ${c.rival}`);
    if (c.fecha) L.push(`📅 ${trDayLabel(c.fecha).replace(/^./, (x) => x.toUpperCase())}`);
    if (c.hora || c.cita)
      L.push(`⏰ ${[c.hora ? "Partido: " + c.hora : "", c.cita ? "Citación: " + c.cita : ""].filter(Boolean).join(" · ")}`);
    if (c.lugar) L.push(`📍 ${c.lugar}`);
    L.push("", `👥 *Convocados (${J.length}):*`);
    J.forEach((p, i) => L.push(`${i + 1}. ${p.nombre}${dorsal(p) ? " (" + dorsal(p) + ")" : ""}`));
    if (c.nota) L.push("", `📝 ${c.nota}`);
    return L.join("\n");
  }
  function cvResumen(c) {
    return [c.rival ? "vs " + c.rival : "", c.fecha ? fmtDate(c.fecha) : "", c.cita ? "citación " + c.cita : c.hora ? c.hora : ""]
      .filter(Boolean)
      .join(" · ");
  }
  /* Tarjeta en Partidos con la convocatoria guardada */
  function cvCard() {
    let c = cvLee();
    if (viendo || !c || (!c.ids.length && !c.rival)) return "";
    return `<div class="cv-card"><div class="info"><div class="kicker">Convocatoria</div><strong>${esc(cvResumen(c) || "Sin datos")}</strong><small>${cvJug(c).length} convocados${c.lugar ? " · " + esc(c.lugar) : ""}${(() => {
      let L = espAvisos("partido", c.fecha),
        no = L.filter((r) => r.estado === "no").length;
      return L.length ? ` · ✓ ${L.length - no} ${L.length - no === 1 ? "va" : "van"} · ✗ ${no} no ${no === 1 ? "puede" : "pueden"}` : "";
    })()}</small></div><div class="btools"><button type="button" class="primary small" data-cv="abrir">${ic("users", 18)}Ver y enviar</button></div></div>`;
  }
  function cvAbre(desde) {
    cv = cvLee() || cvNuevo();
    delete cv.deDraft;
    if (desde) {
      cv = { ...cv, ...desde };
      cvGuarda();
    }
    ciOpen("Convocatoria", cvHtml());
    $("infoBody").scrollTop = 0;
  }
  function cvHtml() {
    let r = roster(),
      cap = MODES[state.mode].cap,
      J = cvJug(cv),
      f = (k, lab, ty, ph, ml) =>
        `<label class="ci-l">${lab}<input data-cvf="${k}" type="${ty}"${ph ? ` placeholder="${ph}"` : ""}${ml ? ` maxlength="${ml}"` : ""} value="${esc(cv[k] || "")}" autocomplete="off"></label>`;
    return `<p class="muted">${cv.deDraft ? "Los convocados salen del partido. Si cambias alguno aquí, cambia solo en el mensaje: en el partido se marcan en la lista «Conv.»." : "Elige a los convocados y los datos del partido. La app te escribe el mensaje para el grupo de WhatsApp."}</p><div class="cv-grid">${f("rival", "Rival", "text", "Ej.: CD Alhambra", 100)}${f("lugar", "Lugar", "text", "Ej.: Pabellón Municipal", 120)}${f("fecha", "Día", "date")}${f("hora", "Hora del partido", "time")}${f("cita", "Hora de citación", "time")}</div><label class="ci-l">Nota (opcional)<input data-cvf="nota" maxlength="200" placeholder="Ej.: equipación azul, traed la ficha" value="${esc(cv.nota || "")}" autocomplete="off"></label><div class="cv-h"><h3 class="ci-h3">Convocados <b data-cvn>${J.length}</b>${cap ? ` <small class="muted">(máx. ${cap})</small>` : ""}</h3><span><button type="button" class="secondary small" data-cv="todos">Todos</button><button type="button" class="secondary small" data-cv="ninguno">Ninguno</button></span></div>${
      r.length
        ? `<div class="cv-list">${r
            .map(
              (p) =>
                `<label class="cv-j"><input type="checkbox" data-cvp="${p.id}"${cv.ids.includes(p.id) ? " checked" : ""}>${avatar(p)}<span>${dorsal(p) ? `<i class="bdn">${dorsal(p)}</i>` : ""}${esc(p.nombre)}${espTag("partido", cv.fecha, p.id)}</span></label>`,
            )
            .join("")}</div>`
        : '<p class="muted">Añade primero a tus jugadores en Plantilla.</p>'
    }<h3 class="ci-h3">Mensaje</h3>${envQuedan("cv")}<pre class="cv-txt" data-cvt>${esc(cvTexto(cv))}</pre><div class="stack"><a class="primary" data-cv="wa" href="${cvWa()}" target="_blank" rel="noopener">${ic("share", 20)}Enviar por WhatsApp</a>${navigator.share ? `<button type="button" class="secondary" data-cv="share">Compartir…</button>` : ""}<button type="button" class="secondary" data-cv="copiar">Copiar el mensaje</button>${cv.deDraft ? "" : `<button type="button" class="secondary" data-cv="partido">${ic("plus", 20)}Crear el partido con estos convocados</button><button type="button" class="danger" data-cv="borrar">Empezar una convocatoria nueva</button>`}</div>`;
  }
  const cvWa = () => "https://wa.me/?text=" + encodeURIComponent(cvTexto(cv));
  /* Repinta sólo el contador y el mensaje: así no se pierde lo que se está escribiendo */
  function cvRefresca() {
    let box = $("infoBody"),
      t = box.querySelector("[data-cvt]"),
      n = box.querySelector("[data-cvn]"),
      a = box.querySelector("[data-cv=wa]");
    if (t) t.textContent = cvTexto(cv);
    if (n) n.textContent = cvJug(cv).length;
    if (a) a.href = cvWa();
    if (cv.deDraft && state.draft) state.draft.alineacion.conv = { hora: cv.hora, cita: cv.cita, lugar: cv.lugar };
    cvGuarda();
  }
  async function cvAct(b) {
    let k = b.dataset.cv;
    if (k === "abrir") return cvAbre();
    if (k === "desde") {
      /* Desde «Editar / Nuevo partido»: la convocatoria se rellena con lo que hay en el partido */
      let d = state.draft;
      if (!d) return;
      if ($("date")) d.fecha = $("date").value;
      if ($("rival")) d.rival = $("rival").value.trim();
      let c = d.alineacion.conv || {},
        x = { rival: d.rival, fecha: d.fecha, ids: d.players.map((p) => p.id), deDraft: 1 };
      ["hora", "cita", "lugar"].forEach((q) => c[q] && (x[q] = c[q]));
      return cvAbre(x);
    }
    if (!cv) return;
    let cap = MODES[state.mode].cap;
    if (k === "todos") {
      cv.ids = roster().map((p) => p.id);
      if (cap && cv.ids.length > cap) {
        cv.ids = cv.ids.slice(0, cap);
        note(`Máximo ${cap} convocados en ${MN().toLowerCase()}. He marcado los ${cap} primeros.`);
      }
      $("infoBody").querySelectorAll("[data-cvp]").forEach((x) => (x.checked = cv.ids.includes(x.dataset.cvp)));
      return cvRefresca();
    }
    if (k === "ninguno") {
      cv.ids = [];
      $("infoBody").querySelectorAll("[data-cvp]").forEach((x) => (x.checked = false));
      return cvRefresca();
    }
    if (k === "wa") {
      if (!cvJug(cv).length) note("Aún no has marcado a ningún convocado.");
      return;
    }
    if ((k === "share" || k === "copiar") && !envPuede("cv", cvClave())) return;
    if (k === "share") {
      try {
        await navigator.share({ text: cvTexto(cv) });
      } catch (e) {}
      return;
    }
    if (k === "copiar") return copiaTexto(cvTexto(cv), "Mensaje copiado. Pégalo en el grupo de WhatsApp.");
    if (k === "borrar") {
      if (!confirm("¿Empezar una convocatoria nueva? Se borra la que tienes ahora.")) return;
      cvBorra();
      cv = cvNuevo();
      $("infoBody").innerHTML = cvHtml();
      render();
      return;
    }
    if (k === "partido") {
      if (viendo) return note(SOLO_VER);
      if (!cv.rival.trim() || !cv.fecha) return note("Pon el rival y el día para crear el partido.");
      $("info").classList.add("hidden");
      if (full("m")) return showInfo("pro");
      state.tab = "partidos";
      state.editing = null;
      resetDraft();
      let d = state.draft;
      d.fecha = cv.fecha;
      d.rival = cv.rival.trim();
      d.players = cvJug(cv).map((p) => ({ id: p.id, nombre: p.nombre, minutes: 0, goals: 0, starter: false }));
      d.alineacion.conv = { hora: cv.hora, cita: cv.cita, lugar: cv.lugar };
      render();
      note("Partido creado con los convocados. Elige los titulares y guárdalo.", true);
    }
  }
  const cvClave = () => `${cv.fecha}|${String(cv.rival || "").trim().toLowerCase()}`;
  $("info").addEventListener("click", (e) => {
    let b = e.target.closest("[data-cv]");
    if (b && b.dataset.cv === "wa" && cv && !envPuede("cv", cvClave())) {
      e.preventDefault();
      return;
    }
    if (b) cvAct(b).catch((x) => note(x.message || String(x)));
  });
  $("view").addEventListener("click", (e) => {
    let b = e.target.closest("[data-cv]");
    if (b) cvAct(b).catch((x) => note(x.message || String(x)));
  });
  $("info").addEventListener("input", (e) => {
    let k = e.target.dataset.cvf;
    if (!k || !cv) return;
    cv[k] = e.target.value;
    cvRefresca();
  });
  $("info").addEventListener("change", (e) => {
    let id = e.target.dataset.cvp;
    if (!id || !cv) return;
    let cap = MODES[state.mode].cap;
    if (e.target.checked) {
      if (cap && cvJug(cv).length >= cap) {
        e.target.checked = false;
        return note(`Máximo ${cap} convocados en ${MN().toLowerCase()}.`);
      }
      if (!cv.ids.includes(id)) cv.ids.push(id);
    } else cv.ids = cv.ids.filter((x) => x !== id);
    cvRefresca();
  });
  /* --- Vídeos de jugadas (v11.3) ---
     El entrenador sube desde el móvil el vídeo de una jugada (de un partido, de YouTube grabado,
     de otro equipo…) y lo tiene junto a la pizarra para enseñarlo a pantalla completa.
     Se guardan SOLO en este dispositivo (IndexedDB «mf_videos»), sin servidor: no cuestan nada. */
  const VJ_MAX = 500 * 1024 * 1024;
  let vjDbP = null,
    vjUrl = "",
    vjVer = null;
  function vjDb() {
    if (vjDbP) return vjDbP;
    vjDbP = new Promise((ok, ko) => {
      if (!window.indexedDB) return ko(new Error("Este navegador no deja guardar vídeos."));
      let r = indexedDB.open("mf_videos", 1);
      r.onupgradeneeded = () => {
        let s = r.result.createObjectStore("v", { keyPath: "id" });
        s.createIndex("mode", "mode");
      };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ko(r.error || new Error("No se pudo abrir el almacén de vídeos."));
    });
    vjDbP.catch(() => (vjDbP = null));
    return vjDbP;
  }
  function vjTx(modo, fn) {
    return vjDb().then(
      (db) =>
        new Promise((ok, ko) => {
          let tx = db.transaction("v", modo),
            st = tx.objectStore("v"),
            res;
          let r = fn(st);
          if (r) r.onsuccess = () => (res = r.result);
          tx.oncomplete = () => ok(res);
          tx.onerror = tx.onabort = () => ko(tx.error || new Error("No se pudo guardar el vídeo (¿falta espacio en el móvil?)."));
        }),
    );
  }
  const vjDue = () => `${curUser || ""}:${state.mode}`;
  async function vjLista() {
    let L = (await vjTx("readonly", (st) => st.index("mode").getAll(vjDue()))) || [];
    return L.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  }
  const vjMb = (n) => (n >= 1048576 ? (n / 1048576).toFixed(n >= 104857600 ? 0 : 1).replace(".", ",") + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
  function vjSuelta() {
    if (vjUrl) URL.revokeObjectURL(vjUrl);
    vjUrl = "";
    vjVer = null;
  }
  async function vjAbre() {
    vjSuelta();
    let L;
    try {
      L = await vjLista();
    } catch (e) {
      return ciOpen("Vídeos de jugadas", `<p>${esc(e.message || String(e))}</p>`);
    }
    ciOpen(
      "Vídeos de jugadas",
      `<p class="muted">Sube desde el móvil el vídeo de una jugada y enséñalo a pantalla completa cuando quieras. Se guardan <b>solo en este dispositivo</b>${MODES[state.mode] ? " (en " + esc(MN()) + ")" : ""}.</p>${esPro() ? "" : `<p class="muted lim-q">Plan gratuito: ${L.length} de ${LIM.vid} vídeos. Con Pro, ilimitados.</p>`}<label class="primary vj-up">${ic("plus", 20)}Subir un vídeo<input type="file" accept="video/*" data-vjf hidden></label>${
        L.length
          ? `<div class="vj-list">${L.map(
              (v) =>
                `<div class="vj-it"><button type="button" class="ci-opt" data-vj="ver" data-id="${esc(v.id)}">${ic("play", 20)}<span><b>${esc(v.nombre)}</b><small>${esc(fmtDate(String(v.fecha).slice(0, 10)))} · ${vjMb(v.size || 0)}</small></span></button><button type="button" class="ib" data-vj="borrar" data-id="${esc(v.id)}" aria-label="Borrar ${esc(v.nombre)}">${ic("trash", 18)}</button></div>`,
            ).join("")}</div>`
          : `<p class="muted vj-vacio">Todavía no tienes vídeos de jugadas.</p>`
      }`,
    );
  }
  async function vjVerUno(id) {
    let v = await vjTx("readonly", (st) => st.get(id));
    if (!v) return vjAbre();
    vjSuelta();
    vjVer = v;
    vjUrl = URL.createObjectURL(v.blob);
    ciOpen(
      v.nombre,
      `<video class="vj-video" src="${vjUrl}" controls playsinline autoplay></video><div class="stack"><button type="button" class="primary" data-vj="full">${ic("maximize", 20)}Pantalla completa</button><button type="button" class="secondary" data-vj="share">${ic("share", 20)}Compartir o guardar</button>${viendo ? "" : `<button type="button" class="secondary" data-vj="eq">${ic("link", 20)}Compartir con el equipo</button>`}<button type="button" class="secondary" data-vj="lista">${ic("back", 20)}Volver a mis vídeos</button></div>`,
    );
  }
  async function vjSube(f) {
    if (!f) return;
    if (!/^video\//.test(f.type || "video/")) return note("Eso no parece un vídeo.");
    if (!esPro() && (await vjLista()).length >= LIM.vid)
      return proLimite(`En el plan gratuito puedes guardar <b>${LIM.vid} vídeos de jugadas</b> en cada modalidad. Borra alguno para subir otro.`);
    if (f.size > VJ_MAX) return note("El vídeo es muy grande (más de 500 MB). Recórtalo en el móvil y vuelve a subirlo.");
    let def = String(f.name || "").replace(/\.[a-z0-9]+$/i, "").slice(0, 60);
    if (!def || /^(img|vid|mov|trim|video|pxl)[_-]?\d/i.test(def)) def = "Jugada " + fmtDate(ymd(new Date()));
    let n = prompt("Ponle un nombre a la jugada:", def);
    if (n === null) return;
    n = n.trim().slice(0, 60) || def;
    note("Guardando el vídeo…", true);
    let v = { id: "v" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), mode: vjDue(), nombre: n, fecha: new Date().toISOString(), size: f.size, type: f.type || "video/mp4", blob: f };
    await vjTx("readwrite", (st) => st.put(v));
    note("Vídeo guardado en este dispositivo.", true);
    vjAbre();
  }
  async function vjAct(b) {
    let k = b.dataset.vj,
      id = b.dataset.id;
    if (k === "ver") return vjVerUno(id);
    if (k === "lista") return vjAbre();
    if (k === "borrar") {
      if (!confirm("¿Borrar este vídeo de este dispositivo?")) return;
      await vjTx("readwrite", (st) => st.delete(id));
      note("Vídeo borrado.", true);
      return vjAbre();
    }
    let vd = $("infoBody").querySelector(".vj-video");
    if (k === "full" && vd) {
      let fn = vd.requestFullscreen || vd.webkitRequestFullscreen || vd.webkitEnterFullscreen;
      if (fn)
        try {
          await fn.call(vd);
        } catch (e) {}
      try {
        await vd.play();
      } catch (e) {}
      return;
    }
    if (k === "eq" && vjVer) return espSubeVideo(vjVer.blob, vjVer.nombre);
    if (k === "share" && vjVer) {
      let ext = /webm/.test(vjVer.type) ? "webm" : /quicktime/.test(vjVer.type) ? "mov" : "mp4",
        nom = vjVer.nombre.replace(/[^\wáéíóúñü -]+/gi, "").trim().replace(/\s+/g, "-").toLowerCase() || "jugada";
      return shareOrSave(new Blob([vjVer.blob], { type: vjVer.type }), `${nom}.${ext}`, vjVer.nombre, "Vídeo descargado.");
    }
  }
  $("info").addEventListener("click", (e) => {
    let b = e.target.closest("[data-vj]");
    if (b) vjAct(b).catch((x) => note(x.message || String(x)));
  });
  $("info").addEventListener("change", (e) => {
    if (!e.target.matches("[data-vjf]")) return;
    let f = e.target.files && e.target.files[0];
    e.target.value = "";
    vjSube(f).catch((x) => note(x.message || String(x)));
  });
  $("closeInfo").addEventListener("click", () => {
    if (dispBloq) return doLogout();
    let vd = $("infoBody").querySelector(".vj-video");
    if (vd) vd.pause();
    vjSuelta();
    /* La tarjeta de la convocatoria en Partidos se pone al día al cerrar */
    if ($("infoBody").querySelector("[data-cvt]")) render();
  });
  function ciPanel() {
    if (!state.ciOk) return "";
    let L = state.circs;
    return `<section class="panel ci-panel"><div class="bar"><div><div class="kicker">Fuerza · coordinación · velocidad</div><h2 class="h2s">Circuitos</h2><p class="muted">${viendo ? "Ejercicios con el peso del cuerpo, aptos para fútbol base." : `Mis circuitos guardados${plan === "pro" ? "" : ": " + L.length + " / " + CI_MAX}`}</p></div>${viendo ? "" : `<button type="button" class="primary small" data-ci="nuevomis">${ic("plus", 18)}Circuito</button>`}</div><div class="btools"><button type="button" class="secondary small" data-ci="biblio">Biblioteca de ejercicios</button></div>${
      viendo
        ? ""
        : L.length
          ? L.map(
              (x) =>
                `<div class="row ci-row"><div class="info"><strong>${esc(x.c.nombre)}</strong><small>${ciMeta(x.c)}</small></div><div class="ci-acc"><button type="button" class="ib" data-ci="runmis" data-cid="${x.id}" aria-label="Iniciar ${esc(x.c.nombre)}">▶</button><button type="button" class="ib" data-ci="editmis" data-cid="${x.id}" aria-label="Editar ${esc(x.c.nombre)}">${ic("pencil", 18)}</button><button type="button" class="ib" data-ci="delmis" data-cid="${x.id}" aria-label="Borrar ${esc(x.c.nombre)}">${ic("trash", 18)}</button></div></div>`,
            ).join("")
          : `<p class="muted">Aún no tienes circuitos guardados. Crea uno o empieza con una plantilla: fuerza básica, coordinación, velocidad, prevención de lesiones o calentamiento.</p>`
    }</section>`;
  }
  /* --- Editor (en la ventana de información) --- */
  function ciEditorHtml() {
    let e = ciEd,
      c = e.c,
      sel = (f, L, suf) =>
        `<select data-cif="${f}">${L.map((v) => `<option value="${v}"${+c[f] === v ? " selected" : ""}>${v}${suf}</option>`).join("")}</select>`;
    if (e.vista === "lib") return ciBiblioHtml(true);
    if (e.vista === "propio")
      return `<p>Escribe un ejercicio tuyo. Se guarda dentro de este circuito.</p><label class="ci-l">Nombre<input data-cip="n" maxlength="60" placeholder="Ej.: Saltos a la comba" autocomplete="off"></label><label class="ci-l">Cómo se hace (opcional)<textarea data-cip="d" maxlength="300" rows="3" placeholder="Explícalo en pocas palabras"></textarea></label><div class="stack"><button type="button" class="primary" data-ci="propiook">Añadir al circuito</button><button type="button" class="secondary" data-ci="volver">Volver al circuito</button></div>`;
    if (e.vista === "plant")
      return `<p>Elige una plantilla o uno de tus circuitos. Se copian sus ejercicios y tiempos, y luego puedes cambiarlos.</p><h3 class="ci-h3">Plantillas</h3>${CI_PLANT.map((p, i) => `<button type="button" class="ci-opt" data-ci="usaplant" data-i="${i}"><b>${esc(p.nombre)}</b><small>${ciMeta(p)}</small></button>`).join("")}${state.circs.length ? `<h3 class="ci-h3">Mis circuitos</h3>${state.circs.map((x) => `<button type="button" class="ci-opt" data-ci="usamis" data-cid="${x.id}"><b>${esc(x.c.nombre)}</b><small>${ciMeta(x.c)}</small></button>`).join("")}` : ""}<div class="stack"><button type="button" class="secondary" data-ci="volver">Volver al circuito</button></div>`;
    return `<label class="ci-l">Nombre del circuito<input data-cif="nombre" maxlength="60" value="${esc(c.nombre)}" autocomplete="off"></label><div class="ci-tiempos"><div class="ci-tl"><span>Trabajo de cada ejercicio</span>${ciMmss("trabajo", c.trabajo)}</div><div class="ci-tl"><span>Descanso</span>${ciMmss("descanso", c.descanso)}</div><label>Series${sel("series", [1, 2, 3, 4, 5, 6], "")}</label><div class="ci-tl"><span>Pausa entre series</span>${ciMmss("pausa", c.pausa)}</div></div><p class="muted ci-ayt">Escribe los minutos y segundos que quieras. Si un ejercicio necesita otro tiempo, cámbialo en su ⏱.</p><p class="muted" data-ci-meta>${c.est.length ? ciMeta(c) : "Añade ejercicios al circuito."}</p>${
      c.est.length
        ? `<ol class="ci-est">${c.est
            .map(
              (s, i) =>
                `<li>${ciPicDe(s) ? ciPic(ciPicDe(s), 40) : '<span class="ci-num">' + (i + 1) + "</span>"}<div class="info"><strong>${esc(s.n)}</strong>${s.d ? `<small>${esc(s.d)}</small>` : ""}</div><div class="ci-acc"><button type="button" class="ib" data-ci="sube" data-i="${i}" aria-label="Subir"${i ? "" : " disabled"}>↑</button><button type="button" class="ib" data-ci="baja" data-i="${i}" aria-label="Bajar"${i < c.est.length - 1 ? "" : " disabled"}>↓</button><button type="button" class="ib" data-ci="fuera" data-i="${i}" aria-label="Quitar ${esc(s.n)}">${ic("x", 18)}</button></div><div class="ci-et${s.t ? " mio" : ""}"><span>⏱ Tiempo</span>${ciMmss("t", s.t, i, c.trabajo)}<button type="button" class="ci-et0" data-ci="tgen" data-i="${i}">Usar el general</button></div></li>`,
            )
            .join("")}</ol>`
        : ""
    }<div class="btools ci-tools"><button type="button" class="secondary small" data-ci="lib">${ic("plus", 18)}Ejercicio de la biblioteca</button><button type="button" class="secondary small" data-ci="propio">${ic("plus", 18)}Ejercicio propio</button><button type="button" class="secondary small" data-ci="plant">Usar una plantilla</button></div>${
      e.dest === "tr" ? `<label class="ci-chk"><input type="checkbox" data-cif="guardar"${e.guardar ? " checked" : ""}> Guardar también en «Mis circuitos» para reutilizarlo</label>` : ""
    }<div class="stack"><button type="button" class="primary" data-ci="ok">${e.dest === "tr" ? "Guardar en el entreno" : "Guardar circuito"}</button></div>`;
  }
  /* Campo de tiempo libre: minutos + segundos. f = trabajo | descanso | pausa | t (de un ejercicio) */
  function ciMmss(f, v, i, gen) {
    let nom = { trabajo: "trabajo", descanso: "descanso", pausa: "pausa entre series", t: "este ejercicio" }[f],
      vacio = f === "t" && !v,
      ref = vacio ? gen : v,
      m = Math.floor(ref / 60),
      sg = ref % 60,
      di = i === undefined ? "" : ` data-i="${i}"`,
      at = (u) => `type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="${u === "m" ? 30 : 59}" data-cim="${f}" data-u="${u}"${di}`;
    return `<span class="ci-mmss${vacio ? " gen" : ""}"><input ${at("m")} aria-label="Minutos de ${nom}" ${vacio ? `value="" placeholder="${m}"` : `value="${m}"`}><i>min</i><input ${at("s")} aria-label="Segundos de ${nom}" ${vacio ? `value="" placeholder="${sg}"` : `value="${sg}"`}><i>s</i></span>`;
  }
  function ciLeeMmss(inp) {
    let box = inp.closest(".ci-mmss"),
      m = box.querySelector('[data-u="m"]'),
      s = box.querySelector('[data-u="s"]');
    if (m.value === "" && s.value === "") return null;
    return (+m.value || 0) * 60 + (+s.value || 0);
  }
  function ciPintaMmss(inp, v) {
    let box = inp.closest(".ci-mmss");
    box.querySelector('[data-u="m"]').value = Math.floor(v / 60);
    box.querySelector('[data-u="s"]').value = v % 60;
    box.classList.remove("gen");
  }
  function ciBiblioHtml(conAdd) {
    let cat = (ciEd && ciEd.cat) || ciCat;
    return `<p>${conAdd ? "Toca «Añadir» para meter un ejercicio en el circuito." : "Ejercicios con el peso del cuerpo, aptos para fútbol base. Ajusta el tiempo a la edad: con los pequeños, menos tiempo y más descanso."}</p><div class="ci-cats" role="group" aria-label="Tipo de ejercicio">${CI_CAT.map((k) => `<button type="button" class="chip${k[0] === cat ? " on" : ""}" data-ci="cat" data-k="${k[0]}" aria-pressed="${k[0] === cat}">${k[1]}</button>`).join("")}</div><div class="ci-lib">${CI_EJ.filter((x) => x[1] === cat)
      .map(
        (x) =>
          `<div class="ci-ej">${ciPic(x[2])}<div class="info"><strong>${esc(x[3])}</strong><small>${esc(x[4])}</small></div>${conAdd ? `<button type="button" class="secondary small" data-ci="add" data-e="${x[0]}">${ciEd.c.est.some((s) => s.e === x[0]) ? "✓ Otra vez" : "Añadir"}</button>` : ""}</div>`,
      )
      .join("")}</div>${conAdd ? `<div class="stack"><button type="button" class="primary" data-ci="volver">Volver al circuito (${ciEd.c.est.length})</button></div>` : ""}`;
  }
  let ciCat = "fuerza";
  function ciPinta(scroll) {
    let t = ciEd.dest === "tr" ? "Circuito del entreno" : ciEd.id ? "Editar circuito" : "Nuevo circuito";
    if (ciEd.vista === "lib") t = "Biblioteca de ejercicios";
    if (ciEd.vista === "propio") t = "Ejercicio propio";
    if (ciEd.vista === "plant") t = "Plantillas";
    let y = $("infoBody").scrollTop;
    ciOpen(t, ciEditorHtml());
    $("infoBody").scrollTop = scroll ? 0 : y;
  }
  function ciNuevoBorrador() {
    return { nombre: "Circuito", trabajo: 30, descanso: 15, series: 3, pausa: 60, est: [] };
  }
  async function ciGuardarMis(c, id) {
    if (!id && plan !== "pro" && state.circs.length >= CI_MAX) {
      ciOpen("Plan Pro", ciLimiteHtml());
      return false;
    }
    if (id) {
      let r = await db.from("circuitos").update({ nombre: c.nombre, datos: c }).eq("id", id);
      if (r.error) return note(r.error.message), false;
      let x = state.circs.find((x) => x.id === id);
      if (x) x.c = c;
      return true;
    }
    let row = { id: crypto.randomUUID(), owner_id: curUser, nombre: c.nombre, datos: c };
    let r = await db.from("circuitos").insert(row);
    if (r.error) {
      if (/LIMITE_PLAN/.test(r.error.message || "")) ciOpen("Plan Pro", ciLimiteHtml());
      else note(r.error.message);
      return false;
    }
    state.circs.push({ id: row.id, c });
    return true;
  }
  async function ciAct(b) {
    let k = b.dataset.ci,
      t = b.dataset.id && state.trainings.find((x) => x.id === b.dataset.id),
      m = b.dataset.cid && state.circs.find((x) => x.id === b.dataset.cid);
    if (k === "biblio") {
      ciEd = null;
      return ciOpen("Biblioteca de ejercicios", ciBiblioHtml(false));
    }
    if (k === "cat") {
      ciCat = b.dataset.k;
      if (ciEd) {
        ciEd.cat = ciCat;
        return ciPinta(true);
      }
      return ciOpen("Biblioteca de ejercicios", ciBiblioHtml(false));
    }
    if (k === "run" && t) return ciCorre(ciDe(t.circuito));
    if (k === "runmis" && m) return ciCorre(m.c);
    if (viendo) return note(SOLO_VER);
    if (k === "nuevo" && t) {
      ciEd = { dest: "tr", id: t.id, c: ciNuevoBorrador(), vista: "plant", cat: ciCat, guardar: false };
      return ciPinta(true);
    }
    if (k === "editar" && t) {
      ciEd = { dest: "tr", id: t.id, c: ciDe(t.circuito), vista: "edit", cat: ciCat, guardar: false };
      return ciPinta(true);
    }
    if (k === "quitar" && t) {
      if (!confirm("¿Quitar el circuito de este entreno? Si lo tienes en «Mis circuitos», allí sigue.")) return;
      await trSave(t, { circuito: null });
      render();
      return note("Circuito quitado del entreno.", true);
    }
    if (k === "nuevomis") {
      if (plan !== "pro" && state.circs.length >= CI_MAX) return ciOpen("Plan Pro", ciLimiteHtml());
      ciEd = { dest: "mis", id: null, c: ciNuevoBorrador(), vista: "plant", cat: ciCat };
      return ciPinta(true);
    }
    if (k === "editmis" && m) {
      ciEd = { dest: "mis", id: m.id, c: ciCopia(m.c), vista: "edit", cat: ciCat };
      return ciPinta(true);
    }
    if (k === "delmis" && m) {
      if (!confirm(`¿Borrar el circuito «${m.c.nombre}»? Los entrenos que ya lo tienen lo conservan.`)) return;
      let r = await db.from("circuitos").delete().eq("id", m.id);
      if (r.error) return note(r.error.message);
      state.circs = state.circs.filter((x) => x !== m);
      render();
      return note("Circuito borrado.", true);
    }
    if (!ciEd) return;
    let c = ciEd.c,
      i = +b.dataset.i;
    if (k === "lib" || k === "propio" || k === "plant") {
      ciEd.vista = k;
      return ciPinta(true);
    }
    if (k === "volver") {
      ciEd.vista = "edit";
      return ciPinta(true);
    }
    if (k === "add") {
      if (c.est.length >= 20) return note("Un circuito puede tener hasta 20 ejercicios.");
      c.est.push(ciEst(b.dataset.e));
      ciPinta(false);
      return note("Añadido: " + ciEj(b.dataset.e)[3] + ".", true);
    }
    if (k === "propiook") {
      let n = ($("infoBody").querySelector("[data-cip=n]").value || "").trim(),
        d = ($("infoBody").querySelector("[data-cip=d]").value || "").trim();
      if (!n) return note("Escribe el nombre del ejercicio.");
      if (c.est.length >= 20) return note("Un circuito puede tener hasta 20 ejercicios.");
      c.est.push({ e: null, n: n.slice(0, 60), d: d.slice(0, 300) });
      ciEd.vista = "edit";
      return ciPinta(true);
    }
    if (k === "usaplant" || k === "usamis") {
      let src = k === "usaplant" ? CI_PLANT[i] : m && m.c;
      if (!src) return;
      ciEd.c = ciLimpio(ciCopia(src));
      ciEd.vista = "edit";
      return ciPinta(true);
    }
    if (k === "sube" || k === "baja") {
      let j = k === "sube" ? i - 1 : i + 1;
      if (j < 0 || j >= c.est.length) return;
      [c.est[i], c.est[j]] = [c.est[j], c.est[i]];
      return ciPinta(false);
    }
    if (k === "tgen") {
      if (c.est[i]) delete c.est[i].t;
      return ciPinta(false);
    }
    if (k === "fuera") {
      c.est.splice(i, 1);
      return ciPinta(false);
    }
    if (k === "ok") {
      let v = ciLimpio(c);
      if (!v.est.length) return note("Añade al menos un ejercicio al circuito.");
      b.disabled = true;
      try {
        if (ciEd.dest === "tr") {
          let tr = state.trainings.find((x) => x.id === ciEd.id);
          if (!tr) return;
          await trSave(tr, { circuito: v });
          if (ciEd.guardar && !(await ciGuardarMis(ciCopia(v), null))) return render();
        } else if (!(await ciGuardarMis(v, ciEd.id))) return;
      } finally {
        b.disabled = false;
      }
      $("info").classList.add("hidden");
      ciEd = null;
      render();
      return note("Circuito guardado.", true);
    }
  }
  $("view").addEventListener("click", (e) => {
    let b = e.target.closest("[data-ci]");
    if (b) ciAct(b).catch((x) => note(x.message || String(x)));
  });
  $("info").addEventListener("click", (e) => {
    let b = e.target.closest("[data-ci]");
    if (b) ciAct(b).catch((x) => note(x.message || String(x)));
  });
  $("info").addEventListener("change", (e) => {
    let f = e.target.dataset.cif;
    if (!f || !ciEd) return;
    if (f === "guardar") return (ciEd.guardar = e.target.checked);
    ciEd.c[f] = f === "nombre" ? e.target.value.slice(0, 60) : +e.target.value;
    let mt = $("infoBody").querySelector("[data-ci-meta]");
    if (mt && ciEd.c.est.length) mt.textContent = ciMeta(ciEd.c);
  });
  $("info").addEventListener("input", (e) => {
    if (e.target.dataset.cif === "nombre" && ciEd) ciEd.c.nombre = e.target.value.slice(0, 60);
  });
  /* Tiempos libres: se guardan al salir del campo (change) */
  $("info").addEventListener("change", (e) => {
    let inp = e.target,
      f = inp.dataset && inp.dataset.cim;
    if (!f || !ciEd) return;
    let c = ciEd.c,
      v = ciLeeMmss(inp);
    if (f === "t") {
      let s = c.est[+inp.dataset.i];
      if (!s) return;
      if (v === null || v === 0) delete s.t;
      else (s.t = ciClamp(v, "t")), ciPintaMmss(inp, s.t);
      inp.closest(".ci-et").classList.toggle("mio", !!s.t);
    } else {
      c[f] = ciClamp(v === null ? CI_LIM[f][0] : v, f);
      ciPintaMmss(inp, c[f]);
      if (f === "trabajo")
        $("infoBody").querySelectorAll('.ci-mmss.gen [data-cim="t"]').forEach((x) => {
          x.placeholder = x.dataset.u === "m" ? Math.floor(c.trabajo / 60) : c.trabajo % 60;
        });
    }
    let mt = $("infoBody").querySelector("[data-ci-meta]");
    if (mt && c.est.length) mt.textContent = ciMeta(c);
  });
  /* --- Cronómetro del circuito (pantalla completa, pita al cambiar) --- */
  let ciRun = null;
  function ciFases(c) {
    let F = [{ k: "prep", d: 10, i: 0, s: 0 }],
      n = c.est.length;
    for (let s = 0; s < c.series; s++) {
      for (let i = 0; i < n; i++) {
        F.push({ k: "work", d: ciT(c, c.est[i]), i, s });
        if (i < n - 1 && c.descanso) F.push({ k: "rest", d: c.descanso, i: i + 1, s });
      }
      if (s < c.series - 1 && c.pausa) F.push({ k: "pausa", d: c.pausa, i: 0, s: s + 1 });
    }
    F.push({ k: "fin", d: 0, i: n - 1, s: c.series - 1 });
    return F;
  }
  function ciSon() {
    try {
      return localStorage.getItem("mf_ci_son") !== "0";
    } catch (e) {
      return true;
    }
  }
  function ciPita(f, ms) {
    let r = ciRun;
    if (!r || !r.ac || !ciSon()) return;
    try {
      let o = r.ac.createOscillator(),
        g = r.ac.createGain(),
        t0 = r.ac.currentTime;
      o.frequency.value = f;
      o.type = "square";
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
      o.connect(g);
      g.connect(r.ac.destination);
      o.start(t0);
      o.stop(t0 + ms / 1000 + 0.02);
    } catch (e) {}
  }
  function ciCorre(c) {
    if (!c || !c.est.length) return;
    ciPara();
    let box = document.createElement("div");
    box.className = "cto";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", "Circuito: " + c.nombre);
    document.body.appendChild(box);
    document.body.classList.add("cam-on");
    let AC = window.AudioContext || window.webkitAudioContext;
    ciRun = { c, F: ciFases(c), p: 0, box, fin: 0, pausa: false, resto: 0, ult: -1, ac: null };
    try {
      if (AC) {
        ciRun.ac = new AC();
        if (ciRun.ac.resume) ciRun.ac.resume();
      }
    } catch (e) {}
    ciLuz();
    box.addEventListener("click", (e) => {
      let b = e.target.closest("[data-cto]");
      if (b) ciBoton(b.dataset.cto);
    });
    ciFase(0);
    ciRun.tm = setInterval(ciTic, 200);
  }
  function ciFase(p, desde) {
    let r = ciRun;
    r.p = Math.max(0, Math.min(p, r.F.length - 1));
    let f = r.F[r.p];
    r.fin = (desde || Date.now()) + f.d * 1000;
    r.ult = -1;
    if (f.k === "fin") {
      ciPita(1320, 250);
      setTimeout(() => ciPita(1320, 250), 350);
      setTimeout(() => ciPita(1760, 600), 700);
      if (navigator.vibrate) try { navigator.vibrate([200, 100, 200, 100, 400]); } catch (e) {}
    } else if (f.k === "work") {
      ciPita(1320, 500);
      if (navigator.vibrate) try { navigator.vibrate(300); } catch (e) {}
    } else if (r.p) ciPita(660, 400);
    ciPintaRun();
  }
  function ciTic() {
    let r = ciRun;
    if (!r || r.pausa) return;
    let f = r.F[r.p];
    if (f.k === "fin") return;
    let q = r.fin - Date.now();
    if (q <= 0) {
      let fin = r.fin;
      /* si el móvil se ha dormido un rato, avanza las fases que ya han pasado */
      let p = r.p + 1;
      while (p < r.F.length - 1 && fin + r.F[p].d * 1000 <= Date.now()) fin += r.F[p++].d * 1000;
      return ciFase(p, fin);
    }
    let s = Math.ceil(q / 1000);
    if (s !== r.ult) {
      r.ult = s;
      if (s <= 3 && f.d > 3) ciPita(880, 120);
      let t = r.box.querySelector("[data-cto-t]"),
        bar = r.box.querySelector("[data-cto-b]");
      if (t) t.textContent = s >= 60 ? Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") : String(s);
      if (bar) bar.style.width = Math.max(0, Math.min(100, 100 - (q * 100) / (f.d * 1000))) + "%";
    }
  }
  function ciPintaRun() {
    let r = ciRun,
      c = r.c,
      f = r.F[r.p],
      s = c.est[f.i] || c.est[0],
      sigF = r.F.slice(r.p + 1).find((x) => x.k === "work"),
      sig = sigF && (f.k === "work" ? c.est[sigF.i] : null),
      lab = { prep: "Prepárate", work: "¡Vamos!", rest: "Descansa", pausa: "Pausa entre series", fin: "¡Circuito terminado!" }[f.k],
      pic = ciPicDe(s);
    r.box.className = "cto ph-" + f.k + (r.pausa ? " parado" : "");
    if (f.k === "fin") {
      r.box.innerHTML = `<div class="cto-in"><div class="cto-ph">${lab}</div><p class="cto-fin">${esc(c.nombre)}<br>${c.est.length} ejercicios · ${c.series} ${c.series === 1 ? "serie" : "series"} · ${ciSeg(ciTotal(c))}</p><div class="cto-btns"><button type="button" class="secondary" data-cto="otra">Repetir</button><button type="button" class="primary" data-cto="x">Cerrar</button></div></div>`;
      return;
    }
    r.box.innerHTML = `<div class="cto-in"><div class="cto-top"><span>Serie <b>${f.s + 1}</b>/${c.series} · Ejercicio <b>${f.i + 1}</b>/${c.est.length}</span><button type="button" class="ib cto-x" data-cto="x" aria-label="Terminar el circuito">${ic("x", 22)}</button></div><div class="cto-ph">${r.pausa ? "En pausa" : lab}</div><div class="cto-t" data-cto-t aria-live="off">${f.d >= 60 ? Math.floor(f.d / 60) + ":" + String(f.d % 60).padStart(2, "0") : f.d}</div><div class="cto-bar" aria-hidden="true"><i data-cto-b></i></div><div class="cto-ej">${f.k === "work" ? "" : '<div class="kicker">' + (f.k === "rest" || f.k === "prep" || f.k === "pausa" ? "Ahora viene" : "") + "</div>"}${pic ? ciPic(pic, 84) : ""}<b>${esc(s.n)}</b>${s.d ? `<p>${esc(s.d)}</p>` : ""}</div>${sig ? `<p class="cto-sig">Después: ${esc(sig.n)}</p>` : ""}<div class="cto-btns"><button type="button" class="secondary" data-cto="prev" aria-label="Fase anterior">« Atrás</button><button type="button" class="primary" data-cto="pausa">${r.pausa ? "▶ Seguir" : "❚❚ Pausa"}</button><button type="button" class="secondary" data-cto="next" aria-label="Saltar a la siguiente fase">Saltar »</button></div><button type="button" class="cto-son" data-cto="son" aria-pressed="${ciSon()}">${ciSon() ? "🔊 Sonido activado" : "🔇 Sin sonido"}</button></div>`;
    r.ult = -1;
    if (r.pausa) {
      let q = r.resto,
        s2 = Math.ceil(q / 1000),
        t = r.box.querySelector("[data-cto-t]"),
        bar = r.box.querySelector("[data-cto-b]");
      t.textContent = s2 >= 60 ? Math.floor(s2 / 60) + ":" + String(s2 % 60).padStart(2, "0") : String(s2);
      bar.style.width = 100 - (q * 100) / (f.d * 1000) + "%";
    } else ciTic();
  }
  function ciBoton(k) {
    let r = ciRun;
    if (!r) return;
    if (r.ac && r.ac.state === "suspended" && r.ac.resume) r.ac.resume();
    if (k === "x") {
      if (r.F[r.p].k !== "fin" && r.p > 0 && !confirm("¿Terminar el circuito?")) return;
      return ciPara();
    }
    if (k === "otra") return ciFase(0);
    if (k === "son") {
      try {
        localStorage.setItem("mf_ci_son", ciSon() ? "0" : "1");
      } catch (e) {}
      return ciPintaRun();
    }
    if (k === "pausa") {
      if (r.pausa) {
        r.pausa = false;
        r.fin = Date.now() + r.resto;
      } else {
        r.pausa = true;
        r.resto = Math.max(0, r.fin - Date.now());
      }
      return ciPintaRun();
    }
    if (k === "next" || k === "prev") {
      r.pausa = false;
      return ciFase(r.p + (k === "next" ? 1 : -1));
    }
  }
  function ciPara() {
    let r = ciRun;
    if (!r) return;
    clearInterval(r.tm);
    try {
      if (r.lock) r.lock.release().catch(() => {});
    } catch (e) {}
    try {
      if (r.ac && r.ac.close) r.ac.close();
    } catch (e) {}
    r.box.remove();
    if (!document.querySelector(".cam")) document.body.classList.remove("cam-on");
    ciRun = null;
  }
  /* Que no se apague la pantalla mientras corre el circuito */
  function ciLuz() {
    if (!ciRun || ciRun.lock || !navigator.wakeLock) return;
    try {
      navigator.wakeLock
        .request("screen")
        .then((l) => {
          if (!ciRun) return l.release().catch(() => {});
          ciRun.lock = l;
          l.addEventListener("release", () => ciRun && ciRun.lock === l && (ciRun.lock = null));
        })
        .catch(() => {});
    } catch (e) {}
  }
  document.addEventListener("visibilitychange", () => {
    if (ciRun && !document.hidden) ciLuz();
  });
  /* ===== Carga física por jugador (v10.5) =====
     Esfuerzo percibido de 1 a 10 (RPE) × minutos = carga. Entrenos: entrenamientos.carga
     {dur: minutos, rpe: {id: 1-10}}. Partidos: rpe dentro de cada participación (sus minutos ya están).
     Gratis: anotar y ver la carga de la semana. Pro: gráfico de 6 semanas y avisos de sobrecarga. */
  const CG_ESF = ["", "Muy, muy fácil", "Muy fácil", "Fácil", "Moderado", "Algo duro", "Duro", "Muy duro", "Muy, muy duro", "Casi al máximo", "Máximo"];
  const cgCol = (n) => ["", "#4ade80", "#4ade80", "#86efac", "#bef264", "#fde047", "#fbbf24", "#fb923c", "#f97316", "#fb7185", "#f43f5e"][n] || "var(--s3)";
  let cgEd = null;
  const cgRpe = (v) => {
    let n = Math.round(Number(v));
    return n >= 1 && n <= 10 ? n : 0;
  };
  function cgDeTr(t) {
    let c = parseJson(t && t.carga, null);
    if (!c) return null;
    let dur = Math.min(300, Math.max(0, Math.round(Number(c.dur) || 0))),
      rpe = {};
    Object.entries(c.rpe || {}).forEach(([k, v]) => {
      if (cgRpe(v)) rpe[k] = cgRpe(v);
    });
    return { dur, rpe };
  }
  /* Lunes de la semana de una fecha "aaaa-mm-dd" */
  function cgLunes(f) {
    let d = new Date(f + "T12:00:00");
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return ymd(d);
  }
  /* Sesiones del equipo elegido tal como las anota el entrenador (v11.6):
     [{t: "entreno"|"partido", ref, f, n, dur, min: {id: minutos}, rpe: {id: 1-10}}] */
  function cgBase() {
    let S = [];
    trainings().forEach((t) => {
      let c = cgDeTr(t) || { dur: 0, rpe: {} };
      S.push({ t: "entreno", ref: t.id, f: t.fecha, n: "Entreno", dur: c.dur, rpe: c.rpe });
    });
    games().forEach((m) => {
      let min = {},
        rpe = {};
      entries(m).forEach((e) => {
        let mi = Number(e.minutes) || 0;
        if (mi > 0) min[e.id] = mi;
        if (cgRpe(e.rpe)) rpe[e.id] = cgRpe(e.rpe);
      });
      S.push({ t: "partido", ref: m.id, f: m.fecha, n: "vs " + m.rival, min, rpe });
    });
    return S;
  }
  /* Junta lo del entrenador con lo que anotan los jugadores desde el enlace (manda el entrenador).
     J(tipo, ref) → {id: 1-10}. dd = minutos del entreno si el entrenador no los ha puesto.
     Devuelve [{f, tipo, nombre, por: {id: {rpe, min}}}] */
  function cgMezcla(S, J, dd) {
    let hoy = ymd(new Date()),
      R = [];
    S.forEach((s) => {
      let j = s.f <= hoy && J ? J(s.t, s.ref) || {} : {},
        rpe = { ...j, ...(s.rpe || {}) },
        dur = s.t === "entreno" ? s.dur || (Object.keys(j).length ? dd || 75 : 0) : 0,
        por = {};
      Object.entries(rpe).forEach(([id, r]) => {
        r = cgRpe(r);
        let mi = s.t === "entreno" ? dur : Number((s.min || {})[id]) || 0;
        if (r && mi > 0) por[id] = { rpe: r, min: mi };
      });
      if (Object.keys(por).length) R.push({ f: s.f, tipo: s.t === "entreno" ? "e" : "p", nombre: s.n, ref: s.ref, por });
    });
    return R;
  }
  function cgSesiones() {
    return cgMezcla(cgBase(), cgJug, cgDur());
  }
  /* Carga por jugador y semana: las 6 últimas semanas (la última es la actual) */
  function cgSemanas(S) {
    let hoy = cgLunes(ymd(new Date())),
      W = [];
    for (let i = 5; i >= 0; i--) {
      let d = new Date(hoy + "T12:00:00");
      d.setDate(d.getDate() - 7 * i);
      W.push(ymd(d));
    }
    let por = {},
      eq = W.map(() => 0);
    (S || cgSesiones()).forEach((s) => {
      let w = W.indexOf(cgLunes(s.f));
      if (w < 0) return;
      Object.entries(s.por).forEach(([id, x]) => {
        let c = x.rpe * x.min;
        (por[id] = por[id] || W.map(() => 0))[w] += c;
        eq[w] += c;
      });
    });
    return { W, por, eq };
  }
  /* Aviso: semana actual frente a la media de las 4 anteriores (con al menos 2 semanas con datos) */
  /* v11.7: x = {lim, P} del contexto (cxAvisoX): tope según la edad y periodo de cada semana */
  function cgAviso(L, x) {
    let prev = L.slice(1, 5).filter((x) => x > 0);
    if (prev.length < 2) return null;
    let media = L.slice(1, 5).reduce((a, b) => a + b, 0) / 4,
      r = media ? L[5] / media : 0,
      lim = (x && x.lim) || 1.5,
      P = (x && x.P) || [];
    if (P[5] === "paron") return r > lim ? { k: "d", t: "Parón: está subiendo", r } : { k: "b", t: "Parón: es normal que baje", r };
    if (r > lim) return { k: "l", t: P[4] === "paron" ? "Vuelta del parón: ha subido mucho" : P[5] === "pre" ? "Pretemporada: sube muy deprisa" : "Cuidado: ha subido mucho", r };
    if (r > lim - 0.2) return { k: "d", t: "Está subiendo", r };
    if (r < 0.8 && L[5] > 0) return { k: "b", t: "Carga baja", r };
    return { k: "w", t: "Normal", r };
  }
  const cgSem = (f) => {
    let d = new Date(f + "T12:00:00");
    return d.getDate() + " " + MES[d.getMonth()];
  };
  function cgBarras(L, W, alto) {
    let mx = Math.max(1, ...L);
    return `<div class="cg-bars" style="height:${alto}px" aria-hidden="true">${L.map(
      (v, i) => `<span title="Semana del ${cgSem(W[i])}: ${v}"><i style="height:${Math.round((v * 100) / mx)}%"${i === L.length - 1 ? ' class="hoy"' : ""}></i></span>`,
    ).join("")}</div>`;
  }
  function cgTrBloque(t) {
    if (!state.cgOk) return "";
    let c = cgDeTr(t) || { dur: 0, rpe: {} },
      J = cgJug("entreno", t.id),
      jn = Object.keys(J).filter((id) => !c.rpe[id]).length,
      R = Object.values({ ...J, ...c.rpe }),
      n = R.length;
    if (!n)
      return viendo
        ? ""
        : `<div class="btools cg-add"><button type="button" class="secondary small" data-cg="tr" data-id="${t.id}">${ic("chart", 18)}Anotar esfuerzo (1-10)</button></div>`;
    let media = R.reduce((a, b) => a + b, 0) / n;
    return `<div class="cg-res"><span><b style="color:${cgCol(Math.round(media))}">${media.toFixed(1).replace(".", ",")}</b> esfuerzo medio · ${c.dur || cgDur()} min · ${n} ${n === 1 ? "jugador" : "jugadores"}${jn ? ` · <i class="cg-jug">📱 ${jn} desde el enlace</i>` : ""}</span>${viendo ? "" : `<button type="button" class="secondary small" data-cg="tr" data-id="${t.id}">${jn && !Object.keys(c.rpe).length ? "Revisar" : "Cambiar"}</button>`}</div>`;
  }
  function cgPanel() {
    if (!state.cgOk) return "";
    let { W, por, eq } = cgSemanas(),
      pro = plan === "pro",
      ax = cxAvisoX(cxOf(), catOf(state.mode, curTeam()), W),
      r = roster()
        .map((p) => {
          let L = por[p.id] || W.map(() => 0);
          return { p, L, a: cgAviso(L, ax) };
        })
        .sort((a, b) => b.L[5] - a.L[5] || a.p.nombre.localeCompare(b.p.nombre, "es")),
      hace = new Date();
    hace.setDate(hace.getDate() - 21);
    let sinEsf = viendo
        ? []
        : games()
            .filter((m) => m.fecha >= ymd(hace) && m.fecha <= ymd(new Date()) && entries(m).some((e) => Number(e.minutes) > 0) && !entries(m).some((e) => cgRpe(e.rpe)) && !Object.keys(cgJug("partido", m.id)).length)
            .slice(0, 3),
      avisos = pro ? r.filter((x) => x.a && x.a.k === "l") : [],
      hay = eq.some((x) => x > 0);
    return `<section class="panel cg-panel"><div class="bar"><div><div class="kicker">Esfuerzo × minutos</div><h2 class="h2s">Carga física</h2><p class="muted">Semana del ${cgSem(W[5])} · equipo: <b>${eq[5]}</b></p></div><button type="button" class="ib" data-cg="info" aria-label="Qué es la carga física">?</button></div>${cxFila()}${
      sinEsf.length
        ? `<div class="cg-pend"><b>Partidos sin esfuerzo anotado</b>${sinEsf.map((m) => `<button type="button" class="secondary small" data-cg="pa" data-id="${m.id}">${esc(cgSem(m.fecha))} vs ${esc(m.rival)}</button>`).join("")}</div>`
        : ""
    }${
      !hay
        ? `<p class="muted">Al terminar un entreno o un partido, pregunta a cada jugador cuánto le ha costado del 1 al 10 y apúntalo con «Anotar esfuerzo». La app multiplica por los minutos y te enseña la carga de cada semana.</p>${cgEnlaceHint()}`
        : `${
            pro
              ? `<div class="cg-eq"><small>Carga del equipo, últimas 6 semanas</small>${cgBarras(eq, W, 64)}<div class="cg-ejes">${W.map((w, i) => `<span>${i === 5 ? "esta" : cgSem(w)}</span>`).join("")}</div>${cxEjePer(ax.P)}</div>${avisos.length ? `<div class="cg-alerta" role="status">⚠ ${avisos.map((x) => esc(x.p.nombre)).join(", ")}: esta semana ${avisos.length === 1 ? "lleva" : "llevan"} mucha más carga que su media. Vigila el cansancio y las molestias.</div>` : ""}`
              : `<div class="cg-pro"><b>Con el plan Pro</b>: gráfico de las últimas 6 semanas de cada jugador y aviso cuando alguien sube demasiado de golpe, que es cuando más lesiones hay.${enAndroid ? "" : `<button type="button" class="secondary small" data-cg="pro">Ver el plan Pro</button>`}</div>`
          }${r
            .map(
              (o) =>
                `<div class="row cg-row">${avatar(o.p)}<div class="info"><strong>${esc(o.p.nombre)}</strong>${pro && o.a ? `<small class="cg-a ${o.a.k}">${o.a.t}</small>` : `<small>esta semana</small>`}</div>${pro ? cgBarras(o.L, W, 34) : ""}<div class="big"><b>${o.L[5]}</b><small>carga</small></div></div>`,
            )
            .join("")}${cgEnlaceHint()}`
    }</section>`;
  }
  /* Aviso: que lo anoten los propios jugadores desde el enlace del equipo (v11.6) */
  function cgEnlaceHint() {
    if (viendo || !espOk) return "";
    let e = espDe(),
      on = e && espEsfOn(e);
    return `<div class="cg-enl"><span>📱 ${on ? "Tus jugadores anotan su esfuerzo desde el <b>enlace del equipo</b> y aquí se suma solo." : "Que lo anoten <b>los propios jugadores</b> desde el enlace del equipo, y pásale la carga al <b>preparador físico</b>."}</span><button type="button" class="secondary small" data-esp="abrir">${e ? "Ver el enlace" : "Crear el enlace"}</button></div>`;
  }
  /* --- Ventana para anotar el esfuerzo --- */
  function cgEditorHtml() {
    let e = cgEd,
      ids = e.ids;
    return `<p>Pregunta a cada jugador: <b>¿cuánto te ha costado, del 1 (muy fácil) al 10 (lo máximo)?</b> Mejor unos minutos después de terminar, uno a uno.</p>${
      e.tipo === "e"
        ? `<label class="ci-l">Minutos que ha durado el entreno<input type="number" inputmode="numeric" min="1" max="300" data-cgf="dur" value="${e.dur || ""}"></label>`
        : `<p class="muted">Se usan los minutos que ha jugado cada uno en el partido.</p>`
    }${e.jug && Object.keys(e.jug).length ? `<p class="muted cg-jtxt">📱 Los que llevan «lo anotó él» lo han puesto ellos desde el enlace del equipo. Si cambias el número, vale el tuyo.</p>` : ""}<div class="cg-todos"><span>Poner a todos:</span>${[4, 5, 6, 7, 8].map((n) => `<button type="button" class="cg-n" style="--c:${cgCol(n)}" data-cg="todos" data-v="${n}">${n}</button>`).join("")}</div>${
      ids.length
        ? ids
            .map((id) => {
              let p = state.players.find((x) => x.id === id) || { id, nombre: e.nombres[id] || "Jugador" },
                v = e.rpe[id] || 0;
              return `<div class="cg-j"><div class="cg-jn">${avatar(p)}<div class="info"><strong>${esc(p.nombre)}</strong><small>${v ? v + " · " + CG_ESF[v] : "Sin anotar"}${e.tipo === "p" ? " · " + (e.min[id] || 0) + " min" : ""}${e.jug && e.jug[id] && e.jug[id] === v ? ' · <i class="cg-jug">📱 lo anotó él</i>' : ""}</small></div></div><div class="cg-esc" role="group" aria-label="Esfuerzo de ${esc(p.nombre)}">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
                .map((n) => `<button type="button" class="cg-n${v === n ? " on" : ""}" style="--c:${cgCol(n)}" data-cg="v" data-pid="${id}" data-v="${n}" aria-pressed="${v === n}" aria-label="${n}, ${CG_ESF[n]}">${n}</button>`)
                .join("")}</div></div>`;
            })
            .join("")
        : `<p class="muted">${e.tipo === "e" ? "Marca primero quién ha venido al entreno." : "En este partido nadie tiene minutos."}</p>`
    }<div class="stack"><button type="button" class="primary" data-cg="ok">Guardar esfuerzo</button>${Object.keys(e.rpe).length ? `<button type="button" class="secondary" data-cg="borrar">Borrar lo anotado</button>` : ""}</div>`;
  }
  function cgPinta() {
    let y = $("infoBody").scrollTop;
    ciOpen(cgEd.tipo === "e" ? "Esfuerzo del entreno" : "Esfuerzo del partido", cgEditorHtml());
    $("infoBody").scrollTop = y;
  }
  function cgDur() {
    try {
      return Number(localStorage.getItem("mf_cg_dur")) || 75;
    } catch (e) {
      return 75;
    }
  }
  /* Periodo de cada semana debajo del gráfico (si se ha puesto) */
  const cxEjePer = (P) =>
    P && P.some(Boolean) ? `<div class="cg-ejes cx-ejes">${P.map((p) => `<span class="cx-${p || "x"}">${p ? cxPerN(p).slice(0, p === "paron" ? 5 : 4) : ""}</span>`).join("")}</div>` : "";
  function cgInfoHtml() {
    return `<p>La <b>carga física</b> mide cuánto ha trabajado cada jugador. Se calcula así: <b>esfuerzo (del 1 al 10) × minutos</b>. Un entreno de 75 minutos con esfuerzo 6 da 450.</p><p>El esfuerzo lo dice el propio jugador: al terminar, pregúntale «¿cuánto te ha costado, del 1 al 10?». Es lo que usan los preparadores físicos (se llama RPE) y funciona muy bien también en fútbol base.</p><p>Con el <b>plan Pro</b> ves el gráfico de las últimas 6 semanas y un <b>aviso</b> cuando la carga de esta semana es mucho mayor que la media de las 4 anteriores (más de 1,5 veces). Subir de golpe es cuando más lesiones hay: mejor ir subiendo poco a poco.</p><p>El <b>contexto del equipo</b> (categoría, días de entreno, horario y periodo: pretemporada, competición o parón) afina el aviso: hasta infantil salta antes (1,3 veces la media), en el parón es normal que baje y a la vuelta del parón te avisa si se sube de golpe.</p><p class="muted">Es una ayuda para el entrenador, no un diagnóstico médico.</p>`;
  }
  async function cgAct(b) {
    let k = b.dataset.cg;
    if (k === "info") return ciOpen("Carga física", cgInfoHtml());
    if (k === "pro")
      return ciOpen("Plan Pro", `<p>Con el <b>plan Pro</b> ves el <b>gráfico de carga</b> de las últimas 6 semanas de cada jugador y del equipo, y un <b>aviso de sobrecarga</b> cuando alguien sube demasiado de golpe. Anotar el esfuerzo y ver la carga de la semana es gratis.</p><p>Además: jugadores, partidos y entrenamientos ilimitados, varios equipos, vídeo en directo y circuitos guardados sin límite.</p>${precioProHtml()}<div class="stack">${proBtn()}${clubLinkBtn()}</div>`);
    if (viendo) return note(SOLO_VER);
    if (k === "tr") {
      let t = state.trainings.find((x) => x.id === b.dataset.id);
      if (!t) return;
      let c = cgDeTr(t) || { dur: 0, rpe: {} },
        J = cgJug("entreno", t.id),
        a = t.asistencia || {},
        R = roster(),
        vinieron = R.filter((p) => a[p.id] === "si" || a[p.id] === "tarde").map((p) => p.id),
        ids = vinieron.length ? vinieron : Object.keys(a).length ? [] : R.map((p) => p.id);
      Object.keys({ ...J, ...c.rpe }).forEach((id) => !ids.includes(id) && ids.push(id));
      cgEd = { tipo: "e", id: t.id, ids, rpe: { ...J, ...c.rpe }, jug: J, dur: c.dur || cgDur(), min: {}, nombres: {} };
      return cgPinta();
    }
    if (k === "pa") {
      let m = state.matches.find((x) => x.id === b.dataset.id);
      if (!m) return;
      let J = cgJug("partido", m.id),
        E = entries(m).filter((e) => Number(e.minutes) > 0 || cgRpe(e.rpe) || J[e.id]),
        rpe = {},
        min = {},
        nombres = {};
      E.forEach((e) => {
        if (cgRpe(e.rpe) || J[e.id]) rpe[e.id] = cgRpe(e.rpe) || J[e.id];
        min[e.id] = Number(e.minutes) || 0;
        nombres[e.id] = e.nombre;
      });
      cgEd = { tipo: "p", id: m.id, ids: E.map((e) => e.id), rpe, jug: J, min, nombres, dur: 0 };
      return cgPinta();
    }
    if (!cgEd) return;
    if (k === "v") {
      let v = +b.dataset.v;
      if (cgEd.rpe[b.dataset.pid] === v) delete cgEd.rpe[b.dataset.pid];
      else cgEd.rpe[b.dataset.pid] = v;
      return cgPinta();
    }
    if (k === "todos") {
      cgEd.ids.forEach((id) => (cgEd.rpe[id] = +b.dataset.v));
      return cgPinta();
    }
    if (k === "borrar") {
      cgEd.rpe = {};
      return cgPinta();
    }
    if (k === "ok") {
      let e = cgEd;
      b.disabled = true;
      try {
        if (e.tipo === "e") {
          let t = state.trainings.find((x) => x.id === e.id),
            dur = Math.min(300, Math.max(0, Math.round(Number(e.dur) || 0)));
          if (!t) return;
          if (Object.keys(e.rpe).length && !dur) return note("Pon cuántos minutos ha durado el entreno.");
          try {
            localStorage.setItem("mf_cg_dur", String(dur || 75));
          } catch (x) {}
          await trSave(t, { carga: Object.keys(e.rpe).length ? { dur, rpe: e.rpe } : null });
        } else {
          let m = state.matches.find((x) => x.id === e.id);
          if (!m) return;
          let P = entries(m).map((x) => {
            let y = { ...x };
            if (e.rpe[x.id]) y.rpe = e.rpe[x.id];
            else delete y.rpe;
            return y;
          });
          let r = await db.from("futbol_personal_partidos").update({ participaciones: JSON.stringify(P) }).eq("id", m.id);
          if (r.error) return note(r.error.message);
          m.participaciones = P;
        }
      } finally {
        b.disabled = false;
      }
      $("info").classList.add("hidden");
      cgEd = null;
      render();
      return note("Esfuerzo guardado.", true);
    }
  }
  $("view").addEventListener("click", (e) => {
    let b = e.target.closest("[data-cg]");
    if (b) cgAct(b).catch((x) => note(x.message || String(x)));
  });
  $("info").addEventListener("click", (e) => {
    let b = e.target.closest("[data-cg]");
    if (b) cgAct(b).catch((x) => note(x.message || String(x)));
  });
  $("info").addEventListener("input", (e) => {
    if (e.target.dataset.cgf === "dur" && cgEd) cgEd.dur = e.target.value;
  });

  /* --- Contexto de la carga (v11.7, idea de un preparador físico) ---
     Por equipo: días de entreno a la semana, horario y periodo de la temporada (con su historial),
     además de la categoría (la edad). Sirve para ajustar el aviso de sobrecarga, dar consejos y
     marcar cada entreno con su día del microciclo (MD-2 = 2 días antes del partido).
     Va en equipos.contexto (supabase-contexto.sql); sin la columna, se guarda en este dispositivo.
     {dias: 1-7, hora: "m"|"t"|"n", per: [{d: "aaaa-mm-dd", p: "pre"|"comp"|"paron"}]} */
  const CX_PER = [
    ["pre", "Pretemporada", "Se va subiendo la carga poco a poco"],
    ["comp", "Competición", "Microciclo competitivo: semanas con partido"],
    ["paron", "Parón", "Navidad, Semana Santa, sin partidos…"],
  ];
  const CX_HORA = [
    ["m", "Mañana"],
    ["t", "Tarde"],
    ["n", "Noche"],
  ];
  const cxKey = (id) => "mf_ctx:" + (id || state.mode);
  const cxPerN = (p) => (CX_PER.find((x) => x[0] === p) || ["", ""])[1];
  function cxDe(x) {
    let c = parseJson(x, null);
    if (!c || typeof c !== "object") c = {};
    let dias = Math.round(Number(c.dias)) || 0;
    return {
      dias: dias >= 1 && dias <= 7 ? dias : 0,
      hora: CX_HORA.some((h) => h[0] === c.hora) ? c.hora : "",
      per: (Array.isArray(c.per) ? c.per : [])
        .filter((p) => p && /^\d{4}-\d\d-\d\d$/.test(p.d) && CX_PER.some((z) => z[0] === p.p))
        .map((p) => ({ d: p.d, p: p.p }))
        .sort((a, b) => a.d.localeCompare(b.d))
        .slice(-40),
    };
  }
  function cxOf(id) {
    if (id === undefined) id = curTeam();
    let t = state.teams.find((z) => z.id === id),
      c = t && t.contexto;
    if (!c)
      try {
        c = localStorage.getItem(cxKey(id));
      } catch (e) {}
    return cxDe(c);
  }
  /* Periodo de una fecha según el historial (el último que empezó ese día o antes) */
  function cxPer(c, f) {
    let p = "";
    c.per.forEach((x) => {
      if (x.d <= f) p = x.p;
    });
    return p;
  }
  /* Hasta infantil (menores de 14) el aviso salta antes */
  const cxJoven = (cat) => !!cat && ["prebenjamin", "benjamin", "alevin", "infantil"].includes(cat[0]);
  /* Lo que necesita el aviso: tope (veces la media) y periodo de cada una de las 6 semanas */
  function cxAvisoX(c, cat, W) {
    let hoy = ymd(new Date());
    return {
      lim: cxJoven(cat) ? 1.3 : 1.5,
      P: W.map((w) => {
        let d = new Date(w + "T12:00:00");
        d.setDate(d.getDate() + 6);
        let f = ymd(d);
        return cxPer(c, f < hoy ? f : hoy);
      }),
    };
  }
  /* Resumen en una línea: «Benjamín · 3 días/semana · tarde · Competición» */
  function cxLinea(c, cat, f) {
    let p = cxPer(c, f || ymd(new Date())),
      h = CX_HORA.find((x) => x[0] === c.hora);
    return [cat ? cat[1] : "Sin categoría", c.dias ? c.dias + (c.dias === 1 ? " día" : " días") + "/semana" : "", h ? h[1].toLowerCase() : "", p ? cxPerN(p) : ""].filter(Boolean).join(" · ");
  }
  /* Consejos según el contexto. Orientativos: el que sabe es el preparador. */
  function cxConsejos(c, cat) {
    let p = cxPer(c, ymd(new Date())),
      L = [];
    if (p === "pre") L.push("Pretemporada: sube la carga poco a poco (no más de un 10% de una semana a otra) y deja un día suave entre los más duros.");
    if (p === "comp") L.push("Semana con partido: el día después, recuperación; a mitad de semana, lo más intenso; el día antes, activación corta y con balón.");
    if (p === "paron") L.push("Parón: mantén 1 o 2 sesiones para no perder la forma. La semana de vuelta es cuando más lesiones hay: sube poco a poco.");
    if (cxJoven(cat)) L.push(`En ${esc(cat[1].toLowerCase())}, casi todo el trabajo físico con balón y jugando. El aviso de sobrecarga salta antes (1,3 veces su media).`);
    else if (cat && (cat[0] === "cadete" || cat[0] === "juvenil")) L.push("En cadete y juvenil ya se puede meter fuerza con su propio peso, bien hecha y sin prisa.");
    if (c.dias && c.dias <= 2) L.push(`Con ${c.dias === 1 ? "1 día" : "2 días"} por semana cada sesión cuenta: mezcla físico y táctica en el mismo entreno.`);
    else if (c.dias >= 4) L.push(`Con ${c.dias} días por semana, alterna sesiones fuertes y suaves.`);
    if (c.hora === "m") L.push("Por la mañana el cuerpo tarda más en arrancar: haz el calentamiento algo más largo.");
    if (c.hora === "n") L.push("De noche cuesta más dormir después de un entreno muy intenso: déjalo para días que no haya partido temprano.");
    return L;
  }
  /* Día del microciclo de un entreno: MD-2 = faltan 2 días para el partido; MD+1 = el día después */
  const CX_MD = {
    "-1": "activación corta, con balón y poca carga",
    "-2": "velocidad y poco volumen",
    "-3": "el día más intenso de la semana",
    "-4": "el día más intenso de la semana",
    "+1": "recuperación: suave",
    "+2": "recuperación activa o compensatorio",
  };
  function cxMD(f) {
    let d0 = new Date(f + "T12:00:00"),
      dif = (m) => Math.round((new Date(m.fecha + "T12:00:00") - d0) / 864e5),
      G = games().map((m) => dif(m)),
      sig = G.filter((x) => x > 0 && x <= 6).sort((a, b) => a - b)[0],
      ant = G.filter((x) => x < 0 && x >= -2).sort((a, b) => b - a)[0];
    if (ant !== undefined && (sig === undefined || -ant < sig)) return { k: "+" + -ant, t: CX_MD["+" + -ant] };
    if (sig !== undefined) return { k: "-" + sig, t: CX_MD["-" + sig] || "carga media" };
    return null;
  }
  function cxMDHtml(t) {
    if (!state.cgOk) return "";
    let m = cxMD(t.fecha);
    if (!m) return "";
    let n = +m.k.slice(1);
    return `<p class="cx-md"><b>MD${m.k}</b> ${m.k[0] === "-" ? `faltan ${n} ${n === 1 ? "día" : "días"} para el partido` : `${n === 1 ? "el día" : "2 días"} después del partido`}: ${esc(m.t)}.</p>`;
  }
  /* Fila del contexto dentro del panel de carga */
  function cxFila() {
    let c = cxOf(),
      cat = catOf(state.mode, curTeam()),
      vacio = !c.dias && !c.hora && !c.per.length,
      L = cxConsejos(c, cat);
    return `<div class="cx-row"><div><small>Contexto del equipo</small><b>${esc(cxLinea(c, cat))}</b>${vacio ? `<span class="muted">Pon días de entreno, horario y periodo para afinar los avisos.</span>` : ""}</div>${viendo ? "" : `<button type="button" class="secondary small" data-cx="abrir">${vacio ? "Poner" : "Cambiar"}</button>`}</div>${L.length ? `<details class="cx-tips"><summary>Consejos para esta semana (${L.length})</summary><ul>${L.map((x) => `<li>${x}</li>`).join("")}</ul></details>` : ""}`;
  }
  let cxEd = null;
  function cxEditorHtml() {
    let e = cxEd,
      cat = catOf(state.mode, curTeam()),
      hoy = ymd(new Date()),
      pAct = cxPer(e, hoy),
      bt = (act, v, on, t) => `<button type="button" class="cx-b${on ? " on" : ""}" data-cx="${act}" data-v="${v}" aria-pressed="${on}">${t}</button>`;
    return `<p>Con esto la app ajusta el <b>aviso de sobrecarga</b>, te da consejos y marca cada entreno con su día de la semana de partido (MD-2 = faltan 2 días).</p><label class="ci-l">Categoría (la edad)<select data-cxf="cat"><option value="">Sin categoría</option>${CATS.map((z) => `<option value="${z[0]}" ${cat && cat[0] === z[0] ? "selected" : ""}>${z[1]}</option>`).join("")}</select></label><div class="cx-g"><span>Días de entreno a la semana</span><div class="cx-bs">${[1, 2, 3, 4, 5, 6, 7].map((n) => bt("dias", n, e.dias === n, n)).join("")}</div></div><div class="cx-g"><span>Entrenáis por la…</span><div class="cx-bs">${CX_HORA.map((h) => bt("hora", h[0], e.hora === h[0], h[1])).join("")}</div></div><div class="cx-g"><span>Periodo de la temporada</span><div class="cx-ps">${CX_PER.map(
      (x) => `<button type="button" class="ci-opt cx-p${e.nuevo === x[0] || (!e.nuevo && pAct === x[0]) ? " on" : ""}" data-cx="per" data-v="${x[0]}"><b>${x[1]}</b><small>${x[2]}</small></button>`,
    ).join("")}</div>${e.nuevo && e.nuevo !== pAct ? `<label class="ci-l">Desde el día<input type="date" data-cxf="desde" value="${esc(e.desde || hoy)}" max="${hoy}"></label>` : ""}</div>${
      e.per.length
        ? `<details class="cx-hist"><summary>Historial de periodos (${e.per.length})</summary>${e.per
            .slice()
            .reverse()
            .map((x) => `<div class="cx-hi"><span>Desde el ${esc(fmtDate(x.d))}: <b>${cxPerN(x.p)}</b></span><button type="button" class="ib" data-cx="quitaper" data-v="${esc(x.d)}" aria-label="Quitar">${ic("x", 18)}</button></div>`)
            .join("")}</details>`
        : ""
    }<div class="stack"><button type="button" class="primary" data-cx="ok">Guardar</button></div>`;
  }
  function cxPinta() {
    let y = $("infoBody").scrollTop;
    ciOpen("Contexto de la carga", cxEditorHtml());
    $("infoBody").scrollTop = y;
  }
  async function cxGuarda(c) {
    let id = curTeam(),
      local = false;
    try {
      if (!id && state.teamsOk) id = await firstTeam(teamName());
      if (!id) throw Error("contexto");
      let r = await db.from("equipos").update({ contexto: c }).eq("id", id);
      if (r.error) throw r.error;
      let t = state.teams.find((z) => z.id === id);
      if (t) t.contexto = c;
      try {
        localStorage.removeItem(cxKey(id));
      } catch (e) {}
    } catch (e) {
      if (!/contexto/i.test((e && e.message) || "")) return note(e.message || String(e)), false;
      /* Sin la columna en el servidor: se guarda en este dispositivo */
      local = true;
      try {
        localStorage.setItem(cxKey(id), JSON.stringify(c));
      } catch (z) {}
    }
    return local ? "local" : true;
  }
  async function cxAct(b) {
    let k = b.dataset.cx;
    if (viendo) return note(SOLO_VER);
    if (k === "abrir") {
      cxEd = { ...cxOf(), nuevo: "", desde: "" };
      cxEd.per = cxEd.per.slice();
      return cxPinta();
    }
    if (!cxEd) return;
    if (k === "dias") cxEd.dias = cxEd.dias === +b.dataset.v ? 0 : +b.dataset.v;
    else if (k === "hora") cxEd.hora = cxEd.hora === b.dataset.v ? "" : b.dataset.v;
    else if (k === "per") cxEd.nuevo = b.dataset.v;
    else if (k === "quitaper") cxEd.per = cxEd.per.filter((x) => x.d !== b.dataset.v);
    else if (k === "ok") {
      let c = { dias: cxEd.dias, hora: cxEd.hora, per: cxEd.per.slice() },
        hoy = ymd(new Date());
      if (cxEd.nuevo && cxEd.nuevo !== cxPer(c, hoy)) {
        let d = /^\d{4}-\d\d-\d\d$/.test(cxEd.desde || "") && cxEd.desde <= hoy ? cxEd.desde : hoy;
        c.per = c.per.filter((x) => x.d !== d).concat({ d, p: cxEd.nuevo });
      }
      c = cxDe(c);
      b.disabled = true;
      let r;
      try {
        r = await cxGuarda(c);
      } finally {
        b.disabled = false;
      }
      if (!r) return;
      $("info").classList.add("hidden");
      cxEd = null;
      render();
      return note("Contexto guardado." + (r === "local" ? " De momento se guarda solo en este dispositivo (falta un paso en el servidor)." : ""), true);
    }
    cxPinta();
  }
  $("view").addEventListener("click", (e) => {
    let b = e.target.closest("[data-cx]");
    if (b) cxAct(b).catch((x) => note(x.message || String(x)));
  });
  $("info").addEventListener("click", (e) => {
    let b = e.target.closest("[data-cx]");
    if (b) cxAct(b).catch((x) => note(x.message || String(x)));
  });
  $("info").addEventListener("change", (e) => {
    let f = e.target.dataset && e.target.dataset.cxf;
    if (!f || !cxEd) return;
    if (f === "desde") cxEd.desde = e.target.value;
    if (f === "cat")
      setCat(e.target.value)
        .then(() => cxEd && cxPinta())
        .catch((x) => note(x.message || String(x)));
  });

  /* --- Fases del juego en los entrenos (v11.7) ---
     Minutos de cada fase según los ejercicios marcados, y su carga (minutos × esfuerzo medio del
     entreno). Gratis: esta semana. Pro: las 6 últimas semanas y el total. */
  function faSesion(t) {
    let M = {},
      E = ejDe(t.ejercicios);
    E.forEach((s) => {
      let k = s.f || "";
      M[k] = (M[k] || 0) + s.t / 60;
    });
    let c = cgDeTr(t),
      J = cgJug("entreno", t.id),
      R = Object.values({ ...J, ...((c && c.rpe) || {}) }),
      rpe = R.length ? R.reduce((a, b) => a + b, 0) / R.length : 0;
    return { M, rpe };
  }
  function faPanel() {
    if (!state.trOk || !state.ejOk) return "";
    let T = trainings(),
      hoy = cgLunes(ymd(new Date())),
      W = [];
    for (let i = 5; i >= 0; i--) {
      let d = new Date(hoy + "T12:00:00");
      d.setDate(d.getDate() - 7 * i);
      W.push(ymd(d));
    }
    let por = {},
      carga = {},
      hay = false;
    FASES.forEach((x) => {
      por[x[0]] = W.map(() => 0);
      carga[x[0]] = W.map(() => 0);
    });
    T.forEach((t) => {
      let w = W.indexOf(cgLunes(t.fecha));
      if (w < 0) return;
      let { M, rpe } = faSesion(t);
      Object.entries(M).forEach(([k, m]) => {
        if (!por[k]) return;
        hay = true;
        por[k][w] += m;
        carga[k][w] += m * rpe;
      });
    });
    let pro = esPro(),
      tot = FASES.reduce((a, x) => a + por[x[0]][5], 0),
      mx = Math.max(1, ...FASES.map((x) => por[x[0]][5])),
      fila = (x) => {
        let m = Math.round(por[x[0]][5]),
          cg = Math.round(carga[x[0]][5]);
        return `<div class="fa-row"><span class="fa-n">${faseTag(x[0])}</span><span class="fa-bar"><i style="width:${Math.round((por[x[0]][5] * 100) / mx)}%;background:${x[3]}"></i></span><span class="fa-v"><b>${m}</b> min${cg ? ` · <small>carga ${cg}</small>` : ""}</span></div>`;
      };
    let h = `<section class="panel fa-panel"><div class="bar"><div><div class="kicker">Ataque · defensa · ABP</div><h2 class="h2s">Fases del juego</h2><p class="muted">Semana del ${cgSem(W[5])} · ${Math.round(tot)} min marcados</p></div><button type="button" class="ib" data-fa="info" aria-label="Qué son las fases del juego">?</button></div>`;
    if (!hay) return h + `<p class="muted">Al añadir un ejercicio al entreno, marca su fase: ataque organizado, contraataque, defensa organizada, reorganización defensiva o ABP. Aquí verás cuántos minutos le dedicas a cada una.</p></section>`;
    h += FASES.map(fila).join("");
    if (pro) {
      let T6 = W.map((w, i) => FASES.reduce((a, x) => a + por[x[0]][i], 0)),
        mx6 = Math.max(1, ...T6),
        sum = FASES.map((x) => [x, por[x[0]].reduce((a, b) => a + b, 0)]),
        st = sum.reduce((a, b) => a + b[1], 0) || 1;
      h += `<div class="cg-eq"><small>Minutos por fase, últimas 6 semanas</small><div class="fa-st" aria-hidden="true">${W.map(
        (w, i) =>
          `<span title="Semana del ${cgSem(w)}">${FASES.map((x) => (por[x[0]][i] ? `<i style="height:${(por[x[0]][i] * 100) / mx6}%;background:${x[3]}"></i>` : "")).join("")}</span>`,
      ).join("")}</div><div class="cg-ejes">${W.map((w, i) => `<span>${i === 5 ? "esta" : cgSem(w)}</span>`).join("")}</div></div><p class="muted fa-tot">En 6 semanas: ${sum
        .filter((x) => x[1] > 0)
        .map((x) => `${esc(x[0][2])} <b>${Math.round((x[1] * 100) / st)}%</b>`)
        .join(" · ")}</p>`;
    } else
      h += `<div class="cg-pro"><b>Con el plan Pro</b>: las 6 últimas semanas por fase y el reparto en %, para ver si te olvidas de alguna.${enAndroid ? "" : `<button type="button" class="secondary small" data-cg="pro">Ver el plan Pro</button>`}</div>`;
    return h + `</section>`;
  }
  $("view").addEventListener("click", (e) => {
    let b = e.target.closest("[data-fa]");
    if (b)
      ciOpen(
        "Fases del juego",
        `<p>Un partido tiene <b>fases</b> y conviene entrenarlas todas:</p><ul><li><b>Ataque</b>: ataque organizado y contraataque (la transición defensa-ataque, justo al robar).</li><li><b>Defensa</b>: defensa organizada y reorganización defensiva (la transición ataque-defensa, justo al perderla).</li><li><b>ABP</b>: acciones a balón parado (córners, faltas, saques de banda…).</li></ul><p>Marca la fase en cada ejercicio del entreno y en tus jugadas de la pizarra. Aquí ves los <b>minutos</b> de cada fase y su <b>carga</b> (minutos × esfuerzo medio del entreno).</p><p class="muted">Gratis: esta semana. Con el plan Pro: las 6 últimas semanas y el reparto en %.</p>`,
      );
  });
  function blankAlign() {
    let f = Object.keys(formations[state.mode])[0];
    return { formation: f, slots: {} };
  }
  function editor() {
    let d = state.draft,
      f =
        formations[state.mode][d.alineacion.formation] ||
        formations[state.mode][Object.keys(formations[state.mode])[0]],
      slots = d.alineacion.slots || {},
      start = d.players.filter((x) => x.starter),
      al = d.alineacion,
      gk = gkOf(al, d.players.map((x) => x.id)),
      cap = al.capitan;
    let choices = roster()
      .map((p) => {
        let x = d.players.find((e) => e.id === p.id);
        return `<div class="checkline"><span>${esc(p.nombre)}${x && p.id === cap ? ' <em class="tg c" title="Capitán">C</em>' : ""}${x && p.id === gk ? ' <em class="tg g" title="Portero">POR</em>' : ""}</span><input type="checkbox" data-field="called" data-id="${p.id}" aria-label="Convocado: ${esc(p.nombre)}" ${x ? "checked" : ""}><input type="checkbox" data-field="starter" data-id="${p.id}" aria-label="Titular: ${esc(p.nombre)}" ${x?.starter ? "checked" : ""}><input type="number" data-field="minutes" data-id="${p.id}" aria-label="Minutos de ${esc(p.nombre)}" min="0" value="${x?.minutes || 0}" ${x ? "" : "disabled"}><input type="number" data-field="goals" data-id="${p.id}" aria-label="Goles de ${esc(p.nombre)}" min="0" value="${x?.goals || 0}" ${x ? "" : "disabled"}></div>`;
      })
      .join("");
    return `<section class="panel"><div class="bar"><div><div class="kicker">${viendo ? "Partido (solo lectura)" : state.editing ? "Editar partido" : "Nuevo partido"}</div><h2>${MN()}</h2><p class="muted">${d.players.length}${MODES[state.mode].cap ? " / " + MODES[state.mode].cap : ""} convocados · ${start.length}/${modeCount()} titulares</p></div><span class="mbtns">${viendo ? "" : `<button class="secondary small" data-cv="desde">${ic("share", 18)}Convocatoria</button>`}<button class="secondary small" data-action="cancel">${ic("back", 18)}Volver</button></span></div><div class="formgrid"><label>Fecha<input id="date" type="date" value="${esc(d.fecha)}"></label><label>Rival<input id="rival" value="${esc(d.rival)}" maxlength="100" autocomplete="off"></label></div><div class="score"><label>Goles a favor<input id="gf" type="number" min="0" max="99" inputmode="numeric" placeholder="–" value="${esc(d.gf)}"></label><span class="dash" aria-hidden="true">–</span><label>Goles en contra<input id="gc" type="number" min="0" max="99" inputmode="numeric" placeholder="–" value="${esc(d.gc)}"></label><p class="hint">Resultado (opcional)</p></div>
<div class="lineup-layout"><div><div class="position-help"><h3>Campo y posiciones</h3><select id="formation" aria-label="Formación">${Object.keys(
      formations[state.mode],
    )
      .map(
        (x) =>
          `<option ${x === d.alineacion.formation ? "selected" : ""}>${x}</option>`,
      )
      .join(
        "",
      )}</select></div><div class="tools"><button class="secondary small" data-wipe="1">${ic("eraser", 18)}Limpiar campo</button><button class="primary small" data-img="draft">${ic("download", 18)}Descargar imagen</button><span class="muted">Arrastra un jugador al campo, o toca una posición y luego un jugador.</span></div><div class="pchips">${
      roster()
        .map((p) => {
          let at = Object.values(slots).includes(p.id);
          return `<div class="pchip ${at ? "placed" : ""} ${state.selectedChip === p.id ? "sel" : ""}" data-chip="${p.id}">${avatar(p)}<span>${esc(p.nombre)}</span></div>`;
        })
        .join("") ||
      '<span class="muted">Añade primero jugadores en Plantilla.</span>'
    }</div>
<div class="field ${state.mode === "fs" ? "fs" : ""}">${fieldMarks()}${f
      .map((s, i) => {
        let pid = slots[i],
          pl = pid && state.players.find((x) => x.id === pid);
        let pc = pid && slotCol(d.alineacion, pid, gk);
        return `<div class="slot" style="left:${s[1]}%;top:${s[2]}%"><button data-slot="${i}" class="${pid ? "fill" : ""}${pid && pid === gk ? " gk" : ""} ${state.selectedSlot === i ? "sel" : ""}"${pc ? ` style="--pc:${pc};--pi:${inkOn(pc)}"` : ""} aria-label="${pid ? esc(name(pid)) + " en " + s[0] : "Posición " + s[0] + " libre"}" title="${pid ? "Arrastra para mover" : "Elegir jugador"}">${pid ? (pl && pl.foto && pl.foto.startsWith("data:") ? `<img src="${esc(pl.foto)}" alt="">${dorsal(pl) ? `<em class="dn">${dorsal(pl)}</em>` : ""}` : esc(dorsal(pl) || (name(pid)[0] || "?").toUpperCase())) : "+"}</button>${pid && pid === cap ? '<i class="capb" title="Capitán" aria-label="Capitán">C</i>' : ""}<span>${pid ? esc(name(pid)) : s[0]}</span></div>`;
      })
      .join("")}</div>
<div class="slotmenu">${
      state.selectedSlot !== null
        ? roster()
            .map(
              (p) =>
                `<button class="${slots[state.selectedSlot] === p.id ? "selected" : ""}" data-pick="${p.id}">${esc(p.nombre)}</button>`,
            )
            .join("") +
          (slots[state.selectedSlot]
            ? '<button class="danger" data-clear="1">Quitar jugador</button>' +
              `<div class="slotcol"><h4>Color de ${esc(name(slots[state.selectedSlot]))}</h4>${colorPicker(
                "al",
                slotCol(d.alineacion, slots[state.selectedSlot], gk) || (slots[state.selectedSlot] === gk ? "#fbbf24" : "#2be36a"),
                '<button type="button" data-pca="all">Poner este color a todo el equipo</button><button type="button" data-pc="">Color normal</button>',
              )}</div>`
            : "")
        : '<span class="muted">Toca una posición para elegir jugador, o arrástralo desde arriba.</span>'
    }</div></div>
<div><h3>Convocatoria</h3><div style="height:8px"></div><div class="checkline muted"><span>Jugador</span><span>Conv.</span><span>Inicial</span><span>Min.</span><span>Goles</span></div>${choices || '<div class="blank">Añade primero jugadores en Plantilla.</div>'}<h3 style="margin-top:18px">Inicial</h3><div style="margin-top:6px">${start.map((x) => `<span class="badge">${esc(name(x.id))}</span>`).join("") || '<span class="muted">Selecciona titulares.</span>'}</div>${mdEditor(d, gk)}</div></div>
<div class="savebar"><button class="primary" data-action="save" ${state.busy ? "disabled" : ""}>${ic("check", 20)}Guardar partido</button><button class="secondary" data-action="cancel">Cancelar</button></div></section>`;
  }
  /* Capitán, portero, cambios y tarjetas del partido (también se rellenan solos desde el Directo) */
  function mdEditor(d, gk) {
    let al = d.alineacion,
      conv = d.players
        .map((x) => x.id)
        .sort((a, b) => name(a).localeCompare(name(b), "es")),
      opt = (v, ph) =>
        `<option value="">${ph}</option>` +
        conv
          .map(
            (id) =>
              `<option value="${esc(id)}" ${id === v ? "selected" : ""}>${esc(dname(id))}</option>`,
          )
          .join(""),
      min = (k, i, z) =>
        `<input type="number" min="0" max="130" inputmode="numeric" data-md="${k}" data-i="${i}" data-k="m" value="${z.m === "" || z.m == null ? "" : Number(z.m) || 0}" placeholder="Min." aria-label="Minuto">`,
      del = (k, i, t) =>
        `<button type="button" class="ib d" data-mddel="${k}" data-i="${i}" aria-label="${t}" title="${t}">${ic("x", 18)}</button>`,
      cb = mdList(al, "cambios")
        .map(
          (z, i) =>
            `<div class="mdrow cb">${min("cambios", i, z)}<label><small>▼ Sale</small><select data-md="cambios" data-i="${i}" data-k="sale" aria-label="Jugador que sale">${opt(z.sale, "Sale…")}</select></label><label><small>▲ Entra</small><select data-md="cambios" data-i="${i}" data-k="entra" aria-label="Jugador que entra">${opt(z.entra, "Entra…")}</select></label>${del("cambios", i, "Quitar cambio")}</div>`,
        )
        .join(""),
      tj = mdList(al, "tarjetas")
        .map(
          (z, i) =>
            `<div class="mdrow">${min("tarjetas", i, z)}<label><small>Jugador</small><select data-md="tarjetas" data-i="${i}" data-k="pid" aria-label="Jugador de la tarjeta">${opt(z.pid, "Jugador…")}</select></label><label><small>Tarjeta</small><select data-md="tarjetas" data-i="${i}" data-k="c" aria-label="Color de la tarjeta"><option value="a" ${z.c !== "r" ? "selected" : ""}>🟨 Amarilla</option><option value="r" ${z.c === "r" ? "selected" : ""}>🟥 Roja</option></select></label>${del("tarjetas", i, "Quitar tarjeta")}</div>`,
        )
        .join(""),
      rnum = (k, i, f, v, l) =>
        `<label><small>${l}</small><input type="number" min="0" max="99" inputmode="numeric" data-md="${k}" data-i="${i}" data-k="${f}" value="${esc(v || "")}" placeholder="Nº" aria-label="${l}"></label>`,
      cbR = mdList(al, "cambiosR")
        .map(
          (z, i) =>
            `<div class="mdrow cb">${min("cambiosR", i, z)}${rnum("cambiosR", i, "sale", z.sale, "▼ Sale (dorsal)")}${rnum("cambiosR", i, "entra", z.entra, "▲ Entra (dorsal)")}${del("cambiosR", i, "Quitar cambio del rival")}</div>`,
        )
        .join(""),
      tjR = mdList(al, "tarjetasR")
        .map(
          (z, i) =>
            `<div class="mdrow r4">${min("tarjetasR", i, z)}${rnum("tarjetasR", i, "d", z.d, "Dorsal")}<label><small>Nombre</small><input data-md="tarjetasR" data-i="${i}" data-k="n" value="${esc(z.n || "")}" maxlength="30" placeholder="Opcional" aria-label="Nombre del jugador rival"></label><label><small>Tarjeta</small><select data-md="tarjetasR" data-i="${i}" data-k="c" aria-label="Color de la tarjeta"><option value="a" ${z.c !== "r" ? "selected" : ""}>🟨</option><option value="r" ${z.c === "r" ? "selected" : ""}>🟥</option></select></label>${del("tarjetasR", i, "Quitar tarjeta del rival")}</div>`,
        )
        .join(""),
      rv = esc(d.rival || "Rival");
    return `<div class="mdata"><h3 style="margin-top:18px">Datos del partido</h3><label class="mdparte">Minutos por parte<input id="mdParte" type="number" min="5" max="60" inputmode="numeric" value="${mdParte(d, state.editing)}"></label><div class="formgrid"><label>Capitán<select id="mdCap">${opt(al.capitan || "", "Sin capitán")}</select></label><label>Portero<select id="mdGk">${opt(gk, "—")}</select></label></div><p class="hint">Si no eliges portero, es el que pongas en la portería (POR).</p><h4>Cambios</h4>${cb || '<p class="muted">Sin cambios.</p>'}${mdVent(d)}<div class="hbtns"><button type="button" class="secondary small" data-mdadd="cambios">${ic("plus", 18)}Añadir cambio</button>${cb ? `<button type="button" class="secondary small" data-mdcalc="1">Calcular minutos</button>` : ""}</div><h4>Tarjetas</h4>${tj || '<p class="muted">Sin tarjetas.</p>'}<div class="hbtns"><button type="button" class="secondary small" data-mdadd="tarjetas">${ic("plus", 18)}Añadir tarjeta</button></div>${mdStats(d)}<h3 style="margin-top:18px">${rv} (rival)</h3><p class="hint">Del rival se apunta el dorsal y, si quieres, el nombre.</p><label class="mdparte">Tiros del rival<input type="number" min="0" max="999" inputmode="numeric" data-mdr="tir" value="${Number((al.estR || {}).tir) || ""}" placeholder="0"></label><h4>Cambios del rival</h4>${cbR || '<p class="muted">Sin cambios.</p>'}<div class="hbtns"><button type="button" class="secondary small" data-mdadd="cambiosR">${ic("plus", 18)}Añadir cambio del rival</button></div><h4>Tarjetas del rival</h4>${tjR || '<p class="muted">Sin tarjetas.</p>'}<div class="hbtns"><button type="button" class="secondary small" data-mdadd="tarjetasR">${ic("plus", 18)}Añadir tarjeta del rival</button></div></div>`;
  }
  /* Ventanas de cambios en el editor del partido: resumen por parte e interruptor */
  function mdVent(d) {
    if (state.mode === "fs") return "";
    let m0 = state.editing && state.matches.find((z) => z.id === state.editing),
      n = ventDe({ modalidad: state.mode, equipo_id: m0 ? m0.equipo_id : curTeam(), alineacion: d.alineacion }),
      sw = `<label class="lv-vsw"><input type="checkbox" id="mdVent" ${n ? "checked" : ""}> Ventanas de cambios (${VENT_N} por parte)</label>`;
    if (!n) return `<div class="md-vent">${sw}</div>`;
    let u = ventUsadas(mdList(d.alineacion, "cambios").filter((z) => z.sale || z.entra), mdParte(d, state.editing)),
      t = (p) => `<span class="${u[p].length > n ? "w" : ""}">${p}ª parte: <b>${u[p].length} de ${n}</b>${u[p].length > n ? " (te has pasado)" : ""}</span>`;
    return `<div class="md-vent">${sw}<p class="muted">Ventanas usadas · ${t(1)} · ${t(2)}</p><p class="hint">Los cambios del mismo minuto cuentan como una sola ventana. Los del descanso no gastan.</p></div>`;
  }
  /* Robos, pérdidas, tiros, paradas, asistencias y faltas de cada convocado + faltas acumuladas */
  function mdStats(d) {
    if (!d.players.length) return "";
    let F = d.alineacion.faltas || {},
      fi = (k, l) =>
        `<label><small>${l}</small><input type="number" min="0" max="99" inputmode="numeric" data-mdfal="${k}" value="${Number(F[k]) || ""}" placeholder="0" aria-label="Faltas ${l}"></label>`,
      ps = d.players.slice().sort((a, b) => name(a.id).localeCompare(name(b.id), "es"));
    return `<h4>Estadísticas de cada jugador</h4><p class="hint">Lo que apuntes en el Directo aparece aquí solo. Puedes corregirlo.</p><div class="mdst"><table><thead><tr><th scope="col">Jugador</th>${ESTP.map((s) => `<th scope="col" title="${s[2]}">${s[3]}</th>`).join("")}</tr></thead><tbody>${ps
      .map(
        (p) =>
          `<tr><th scope="row">${esc(dname(p.id))}</th>${ESTP.map((s) => `<td><input type="number" min="0" max="999" inputmode="numeric" data-mdst="${esc(p.id)}" data-k="${s[0]}" value="${stv(p, s[0]) || ""}" placeholder="0" aria-label="${s[2]} de ${esc(name(p.id))}"></td>`).join("")}</tr>`,
      )
      .join("")}</tbody></table></div><h4>Faltas acumuladas</h4><div class="mdfal">${fi("n1", "Nuestras 1ª")}${fi("r1", "Rival 1ª")}${fi("n2", "Nuestras 2ª")}${fi("r2", "Rival 2ª")}</div>`;
  }
  /* Duración del partido para calcular minutos: la del Directo si lo hay, si no la normal. */
  const mdParte = (d, id) => {
    let x = id && liveRows[id],
      m = id && state.matches.find((z) => z.id === id);
    return (
      Number(d.alineacion.parte) ||
      (x && Number(x.parte_min)) ||
      parteDe(state.mode, m ? teamOf(m) : curTeam())
    );
  };
  const mdTotal = (id) => mdParte(state.draft, id) * 2;
  document.addEventListener("click", (e) => {
    let d = state.draft;
    if (!d || state.live || !e.target.closest) return;
    let a = e.target.closest("[data-mdadd]"),
      r = e.target.closest("[data-mddel]"),
      c = e.target.closest("[data-mdcalc]");
    if (!a && !r && !c) return;
    if (viendo) return note(SOLO_VER);
    let al = d.alineacion;
    if (a) {
      let k = a.dataset.mdadd;
      al[k] = mdList(al, k);
      if (al[k].length >= 40) return note("Demasiados en este partido.");
      al[k].push(
        k === "cambios" || k === "cambiosR"
          ? { id: rid(), m: "", sale: "", entra: "" }
          : k === "tarjetasR"
            ? { id: rid(), m: "", d: "", n: "", c: "a" }
            : { id: rid(), m: "", pid: "", c: "a" },
      );
    }
    if (r) {
      let k = r.dataset.mddel;
      al[k] = mdList(al, k);
      al[k].splice(Number(r.dataset.i), 1);
    }
    if (c) {
      let mins = calcMin(d.players, mdList(al, "cambios").filter((z) => z.sale || z.entra), mdList(al, "tarjetas"), mdTotal(state.editing));
      d.players.forEach((p) => (p.minutes = Math.round(mins[p.id] || 0)));
      note("Minutos calculados con los titulares, los cambios y las expulsiones. Puedes retocarlos.", true);
    }
    render();
  });
  /* Color de un jugador en la alineación: el suyo o el del equipo (el portero no
     coge el del equipo). Vacío = el normal: verde, o amarillo el portero. */
  function slotCol(al, pid, gk) {
    let c = (al.colors || {})[pid] || (pid !== gk ? al.color : "");
    return isHex(c) ? c : "";
  }
  function place(i, pid) {
    const d = state.draft,
      sl = d.alineacion.slots,
      prev = sl[i],
      from = Object.keys(sl).find((k) => sl[k] === pid);
    if (prev === pid) return true;
    let x = d.players.find((p) => p.id === pid);
    if (
      !x &&
      MODES[state.mode].cap &&
      d.players.length >= MODES[state.mode].cap
    ) {
      note(
        `Máximo ${MODES[state.mode].cap} convocados en ${MN().toLowerCase()}.`,
      );
      return false;
    }
    if (from === undefined) {
      let st = d.players.filter((p) => p.starter && p.id !== prev).length;
      if (!(x && x.starter) && st >= modeCount()) {
        note(
          `Ya hay ${modeCount()} titulares en el campo. Quita a alguien primero.`,
        );
        return false;
      }
    }
    if (!x) {
      x = { id: pid, nombre: name(pid), minutes: 0, goals: 0, starter: false };
      d.players.push(x);
    }
    if (from === undefined) {
      if (prev) {
        let pp = d.players.find((p) => p.id === prev);
        if (pp) pp.starter = false;
      }
      x.starter = true;
      sl[i] = pid;
    } else {
      if (prev) sl[from] = prev;
      else delete sl[from];
      sl[i] = pid;
    }
    note("");
    return true;
  }
  function unplace(i) {
    let d = state.draft,
      pid = d.alineacion.slots[i];
    delete d.alineacion.slots[i];
    let p = d.players.find((x) => x.id === pid);
    if (p) p.starter = false;
  }
  function clearField() {
    let d = state.draft;
    d.alineacion.slots = {};
    d.players.forEach((p) => (p.starter = false));
    state.selectedSlot = null;
    state.selectedChip = null;
    note("Campo limpio. Puedes empezar de nuevo.", true);
  }
  function slotAt(x, y) {
    let el = document.elementFromPoint(x, y);
    let s = el && el.closest(".slot");
    return s ? s.querySelector("button[data-slot]") : null;
  }
  document.addEventListener("pointerdown", (e) => {
    if (!state.draft || (e.pointerType === "mouse" && e.button !== 0)) return;
    let chip = e.target.closest("[data-chip]"),
      sb = e.target.closest("button[data-slot]"),
      pid,
      fromSlot = null;
    if (chip) pid = chip.dataset.chip;
    else if (sb) {
      let s = state.draft.alineacion.slots[sb.dataset.slot];
      if (!s) return;
      pid = s;
      fromSlot = sb.dataset.slot;
    } else return;
    const sx = e.clientX,
      sy = e.clientY;
    let moving = false,
      ghost = null,
      over = null;
    const move = (ev) => {
      if (!moving) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 8) return;
        moving = true;
        ghost = document.createElement("div");
        ghost.className = "ghost";
        ghost.textContent = name(pid);
        document.body.appendChild(ghost);
      }
      ghost.style.left = ev.clientX + "px";
      ghost.style.top = ev.clientY + "px";
      let t = slotAt(ev.clientX, ev.clientY);
      if (t !== over) {
        if (over) over.classList.remove("over");
        if (t) t.classList.add("over");
        over = t;
      }
    };
    const end = (ev) => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", end);
      if (!moving) return;
      ghost.remove();
      if (over) over.classList.remove("over");
      state.justDragged = true;
      setTimeout(() => {
        state.justDragged = false;
      }, 60);
      if (ev.type === "pointerup") {
        let t = slotAt(ev.clientX, ev.clientY);
        if (t) place(Number(t.dataset.slot), pid);
        else if (fromSlot !== null) unplace(fromSlot);
      }
      state.selectedSlot = null;
      state.selectedChip = null;
      render();
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
  });
  /* Colores de las fichas: muestras rápidas y dos barras (tono y claro/oscuro)
     para elegir cualquier color. Se guardan como #rrggbb. */
  const PCOLS = ["#2be36a", "#ffd60a", "#ff8a1f", "#ff4d5e", "#ec4899", "#a855f7", "#38bdf8", "#1d4ed8", "#ffffff", "#9ca3af", "#111827"];
  const isHex = (c) => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c);
  function hslHex(h, s, l) {
    s /= 100;
    l /= 100;
    let k = (n) => (n + h / 30) % 12,
      a = s * Math.min(l, 1 - l),
      f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return (
      "#" +
      [f(0), f(8), f(4)]
        .map((x) => Math.round(x * 255).toString(16).padStart(2, "0"))
        .join("")
    );
  }
  function hexHsl(c) {
    let [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255),
      mx = Math.max(r, g, b),
      mn = Math.min(r, g, b),
      l = (mx + mn) / 2,
      d = mx - mn,
      h = 0;
    if (d)
      h =
        mx === r
          ? ((g - b) / d + 6) % 6
          : mx === g
            ? (b - r) / d + 2
            : (r - g) / d + 4;
    return [Math.round(h * 60) % 360, Math.round(l * 100)];
  }
  /* Texto oscuro sobre colores claros y blanco sobre los oscuros. */
  function inkOn(c) {
    let [r, g, b] = [1, 3, 5].map((i) => {
      let v = parseInt(c.slice(i, i + 2), 16) / 255;
      return v <= 0.04 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.36 ? "#03140a" : "#ffffff";
  }
  function colorPicker(ctx, cur, extra) {
    let [h, l] = hexHsl(cur);
    if (l < 15 || l > 90) l = 50;
    return `<div class="cpk" data-for="${ctx}" style="--cpk:${cur}"><div class="cpk-sw">${PCOLS.map((c) => `<button type="button" class="sw" data-pc="${c}" style="--c:${c}" aria-label="Color ${c}" aria-pressed="${c === cur.toLowerCase()}"><i></i></button>`).join("")}</div><label class="cpk-r"><span>Color</span><input type="range" class="cpk-h" data-pch="h" min="0" max="359" step="1" value="${h}" aria-label="Barra de color"></label><label class="cpk-r"><span>Claro</span><input type="range" class="cpk-l" data-pch="l" min="15" max="90" step="1" value="${l}" style="--h:${h}" aria-label="Más claro o más oscuro"></label><div class="cpk-b">${extra}</div></div>`;
  }
  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function clipTxt(g, t, max) {
    if (g.measureText(t).width <= max) return t;
    while (t.length > 1 && g.measureText(t + "…").width > max)
      t = t.slice(0, -1);
    return t + "…";
  }
  function clipName(g, t, max) {
    if (g.measureText(t).width <= max) return t;
    let f = t.split(" ")[0];
    return clipTxt(g, f, max);
  }
  function fmtDate(s) {
    let p = String(s || "").split("-");
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s || "";
  }
  async function drawLineup(o) {
    const W = 1080,
      H = 1520,
      cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const g = cv.getContext("2d"),
      ff =
        '"Barlow Condensed","Arial Narrow",Impact,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
      INK = "#f1f7ea",
      LIME = "#2be36a",
      MUT = "#a3bdad";
    const al = o.alineacion || {},
      fm = formations[o.modalidad][al.formation]
        ? al.formation
        : Object.keys(formations[o.modalidad])[0],
      pos = formations[o.modalidad][fm],
      slots = al.slots || {};
    const nm = (id) =>
      (
        state.players.find((p) => p.id === id) ||
        o.players.find((p) => p.id === id) ||
        {}
      ).nombre || "Jugador";
    const pc = (id) => slotCol(al, id, gkId) || (id === gkId ? GK : LIME);
    const dn = (id) =>
      dorsal(
        state.players.find((p) => p.id === id) ||
          o.players.find((p) => p.id === id),
      );
    const cssImg = (v) =>
      new Promise((res) => {
        let u = getComputedStyle(document.documentElement)
          .getPropertyValue(v)
          .trim()
          .replace(/^url\(["']?/, "")
          .replace(/["']?\)$/, "");
        if (!u) return res(null);
        let im = new Image();
        im.onload = () => res(im);
        im.onerror = () => res(null);
        im.src = u;
      });
    const logo = await cssImg("--logo"),
      wm = await cssImg("--wm");
    const imgs = {};
    await Promise.all(
      Object.values(slots).map((id) => {
        let f = (state.players.find((p) => p.id === id) || {}).foto;
        if (!f || !f.startsWith("data:image/")) return;
        return new Promise((res) => {
          let im = new Image();
          im.onload = () => {
            imgs[id] = im;
            res();
          };
          im.onerror = res;
          im.src = f;
        });
      }),
    );
    g.fillStyle = "#050f0a";
    g.fillRect(0, 0, W, H);
    let gr = g.createRadialGradient(W * 0.9, 0, 0, W * 0.9, 0, 1000);
    gr.addColorStop(0, "#173b2a");
    gr.addColorStop(1, "#050f0a");
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    g.save();
    g.strokeStyle = "rgba(43,227,106,.07)";
    g.lineWidth = 4;
    g.beginPath();
    g.arc(W, H * 0.62, 330, 0, Math.PI * 2);
    g.stroke();
    g.restore();
    if (logo) {
      g.drawImage(logo, 90, 34, 90, 90);
    }
    g.textBaseline = "alphabetic";
    g.textAlign = "left";
    g.fillStyle = INK;
    g.font = `800 50px ${ff}`;
    g.fillText("MI FÚTBOL", 200, 96);
    let mw = g.measureText("MI FÚTBOL ").width;
    g.fillStyle = LIME;
    g.fillText("JV32", 200 + mw, 96);
    g.fillStyle = INK;
    g.font = `800 104px ${ff}`;
    let t1 = o.pizarra ? "PIZARRA  " : `${MN(o.modalidad).toUpperCase()}  `;
    g.fillText(t1, 90, 215);
    let w1 = g.measureText(t1).width;
    g.fillStyle = LIME;
    g.fillText(
      o.pizarra ? `${MN(o.modalidad).toUpperCase()}` : fm,
      90 + w1,
      215,
    );
    g.fillStyle = MUT;
    g.font = `600 38px ${ff}`;
    g.fillText(
      clipTxt(
        g,
        `${o.rival ? "vs " + o.rival : ""}${o.fecha ? (o.rival ? "  ·  " : "") + fmtDate(o.fecha) : ""}`,
        W - 180,
      ),
      90,
      268,
    );
    let r = al.resultado;
    if (r) {
      let c =
          r.gf > r.gc
            ? ["rgba(74,222,128,.16)", "#4ade80", "Victoria"]
            : r.gf < r.gc
              ? ["rgba(251,113,133,.16)", "#fb7185", "Derrota"]
              : ["rgba(251,191,36,.16)", "#fbbf24", "Empate"],
        t = `${c[2]} ${r.gf}-${r.gc}`;
      g.font = `800 46px ${ff}`;
      let w = g.measureText(t).width + 48;
      rr(g, W - 90 - w, 52, w, 68, 18);
      g.fillStyle = c[0];
      g.fill();
      g.strokeStyle = c[1];
      g.lineWidth = 3;
      g.stroke();
      g.fillStyle = c[1];
      g.textAlign = "center";
      g.fillText(t, W - 90 - w / 2, 102);
      g.textAlign = "left";
    }
    const fx = 90,
      fy = 300,
      fw = 900,
      fh = 1085;
    g.save();
    rr(g, fx, fy, fw, fh, 36);
    g.clip();
    const fsal = o.modalidad === "fs";
    g.fillStyle = o.limpia ? (fsal ? "#1a5f8a" : "#17603a") : fsal ? "#0f3b57" : "#0e3a24";
    g.fillRect(fx, fy, fw, fh);
    if (o.limpia) {
    } else if (fsal) {
      g.fillStyle = "#12476a";
      for (let i = 0; i < 14; i++)
        if (i % 2) g.fillRect(fx + (i * fw) / 14, fy, fw / 14, fh);
    } else {
      for (let i = 0; i < 10; i++) {
        if (i % 2) {
          g.fillStyle = "#104228";
          g.fillRect(fx, fy + (i * fh) / 10, fw, fh / 10);
        }
      }
    }
    let vg = g.createRadialGradient(
      fx + fw / 2,
      fy + fh / 2,
      200,
      fx + fw / 2,
      fy + fh / 2,
      820,
    );
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,.35)");
    g.fillStyle = vg;
    if (!o.limpia) g.fillRect(fx, fy, fw, fh);
    if (wm && !o.limpia) {
      g.save();
      g.globalAlpha = 0.3;
      g.drawImage(wm, fx + fw / 2 - 210, fy + fh / 2 - 210, 420, 420);
      g.restore();
    }
    g.strokeStyle = "rgba(232,245,216,.78)";
    g.lineWidth = 5;
    g.strokeRect(fx + 45, fy + 45, fw - 90, fh - 90);
    g.beginPath();
    g.moveTo(fx + 45, fy + fh / 2);
    g.lineTo(fx + fw - 45, fy + fh / 2);
    g.stroke();
    g.beginPath();
    g.arc(fx + fw / 2, fy + fh / 2, 115, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "rgba(232,245,216,.8)";
    g.beginPath();
    g.arc(fx + fw / 2, fy + fh / 2, 8, 0, Math.PI * 2);
    g.fill();
    if (fsal) {
      let iw = fw - 90,
        ih = fh - 90,
        aw = iw * 0.76,
        ah = ih * 0.15,
        ax = fx + fw / 2 - aw / 2;
      g.beginPath();
      g.ellipse(fx + fw / 2, fy + 45, aw / 2, ah, 0, 0, Math.PI);
      g.stroke();
      g.beginPath();
      g.ellipse(fx + fw / 2, fy + fh - 45, aw / 2, ah, 0, Math.PI, Math.PI * 2);
      g.stroke();
      g.fillStyle = "rgba(232,245,216,.8)";
      [
        [fy + 45 + ih * 0.15],
        [fy + 45 + ih * 0.25],
        [fy + fh - 45 - ih * 0.15],
        [fy + fh - 45 - ih * 0.25],
      ].forEach((p) => {
        g.beginPath();
        g.arc(fx + fw / 2, p[0], 6, 0, Math.PI * 2);
        g.fill();
      });
    } else {
      g.strokeRect(fx + fw / 2 - 210, fy + 45, 420, 190);
      g.strokeRect(fx + fw / 2 - 95, fy + 45, 190, 75);
      g.strokeRect(fx + fw / 2 - 210, fy + fh - 45 - 190, 420, 190);
      g.strokeRect(fx + fw / 2 - 95, fy + fh - 45 - 75, 190, 75);
    }
    g.restore();
    g.save();
    rr(g, fx, fy, fw, fh, 36);
    g.strokeStyle = "#2f5e47";
    g.lineWidth = 3;
    g.stroke();
    g.restore();
    const maxW = o.modalidad === "11" ? 156 : 182,
      R0 = 46,
      gkId = o.pizarra ? "" : gkOf(al),
      capId = o.pizarra ? "" : al.capitan,
      GK = "#fbbf24";
    pos.forEach((s, i) => {
      let px = o.pizarra
          ? fx + (fw * s[1]) / 100
          : fx + (fw * (6 + s[1] * 0.88)) / 100,
        py = o.pizarra
          ? Math.min(fy + (fh * s[2]) / 100, fy + fh - 112)
          : fy + (fh * (6 + s[2] * 0.86)) / 100,
        id = slots[i];
      if (!id) {
        if (o.pizarra) return;
        g.beginPath();
        g.arc(px, py, R0, 0, Math.PI * 2);
        g.fillStyle = "rgba(5,15,10,.45)";
        g.fill();
        g.setLineDash([9, 8]);
        g.strokeStyle = LIME;
        g.lineWidth = 4;
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = LIME;
        g.font = `800 32px ${ff}`;
        g.textAlign = "center";
        g.fillText(s[0], px, py + 11);
        return;
      }
      g.beginPath();
      g.arc(px, py, R0 + 8, 0, Math.PI * 2);
      g.globalAlpha = 0.25;
      g.fillStyle = pc(id);
      g.fill();
      g.globalAlpha = 1;
      g.beginPath();
      g.arc(px, py, R0, 0, Math.PI * 2);
      g.fillStyle = pc(id);
      g.fill();
      if (imgs[id]) {
        g.save();
        g.beginPath();
        g.arc(px, py, R0 - 3, 0, Math.PI * 2);
        g.clip();
        let im = imgs[id],
          sc = Math.max((R0 * 2 - 6) / im.width, (R0 * 2 - 6) / im.height),
          w = im.width * sc,
          h = im.height * sc;
        g.drawImage(im, px - w / 2, py - h / 2, w, h);
        g.restore();
      } else {
        g.fillStyle = inkOn(pc(id));
        g.font = `800 58px ${ff}`;
        g.textAlign = "center";
        g.fillText(dn(id) || (nm(id)[0] || "?").toUpperCase(), px, py + 19);
      }
      g.beginPath();
      g.arc(px, py, R0, 0, Math.PI * 2);
      g.strokeStyle = "#d6ffe4";
      g.lineWidth = 5;
      g.stroke();
      if (imgs[id] && dn(id)) {
        let bx = px + R0 * 0.72,
          by = py - R0 * 0.72;
        g.beginPath();
        g.arc(bx, by, 24, 0, Math.PI * 2);
        g.fillStyle = pc(id);
        g.fill();
        g.lineWidth = 4;
        g.strokeStyle = "#03140a";
        g.stroke();
        g.fillStyle = inkOn(pc(id));
        g.font = `800 30px ${ff}`;
        g.textAlign = "center";
        g.fillText(dn(id), bx, by + 10);
      }
      if (id === capId) {
        let bx = px - R0 * 0.72,
          by = py - R0 * 0.72;
        g.beginPath();
        g.arc(bx, by, 24, 0, Math.PI * 2);
        g.fillStyle = "#ffffff";
        g.fill();
        g.lineWidth = 4;
        g.strokeStyle = "#03140a";
        g.stroke();
        g.fillStyle = "#03140a";
        g.font = `800 30px ${ff}`;
        g.textAlign = "center";
        g.fillText("C", bx, by + 10);
      }
      g.font = `700 34px ${ff}`;
      let t = clipName(g, nm(id), maxW),
        w = g.measureText(t).width + 28;
      g.fillStyle = "rgba(5,15,10,.9)";
      rr(g, px - w / 2, py + R0 + 10, w, 44, 14);
      g.fill();
      g.fillStyle = INK;
      g.textAlign = "center";
      g.fillText(t, px, py + R0 + 10 + 33);
    });
    if (o.paint) {
      g.save();
      rr(g, fx, fy, fw, fh, 36);
      g.clip();
      o.paint(g, fx, fy, fw, fh);
      g.restore();
    }
    let sup = (o.players || []).filter((p) => !p.starter).map((p) => nm(p.id));
    if (sup.length) {
      g.textAlign = "left";
      g.font = `800 32px ${ff}`;
      g.fillStyle = LIME;
      g.fillText("SUPLENTES", 90, 1440);
      g.font = `600 34px ${ff}`;
      g.fillStyle = INK;
      let line = "",
        y = 1482;
      sup.forEach((n) => {
        let tt = line ? line + "  ·  " + n : n;
        if (g.measureText(tt).width > W - 180 && line) {
          g.fillText(line, 90, y);
          y += 40;
          line = n;
        } else line = tt;
      });
      if (line) g.fillText(clipTxt(g, line, W - 180), 90, y);
    }
    return cv;
  }
  async function imgExport(which) {
    let o;
    if (which === "draft") {
      let d = state.draft,
        gfv = ($("gf") || { value: "" }).value.trim(),
        gcv = ($("gc") || { value: "" }).value.trim(),
        al = JSON.parse(JSON.stringify(d.alineacion));
      if (gfv || gcv)
        al.resultado = { gf: parseInt(gfv) || 0, gc: parseInt(gcv) || 0 };
      else delete al.resultado;
      o = {
        modalidad: state.mode,
        fecha: ($("date") || {}).value || d.fecha,
        rival: (($("rival") || {}).value || d.rival || "").trim(),
        players: d.players,
        alineacion: al,
      };
    } else {
      let m = state.matches.find((x) => x.id === which);
      if (!m) return;
      o = {
        modalidad: m.modalidad,
        fecha: m.fecha,
        rival: m.rival,
        players: entries(m),
        alineacion: m.alineacion || {},
      };
    }
    if (!Object.keys(o.alineacion.slots || {}).length) {
      note(
        which === "draft"
          ? "Coloca primero a los titulares en el campo y luego descarga la imagen."
          : "Este partido no tiene posiciones. Edítalo, colócalos en el campo y vuelve a descargar.",
      );
      return;
    }
    note("Preparando imagen…", true);
    try {
      await Promise.all([
        document.fonts.load('800 40px "Barlow Condensed"'),
        document.fonts.load('700 30px "Barlow Condensed"'),
        document.fonts.load('600 30px "Barlow Condensed"'),
      ]);
    } catch (e) {}
    let cv = await drawLineup(o),
      blob = await new Promise((r) => cv.toBlob(r, "image/png")),
      slug = (s) =>
        String(s || "")
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .replace(/[^a-z0-9]+/gi, "-")
          .replace(/^-|-$/g, "")
          .toLowerCase(),
      fname = `alineacion-${MFN(o.modalidad)}-${slug(o.rival) || "partido"}-${o.fecha || ""}.png`;
    note("");
    let file = new File([blob], fname, { type: "image/png" });
    if (
      navigator.canShare &&
      navigator.canShare({ files: [file] }) &&
      window.matchMedia("(pointer:coarse)").matches
    ) {
      try {
        await navigator.share({ files: [file], title: "Alineación" });
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return;
      }
    }
    let a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    note("Imagen descargada.", true);
  }
  function resetDraft(m) {
    state.draft = {
      fecha: m?.fecha || new Date().toISOString().slice(0, 10),
      rival: m?.rival || "",
      gf: m?.alineacion?.resultado ? String(m.alineacion.resultado.gf) : "",
      gc: m?.alineacion?.resultado ? String(m.alineacion.resultado.gc) : "",
      players: m ? entries(m).map((x) => ({ ...x })) : [],
      alineacion:
        m?.alineacion && typeof m.alineacion === "object"
          ? JSON.parse(JSON.stringify(m.alineacion))
          : blankAlign(),
    };
    state.selectedSlot = null;
    let al = state.draft.alineacion;
    if (!formations[state.mode][al.formation])
      al.formation = Object.keys(formations[state.mode])[0];
    if (!al.slots || typeof al.slots !== "object") al.slots = {};
    render();
  }
  async function savePlayer(e) {
    e.preventDefault();
    let form = e.target,
      name = form.nombre.value.trim(),
      file = form.foto.files[0],
      original = state.players.find((p) => p.id === state.playerId),
      foto = original?.foto || "";
    if (file) foto = await resize(file);
    let dv = String(form.dorsal.value || "").trim(),
      dn = parseInt(dv);
    if (dv && !(dn >= 0 && dn <= 99)) throw Error("El dorsal tiene que ser un número del 0 al 99.");
    let payload = { modalidad: state.mode, nombre: name, foto, dorsal: dv ? dn : null };
    if (!original && curTeam()) payload.equipo_id = curTeam();
    if (!original && full("p")) {
      $("modal").classList.add("hidden");
      showInfo("pro");
      return;
    }
    if (!original) {
      payload.id = crypto.randomUUID();
      payload.owner_id = (await db.auth.getUser()).data.user.id;
    }
    const send = () =>
      original
        ? db
            .from("futbol_personal_jugadores")
            .update(payload)
            .eq("id", original.id)
        : db.from("futbol_personal_jugadores").insert(payload);
    let { error } = await send(),
      sinDorsal = false;
    /* Si la base de datos aún no tiene la columna del dorsal, se guarda el resto. */
    if (error && /dorsal/i.test(error.message || "")) {
      delete payload.dorsal;
      sinDorsal = !!dv;
      ({ error } = await send());
    }
    if (error) throw error;
    $("modal").classList.add("hidden");
    state.playerId = null;
    await load();
    note(
      sinDorsal
        ? "Jugador guardado, pero el dorsal aún no se puede guardar: falta activarlo en el servidor."
        : "Jugador guardado.",
      !sinDorsal,
    );
  }
  async function resize(file) {
    if (!file.type.startsWith("image/"))
      throw Error("Selecciona una imagen válida.");
    if (file.size > 25 * 1024 * 1024)
      throw Error("La foto es demasiado grande. Prueba con otra.");
    let b = await createImageBitmap(file),
      canvas = document.createElement("canvas"),
      r = Math.min(1, 400 / Math.max(b.width, b.height));
    canvas.width = Math.max(1, Math.round(b.width * r));
    canvas.height = Math.max(1, Math.round(b.height * r));
    canvas.getContext("2d").drawImage(b, 0, 0, canvas.width, canvas.height);
    b.close();
    let q = 0.72,
      out = canvas.toDataURL("image/jpeg", q);
    while (out.length > 85000 && q > 0.3) {
      q -= 0.1;
      out = canvas.toDataURL("image/jpeg", q);
    }
    if (out.length > 85000)
      throw Error("La foto es demasiado grande. Prueba con otra.");
    return out;
  }
  async function saveMatch() {
    let d = state.draft;
    d.fecha = $("date").value;
    d.rival = $("rival").value.trim();
    if (!d.fecha || !d.rival) return note("Indica fecha y rival.");
    {
      let gfv = $("gf").value.trim(),
        gcv = $("gc").value.trim();
      if (gfv !== "" || gcv !== "")
        d.alineacion.resultado = {
          gf: Math.min(99, Math.max(0, parseInt(gfv) || 0)),
          gc: Math.min(99, Math.max(0, parseInt(gcv) || 0)),
        };
      else delete d.alineacion.resultado;
    }
    if (d.players.length < modeCount())
      return note(`Necesitas al menos ${modeCount()} convocados.`);
    if (d.players.filter((x) => x.starter).length !== modeCount())
      return note(`Selecciona exactamente ${modeCount()} titulares.`);
    {
      let al = d.alineacion,
        conv = new Set(d.players.map((x) => x.id)),
        ok = (id) => id && conv.has(id),
        byMin = (a, b) => (Number(a.m) || 0) - (Number(b.m) || 0);
      al.cambios = mdList(al, "cambios")
        .filter((z) => ok(z.sale) || ok(z.entra))
        .map((z) => ({ ...z, m: Number(z.m) || 0, sale: ok(z.sale) ? z.sale : "", entra: ok(z.entra) ? z.entra : "" }))
        .sort(byMin);
      al.tarjetas = mdList(al, "tarjetas")
        .filter((z) => ok(z.pid))
        .map((z) => ({ ...z, m: Number(z.m) || 0, c: z.c === "r" ? "r" : "a" }))
        .sort(byMin);
      al.cambiosR = mdList(al, "cambiosR")
        .filter((z) => z.sale || z.entra)
        .map((z) => ({ ...z, m: Number(z.m) || 0 }))
        .sort(byMin);
      al.tarjetasR = mdList(al, "tarjetasR")
        .filter((z) => z.d || z.n)
        .map((z) => ({ ...z, m: Number(z.m) || 0, c: z.c === "r" ? "r" : "a" }))
        .sort(byMin);
      ["cambios", "tarjetas", "cambiosR", "tarjetasR"].forEach((k) => {
        if (!al[k].length) delete al[k];
      });
      ["capitan", "portero"].forEach((k) => {
        if (al[k] && !conv.has(al[k])) delete al[k];
      });
    }
    let starters = new Set(d.players.filter((x) => x.starter).map((x) => x.id));
    d.alineacion.slots = Object.fromEntries(
      Object.entries(d.alineacion.slots || {}).filter(([, pid]) =>
        starters.has(pid),
      ),
    );
    let payload = {
      modalidad: state.mode,
      fecha: d.fecha,
      rival: d.rival,
      participaciones: JSON.stringify(
        d.players.map((x) => ({
          ...x,
          minutes: Number(x.minutes) || 0,
          goals: Number(x.goals) || 0,
          nombre: name(x.id),
        })),
      ),
      alineacion: JSON.stringify(d.alineacion),
    };
    if (!state.editing && full("m")) return showInfo("pro");
    if (!state.editing) {
      payload.id = crypto.randomUUID();
      payload.owner_id = (await db.auth.getUser()).data.user.id;
      if (curTeam()) payload.equipo_id = curTeam();
    }
    state.busy = true;
    render();
    let result = state.editing
      ? await db
          .from("futbol_personal_partidos")
          .update(payload)
          .eq("id", state.editing)
      : await db.from("futbol_personal_partidos").insert(payload);
    state.busy = false;
    if (result.error) return note(result.error.message);
    state.draft = null;
    state.editing = null;
    note("Partido, formación y posiciones guardados.", true);
    await load();
  }
  async function remove(table, id) {
    if (!confirm("¿Borrar este registro?")) return;
    let result = await db.from(table).delete().eq("id", id);
    if (result.error) return note(result.error.message);
    if (table === "futbol_personal_partidos" && liveRows[id])
      await db.from("directos").delete().eq("partido_id", id);
    await load();
    note("Registro borrado.", true);
  }
  function change(field, id, input) {
    let d = state.draft,
      x = d.players.find((p) => p.id === id);
    if (field === "called" || field === "starter") {
      if (input.checked && !x) {
        if (
          MODES[state.mode].cap &&
          d.players.length >= MODES[state.mode].cap
        ) {
          input.checked = false;
          return note(
            `Máximo ${MODES[state.mode].cap} convocados en ${MN().toLowerCase()}.`,
          );
        }
        x = { id, nombre: name(id), minutes: 0, goals: 0, starter: false };
        d.players.push(x);
      }
      if (field === "called" && !input.checked) {
        d.players = d.players.filter((p) => p.id !== id);
        Object.keys(d.alineacion.slots || {}).forEach((k) => {
          if (d.alineacion.slots[k] === id) delete d.alineacion.slots[k];
        });
      }
      if (field === "starter" && x) {
        if (
          input.checked &&
          d.players.filter((p) => p.starter).length >= modeCount()
        ) {
          input.checked = false;
          return note(`Solo ${modeCount()} titulares como máximo.`);
        }
        x.starter = input.checked;
        if (!input.checked)
          Object.keys(d.alineacion.slots || {}).forEach((k) => {
            if (d.alineacion.slots[k] === id) delete d.alineacion.slots[k];
          });
      }
      return render();
    }
    if (x) x[field] = input.value;
  }

  let amode = "login",
    recovering = /type=recovery/.test(location.hash),
    curUser = null,
    curEmail = "",
    plan = "gratis",
    proHasta = null,
    pruebaHasta = null,
    stripeCliente = false,
    club = null,
    perfil = null,
    delStep = false;
  const AM = {
    login: ["Entrar", "Entrando…", "Acceso"],
    signup: ["Crear mi cuenta", "Creando…", "Crear cuenta"],
    reset: ["Enviar enlace", "Enviando…", "Recuperar contraseña"],
    newpass: ["Guardar contraseña", "Guardando…", "Nueva contraseña"],
  };
  function loginNote(t, ok) {
    $("loginmsg").innerHTML = t
      ? `<div class="message${ok ? " ok" : ""}" role="${ok ? "status" : "alert"}"><span>${esc(t)}</span></div>`
      : "";
  }
  function setAm(m) {
    amode = m;
    let f = $("auth");
    document.querySelectorAll(".seg [data-am]").forEach((b) => {
      let on =
        b.dataset.am === m || (m === "reset" && b.dataset.am === "login");
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", on);
    });
    $("kick").textContent = AM[m][2];
    f.querySelector("[data-f=mail]").classList.toggle(
      "hidden",
      m === "newpass",
    );
    f.querySelector("[data-f=pw]").classList.toggle("hidden", m === "reset");
    f.querySelector("[data-f=pw2]").classList.toggle(
      "hidden",
      m !== "signup" && m !== "newpass",
    );
    f.querySelector("[data-f=terms]").classList.toggle(
      "hidden",
      m !== "signup",
    );
    $("forgot").classList.toggle("hidden", m !== "login");
    f.password.autocomplete =
      m === "login" ? "current-password" : "new-password";
    $("goBtn").textContent = AM[m][0];
    loginNote("");
  }
  function authMsg(m) {
    if (/captcha/i.test(m || ""))
      return "No se pudo verificar que eres una persona. Recarga la página e inténtalo de nuevo.";
    if (/Failed to fetch|NetworkError|Load failed/i.test(m || ""))
      return "Sin conexión con el servidor. Revisa tu internet.";
    if (/Invalid login credentials/i.test(m))
      return "Email o contraseña incorrectos.";
    if (/not confirmed/i.test(m))
      return "Aún no has confirmado tu email. Revisa tu correo.";
    if (/already registered|already been registered/i.test(m))
      return "Ese email ya tiene cuenta. Prueba a entrar.";
    if (/rate limit|too many|security purposes/i.test(m))
      return "Demasiados intentos. Espera unos minutos y vuelve a probar.";
    if (/weak|at least|short/i.test(m))
      return "La contraseña es demasiado débil (mínimo 8 caracteres).";
    if (/different from the old/i.test(m))
      return "La nueva contraseña debe ser distinta a la anterior.";
    return m || "No se pudo completar. Inténtalo de nuevo.";
  }
  /* Testers: el servidor activa o termina la prueba gratis del plan Pro (supabase-testers.sql) */
  async function revisarPrueba() {
    try {
      let r = await db.rpc("revisar_prueba_pro");
      return (r && !r.error && r.data) || "";
    } catch (e) {
      return "";
    }
  }
  const diasQuedan = (iso) => Math.max(1, Math.ceil((Date.parse(iso) - Date.now()) / 864e5));
  /* Si la app se cerró con un directo abierto (Android la cierra a veces cuando se
     usa la cámara o pasa mucho rato en segundo plano), al volver se abre otra vez ese directo. */
  const DIR_KEY = "mf_directo_abierto";
  let dirAbierto = (() => {
      try {
        return localStorage.getItem(DIR_KEY) || "";
      } catch (e) {
        return "";
      }
    })(),
    dirGuardado = dirAbierto;
  function directoRecuerda() {
    let v = state.live || "";
    if (v === dirGuardado) return;
    dirGuardado = v;
    try {
      if (v) localStorage.setItem(DIR_KEY, v);
      else localStorage.removeItem(DIR_KEY);
    } catch (e) {}
  }
  function directoReabre() {
    let id = dirAbierto;
    dirAbierto = "";
    if (!id || state.live || state.draft || viendo) return;
    let x = liveRows[id];
    if (!liveOn(x) || !state.matches.some((m) => m.id === id)) return;
    openLive(id)
      .then(() => state.live === id && note("Has vuelto al directo del partido. Todo lo apuntado sigue aquí.", true))
      .catch(() => {});
  }
  async function enterApp() {
    $("login").classList.add("hidden");
    $("app").classList.remove("hidden");
    try {
      let prueba = await revisarPrueba();
      await loadPlan();
      await loadClub();
      if (!(await dispRevisa())) return;
      if (prueba === "activada" && pruebaHasta)
        note(`¡Gracias por probar la app! Tienes el plan Pro gratis en modo prueba durante ${diasQuedan(pruebaHasta)} días, hasta el ${fechaLarga(pruebaHasta)}.`, true);
      else if (prueba === "terminada" && plan !== "pro")
        note("Tu prueba del plan Pro ha terminado. Ahora tienes el plan gratuito.");
      await load();
      if (sesPerdida) return;
      appCargada = true;
      directoReabre();
      if (tutPending() && !state.players.length && !state.matches.length)
        tutOpen();
      else if (tutPending())
        try {
          localStorage.setItem(tutKey(), "1");
        } catch (e) {}
      novedadesRevisa();
      if (/[?&]pro=ok/.test(location.search)) {
        history.replaceState(null, "", location.pathname);
        payPending = true;
        refreshPlan();
      } else if (/[?&]club=ok/.test(location.search)) {
        history.replaceState(null, "", location.pathname);
        clubPending = true;
        refreshClub();
      } else if (clubInvita) {
        /* Enlace de invitación ?club=<código> que comparte el encargado */
        history.replaceState(null, "", location.pathname);
        if (!club) {
          showInfo("club");
          let i = $("clubCod");
          if (i) i.value = clubInvita;
        }
      }
    } catch (e) {
      note(e.message);
    }
  }
  /* Captcha opcional (Cloudflare Turnstile): solo se activa si config.js tiene turnstileSiteKey */
  let capToken = "",
    capId = null;
  function capOpt() {
    let t = capToken;
    capToken = "";
    if (capId !== null && window.turnstile)
      try {
        window.turnstile.reset(capId);
      } catch (e) {}
    return t ? { captchaToken: t } : {};
  }
  function initCaptcha() {
    if (!c.turnstileSiteKey) return;
    let box = $("captcha");
    if (!box) return;
    box.classList.remove("hidden");
    let s = document.createElement("script");
    s.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => {
      capId = window.turnstile.render(box, {
        sitekey: c.turnstileSiteKey,
        theme: "dark",
        callback: (t) => {
          capToken = t;
        },
        "expired-callback": () => {
          capToken = "";
        },
      });
    };
    document.head.appendChild(s);
  }
  initCaptcha();
  async function loadPlan() {
    try {
      let r = await db.from("perfiles").select("*");
      let f = (r.data && r.data[0]) || {};
      plan = f.plan || "gratis";
      proHasta = f.pro_hasta || null;
      pruebaHasta = f.prueba_hasta || null;
      stripeCliente = !!f.stripe_customer;
      /* Nombre y foto del entrenador (supabase-escudo.sql): sin esas columnas, no se ofrece */
      perfil = "foto" in f ? { nombre: f.nombre || "", foto: f.foto || "" } : null;
    } catch (e) {}
    pintarCuenta();
  }
  /* Plan Club (supabase-clubes.sql): el club paga y sus entrenadores tienen el Pro.
     Cada entrenador solo ve el nombre de su club; el encargado ve además el código y los emails. */
  async function loadClub() {
    try {
      let r = await db.rpc("mi_club");
      club = (r && !r.error && r.data) || null;
    } catch (e) {
      club = null;
    }
    pintarEscudo();
  }
  /* Escudo del club junto al logo, para todos los entrenadores del club */
  function pintarEscudo() {
    let im = $("clubEsc");
    if (!im) return;
    let e = club && club.escudo;
    im.classList.toggle("hidden", !e);
    im.parentNode.classList.toggle("con-esc", !!e);
    if (e) {
      im.src = e;
      im.alt = "Escudo de " + club.nombre;
    } else im.removeAttribute("src");
  }
  /* Imagen pequeña para el escudo o la foto: PNG si cabe (el escudo conserva el fondo
     transparente) y si no, JPEG sobre blanco. */
  async function imagenPeque(file, lado, limite, png) {
    if (!file.type.startsWith("image/"))
      throw Error("Selecciona una imagen válida.");
    if (file.size > 25 * 1024 * 1024)
      throw Error("La imagen es demasiado grande. Prueba con otra.");
    let b = await createImageBitmap(file);
    try {
      for (let l = lado; l >= 96; l = Math.round(l * 0.75)) {
        let cv = document.createElement("canvas"),
          r = Math.min(1, l / Math.max(b.width, b.height));
        cv.width = Math.max(1, Math.round(b.width * r));
        cv.height = Math.max(1, Math.round(b.height * r));
        let g = cv.getContext("2d");
        if (png) {
          g.drawImage(b, 0, 0, cv.width, cv.height);
          let out = cv.toDataURL("image/png");
          if (out.length <= limite) return out;
        }
        g.fillStyle = "#fff";
        g.fillRect(0, 0, cv.width, cv.height);
        g.drawImage(b, 0, 0, cv.width, cv.height);
        for (let q = 0.8; q > 0.3; q -= 0.15) {
          let out = cv.toDataURL("image/jpeg", q);
          if (out.length <= limite) return out;
        }
      }
    } finally {
      b.close();
    }
    throw Error("La imagen es demasiado grande. Prueba con otra.");
  }
  const CLUB_ERR = {
    YA_EN_CLUB: "Ya estás en un club. Para cambiar de club, sal antes del tuyo.",
    CODIGO_NO_VALIDO: "Ese código no es de ningún club. Revisa que esté bien escrito.",
    CLUB_LLENO: "Ese club ya tiene todas sus plazas ocupadas. Avisa al encargado del club.",
    ADMIN_NO_PUEDE_SALIR: "Eres el encargado del club: no puedes salir de él. Si ya no lo usáis, cancela la suscripción y borra el club.",
    CLUB_PAGADO: "El club tiene una suscripción en marcha. Cancélala antes en «Gestionar la suscripción del club».",
    CLUB_NOMBRE: "Escribe el nombre del club (entre 2 y 60 letras).",
    NO_ERES_ENCARGADO: "Solo el encargado del club puede hacer eso.",
    NO_ERES_SUPERVISOR: "Solo el supervisor de un club pagado puede ver los datos de los entrenadores.",
    NO_COMPARTE: "Ese entrenador aún no ha aceptado compartir sus datos con el supervisor.",
    NO_EN_CLUB: "Esa persona ya no está en el club.",
    IMAGEN_NO_VALIDA: "Esa imagen no vale. Prueba con otra (JPG o PNG).",
    NOMBRE_LARGO: "El nombre es demasiado largo (máximo 40 letras).",
  };
  const clubMsg = (e) => {
    let m = (e && e.message) || "";
    let k = Object.keys(CLUB_ERR).find((x) => m.includes(x));
    return k ? CLUB_ERR[k] : authMsg(m);
  };
  async function clubRpc(n, args, antiguo) {
    let r = await db.rpc(n, args);
    /* Servidor aún sin supabase-supervisor.sql: unirse_club solo acepta el código */
    if (antiguo && r && r.error && /PGRST202|could not find the function|schema cache/i.test((r.error.code || "") + " " + (r.error.message || "")))
      r = await db.rpc(n, { codigo: args.codigo });
    if (r && r.error) {
      note(clubMsg(r.error));
      return null;
    }
    await loadClub();
    await loadPlan();
    render();
    showInfo("club");
    return r || {};
  }
  /* Al volver de pagar el club en Stripe, se espera a que el webhook lo active */
  let clubPending = false;
  const clubInvita = ((new URLSearchParams(location.search).get("club") || "").match(/^[A-Za-z0-9]{6,14}$/) || [""])[0].replace(/^ok$/i, "");
  async function refreshClub() {
    clubPending = false;
    for (let i = 0; i < 6; i++) {
      await loadClub();
      if (club && club.activo) {
        await loadPlan();
        render();
        showInfo("club");
        note("¡Plan Club activado! Ya podéis usar el Pro todos los entrenadores del club.", true);
        return;
      }
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
  /* Tras pagar en Stripe, el plan se activa en unos segundos: se vuelve a mirar al regresar a la app */
  let payPending = false;
  async function refreshPlan() {
    if (!curUser || plan === "pro") return;
    for (let i = 0; i < 6 && plan !== "pro"; i++) {
      await loadPlan();
      if (plan === "pro") {
        payPending = false;
        $("info").classList.add("hidden");
        render();
        note("¡Plan Pro activado! Ya no tienes límites.", true);
        return;
      }
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
  /* Al volver del portal de Stripe (p. ej. tras cancelar) se vuelve a mirar el plan y se refresca Mi cuenta */
  let portalPending = false;
  async function refreshPortal() {
    portalPending = false;
    for (let i = 0; i < 3; i++) {
      let antes = plan + proHasta;
      await loadPlan();
      if (plan + proHasta !== antes) {
        render();
        if (!$("info").classList.contains("hidden") && $("infoTitle").textContent === "Mi cuenta") showInfo("account");
        return;
      }
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (clubPending) refreshClub();
    else if (payPending) refreshPlan();
    else if (portalPending) refreshPortal();
  });
  const enPrueba = () => plan === "pro" && !!pruebaHasta && !stripeCliente;
  const fechaLarga = (iso) =>
    new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
  function useUser(u) {
    curUser = u.id;
    curEmail = u.email || "";
    try {
      let st = localStorage.getItem("mf_pizarra_uid");
      if (!st) localStorage.setItem("mf_pizarra_uid", u.id);
      else if (st !== u.id) {
        localStorage.removeItem("mf_pizarra_v1");
        Object.keys(MODES).forEach((k) => {
          if (boardState[k]) {
            boardState[k] = blankBoard();
          }
        });
        localStorage.setItem("mf_pizarra_uid", u.id);
      }
    } catch (e) {}
  }
  const full = (k) =>
    plan !== "pro" &&
    (k === "p"
      ? roster().length >= MODES[state.mode].maxP
      : games().length >= MODES[state.mode].maxM);
  $("auth").addEventListener("submit", (e) => e.preventDefault());
  $("auth")
    .closest(".panel")
    .addEventListener("click", async (e) => {
      let am = e.target.closest("[data-am]");
      if (am) {
        e.preventDefault();
        setAm(am.dataset.am);
        return;
      }
      let bt = e.target.closest("[data-auth]");
      if (!bt) return;
      e.preventDefault();
      if (bt.disabled) return;
      let f = $("auth"),
        email = f.email.value.trim(),
        pw = f.password.value,
        m = amode;
      if (m !== "newpass" && !/^\S+@\S+\.\S+$/.test(email))
        return loginNote("Escribe un email válido.");
      if (m === "login" && !pw) return loginNote("Escribe tu contraseña.");
      if (m === "signup" || m === "newpass") {
        if (pw.length < 8)
          return loginNote("La contraseña debe tener al menos 8 caracteres.");
        if (pw !== f.password2.value)
          return loginNote("Las contraseñas no coinciden.");
      }
      if (m === "signup" && !f.terms.checked)
        return loginNote(
          "Para crear la cuenta debes aceptar los términos y la política de privacidad.",
        );
      bt.disabled = true;
      bt.textContent = AM[m][1];
      let r;
      try {
        if (m === "login")
          r = await db.auth.signInWithPassword({
            email,
            password: pw,
            options: capOpt(),
          });
        else if (m === "signup")
          r = await db.auth.signUp({
            email,
            password: pw,
            options: {
              emailRedirectTo: location.origin + location.pathname,
              data: {
                accepted_terms_at: new Date().toISOString(),
                terms_version: TERMS_VERSION,
              },
              ...capOpt(),
            },
          });
        else if (m === "reset")
          r = await db.auth.resetPasswordForEmail(email, {
            redirectTo: location.origin + location.pathname,
            ...capOpt(),
          });
        else r = await db.auth.updateUser({ password: pw });
      } catch (x) {
        r = { error: x };
      }
      bt.disabled = false;
      bt.textContent = AM[m][0];
      if (r.error) return loginNote(authMsg(r.error.message || ""));
      if (m === "signup" && !(r.data && r.data.session))
        return loginNote(
          "Cuenta creada. Te hemos enviado un email: pulsa el enlace para confirmarla y después entra.",
          true,
        );
      if (m === "reset")
        return loginNote(
          "Si ese email tiene cuenta, te hemos enviado un enlace para cambiar la contraseña.",
          true,
        );
      if (m === "newpass") {
        recovering = false;
        try {
          history.replaceState(null, "", location.pathname);
        } catch (x) {}
        f.reset();
        setAm("login");
        enterApp();
        return;
      }
      loginNote("");
    });
  async function doLogout() {
    saliendo = true;
    try {
      localStorage.removeItem("mf_sesion_copia");
      localStorage.removeItem("mf_directo_abierto");
    } catch (e) {}
    if (dispOk)
      try {
        await Promise.race([db.from("dispositivos").delete().eq("id", dispId()), new Promise((r) => setTimeout(r, 1500))]);
      } catch (e) {}
    try {
      await Promise.race([
        db.auth.signOut({ scope: "local" }),
        new Promise((r) => setTimeout(r, 2500)),
      ]);
    } catch (e) {}
    try {
      Object.keys(localStorage)
        .filter((k) => /^sb-.*-auth-token/.test(k))
        .forEach((k) => localStorage.removeItem(k));
    } catch (e) {}
    location.reload();
  }
  $("logout").onclick = doLogout;
  /* Buscador: jugadores y partidos de todas las modalidades */
  const fold = (t) =>
    String(t || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  function closeSearch() {
    let d = $("srch");
    if (d) d.remove();
  }
  function searchResults(q) {
    q = fold(q).trim();
    if (!q) return [];
    let out = [];
    state.players.forEach((p) => {
      if (fold(p.nombre).includes(q))
        out.push({
          k: "p",
          id: p.id,
          mod: p.modalidad,
          t: p.nombre,
          s:
            MODES[p.modalidad].name +
            (teamsOf(p.modalidad).length > 1 ? " · " + teamName(p.modalidad, teamOf(p)) : "") +
            " · Plantilla",
          foto: p.foto,
        });
    });
    state.matches.forEach((m) => {
      if (
        fold(m.rival).includes(q) ||
        fold(m.fecha).includes(q) ||
        fold(fmtDate(m.fecha)).includes(q)
      )
        out.push({
          k: "m",
          id: m.id,
          mod: m.modalidad,
          t: "vs " + m.rival,
          s:
            MODES[m.modalidad].name +
            (teamsOf(m.modalidad).length > 1 ? " · " + teamName(m.modalidad, teamOf(m)) : "") +
            " · " + fmtDate(m.fecha),
        });
    });
    return out.slice(0, 40);
  }
  function drawSearch() {
    let q = $("sq").value,
      box = $("sres"),
      r = searchResults(q);
    box.innerHTML = "";
    if (!q.trim()) {
      box.innerHTML =
        '<p class="muted">Escribe el nombre de un jugador, un rival o una fecha.</p>';
      return;
    }
    if (!r.length) {
      box.innerHTML =
        '<p class="muted">No hay resultados para «' + esc(q) + "».</p>";
      return;
    }
    r.forEach((x) => {
      let b = document.createElement("button");
      b.type = "button";
      b.className = "sitem";
      b.dataset.k = x.k;
      b.dataset.id = x.id;
      b.innerHTML =
        (x.k === "p"
          ? avatar({ foto: x.foto, nombre: x.t })
          : '<div class="avatar">⚽</div>') +
        '<span class="info"><strong>' +
        esc(x.t) +
        "</strong><small>" +
        esc(x.s) +
        "</small></span>";
      box.appendChild(b);
    });
  }
  function goToResult(k, id) {
    let it = (k === "p" ? state.players : state.matches).find(
      (x) => x.id === id,
    );
    if (!it || !leaveDraft()) return;
    closeSearch();
    state.mode = it.modalidad;
    if (teamOf(it)) pickTeam(teamOf(it));
    state.tab = k === "p" ? "plantilla" : "partidos";
    state.draft = null;
    render();
    let el = document.querySelector(
      k === "p" ? '[data-pid="' + id + '"]' : '[data-mid="' + id + '"]',
    );
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.classList.add("flash");
      setTimeout(() => el.classList.remove("flash"), 2400);
    }
  }
  function openSearch() {
    closeSearch();
    let d = document.createElement("div");
    d.id = "srch";
    d.setAttribute("role", "dialog");
    d.setAttribute("aria-modal", "true");
    d.setAttribute("aria-label", "Buscar");
    d.innerHTML =
      '<div class="spanel"><div class="sbar"><input id="sq" type="search" placeholder="Buscar jugador, rival o fecha" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Buscar"><button type="button" class="ib" data-sclose aria-label="Cerrar búsqueda">×</button></div><div id="sres"></div></div>';
    document.body.appendChild(d);
    drawSearch();
    $("sq").focus();
  }
  document.addEventListener("input", (e) => {
    if (e.target.id === "sq") drawSearch();
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest && e.target.closest("#sbtn")) return openSearch();
    if (
      e.target.id === "srch" ||
      (e.target.closest && e.target.closest("[data-sclose]"))
    )
      return closeSearch();
    let it = e.target.closest && e.target.closest("#srch .sitem");
    if (it) goToResult(it.dataset.k, it.dataset.id);
  });
  document.addEventListener("keydown", (e) => {
    if (!$("srch")) return;
    if (e.key === "Escape") closeSearch();
    if (e.key === "Enter" && e.target.id === "sq") {
      e.preventDefault();
      let f = document.querySelector("#srch .sitem");
      if (f) goToResult(f.dataset.k, f.dataset.id);
    }
  });
  function closeZoom() {
    let z = $("zoom");
    if (z) z.remove();
  }
  function openZoom(img) {
    closeZoom();
    let d = document.createElement("div");
    d.id = "zoom";
    d.setAttribute("role", "dialog");
    d.setAttribute("aria-modal", "true");
    d.setAttribute("aria-label", "Foto ampliada");
    let big = document.createElement("img");
    big.src = img.src;
    big.alt = img.alt.replace("Ampliar foto de ", "");
    let cap = document.createElement("div");
    cap.className = "zcap";
    cap.textContent = big.alt;
    let x = document.createElement("button");
    x.type = "button";
    x.className = "zx";
    x.setAttribute("aria-label", "Cerrar");
    x.textContent = "×";
    d.append(big, cap, x);
    d.addEventListener("click", closeZoom);
    document.body.appendChild(d);
    x.focus();
  }
  document.addEventListener("click", (e) => {
    let im = e.target.closest && e.target.closest("img.avatar.zoomable");
    if (im) openZoom(im);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeZoom();
    if (
      (e.key === "Enter" || e.key === " ") &&
      e.target.matches &&
      e.target.matches("img.avatar.zoomable")
    ) {
      e.preventDefault();
      openZoom(e.target);
    }
  });
  const LG = () => ({
    n: c.legalNombre || "Francisco Javier Casado García",
    nif: c.legalNif || "",
    dir: c.legalDir || "Granada, España",
    mail: c.contactEmail || "",
  });
  function legalHtml(k) {
    let L = LG(),
      id = `<b>${esc(L.n)}</b>${L.nif ? " (NIF " + esc(L.nif) + ")" : ""}, con domicilio en ${esc(L.dir)}`,
      ct = L.mail
        ? `<a href="mailto:${esc(L.mail)}">${esc(L.mail)}</a>`
        : "el contacto indicado en la web desde la que accedes a la app";
    if (k === "privacy")
      return [
        "Política de privacidad",
        `<p>Última actualización: octubre de 2026.</p><h3>Quién es el responsable</h3><p>${id}. Contacto: ${ct}.</p><h3>Qué datos tratamos</h3><p>Tu email y contraseña (la contraseña se guarda cifrada), tu foto de perfil y tu nombre si decides ponerlos, y el contenido que introduces: jugadores (nombre y foto opcional), partidos, alineaciones, resultados y estadísticas. Los dibujos de la pizarra se guardan en tu dispositivo y, si usas «Guardar» en la pizarra, también en tu cuenta. Si creas el <b>enlace del equipo</b>, quien tenga ese enlace ve el nombre del equipo, el nombre y dorsal de los jugadores, la convocatoria, los próximos entrenos y los vídeos que compartas; las respuestas «Voy» / «No puedo ir» y su motivo se guardan en tu cuenta (el motivo solo lo ves tú) y se borran a los 120 días. Si pides el esfuerzo, el número del 1 al 10 que anota cada jugador se guarda igual (120 días) y solo lo ves tú y, si creas su enlace, el preparador físico; los demás solo ven que ya lo ha anotado. Quien tenga el <b>enlace del preparador físico</b> ve el nombre y dorsal de los jugadores, su esfuerzo y su carga física (minutos × esfuerzo), sin poder cambiar nada. Puedes desactivar los enlaces cuando quieras.</p><h3>Para qué y con qué base</h3><p>Solo para darte el servicio de la app (art. 6.1.b RGPD, ejecución del contrato). No hacemos publicidad, no vendemos datos ni elaboramos perfiles.</p><h3>Con quién se comparten</h3><p>Con nuestros proveedores técnicos: <b>Supabase</b> (base de datos y autenticación, servidores en la Unión Europea), <b>GitHub Pages</b> (alojamiento de la web), <b>Resend</b> (envío de correo) y <b>Stripe</b> (cobro del plan Pro: los datos de la tarjeta los trata Stripe directamente, nosotros nunca los vemos).${c.turnstileSiteKey ? " Y <b>Cloudflare</b> (verificación anti-robots)." : ""} No se ceden datos a otros terceros salvo obligación legal.</p><h3>Lista de avisos del plan Pro</h3><p>Si pulsas «Avísame cuando esté disponible», guardamos tu email en una lista para avisarte una sola vez cuando el plan Pro esté disponible. Puedes pedirnos que te quitemos cuando quieras; se borra también si eliminas tu cuenta.</p><h3>Plan para clubes</h3><p>Si te unes a un club con su código, el encargado del club ve tu email y la fecha en que te uniste, para poder gestionar las plazas. Si pones tu foto de perfil y tu nombre en «Mi cuenta», además de ti solo los ve el supervisor del club, para saber de quién es cada cuenta; puedes quitarlos cuando quieras. El escudo que sube el encargado lo ven todos los entrenadores del club. Los demás entrenadores del club no ven nada tuyo. Solo si lo aceptas (al unirte o después, en «Mi cuenta › Plan para clubes»), el <b>supervisor del club</b> (el encargado y las personas del club que él nombre supervisoras) puede <b>ver, sin poder cambiarlos</b>, tus equipos, jugadores, partidos, alineaciones, convocatorias y entrenamientos, mientras el club esté pagado. Nunca ve tu contraseña, tu plan ni tus pagos. Puedes dejar de compartirlos cuando quieras desde el mismo sitio. El encargado puede quitarte del club (pierdes el plan Pro del club, pero conservas tu cuenta y tus datos) y tú puedes salir cuando quieras.</p><h3>Directo de partidos</h3><p>Si activas el directo de un partido, se crea un enlace secreto. Cualquiera que tenga ese enlace puede ver, sin cuenta, los nombres de los dos equipos, el marcador, el minuto, y el nombre y dorsal de quien marca cada gol, de los jugadores que entran y salen en los cambios y de quien recibe una tarjeta en ese partido, también los del rival que apuntes (nada más). Tú decides con quién compartirlo y puedes desactivarlo cuando quieras; también se borra si borras el partido o tu cuenta.</p><h3>Vídeo del partido</h3><p>Si usas la cámara del directo, el vídeo se graba en tu móvil y se guarda solo en tu dispositivo: no lo subimos a ningún sitio. Si además pulsas «Emitir», el vídeo y el sonido se envían en vivo, a través de <b>Cloudflare</b> (que solo los reparte y no los guarda), a quien abra el enlace del directo, mientras emites. No grabamos ni conservamos esa emisión. Si en el vídeo aparecen menores, eres responsable de contar con la autorización de sus tutores antes de grabar o emitir.</p><h3>Cuánto tiempo</h3><p>Mientras mantengas la cuenta. Si la borras desde «Mi cuenta», se eliminan tus datos de forma definitiva.</p><h3>Tus derechos</h3><p>Puedes acceder, rectificar, suprimir, portar, limitar u oponerte al tratamiento. Desde «Mi cuenta» puedes descargar y borrar tus datos tú mismo; también puedes escribirnos. Si no estás conforme, puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).</p><h3>Datos de jugadores y menores</h3><p>La app es para entrenadores y responsables adultos. Si introduces datos de otras personas, y en especial de menores, eres responsable de contar con su autorización (o la de sus tutores). Te recomendamos usar solo el nombre de pila y subir fotos solo con permiso. En relación con esos datos de terceros, tú eres quien decide para qué se usan y nosotros actuamos como encargados del tratamiento: los guardamos solo para prestarte el servicio, no los usamos para ningún otro fin y los borramos cuando borras la cuenta o el dato.</p><h3>Almacenamiento en tu dispositivo</h3><p>Usamos únicamente almacenamiento técnico necesario (sesión y pizarra). No usamos cookies de publicidad ni de analítica.${c.turnstileSiteKey ? " Para evitar registros automáticos, al crear la cuenta o entrar se usa la verificación anti-robots de <b>Cloudflare Turnstile</b>, que puede tratar datos técnicos del navegador." : ""}</p>`,
      ];
    return [
      "Términos de uso",
      `<p>Última actualización: octubre de 2026.</p><h3>Qué es</h3><p>Mi Fútbol JV32 es una aplicación web para gestionar plantillas, alineaciones, partidos, estadísticas y pizarra táctica. Titular del servicio: ${id}.</p><h3>Cuenta</h3><p>Debes ser mayor de edad. Eres responsable de mantener tu contraseña en secreto y de la actividad de tu cuenta.</p><h3>Tu contenido</h3><p>Los datos que introduces son tuyos. Garantizas que tienes derecho a usarlos y que cuentas con la autorización de las personas cuyos datos introduces. No puedes usar la app para fines ilícitos ni subir contenido ofensivo o que vulnere derechos de terceros.</p><h3>Plan gratuito y plan Pro</h3><p>El plan gratuito permite, en cada modalidad, un equipo, hasta 5 partidos, 5 entrenamientos y un máximo de jugadores (25 en Fútbol 11, 14 en Fútbol 7 y 16 en Fútbol sala), usar la cuenta en un máximo de 3 dispositivos y algunas funciones con tope (por ejemplo, convocatorias, envíos de entrenos y partidos con anotador o con control de ventanas de cambios al mes, vídeos de jugadas, pasos de una jugada, jugadas guardadas, lo que se ve en el enlace del equipo o en el del preparador físico), tal como se indica en la app. Para superar esos límites o llevar varios equipos existe el plan Pro, de 39,99 € al año (IVA incluido), con renovación anual. Quien ya lo tenga contratado a un precio anterior lo mantiene mientras no cancele su suscripción. Las suscripciones mensuales contratadas antes se mantienen hasta que se cancelen. Los clubes pueden contratar un plan para clubes: un pack anual según el número de entrenadores, con el que todos los entrenadores que se unan al club con su código tienen el plan Pro mientras el club esté pagado y sigan en el club. El encargado del club es quien lo contrata y gestiona, y puede quitar entrenadores del club. El encargado y los supervisores que él nombre pueden ver, sin modificarlos, los datos de los entrenadores del club que lo hayan aceptado. Solo se contrata y se cobra con tu aceptación expresa y puedes cancelarlo cuando quieras. Podremos modificar planes y precios avisando con antelación; el cambio no se aplicará a una suscripción en curso sin tu consentimiento.</p><h3>Disponibilidad</h3><p>La app se ofrece «tal cual». Hacemos copias razonables, pero te recomendamos descargar tus datos de vez en cuando desde «Mi cuenta». No respondemos de pérdidas indirectas ni de interrupciones ajenas a nuestro control, en los límites que permite la ley.</p><h3>Propiedad</h3><p>El nombre, logo, diseño y código de la app son propiedad de su titular y no pueden copiarse ni reutilizarse sin permiso.</p><h3>Cambios y baja</h3><p>Podemos actualizar estos términos avisando en la app. Puedes darte de baja y borrar tus datos cuando quieras desde «Mi cuenta». Podemos suspender cuentas que incumplan estos términos.</p><h3>Ley aplicable</h3><p>Legislación española. Si eres consumidor, te amparan además las normas de tu lugar de residencia.</p>`,
    ];
  }
  /* Si algún enlace vuelve a ser de modo prueba (test_), el pago solo se ve abriendo la app con ?probarpago */
  const probarPago = (() => {
    try {
      if (/[?&]probarpago/.test(location.search)) sessionStorage.setItem("mf_probarpago", "1");
      return sessionStorage.getItem("mf_probarpago") === "1";
    } catch (e) {
      return false;
    }
  })();
  const pagoActivo = !!c.proUrl && (!/\/test_/.test(c.proUrl) || probarPago);
  function proLink() {
    let u = pagoActivo ? c.proUrl : "";
    if (!u || !curUser) return "";
    return (
      u +
      (u.includes("?") ? "&" : "?") +
      "client_reference_id=" + encodeURIComponent(curUser) +
      "&prefilled_email=" + encodeURIComponent(curEmail) +
      "&locale=es"
    );
  }
  function proBtn() {
    if (enAndroid) return "";
    let u = proLink();
    return u
      ? `<a class="primary" href="${esc(u)}" target="_blank" rel="noopener" data-pro-pay>Quiero el plan Pro</a><p class="muted">El pago se hace en Stripe, de forma segura. Al volver a la app, el plan Pro se activa solo.</p>`
      : `<button type="button" class="primary" id="wl" data-acct="waitlist">Avísame cuando esté disponible</button><p class="muted" id="wlmsg">Te avisaremos por correo a <b>${esc(curEmail)}</b>. Sin compromiso.</p>`;
  }
  async function checkWaitlist() {
    try {
      let r = await db.from("interesados_pro").select("id");
      if (r.data && r.data.length) markWaitlisted();
    } catch (e) {}
  }
  function markWaitlisted() {
    let b = $("wl"),
      m = $("wlmsg");
    if (b) {
      b.disabled = true;
      b.textContent = "✓ Estás en la lista";
    }
    if (m)
      m.innerHTML =
        "Te avisaremos por correo en cuanto el plan Pro esté disponible. ¡Gracias!";
  }
  function usageHtml() {
    return `<div class="usage">${Object.keys(MODES)
      .map((k) => {
        let M = MODES[k];
        return `<div><span>${esc(M.name)}</span><span><b>${state.players.filter((p) => p.modalidad === k).length}</b>/${M.maxP} jug. · <b>${state.matches.filter((m) => m.modalidad === k).length}</b>/${M.maxM} part.${entrenosOn() ? ` · <b>${state.trainings.filter((t) => t.modalidad === k).length}</b>/${M.maxE} entr.` : ""}</span></div>`;
      })
      .join("")}</div>`;
  }
  /* Tutorial de bienvenida: ventana flotante paso a paso que señala cada parte de la app */
  const TUT = [
    {
      t: "¡Bienvenido a Mi Fútbol JV32!",
      p: "Aquí llevas tu equipo: plantilla, partidos, alineaciones, minutos, goles, pizarra táctica y marcador en directo. Te lo enseño en un minuto.",
    },
    {
      el: ".switch",
      t: "Elige la modalidad",
      p: "Fútbol 7, Fútbol 11 o Fútbol sala. Cada modalidad tiene sus jugadores y sus partidos por separado.",
    },
    {
      el: "#teams",
      t: "Tu equipo",
      p: "Con el lápiz le pones nombre a tu equipo y debajo eliges su categoría (así cada parte dura lo que toca). Con el botón + puedes llevar varios equipos en la misma modalidad (plan Pro).",
    },
    {
      el: "#stats",
      t: "El resumen de un vistazo",
      p: "Jugadores, partidos, minutos y goles del equipo que tienes elegido.",
    },
    {
      el: '[data-tab="plantilla"]',
      t: "Plantilla",
      p: "Pulsa «+ Jugador» para añadir a cada jugador con su nombre y, si quieres, su foto. Toca el lápiz para editarlo y la foto para verla en grande.",
    },
    {
      el: '[data-tab="partidos"]',
      t: "Partidos",
      p: "Pulsa «+ Partido»: pon fecha y rival, marca convocados y titulares, elige la formación y arrastra a cada jugador a su sitio en el campo. Elige capitán y portero, y después apunta minutos, goles, cambios, tarjetas (también las del rival) y el resultado.",
    },
    {
      el: '[data-tab="partidos"]',
      t: "Comparte y juega en directo",
      p: "En cada partido puedes sacar una imagen de la alineación para mandarla por WhatsApp, y abrir el Directo: marcador, minuto, goleadores, cambios, tarjetas, faltas acumuladas y estadísticas de cada jugador (robos, pérdidas, tiros…) en vivo, con un enlace para que la familia lo siga sin cuenta. Con la cámara del Directo grabas el partido con el marcador encima.",
    },
    {
      el: '[data-tab="pizarra"]',
      t: "Pizarra táctica",
      p: "Campo grande con los botones alrededor: pon jugadores con su dorsal, rivales, balón, conos y vallas, y arrástralos. Toca un jugador para cambiarle el color. Crea pasos con el + y pulsa ▶ para ver la jugada en movimiento, o sácala en imagen o vídeo. En Fútbol sala tienes además «Estrategias de fútbol sala» y en fútbol 7 y 11, «Jugadas a balón parado (ABP)»: córners, faltas, saques de banda y más, listos para cargar y verlos moverse.",
    },
    {
      el: '[data-tab="resumen"]',
      t: "Estadísticas",
      p: "Ranking de tus jugadores por goles, minutos, partidos y titularidades.",
    },
    {
      el: "#sbtn",
      t: "Buscador",
      p: "Encuentra cualquier jugador o partido de todas tus modalidades.",
    },
    {
      el: "#acct",
      t: "Mi cuenta",
      p: "Tu foto de perfil, tu plan, el plan para clubes (si eres supervisor del club, desde ahí ves a tus entrenadores), el control de entrenamientos (actívalo aquí si quieres pasar lista, poner ejercicios y circuitos de fuerza y coordinación y llevar la carga física en cada entreno, con el contexto del equipo y las fases del juego), la guía de uso, descargar tus datos, privacidad y borrar la cuenta. Desde aquí puedes volver a ver este tutorial cuando quieras.",
    },
    {
      t: "¡Listo para empezar!",
      p: "Empieza añadiendo a tus jugadores en la Plantilla. Luego crea tu primer partido.",
    },
  ];
  /* Novedades: tras cada actualización se muestra una vez lo que ha cambiado.
     El texto sale de "novedades" en version.json (soloWeb: no se muestra en la app de Android). */
  const NOV_KEY = "mf_novedades_visto";
  const appVer = () =>
    (document.querySelector('meta[name="app-version"]') || {}).content || "0";
  let novedades = null;
  async function novedadesCarga() {
    if (novedades && novedades.version === appVer()) return novedades;
    try {
      let r = await fetch("version.json?_=" + Date.now(), { cache: "no-store" });
      if (!r.ok) return null;
      let j = await r.json();
      if (!j || j.version !== appVer()) return null;
      let l = (Array.isArray(j.novedades) ? j.novedades : [])
        .map((x) => (typeof x === "string" ? { texto: x } : x || {}))
        .filter((x) => x.texto && !(x.soloWeb && enAndroid))
        .map((x) => x.texto);
      if (!l.length && j.notas) l = [j.notas];
      novedades = { version: j.version, lista: l };
      return novedades;
    } catch (e) {
      return null;
    }
  }
  function novedadesMarca() {
    try {
      localStorage.setItem(NOV_KEY, appVer());
    } catch (e) {}
  }
  async function novedadesRevisa() {
    let visto;
    try {
      visto = localStorage.getItem(NOV_KEY);
    } catch (e) {
      return;
    }
    if (visto === appVer()) return;
    /* Las pruebas automáticas no lo muestran salvo que lo pidan */
    if (navigator.webdriver && !window.__probarNovedades) return;
    /* Quien estrena la app ve el tutorial, no las novedades */
    if ($("tut")) return novedadesMarca();
    let n = await novedadesCarga();
    if (!n || !n.lista.length) return;
    if ($("tut") || !$("info").classList.contains("hidden")) return;
    showInfo("novedades");
    novedadesMarca();
  }
  let tutI = -1;
  /* Guía de uso (Mi cuenta › Guía de uso). Cada cambio que se note en la app o
     traiga opciones nuevas debe actualizar también esta guía y, si hace falta, el tutorial.
     soloWeb: el texto no se muestra en la app de Android (precios y pagos). */
  /* Precio del plan Pro y por qué cuesta eso (se explica para ser transparentes) */
  const POR_QUE_PRECIO =
    "¿Por qué 39,99 €? Desde que salió el plan Pro la app ha crecido mucho: vídeo en directo, control de entrenamientos, grabar el entreno, pizarra con jugadas animadas, varios equipos, plan para clubes y supervisor. El vídeo en directo y los servidores donde se guardan tus datos tienen un coste que sube con cada partido que se emite. Con este precio cubrimos esos costes y podemos seguir mejorando la app sin anuncios y sin vender tus datos. Quien ya pagaba un precio anterior lo mantiene mientras no cancele.";
  const precioProHtml = () =>
    enAndroid
      ? ""
      : `<p class="price">39,99 € <small>al año · IVA incluido · unos 3,33 € al mes · cancela cuando quieras</small></p><details class="porque"><summary>¿Por qué cuesta esto?</summary><p>${POR_QUE_PRECIO.replace(/^¿Por qué 39,99 €\? /, "")}</p></details>`;
  const AYUDA = [
    {
      t: "Empezar",
      p: [
        "Arriba eliges la modalidad: <b>Fútbol 7</b>, <b>Fútbol 11</b> o <b>Fútbol sala</b>. Cada una tiene sus jugadores y partidos por separado.",
        "Añade a tus jugadores en <b>Plantilla</b> y luego crea tu primer partido en <b>Partidos</b>.",
        "Puedes volver a ver el tutorial de bienvenida en «Mi cuenta › Ver el tutorial».",
      ],
    },
    {
      t: "Tus equipos",
      p: [
        "Con el lápiz junto al nombre del equipo le cambias el nombre.",
        "Con el botón <b>+</b> creas otro equipo en la misma modalidad, cada uno con su plantilla y sus partidos. Tener varios equipos es del plan Pro; en el plan gratuito tienes un equipo por modalidad.",
        "Toca el nombre de un equipo para cambiar de uno a otro. Con la papelera borras un equipo.",
        "Debajo eliges la <b>categoría</b> del equipo. Marca cuánto dura cada parte: prebenjamín 25', benjamín 30', alevín 35', infantil 40' y de cadete en adelante 45'. En <b>fútbol sala</b>: de prebenjamín a infantil 25' y de cadete en adelante 20'. Sin categoría se usa la duración normal de la modalidad.",
      ],
    },
    {
      t: "Plantilla",
      p: [
        "Pulsa «+ Jugador» y escribe el nombre. Si quieres, añade su <b>dorsal</b> (el número de su camiseta) y su foto.",
        "El dorsal sale junto a su nombre, en el campo de la alineación, en la imagen para WhatsApp y en la pizarra.",
        "Toca el lápiz para editar a un jugador y su foto para verla en grande.",
      ],
    },
    {
      t: "Convocatoria",
      p: [
        "En <b>Partidos</b>, pulsa «Convocatoria». Pon el <b>rival</b>, el <b>lugar</b>, el <b>día</b>, la <b>hora del partido</b> y la <b>hora de citación</b>, y marca a los convocados (con «Todos» los marcas de golpe). Si quieres, añade una nota, por ejemplo «equipación azul» o «traed la ficha».",
        "Abajo ves el mensaje ya escrito. «Enviar por WhatsApp» lo abre en WhatsApp para mandarlo al grupo; también puedes «Copiar el mensaje» y pegarlo donde quieras.",
        "La convocatoria se queda guardada en tu móvil y sale arriba en Partidos hasta que empieces una nueva. «Crear el partido con estos convocados» abre el partido con ellos ya marcados: solo te queda elegir titulares.",
        "Dentro de un partido también tienes el botón «Convocatoria», que coge los convocados de ese partido. La citación y el lugar se guardan en el partido y salen en la lista.",
        "En el plan gratuito puedes enviar <b>3 convocatorias al mes</b>; volver a mandar la misma no gasta otra. Con el plan Pro, ilimitadas.",
      ],
    },
    {
      t: "Enlace del equipo",
      p: [
        "Arriba, junto a tus equipos, pulsa <b>«Enlace»</b> y luego «Crear el enlace del equipo». Mándalo al grupo de WhatsApp con «Enviar por WhatsApp» o «Copiar el enlace». Cada equipo tiene el suyo.",
        "Tus jugadores lo abren <b>sin crearse cuenta</b> (en el móvil o en el ordenador), eligen su nombre una vez y ven: la <b>convocatoria</b> del próximo partido (rival, día, hora, citación, lugar y convocados), los <b>próximos entrenos</b> con la hora, qué se va a trabajar y los ejercicios, y los <b>vídeos de las jugadas</b> para repasarlas antes del partido.",
        "En cada entreno y en el partido tienen los botones <b>«Voy»</b> y <b>«No puedo ir»</b> (con el motivo, por ejemplo «lesionado» o «examen»). Tú lo ves en el enlace («Quién va y quién no puede»), al <b>pasar lista</b> junto a cada jugador y en la <b>convocatoria</b>. El motivo solo lo ves tú.",
        "El enlace se pone al día solo cada vez que cambias la convocatoria o los entrenos desde tu móvil. Para que el partido salga, haz la convocatoria en «Partidos › Convocatoria».",
        "<b>Vídeos para el equipo</b>: en el enlace pulsa «Subir un vídeo» (máximo 50 MB cada uno), o en la pizarra › Vídeos abre uno y pulsa «Compartir con el equipo». Así puedes subir la jugada que preparas en el ordenador. Con la papelera lo quitas. Cada vídeo <b>se borra solo a los 30 días</b> (del enlace y del servidor); si lo quieres más tiempo, vuelve a subirlo.",
        "<b>Esfuerzo</b>: si tienes activado el control de entrenamientos, después de cada entreno o partido les sale «¿Cuánto te ha costado?» (del 1 al 10) y se suma solo a tu carga física. Desde aquí también creas el <b>enlace del preparador físico</b> (ver «Carga física»).",
        "Plan gratuito: los jugadores ven el próximo partido y los <b>2 próximos entrenos</b>, puedes compartir <b>2 vídeos</b> y anotan el esfuerzo de la última sesión. Con el plan Pro, todos los entrenos, vídeos ilimitados y el esfuerzo de los últimos 7 días.",
        "«Desactivar el enlace» lo borra: el enlace deja de funcionar y se quitan los avisos y los vídeos compartidos. Puedes crear otro cuando quieras.",
      ],
    },
    {
      t: "Partidos y alineaciones",
      p: [
        "Pulsa «+ Partido»: pon la fecha y el rival, marca convocados y titulares y elige la formación.",
        "Arrastra a cada jugador a su sitio en el campo.",
        "<b>Color de las fichas</b>: toca a un jugador del campo y, debajo, elige su color con las muestras o moviendo la barra de color (y la de claro u oscuro). «Poner este color a todo el equipo» pinta a todos igual y «Color normal» lo deja en verde (o en amarillo si es el portero); el portero no coge el color del equipo. El color sale también en la imagen para WhatsApp.",
        "Después del partido apunta los minutos, los goles y el resultado.",
        "En <b>Datos del partido</b> (al crear o editar un partido) eliges el <b>capitán</b> y el <b>portero</b>. El capitán lleva una «C» y el portero sale de otro color en el campo y en la imagen. Si no eliges portero, es el que pongas en la portería (POR).",
        "En «Datos del partido» también están los <b>minutos por parte</b> de ese partido (salen de la categoría o del Directo). «Calcular minutos» los usa.",
        "Ahí mismo apuntas los <b>cambios</b> (minuto, quién sale y quién entra, con su dorsal) y las <b>tarjetas</b> amarillas y rojas. «Calcular minutos» rellena los minutos de cada jugador con los titulares, los cambios y las expulsiones.",
        "Más abajo está el apartado del <b>rival</b>: sus cambios (dorsal que sale y dorsal que entra) y sus tarjetas (dorsal y nombre opcional), cada uno con su minuto.",
        "Los cambios y tarjetas que apuntes en el Directo aparecen solos aquí. Si el partido va con <b>ventanas de cambios</b>, debajo de los cambios ves cuántas ventanas has usado en cada parte (los cambios del mismo minuto cuentan como una sola ventana) y puedes quitarlas o ponerlas con la casilla. Las tarjetas de cada jugador salen en su ficha de Plantilla y en Estadísticas.",
        "En <b>Estadísticas de cada jugador</b> tienes una tabla con los robos, pérdidas, tiros a puerta, tiros fuera, paradas, asistencias y faltas de cada convocado (desliza a los lados si no cabe). Se rellena sola desde el Directo y puedes corregirla o apuntarla a mano después del partido. Debajo están las <b>faltas acumuladas</b> de cada parte y, en el apartado del rival, sus <b>tiros</b>.",
        "Puedes sacar una imagen de la alineación para mandarla por WhatsApp.",
      ],
    },
    {
      t: "Directo",
      p: [
        "En «Partidos», pulsa el botón de directo de un partido: llevas el marcador, el minuto y los goleadores en vivo.",
        "<b>Cambios</b>: pulsa «🔄 Cambio» y marca a <b>todos los que salen</b> y a <b>todos los que entran</b> a la vez (salen con su dorsal). Van por parejas en el orden en que los toques: el 1º que sale por el 1º que entra, el 2º por el 2º… Abajo ves las parejas y pulsas «Hacer 2 cambios» (o los que sean). Si sale uno y no entra nadie (por una lesión sin cambios), márcalo solo a él. Toca otra vez a un jugador para desmarcarlo. <b>Tarjetas</b>: pulsa «Amarilla» o «Roja» y elige al jugador. La segunda amarilla cuenta como expulsión. Con la ✕ quitas un gol, cambio o tarjeta apuntado por error.",
        "<b>Ventanas de cambios</b>: desde <b>juvenil en fútbol 11</b> (categoría Juvenil o Senior) se juega con <b>3 ventanas de cambios por parte</b> y en cada ventana cambias a los jugadores que quieras. En el Directo te salen las ventanas de la 1ª y la 2ª parte: toca la que toca («Ventana 1», «Ventana 2»…) o «🔄 Cambio», marca a los que salen y a los que entran y listo, esa ventana queda hecha con sus cambios. En la <b>penúltima</b> te avisa de que después solo te queda una, y en la <b>última</b> te avisa de que metas en ella todos los cambios que quieras hacer. Los cambios del <b>descanso no gastan ventana</b>. Si ya no te quedan y apuntas otro, te pregunta antes.",
        "Las ventanas se activan solas con la categoría Juvenil o Senior en fútbol 11. En cualquier otro partido (fútbol 7 o fútbol 11 de otra categoría) puedes ponerlas o quitarlas con la casilla «Ventanas de cambios (3 por parte)». En fútbol sala no salen, porque los cambios son libres. Gratis: control de ventanas en 3 partidos al mes; con Pro, ilimitado. Cambiar a varios jugadores a la vez es gratis siempre.",
        "<b>Del rival</b>: al pulsar «🔄 Cambio», «Amarilla» o «Roja», elige arriba el nombre del rival. Pon el dorsal (en las tarjetas, también el nombre si quieres) y pulsa «Apuntar». Salen marcados con el nombre del rival.",
        "Los <b>minutos por parte</b> salen de la categoría del equipo. Si un día se juega con otra duración, cámbialos antes de pulsar «Empezar partido».",
        "Debajo eliges el <b>capitán</b> y el <b>portero</b>. Al pulsar «Terminar partido», los minutos de cada jugador se calculan solos con los cambios.",
        "<b>Estadísticas en directo</b>: elige arriba qué quieres apuntar (<b>Robo</b>, <b>Pérdida</b>, <b>Tiro a puerta</b>, <b>Tiro fuera</b>, <b>Parada</b>, <b>Asistencia</b> o <b>Falta</b>) y toca al jugador. El número de cada jugador sube al momento. Primero salen los que están en el campo y debajo el banquillo.",
        "<b>Faltas acumuladas</b>: cada «Falta» de un jugador tuyo y cada «Falta del rival» suman a las faltas de esa parte, que salen debajo del reloj (también en el enlace para la familia). En <b>fútbol sala</b>, al llegar a 5 faltas en una parte se pone en rojo y te avisa de que la siguiente es <b>doble penalti</b>. En la 2ª parte empiezan de cero.",
        "«Tiro del rival» cuenta sus tiros. Si te equivocas, «↶ Deshacer» quita lo último que apuntaste. Debajo tienes el resumen del partido: robos, pérdidas, tiros y faltas de los dos equipos.",
        "Con «Compartir enlace» mandas un enlace para que la familia siga el partido sin tener cuenta: ve el marcador, el minuto, los goles, los cambios, las tarjetas y las faltas acumuladas. Las estadísticas de cada jugador solo las ves tú. Con «Desactivar enlace» deja de funcionar.",
        "«Cámara: grabar el partido» graba vídeo con el marcador y el minuto dentro. Pon el móvil en horizontal. El vídeo se guarda solo en tu móvil. Grabar es gratis.",
        "«Emitir» envía el vídeo en vivo a quien tenga el enlace del directo (plan Pro). Puedes emitir y grabar a la vez.",
        "El vídeo en vivo lo pueden ver hasta <b>25 personas a la vez</b> en cada partido. Si ya hay 25, los demás siguen viendo el marcador y los goles, y el vídeo les entra solo en cuanto alguien lo deja de ver. El marcador no tiene límite.",
        "Consejo: para y guarda en el descanso, así los archivos son más pequeños.",
        "<b>Anotador</b>: si tú grabas o estás dirigiendo, otra persona (el delegado, un padre…) puede apuntarlo todo desde su móvil. En el Directo pulsa «Crear enlace de anotador» y mándaselo con «Enviar al anotador». No necesita cuenta.",
        "El anotador tiene botones grandes: <b>«⚽ Gol nuestro»</b> (elige quién ha marcado), <b>«⚽ Gol rival»</b>, <b>«Falta nuestra»</b> y <b>«Falta del rival»</b> (en fútbol sala avisa del doble penalti), <b>«🔄 Cambio»</b> (quién sale y quién entra), <b>«Amarilla»</b> y <b>«Roja»</b>, de tu equipo o del rival (del rival, con el dorsal). El <b>minuto se pone solo</b> con tu reloj del partido.",
        "En tu móvil el marcador, los goleadores y el marcador del vídeo se actualizan solos en unos segundos, y todo se guarda en el partido y en las estadísticas. El anotador puede quitar con la ✕ lo que haya apuntado él. Con «Quitar el anotador» su enlace deja de funcionar. Con el plan gratuito, el anotador se puede usar en 3 partidos al mes; con Pro, sin límite.",
        "<b>Sin cobertura en el campo</b>: la sesión ya no se cierra sola. Si se pierde la conexión, arriba sale «Sin conexión con tu cuenta»; sigue apuntando con normalidad y, en cuanto vuelva la cobertura, se guarda todo solo. Si el móvil cierra la app (por ejemplo al usar la cámara), al abrirla otra vez vuelves directamente al directo del partido.",
      ],
    },
    {
      t: "Control de entrenamientos",
      p: [
        "Es opcional: actívalo en «Mi cuenta › Activar el control de entrenamientos». Aparece la pestaña <b>Entrenos</b> abajo.",
        "Verás un calendario del mes. Toca un día y pulsa «Crear entrenamiento este día» (o «+ Entreno»). Con las flechas cambias de mes.",
        "Pasa lista con los jugadores de tu plantilla: <b>✓</b> vino, <b>🕒</b> llegó tarde, <b>✗</b> faltó y <b>J</b> falta justificada. Llegar tarde cuenta como que vino, pero se apunta aparte para que lo veas. Se guarda solo. «Todos vinieron» los marca a todos de una vez.",
        "Si falta alguien en la lista, pulsa «Añadir jugador» y escribe su nombre: queda en tu plantilla.",
        "Puedes apuntar la hora y <b>qué vais a trabajar</b> (por ejemplo, «juego de 4, defensa con cambio, activación»). Cada día del calendario sale de un color según la asistencia.",
        "<b>Enviar el entreno a los jugadores</b>: prepara el entreno antes (qué vais a trabajar, los ejercicios con su explicación y el circuito) y pulsa «Enviar el entreno a los jugadores». Te sale el mensaje escrito para mandarlo por WhatsApp al grupo, así llegan sabiendo lo que se va a hacer y pierdes menos tiempo explicando. Gratis: 3 envíos al mes; con Pro, ilimitados.",
        "<b>Grabar el entreno</b>: toca un día y pulsa «Grabar el entreno». Se abre la cámara; pulsa «● Grabar» y luego «Parar». Con «Guardar en el móvil» o «Compartir / Guardar en galería» el vídeo se queda en tu móvil (no se sube a internet). El vídeo lleva el nombre del equipo y la fecha. Grabar es gratis.",
        "Abajo tienes la <b>asistencia por jugador</b>: cuántas veces ha venido (y cuántas llegó tarde), faltado o justificado, y su porcentaje.",
        "Cada equipo tiene sus propios entrenamientos. En el plan gratuito puedes guardar hasta 5 entrenamientos por modalidad; con el plan Pro, ilimitados.",
        "Si lo desactivas, la pestaña se oculta pero tus entrenamientos no se borran.",
      ],
    },
    {
      t: "Circuitos de fuerza y coordinación",
      p: [
        "Están en la pestaña <b>Entrenos</b>. Toca un día con entrenamiento y pulsa «Añadir circuito de fuerza o coordinación».",
        "Puedes empezar con una <b>plantilla</b> (fuerza básica, coordinación con escalera y conos, velocidad y reacción, prevención de lesiones o calentamiento con balón) y luego cambiarla a tu gusto.",
        "Escribe el tiempo de <b>trabajo</b> de cada ejercicio, el <b>descanso</b> y la pausa entre series en <b>minutos y segundos</b>, el que tú quieras (por ejemplo 0 min 45 s o 2 min 30 s; hasta 30 min por ejercicio), y elige cuántas <b>series</b>. La app te dice cuánto dura el circuito.",
        "Si un ejercicio necesita <b>otro tiempo</b>, escríbelo en su ⏱ Tiempo, debajo del ejercicio. Si lo dejas vacío usa el tiempo general. «Usar el general» le quita el tiempo propio.",
        "«Ejercicio de la biblioteca»: hay 40 ejercicios con su dibujo y cómo se hacen, por tipos: fuerza, core, coordinación, velocidad y calentamiento. Todos con el peso del cuerpo, aptos para fútbol base.",
        "«Ejercicio propio»: escribe uno tuyo con su explicación. Con las flechas cambias el orden y con la ✗ lo quitas.",
        "Pulsa <b>▶ Iniciar</b> en el campo: sale un cronómetro grande que pita al empezar cada ejercicio y en los 3 últimos segundos, y te dice qué ejercicio viene después. Tienes Pausa, Atrás y Saltar. La pantalla no se apaga mientras corre.",
        "Marca «Guardar también en Mis circuitos» para reutilizarlo otro día. Abajo, en <b>Circuitos</b>, tienes tus circuitos guardados y la biblioteca de ejercicios.",
        "En el plan gratuito puedes guardar 3 circuitos en «Mis circuitos»; con el plan Pro, todos los que quieras. Poner un circuito en un entreno siempre es gratis.",
        "Consejo: con los más pequeños, menos tiempo de trabajo y más descanso.",
      ],
    },
    {
      t: "Ejercicios del entreno",
      p: [
        "Para ejercicios que no son de ningún circuito: un rondo, un partidillo, una finalización, un trabajo táctico…",
        "En la pestaña <b>Entrenos</b>, toca un día con entrenamiento y pulsa <b>«Añadir ejercicio»</b> (está debajo de «Añadir circuito de fuerza o coordinación»).",
        "Escribe el <b>nombre</b>, cómo se hace (opcional) y su <b>tiempo</b> en minutos y segundos, el que tú quieras, sin límite. La app te dice cuánto suman todos.",
        "Con <b>▶</b> sale el cronómetro grande de ese ejercicio, el mismo de los circuitos: pita al empezar y en los 3 últimos segundos.",
        "<b>Fase del juego</b> (opcional): al añadir o editar un ejercicio, marca de qué fase es: <b>Ataque</b> (ataque organizado o contraataque), <b>Defensa</b> (defensa organizada o reorganización defensiva) o <b>ABP</b> (acciones a balón parado). Toca otra vez para quitarla. Sale en el ejercicio y en el mensaje del entreno.",
        "<b>Fases del juego</b>: en Entrenos, debajo de «Carga física», ves los minutos de esta semana en cada fase y su carga (minutos × esfuerzo medio del entreno), para no olvidarte de ninguna. Gratis la semana actual; con el plan Pro, las 6 últimas semanas y el reparto en %. El contraataque es la transición defensa-ataque y la reorganización defensiva, la de ataque-defensa.",
        "Con «Editar» lo cambias y con la ✗ lo quitas. En el plan gratuito puedes poner 3 ejercicios en cada entreno y guardar 5 en «Mis ejercicios»; con el plan Pro, sin límite.",
        "<b>Mis ejercicios</b>: marca «Guardar también en Mis ejercicios» y el ejercicio queda guardado para otros días. Al pulsar «Añadir ejercicio» te salen arriba: toca uno y se pone en el entreno con su tiempo. Con la papelera lo borras de «Mis ejercicios» (los entrenos que ya lo tienen lo conservan). Si guardas otro con el mismo nombre, se actualiza.",
      ],
    },
    {
      t: "Carga física",
      p: [
        "Está en la pestaña <b>Entrenos</b>, en el apartado <b>Carga física</b>. Mide cuánto ha trabajado cada jugador: <b>esfuerzo (del 1 al 10) × minutos</b>.",
        "Al terminar el entreno, pregunta a cada jugador: «¿cuánto te ha costado, del 1 al 10?». Toca el día, pulsa «Anotar esfuerzo (1-10)», pon los minutos que ha durado y marca el número de cada uno. «Poner a todos» rellena a todos con el mismo número y luego cambias a quien haga falta.",
        "Solo salen los que has marcado como que <b>vinieron</b>. Si aún no has pasado lista, salen todos.",
        "Partidos: en «Carga física» salen los partidos de las últimas 3 semanas sin esfuerzo anotado. Tócalo y marca el esfuerzo; los minutos de cada jugador ya los pone la app.",
        "<b>Que lo anoten ellos</b>: con el <b>enlace del equipo</b> (botón «Enlace», arriba), al terminar cada entreno o partido a cada jugador le sale «¿Cuánto te ha costado?» y toca un número del 1 al 10, sin app ni cuenta. Solo pueden los que vinieron al entreno (si has pasado lista) o los que jugaron el partido. Se suma solo a tu carga física con un 📱; al pulsar «Revisar» ves lo que ha puesto cada uno («lo anotó él») y, si cambias un número, vale el tuyo. Si los minutos del entreno no están puestos, se usan los de la última vez (75 si no hay).",
        "<b>Preparador físico</b>: en «Enlace › Esfuerzo y carga física» pulsa «Crear enlace para el preparador físico» y mándaselo por WhatsApp. Lo abre sin cuenta y <b>solo puede mirar</b>: la carga de cada jugador y el esfuerzo de cada sesión. No ve la convocatoria, los motivos ni los vídeos. Con «Quitar el enlace del preparador» deja de funcionar.",
        "Plan gratuito: los jugadores anotan solo la <b>última sesión</b> y el preparador ve la <b>semana actual</b>. Con el plan Pro, todas las sesiones de los últimos 7 días y 6 semanas con gráfico y avisos. Si no quieres pedirles el esfuerzo, desmarca «Pedir a los jugadores su esfuerzo» en el enlace.",
        "Verás la carga de esta semana de cada jugador y del equipo. La semana empieza el lunes.",
        "<b>Contexto del equipo</b> (gratis): arriba de «Carga física», pulsa «Poner» o «Cambiar» y elige la categoría (la edad), los <b>días de entreno a la semana</b>, si entrenáis por la <b>mañana, tarde o noche</b> y el <b>periodo</b>: pretemporada, competición (microciclo competitivo) o parón. Al cambiar de periodo puedes decir desde qué día; queda un historial.",
        "Con el contexto la app afina el aviso: hasta infantil salta antes (1,3 veces la media en vez de 1,5), en el parón es normal que baje y a la vuelta del parón te avisa si subes de golpe. En «Consejos para esta semana» tienes recomendaciones según la edad, los días, el horario y el periodo. En el gráfico Pro sale el periodo debajo de cada semana.",
        "<b>Día del microciclo</b>: si hay un partido cerca, en cada entreno sale su día: <b>MD-1</b> el día antes (activación corta), MD-2 (velocidad, poco volumen), MD-3 o MD-4 (el día más intenso) y MD+1 o MD+2 después del partido (recuperación). El preparador físico ve también el contexto y los minutos por fase en su enlace.",
        "Con el <b>plan Pro</b>: gráfico de las últimas 6 semanas del equipo y de cada jugador, y <b>aviso de sobrecarga</b> cuando alguien lleva esta semana más de 1,5 veces su media de las 4 anteriores. Subir de golpe es cuando más lesiones hay.",
        "Es una ayuda para el entrenador, no un diagnóstico médico. El botón «?» lo explica.",
      ],
    },
    {
      t: "Pizarra táctica",
      p: [
        "El campo ocupa casi toda la pantalla y los botones están alrededor. Si dejas el dedo (o el ratón) sobre un botón, te dice para qué sirve.",
        "En tablet, ordenador o con el móvil girado, el campo se pone en <b>horizontal</b> y los botones se reparten a los lados. Si giras el móvil, la pizarra se abre a pantalla completa (con la X vuelves). Lo que hayas hecho se mantiene al girarlo.",
        "Con los iconos de <b>debajo del campo</b> (a la derecha en horizontal) pones jugadores, rivales, balón, conos, vallas, picas y porterías. Arrástralos con el dedo para colocarlos. Toca una valla o una portería para girarla.",
        "Al tocar «Jugador» eliges a uno de tu plantilla (sale con su dorsal) o una ficha con número. Con «Poner titulares de…» llevas al campo la alineación de un partido.",
        "La <b>mano</b> («Mover») es el modo normal: con ella mueves las fichas y, aunque toques fuera de una ficha, no se pinta nada.",
        "<b>Color de los jugadores</b>: toca un jugador o un rival (sin arrastrarlo) y abajo sale su color. Elige una muestra o mueve la barra de color hasta el que quieras; la segunda barra lo hace más claro u oscuro. «A todos los míos» (o «A todos los rivales») los pinta a todos igual, y los que añadas después saldrán de ese color. «Color normal» lo deja como estaba. Toca el campo o la X para cerrarlo.",
        "Con los iconos de <b>encima del campo</b> (a la izquierda en horizontal) dibujas con el lápiz o la flecha y eliges el color. La goma borra la línea o la ficha que toques. También tienes deshacer y la papelera para borrarlo todo.",
        "<b>Jugada en movimiento</b>: coloca las fichas, toca el <b>+</b> de la fila «Paso» y arrástralas a donde se mueven (verás una flecha desde el sitio anterior). Repite para cada paso. El botón verde ▶ las mueve solas de un paso a otro, y con las flechas ‹ › cambias de paso para retocarlo. La X roja quita el paso en el que estás.",
        "Con el icono de la cámara sacas un <b>vídeo</b> de la jugada para mandarlo por WhatsApp; con el de descargar, una <b>imagen</b>. El botón de pantalla completa la pone en grande para explicarla. La pizarra se guarda en tu móvil.",
        "<b>Limpia</b> (plan Pro): deja el campo liso, sin rayas ni escudo, para que se vean mejor las fichas y los movimientos. Vuelve a tocarlo para dejarlo como antes. La imagen y el vídeo salen también limpios. Junto con la pantalla completa tienes la pizarra grande y despejada.",
        "<b>Vídeos</b> (2 gratis por modalidad, ilimitados con Pro): sube desde el móvil el vídeo de una jugada (de un partido, de otro equipo…), ponle nombre y enséñalo cuando quieras, también a pantalla completa. Se guardan solo en ese dispositivo, cada modalidad con los suyos. Con «Compartir o guardar» lo mandas por WhatsApp y con «Compartir con el equipo» lo ven tus jugadores en el enlace del equipo.",
        "<b>Fase de la jugada</b>: en «Guardar» puedes marcar la fase de la jugada (ataque organizado, contraataque, defensa organizada, reorganización defensiva o ABP) antes de guardarla. En «Mis jugadas» sale su fase y puedes ver solo las de una fase.",
        "<b>Jugadas a balón parado (ABP)</b>: en fútbol 7 y fútbol 11, encima de la pizarra tienes el botón <b>«Jugadas a balón parado (ABP)»</b>: 14 jugadas que se mueven solas paso a paso: córners (primer palo, segundo palo, en corto, con bloqueos, raso al borde del área), faltas laterales y frontales, saques de banda y cómo <b>defender</b> el córner (en zona o mixto) y la falta lateral. Arriba te explica cada paso y tienes las claves. Las <b>5 más usadas</b> (TOP) son gratis; con el plan Pro, las 14. Los números de las fichas son dorsales y P es el portero.",
        "<b>Guardar</b> y <b>Mis jugadas</b> (3 gratis, ilimitadas con Pro): con «Guardar» le pones un nombre a la jugada que tienes en la pizarra (con sus pasos, colores y dibujos) y se guarda en tu cuenta. En «Mis jugadas» la vuelves a abrir cuando quieras, también desde el ordenador o la tablet entrando con tu cuenta. Si guardas con un nombre que ya tienes, te pregunta si quieres cambiarla.",
      ],
    },
    {
      t: "Estrategias de fútbol sala",
      p: [
        "En <b>Fútbol sala</b>, encima de la pizarra tienes el botón <b>«Estrategias de fútbol sala»</b>: una biblioteca de 34 jugadas a balón parado para ensayar en los entrenos.",
        "Están por tipos: <b>córners</b>, <b>saques de banda</b>, <b>faltas y doble penalti</b>, <b>saque de centro</b>, <b>saque del portero</b>, <b>5x4 con portero-jugador</b> y cómo <b>defender</b> el córner y el 5x4. Con «Las más usadas» ves solo las TOP.",
        "Toca una y se carga en la pizarra moviéndose sola, paso a paso. Encima del campo te dice qué pasa en cada paso, y en «Claves para que salga bien» tienes los detalles. Las letras de las fichas son los puestos: P portero, PJ portero-jugador, C cierre, AI y AD alas izquierdo y derecho, PV pívot.",
        "Con ‹ › vas paso a paso para explicarla con calma, y con ▶ la vuelves a ver. Puedes mover las fichas, cambiar colores o poner a tus jugadores, y sacar la <b>imagen</b> o el <b>vídeo</b> para mandarlo al grupo. Si cargas una estrategia y tenías otra jugada, con «Deshacer» la recuperas. La X de la explicación la quita.",
        "Las <b>10 más usadas</b> (TOP) son gratis para todos. Con el <b>plan Pro</b> tienes las 34.",
      ],
    },
    {
      t: "Estadísticas y buscador",
      p: [
        "En <b>Estadísticas</b> ves el ranking de tus jugadores por goles, minutos, partidos y titularidades.",
        "Debajo de cada jugador salen también sus <b>robos, pérdidas, tiros, paradas, asistencias y faltas</b> de toda la temporada (solo los que tenga apuntados).",
        "<b>Distancia recorrida</b>: no la medimos. Hace falta un GPS o un reloj deportivo puesto en cada jugador; con el móvil del entrenador no se puede saber.",
        "Con la lupa buscas cualquier jugador o partido de todas tus modalidades.",
      ],
    },
    {
      t: "Plan gratuito y plan Pro",
      p: [
        "El plan gratuito tiene un límite de jugadores, partidos y entrenamientos en cada modalidad y un equipo por modalidad. En «Mi cuenta» ves cuánto llevas.",
        "<b>Plan gratuito</b>, en cada modalidad: 1 equipo, 5 partidos, 5 entrenamientos y un máximo de jugadores. Además: tu cuenta en <b>3 dispositivos</b>, <b>3 convocatorias</b> y <b>3 envíos de entreno</b> al mes, <b>2 vídeos de jugadas</b>, jugadas de la pizarra de <b>3 pasos</b>, <b>3 ejercicios</b> por entreno, <b>5</b> en «Mis ejercicios», <b>3</b> circuitos guardados, <b>3</b> jugadas guardadas en «Mis jugadas», en el enlace del equipo el próximo partido, <b>2</b> entrenos, <b>2</b> vídeos y el esfuerzo de la <b>última sesión</b>, el <b>anotador del directo en 3 partidos al mes</b>, el <b>control de ventanas de cambios en 3 partidos al mes</b> (los cambios de varios a la vez son gratis), el enlace del preparador físico con la <b>semana actual</b>, las 10 estrategias TOP de fútbol sala, las 5 jugadas de ABP TOP en fútbol 7 y 11, y las fases del juego de la semana actual. El contexto de la carga (edad, días, horario y periodo) es gratis para todos.",
        "<b>Plan Pro</b>: todo <b>ilimitado</b> (dispositivos, equipos, jugadores, partidos, entrenos, convocatorias, envíos, vídeos, ejercicios por entreno, «Mis ejercicios», pasos de cada jugada, circuitos, jugadas guardadas, anotador del directo y todo lo del enlace del equipo), <b>pizarra limpia</b>, gráfico de carga física (también en el enlace del preparador físico, 6 semanas), emitir vídeo en el Directo, las 34 estrategias de fútbol sala, las 14 jugadas de ABP de fútbol 7 y 11 y las fases del juego de las 6 últimas semanas.",
        "<b>Dispositivos</b>: en «Mi cuenta › Mis dispositivos» ves dónde tienes abierta la app y puedes quitar alguno. Al cerrar sesión, ese dispositivo deja su sitio libre. Si entras en un 4º dispositivo con el plan gratuito, la app te pide cerrar la sesión en otro.",
        { texto: "El plan Pro cuesta 39,99 € al año (IVA incluido), unos 3,33 € al mes. Se contrata y se cancela desde «Mi cuenta».", soloWeb: true },
        { texto: "<b>Cómo se paga:</b> en «Mi cuenta › Pasar a Pro» pulsa «Quiero el plan Pro». Pagas con tarjeta en <b>Stripe</b>, de forma segura (nosotros nunca vemos tu tarjeta). Al volver a la app, el plan Pro se activa solo. Se renueva cada año; en «Gestionar o cancelar mi suscripción» ves tus facturas, cambias la tarjeta o cancelas, y sigues con el Pro hasta el final del año pagado.", soloWeb: true },
        { texto: POR_QUE_PRECIO, soloWeb: true },
      ],
    },
    {
      t: "Plan para clubes",
      p: [
        "El club paga una sola suscripción y <b>todos sus entrenadores tienen el plan Pro</b>.",
        "Los entrenadores <b>no ven nada de los demás</b>. Solo el <b>supervisor del club</b> puede ver, sin cambiar nada, los equipos, jugadores, partidos, alineaciones, convocatorias y entrenamientos de cada entrenador que lo acepte. Nunca ve contraseñas ni datos de la cuenta.",
        "<b>Si eres entrenador:</b> entra en «Mi cuenta › Plan para clubes», escribe el código que te ha dado tu club, marca que aceptas que el supervisor vea tus datos y pulsa «Unirme al club». Puedes dejar de compartirlos o salir del club cuando quieras; tus datos se quedan contigo.",
        "<b>Si eres el encargado del club:</b> en «Mi cuenta › Plan para clubes» escribe el nombre del club, pulsa «Crear el club» y elige el pack. Comparte el código con tus entrenadores (Copiar o WhatsApp). Desde ahí ves quién se ha unido, puedes quitar entrenadores y cambiar el código.",
        "<b>Supervisor del club:</b> el encargado es siempre supervisor y puede pulsar «Hacer supervisor» junto a otra persona del club (por ejemplo, el gerente o el director deportivo). El supervisor ve el club como un árbol: arriba el escudo y el nombre del club, y debajo cada entrenador con su foto y su nombre. Con el club pagado, toca a un entrenador y la app le enseña su plantilla, partidos, alineaciones y entrenamientos en <b>solo lectura</b>: arriba sale «Viendo a…» y el botón «Volver a mis datos».",
        "<b>Escudo del club:</b> el encargado lo sube en «Mi cuenta › Plan para clubes › Escudo del club». Lo ven todos los entrenadores del club, arriba junto al logo de la app.",
        "<b>Foto de cada entrenador:</b> cada uno pone su foto de perfil y su nombre en «Mi cuenta». En el club solo los ve el supervisor, para saber de quién es cada cuenta. Los demás entrenadores no los ven.",
        { texto: "Packs anuales: 5 entrenadores por 149 €, 10 por 259 €, 20 por 459 € y 30 por 599 € (IVA incluido). Cuantos más entrenadores, menos cuesta cada uno (de 29,80 € a 19,97 €).", soloWeb: true },
      ],
    },
    {
      t: "Actualizaciones",
      p: [
        "La app se actualiza sola. Al abrir una versión nueva verás un momento «Actualizando…» y después «¡App actualizada!».",
        "Si tienes la app abierta cuando sale una versión nueva, aparece un aviso con el botón «Actualizar».",
        "Lo que ha cambiado lo ves en «Mi cuenta › Novedades de esta versión».",
      ],
    },
    {
      t: "Tu cuenta y tus datos",
      p: [
        "<b>Tu foto de perfil:</b> arriba del todo en «Mi cuenta» pulsa «Poner mi foto» y elige la que quieras; también puedes escribir tu nombre. La foto sale en el botón de tu cuenta, arriba a la derecha. Puedes cambiarla o quitarla cuando quieras.",
        "En «Mi cuenta» puedes descargar todos tus datos, leer la política de privacidad, cerrar sesión o borrar tu cuenta y tus datos.",
      ],
    },
  ];
  function ayudaHtml() {
    return `<p>Toca un apartado para ver cómo funciona.</p><div class="ayuda">${AYUDA.map(
      (a) =>
        `<details><summary>${a.t}</summary><ul>${a.p
          .filter((x) => !(x && x.soloWeb && enAndroid))
          .map((x) => `<li>${typeof x === "string" ? x : x.texto}</li>`)
          .join("")}</ul></details>`,
    ).join("")}</div>`;
  }
  const tutKey = () => "mf_tut_v1:" + (curUser || "");
  function tutPending() {
    if (c.noTutorial) return false;
    try {
      return !localStorage.getItem(tutKey());
    } catch (e) {
      return false;
    }
  }
  function tutOpen() {
    state.tab = "plantilla";
    state.draft = null;
    state.live = null;
    render();
    tutI = 0;
    tutShow();
  }
  function tutClose() {
    tutI = -1;
    let b = $("tut");
    if (b) b.remove();
    try {
      localStorage.setItem(tutKey(), "1");
    } catch (e) {}
  }
  function tutShow() {
    let s = TUT[tutI],
      box = $("tut");
    if (!box) {
      box = document.createElement("div");
      box.id = "tut";
      box.className = "tut";
      box.innerHTML =
        '<div class="tut-hole"></div><div class="tut-card" role="dialog" aria-modal="true" aria-labelledby="tutT"></div>';
      document.body.appendChild(box);
    }
    let hole = box.querySelector(".tut-hole"),
      card = box.querySelector(".tut-card"),
      el = s.el && document.querySelector(s.el),
      last = tutI === TUT.length - 1;
    if (el) {
      el.scrollIntoView({ block: "center", inline: "nearest" });
      let r = el.getBoundingClientRect(),
        pad = 6;
      Object.assign(hole.style, {
        display: "block",
        left: r.left - pad + "px",
        top: r.top - pad + "px",
        width: r.width + pad * 2 + "px",
        height: r.height + pad * 2 + "px",
      });
      box.classList.add("on-el");
      card.classList.toggle("top", r.top + r.height / 2 > innerHeight / 2);
    } else {
      hole.style.display = "none";
      box.classList.remove("on-el");
      card.classList.remove("top");
    }
    card.innerHTML = `<div class="kicker">Paso ${tutI + 1} de ${TUT.length}</div><h2 id="tutT">${esc(s.t)}</h2><p>${esc(s.p)}</p><div class="tut-dots" aria-hidden="true">${TUT.map((_, i) => `<i class="${i === tutI ? "on" : ""}"></i>`).join("")}</div><div class="tut-btns">${last ? "" : '<button type="button" class="lnk" data-tut="skip">Saltar</button>'}<span></span>${tutI ? '<button type="button" class="secondary small" data-tut="prev">Atrás</button>' : ""}<button type="button" class="primary small" data-tut="next">${last ? "Empezar" : "Siguiente"}</button></div>`;
    card.querySelector('[data-tut="next"]').focus();
  }
  document.addEventListener("click", (e) => {
    let b = e.target.closest && e.target.closest("[data-tut]");
    if (!b || tutI < 0) return;
    e.stopPropagation();
    let k = b.dataset.tut;
    if (k === "skip") return tutClose();
    if (k === "prev") tutI = Math.max(0, tutI - 1);
    else if (tutI === TUT.length - 1) return tutClose();
    else tutI++;
    tutShow();
  }, true);
  document.addEventListener("keydown", (e) => {
    if (tutI < 0) return;
    if (e.key === "Escape") tutClose();
    else if (e.key === "ArrowRight" && tutI < TUT.length - 1) {
      tutI++;
      tutShow();
    } else if (e.key === "ArrowLeft" && tutI > 0) {
      tutI--;
      tutShow();
    }
  });
  window.addEventListener("resize", () => {
    if (tutI >= 0) tutShow();
  });
  function showInfo(k) {
    let t, h;
    if (k === "proteam") {
      t = "Plan Pro";
      h = `<p>En el plan gratuito tienes <b>un equipo</b> en cada modalidad.</p><p>Con el <b>plan Pro</b> puedes llevar <b>varios equipos</b> en Fútbol 7, Fútbol 11 y Fútbol sala, cada uno con su plantilla y sus partidos, y además jugadores y partidos ilimitados.</p>${precioProHtml()}<div class="stack">${proBtn()}${clubLinkBtn()}</div>`;
    } else if (k === "proentreno") {
      t = "Plan Pro";
      h = `<p>En el plan gratuito puedes guardar hasta <b>${MODES[state.mode].maxE} entrenamientos</b> en cada modalidad. Para hacer sitio, borra alguno antiguo.</p><p>Con el <b>plan Pro</b> tienes <b>entrenamientos ilimitados</b> para llevar la asistencia de toda la temporada, además de jugadores y partidos ilimitados y varios equipos.</p>${precioProHtml()}<div class="stack">${proBtn()}${clubLinkBtn()}</div>`;
    } else if (k === "pro") {
      let M = MODES[state.mode];
      t = "Plan Pro";
      h = `<p>Has llegado al límite del plan gratuito en <b>${esc(MN())}</b>: hasta ${M.maxP} jugadores y ${M.maxM} partidos.</p><p>Con el <b>plan Pro</b> tienes <b>jugadores y partidos ilimitados</b> y <b>varios equipos</b> en Fútbol 7, Fútbol 11 y Fútbol sala, y todas las novedades.</p>${precioProHtml()}<div class="stack">${proBtn()}${clubLinkBtn()}</div>`;
    } else if (k === "account") {
      delStep = false;
      t = "Mi cuenta";
      h = `${miPerfilHtml()}<p>Sesión iniciada como <b>${esc(curEmail)}</b></p><p>Plan: <b>${plan === "pro" ? (club && club.activo ? "Pro · gracias a tu club" : enPrueba() ? "Pro · modo prueba" : "Pro · sin límites") : "Gratuito"}</b></p>${enPrueba() ? `<p class="pro-fin">Estás en <b>modo prueba</b>: tienes el plan Pro gratis hasta el <b>${esc(fechaLarga(pruebaHasta))}</b> (${diasQuedan(pruebaHasta) === 1 ? "queda 1 día" : "quedan " + diasQuedan(pruebaHasta) + " días"}). Después pasarás al plan gratuito.</p>` : ""}${plan === "pro" && proHasta ? `<p class="pro-fin">Has cancelado tu suscripción. Tu plan Pro estará activo hasta el <b>${esc(fechaLarga(proHasta))}</b>; después pasarás al plan gratuito. Si cambias de idea, puedes reactivarla en «Gestionar o cancelar mi suscripción».</p>` : ""}${plan === "pro" ? "" : usageHtml()}<div class="stack">${enAndroid ? "" : plan === "pro" ? (c.portalUrl && (pagoActivo || stripeCliente) ? `<a class="secondary" href="${esc(c.portalUrl + (c.portalUrl.includes("?") ? "&" : "?") + "prefilled_email=" + encodeURIComponent(curEmail) + "&locale=es")}" target="_blank" rel="noopener" data-pro-portal>Gestionar o cancelar mi suscripción</a>` : "") : '<button type="button" class="primary" data-info="pro">Pasar a Pro · 39,99 €/año</button>'}<button type="button" class="secondary" data-info="club">${club ? "Mi club: " + esc(club.nombre) : "Plan para clubes"}</button><button type="button" class="secondary" data-acct="entrenos" aria-pressed="${entrenosOn()}">${entrenosOn() ? "Desactivar el control de entrenamientos" : "Activar el control de entrenamientos"}</button>${dispOk ? `<button type="button" class="secondary" data-dsp-ver>Mis dispositivos</button>` : ""}<button type="button" class="secondary" data-info="ayuda">Guía de uso</button><button type="button" class="secondary" data-acct="tutorial">Ver el tutorial</button><button type="button" class="secondary" data-acct="novedades">Novedades de esta versión</button><button type="button" class="secondary" data-acct="export">Descargar mis datos</button><button type="button" class="secondary" data-info="privacy">Política de privacidad</button><button type="button" class="secondary" data-info="terms">Términos de uso</button><button type="button" class="secondary" data-acct="logout">Cerrar sesión</button><button type="button" class="danger" data-acct="delete">Borrar mi cuenta y mis datos</button></div>`;
    } else if (k === "club") {
      t = club ? club.nombre : "Plan para clubes";
      h = clubHtml();
    } else if (k === "ayuda") {
      t = "Guía de uso";
      h = ayudaHtml();
    } else if (k === "novedades") {
      let n = novedades || { version: appVer(), lista: [] };
      t = "Novedades · versión " + n.version;
      h = `<p>Esto es lo nuevo en Mi Fútbol JV32:</p><ul class="novedades">${n.lista.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><div class="stack"><button type="button" class="primary" data-acct="novedades-ok">Entendido</button></div>`;
    } else [t, h] = legalHtml(k);
    $("infoTitle").textContent = t;
    $("infoBody").innerHTML = h;
    $("info").classList.remove("hidden");
    $("infoBody").scrollTop = 0;
    if ((k === "pro" || k === "proteam") && !pagoActivo && !enAndroid)
      checkWaitlist();
  }
  function clubLinkBtn() {
    return club ? "" : '<button type="button" class="secondary" data-info="club">¿Tu club paga la app? Plan para clubes</button>';
  }
  const pagoClubActivo = (c.clubPacks || []).some((p) => p.url && (!/\/test_/.test(p.url) || probarPago));
  function clubPackLink(p) {
    return (
      p.url +
      (p.url.includes("?") ? "&" : "?") +
      "client_reference_id=club_" + encodeURIComponent(club.id) +
      "&prefilled_email=" + encodeURIComponent(curEmail) +
      "&locale=es"
    );
  }
  function clubPacksHtml(conPago) {
    if (enAndroid) return "";
    let packs = c.clubPacks || [];
    if (!packs.length) return "";
    return `<div class="packs">${packs
      .map((p) => {
        let precio = `<span class="pk-n">${p.plazas} entrenadores</span><span class="pk-p">${esc(p.precio)} €<small>/año</small></span><span class="pk-u">${(parseFloat(String(p.precio).replace(",", ".")) / p.plazas).toFixed(2).replace(".", ",")} € por entrenador</span>`;
        return conPago && pagoClubActivo
          ? `<a class="pack" href="${esc(clubPackLink(p))}" target="_blank" rel="noopener" data-club-pay>${precio}</a>`
          : `<div class="pack">${precio}</div>`;
      })
      .join("")}</div><p class="muted">IVA incluido · renovación anual · cancela cuando quieras.${conPago && !pagoClubActivo ? ` Muy pronto podrás contratarlo desde aquí; mientras, escríbenos a ${esc(c.contactEmail || "")}.` : ""}</p>`;
  }
  function clubHtml() {
    const privado =
      '<p class="pro-fin">Los entrenadores <b>no ven nada de los demás</b>. Solo el <b>supervisor del club</b> (el encargado y quien él nombre) puede <b>ver, sin cambiar nada</b>, los equipos, jugadores, partidos, alineaciones, convocatorias y entrenamientos de cada entrenador que lo acepte. Nunca ve tu contraseña ni los datos de tu cuenta.</p>';
    if (!club)
      return `<p>Con el <b>plan para clubes</b>, el club paga una sola suscripción y <b>todos sus entrenadores tienen el plan Pro</b>.</p>${privado}<h3>Me ha dado un código mi club</h3><label>Código del club<input id="clubCod" autocomplete="off" autocapitalize="characters" maxlength="14" placeholder="Ej.: K7M2Q9XA4P"></label><label class="chk"><input type="checkbox" id="clubAcepto"><span>Acepto que el supervisor del club vea mis equipos, jugadores, partidos y entrenamientos (solo mirar, sin poder cambiarlos). Puedo dejar de compartirlos cuando quiera.</span></label><div class="stack"><button type="button" class="primary" data-acct="club-unirse">Unirme al club</button></div><h3>Soy el encargado del club</h3><p>Crea el club, elige el pack y comparte el código con tus entrenadores.</p>${clubPacksHtml(false)}<label>Nombre del club<input id="clubNom" maxlength="60" autocomplete="organization"></label><div class="stack"><button type="button" class="secondary" data-acct="club-crear">Crear el club</button></div>`;
    let estado = club.activo
      ? `<p>Estado: <b>activo</b>${club.soy_admin ? ` · ${club.usadas} de ${club.plazas} entrenadores` : ""}. ${club.soy_admin ? "Todos los entrenadores del club tienen el plan Pro." : "Tienes el plan Pro gracias a tu club."}</p>${club.pro_hasta ? `<p class="pro-fin">La suscripción del club está cancelada. El plan Pro del club estará activo hasta el <b>${esc(fechaLarga(club.pro_hasta))}</b>.</p>` : ""}`
      : `<p>Estado: <b>pendiente de pago</b>. ${club.soy_admin ? "Cuando el club pague, todos sus entrenadores tendrán el plan Pro." : "Cuando el club pague, tendrás el plan Pro."}</p>`;
    if (!club.soy_admin)
      return `${escudoVer()}${estado}${compartirHtml()}${club.soy_supervisor ? supervisarHtml() : privado}${perfilEnClub()}<div class="stack"><button type="button" class="danger" data-acct="club-salir">Salir del club</button></div>`;
    let enlace = location.origin + location.pathname + "?club=" + encodeURIComponent(club.codigo);
    let wa = "https://wa.me/?text=" + encodeURIComponent(`Únete al club ${club.nombre} en Mi Fútbol JV32 y tendrás el plan Pro. Entra en Mi cuenta › Plan para clubes y escribe este código: ${club.codigo}\n${enlace}`);
    let lista = arbolHtml(club.miembros || [], true);
    let pago = enAndroid
      ? ""
      : club.activo
        ? c.portalUrl && club.pagado
          ? `<a class="secondary" href="${esc(c.portalUrl + (c.portalUrl.includes("?") ? "&" : "?") + "prefilled_email=" + encodeURIComponent(curEmail) + "&locale=es")}" target="_blank" rel="noopener" data-pro-portal>Gestionar la suscripción del club</a>`
          : ""
        : "";
    return `${escudoVer()}${estado}<h3>Código para tus entrenadores</h3><p class="club-cod">${esc(club.codigo)}</p><p class="muted">Cada entrenador entra con su propia cuenta en «Mi cuenta › Plan para clubes» y escribe este código.</p><div class="hbtns"><button type="button" class="secondary" data-acct="club-copiar">Copiar</button><a class="secondary" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a><button type="button" class="secondary" data-acct="club-codigo">Cambiar</button></div>${club.activo ? "" : `<h3>Elige el pack del club</h3>${clubPacksHtml(true)}`}<h3>Entrenadores del club</h3>${privado}${club.soy_supervisor && club.activo ? '<p class="muted">Toca a un entrenador para ver sus datos. Pulsa «Hacer supervisor» para que otra persona del club (por ejemplo, el director deportivo) también pueda verlos.</p>' : ""}${lista}${compartirHtml()}${escudoEditar()}${perfilEnClub()}<div class="stack">${pago}${club.activo ? "" : '<button type="button" class="danger" data-acct="club-borrar">Borrar el club</button>'}</div>`;
  }
  /* Supervisor del club (supabase-supervisor.sql). Si el servidor aún no lo tiene,
     mi_club no trae «comparto» y no se muestra nada de esto. */
  function compartirHtml() {
    if (!club || club.comparto === undefined) return "";
    if (club.soy_admin && club.comparto === false && !(club.miembros || []).some((m) => m.supervisor && !m.admin)) return "";
    return club.comparto
      ? `<h3>Supervisor del club</h3><p>Compartes tus datos con el supervisor del club: puede ver tus equipos, jugadores, partidos y entrenamientos, pero no cambiarlos. Los demás entrenadores no ven nada.</p><div class="stack"><button type="button" class="secondary" data-acct="club-nocompartir">Dejar de compartir mis datos</button></div>`
      : `<h3>Supervisor del club</h3><p class="pro-fin">El supervisor de tu club (el encargado y quien él nombre) puede ver, sin cambiar nada, los equipos, jugadores, partidos, alineaciones, convocatorias y entrenamientos de los entrenadores que lo aceptan. Nunca ve tu contraseña ni los datos de tu cuenta, y los demás entrenadores no ven nada. <b>Ahora mismo no compartes tus datos.</b></p><div class="stack"><button type="button" class="primary" data-acct="club-compartir">Aceptar y compartir mis datos</button></div>`;
  }
  const verEstado = (m) =>
    m.comparte === undefined || m.id === curUser ? "" : m.comparte ? "" : " · Aún no comparte sus datos";
  const puedeVer = (m) => club.soy_supervisor && club.activo && m.comparte && m.id !== curUser;
  const fotoDe = (m) =>
    m && m.foto && String(m.foto).startsWith("data:")
      ? `<img class="avatar" src="${esc(m.foto)}" alt="">`
      : `<div class="avatar">${esc(((m && (m.nombre || m.email)) || "?")[0].toUpperCase())}</div>`;
  /* Árbol del club: arriba el escudo y el nombre, debajo cada entrenador con su foto.
     El supervisor toca a un entrenador para ver sus datos (solo lectura). */
  function arbolHtml(miembros, gestion) {
    let hojas = miembros
      .map((m) => {
        let rol = m.admin ? "Encargado" : m.supervisor ? "Supervisor" : "Entrenador";
        if (gestion && !m.admin && m.desde) rol += " · Desde el " + esc(fechaLarga(m.desde));
        let dentro = `${fotoDe(m)}<span><b>${esc(m.nombre || m.email || "")}</b><small>${m.nombre && m.email ? esc(m.email) + " · " : ""}${rol}${verEstado(m)}</small></span>`;
        let per = puedeVer(m)
          ? `<button type="button" class="an-p" data-acct="club-ver" data-id="${esc(m.id)}" aria-label="Ver los datos de ${esc(m.nombre || m.email || "")}">${dentro}<em class="an-ver">Ver</em></button>`
          : `<div class="an-p">${dentro}</div>`;
        let bot = !gestion
          ? ""
          : (m.admin || m.supervisor === undefined ? "" : `<button type="button" class="lnk" data-acct="club-sup" data-id="${esc(m.id)}" data-si="${m.supervisor ? "" : "1"}" data-mail="${esc(m.email || "")}">${m.supervisor ? "Quitar supervisor" : "Hacer supervisor"}</button>`) +
            (m.admin ? "" : `<button type="button" class="lnk" data-acct="club-quitar" data-id="${esc(m.id)}" data-mail="${esc(m.email || "")}">Quitar</button>`);
        return `<li class="an">${per}${bot ? `<span class="an-b">${bot}</span>` : ""}</li>`;
      })
      .join("");
    let raiz = club.escudo ? `<img class="club-esc-p" src="${esc(club.escudo)}" alt="">` : `<span class="club-esc-p sin">${ic("shield", 22)}</span>`;
    return `<div class="arbol"><div class="arbol-r">${raiz}<b>${esc(club.nombre)}</b></div>${hojas ? `<ul>${hojas}</ul>` : '<p class="muted">Aún no hay más entrenadores en el club.</p>'}</div>`;
  }
  function supervisarHtml() {
    return `<h3>Eres supervisor del club</h3><p class="muted">${club.activo ? "Toca a un entrenador para ver sus equipos, jugadores, partidos y entrenamientos. Solo puedes mirar: no puedes cambiar nada." : "Podrás ver los datos de los entrenadores cuando el club esté pagado."}</p>${arbolHtml((club.miembros || []).filter((m) => m.id !== curUser), false)}`;
  }
  /* Escudo del club (supabase-escudo.sql). Sin ese SQL, mi_club no trae «escudo» y no se ofrece. */
  const escudoVer = () =>
    club && club.escudo ? `<div class="club-escudo"><img src="${esc(club.escudo)}" alt="Escudo de ${esc(club.nombre)}"></div>` : "";
  function escudoEditar() {
    if (!club || !club.soy_admin || !("escudo" in club)) return "";
    return `<h3>Escudo del club</h3><p class="muted">Lo verán todos los entrenadores del club, arriba junto al logo de la app.</p><div class="hbtns"><label class="secondary file-btn">${club.escudo ? "Cambiar el escudo" : "Subir el escudo"}<input type="file" id="escFile" accept="image/*"></label>${club.escudo ? '<button type="button" class="secondary" data-acct="club-escudo-quitar">Quitar</button>' : ""}</div>`;
  }
  /* Foto de perfil y nombre (supabase-escudo.sql), en «Mi cuenta» para todos.
     Si estás en un club, también los ve su supervisor, para saber de quién es cada cuenta. */
  function miPerfilHtml() {
    if (!perfil) return "";
    let quien = club
      ? "Tu foto de perfil la ves tú y el supervisor de tu club, para saber de quién es cada cuenta. Los demás entrenadores no la ven."
      : "Tu foto de perfil sale arriba en el botón de tu cuenta. Si te unes a un club, también la verá su supervisor.";
    return `<div class="perfil-c">${fotoDe({ foto: perfil.foto, nombre: perfil.nombre, email: curEmail })}<label>Tu nombre<input id="perfNom" maxlength="40" autocomplete="name" value="${esc(perfil.nombre)}" placeholder="Ej.: Luis García"></label></div><p class="muted">${quien}</p><div class="hbtns"><label class="secondary file-btn">${perfil.foto ? "Cambiar mi foto" : "Poner mi foto"}<input type="file" id="perfFoto" accept="image/*"></label>${perfil.foto ? '<button type="button" class="secondary" data-acct="perfil-foto-quitar">Quitar la foto</button>' : '<button type="button" class="secondary" data-acct="perfil-guardar">Guardar el nombre</button>'}</div>${perfil.foto ? '<div class="stack"><button type="button" class="secondary" data-acct="perfil-guardar">Guardar el nombre</button></div>' : ""}`;
  }
  const perfilEnClub = () =>
    perfil && club && club.comparto !== undefined && !perfil.foto
      ? '<p class="muted">Pon tu foto de perfil en «Mi cuenta» para que el supervisor del club sepa de quién es tu cuenta.</p><div class="stack"><button type="button" class="secondary" data-info="account">Poner mi foto</button></div>'
      : "";
  async function guardarPerfil(nombre, foto, ok) {
    let r = await db.rpc("guardar_mi_perfil", { nombre: nombre || null, foto: foto || null });
    if (r && r.error) return note(clubMsg(r.error));
    await loadPlan();
    if (club) await loadClub();
    pintarCuenta();
    showInfo("account");
    note(ok, true);
  }
  /* El botón de la cuenta, arriba, enseña tu foto si la has puesto */
  let acctIcono = null;
  function pintarCuenta() {
    let b = $("acct");
    if (!b) return;
    if (acctIcono === null) acctIcono = b.innerHTML;
    let f = perfil && perfil.foto;
    b.classList.toggle("con-foto", !!f);
    b.innerHTML = f ? `<img src="${esc(f)}" alt="">` : acctIcono;
  }
  async function verEntrenador(id) {
    let r = await db.rpc("club_datos_entrenador", { entrenador: id });
    if (!r || r.error || !r.data) return note(clubMsg(r && r.error));
    let d = r.data;
    if (!viendo)
      viendo = {
        guardado: {
          players: state.players, matches: state.matches, teams: state.teams, teamsOk: state.teamsOk,
          trainings: state.trainings, trOk: state.trOk, team: state.team, tab: state.tab,
        },
      };
    viendo.id = id;
    viendo.email = d.email || "";
    viendo.m = ((club && club.miembros) || []).find((x) => x.id === id) || { email: viendo.email };
    state.players = d.jugadores || [];
    state.matches = (d.partidos || []).map((m) => ({
      ...m,
      participaciones: parseJson(m.participaciones, []),
      alineacion: parseJson(m.alineacion, {}),
    }));
    state.teams = d.equipos || [];
    state.teamsOk = true;
    state.trainings = (d.entrenamientos || []).map((x) => ({ ...x, asistencia: parseJson(x.asistencia, {}) }));
    state.trOk = true;
    state.team = {};
    state.tab = "plantilla";
    state.draft = state.live = null;
    state.editing = null;
    document.body.classList.add("solo-ver");
    let bar = $("verBar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "verBar";
      bar.className = "ver-bar";
      document.querySelector("main.wrap").prepend(bar);
    }
    bar.innerHTML = `<span>${viendo.m.foto ? fotoDe(viendo.m) : ic("eye", 18)}Viendo a <b>${esc(viendo.m.nombre ? viendo.m.nombre + " (" + viendo.email + ")" : viendo.email)}</b> · solo lectura</span><button type="button" class="secondary small" data-ver-salir>Volver a mis datos</button>`;
    $("info").classList.add("hidden");
    render();
    window.scrollTo(0, 0);
  }
  function salirVer() {
    if (!viendo) return;
    Object.assign(state, viendo.guardado);
    state.draft = state.live = null;
    state.editing = null;
    viendo = null;
    document.body.classList.remove("solo-ver");
    let bar = $("verBar");
    if (bar) bar.remove();
    render();
  }
  /* Mientras se mira a otro entrenador, los botones que cambian datos no hacen nada */
  const VER_BLOQUEA =
    '[data-action="add-player"],[data-action="edit-player"],[data-action="delete-player"],[data-action="add-match"],[data-action="delete-match"],[data-action="live"],[data-action="save"],[data-teamact],[data-tr="new"],[data-tr="del"],[data-tr="mark"],[data-tr="all"],[data-acct="export"]';
  document.addEventListener(
    "click",
    (e) => {
      if (!viendo || !e.target.closest) return;
      if (e.target.closest("[data-ver-salir]")) return salirVer();
      if (e.target.closest("#acct")) return salirVer();
      if (e.target.closest(VER_BLOQUEA)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        note(SOLO_VER);
      }
    },
    true,
  );
  async function clubAccion(w, ac) {
    if (w === "club-unirse") {
      let v = ($("clubCod").value || "").trim();
      if (!v) return note("Escribe el código que te ha dado tu club.");
      if ($("clubAcepto") && !$("clubAcepto").checked)
        return note("Para unirte al club tienes que aceptar que el supervisor del club pueda ver tus datos.");
      ac.disabled = true;
      let r = await clubRpc("unirse_club", { codigo: v, acepto: true }, true);
      if (r) note(club && club.activo ? "¡Ya estás en el club! Tienes el plan Pro." : "¡Ya estás en el club! Tendrás el plan Pro cuando el club pague.", true);
      else ac.disabled = false;
    } else if (w === "club-crear") {
      let v = ($("clubNom").value || "").trim();
      if (v.length < 2) return note(CLUB_ERR.CLUB_NOMBRE);
      ac.disabled = true;
      if (!(await clubRpc("crear_club", { nombre: v }))) ac.disabled = false;
      else note("Club creado. Ahora elige el pack y comparte el código con tus entrenadores.", true);
    } else if (w === "club-compartir") {
      if (await clubRpc("club_compartir", { si: true })) note("Gracias. El supervisor del club ya puede ver tus datos (sin cambiarlos).", true);
    } else if (w === "club-nocompartir") {
      if (!confirm("¿Dejar de compartir tus datos con el supervisor del club? El club puede decidir quitarte del club si no los compartes.")) return;
      if (await clubRpc("club_compartir", { si: false })) note("Has dejado de compartir tus datos con el supervisor.", true);
    } else if (w === "club-sup") {
      let si = !!ac.dataset.si;
      if (si && !confirm(`¿Hacer supervisor a ${ac.dataset.mail}? Podrá ver (sin cambiar) los datos de los entrenadores del club que los compartan.`)) return;
      if (await clubRpc("club_hacer_supervisor", { entrenador: ac.dataset.id, si }))
        note(si ? "Ahora es supervisor del club." : "Ya no es supervisor del club.", true);
    } else if (w === "club-ver") {
      ac.disabled = true;
      await verEntrenador(ac.dataset.id);
      ac.disabled = false;
    } else if (w === "club-salir") {
      if (!confirm("¿Salir del club? Perderás el plan Pro del club. Tus equipos, jugadores y partidos se quedan en tu cuenta.")) return;
      if (await clubRpc("salir_club")) note("Has salido del club.", true);
    } else if (w === "club-quitar") {
      if (!confirm(`¿Quitar a ${ac.dataset.mail} del club? Perderá el plan Pro del club, pero conservará su cuenta y sus datos.`)) return;
      if (await clubRpc("quitar_del_club", { entrenador: ac.dataset.id })) note("Entrenador quitado del club.", true);
    } else if (w === "club-codigo") {
      if (!confirm("¿Cambiar el código? El código antiguo dejará de valer. Los entrenadores que ya están en el club siguen en él.")) return;
      if (await clubRpc("club_cambiar_codigo")) note("Código cambiado.", true);
    } else if (w === "club-borrar") {
      if (!confirm("¿Borrar el club? Todos los entrenadores saldrán del club. Sus cuentas y sus datos no se tocan.")) return;
      if (await clubRpc("borrar_club")) note("Club borrado.", true);
    } else if (w === "club-escudo-quitar") {
      if (!confirm("¿Quitar el escudo del club?")) return;
      if (await clubRpc("club_escudo", { escudo: null })) note("Escudo quitado.", true);
    } else if (w === "club-copiar") {
      try {
        await navigator.clipboard.writeText(club.codigo);
        note("Código copiado.", true);
      } catch (e) {
        note("Código: " + club.codigo);
      }
    }
  }
  /* Subir el escudo del club o la foto del entrenador: se reduce y se guarda al momento */
  document.addEventListener("change", async (e) => {
    let t = e.target,
      f = t && t.files && t.files[0];
    if (!f || (t.id !== "escFile" && t.id !== "perfFoto")) return;
    t.disabled = true;
    try {
      if (t.id === "escFile") {
        let img = await imagenPeque(f, 256, 140000, true);
        if (await clubRpc("club_escudo", { escudo: img })) note("Escudo guardado. Ya lo ven todos los entrenadores del club.", true);
      } else {
        let img = await imagenPeque(f, 200, 50000, false);
        await guardarPerfil((($("perfNom") || {}).value || "").trim(), img, "Foto guardada.");
      }
    } catch (er) {
      note(er.message || "No se ha podido usar esa imagen. Prueba con otra.");
    }
    t.disabled = false;
    t.value = "";
  });
  $("acct").onclick = () => showInfo("account");
  $("closeInfo").onclick = () => $("info").classList.add("hidden");
  document.addEventListener("click", async (e) => {
    if (e.target.closest("[data-pro-pay]")) payPending = true;
    if (e.target.closest("[data-club-pay]")) clubPending = true;
    if (e.target.closest("[data-pro-portal]")) portalPending = true;
    let lg = e.target.closest("[data-legal]");
    if (lg) {
      e.preventDefault();
      showInfo(lg.dataset.legal);
      return;
    }
    if (e.target.id === "info") {
      $("info").classList.add("hidden");
      return;
    }
    let inf = e.target.closest("#info [data-info]");
    if (inf) {
      showInfo(inf.dataset.info);
      return;
    }
    let ac = e.target.closest("#info [data-acct]");
    if (!ac) return;
    let w = ac.dataset.acct;
    if (w.startsWith("club-")) return clubAccion(w, ac);
    if (w === "perfil-guardar" || w === "perfil-foto-quitar") {
      let quitar = w === "perfil-foto-quitar";
      if (quitar && !confirm("¿Quitar tu foto de perfil?")) return;
      return guardarPerfil(($("perfNom").value || "").trim(), quitar ? null : perfil.foto, quitar ? "Foto quitada." : "Guardado.");
    }
    if (w === "tutorial") {
      $("info").classList.add("hidden");
      tutOpen();
      return;
    }
    if (w === "entrenos") {
      let on = !entrenosOn();
      if (!on && state.trainings.length &&
        !confirm("¿Quitar la pestaña «Entrenos»? Tus entrenamientos no se borran: si la vuelves a activar, seguirán ahí."))
        return;
      setEntrenos(on);
      $("info").classList.add("hidden");
      if (on && leaveDraft()) {
        state.tab = "entrenos";
        state.draft = null;
        state.live = null;
      }
      render();
      note(on ? "Control de entrenamientos activado: lo tienes en la pestaña «Entrenos»." : "Control de entrenamientos desactivado.", true);
      return;
    }
    if (w === "novedades-ok") {
      $("info").classList.add("hidden");
      return;
    }
    if (w === "novedades") {
      let n = await novedadesCarga();
      if (n && n.lista.length) showInfo("novedades");
      else note("No hay novedades que mostrar ahora mismo.");
      return;
    }
    if (w === "waitlist") {
      let b = $("wl");
      if (b.disabled) return;
      b.disabled = true;
      let r = await db.from("interesados_pro").insert({ email: curEmail });
      if (
        r.error &&
        !/duplicate|23505|unique/i.test(
          (r.error.code || "") + (r.error.message || ""),
        )
      ) {
        b.disabled = false;
        note(r.error.message);
        return;
      }
      markWaitlisted();
      return;
    }
    if (w === "logout") {
      $("info").classList.add("hidden");
      doLogout();
    }
    if (w === "export") {
      let data = {
          exportado: new Date().toISOString(),
          email: curEmail,
          equipos: state.teams,
          jugadores: state.players,
          partidos: state.matches,
          entrenamientos: state.trainings,
          circuitos: state.circs,
          mis_ejercicios: state.ejGuard,
          directos: Object.values(liveRows),
          ...(perfil ? { perfil } : {}),
        },
        url = URL.createObjectURL(
          new Blob([JSON.stringify(data, null, 1)], {
            type: "application/json",
          }),
        ),
        a = document.createElement("a");
      a.href = url;
      a.download = "mi-futbol-jv32-datos.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      note("Datos descargados.", true);
    }
    if (w === "delete") {
      $("infoTitle").textContent = "Borrar mi cuenta";
      $("infoBody").innerHTML =
        `<p>Se borrarán <b>para siempre</b> tu cuenta, tus jugadores, partidos y estadísticas. No se puede deshacer. Si quieres conservar algo, descarga antes tus datos.</p>${plan === "pro" && c.portalUrl && (pagoActivo || stripeCliente) ? "<p><b>Si pagas el plan Pro</b>, cancela antes la suscripción en «Gestionar o cancelar mi suscripción»; borrar la cuenta no la cancela.</p>" : ""}<label>Escribe BORRAR para confirmar<input id="delConf" autocomplete="off"></label><div class="stack"><button type="button" class="danger" data-acct="delete2">Borrar definitivamente</button></div>`;
    }
    if (w === "delete2") {
      if ($("delConf").value.trim().toUpperCase() !== "BORRAR")
        return note("Escribe BORRAR para confirmar.");
      ac.disabled = true;
      let r = await db.rpc("borrar_mi_cuenta");
      if (r.error) {
        ac.disabled = false;
        return note(clubMsg(r.error));
      }
      $("info").classList.add("hidden");
      saliendo = true;
      try {
        localStorage.removeItem("mf_sesion_copia");
        localStorage.removeItem("mf_directo_abierto");
      } catch (e) {}
      await db.auth.signOut();
      loginNote("Tu cuenta y tus datos se han borrado.", true);
    }
  });
  $("playerForm").onsubmit = async (e) => {
    try {
      await savePlayer(e);
    } catch (x) {
      note(x.message);
    }
  };
  $("closeModal").onclick = () => $("modal").classList.add("hidden");
  function leaveDraft() {
    let d = state.draft;
    if (viendo || !d || !(d.players.length || d.rival || d.gf || d.gc)) return true;
    return confirm("Tienes un partido sin guardar. ¿Salir sin guardar?");
  }
  function openModal() {
    $("modal").classList.remove("hidden");
    setTimeout(() => {
      try {
        $("playerForm").nombre.focus();
      } catch (e) {}
    }, 30);
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      $("modal").classList.add("hidden");
      $("info").classList.add("hidden");
    }
  });
  document.addEventListener("click", (e) => {
    if (state.justDragged) return;
    if (e.target.closest("[data-dismiss]")) {
      $("message").innerHTML = "";
      return;
    }
    if (e.target.id === "modal") {
      $("modal").classList.add("hidden");
      return;
    }
    let im = e.target.closest("[data-img]");
    if (im) {
      imgExport(im.dataset.img).catch((x) =>
        note("No se pudo crear la imagen: " + x.message),
      );
      return;
    }
    let tm = e.target.closest("[data-team]");
    if (tm) {
      if (tm.dataset.team === curTeam() || !leaveDraft()) return;
      pickTeam(tm.dataset.team);
      state.draft = null;
      state.live = null;
      render();
      return;
    }
    let ta = e.target.closest("[data-teamact]");
    if (ta) {
      teamAct(ta.dataset.teamact);
      return;
    }
    let mode = e.target.closest("[data-mode]"),
      tab = e.target.closest("[data-tab]"),
      a = e.target.closest("[data-action]");
    if (mode) {
      if (!leaveDraft()) return;
      state.mode = mode.dataset.mode;
      state.tab = "plantilla";
      state.draft = null;
      state.live = null;
      render();
    } else if (tab) {
      if (!leaveDraft()) return;
      state.tab = tab.dataset.tab;
      state.draft = null;
      state.live = null;
      render();
    } else if (a) {
      let id = a.dataset.id;
      if (a.dataset.action === "add-player") {
        if (full("p")) {
          showInfo("pro");
          return;
        }
        state.playerId = null;
        $("playerForm").reset();
        $("modalTitle").textContent = "Nuevo jugador";
        openModal();
      }
      if (a.dataset.action === "edit-player") {
        let p = state.players.find((x) => x.id === id);
        state.playerId = id;
        $("playerForm").nombre.value = p.nombre;
        $("playerForm").dorsal.value = dorsal(p);
        $("modalTitle").textContent = "Editar jugador";
        openModal();
      }
      if (a.dataset.action === "delete-player")
        remove("futbol_personal_jugadores", id);
      if (a.dataset.action === "add-match") {
        if (full("m")) {
          showInfo("pro");
          return;
        }
        state.editing = null;
        resetDraft();
      }
      if (a.dataset.action === "edit-match") {
        state.editing = id;
        resetDraft(state.matches.find((x) => x.id === id));
      }
      if (a.dataset.action === "delete-match")
        remove("futbol_personal_partidos", id);
      if (a.dataset.action === "live") openLive(id);
      if (a.dataset.action === "cancel") {
        state.draft = null;
        state.editing = null;
        render();
      }
      if (a.dataset.action === "save") saveMatch();
    }
    if (!state.draft) return;
    let slot = e.target.closest("button[data-slot]"),
      chip = e.target.closest("[data-chip]"),
      pick = e.target.closest("[data-pick]"),
      clear = e.target.closest("[data-clear]"),
      wipe = e.target.closest("[data-wipe]");
    if (slot) {
      let i = Number(slot.dataset.slot);
      if (state.selectedChip) {
        if (place(i, state.selectedChip)) {
          state.selectedChip = null;
          state.selectedSlot = null;
        }
      } else state.selectedSlot = state.selectedSlot === i ? null : i;
      render();
    } else if (chip) {
      let id = chip.dataset.chip;
      if (state.selectedSlot !== null) {
        if (place(state.selectedSlot, id)) state.selectedSlot = null;
      } else state.selectedChip = state.selectedChip === id ? null : id;
      render();
    } else if (pick && state.selectedSlot !== null) {
      if (place(state.selectedSlot, pick.dataset.pick))
        state.selectedSlot = null;
      render();
    } else if (clear && state.selectedSlot !== null) {
      unplace(state.selectedSlot);
      state.selectedSlot = null;
      render();
    } else if (wipe) {
      clearField();
      render();
    }
  });
  $("view").addEventListener("change", (e) => {
    if (e.target.id === "formation") {
      state.draft.alineacion.formation = e.target.value;
      render();
    }
    if (e.target.dataset.field)
      change(e.target.dataset.field, e.target.dataset.id, e.target);
    let d = state.draft;
    if (!d) return;
    if (e.target.id === "mdParte") {
      let v = parseInt(e.target.value);
      if (v >= 5 && v <= 60) d.alineacion.parte = v;
      else e.target.value = mdParte(d, state.editing);
    }
    if (e.target.id === "mdCap" || e.target.id === "mdGk") {
      let k = e.target.id === "mdCap" ? "capitan" : "portero";
      if (e.target.value) d.alineacion[k] = e.target.value;
      else delete d.alineacion[k];
      render();
    }
    let ds = e.target.dataset;
    if (ds.mdst) {
      let p = d.players.find((z) => z.id === ds.mdst),
        v = Math.min(999, Math.max(0, parseInt(e.target.value) || 0));
      if (p) stSet(p, ds.k, v, true);
    }
    if (ds.mdfal) {
      let v = Math.min(99, Math.max(0, parseInt(e.target.value) || 0)),
        F = { ...(d.alineacion.faltas || {}) };
      delete F.lv;
      F[ds.mdfal] = v;
      d.alineacion.faltas = F;
    }
    if (ds.mdr) {
      let v = Math.min(999, Math.max(0, parseInt(e.target.value) || 0));
      if (v) d.alineacion.estR = { ...(d.alineacion.estR || {}), tir: v };
      else delete d.alineacion.estR;
    }
    let md = e.target.dataset.md;
    if (md) {
      let z = mdList(d.alineacion, md)[Number(e.target.dataset.i)],
        k = e.target.dataset.k;
      if (!z) return;
      if (k === "m") {
        let v = parseInt(e.target.value);
        z.m = v >= 0 ? Math.min(130, v) : "";
      } else if (md.endsWith("R") && k !== "n" && k !== "c") {
        let v = parseInt(e.target.value);
        z[k] = v >= 0 && v <= 99 ? String(v) : "";
      } else z[k] = k === "n" ? e.target.value.trim().slice(0, 30) : e.target.value;
      delete z.lv;
    }
  });
  $("view").addEventListener("input", (e) => {
    if (
      e.target.dataset.field &&
      ["minutes", "goals"].includes(e.target.dataset.field)
    )
      change(e.target.dataset.field, e.target.dataset.id, e.target);
    if (e.target.id === "date" && state.draft)
      state.draft.fecha = e.target.value;
    if (e.target.id === "rival" && state.draft)
      state.draft.rival = e.target.value;
    if (e.target.id === "gf" && state.draft) state.draft.gf = e.target.value;
    if (e.target.id === "gc" && state.draft) state.draft.gc = e.target.value;
  });

  /* ===== Directo: marcador en vivo con enlace para compartir ===== */
  let liveRows = {},
    liveSkew = 0,
    liveQ = Promise.resolve(),
    pubRow = null;
  const LIVE_PARTE = { 11: 45, 7: 30, fs: 20 },
    LIVE_EST = {
      pre: "Sin empezar",
      "1T": "1ª parte",
      DES: "Descanso",
      "2T": "2ª parte",
      FIN: "Final",
    },
    liveOn = (x) => !!x && ["1T", "DES", "2T"].includes(x.estado),
    serverNow = () => Date.now() + liveSkew,
    liveUrl = (x) => location.origin + location.pathname + "?directo=" + x.id,
    anotUrl = (x) => location.origin + location.pathname + "?anotar=" + x.anotador,
    liveErr = (t) =>
      /directos|does not exist|schema cache|ver_directo/i.test(t || "")
        ? "El directo aún no está activado en la base de datos (falta ejecutar supabase-directo.sql en Supabase)."
        : t;
  async function loadLive() {
    try {
      let r = await db.from("directos").select("*");
      /* Si falla (sin cobertura) se queda lo que ya había, para no perder el directo abierto */
      if (r.error || !Array.isArray(r.data)) return;
      liveRows = {};
      r.data.forEach((x) => {
        x._seen = new Set((Array.isArray(x.eventos) ? x.eventos : []).map((e) => e.id));
        liveRows[x.partido_id] = x;
      });
    } catch (e) {}
  }
  function liveChip(id) {
    let x = liveRows[id];
    return liveOn(x)
      ? `<span class="res lv">● En directo ${x.gf}-${x.gc}</span> `
      : "";
  }
  function liveSync(row) {
    if (row && row.actualizado)
      liveSkew = Date.parse(row.actualizado) - Date.now();
  }
  function liveElapsed(x, now) {
    let t = Number(x.acum_ms) || 0;
    if (x.desde) t += Math.max(0, now - Date.parse(x.desde));
    return t;
  }
  function liveClock(x, now) {
    if (x.estado === "pre") return ["0'", "00:00"];
    if (x.estado === "DES") return ["Descanso", ""];
    if (x.estado === "FIN") return ["Final", ""];
    let ms = liveElapsed(x, now),
      min = Math.floor(ms / 60000) + (x.estado === "2T" ? x.parte_min : 0),
      ss = Math.floor(ms / 1000) % 60;
    return [
      min + 1 + "'",
      String(min).padStart(2, "0") + ":" + String(ss).padStart(2, "0"),
    ];
  }
  function liveMin(x) {
    if (x.estado === "pre") return 0;
    if (x.estado === "DES") return x.parte_min;
    if (x.estado === "FIN") return x.parte_min * 2;
    return (
      Math.floor(liveElapsed(x, serverNow()) / 60000) +
      1 +
      (x.estado === "2T" ? x.parte_min : 0)
    );
  }
  function liveBoard(x, now, own) {
    let c = liveClock(x, now);
    return `<div class="lv-board"><div class="lv-team">${own ? `<input id="lvTeam" value="${esc(x.equipo)}" maxlength="60" aria-label="Nombre de tu equipo" title="Toca para cambiar el nombre de tu equipo">` : `<span>${esc(x.equipo)}</span>`}</div><div class="lv-score" role="img" aria-label="Marcador ${x.gf} a ${x.gc}"><b>${x.gf}</b><i>-</i><b>${x.gc}</b></div><div class="lv-team"><span>${esc(x.rival)}</span></div></div><div class="lv-clock${x.desde ? " run" : ""}"><span class="lv-st">${x.estado === "1T" || x.estado === "2T" ? "● " + LIVE_EST[x.estado] : x.estado === "pre" ? LIVE_EST.pre : ""}</span><b data-lvmin>${c[0]}</b><small data-lvss>${c[1]}</small></div>${liveFalBoard(x)}`;
  }
  /* Faltas acumuladas por parte (t "fa" en los eventos; r:1 = del rival; p = parte) */
  function liveFal(x) {
    let f = { n1: 0, r1: 0, n2: 0, r2: 0 };
    (Array.isArray(x.eventos) ? x.eventos : []).forEach((e) => {
      if (e.t === "fa") f[(e.r ? "r" : "n") + (e.p === 2 ? 2 : 1)]++;
    });
    return f;
  }
  const lvParte = (x) => (x.estado === "2T" || x.estado === "FIN" ? 2 : 1);
  function liveFalBoard(x) {
    let f = liveFal(x),
      h = lvParte(x),
      fn = f["n" + h],
      fr = f["r" + h],
      fs = x.modalidad === "fs";
    if (x.estado === "pre" || !(fs || f.n1 || f.r1 || f.n2 || f.r2)) return "";
    /* Fútbol sala: desde la 6ª falta acumulada de cada parte, doble penalti */
    let dp = fs ? [fn >= 5 ? x.equipo : "", fr >= 5 ? x.rival || "Rival" : ""].filter(Boolean) : [];
    return `<div class="lv-fal" aria-label="Faltas acumuladas en la ${h}ª parte: ${esc(x.equipo)} ${fn}, ${esc(x.rival || "rival")} ${fr}"><b class="${fs && fn >= 5 ? "w" : ""}">${fn}</b><span>Faltas ${h}ª parte</span><b class="${fs && fr >= 5 ? "w" : ""}">${fr}</b></div>${dp.length ? `<p class="lv-dp">⚠️ ${esc(dp.join(" y "))}: ${dp.length > 1 ? "las próximas faltas son" : "la próxima falta es"} doble penalti</p>` : ""}`;
  }
  const lvN = (n, d) => (n ? (d ? d + " " : "") + n : d ? "Dorsal " + d : "—");
  function liveEvents(x, own) {
    let am = {},
      all = (Array.isArray(x.eventos) ? x.eventos : []).filter((e) => e.t !== "fa").map((e) => {
        let q = e.r ? "r:" + (e.d || e.n) : e.pid || e.n;
        if (e.t === "a") am[q] = (am[q] || 0) + 1;
        return { e, a2: e.t === "a" && am[q] === 2 };
      }),
      ev = all.reverse(),
      Q = { s: "el cambio", a: "la tarjeta", r: "la tarjeta" };
    return `<div class="lv-ev">${
      ev.length
        ? ev
            .map(({ e, a2 }) => {
              let m = Number(e.m) || 0,
                rv = e.r ? ` <small class="lv-rv">${esc(x.rival)}</small>` : "",
                body =
                  e.t === "s"
                    ? `<span class="lv-sub"><span class="in">▲ ${esc(lvN(e.ni, e.di))}</span><span class="out">▼ ${esc(lvN(e.n, e.d))}</span>${rv}</span>`
                    : e.t === "a" || e.t === "r"
                      ? `<span><i class="tj ${e.t}" aria-label="Tarjeta ${e.t === "r" ? "roja" : "amarilla"}"></i>${a2 ? '<i class="tj r" aria-label="y expulsión"></i>' : ""} ${esc(lvN(e.n, e.d))}${a2 ? " <small>2ª amarilla · expulsado</small>" : e.t === "r" ? " <small>expulsado</small>" : ""}${rv}</span>`
                      : `<span>⚽ ${esc(e.t === "c" ? x.rival : e.n ? lvN(e.n, e.d) : x.equipo)}${e.t !== "c" && e.n ? ` <small>${esc(x.equipo)}</small>` : ""}</span>`;
              return `<div class="lv-e ${e.t === "c" ? "c" : e.t === "s" ? "s" : e.t === "a" || e.t === "r" ? "t " + e.t : "f"}${e.r ? " rv" : ""}"><b>${m}'</b>${body}${own ? `<button class="ib d" data-lvdel="${esc(e.id)}" aria-label="Quitar ${Q[e.t] || "el gol"} del minuto ${m}" title="Quitar">${ic("x", 18)}</button>` : ""}</div>`;
            })
            .join("")
        : '<p class="muted">Aún no hay goles, cambios ni tarjetas.</p>'
    }</div>`;
  }
  /* Quién está en el campo según los titulares y lo apuntado en el Directo */
  function liveCampo(m, x) {
    let on = new Set(entries(m).filter((e) => e.starter).map((e) => e.id)),
      fuera = new Set(),
      am = {};
    (Array.isArray(x.eventos) ? x.eventos : []).forEach((e) => {
      if (e.r) return;
      if (e.t === "s") {
        on.delete(e.pid);
        if (e.pin && !fuera.has(e.pin)) on.add(e.pin);
      }
      if (e.t === "a") am[e.pid] = (am[e.pid] || 0) + 1;
      if (e.t === "r" || (e.t === "a" && am[e.pid] === 2)) {
        on.delete(e.pid);
        fuera.add(e.pid);
      }
    });
    return { on, fuera };
  }
  function liveView() {
    let m = state.matches.find((z) => z.id === state.live),
      x = liveRows[state.live];
    if (!m || !x) return "";
    let st = x.estado,
      run = !!x.desde,
      B = (k, t, cl = "secondary") =>
        `<button class="${cl}" data-live="${k}">${t}</button>`,
      ctl =
        st === "pre"
          ? `<label class="lv-dur">Minutos por parte${(() => { let c = catOf(m.modalidad, teamOf(m)); return c ? ` <small>(${esc(c[1])})</small>` : ""; })()}<input id="lvDur" type="number" min="5" max="60" inputmode="numeric" value="${x.parte_min}"></label>` +
            B("start", "Empezar partido", "primary")
          : st === "1T" || st === "2T"
            ? B(run ? "pause" : "resume", run ? "Pausar" : "Reanudar") +
              B(
                st === "1T" ? "half" : "end",
                st === "1T" ? "Descanso" : "Terminar partido",
                "primary",
              )
            : st === "DES"
              ? B("start2", "Empezar 2ª parte", "primary")
              : B("reopen", "Reabrir partido"),
      adj =
        st === "1T" || st === "2T"
          ? `<div class="lv-adj"><span class="muted">Ajustar minuto</span>${B("m-", "−1'")}${B("m+", "+1'")}</div>`
          : "",
      pick = state.livePick
        ? `<div class="lv-pick"><h3>¿Quién ha marcado?</h3><div class="slotmenu">${entries(
            m,
          )
            .map((e) => [e.id, name(e.id)])
            .sort((a, b) => a[1].localeCompare(b[1], "es"))
            .map(
              (e) =>
                `<button data-scorer="${esc(e[0])}">${esc(e[1])}</button>`,
            )
            .join(
              "",
            )}<button data-scorer="">Sin asignar</button><button class="danger" data-live="nopick">Cancelar</button></div></div>`
        : livePick2(m, x),
      al = m.alineacion || {},
      ids = entries(m).map((e) => e.id),
      gk = gkOf(al, ids),
      so = (v, ph) =>
        `<option value="">${ph}</option>` +
        ids
          .slice()
          .sort((a, b) => name(a).localeCompare(name(b), "es"))
          .map((id) => `<option value="${esc(id)}" ${id === v ? "selected" : ""}>${esc(dname(id))}</option>`)
          .join(""),
      capgk = ids.length
        ? `<div class="formgrid lv-cg"><label>Capitán<select id="lvCap">${so(al.capitan || "", "Sin capitán")}</select></label><label>Portero<select id="lvGk">${so(gk, "—")}</select></label></div>`
        : "";
    return `<section class="panel live"><div class="bar"><div><div class="kicker">Directo</div><h2>${MN()}</h2><p class="muted">${esc(fmtDate(m.fecha))}</p></div><button class="secondary small" data-live="close">${ic("back", 18)}Volver</button></div>${liveBoard(x, serverNow(), true)}<div class="lv-ctl">${ctl}</div>${adj}<div class="lv-ctl">${B("cam", ic("live", 18) + "Cámara: grabar el partido", "secondary lv-cam")}</div><div class="lv-goals">${B("gf", ic("plus", 18) + "Gol nuestro", "primary")}${B("gc", ic("plus", 18) + "Gol rival")}</div>${ids.length ? ventPanel(m, x) : ""}${ids.length ? `<div class="lv-ctl lv-more">${B("sub", "🔄 Cambio")}${B("ta", '<i class="tj a"></i>Amarilla')}${B("tr", '<i class="tj r"></i>Roja')}</div>` : ""}${pick}${capgk}${liveStats(m, x)}<h3 class="lv-h">Goles, cambios y tarjetas</h3>${liveEvents(x, true)}${anotHtml(x)}<div class="lv-share"><h3>Enlace para compartir</h3><p class="muted">Quien tenga el enlace verá los equipos, el marcador, el minuto, los goleadores, los cambios, las tarjetas y las faltas acumuladas, sin necesidad de cuenta. Las estadísticas de cada jugador solo las ves tú. Se actualiza solo.</p><input id="lvUrl" readonly value="${esc(liveUrl(x))}" aria-label="Enlace del directo"><div class="lv-ctl">${B("share", ic("share", 18) + "Compartir enlace", "primary")}${B("off", "Desactivar enlace", "danger")}</div></div></section>`;
  }
  /* Estadísticas en directo: eliges qué apuntar (robo, pérdida, tiro…) y tocas al jugador */
  function liveStats(m, x) {
    let es = entries(m);
    if (!es.length) return "";
    let k = state.lvSt || "rob",
      c = liveCampo(m, x),
      al = m.alineacion || {},
      ids = es.map((e) => e.id),
      gk = gkOf(al, ids),
      srt = (a) => a.slice().sort((p, q) => name(p).localeCompare(name(q), "es")),
      on = srt(ids.filter((id) => c.on.has(id))),
      rest = srt(ids.filter((id) => !c.on.has(id))),
      btn = (id) =>
        `<button data-lvsp="${esc(id)}" class="${c.fuera.has(id) ? "off" : ""}" aria-label="${esc(ESTP.find((s) => s[0] === k)[1])}: ${esc(name(id))}"><span>${esc(dname(id))}${id === gk ? " <small>POR</small>" : ""}</span><b>${stv(es.find((e) => e.id === id), k)}</b></button>`,
      tot = (kk) => es.reduce((a, e) => a + stv(e, kk), 0),
      rt = Number((al.estR || {}).tir) || 0,
      f = liveFal(x),
      u = state.lvUndo && state.lvUndo.length;
    return `<div class="lv-stats"><h3 class="lv-h">Estadísticas</h3><p class="hint">Elige qué apuntar y toca al jugador. Primero salen los que están en el campo.</p><div class="lv-acc" role="group" aria-label="Qué apuntar">${ESTP.map((s) => `<button data-lvst="${s[0]}" class="${s[0] === k ? "on" : ""}" aria-pressed="${s[0] === k}">${s[1]}</button>`).join("")}</div><div class="lv-pl">${on.map(btn).join("")}${rest.length ? `<p class="lv-bn">${on.length ? "Banquillo" : "Convocados"}</p>` + rest.map(btn).join("") : ""}</div><div class="lv-ctl lv-rvst"><button class="secondary" data-live="rfal">Falta del rival <b>${f.r1 + f.r2}</b></button><button class="secondary" data-live="rtir">Tiro del rival <b>${rt}</b></button><button class="secondary" data-live="undo" ${u ? "" : "disabled"}>↶ Deshacer</button></div><div class="lv-sum"><span>Robos <b>${tot("rob")}</b></span><span>Pérdidas <b>${tot("per")}</b></span><span>Tiros <b>${tot("tp") + tot("tf")}</b> <small>(${tot("tp")} a puerta)</small></span><span>Tiros rival <b>${rt}</b></span><span>Faltas <b>${f.n1 + f.n2}</b> - <b>${f.r1 + f.r2}</b></span></div></div>`;
  }
  /* Apunta un dato a un jugador; la falta además suma a las faltas acumuladas del equipo */
  function liveStat(x, m, pid, k) {
    let e = entries(m).find((z) => z.id === pid);
    if (!e) return;
    stSet(e, k, 1);
    let u = { pid, k };
    if (k === "fal") {
      let f = liveFoulEv(x);
      if (f) u.ev = f.id;
    }
    lvUndoPush(u);
    if (u.ev) liveSave(x, () => liveMatch(x, null, 0));
    else liveStatSave(m);
  }
  function liveFoulEv(x, r) {
    if (!Array.isArray(x.eventos)) x.eventos = [];
    if (x.eventos.filter((z) => z.t === "fa").length >= 40) return null;
    let e = { id: rid(), m: liveMin(x), t: "fa", p: lvParte(x) };
    if (r) e.r = 1;
    x.eventos.push(e);
    return e;
  }
  function lvUndoPush(u) {
    state.lvUndo = (state.lvUndo || []).concat(u).slice(-30);
  }
  function liveUndo(x, m) {
    let u = (state.lvUndo || []).pop();
    if (!u) return;
    if (u.pid) {
      let e = entries(m).find((z) => z.id === u.pid);
      if (e) stSet(e, u.k, -1);
    }
    if (u.rt) {
      let R = m.alineacion.estR || {};
      R.tir = Math.max(0, (Number(R.tir) || 0) - 1);
      if (!R.tir) delete m.alineacion.estR;
    }
    if (u.ev) {
      x.eventos = (x.eventos || []).filter((z) => z.id !== u.ev);
      liveSave(x, () => liveMatch(x, null, 0));
    } else liveStatSave(m);
  }
  /* Guarda los datos del partido poco después del último toque (sin una petición por toque) */
  let lvStT = null;
  function liveStatSave(m) {
    clearTimeout(lvStT);
    lvStT = setTimeout(() => {
      liveQ = liveQ
        .then(async () => {
          let r = await db
            .from("futbol_personal_partidos")
            .update({
              participaciones: JSON.stringify(entries(m)),
              alineacion: JSON.stringify(m.alineacion),
            })
            .eq("id", m.id);
          if (r.error) note(r.error.message);
        })
        .catch((e) => note(e.message));
    }, 400);
  }
  /* ===== Ventanas de cambios (v11.11) =====
     Desde juvenil (fútbol 11) hay 3 ventanas de cambios por parte y en cada una
     entran y salen los jugadores que quieras. Se activa o quita en el Directo
     (alineacion.vent = nº de ventanas, 0 = sin ventanas). Los cambios del Directo
     llevan v (id de la ventana) y p (parte); ds:1 = hecho en el descanso (no gasta). */
  const VENT_N = 3;
  const ventDef = (m) => {
      let c = catOf(m.modalidad, teamOf(m));
      return String(m.modalidad) === "11" && c && (c[0] === "juvenil" || c[0] === "senior") ? VENT_N : 0;
    },
    ventDe = (m) => {
      let v = m && m.alineacion && m.alineacion.vent;
      return v === 0 || v === VENT_N ? v : m ? ventDef(m) : 0;
    };
  /* Ventanas usadas en cada parte. L: cambios {m, p?, v?, ds?}; pm: minutos por parte.
     Los que no traen ventana (a mano o del anotador) se juntan por minuto. */
  function ventUsadas(L, pm) {
    let g = { 1: new Map(), 2: new Map() };
    (L || []).forEach((z) => {
      if (!z || z.ds) return;
      let m = Number(z.m) || 0,
        p = z.p === 1 || z.p === 2 ? z.p : m <= pm ? 1 : 2;
      if (!z.p && m === pm) return; /* justo en el descanso: no gasta */
      let k = z.v || "m" + m;
      g[p].set(k, (g[p].get(k) || 0) + 1);
    });
    return { 1: [...g[1].values()], 2: [...g[2].values()] };
  }
  const lvSubs = (x) => (Array.isArray(x.eventos) ? x.eventos : []).filter((e) => e.t === "s" && !e.r),
    lvParteV = (x) => (x.estado === "DES" ? 0 : x.estado === "2T" || x.estado === "FIN" ? 2 : 1);
  /* Plan gratuito: control de ventanas en LIM.vt partidos al mes (Pro, ilimitado) */
  const ventPuedeVer = (id) => esPro() || (envLee().vt || []).includes(id) || envUsados("vt") < LIM.vt;
  function ventPanel(m, x) {
    let n = ventDe(m),
      ok = n && ventPuedeVer(x.partido_id),
      sw = String(m.modalidad) === "fs" ? "" : `<label class="lv-vsw"><input type="checkbox" id="lvVent" ${n ? "checked" : ""}> Ventanas de cambios (${VENT_N} por parte)</label>`;
    if (!n) return sw ? `<div class="lv-vent off">${sw}</div>` : "";
    if (!ok)
      return `<div class="lv-vent">${sw}<p class="muted lim-q">Plan gratuito: control de ventanas en ${LIM.vt} partidos al mes y este mes ya lo has usado. Los cambios se apuntan igual (varios a la vez). Con Pro, ilimitado.</p></div>`;
    let u = ventUsadas(lvSubs(x), x.parte_min),
      h = lvParteV(x),
      fila = (p) => {
        let us = u[p],
          act = h === p && x.estado !== "FIN",
          ch = [];
        for (let i = 0; i < Math.max(n, us.length); i++) {
          let c = us[i],
            ex = i >= n ? " ex" : "";
          if (c) ch.push(`<span class="vch used${ex}" aria-label="Ventana ${i + 1} hecha, ${c} ${c > 1 ? "cambios" : "cambio"}">✓ ${i + 1}<small>${c} ${c > 1 ? "cambios" : "cambio"}</small></span>`);
          else if (act && i === us.length) ch.push(`<button class="vch next" data-live="sub" aria-label="Ventana ${i + 1}: hacer los cambios">${i + 1}<small>${i === n - 1 ? "la última" : i === n - 2 ? "penúltima" : "toca aquí"}</small></button>`);
          else ch.push(`<span class="vch">${i + 1}</span>`);
        }
        let q = Math.max(0, n - us.length);
        return `<div class="vfila${act ? " act" : ""}"><span class="vp">${p}ª parte</span><div class="vchs">${ch.join("")}</div><span class="vq">${q ? `Quedan ${q}` : "Sin ventanas"}</span></div>`;
      };
    let pie = "";
    if (h === 0) pie = '<p class="hint">Descanso: los cambios que hagas ahora no gastan ventana.</p>';
    else if (x.estado !== "FIN") {
      let q = n - u[h].length;
      if (q === 1) pie = `<p class="lv-vw">⚠️ Te queda la <b>última ventana</b> de la ${h}ª parte: mete en ella todos los cambios que quieras hacer.</p>`;
      else if (q === 2) pie = `<p class="lv-vw s">Después de la próxima ventana solo te quedará una en la ${h}ª parte.</p>`;
      else if (q <= 0) pie = `<p class="lv-vw">Ya has usado las ${n} ventanas de la ${h}ª parte.</p>`;
    }
    return `<div class="lv-vent">${sw}${fila(1)}${fila(2)}${pie}</div>`;
  }
  /* Cambio de varios a la vez: state.lvSub = {o: [salen], i: [entran]} en el orden tocado */
  function liveSubMulti(m, x, c, side) {
    let S = state.lvSub || (state.lvSub = { o: [], i: [] }),
      al = m.alineacion || {},
      ids = entries(m).map((e) => e.id),
      gk = gkOf(al, ids),
      srt = (a) => a.slice().sort((p, q) => name(p).localeCompare(name(q), "es")),
      B = (id, k) => {
        let L = S[k],
          j = L.indexOf(id);
        return `<button data-lvs${k}="${esc(id)}" class="${j >= 0 ? "selected" : ""}" aria-pressed="${j >= 0}">${j >= 0 ? `<b class="lvn">${j + 1}</b>` : ""}${esc(dname(id))}${id === al.capitan ? " (C)" : ""}${id === gk ? " (POR)" : ""}</button>`;
      },
      onL = srt([...c.on]),
      banL = srt(ids.filter((id) => !c.on.has(id) && !c.fuera.has(id))),
      n = ventDe(m),
      vt = n && ventPuedeVer(x.partido_id),
      h = lvParteV(x),
      t = "🔄 Cambio",
      aviso = "";
    if (vt && h) {
      let k = ventUsadas(lvSubs(x), x.parte_min)[h].length + 1;
      t = `🔄 Ventana ${k} de ${n} · ${h}ª parte`;
      if (k === n) aviso = `<p class="lv-vw">⚠️ <b>Es la última ventana de la ${h}ª parte.</b> Marca ahora todos los que vayan a cambiar: después ya no podrás hacer más cambios en esta parte.</p>`;
      else if (k === n - 1) aviso = `<p class="lv-vw s">⚠️ <b>Penúltima ventana.</b> Después solo te quedará una en la ${h}ª parte.</p>`;
      else if (k > n) aviso = `<p class="lv-vw">Ya has usado las ${n} ventanas de la ${h}ª parte. Si lo apuntas, contará como una ventana de más.</p>`;
    } else if (vt && !h) t = "🔄 Cambios en el descanso";
    let par = S.o
        .map((o, j) => `<li><span class="out">▼ ${esc(dname(o))}</span>${S.i[j] ? `<span class="in">▲ ${esc(dname(S.i[j]))}</span>` : '<span class="muted">sin nadie que entre</span>'}</li>`)
        .join(""),
      nn = S.o.length;
    return `<div class="lv-pick lv-multi"><h3>${t}</h3>${side}${aviso}<p class="hint">Toca a todos los que salen y a todos los que entran. Van por parejas en el orden en que los toques (1 por 1, 2 por 2…).</p><h4>▼ Salen <small>${nn ? nn + " marcados" : ""}</small></h4><div class="slotmenu">${onL.map((id) => B(id, "o")).join("") || '<span class="muted">No hay nadie en el campo.</span>'}</div><h4>▲ Entran <small>${S.i.length ? S.i.length + " marcados" : ""}</small></h4><div class="slotmenu">${banL.map((id) => B(id, "i")).join("") || '<span class="muted">No quedan suplentes convocados.</span>'}</div>${par ? `<ul class="lv-par">${par}</ul>` : ""}<div class="lv-ctl"><button class="primary" data-live="subok" ${nn ? "" : "disabled"}>${nn ? `Hacer ${nn > 1 ? nn + " cambios" : "el cambio"}` : "Marca quién sale"}</button><button class="danger" data-live="nopick">Cancelar</button></div></div>`;
  }
  function liveSubOk(m, x) {
    let S = state.lvSub || { o: [], i: [] },
      c = liveCampo(m, x);
    S.o = S.o.filter((id) => c.on.has(id));
    S.i = S.i.filter((id) => !c.on.has(id) && !c.fuera.has(id));
    if (!S.o.length) return note("Marca al menos un jugador que sale.");
    if (S.i.length > S.o.length) return note("Entran más jugadores de los que salen. Marca también a los que salen.");
    if (!Array.isArray(x.eventos)) x.eventos = [];
    if (lvCount(x) + S.o.length > 80) return note("Demasiadas jugadas apuntadas en este partido.");
    let n = ventDe(m),
      vt = n && ventPuedeVer(x.partido_id),
      h = lvParteV(x),
      v = rid(),
      mi = liveMin(x),
      k = vt && h ? ventUsadas(lvSubs(x), x.parte_min)[h].length + 1 : 0;
    if (vt) envPuede("vt", x.partido_id);
    S.o.forEach((o, j) => {
      let e = { id: rid(), m: mi, t: "s", v, p: h || 2 };
      if (!h) e.ds = 1;
      liveWho(e, o);
      if (S.i[j]) liveWho(e, S.i[j], "i");
      x.eventos.push(e);
    });
    state.lvPick = state.lvSub = null;
    liveSave(x, () => liveMatch(x, null, 0));
    let q = S.o.length > 1 ? S.o.length + " cambios apuntados" : "Cambio apuntado";
    if (k && k === n) note(`${q}. Era la última ventana de la ${h}ª parte.`, true);
    else if (k && k === n - 1) note(`${q}. Te queda una sola ventana en la ${h}ª parte.`, true);
    else note(q + ".", true);
  }
  /* Elegir jugadores para un cambio (varios a la vez) o una tarjeta */
  function livePick2(m, x) {
    let k = state.lvPick;
    if (!k) return "";
    let c = liveCampo(m, x),
      al = m.alineacion || {},
      ids = entries(m).map((e) => e.id),
      gk = gkOf(al, ids),
      L = (arr) =>
        arr
          .slice()
          .sort((a, b) => name(a).localeCompare(name(b), "es"))
          .map(
            (id) =>
              `<button data-lvp="${esc(id)}">${esc(dname(id))}${id === al.capitan ? " (C)" : ""}${id === gk ? " (POR)" : ""}</button>`,
          )
          .join(""),
      t,
      list,
      side = k === "sub" || k === "a" || k === "r"
        ? `<div class="lv-side" role="group" aria-label="¿De qué equipo?"><button class="${state.lvSide === "r" ? "" : "on"}" data-lvside="n">${esc(x.equipo)}</button><button class="${state.lvSide === "r" ? "on" : ""}" data-lvside="r">${esc(x.rival || "Rival")}</button></div>`
        : "",
      num = (id, l) => `<label>${l}<input id="${id}" type="number" min="0" max="99" inputmode="numeric" placeholder="Nº"></label>`;
    if (side && state.lvSide === "r") {
      t = k === "sub" ? "Cambio del rival" : `<i class="tj ${k}"></i>Tarjeta ${k === "r" ? "roja" : "amarilla"} al rival`;
      return `<div class="lv-pick"><h3>${t}</h3>${side}<div class="formgrid lv-rf">${
        k === "sub"
          ? num("lvRs", "Dorsal que sale") + num("lvRe", "Dorsal que entra")
          : num("lvRd", "Dorsal") + '<label>Nombre (opcional)<input id="lvRn" maxlength="30" autocomplete="off"></label>'
      }</div><div class="lv-ctl"><button class="primary" data-live="rok">Apuntar</button><button class="danger" data-live="nopick">Cancelar</button></div></div>`;
    }
    if (k === "sub") return liveSubMulti(m, x, c, side);
    if (k.out) {
      t = `Cambio · ¿Quién entra por ${esc(name(k.out))}?`;
      list = L(ids.filter((id) => !c.on.has(id) && !c.fuera.has(id))) || '<span class="muted">No quedan suplentes convocados.</span>';
    } else {
      t = `<i class="tj ${k}"></i>Tarjeta ${k === "r" ? "roja" : "amarilla"} · ¿A quién?`;
      list = L(ids.filter((id) => !c.fuera.has(id)));
    }
    return `<div class="lv-pick"><h3>${t}</h3>${side}<div class="slotmenu">${list}<button class="danger" data-live="nopick">Cancelar</button></div></div>`;
  }
  /* Cambio o tarjeta del rival: solo dorsales (y nombre opcional) */
  function liveRival(x) {
    let k = state.lvPick,
      v = (id) => {
        let n = parseInt(($(id) || {}).value);
        return n >= 0 && n <= 99 ? String(n) : "";
      },
      e = { id: rid(), m: liveMin(x), t: k === "sub" ? "s" : k, r: 1 };
    if (k === "sub") {
      e.d = v("lvRs");
      e.di = v("lvRe");
      if (!e.d && !e.di) return note("Pon el dorsal del que sale o del que entra.");
    } else {
      e.d = v("lvRd");
      let n = (($("lvRn") || {}).value || "").trim().slice(0, 30);
      if (n) e.n = n;
      if (!e.d && !n) return note("Pon el dorsal o el nombre del jugador.");
    }
    if (!e.d) delete e.d;
    if (!e.di) delete e.di;
    if (!Array.isArray(x.eventos)) x.eventos = [];
    if (lvCount(x) >= 80) return note("Demasiadas jugadas apuntadas en este partido.");
    x.eventos.push(e);
    state.lvPick = null;
    liveSave(x, () => liveMatch(x, null, 0));
    render();
  }
  async function openLive(id) {
    let m = state.matches.find((z) => z.id === id);
    if (!m) return;
    let x = liveRows[id];
    if (!x) {
      let r0 = m.alineacion && m.alineacion.resultado,
        eq = teamOf(m) ? teamName(m.modalidad, teamOf(m)) : "";
      try {
        if (!eq) eq = localStorage.getItem("mf_equipo") || "";
      } catch (e) {}
      let row = {
          id: crypto.randomUUID(),
          owner_id: curUser,
          partido_id: id,
          modalidad: m.modalidad,
          equipo: eq || "Mi equipo",
          rival: String(m.rival || "").slice(0, 100),
          gf: r0 ? r0.gf : 0,
          gc: r0 ? r0.gc : 0,
          estado: "pre",
          parte_min: parteDe(m.modalidad, teamOf(m)),
          acum_ms: 0,
          desde: null,
          eventos: [],
        },
        r = await db.from("directos").insert(row).select();
      if (r.error) return note(liveErr(r.error.message));
      x = liveRows[id] = (r.data && r.data[0]) || row;
      liveSync(x);
    } else {
      let pm = parteDe(m.modalidad, teamOf(m)),
        ch = false;
      if (x.rival !== m.rival) {
        x.rival = String(m.rival || "").slice(0, 100);
        ch = true;
      }
      /* Antes de empezar, la duración sigue a la categoría del equipo */
      if (x.estado === "pre" && catOf(m.modalidad, teamOf(m)) && x.parte_min !== pm) {
        x.parte_min = pm;
        ch = true;
      }
      if (ch) liveSave(x);
      /* El anotador ve siempre los convocados de ahora */
      if (x.anotador && JSON.stringify(anotJug(m)) !== JSON.stringify(x.anot_jug || [])) anotGuarda(x, { anot_jug: anotJug(m) });
    }
    state.live = id;
    state.livePick = false;
    state.lvPick = null;
    state.lvUndo = [];
    render();
    window.scrollTo(0, 0);
  }
  /* Guarda en orden (una petición detrás de otra) para que no se pisen */
  function liveSave(x, after) {
    liveQ = liveQ
      .then(async () => {
        let datos = () => ({
            equipo: x.equipo,
            rival: x.rival,
            gf: x.gf,
            gc: x.gc,
            estado: x.estado,
            parte_min: x.parte_min,
            acum_ms: Math.round(Number(x.acum_ms) || 0),
            desde: x.desde,
            eventos: x.eventos,
          }),
          r,
          ch = [];
        if (x.anotador) {
          /* Con anotador, otra persona también apunta goles: antes de guardar se juntan
             sus goles con los de aquí, y solo se guarda si nadie ha tocado nada entretanto */
          for (let i = 0; i < 3 && !r; i++) {
            let q = await db.from("directos").select("*").eq("id", x.id),
              s = q.data && q.data[0];
            if (!s) break;
            ch = ch.concat(liveMerge(x, s));
            let u = db.from("directos").update(datos()).eq("id", x.id);
            if (i < 2) u = u.eq("actualizado", s.actualizado);
            let w = await u.select();
            if (w.error || (w.data && w.data.length)) r = w;
          }
        }
        if (!r) r = await db.from("directos").update(datos()).eq("id", x.id).select();
        if (r.error) return note(liveErr(r.error.message));
        let s = r.data && r.data[0];
        if (s) {
          liveSync(s);
          x.desde = s.desde;
          x.actualizado = s.actualizado;
          x._seen = new Set((Array.isArray(s.eventos) ? s.eventos : []).map((e) => e.id));
          x._del = null;
        }
        for (let [pid, d] of ch) await liveMatch(x, pid, d);
        if (after) await after();
      })
      .catch((e) => note(e.message));
    return liveQ;
  }
  /* Junta los goles que ha apuntado el anotador (en el servidor) con lo de este móvil.
     Devuelve los goles de jugadores que hay que sumar o restar en el partido. */
  function liveMerge(x, s) {
    let loc = Array.isArray(x.eventos) ? x.eventos : [],
      srv = Array.isArray(s.eventos) ? s.eventos : [],
      seen = x._seen || new Set(),
      del = x._del || new Set(),
      ids = new Set(srv.map((e) => e.id)),
      lids = new Set(loc.map((e) => e.id)),
      ch = [],
      gol = (e, d) => {
        if (e.t === "f" || !e.t) {
          x.gf = Math.max(0, Math.min(99, x.gf + d));
          if (e.pid) ch.push([e.pid, d]);
        } else if (e.t === "c") x.gc = Math.max(0, Math.min(99, x.gc + d));
      };
    /* Lo que estaba en el servidor y ya no está lo ha quitado el anotador */
    let out = loc.filter((e) => {
      if (seen.has(e.id) && !ids.has(e.id)) {
        gol(e, -1);
        return false;
      }
      return true;
    });
    srv.forEach((e) => {
      if (!lids.has(e.id) && !del.has(e.id)) {
        out.push(e);
        gol(e, 1);
      }
    });
    if (out.length !== loc.length || out.some((e, i) => e !== loc[i])) {
      out.sort((a, b) => (Number(a.m) || 0) - (Number(b.m) || 0));
      x.eventos = out;
      x._cambio = true;
    }
    x._seen = ids;
    return ch;
  }
  /* Pasa el resultado y los goles al partido (estadísticas) */
  async function liveMatch(x, pid, d, fin) {
    let m = state.matches.find((z) => z.id === x.partido_id);
    if (!m) return;
    if (!m.alineacion || typeof m.alineacion !== "object") m.alineacion = {};
    m.alineacion.resultado = { gf: x.gf, gc: x.gc };
    let e = pid && entries(m).find((z) => z.id === pid);
    if (e) e.goals = Math.max(0, (Number(e.goals) || 0) + d);
    if (Number(x.parte_min)) m.alineacion.parte = Number(x.parte_min);
    /* Cambios y tarjetas del Directo al partido (lo apuntado a mano después se respeta) */
    let al = m.alineacion,
      ev = Array.isArray(x.eventos) ? x.eventos : [],
      mano = (k) => mdList(al, k).filter((z) => !z.lv),
      hay = new Set(["cambios", "tarjetas", "cambiosR", "tarjetasR"].flatMap(mano).map((z) => z.id)),
      byMin = (a, b) => (Number(a.m) || 0) - (Number(b.m) || 0),
      dv = (v) => (v == null ? "" : String(v));
    al.cambios = mano("cambios")
      .concat(ev.filter((z) => z.t === "s" && !z.r && !hay.has(z.id)).map((z) => ({ id: z.id, m: Number(z.m) || 0, sale: z.pid || "", entra: z.pin || "", lv: 1, ...(z.v ? { v: z.v } : {}), ...(z.p ? { p: z.p } : {}), ...(z.ds ? { ds: 1 } : {}) })))
      .sort(byMin);
    al.tarjetas = mano("tarjetas")
      .concat(ev.filter((z) => (z.t === "a" || z.t === "r") && !z.r && !hay.has(z.id)).map((z) => ({ id: z.id, m: Number(z.m) || 0, pid: z.pid || "", c: z.t, lv: 1 })))
      .sort(byMin);
    /* Del rival no hay plantilla: se guarda el dorsal (y el nombre si lo pones) */
    al.cambiosR = mano("cambiosR")
      .concat(ev.filter((z) => z.t === "s" && z.r && !hay.has(z.id)).map((z) => ({ id: z.id, m: Number(z.m) || 0, sale: dv(z.d), entra: dv(z.di), lv: 1 })))
      .sort(byMin);
    al.tarjetasR = mano("tarjetasR")
      .concat(ev.filter((z) => (z.t === "a" || z.t === "r") && z.r && !hay.has(z.id)).map((z) => ({ id: z.id, m: Number(z.m) || 0, d: dv(z.d), n: z.n || "", c: z.t, lv: 1 })))
      .sort(byMin);
    ["cambios", "tarjetas", "cambiosR", "tarjetasR"].forEach((k) => {
      if (!al[k].length) delete al[k];
    });
    /* Faltas acumuladas del equipo y del rival por parte (lv:1 = vienen del Directo) */
    if (ev.some((z) => z.t === "fa")) al.faltas = { ...liveFal(x), lv: 1 };
    else if (al.faltas && al.faltas.lv) delete al.faltas;
    /* Al terminar, los minutos de cada jugador salen solos de los cambios */
    if (fin && (ev.some((z) => ["s", "a", "r"].includes(z.t) && !z.r) || entries(m).every((z) => !Number(z.minutes)))) {
      let mins = calcMin(entries(m), mdList(al, "cambios"), mdList(al, "tarjetas"), (Number(x.parte_min) || 30) * 2);
      entries(m).forEach((z) => (z.minutes = Math.round(mins[z.id] || 0)));
    }
    let r = await db
      .from("futbol_personal_partidos")
      .update({
        participaciones: JSON.stringify(entries(m)),
        alineacion: JSON.stringify(m.alineacion),
      })
      .eq("id", m.id);
    if (r.error) note(r.error.message);
  }
  const livePause = (x) => {
      x.acum_ms = liveElapsed(x, serverNow());
      x.desde = null;
    },
    liveStart = (x) => {
      x.desde = new Date(serverNow()).toISOString();
    };
  const lvCount = (x) => x.eventos.filter((z) => z.t !== "fa").length;
  function liveGoal(x, t, pid) {
    if (!Array.isArray(x.eventos)) x.eventos = [];
    if (lvCount(x) >= 80) return note("Demasiadas jugadas apuntadas en este partido.");
    let e = { id: rid(), m: liveMin(x), t };
    if (t === "f") {
      x.gf = Math.min(99, x.gf + 1);
      if (pid) liveWho(e, pid);
    } else x.gc = Math.min(99, x.gc + 1);
    x.eventos.push(e);
    liveSave(x, () => liveMatch(x, e.pid, 1));
  }
  /* Nombre y dorsal del jugador dentro del evento (se ve en el enlace público) */
  function liveWho(e, pid, k = "") {
    let p = state.players.find((z) => z.id === pid);
    e[k ? "pin" : "pid"] = pid;
    e["n" + k] = name(pid).slice(0, 30);
    if (dorsal(p)) e["d" + k] = dorsal(p);
  }
  /* Cambio (t "s": pid sale, pin entra) o tarjeta (t "a" amarilla / "r" roja) */
  function liveIncid(x, t, pid, pin) {
    if (!Array.isArray(x.eventos)) x.eventos = [];
    if (lvCount(x) >= 80) return note("Demasiadas jugadas apuntadas en este partido.");
    let e = { id: rid(), m: liveMin(x), t };
    liveWho(e, pid);
    if (pin) liveWho(e, pin, "i");
    x.eventos.push(e);
    liveSave(x, () => liveMatch(x, null, 0));
  }
  function liveDel(x, id) {
    let e = (x.eventos || []).find((z) => z.id === id),
      q = { s: "el cambio", a: "la tarjeta", r: "la tarjeta" }[e && e.t] || "el gol";
    if (!e || !confirm(`¿Quitar ${q} del minuto ${e.m}?`)) return;
    x.eventos = x.eventos.filter((z) => z !== e);
    (x._del = x._del || new Set()).add(e.id);
    if (e.t === "c") x.gc = Math.max(0, x.gc - 1);
    else if (e.t === "f" || !e.t) x.gf = Math.max(0, x.gf - 1);
    let gol = e.t === "f" || !e.t;
    liveSave(x, () => liveMatch(x, gol ? e.pid : null, gol ? -1 : 0));
  }
  async function liveShare(x) {
    let url = liveUrl(x),
      t = `${x.equipo} - ${x.rival} · en directo`;
    if (navigator.share)
      try {
        await navigator.share({ title: t, text: t, url });
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return;
      }
    try {
      await navigator.clipboard.writeText(url);
      note("Enlace copiado. Pégalo en WhatsApp o donde quieras.", true);
    } catch (e) {
      $("lvUrl").select();
      note("Copia el enlace de la casilla.", true);
    }
  }
  /* ===== Enlace del anotador (v11.8): otra persona apunta los goles desde su móvil ===== */
  function anotHtml(x) {
    let q = esPro() ? "" : `<p class="muted lim-q">Plan gratuito: anotador en ${LIM.an} partidos al mes (te quedan ${Math.max(0, LIM.an - envUsados("an"))}). Con Pro, ilimitado.</p>`;
    return `<div class="lv-share lv-anot"><h3>Anotador</h3><p class="muted">Mientras tú grabas, otra persona (el delegado, un padre…) apunta desde su móvil los goles (con quién ha marcado), las faltas, los cambios y las tarjetas de los dos equipos. El minuto se pone solo, el marcador del vídeo cambia en unos segundos y todo se guarda en el partido. No necesita cuenta.</p>${
      x.anotador
        ? `<input id="anUrl" readonly value="${esc(anotUrl(x))}" aria-label="Enlace del anotador"><div class="lv-ctl"><button class="primary" data-live="anshare">${ic("share", 18)}Enviar al anotador</button><button class="danger" data-live="anoff">Quitar el anotador</button></div><p class="hint">Con este enlace se apunta el partido: mándalo solo a quien vaya a anotar. Para la familia, usa el enlace de abajo.</p>`
        : `<div class="lv-ctl"><button class="secondary" data-live="anon">${ic("plus", 18)}Crear enlace de anotador</button></div>${q}`
    }</div>`;
  }
  /* Lista de convocados que verá el anotador (solo nombre y dorsal) */
  function anotJug(m) {
    return entries(m)
      .map((e) => {
        let p = state.players.find((z) => z.id === e.id),
          j = { id: e.id, n: name(e.id).slice(0, 30) };
        if (dorsal(p)) j.d = dorsal(p);
        if (e.starter) j.s = 1;
        return j;
      })
      .sort((a, b) => a.n.localeCompare(b.n, "es"))
      .slice(0, 40);
  }
  async function anotGuarda(x, datos) {
    await liveQ;
    let r = await db.from("directos").update(datos).eq("id", x.id).select();
    if (r.error)
      return note(
        /anotador|anot_jug|column|schema cache/i.test(r.error.message || "")
          ? "El anotador aún no está activado en la base de datos (falta ejecutar supabase-anotador.sql en Supabase)."
          : liveErr(r.error.message),
      );
    Object.assign(x, datos);
    let s = r.data && r.data[0];
    if (s) x.actualizado = s.actualizado;
    return true;
  }
  async function anotOn(x, m) {
    if (!envPuede("an", x.partido_id)) return;
    if (await anotGuarda(x, { anotador: crypto.randomUUID(), anot_jug: anotJug(m) })) {
      render();
      anotShare(x);
    }
  }
  async function anotOff(x) {
    if (!confirm("El enlace del anotador dejará de funcionar. Los goles que haya apuntado se quedan. ¿Seguir?")) return;
    if (await anotGuarda(x, { anotador: null, anot_jug: null })) {
      render();
      note("Anotador quitado.", true);
    }
  }
  async function anotShare(x) {
    let url = anotUrl(x),
      t = `Apunta los goles de ${x.equipo} - ${x.rival}`;
    if (navigator.share)
      try {
        await navigator.share({ title: t, text: t, url });
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return;
      }
    try {
      await navigator.clipboard.writeText(url);
      note("Enlace del anotador copiado. Pégalo en WhatsApp.", true);
    } catch (e) {
      let n = $("anUrl");
      if (n) n.select();
      note("Copia el enlace de la casilla.", true);
    }
  }
  /* Con anotador, este móvil mira cada 4 s si hay goles nuevos (para el marcador y el vídeo) */
  setInterval(() => {
    let x = state.live && liveRows[state.live];
    if (!x || !x.anotador || document.visibilityState !== "visible") return;
    liveQ = liveQ
      .then(async () => {
        let r = await db.from("directos").select("*").eq("id", x.id),
          s = r.data && r.data[0];
        if (!s || s.actualizado === x.actualizado) return;
        x._cambio = false;
        let ch = liveMerge(x, s);
        x.actualizado = s.actualizado;
        liveSync(s);
        if (!x._cambio) return;
        for (let [pid, d] of ch) await liveMatch(x, pid, d);
        if (!ch.length) await liveMatch(x, null, 0);
        let a = document.activeElement;
        if (state.live === x.partido_id && !(a && /INPUT|SELECT|TEXTAREA/.test(a.tagName) && !a.readOnly)) render();
        if (cam) camBotones();
      })
      .catch(() => {});
  }, 4000);
  async function liveOff(x) {
    if (
      !confirm(
        "El enlace dejará de funcionar y se borrará el directo de este partido. El resultado y los goles ya guardados en el partido se mantienen. ¿Seguir?",
      )
    )
      return;
    await liveQ;
    let r = await db.from("directos").delete().eq("id", x.id);
    if (r.error) return note(r.error.message);
    delete liveRows[x.partido_id];
    state.live = null;
    render();
    note("Enlace desactivado.", true);
  }
  document.addEventListener("click", (e) => {
    let x = state.live && liveRows[state.live];
    if (!x) return;
    let b = e.target.closest("[data-live]"),
      sc = e.target.closest("[data-scorer]"),
      dl = e.target.closest("[data-lvdel]"),
      lp = e.target.closest("[data-lvp]"),
      sd = e.target.closest("[data-lvside]"),
      lst = e.target.closest("[data-lvst]"),
      lsp = e.target.closest("[data-lvsp]"),
      lso = e.target.closest("[data-lvso],[data-lvsi]");
    if (lso && state.lvPick === "sub") {
      let S = state.lvSub || (state.lvSub = { o: [], i: [] }),
        k = lso.hasAttribute("data-lvso") ? "o" : "i",
        id = lso.getAttribute(k === "o" ? "data-lvso" : "data-lvsi"),
        j = S[k].indexOf(id);
      if (j >= 0) S[k].splice(j, 1);
      else S[k].push(id);
      return render();
    }
    if (lst) {
      state.lvSt = lst.dataset.lvst;
      return render();
    }
    if (lsp) {
      let m0 = state.matches.find((z) => z.id === state.live);
      if (m0) liveStat(x, m0, lsp.dataset.lvsp, state.lvSt || "rob");
      return render();
    }
    if (sd) {
      state.lvSide = sd.dataset.lvside;
      return render();
    }
    if (lp && state.lvPick) {
      let k = state.lvPick,
        id = lp.dataset.lvp;
      if (k === "sub") state.lvPick = { out: id };
      else {
        state.lvPick = null;
        if (k.out) liveIncid(x, "s", k.out, id);
        else liveIncid(x, k, id);
      }
      return render();
    }
    if (sc) {
      state.livePick = false;
      liveGoal(x, "f", sc.dataset.scorer);
      return render();
    }
    if (dl) {
      liveDel(x, dl.dataset.lvdel);
      return render();
    }
    if (!b) return;
    let k = b.dataset.live,
      m = state.matches.find((z) => z.id === state.live);
    if (k === "close") {
      state.live = null;
      state.livePick = false;
      state.lvPick = null;
      state.lvUndo = [];
      return render();
    }
    if (k === "rok") return liveRival(x);
    if (k === "subok" && m) {
      liveSubOk(m, x);
      return render();
    }
    if ((k === "rfal" || k === "rtir" || k === "undo") && m) {
      if (!m.alineacion || typeof m.alineacion !== "object") m.alineacion = {};
      if (k === "undo") liveUndo(x, m);
      if (k === "rfal") {
        let f = liveFoulEv(x, 1);
        if (!f) return note("Demasiadas faltas apuntadas en este partido.");
        lvUndoPush({ ev: f.id });
        liveSave(x, () => liveMatch(x, null, 0));
      }
      if (k === "rtir") {
        let R = (m.alineacion.estR = { ...(m.alineacion.estR || {}) });
        R.tir = Math.min(999, (Number(R.tir) || 0) + 1);
        lvUndoPush({ rt: 1 });
        liveStatSave(m);
      }
      return render();
    }
    if (k === "sub" || k === "ta" || k === "tr") {
      if (k === "sub" && m && ventDe(m) && ventPuedeVer(x.partido_id) && lvParteV(x) && x.estado !== "FIN") {
        let h = lvParteV(x);
        if (ventUsadas(lvSubs(x), x.parte_min)[h].length >= ventDe(m) && !confirm(`Ya has usado las ${ventDe(m)} ventanas de cambios de la ${h}ª parte. ¿Apuntar otro cambio igualmente?`)) return;
      }
      state.livePick = false;
      state.lvSub = null;
      state.lvSide = "n";
      state.lvPick = k === "sub" ? "sub" : k === "ta" ? "a" : "r";
      return render();
    }
    if (k === "cam") return camAbre(x.partido_id);
    if (k === "share") return liveShare(x);
    if (k === "anon" && m) return anotOn(x, m);
    if (k === "anoff") return anotOff(x);
    if (k === "anshare") return anotShare(x);
    if (k === "off") return liveOff(x);
    if (k === "nopick") state.livePick = state.lvPick = state.lvSub = null;
    if (k === "gf") {
      state.lvPick = null;
      if (m && entries(m).length) state.livePick = true;
      else liveGoal(x, "f", "");
    }
    if (k === "gc") liveGoal(x, "c");
    if (["start", "pause", "resume", "half", "start2", "end", "reopen", "m-", "m+"].includes(k)) {
      if (k === "end" && !confirm("¿Terminar el partido?")) return;
      if (k === "start") {
        let d = parseInt(($("lvDur") || {}).value);
        if (d >= 5 && d <= 60) x.parte_min = d;
        x.estado = "1T";
        x.acum_ms = 0;
        liveStart(x);
      }
      if (k === "pause") livePause(x);
      if (k === "resume") liveStart(x);
      if (k === "half") {
        livePause(x);
        x.estado = "DES";
      }
      if (k === "start2") {
        x.estado = "2T";
        x.acum_ms = 0;
        liveStart(x);
      }
      if (k === "end") {
        livePause(x);
        x.estado = "FIN";
      }
      if (k === "reopen") x.estado = "2T";
      if (k === "m-" || k === "m+") {
        let run = !!x.desde;
        livePause(x);
        x.acum_ms = Math.max(0, x.acum_ms + (k === "m+" ? 60000 : -60000));
        if (run) liveStart(x);
      }
      liveSave(x, k === "end" ? () => liveMatch(x, null, 0, true) : null);
    }
    render();
  });
  $("view").addEventListener("change", (e) => {
    if (e.target.id === "mdVent" && state.draft) {
      state.draft.alineacion.vent = e.target.checked ? VENT_N : 0;
      return render();
    }
    let x = state.live && liveRows[state.live];
    if (!x) return;
    if (e.target.id === "lvTeam") {
      x.equipo = e.target.value.trim().slice(0, 60) || "Mi equipo";
      try {
        localStorage.setItem("mf_equipo", x.equipo);
      } catch (z) {}
      liveSave(x);
      render();
    }
    if (e.target.id === "lvCap" || e.target.id === "lvGk") {
      let m = state.matches.find((z) => z.id === x.partido_id);
      if (!m) return;
      if (!m.alineacion || typeof m.alineacion !== "object") m.alineacion = {};
      let k = e.target.id === "lvCap" ? "capitan" : "portero";
      if (e.target.value) m.alineacion[k] = e.target.value;
      else delete m.alineacion[k];
      db.from("futbol_personal_partidos")
        .update({ alineacion: JSON.stringify(m.alineacion) })
        .eq("id", m.id)
        .then((r) => r.error && note(r.error.message));
      render();
    }
    if (e.target.id === "lvVent") {
      let m = state.matches.find((z) => z.id === x.partido_id);
      if (!m) return;
      if (!m.alineacion || typeof m.alineacion !== "object") m.alineacion = {};
      m.alineacion.vent = e.target.checked ? VENT_N : 0;
      db.from("futbol_personal_partidos")
        .update({ alineacion: JSON.stringify(m.alineacion) })
        .eq("id", m.id)
        .then((r) => r.error && note(r.error.message));
      note(e.target.checked ? `Ventanas de cambios activadas: ${VENT_N} por parte.` : "Sin ventanas de cambios en este partido.", true);
      render();
    }
    if (e.target.id === "lvDur") {
      let d = parseInt(e.target.value);
      if (d >= 5 && d <= 60) {
        x.parte_min = d;
        liveSave(x);
      }
    }
  });
  setInterval(() => {
    let x = state.live ? liveRows[state.live] : pubRow;
    if (!x || !x.desde) return;
    let c = liveClock(x, serverNow());
    document
      .querySelectorAll("[data-lvmin]")
      .forEach((n) => (n.textContent = c[0]));
    document
      .querySelectorAll("[data-lvss]")
      .forEach((n) => (n.textContent = c[1]));
  }, 1000);
  /* ===== Cámara del directo: graba el partido con el marcador encima y lo guarda en el móvil ===== */
  let cam = null;
  /* Vídeo en directo: Edge Function "video-directo" (Cloudflare Realtime reparte el vídeo) */
  const VID_ICE = [{ urls: "stun:stun.cloudflare.com:3478" }];
  /* Espera a tener los candidatos de red en la descripción (máx. 2 s) */
  const vidIce = (pc) =>
    pc.iceGatheringState === "complete"
      ? Promise.resolve()
      : new Promise((ok) => {
          let t = setTimeout(ok, 2000);
          pc.addEventListener("icegatheringstatechange", () => pc.iceGatheringState === "complete" && (clearTimeout(t), ok()));
        });
  async function vidFn(body, auth) {
    let h = { "Content-Type": "application/json", apikey: c.supabaseAnonKey };
    if (auth) {
      let s = await db.auth.getSession(),
        t = s && s.data && s.data.session && s.data.session.access_token;
      if (t) h.Authorization = "Bearer " + t;
    }
    let r = await fetch(c.supabaseUrl + "/functions/v1/video-directo", { method: "POST", headers: h, body: JSON.stringify(body) }),
      d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) throw new Error(d.error || "No se ha podido conectar con el vídeo (" + r.status + ").");
    return d;
  }
  const camTipo = () =>
      ["video/mp4;codecs=avc1,mp4a", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find(
        (t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t),
      ) || "",
    camHora = (ms) => {
      let s = Math.floor(ms / 1000);
      return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
    };
  function camPinta() {
    let c = cam;
    if (!c) return;
    let v = c.video,
      cv = c.canvas,
      w = v.videoWidth,
      h = v.videoHeight;
    if (w && h) {
      if (cv.width !== w || cv.height !== h) {
        cv.width = w;
        cv.height = h;
      }
      let g = c.ctx,
        x = liveRows[c.id];
      g.drawImage(v, 0, 0, w, h);
      if (x) {
        /* Marcador arriba a la izquierda, a escala del vídeo */
        let u = Math.min(w, h) / 360,
          clk = liveClock(x, serverNow())[0],
          t1 = String(x.equipo || "").slice(0, 16).toUpperCase(),
          t2 = String(x.rival || "").slice(0, 16).toUpperCase(),
          sc = x.gf + " - " + x.gc,
          pad = 8 * u,
          fs = 15 * u,
          y0 = 10 * u;
        g.font = `700 ${fs}px "Barlow Condensed", Arial, sans-serif`;
        g.textBaseline = "middle";
        let wt1 = g.measureText(t1).width,
          wt2 = g.measureText(t2).width,
          wsc = g.measureText(sc).width + 2 * pad,
          wck = g.measureText(clk).width + 2 * pad,
          bh = fs + 2 * pad,
          xx = 10 * u;
        g.fillStyle = "rgba(5,15,10,.82)";
        g.fillRect(xx, y0, wt1 + wt2 + 4 * pad + wsc + wck, bh);
        g.fillStyle = "#fff";
        g.fillText(t1, xx + pad, y0 + bh / 2);
        xx += wt1 + 2 * pad;
        g.fillStyle = "#2be36a";
        g.fillRect(xx, y0, wsc, bh);
        g.fillStyle = "#03140a";
        g.fillText(sc, xx + pad, y0 + bh / 2);
        g.fillStyle = "#fff";
        xx += wsc;
        g.fillText(t2, xx + pad, y0 + bh / 2);
        xx += wt2 + 2 * pad;
        g.fillStyle = "#facc15";
        g.fillRect(xx, y0, wck, bh);
        g.fillStyle = "#111";
        g.fillText(clk, xx + pad, y0 + bh / 2);
      } else if (c.tr) {
        /* Entreno: etiqueta con el equipo y la fecha arriba a la izquierda */
        let u = Math.min(w, h) / 360,
          pad = 8 * u,
          fs = 15 * u,
          y0 = 10 * u,
          t1 = "ENTRENO",
          t2 = (String(c.tr.equipo || "").slice(0, 20) + " · " + c.tr.fecha.split("-").reverse().slice(0, 2).join("/")).toUpperCase();
        g.font = `700 ${fs}px "Barlow Condensed", Arial, sans-serif`;
        g.textBaseline = "middle";
        let w1 = g.measureText(t1).width + 2 * pad,
          w2 = g.measureText(t2).width + 2 * pad,
          bh = fs + 2 * pad,
          xx = 10 * u;
        g.fillStyle = "#2be36a";
        g.fillRect(xx, y0, w1, bh);
        g.fillStyle = "#03140a";
        g.fillText(t1, xx + pad, y0 + bh / 2);
        g.fillStyle = "rgba(5,15,10,.82)";
        g.fillRect(xx + w1, y0, w2, bh);
        g.fillStyle = "#fff";
        g.fillText(t2, xx + w1 + pad, y0 + bh / 2);
      }
    }
    if (c.rec) {
      let n = c.box.querySelector("[data-camt]");
      if (n) n.textContent = "● " + camHora(Date.now() - c.t0);
    }
    /* requestAnimationFrame se para con la pantalla apagada; el temporizador sigue grabando */
    c.raf = setTimeout(camPinta, 1000 / 30);
  }
  function camBotones() {
    let c = cam;
    if (!c) return;
    let m = state.matches.find((z) => z.id === c.id),
      pick = c.pick && m
        ? `<div class="cam-pick">${entries(m)
            .map((e) => [e.id, name(e.id)])
            .sort((a, b) => a[1].localeCompare(b[1], "es"))
            .map((e) => `<button data-camsc="${esc(e[0])}">${esc(e[1])}</button>`)
            .join("")}<button data-camsc="">Sin asignar</button><button class="danger" data-cam="nopick">Cancelar</button></div>`
        : "";
    let em = c.emite
      ? `<button class="danger" data-cam="unemit">${c.emite === "on" ? "● En directo · Cortar" : "Conectando… · Cortar"}</button>`
      : `<button class="secondary" data-cam="emit">${ic("live", 18)}Emitir para la familia${plan === "pro" ? "" : " (Pro)"}</button>`;
    if (c.tr) {
      c.box.querySelector(".cam-ui").innerHTML = c.listo
        ? `<div class="cam-fin"><p><b>Vídeo listo</b> · ${esc(camHora(c.dur))} · ${Math.max(1, Math.round(c.listo.size / 1048576))} MB</p><button class="primary" data-cam="save">${ic("image", 18)}Guardar en el móvil</button>${navigator.canShare ? `<button class="secondary" data-cam="share">${ic("share", 18)}Compartir / Guardar en galería</button>` : ""}<button class="secondary" data-cam="again">Grabar otro trozo</button><button class="danger" data-cam="close">Cerrar</button></div>`
        : `<div class="cam-row">${c.rec ? `<button class="danger cam-rec" data-cam="stop"><span data-camt>● 0:00</span> Parar</button>` : `<button class="primary cam-rec" data-cam="rec">● Grabar</button><button class="secondary" data-cam="close">Cerrar</button>`}<button class="secondary" data-cam="flip" aria-label="Cambiar de cámara">Girar cámara</button></div>${c.rec ? "" : '<p class="cam-tip">Grabar el entreno: el vídeo se guarda solo en tu móvil, no se sube a internet. Pon el móvil en horizontal. Consejo: graba cada ejercicio por separado, los archivos más pequeños se guardan mejor.</p>'}`;
      return;
    }
    c.box.querySelector(".cam-ui").innerHTML = c.listo
      ? `<div class="cam-fin"><p><b>Vídeo listo</b> · ${esc(camHora(c.dur))} · ${Math.max(1, Math.round(c.listo.size / 1048576))} MB</p><button class="primary" data-cam="save">${ic("image", 18)}Guardar en el móvil</button>${navigator.canShare ? `<button class="secondary" data-cam="share">${ic("share", 18)}Compartir / Guardar en galería</button>` : ""}<button class="secondary" data-cam="again">Grabar otro trozo</button>${c.emite ? em : ""}<button class="danger" data-cam="close">Cerrar</button></div>`
      : `${pick}<div class="cam-row"><button class="cam-g" data-cam="gf">+ Gol nuestro</button><button class="cam-g" data-cam="gc">+ Gol rival</button></div><div class="cam-row">${em}${c.rec ? `<button class="danger cam-rec" data-cam="stop"><span data-camt>● 0:00</span> Parar</button>` : `<button class="primary cam-rec" data-cam="rec">● Grabar</button><button class="secondary" data-cam="close">Cerrar</button>`}<button class="secondary" data-cam="flip" aria-label="Cambiar de cámara">Girar cámara</button></div>${c.rec || c.emite ? "" : '<p class="cam-tip">Pon el móvil en horizontal. El marcador y el minuto se graban dentro del vídeo. «Emitir» hace que quien tenga el enlace del directo vea el vídeo en vivo; puedes emitir y grabar a la vez. Consejo: para y guarda en el descanso, los archivos más pequeños se guardan mejor.</p>'}`;
  }
  /* tr: grabar un entrenamiento ({ fecha, equipo }); sin marcador ni emisión */
  async function camAbre(id, frente, tr) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream)
      return note("Este móvil o navegador no permite grabar vídeo desde la app.");
    let s;
    try {
      s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: frente ? "user" : "environment", width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: true,
      });
    } catch (e) {
      return note(
        e && e.name === "NotAllowedError"
          ? "No hay permiso para usar la cámara. Actívalo en los ajustes del móvil (permisos de la app o de Chrome) y vuelve a intentarlo."
          : "No se ha podido abrir la cámara.",
      );
    }
    let box = document.createElement("div");
    box.className = "cam";
    box.innerHTML = '<canvas class="cam-cv" aria-label="Vista de la cámara con el marcador"></canvas><div class="cam-ui"></div>';
    let v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.srcObject = new MediaStream(s.getVideoTracks());
    document.body.appendChild(box);
    document.body.classList.add("cam-on");
    cam = { id, tr: tr || null, s, v, video: v, box, canvas: box.querySelector("canvas"), frente: !!frente, rec: null, listo: null, pick: false };
    cam.ctx = cam.canvas.getContext("2d");
    cam.out = cam.canvas.captureStream(30);
    s.getAudioTracks().forEach((t) => cam.out.addTrack(t));
    try {
      await v.play();
    } catch (e) {}
    camPinta();
    camBotones();
  }
  /* Cambia de cámara sin cortar la grabación ni el directo (solo se cambia la imagen que se pinta) */
  async function camGira() {
    let c = cam,
      n;
    try {
      n = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: c.frente ? "environment" : "user", width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      });
    } catch (e) {
      return note("No se ha podido cambiar de cámara.");
    }
    if (cam !== c) return n.getTracks().forEach((t) => t.stop());
    c.s.getVideoTracks().forEach((t) => {
      t.stop();
      c.s.removeTrack(t);
    });
    n.getVideoTracks().forEach((t) => c.s.addTrack(t));
    c.v.srcObject = new MediaStream(n.getVideoTracks());
    c.v.play().catch(() => {});
    c.frente = !c.frente;
  }
  function camSuelta() {
    if (!cam) return;
    camCorta();
    clearTimeout(cam.raf);
    cam.s.getTracks().forEach((t) => t.stop());
    if (cam.lock) cam.lock.release().catch(() => {});
  }
  function camCierra() {
    if (!cam) return;
    if (cam.rec && !confirm("Se está grabando. Si cierras, se pierde lo grabado. ¿Cerrar?")) return;
    if (cam.emite && !cam.rec && !confirm("Se cortará el vídeo en directo. ¿Cerrar?")) return;
    if (cam.listo && !cam.guardado && !confirm("Aún no has guardado el vídeo. Si cierras, se pierde. ¿Cerrar?")) return;
    if (cam.rec) {
      cam.rec.ondataavailable = cam.rec.onstop = null;
      try {
        cam.rec.stop();
      } catch (e) {}
    }
    camSuelta();
    cam.box.remove();
    document.body.classList.remove("cam-on");
    cam = null;
    render();
  }
  async function camGraba() {
    let c = cam,
      tipo = camTipo(),
      out = c.out,
      r;
    try {
      r = new MediaRecorder(out, { mimeType: tipo || undefined, videoBitsPerSecond: 2500000, audioBitsPerSecond: 96000 });
    } catch (e) {
      return note("Este móvil no permite grabar vídeo desde la app.");
    }
    c.trozos = [];
    c.tipo = r.mimeType || tipo || "video/webm";
    r.ondataavailable = (e) => e.data && e.data.size && c.trozos.push(e.data);
    r.onstop = () => {
      c.listo = new Blob(c.trozos, { type: c.tipo });
      c.trozos = [];
      c.dur = Date.now() - c.t0;
      c.rec = null;
      c.guardado = false;
      camLuz();
      camBotones();
    };
    r.start(2000);
    c.rec = r;
    c.t0 = Date.now();
    camLuz();
    camBotones();
  }
  /* Que no se apague la pantalla mientras graba o emite */
  async function camLuz() {
    let c = cam;
    if (!c) return;
    let on = !!(c.rec || c.emite);
    if (on && !c.lock)
      try {
        c.lock = await navigator.wakeLock.request("screen");
        c.lock.addEventListener("release", () => cam && (cam.lock = null));
      } catch (e) {}
    if (!on && c.lock) c.lock.release().catch(() => {});
  }
  async function camEmite() {
    let c = cam;
    if (plan !== "pro") return note("El vídeo en directo para la familia es del plan Pro. Grabar en el móvil es gratis.");
    if (!window.RTCPeerConnection) return note("Este móvil no permite emitir vídeo en directo.");
    c.emite = "con";
    camBotones();
    camLuz();
    try {
      let pc = new RTCPeerConnection({ iceServers: VID_ICE, bundlePolicy: "max-bundle" }),
        tr = c.out.getTracks().map((t) => pc.addTransceiver(t, { direction: "sendonly" }));
      c.pc = pc;
      let vs = tr.find((t) => t.sender.track.kind === "video");
      if (vs) {
        let pr = vs.sender.getParameters();
        pr.encodings = pr.encodings && pr.encodings.length ? pr.encodings : [{}];
        pr.encodings[0].maxBitrate = 1500000;
        vs.sender.setParameters(pr).catch(() => {});
      }
      await pc.setLocalDescription(await pc.createOffer());
      await vidIce(pc);
      let d = await vidFn(
        {
          accion: "emitir",
          directo: liveRows[c.id].id,
          sdp: pc.localDescription.sdp,
          pistas: tr.map((t) => ({ mid: t.mid, trackName: t.sender.track.kind === "video" ? "v" : "a" })),
        },
        true,
      );
      if (cam !== c || c.pc !== pc) return pc.close();
      await pc.setRemoteDescription({ type: "answer", sdp: d.sdp });
      pc.onconnectionstatechange = () => {
        if (cam !== c || c.pc !== pc) return;
        if (pc.connectionState === "connected") c.emite = "on";
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          c.emite = "con";
          /* Se ha cortado (cobertura): se vuelve a conectar sola */
          clearTimeout(c.reint);
          c.reint = setTimeout(() => cam === c && c.emite && c.pc === pc && (pc.close(), camEmite()), pc.connectionState === "failed" ? 1000 : 8000);
        }
        camBotones();
      };
    } catch (e) {
      if (c.pc) c.pc.close();
      c.pc = null;
      c.emite = null;
      camLuz();
      camBotones();
      note(e.message);
    }
  }
  function camCorta(aviso) {
    let c = cam;
    if (!c || !c.emite) return;
    clearTimeout(c.reint);
    if (c.pc) c.pc.close();
    c.pc = null;
    c.emite = null;
    camLuz();
    let x = liveRows[c.id];
    if (x && aviso !== false) vidFn({ accion: "parar", directo: x.id }, true).catch(() => {});
  }
  function camArchivo() {
    let c = cam,
      x = liveRows[c.id] || {},
      m = state.matches.find((z) => z.id === c.id) || {},
      lim = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 30),
      ext = /mp4/.test(c.tipo) ? "mp4" : "webm",
      n = c.tr
        ? ["entreno", lim(c.tr.equipo), c.tr.fecha, new Date().toTimeString().slice(0, 5).replace(":", "h")].filter(Boolean).join("-")
        : ["partido", lim(x.equipo), lim(x.rival), m.fecha || "", new Date().toTimeString().slice(0, 5).replace(":", "h")].filter(Boolean).join("-");
    return new File([c.listo], n + "." + ext, { type: c.tipo.split(";")[0] });
  }
  function camGuarda() {
    let f = camArchivo(),
      u = URL.createObjectURL(f),
      a = document.createElement("a");
    a.href = u;
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 60000);
    cam.guardado = true;
    note("Vídeo guardado en Descargas del móvil (" + f.name + ").", true);
  }
  async function camComparte() {
    let f = camArchivo();
    if (!navigator.canShare || !navigator.canShare({ files: [f] })) return camGuarda();
    try {
      await navigator.share({ files: [f], title: f.name });
      cam.guardado = true;
    } catch (e) {
      if (!e || e.name !== "AbortError") camGuarda();
    }
  }
  document.addEventListener("click", async (e) => {
    if (!cam) return;
    let b = e.target.closest("[data-cam]"),
      sc = e.target.closest("[data-camsc]"),
      x = liveRows[cam.id];
    if (sc) {
      cam.pick = false;
      if (x) liveGoal(x, "f", sc.dataset.camsc);
      return camBotones();
    }
    if (!b) return;
    let k = b.dataset.cam,
      m = state.matches.find((z) => z.id === cam.id);
    if (k === "close") return camCierra();
    if (k === "rec") return camGraba();
    if (k === "stop") return cam.rec && cam.rec.stop();
    if (k === "save") return camGuarda();
    if (k === "emit") return camEmite();
    if (k === "unemit") {
      camCorta();
      return camBotones();
    }
    if (k === "share") return camComparte();
    if (k === "again") {
      if (!cam.guardado && !confirm("Aún no has guardado este vídeo. Si sigues, se pierde. ¿Seguir?")) return;
      cam.listo = null;
      return camBotones();
    }
    if (k === "flip") return camGira();
    if (k === "nopick") cam.pick = false;
    if (k === "gf" && x) {
      if (m && entries(m).length) cam.pick = true;
      else liveGoal(x, "f", "");
    }
    if (k === "gc" && x) liveGoal(x, "c");
    camBotones();
  });
  window.addEventListener("beforeunload", (e) => {
    if (cam && (cam.rec || cam.emite || (cam.listo && !cam.guardado))) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  /* Vídeo en la página pública: se conecta cuando el entrenador emite y se reconecta si cambia */
  /* Máximo de personas viendo el vídeo a la vez (lo controla la Edge Function); cada espectador
     avisa cada 30 s de que sigue mirando y, si lo deja, su sitio queda libre para otro. */
  let pubVid = { desde: null, pc: null, sesion: null };
  const pubLleno = (on) => {
    let n = $("pubLleno");
    if (n) n.classList.toggle("hidden", !on);
  };
  async function pubVideo(desde) {
    let box = $("pubVid");
    if (!box || desde === pubVid.desde) return;
    pubVid.desde = desde;
    if (pubVid.pc) pubVid.pc.close();
    pubVid.pc = null;
    pubVid.sesion = null;
    let v = box.querySelector("video");
    if (!desde) {
      box.classList.add("hidden");
      pubLleno(false);
      v.srcObject = null;
      return;
    }
    try {
      let d = await vidFn({ accion: "ver", codigo: PUB });
      if (pubVid.desde === desde) pubLleno(!!d.lleno);
      if (!d.video || pubVid.desde !== desde) {
        if (pubVid.desde === desde) pubVid.desde = null;
        return;
      }
      pubVid.sesion = d.sesion;
      let pc = new RTCPeerConnection({ iceServers: VID_ICE, bundlePolicy: "max-bundle" }),
        ms = new MediaStream();
      pubVid.pc = pc;
      pc.ontrack = (e) => {
        ms.addTrack(e.track);
        v.srcObject = ms;
        v.play().catch(() => {});
        box.classList.remove("hidden");
      };
      pc.onconnectionstatechange = () => {
        if (pubVid.pc === pc && pc.connectionState === "failed") pubVid.desde = null; /* reintenta en la próxima vuelta */
      };
      await pc.setRemoteDescription({ type: "offer", sdp: d.sdp });
      await pc.setLocalDescription(await pc.createAnswer());
      await vidIce(pc);
      await vidFn({ accion: "responder", sesion: d.sesion, sdp: pc.localDescription.sdp });
    } catch (e) {
      if (pubVid.desde === desde) pubVid.desde = null;
    }
  }
  /* Página pública del enlace (sin cuenta): se actualiza sola cada 10 s */
  const pubShell = (h) =>
    `<div class="pub-in"><div class="brand"><span class="mark" role="img" aria-label="Logo JV32"></span><span class="word">Mi Fútbol <i>JV32</i></span></div><section class="panel live">${h}</section><p class="legal-links"><a href="${esc(location.pathname)}">¿Eres entrenador? Lleva tu equipo con Mi Fútbol JV32</a></p></div>`;
  async function pubLoad() {
    let r;
    try {
      r = await db.rpc("ver_directo", { codigo: PUB });
    } catch (e) {
      r = { error: e };
    }
    if (r.error) {
      if (!pubRow)
        $("pubData").innerHTML =
          '<h2 class="h2s">Directo</h2><p class="muted">No se ha podido cargar el directo. Revisa tu conexión; lo volvemos a intentar solos.</p>';
      return;
    }
    pubRow = r.data || null;
    if (pubRow && pubRow.ahora)
      liveSkew = Date.parse(pubRow.ahora) - Date.now();
    pubVideo((pubRow && pubRow.video_desde) || null);
    $("pubData").innerHTML = pubRow
        ? `<div class="kicker">${liveOn(pubRow) ? "En directo" : pubRow.estado === "FIN" ? "Partido terminado" : "Directo"} · ${esc(MN(pubRow.modalidad))}</div>${liveBoard(pubRow, serverNow(), false)}<h3 class="lv-h">Goles, cambios y tarjetas</h3>${liveEvents(pubRow, false)}<p class="muted lv-upd">Se actualiza solo · ${new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</p>`
        : '<h2 class="h2s">Directo no disponible</h2><p class="muted">Este enlace no existe o el entrenador lo ha desactivado.</p>';
  }
  function startPub() {
    $("login").classList.add("hidden");
    $("app").classList.add("hidden");
    let box = document.createElement("main");
    box.id = "pub";
    box.className = "pub";
    document.body.appendChild(box);
    document.title = "Directo · Mi Fútbol JV32";
    box.innerHTML = pubShell(
      '<div id="pubVid" class="pub-vid hidden"><video playsinline autoplay muted controls aria-label="Vídeo del partido en directo"></video><button class="secondary small" data-pubsound>🔊 Activar sonido</button></div><p id="pubLleno" class="pro-fin hidden">El vídeo ya lo están viendo 25 personas, que es el máximo por partido. Sigue aquí el marcador; el vídeo te entrará solo en cuanto quede un sitio libre.</p><div id="pubData"><p class="muted">Cargando el directo…</p></div>',
    );
    box.addEventListener("click", (e) => {
      let b = e.target.closest("[data-pubsound]");
      if (!b) return;
      let v = box.querySelector("#pubVid video");
      v.muted = false;
      v.play().catch(() => {});
      b.remove();
    });
    pubLoad();
    setInterval(() => {
      if (document.visibilityState === "visible") pubLoad();
    }, 10000);
    setInterval(async () => {
      let ses = pubVid.sesion;
      if (!ses) return;
      try {
        let d = await vidFn({ accion: "sigo", codigo: PUB, sesion: ses });
        if (d.fuera && pubVid.sesion === ses) {
          if (pubVid.pc) pubVid.pc.close();
          pubVid.pc = null;
          pubVid.sesion = null;
          pubVid.desde = null;
          $("pubVid").classList.add("hidden");
          pubLleno(true);
        }
      } catch (e) {}
    }, 30000);
    window.addEventListener("pagehide", () => {
      if (!pubVid.sesion) return;
      try {
        fetch(c.supabaseUrl + "/functions/v1/video-directo", {
          method: "POST",
          keepalive: true,
          headers: { "Content-Type": "application/json", apikey: c.supabaseAnonKey },
          body: JSON.stringify({ accion: "salgo", codigo: PUB, sesion: pubVid.sesion }),
        });
      } catch (e) {}
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") pubLoad();
    });
  }
  if (PUB) startPub();

  /* Página del enlace del equipo para los jugadores (?equipo=<código>, sin cuenta) */
  let eqD = null,
    eqYo = "",
    eqErr = false,
    eqUlt = "";
  const eqYoKey = () => "mf_eq_yo:" + EQ;
  /* Esfuerzo que ha anotado este jugador en este móvil (el servidor solo dice si ya lo anotó) */
  function eqEsfLee() {
    try {
      return JSON.parse(localStorage.getItem("mf_eq_esf:" + EQ) || "{}") || {};
    } catch (e) {
      return {};
    }
  }
  function eqEsfHtml(d, yo) {
    if (!yo || d.pideEsf === false || !Array.isArray(d.esf)) return "";
    let hoy = ymd(new Date()),
      desde = diasAntes(ESF_DIAS),
      L = d.esf.filter((x) => x && x.f >= desde && x.f <= hoy && (!Array.isArray(x.j) || x.j.includes(yo.id)));
    if (!L.length) return "";
    let mem = eqEsfLee(),
      hechos = (eqD && eqD.esfuerzos) || [];
    return `<section class="eq-sec eq-esf"><h3 class="ci-h3">💪 ¿Cuánto te ha costado?</h3><p class="muted">Del <b>1</b> (muy fácil) al <b>10</b> (lo máximo). Contesta un rato después de terminar, con sinceridad. Solo lo ven tu entrenador y el preparador físico.</p>${L.map((x) => {
      let v = cgRpe(mem[yo.id + "|" + x.t + "|" + x.ref]),
        ya = hechos.some((r) => r.tipo === x.t && r.ref === x.ref && r.j === yo.id);
      return `<div class="eq-card"><b class="eq-tit">${esc(x.n)}</b><p>📅 ${esc(trDayLabel(x.f).replace(/^./, (c) => c.toUpperCase()))}${x.h ? " · " + esc(x.h) : ""}</p><div class="cg-esc" role="group" aria-label="Tu esfuerzo en ${esc(x.n)}">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
        .map((n) => `<button type="button" class="cg-n${v === n ? " on" : ""}" style="--c:${cgCol(n)}" data-eqesf="${n}" data-t="${x.t}" data-ref="${esc(x.ref)}" aria-pressed="${v === n}" aria-label="${n}, ${CG_ESF[n]}">${n}</button>`)
        .join("")}</div><p class="muted eq-cuenta">${v ? `Has anotado <b style="color:${cgCol(v)}">${v} · ${CG_ESF[v]}</b>. Si te equivocas, toca otro número.` : ya ? "✓ Ya lo has anotado. Si quieres cambiarlo, toca otro número." : "Toca un número."}</p></div>`;
    }).join("")}</section>`;
  }
  async function eqLoad() {
    let r;
    try {
      r = await db.rpc("ver_espacio", { codigo: EQ });
    } catch (e) {
      r = { error: e };
    }
    eqErr = !!r.error;
    if (!r.error) {
      let s = JSON.stringify(r.data || null);
      if (s === eqUlt && $("eqData").querySelector(".kicker")) return;
      eqUlt = s;
      eqD = r.data || null;
    }
    eqPinta();
  }
  function eqMios(tipo, ref) {
    return ((eqD && eqD.respuestas) || []).filter((r) => r.tipo === tipo && r.ref === ref);
  }
  function eqBotones(tipo, ref) {
    if (!eqYo || eqYo === "-") return "";
    let L = eqMios(tipo, ref),
      mia = L.find((r) => r.j === eqYo),
      si = L.filter((r) => r.estado === "voy").length,
      no = L.length - si;
    return `<div class="eq-resp"><button type="button" class="${mia && mia.estado === "voy" ? "primary" : "secondary"} small" data-eqr="voy" data-t="${tipo}" data-ref="${esc(ref)}" aria-pressed="${!!(mia && mia.estado === "voy")}">${ic("check", 18)}Voy</button><button type="button" class="${mia && mia.estado === "no" ? "danger" : "secondary"} small" data-eqr="no" data-t="${tipo}" data-ref="${esc(ref)}" aria-pressed="${!!(mia && mia.estado === "no")}">${ic("x", 18)}No puedo ir</button></div><p class="muted eq-cuenta">${mia ? (mia.estado === "voy" ? "Has dicho que <b>vas</b>." : "Has avisado de que <b>no puedes ir</b>.") + " " : ""}✓ ${si} ${si === 1 ? "va" : "van"} · ✗ ${no} no ${no === 1 ? "puede" : "pueden"}</p>`;
  }
  function eqPinta() {
    let box = $("eqData");
    if (!box) return;
    if (!eqD) {
      box.innerHTML = eqErr
        ? '<h2 class="h2s">Mi equipo</h2><p class="muted">No se ha podido cargar. Revisa tu conexión; lo volvemos a intentar solos.</p>'
        : '<h2 class="h2s">Enlace no disponible</h2><p class="muted">Este enlace no existe o el entrenador lo ha desactivado.</p>';
      return;
    }
    let d = eqD.datos || {},
      J = Array.isArray(d.jugadores) ? d.jugadores : [],
      yo = J.find((p) => p.id === eqYo);
    if (eqYo && eqYo !== "-" && !yo) eqYo = "";
    let nom = (id) => (J.find((p) => p.id === id) || {}).n || "",
      h = `<div class="kicker">${esc(MN(d.modalidad))}</div><h2>${esc(d.equipo || "Mi equipo")}</h2>`;
    if (!eqYo) {
      box.innerHTML =
        h +
        `<h3 class="ci-h3">¿Quién eres?</h3><p class="muted">Elige tu nombre una vez y podrás avisar si vas o no a los entrenos y partidos.</p><div class="eq-quien">${J.map((p) => `<button type="button" class="secondary" data-eqyo="${esc(p.id)}">${p.d ? `<i class="bdn">${esc(p.d)}</i>` : ""}${esc(p.n)}</button>`).join("")}</div><div class="stack"><button type="button" class="secondary small" data-eqyo="-">Solo quiero mirar</button></div>`;
      return;
    }
    h += `<p class="muted eq-hola">${yo ? `Hola, <b>${esc(yo.n)}</b>.` : "Estás mirando sin elegir jugador."} <button type="button" class="linkbtn" data-eqyo="">${yo ? "No soy yo" : "Elegir mi nombre"}</button></p>`;
    h += eqEsfHtml(d, yo);
    let p = d.partido;
    h += `<section class="eq-sec"><h3 class="ci-h3">⚽ Próximo partido</h3>`;
    if (p) {
      let conv = Array.isArray(p.conv) ? p.conv : [],
        estoy = yo && conv.includes(yo.id);
      h += `<div class="eq-card"><b class="eq-tit">${p.rival ? "vs " + esc(p.rival) : "Partido"}</b><p>📅 ${esc(trDayLabel(p.fecha).replace(/^./, (x) => x.toUpperCase()))}</p>${p.hora || p.cita ? `<p>⏰ ${[p.hora ? "Partido: " + esc(p.hora) : "", p.cita ? "Citación: <b>" + esc(p.cita) + "</b>" : ""].filter(Boolean).join(" · ")}</p>` : ""}${p.lugar ? `<p>📍 ${esc(p.lugar)}</p>` : ""}${p.nota ? `<p>📝 ${esc(p.nota)}</p>` : ""}${yo ? `<p class="eq-conv ${estoy ? "si" : "no"}">${estoy ? "✅ Estás convocado" : "No estás en la convocatoria"}</p>` : ""}<details class="eq-det"><summary>Convocados (${conv.length})</summary><ol>${conv.map((id) => `<li${yo && id === yo.id ? ' class="yo"' : ""}>${esc(nom(id))}</li>`).join("")}</ol></details>${!yo || estoy ? eqBotones("partido", p.ref) : ""}</div>`;
    } else h += '<p class="muted">Todavía no hay convocatoria.</p>';
    h += `</section><section class="eq-sec"><h3 class="ci-h3">🏃 Próximos entrenos</h3>`;
    let T = Array.isArray(d.entrenos) ? d.entrenos : [];
    h += T.length
      ? T.map(
          (t) =>
            `<div class="eq-card"><b class="eq-tit">${esc(trDayLabel(t.fecha).replace(/^./, (x) => x.toUpperCase()))}${t.hora ? " · " + esc(t.hora) : ""}</b>${t.nota ? `<p>🎯 <b>Vamos a trabajar:</b> ${esc(t.nota)}</p>` : ""}${
              (t.ej || []).length
                ? `<ol class="eq-ej">${t.ej.map((s) => `<li><b>${esc(s.n)}</b> <small>(${trMin(s.t)})</small>${s.d ? `<br><span class="muted">${esc(s.d)}</span>` : ""}</li>`).join("")}</ol>`
                : ""
            }${t.circ ? `<p>💪 <b>Circuito: ${esc(t.circ.n)}</b> (${t.circ.s} ${t.circ.s === 1 ? "serie" : "series"})</p><ol class="eq-ej">${(t.circ.est || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ol>` : ""}${eqBotones("entreno", t.id)}</div>`,
        ).join("")
      : '<p class="muted">No hay entrenos programados en los próximos días.</p>';
    h += `</section><section class="eq-sec"><h3 class="ci-h3">🎬 Jugadas</h3>`;
    let V = (Array.isArray(d.videos) ? d.videos : []).filter(vidVivo);
    h += V.length
      ? `<div class="eq-vids">${V.map((v) => `<div class="eq-vid"><b>${esc(v.n)}</b><small class="muted"> · hasta el ${esc(fmtDate(vidCad(v)))}</small><video src="${esc(v.url)}" controls playsinline preload="metadata"></video></div>`).join("")}</div>`
      : '<p class="muted">El entrenador todavía no ha subido jugadas.</p>';
    h += `</section><p class="muted lv-upd">Actualizado: ${esc(new Date(eqD.actualizado || Date.now()).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))}</p>`;
    box.innerHTML = h;
  }
  function startEq() {
    $("login").classList.add("hidden");
    $("app").classList.add("hidden");
    let box = document.createElement("main");
    box.id = "pub";
    box.className = "pub eq";
    document.body.appendChild(box);
    document.title = "Mi equipo · Mi Fútbol JV32";
    try {
      eqYo = localStorage.getItem(eqYoKey()) || "";
    } catch (e) {}
    box.innerHTML = `<div class="pub-in"><div class="brand"><span class="mark" role="img" aria-label="Logo JV32"></span><span class="word">Mi Fútbol <i>JV32</i></span></div><section class="panel"><div id="eqData"><p class="muted">Cargando…</p></div></section><p class="legal-links"><a href="${esc(location.pathname)}">¿Eres entrenador? Lleva tu equipo con Mi Fútbol JV32</a></p></div>`;
    box.addEventListener("click", async (e) => {
      let y = e.target.closest("[data-eqyo]");
      if (y) {
        eqYo = y.dataset.eqyo;
        try {
          localStorage.setItem(eqYoKey(), eqYo);
        } catch (x) {}
        eqPinta();
        return window.scrollTo(0, 0);
      }
      let f = e.target.closest("[data-eqesf]");
      if (f && eqYo && eqYo !== "-") {
        let v = +f.dataset.eqesf,
          k = eqYo + "|" + f.dataset.t + "|" + f.dataset.ref;
        f.disabled = true;
        let r;
        try {
          r = await db.rpc("anotar_esfuerzo", { codigo: EQ, p_tipo: f.dataset.t, p_ref: f.dataset.ref, p_jugador: eqYo, p_rpe: v });
        } catch (x) {
          r = { error: x };
        }
        f.disabled = false;
        if (r.error) return note("No se pudo enviar: " + (r.error.message || "revisa tu conexión"));
        let m = eqEsfLee();
        m[k] = v;
        try {
          localStorage.setItem("mf_eq_esf:" + EQ, JSON.stringify(m));
        } catch (x) {}
        eqPinta();
        note("¡Gracias! Tu entrenador ya tiene tu esfuerzo (" + v + ").", true);
        return eqLoad();
      }
      let b = e.target.closest("[data-eqr]");
      if (!b || !eqYo || eqYo === "-") return;
      let est = b.dataset.eqr,
        motivo = "";
      if (est === "no") {
        motivo = prompt("¿Por qué no puedes ir? (opcional: lesión, estudios, viaje…)", "");
        if (motivo === null) return;
      }
      b.disabled = true;
      let r;
      try {
        r = await db.rpc("responder_espacio", { codigo: EQ, p_tipo: b.dataset.t, p_ref: b.dataset.ref, p_jugador: eqYo, p_estado: est, p_motivo: String(motivo).trim().slice(0, 200) });
      } catch (x) {
        r = { error: x };
      }
      if (r.error) {
        b.disabled = false;
        return note("No se pudo enviar: " + (r.error.message || "revisa tu conexión"));
      }
      note(est === "voy" ? "¡Apuntado! El entrenador ya sabe que vas." : "Avisado. El entrenador ya sabe que no puedes ir.", true);
      eqLoad();
    });
    eqLoad();
    /* Se pone al día al volver a la página y cada minuto (si no hay un vídeo en marcha) */
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") eqLoad();
    });
    setInterval(() => {
      let v = [...box.querySelectorAll("video")].some((x) => !x.paused);
      if (document.visibilityState === "visible" && !v) eqLoad();
    }, 60000);
  }
  if (EQ) startEq();

  /* Página del preparador físico (?carga=<código>): carga de cada jugador, solo para mirar */
  let pfD = null,
    pfErr = false,
    pfUlt = "";
  async function pfLoad() {
    let r;
    try {
      r = await db.rpc("ver_carga", { codigo: PF });
    } catch (e) {
      r = { error: e };
    }
    pfErr = !!r.error;
    if (!r.error) {
      let s = JSON.stringify(r.data || null);
      if (s === pfUlt && $("pfData").querySelector(".kicker")) return;
      pfUlt = s;
      pfD = r.data || null;
    }
    pfPinta();
  }
  function pfPinta() {
    let box = $("pfData");
    if (!box) return;
    if (!pfD || !pfD.cg) {
      box.innerHTML = pfErr
        ? '<h2 class="h2s">Carga física</h2><p class="muted">No se ha podido cargar. Revisa tu conexión; lo volvemos a intentar solos.</p>'
        : '<h2 class="h2s">Enlace no disponible</h2><p class="muted">Este enlace no existe o el entrenador lo ha quitado.</p>';
      return;
    }
    let cg = pfD.cg,
      Jg = Array.isArray(pfD.jugadores) ? pfD.jugadores : [],
      E = Array.isArray(pfD.esfuerzos) ? pfD.esfuerzos : [],
      J = (tipo, ref) => {
        let o = {};
        E.forEach((x) => x.tipo === tipo && x.ref === ref && cgRpe(x.rpe) && (o[x.j] = cgRpe(x.rpe)));
        return o;
      },
      S = cgMezcla(Array.isArray(cg.s) ? cg.s : [], J, cg.dd),
      { W, por, eq } = cgSemanas(S),
      pro = !!cg.pro,
      nom = (id) => (Jg.find((p) => p.id === id) || {}).n || "Jugador",
      cxp = cg.cx ? cxDe(cg.cx) : null,
      ccat = cg.cx ? CATS.find((z) => z[0] === cg.cx.cat) || null : null,
      ax = cxp ? cxAvisoX(cxp, ccat, W) : null,
      R = Jg.map((p) => {
        let L = por[p.id] || W.map(() => 0);
        return { p, L, a: cgAviso(L, ax) };
      }).sort((a, b) => b.L[5] - a.L[5] || String(a.p.n).localeCompare(String(b.p.n), "es")),
      avisos = pro ? R.filter((x) => x.a && x.a.k === "l") : [],
      h = `<div class="kicker">Preparador físico · ${esc(MN(pfD.modalidad))}</div><h2>${esc(pfD.equipo || "Mi equipo")}</h2><p class="muted">Carga física = <b>esfuerzo (1-10) × minutos</b>. Semana del ${cgSem(W[5])} · equipo: <b>${eq[5]}</b></p>${cxp ? `<p class="cx-pf">${esc(cxLinea(cxp, ccat))}</p>` : ""}${
      cg.fa && Object.keys(cg.fa).length
        ? `<p class="muted cx-pf">Esta semana por fases: ${FASES.filter((x) => cg.fa[x[0]])
            .map((x) => `${esc(x[2])} <b>${Math.round(cg.fa[x[0]])}</b> min`)
            .join(" · ")}</p>`
        : ""
    }`;
    if (pro)
      h += `<div class="cg-eq"><small>Carga del equipo, últimas 6 semanas</small>${cgBarras(eq, W, 64)}<div class="cg-ejes">${W.map((w, i) => `<span>${i === 5 ? "esta" : cgSem(w)}</span>`).join("")}</div></div>${avisos.length ? `<div class="cg-alerta" role="status">⚠ ${avisos.map((x) => esc(x.p.n)).join(", ")}: esta semana ${avisos.length === 1 ? "lleva" : "llevan"} mucha más carga que su media de las 4 anteriores.</div>` : ""}`;
    h += `<section class="eq-sec"><h3 class="ci-h3">Carga de cada jugador</h3>${R.map(
      (o) =>
        `<div class="row cg-row"><span class="pf-av">${esc(o.p.d || String(o.p.n || "?").slice(0, 1))}</span><div class="info"><strong>${esc(o.p.n)}</strong>${pro && o.a ? `<small class="cg-a ${o.a.k}">${o.a.t}</small>` : `<small>esta semana</small>`}</div>${pro ? cgBarras(o.L, W, 34) : ""}<div class="big"><b>${o.L[5]}</b><small>carga</small></div></div>`,
    ).join("")}</section>`;
    let ses = S.slice().sort((a, b) => b.f.localeCompare(a.f)).slice(0, 12);
    h += `<section class="eq-sec"><h3 class="ci-h3">Esfuerzo de cada sesión</h3>${
      ses.length
        ? ses
            .map((x) => {
              let ids = Object.keys(x.por),
                media = ids.reduce((a, id) => a + x.por[id].rpe, 0) / ids.length;
              return `<div class="esp-av-it"><b>${x.tipo === "e" ? "Entreno" : esc(x.nombre)} · ${esc(fmtDate(x.f))}</b><small><b style="color:${cgCol(Math.round(media))}">${media.toFixed(1).replace(".", ",")}</b> esfuerzo medio · ${ids.length} ${ids.length === 1 ? "jugador" : "jugadores"}</small><span class="esp-esf-l">${ids
                .sort((a, b) => x.por[b].rpe - x.por[a].rpe)
                .map((id) => `<i style="--c:${cgCol(x.por[id].rpe)}">${esc(nom(id))} ${x.por[id].rpe}</i>`)
                .join("")}</span></div>`;
            })
            .join("")
        : '<p class="muted">Todavía no hay esfuerzo anotado. Los jugadores lo anotan desde el enlace del equipo al terminar cada entreno o partido.</p>'
    }</section>`;
    if (!pro) h += `<p class="muted lim-q">El entrenador tiene el plan gratuito: aquí sale la <b>semana actual</b>. Con el plan Pro, las últimas 6 semanas con el gráfico de cada jugador y los avisos de sobrecarga.</p>`;
    h += `<p class="muted lv-upd">Es una ayuda, no un diagnóstico médico · Actualizado: ${esc(new Date(pfD.actualizado || Date.now()).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))}</p>`;
    box.innerHTML = h;
  }
  function startPf() {
    $("login").classList.add("hidden");
    $("app").classList.add("hidden");
    let box = document.createElement("main");
    box.id = "pub";
    box.className = "pub eq pf";
    document.body.appendChild(box);
    document.title = "Carga física · Mi Fútbol JV32";
    box.innerHTML = `<div class="pub-in"><div class="brand"><span class="mark" role="img" aria-label="Logo JV32"></span><span class="word">Mi Fútbol <i>JV32</i></span></div><section class="panel cg-panel"><div id="pfData"><p class="muted">Cargando…</p></div></section><p class="legal-links"><a href="${esc(location.pathname)}">¿Eres entrenador? Lleva tu equipo con Mi Fútbol JV32</a></p></div>`;
    pfLoad();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") pfLoad();
    });
    setInterval(() => document.visibilityState === "visible" && pfLoad(), 60000);
  }
  if (PF) startPf();

  /* Página del anotador (?anotar=<código>, sin cuenta): apunta goles, faltas, cambios y tarjetas
     en el directo del entrenador. El minuto lo pone el servidor con el reloj del entrenador. */
  let anRow = null,
    anPick = null,
    anSide = "n",
    anBusy = false,
    anErr = "";
  const anMsg = (t) =>
    /NO_EXISTE/.test(t)
      ? "Este enlace de anotador ya no funciona: el entrenador lo ha quitado."
      : /DEMASIADOS/.test(t)
        ? "Ya hay demasiadas jugadas apuntadas en este partido."
        : /JUGADOR/.test(t)
          ? "Ese jugador ya no está en la convocatoria. Elige otro."
          : /DATOS/.test(t)
            ? "Pon el dorsal o el nombre del jugador."
            : /anotar|ver_anotador|does not exist|schema cache/i.test(t)
              ? "El anotador aún no está activado. Avisa al entrenador."
              : "No se ha podido apuntar. Revisa tu conexión e inténtalo otra vez.";
  const anJug = () => (anRow && Array.isArray(anRow.jugadores) ? anRow.jugadores : []);
  const anJn = (id) => {
    let j = anJug().find((z) => z.id === id);
    return j ? (j.d ? j.d + " · " : "") + j.n : "Jugador";
  };
  /* Quién está en el campo (titulares + cambios) y quién ha sido expulsado, como en el Directo */
  function anCampo() {
    let on = new Set(anJug().filter((j) => j.s).map((j) => j.id)),
      fuera = new Set(),
      am = {};
    (Array.isArray(anRow.eventos) ? anRow.eventos : []).forEach((e) => {
      if (e.r) return;
      if (e.t === "s") {
        on.delete(e.pid);
        if (e.pin && !fuera.has(e.pin)) on.add(e.pin);
      }
      if (e.t === "a") am[e.pid] = (am[e.pid] || 0) + 1;
      if (e.t === "r" || (e.t === "a" && am[e.pid] === 2)) {
        on.delete(e.pid);
        fuera.add(e.pid);
      }
    });
    return { on, fuera };
  }
  const AN_Q = { f: "el gol", c: "el gol", s: "el cambio", a: "la tarjeta", r: "la tarjeta", fa: "la falta" };
  function anPickHtml() {
    let k = anPick;
    if (!k) return "";
    let x = anRow,
      jug = anJug(),
      c = anCampo(),
      L = (ids, attr) =>
        ids.map((id) => `<button data-${attr}="${esc(id)}">${esc(anJn(id))}</button>`).join(""),
      no = '<button class="danger" data-an="no">Cancelar</button>',
      side =
        k === "sub" || k === "a" || k === "r"
          ? `<div class="lv-side" role="group" aria-label="¿De qué equipo?"><button class="${anSide === "r" ? "" : "on"}" data-ans="n">${esc(x.equipo)}</button><button class="${anSide === "r" ? "on" : ""}" data-ans="r">${esc(x.rival || "Rival")}</button></div>`
          : "",
      num = (id, l) => `<label>${l}<input id="${id}" type="number" min="0" max="99" inputmode="numeric" placeholder="Nº"></label>`,
      tj = (t) => `<i class="tj ${t}"></i>Tarjeta ${t === "r" ? "roja" : "amarilla"}`;
    if (k === "f")
      return `<div class="lv-pick"><h3>¿Quién ha marcado?</h3><div class="slotmenu">${L(jug.map((j) => j.id), "anp")}<button data-anp="">Sin asignar</button>${no}</div></div>`;
    if (side && (anSide === "r" || !jug.length))
      return `<div class="lv-pick"><h3>${k === "sub" ? "Cambio del rival" : tj(k) + " al rival"}</h3>${jug.length ? side : ""}<div class="formgrid lv-rf">${
        k === "sub" ? num("anRs", "Dorsal que sale") + num("anRe", "Dorsal que entra") : num("anRd", "Dorsal") + '<label>Nombre (opcional)<input id="anRn" maxlength="30" autocomplete="off"></label>'
      }</div><div class="lv-ctl"><button class="primary" data-an="rok">Apuntar</button>${no}</div></div>`;
    let t, list;
    if (k === "sub") {
      t = "Cambio · ¿Quién sale?";
      list = L(jug.map((j) => j.id).filter((id) => c.on.has(id)), "anx") || '<span class="muted">No hay nadie en el campo.</span>';
    } else if (k.out) {
      t = `Cambio · ¿Quién entra por ${esc(anJn(k.out))}?`;
      list = L(jug.map((j) => j.id).filter((id) => !c.on.has(id) && !c.fuera.has(id)), "anx") || '<span class="muted">No quedan suplentes convocados.</span>';
    } else {
      t = tj(k) + " · ¿A quién?";
      list = L(jug.map((j) => j.id).filter((id) => !c.fuera.has(id)), "anx");
    }
    return `<div class="lv-pick"><h3>${t}</h3>${side}<div class="slotmenu">${list}${no}</div></div>`;
  }
  function anView() {
    let box = $("anData");
    if (!box) return;
    if (!anRow) {
      box.innerHTML = anErr
        ? `<h2 class="h2s">Anotador</h2><p class="muted">${esc(anErr)}</p>`
        : '<h2 class="h2s">Anotador no disponible</h2><p class="muted">Este enlace no existe o el entrenador lo ha quitado.</p>';
      return;
    }
    pubRow = anRow;
    let x = anRow,
      f = liveFal(x),
      h = lvParte(x),
      d = anBusy ? "disabled" : "",
      B = (k, t, cl = "secondary") => `<button class="${cl}" data-an="${k}" ${d}>${t}</button>`,
      mios = (Array.isArray(x.eventos) ? x.eventos : []).filter((e) => e.an).reverse(),
      txt = (e) =>
        e.t === "fa"
          ? `Falta ${e.r ? "de " + esc(x.rival || "rival") : "de " + esc(x.equipo)} <small>(${e.p === 2 ? 2 : 1}ª parte)</small>`
          : e.t === "c"
            ? "⚽ " + esc(x.rival || "Rival")
            : e.t === "f"
              ? "⚽ " + esc(e.n ? lvN(e.n, e.d) : x.equipo)
              : e.t === "s"
                ? `🔄 ▲ ${esc(lvN(e.ni, e.di))} ▼ ${esc(lvN(e.n, e.d))}${e.r ? " <small>" + esc(x.rival) + "</small>" : ""}`
                : `<i class="tj ${e.t}"></i> ${esc(lvN(e.n, e.d))}${e.r ? " <small>" + esc(x.rival) + "</small>" : ""}`;
    box.innerHTML = `<div class="kicker">Anotador · ${esc(MN(x.modalidad))}</div>${liveBoard(x, serverNow(), false)}${
      x.estado === "pre" ? '<p class="hint">El partido aún no ha empezado. Todo se apunta con el minuto en que vaya el reloj del entrenador.</p>' : ""
    }${x.estado === "FIN" ? '<p class="hint">El partido ha terminado. Si falta algo, aún puedes apuntarlo.</p>' : ""}<div class="lv-goals an-goals">${B("f", "⚽ Gol nuestro", "primary")}${B("c", "⚽ Gol rival")}</div><div class="lv-ctl an-fal">${B("fan", `Falta nuestra <b>${f["n" + h]}</b>`)}${B("far", `Falta del rival <b>${f["r" + h]}</b>`)}</div><div class="lv-ctl lv-more">${B("sub", "🔄 Cambio")}${B("a", '<i class="tj a"></i>Amarilla')}${B("r", '<i class="tj r"></i>Roja')}</div>${anPickHtml()}${
      mios.length
        ? `<h3 class="lv-h">Apuntado desde aquí</h3><div class="lv-ev">${mios
            .slice(0, 10)
            .map(
              (e) =>
                `<div class="lv-e ${e.t === "c" ? "c" : e.t === "s" ? "s" : e.t === "a" || e.t === "r" ? "t " + e.t : "f"}"><b>${Number(e.m) || 0}'</b><span>${txt(e)}</span><button class="ib d" data-anq="${esc(e.id)}" aria-label="Quitar ${AN_Q[e.t] || "esto"} del minuto ${Number(e.m) || 0}" title="Quitar">${ic("x", 18)}</button></div>`,
            )
            .join("")}</div>`
        : ""
    }<h3 class="lv-h">Todo el partido</h3>${liveEvents(x, false)}<p class="muted lv-upd">Se actualiza solo · ${new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</p>`;
  }
  function anSet(r) {
    if (r.error) {
      anErr = anMsg(r.error.message || "");
      if (/NO_EXISTE/.test(r.error.message || "")) anRow = null;
      return false;
    }
    anErr = "";
    anRow = r.data || null;
    if (anRow && anRow.ahora) liveSkew = Date.parse(anRow.ahora) - Date.now();
    return true;
  }
  async function anLoad() {
    if (anBusy) return;
    let r;
    try {
      r = await db.rpc("ver_anotador", { codigo: AN });
    } catch (e) {
      r = { error: e };
    }
    if (anBusy || anPick) return;
    if (!anSet(r) && anRow) return note(anErr);
    anView();
  }
  async function anCall(fn, args, ok) {
    if (anBusy) return;
    anBusy = true;
    anPick = null;
    anView();
    let r;
    try {
      r = await db.rpc(fn, Object.assign({ codigo: AN }, args));
    } catch (e) {
      r = { error: e };
    }
    anBusy = false;
    let bien = anSet(r);
    anView();
    if (bien) note(ok(), true);
    else note(anErr);
  }
  const anUlt = () => {
    let e = (anRow && Array.isArray(anRow.eventos) ? anRow.eventos : []).filter((z) => z.an).pop();
    return " en el minuto " + (e ? Number(e.m) || 0 : 0) + ".";
  };
  const anApunta = (ev, txt) => anCall("anotar", { ev }, () => txt + anUlt());
  function anRival() {
    let v = (id) => {
        let n = parseInt(($(id) || {}).value);
        return n >= 0 && n <= 99 ? String(n) : "";
      },
      k = anPick,
      ev = { t: k === "sub" ? "s" : k, r: 1 };
    if (k === "sub") {
      ev.d = v("anRs");
      ev.di = v("anRe");
      if (!ev.d && !ev.di) return note("Pon el dorsal del que sale o del que entra.");
    } else {
      ev.d = v("anRd");
      ev.n = (($("anRn") || {}).value || "").trim().slice(0, 30);
      if (!ev.d && !ev.n) return note("Pon el dorsal o el nombre del jugador.");
    }
    anApunta(ev, k === "sub" ? "Cambio del rival apuntado" : "Tarjeta al rival apuntada");
  }
  function startAn() {
    $("login").classList.add("hidden");
    $("app").classList.add("hidden");
    let box = document.createElement("main");
    box.id = "pub";
    box.className = "pub an";
    document.body.appendChild(box);
    document.title = "Anotador · Mi Fútbol JV32";
    box.innerHTML = pubShell('<div id="anData"><p class="muted">Cargando…</p></div>');
    box.addEventListener("click", (e) => {
      let b = e.target.closest("[data-an]"),
        p = e.target.closest("[data-anp]"),
        q = e.target.closest("[data-anq]"),
        xx = e.target.closest("[data-anx]"),
        sd = e.target.closest("[data-ans]");
      if (anBusy) return;
      if (p) return anApunta({ t: "f", pid: p.dataset.anp }, "Gol apuntado");
      if (sd) {
        anSide = sd.dataset.ans;
        return anView();
      }
      if (xx && anPick) {
        let k = anPick,
          id = xx.dataset.anx;
        if (k === "sub") {
          anPick = { out: id };
          return anView();
        }
        if (k.out) return anApunta({ t: "s", pid: k.out, pin: id }, "Cambio apuntado");
        return anApunta({ t: k, pid: id }, k === "r" ? "Roja apuntada" : "Amarilla apuntada");
      }
      if (q) {
        let ev = ((anRow && anRow.eventos) || []).find((z) => z.id === q.dataset.anq);
        if (!ev || !confirm(`¿Quitar ${AN_Q[ev.t] || "esto"} del minuto ${Number(ev.m) || 0}?`)) return;
        return anCall("anotar_quitar", { evento: ev.id }, () => "Quitado.");
      }
      if (!b) return;
      let k = b.dataset.an;
      if (k === "no") anPick = null;
      if (k === "rok") return anRival();
      if (k === "c") return anApunta({ t: "c" }, "Gol del rival apuntado");
      if (k === "fan") return anApunta({ t: "fa" }, "Falta nuestra apuntada");
      if (k === "far") return anApunta({ t: "fa", r: 1 }, "Falta del rival apuntada");
      if (k === "f") {
        if (anJug().length) anPick = "f";
        else return anApunta({ t: "f" }, "Gol apuntado");
      }
      if (k === "sub" || k === "a" || k === "r") {
        anPick = k;
        anSide = anJug().length ? "n" : "r";
      }
      anView();
      let pk = document.querySelector("#anData .lv-pick");
      if (pk && pk.scrollIntoView) pk.scrollIntoView({ block: "nearest" });
    });
    anLoad();
    setInterval(() => document.visibilityState === "visible" && anLoad(), 5000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") anLoad();
    });
  }
  if (AN) startAn();


  /* Pizarra: trazos (lápiz/flecha) + fichas que se arrastran (jugadores, rivales,
     balón y material) + jugada por pasos. Cada ficha guarda su posición en cada
     paso (p[i]); al reproducir se mueven de un paso al siguiente. Todo en coordenadas
     0..1 del campo y guardado solo en el dispositivo. */
  const BK = {
    own: "Jugador",
    riv: "Rival",
    ball: "Balón",
    cone: "Cono",
    hurdle: "Valla",
    pole: "Pica",
    goal: "Portería",
  };
  const BKI = {
    own: '<circle cx="12" cy="12" r="8" fill="#2be36a" stroke="#fff" stroke-width="2"/>',
    riv: '<circle cx="12" cy="12" r="8" fill="#ff4d5e" stroke="#fff" stroke-width="2"/>',
    ball: '<circle cx="12" cy="12" r="6" fill="#fff" stroke="#111" stroke-width="1.5"/><circle cx="12" cy="12" r="2" fill="#111"/>',
    cone: '<path d="M12 4 19 19H5z" fill="#ff8a1f" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>',
    hurdle: '<rect x="3" y="10" width="18" height="5" rx="1.5" fill="#ffd60a" stroke="#fff" stroke-width="1.2"/><path d="M8 10v5M12 10v5M16 10v5" stroke="#3a2f00" stroke-width="1.4"/>',
    pole: '<path d="M12 3v18" stroke="#ffd60a" stroke-width="4" stroke-linecap="round"/><path d="M12 7v3M12 14v3" stroke="#ff4d5e" stroke-width="4"/>',
    goal: '<path d="M4 7v10h16V7" fill="none" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/><path d="M4 11h16M4 14h16M9 7v10M15 7v10" stroke="#fff" stroke-width=".8" opacity=".6"/>',
  };
  const BCOL = { own: "#2be36a", riv: "#ff4d5e", ball: "#ffffff" };
  const boardState = {};
  const cleanItems = (L, n) =>
    (Array.isArray(L) ? L : [])
      .filter((i) => i && BK[i.k] && Array.isArray(i.p) && i.p.length)
      .map((i) => {
        let p = i.p.filter((q) => Array.isArray(q) && q.length === 2).slice(0, n);
        while (p.length < n) p.push((p[p.length - 1] || [0.5, 0.5]).slice());
        return {
          id: String(i.id || Math.random().toString(36).slice(2)),
          k: i.k,
          n: String(i.n || "").slice(0, 3),
          pid: i.pid || "",
          r: Number(i.r) || 0,
          c: isHex(i.c) ? i.c : "",
          p,
        };
      });
  const blankBoard = () => ({
    strokes: [],
    items: [],
    steps: 1,
    step: 0,
    hist: [],
    bg: "",
    color: "#ffd60a",
    tcol: {},
    tool: "move",
    est: "",
    f: "",
  });
  try {
    let r = JSON.parse(localStorage.getItem("mf_pizarra_v1") || "{}");
    Object.keys(MODES).forEach((k) => {
      let x = r[k] || {},
        n = Math.min(PASOS_MAX, Math.max(1, parseInt(x.steps) || 1));
      boardState[k] = {
        ...blankBoard(),
        strokes: Array.isArray(x.strokes)
          ? x.strokes.filter((s) => s && Array.isArray(s.p))
          : [],
        items: cleanItems(x.items, n),
        steps: n,
        step: Math.min(n - 1, Math.max(0, parseInt(x.step) || 0)),
        bg: x.bg || "",
        color: x.color || "#ffd60a",
        tcol: x.tcol && typeof x.tcol === "object" ? x.tcol : {},
        tool: "move",
        est: typeof x.est === "string" ? x.est : "",
        f: typeof x.f === "string" ? x.f : "",
        clean: !!x.clean,
      };
    });
  } catch (e) {}
  const bd = () =>
    boardState[state.mode] || (boardState[state.mode] = blankBoard());
  function saveBoard() {
    try {
      let o = {};
      Object.keys(boardState).forEach((k) => {
        let x = boardState[k];
        o[k] = {
          strokes: x.strokes,
          items: x.items,
          steps: x.steps,
          step: x.step,
          bg: x.bg,
          color: x.color,
          tcol: x.tcol,
          tool: x.tool,
          est: x.est || "",
          f: x.f || "",
          clean: !!x.clean,
        };
      });
      let s = JSON.stringify(o);
      if (s.length < 900000) localStorage.setItem("mf_pizarra_v1", s);
    } catch (e) {}
  }
  const snap = (b) =>
    JSON.stringify({ s: b.strokes, i: b.items, n: b.steps, c: b.step });
  function pushHist(b) {
    b.hist.push(snap(b));
    if (b.hist.length > 60) b.hist.shift();
  }
  function restoreHist(b, h) {
    let x = JSON.parse(h);
    if (Array.isArray(x)) x = { s: x, i: b.items, n: b.steps, c: b.step };
    b.strokes = x.s || [];
    b.steps = x.n || 1;
    b.items = cleanItems(x.i, b.steps);
    b.step = Math.min(b.steps - 1, x.c || 0);
  }
  function paintStrokes(g, list, x0, y0, w, h, lw, map) {
    g.save();
    g.lineCap = "round";
    g.lineJoin = "round";
    list.forEach((s) => {
      let P = s.p.map((q) => {
        let m = map ? map(q) : q;
        return [x0 + m[0] * w, y0 + m[1] * h];
      });
      if (!P.length) return;
      g.strokeStyle = s.c;
      g.fillStyle = s.c;
      g.lineWidth = lw;
      g.shadowColor = "rgba(0,0,0,.55)";
      g.shadowBlur = lw * 0.8;
      g.beginPath();
      g.moveTo(P[0][0], P[0][1]);
      if (P.length === 1) g.lineTo(P[0][0] + 0.01, P[0][1]);
      else {
        for (let i = 1; i < P.length - 1; i++) {
          let mx = (P[i][0] + P[i + 1][0]) / 2,
            my = (P[i][1] + P[i + 1][1]) / 2;
          g.quadraticCurveTo(P[i][0], P[i][1], mx, my);
        }
        g.lineTo(P[P.length - 1][0], P[P.length - 1][1]);
      }
      g.stroke();
      if (s.t === "arrow" && P.length > 1) {
        let k = P.length - 1,
          e = P[k],
          j = k;
        while (j > 0 && Math.hypot(e[0] - P[j][0], e[1] - P[j][1]) < lw * 3)
          j--;
        if (j < k) arrowHead(g, P[j], e, lw);
      }
    });
    g.restore();
  }
  function arrowHead(g, from, e, lw) {
    let a = Math.atan2(e[1] - from[1], e[0] - from[0]),
      L = lw * 4.4;
    g.save();
    g.shadowBlur = 0;
    g.setLineDash([]);
    g.beginPath();
    g.moveTo(e[0] + Math.cos(a) * lw * 0.6, e[1] + Math.sin(a) * lw * 0.6);
    g.lineTo(e[0] - L * Math.cos(a - 0.5), e[1] - L * Math.sin(a - 0.5));
    g.lineTo(e[0] - L * Math.cos(a + 0.5), e[1] - L * Math.sin(a + 0.5));
    g.closePath();
    g.fill();
    g.restore();
  }
  /* Tamaño base de las fichas según el ancho del campo y la modalidad. */
  const tokU = (w, mode) => w * (mode === "11" ? 0.031 : 0.038);
  const ORD = { goal: 0, hurdle: 1, pole: 2, cone: 3, riv: 4, own: 5, ball: 6 };
  const byOrd = (L) => L.slice().sort((a, b) => ORD[a.k] - ORD[b.k]);
  /* Etiqueta de una ficha: dorsal del jugador (si lo tiene), su inicial o el número puesto. */
  function itemLabel(it) {
    if (it.k === "own" && it.pid) {
      let p = state.players.find((x) => x.id === it.pid);
      if (p) return dorsal(p) || (p.nombre[0] || "?").toUpperCase();
    }
    return it.n;
  }
  function itemName(it) {
    if (it.k !== "own" || !it.pid) return "";
    let p = state.players.find((x) => x.id === it.pid);
    return p ? p.nombre.split(" ")[0] : "";
  }
  /* Dibuja trayectorias (del paso anterior al actual) y fichas. pos(it) da la posición 0..1. */
  function paintScene(g, b, x0, y0, w, h, pos, trails, map) {
    let u = tokU(Math.min(w, h), state.mode),
      ff = '"Barlow Condensed","Arial Narrow",Impact,sans-serif',
      XY = (q) => {
        let m = map ? map(q) : q;
        return [x0 + m[0] * w, y0 + m[1] * h];
      };
    g.save();
    g.lineCap = "round";
    g.lineJoin = "round";
    if (trails && b.step > 0)
      b.items.forEach((it) => {
        let a = XY(it.p[b.step - 1]),
          c = XY(it.p[b.step]),
          d = Math.hypot(c[0] - a[0], c[1] - a[1]);
        if (d < u * 0.6) return;
        let col = it.c || BCOL[it.k] || "#e8f5d8",
          lw = Math.max(2, u * 0.13),
          stop = it.k === "ball" ? u * 0.6 : it.k === "own" || it.k === "riv" ? u * 1.1 : u * 0.9,
          e = [c[0] - ((c[0] - a[0]) / d) * stop, c[1] - ((c[1] - a[1]) / d) * stop];
        g.strokeStyle = col;
        g.fillStyle = col;
        g.globalAlpha = 0.9;
        g.lineWidth = lw;
        g.setLineDash(it.k === "ball" ? [] : [u * 0.42, u * 0.32]);
        g.beginPath();
        g.moveTo(a[0], a[1]);
        g.lineTo(e[0], e[1]);
        g.stroke();
        arrowHead(g, a, e, lw);
        g.globalAlpha = 1;
      });
    g.setLineDash([]);
    byOrd(b.items).forEach((it) => {
      let [x, y] = XY(pos(it));
      g.save();
      g.translate(x, y);
      g.shadowColor = "rgba(0,0,0,.5)";
      g.shadowBlur = u * 0.35;
      g.shadowOffsetY = u * 0.08;
      if (it.k === "own" || it.k === "riv") {
        let col = it.c || BCOL[it.k];
        if (it.id === state.boardPick && g.canvas.id === "bcanvas") {
          g.save();
          g.shadowBlur = 0;
          g.beginPath();
          g.arc(0, 0, u * 1.45, 0, Math.PI * 2);
          g.setLineDash([u * 0.35, u * 0.25]);
          g.lineWidth = Math.max(2, u * 0.16);
          g.strokeStyle = "#ffffff";
          g.stroke();
          g.restore();
        }
        g.beginPath();
        g.arc(0, 0, u, 0, Math.PI * 2);
        g.fillStyle = col;
        g.fill();
        g.shadowBlur = 0;
        g.shadowOffsetY = 0;
        g.lineWidth = Math.max(1.5, u * 0.14);
        g.strokeStyle = "#ffffff";
        g.stroke();
        let t = itemLabel(it);
        g.fillStyle = inkOn(col);
        g.font = `800 ${Math.round(u * (t.length > 2 ? 0.85 : 1.15))}px ${ff}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(t, 0, u * 0.08);
        let nmx = itemName(it);
        if (nmx) {
          g.font = `700 ${Math.round(u * 0.62)}px ${ff}`;
          nmx = clipTxt(g, nmx, u * 3.4);
          let tw = g.measureText(nmx).width + u * 0.5;
          rr(g, -tw / 2, u * 1.2, tw, u * 0.82, u * 0.3);
          g.fillStyle = "rgba(5,15,10,.86)";
          g.fill();
          g.fillStyle = "#f1f7ea";
          g.fillText(nmx, 0, u * 1.63);
        }
      } else if (it.k === "ball") {
        let r = u * 0.48;
        g.beginPath();
        g.arc(0, 0, r, 0, Math.PI * 2);
        g.fillStyle = "#ffffff";
        g.fill();
        g.shadowBlur = 0;
        g.lineWidth = Math.max(1, r * 0.18);
        g.strokeStyle = "#111";
        g.stroke();
        g.beginPath();
        g.arc(0, 0, r * 0.38, 0, Math.PI * 2);
        g.fillStyle = "#111";
        g.fill();
      } else if (it.k === "cone") {
        let s = u * 0.62;
        g.beginPath();
        g.moveTo(0, -s * 1.15);
        g.lineTo(s, s * 0.8);
        g.lineTo(-s, s * 0.8);
        g.closePath();
        g.fillStyle = "#ff8a1f";
        g.fill();
        g.shadowBlur = 0;
        g.lineWidth = Math.max(1, u * 0.1);
        g.strokeStyle = "#ffffff";
        g.stroke();
      } else if (it.k === "pole") {
        let r = u * 0.3;
        g.beginPath();
        g.arc(0, 0, r, 0, Math.PI * 2);
        g.fillStyle = "#ffd60a";
        g.fill();
        g.shadowBlur = 0;
        g.lineWidth = Math.max(1, r * 0.35);
        g.strokeStyle = "#ff4d5e";
        g.stroke();
      } else {
        g.rotate(((it.r - (map ? 90 : 0)) * Math.PI) / 180);
        if (it.k === "hurdle") {
          let L = u * 1.9,
            H = u * 0.34;
          rr(g, -L / 2, -H / 2, L, H, H * 0.35);
          g.fillStyle = "#ffd60a";
          g.fill();
          g.shadowBlur = 0;
          g.lineWidth = Math.max(1, u * 0.08);
          g.strokeStyle = "#ffffff";
          g.stroke();
          g.strokeStyle = "#3a2f00";
          g.lineWidth = Math.max(1, u * 0.09);
          g.beginPath();
          [-0.25, 0, 0.25].forEach((f) => {
            g.moveTo(L * f, -H / 2);
            g.lineTo(L * f, H / 2);
          });
          g.stroke();
        } else {
          let L = u * 2.8,
            D = u * 0.9,
            lw = Math.max(2, u * 0.2);
          g.fillStyle = "rgba(255,255,255,.16)";
          g.fillRect(-L / 2, -D, L, D);
          g.shadowBlur = 0;
          g.strokeStyle = "rgba(255,255,255,.45)";
          g.lineWidth = Math.max(1, u * 0.05);
          g.beginPath();
          for (let i = 1; i < 6; i++) {
            g.moveTo(-L / 2 + (L * i) / 6, -D);
            g.lineTo(-L / 2 + (L * i) / 6, 0);
          }
          g.moveTo(-L / 2, -D / 2);
          g.lineTo(L / 2, -D / 2);
          g.stroke();
          g.strokeStyle = "#ffffff";
          g.lineWidth = lw;
          g.beginPath();
          g.moveTo(-L / 2, 0);
          g.lineTo(-L / 2, -D);
          g.lineTo(L / 2, -D);
          g.lineTo(L / 2, 0);
          g.stroke();
        }
      }
      g.restore();
    });
    g.restore();
  }
  /* Radio para tocar una ficha, en unidades u. */
  const HIT = { own: 1.3, riv: 1.3, ball: 0.9, cone: 1, pole: 0.8, hurdle: 1.2, goal: 1.6 };
  const ease = (f) => (f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2);
  const ANIM_D = 1100,
    ANIM_H = 350;
  /* Posición de cada ficha a los t ms de reproducir la jugada. */
  function animPos(b, t) {
    t = Math.max(0, t);
    let seg = Math.floor(t / (ANIM_D + ANIM_H)),
      last = b.steps - 1;
    if (seg >= last) return (it) => it.p[last];
    let f = ease(Math.min(1, (t - seg * (ANIM_D + ANIM_H)) / ANIM_D));
    return (it) => {
      let a = it.p[seg],
        c = it.p[seg + 1];
      return [a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f];
    };
  }
  const animTotal = (b) => (b.steps - 1) * (ANIM_D + ANIM_H);
  /* Campo en horizontal cuando la pantalla es más ancha que alta (tablet, PC, móvil girado). */
  function boardLand() {
    return window.innerWidth > window.innerHeight;
  }
  function boardPhoneLand() {
    return boardLand() && window.innerHeight <= 560;
  }
  let boardWasLand = false;
  window.addEventListener("resize", () => {
    if (state.tab === "pizarra" && !state.draft && boardLand() !== boardWasLand) {
      stopAnim();
      if (!boardPhoneLand()) {
        state.presentOff = false;
        if (state.autoPres) state.present = state.autoPres = false;
      }
      render();
    }
  });
  let boardAnim = null,
    boardRedraw = null;
  function stopAnim(go) {
    if (!boardAnim) return;
    cancelAnimationFrame(boardAnim.raf);
    boardAnim = null;
    if (go) render();
  }
  function playAnim() {
    let b = bd();
    if (b.steps < 2) {
      note("Añade al menos un paso más para ver la jugada en movimiento.");
      return;
    }
    let t0 = performance.now(),
      mode = state.mode;
    boardAnim = { raf: 0 };
    render();
    const tick = (now) => {
      if (!boardAnim) return;
      if (state.tab !== "pizarra" || state.mode !== mode || !$("bcanvas")) {
        boardAnim = null;
        return;
      }
      let t = Math.max(0, now - t0);
      if (boardRedraw) boardRedraw(animPos(b, t));
      if (b.est) estStepTxt(Math.min(b.steps - 1, Math.floor(t / (ANIM_D + ANIM_H)) + (t % (ANIM_D + ANIM_H) > ANIM_D * 0.5 ? 1 : 0)));
      if (t >= animTotal(b) + 250) {
        b.step = b.steps - 1;
        saveBoard();
        stopAnim(true);
        return;
      }
      boardAnim.raf = requestAnimationFrame(tick);
    };
    boardAnim.raf = requestAnimationFrame(tick);
  }
  function addItem(k, pid) {
    let b = bd(),
      n = b.items.length,
      q = [
        Math.round((0.5 + ((n % 5) - 2) * 0.12) * 1000) / 1000,
        Math.round((0.4 + (Math.floor(n / 5) % 4) * 0.08) * 1000) / 1000,
      ],
      lab = "";
    if (k === "own" || k === "riv") {
      let used = b.items
        .filter((i) => i.k === k && !i.pid)
        .map((i) => parseInt(i.n) || 0);
      lab = String(used.length ? Math.max(...used) + 1 : 1);
    }
    pushHist(b);
    b.items.push({
      id: Math.random().toString(36).slice(2, 10),
      k,
      n: pid ? "" : lab,
      pid: pid || "",
      r: 0,
      c: isHex((b.tcol || {})[k]) ? b.tcol[k] : "",
      p: Array.from({ length: b.steps }, () => q.slice()),
    });
    if (b.tool === "erase") b.tool = "move";
    saveBoard();
  }
  /* Pone en el campo a los titulares de un partido, con su dorsal, en su posición. */
  function loadLineup(id) {
    let b = bd(),
      m = state.matches.find((x) => x.id === id);
    if (!m || !m.alineacion) return;
    let f = formations[m.modalidad][m.alineacion.formation];
    if (!f) return;
    pushHist(b);
    let keep = b.items.filter((i) => i.k !== "own"),
      gk = gkOf(m.alineacion),
      add = [];
    f.forEach((s, i) => {
      let pid = (m.alineacion.slots || {})[i];
      if (!pid) return;
      let q = [s[1] / 100, Math.min(s[2] / 100, 0.93)];
      add.push({
        id: Math.random().toString(36).slice(2, 10),
        k: "own",
        n: "",
        pid,
        r: 0,
        c: slotCol(m.alineacion, pid, gk) || (pid === gk ? "#fbbf24" : ""),
        p: Array.from({ length: b.steps }, () => q.slice()),
      });
    });
    b.items = keep.concat(add);
    saveBoard();
  }
  /* Estrategias de fútbol sala (estrategias-fs.js): biblioteca de jugadas a balón
     parado y 5x4 que se cargan en la pizarra como jugada por pasos. Las «top»
     son gratis; el resto, con el plan Pro. */
  /* v11.7: en fútbol 7 y fútbol 11, la biblioteca de ABP (abp.js) funciona igual, en un campo de 68 x 105. */
  const EST_FS = window.MF_EST_FS || { cats: [], list: [] },
    EST_ABP = window.MF_ABP || { cats: [], list: [] };
  /* Geometría de cada biblioteca: ancho y largo en metros */
  const estG = () => (state.mode === "fs" ? { W: 20, H: 40, s: 1 } : { W: 68, H: 105, s: 2.6 });
  let EST = EST_FS;
  const estLib = () => (EST = state.mode === "fs" ? EST_FS : EST_ABP);
  const estDe = (id) => estLib().list.find((e) => e.id === id);
  const estLibre = (e) => !!e.top || plan === "pro";
  const estCatN = (c) => (estLib().cats.find((x) => x[0] === c) || [c, c])[1];
  /* Fase del juego de una estrategia (para «Mis jugadas»): casi todas son ABP */
  const estFase = (e) => (e.cat === "5x4" ? "at" : e.cat === "defensa" && !/córner|falta|barrera|banda/i.test(e.n) ? "de" : "abp");
  const estTitulo = () => (state.mode === "fs" ? "Estrategias de fútbol sala" : "Jugadas a balón parado (ABP)");
  const EST_ORO = "#fbbf24";
  /* Metros del campo a coordenadas 0..1 del campo dibujado. */
  const estQ = (q) => {
    let G = estG();
    return [
      Math.round(Math.min(0.99, Math.max(0.01, 0.06 + (q[0] / G.W) * 0.88)) * 10000) / 10000,
      Math.round(Math.min(0.99, Math.max(0.01, 0.04 + (q[1] / G.H) * 0.92)) * 10000) / 10000,
    ];
  };
  const estPasos = (e) => Math.max(1, ...e.it.map((i) => i[2].length));
  function estItems(e) {
    let n = estPasos(e);
    return e.it.map((i, x) => {
      let p = i[2].map(estQ);
      while (p.length < n) p.push(p[p.length - 1].slice());
      return {
        id: e.id + "-" + x + "-" + Math.random().toString(36).slice(2, 6),
        k: i[0] === "o" ? "own" : i[0] === "r" ? "riv" : "ball",
        n: i[1] || "",
        pid: "",
        r: 0,
        c: i[0] === "o" && (i[1] === "P" || i[1] === "PJ") ? EST_ORO : "",
        p,
      };
    });
  }
  /* Dibujo pequeño de la jugada: posición inicial y recorrido de cada ficha. */
  function estSvg(e) {
    let G = estG(),
      k = G.s,
      ys = [];
    e.it.forEach((i) => {
      if (i[1] === "P" && i[2].length === 1) return;
      i[2].forEach((q) => ys.push(q[1]));
    });
    let mn = 18 * k,
      y0 = Math.max(-1.5 * k, Math.min(...ys) - 3 * k),
      y1 = Math.min(G.H + 1.5 * k, Math.max(...ys) + 3 * k);
    if (y1 - y0 < mn) y1 = Math.min(G.H + 1.5 * k, y0 + mn);
    if (y1 - y0 < mn) y0 = y1 - mn;
    const col = { o: "#2be36a", r: "#ff4d5e", b: "#ffffff" };
    let tr = "",
      dots = "";
    e.it.forEach((i) => {
      let P = i[2],
        c = i[0] === "o" && (i[1] === "P" || i[1] === "PJ") ? EST_ORO : col[i[0]];
      if (P.length > 1) {
        let pts = P.map((q) => q[0] + "," + q[1]).join(" "),
          moved = P.some((q) => Math.hypot(q[0] - P[0][0], q[1] - P[0][1]) > 0.6);
        if (moved) {
          let l = P[P.length - 1];
          tr += `<polyline points="${pts}" fill="none" stroke="${c}" stroke-width="${(i[0] === "b" ? 0.45 : 0.35) * k}" stroke-linecap="round" stroke-linejoin="round"${i[0] === "b" ? "" : ` stroke-dasharray="${0.9 * k} ${0.7 * k}"`} opacity=".85"/><circle cx="${l[0]}" cy="${l[1]}" r="${0.45 * k}" fill="${c}"/>`;
        }
      }
      dots += `<circle cx="${P[0][0]}" cy="${P[0][1]}" r="${(i[0] === "b" ? 0.55 : 0.95) * k}" fill="${c}" stroke="${i[0] === "b" ? "#111" : "#fff"}" stroke-width="${0.25 * k}"/>`;
    });
    let vw = G.W + 3 * k,
      lin =
        state.mode === "fs"
          ? `<rect x="0" y="0" width="20" height="40"/><path d="M0 20H20M2.5 0Q2.5 6 8.5 6H11.5Q17.5 6 17.5 0M2.5 40Q2.5 34 8.5 34H11.5Q17.5 34 17.5 40"/><circle cx="10" cy="20" r="3"/><path d="M8.5 0V-1H11.5V0M8.5 40V41H11.5V40" stroke-width="0.35"/>`
          : `<rect x="0" y="0" width="68" height="105"/><path d="M0 52.5H68M13.84 0V16.5H54.16V0M24.84 0V5.5H43.16V0M13.84 105V88.5H54.16V105M24.84 105V99.5H43.16V105"/><circle cx="34" cy="52.5" r="9.15"/><path d="M30.34 0V-1.6H37.66V0M30.34 105V106.6H37.66V105" stroke-width="0.9"/>`;
    return `<svg class="est-pv" width="84" height="${Math.min(150, Math.round((84 * (y1 - y0)) / vw))}" viewBox="${-1.5 * k} ${y0} ${vw} ${y1 - y0}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><rect x="${-1.5 * k}" y="${y0}" width="${vw}" height="${y1 - y0}" fill="${state.mode === "fs" ? "#12476a" : "#104228"}"/><g fill="none" stroke="rgba(232,245,216,.7)" stroke-width="${0.25 * k}">${lin}</g>${tr}${dots}</svg>`;
  }
  let estCat = "";
  function estLibHtml() {
    estLib();
    let L = EST.list.filter((e) => !estCat || (estCat === "top" ? e.top : e.cat === estCat)),
      pro = plan === "pro",
      nTop = EST.list.filter((e) => e.top).length;
    const chip = (v, t) =>
      `<button type="button" class="est-chip" data-estc="${v}" aria-pressed="${estCat === v}">${esc(t)}</button>`;
    return `<p>${
      state.mode === "fs"
        ? `${EST.list.length} estrategias de fútbol sala para ensayar: córners, saques de banda, faltas, saque de centro, saque del portero y el 5x4 con portero-jugador.`
        : `${EST.list.length} jugadas a balón parado (ABP) para ensayar: córners, faltas laterales y frontales, saques de banda y cómo defenderlas. Sirven para ${esc(MN())}: solo salen los jugadores que intervienen.`
    } Toca una y se carga en la pizarra <b>moviéndose paso a paso</b>, con lo que hace cada jugador.</p>${pro ? "" : `<p class="muted">Las <b>${nTop} más usadas</b> (marcadas con TOP) son gratis. Las demás vienen con el plan Pro.</p>`}<div class="est-chips" role="group" aria-label="Tipo de estrategia">${chip("", "Todas")}${chip("top", "Las más usadas")}${EST.cats.map((c) => chip(c[0], c[1])).join("")}</div><div class="est-list">${L.map((e) => {
      let ok = estLibre(e);
      return `<button type="button" class="est-item${ok ? "" : " lock"}" data-est="${e.id}">${estSvg(e)}<span class="est-tx"><span class="est-k">${e.top ? '<i class="est-top">TOP</i>' : ""}${esc(estCatN(e.cat))}${ok ? "" : ' <i class="est-pro">PRO</i>'}</span><b>${esc(e.n)}</b><small>${esc(e.d)}</small><span class="est-go">${ok ? "▶ Cargar en la pizarra" : "Disponible con el plan Pro"}</span></span></button>`;
    }).join("")}</div>`;
  }
  function estOpen() {
    $("infoTitle").textContent = estTitulo();
    $("infoBody").innerHTML = estLibHtml();
    $("info").classList.remove("hidden");
  }
  function estProHtml(e) {
    estLib();
    let qu = state.mode === "fs" ? "estrategia" : "jugada";
    return `<p><b>${esc(e.n)}</b></p><p>${esc(e.d)}</p><p>Esta ${qu} es del <b>plan Pro</b>. En el plan gratuito tienes las ${EST.list.filter((x) => x.top).length} más usadas; con el plan Pro, <b>las ${EST.list.length}</b>, además de jugadores, partidos y entrenamientos ilimitados y varios equipos.</p>${precioProHtml()}<div class="stack">${proBtn()}${clubLinkBtn()}<button type="button" class="secondary" data-estlib="1">Volver a la lista</button></div>`;
  }
  function estLoad(id) {
    let e = estDe(id);
    if (!e) return;
    if (!estLibre(e)) {
      $("infoTitle").textContent = state.mode === "fs" ? "Estrategia Pro" : "Jugada Pro";
      $("infoBody").innerHTML = estProHtml(e);
      return;
    }
    let b = bd();
    if (
      (b.strokes.length || b.items.length) &&
      b.est !== id &&
      !confirm("Se cambia lo que tienes en la pizarra por esta estrategia. Si te arrepientes, pulsa «Deshacer». ¿Seguir?")
    )
      return;
    stopAnim();
    pushHist(b);
    b.strokes = [];
    b.steps = estPasos(e);
    b.items = estItems(e);
    b.step = 0;
    b.tool = "move";
    b.est = id;
    b.f = estFase(e);
    state.boardPick = null;
    state.boardMenu = false;
    saveBoard();
    $("info").classList.add("hidden");
    render();
    /* La explicación arriba y debajo el campo (la jugada pasa en la mitad de arriba). */
    try {
      let bar = document.querySelector(".est-bar"),
        hd = document.querySelector(".head");
      if (bar)
        window.scrollTo(0, Math.max(0, bar.getBoundingClientRect().top + window.pageYOffset - (hd ? hd.offsetHeight : 0) - 8));
    } catch (x) {}
    setTimeout(() => {
      if (state.tab === "pizarra" && bd().est === id && !boardAnim) playAnim();
    }, 450);
  }
  /* Tarjeta de la estrategia cargada: nombre, lo que pasa en el paso actual y claves. */
  function estCardHtml(b) {
    let e = b.est && estDe(b.est);
    if (!e || e.s.length !== b.steps) return "";
    return `<div class="est-card"><div class="est-ct"><span class="kicker">${esc(estCatN(e.cat))}</span><button type="button" class="bi" data-b="estx" aria-label="Quitar la explicación" title="Quitar la explicación">${ic("x", 18)}</button></div><b class="est-cn">${esc(e.n)}</b><p class="est-step" id="estStep"><b>Paso ${b.step + 1}:</b> ${esc(e.s[b.step] || "")}</p><details class="est-claves"><summary>Claves para que salga bien</summary><ul>${e.k.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details></div>`;
  }
  function estStepTxt(i) {
    let el = $("estStep"),
      e = bd().est && estDe(bd().est);
    if (!el || !e || !e.s[i]) return;
    let t = `<b>Paso ${i + 1}:</b> ${esc(e.s[i])}`;
    if (el.innerHTML !== t) el.innerHTML = t;
  }
  function estBarHtml() {
    estLib();
    let b = bd();
    return `<div class="est-bar"><button type="button" class="est-btn" data-b="est"><svg class="ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h4"/></svg><span>${estTitulo()}</span><small>${EST.list.length}</small></button>${estCardHtml(b)}</div>`;
  }
  document.addEventListener("click", (e) => {
    let t = e.target.closest("[data-est],[data-estc],[data-estlib]");
    if (!t || !$("infoBody").contains(t)) return;
    if (t.dataset.estc !== undefined) {
      estCat = t.dataset.estc;
      $("infoBody").innerHTML = estLibHtml();
    } else if (t.dataset.estlib) $("infoBody").innerHTML = estLibHtml();
    else estLoad(t.dataset.est);
  });
  function boardView() {
    let b = bd(),
      gs = games().filter(
        (m) =>
          m.alineacion &&
          m.alineacion.slots &&
          Object.keys(m.alineacion.slots).length,
      );
    /* Pizarras guardadas antes de las fichas: la alineación de fondo pasa a ser fichas. */
    if (b.bg) {
      if (!b.items.length && gs.some((m) => m.id === b.bg)) {
        loadLineup(b.bg);
        b.hist = [];
      }
      b.bg = "";
      saveBoard();
    }
    const sw = [
      ["#ffd60a", "Amarillo"],
      ["#ffffff", "Blanco"],
      ["#ff4d5e", "Rojo"],
      ["#38bdf8", "Azul"],
    ];
    let onB = new Set(b.items.map((i) => i.pid).filter(Boolean)),
      menu = state.boardMenu
        ? `<div class="bmenu" role="menu"><button role="menuitem" data-b="addp" data-v=""><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">${BKI.own}</svg>Ficha con número</button>${roster()
            .filter((p) => !onB.has(p.id))
            .map(
              (p) =>
                `<button role="menuitem" data-b="addp" data-v="${p.id}"><i class="bdn">${esc(dorsal(p) || (p.nombre[0] || "?").toUpperCase())}</i>${esc(p.nombre)}</button>`,
            )
            .join("")}</div>`
        : "",
      playing = !!boardAnim;
    const dis = (c) => (c || playing ? " disabled" : "");
    let pk = state.boardPick && !playing && b.items.find((i) => i.id === state.boardPick);
    if (!pk) state.boardPick = null;
    let pick = pk
      ? `<div class="bcolp" role="dialog" aria-label="Color de la ficha"><div class="bcolp-t"><b>Color ${pk.k === "own" ? (itemName(pk) ? "de " + esc(itemName(pk)) : "del jugador " + esc(itemLabel(pk))) : "del rival " + esc(itemLabel(pk))}</b><button type="button" class="bi" data-pcx="1" aria-label="Cerrar" title="Cerrar">${ic("x")}</button></div>${colorPicker(
          "bd",
          pk.c || BCOL[pk.k],
          `<button type="button" data-pca="all">A todos los ${pk.k === "own" ? "míos" : "rivales"}</button><button type="button" data-pc="">Color normal</button>`,
        )}</div>`
      : "";
    boardWasLand = boardLand();
    return `${state.present ? "" : estBarHtml()}<section class="panel board ${state.present ? "present" : ""}${playing ? " playing" : ""}${boardWasLand ? " land" : ""}${b.tool === "move" ? " tool-move" : ""}${b.clean && esPro() ? " clean" : ""}" id="boardPanel">
<div class="bw"><div class="br br-t" role="toolbar" aria-label="Dibujar">${[
      ["move", "Mover fichas (no pinta)", "hand"],
      ["pen", "Lápiz", "penline"],
      ["arrow", "Flecha", "arrow"],
      ["erase", "Goma: borra la línea o la ficha que toques", "eraser"],
    ]
      .map(
        (t) =>
          `<button class="bi" data-b="tool" data-v="${t[0]}" aria-pressed="${b.tool === t[0]}" aria-label="${t[1]}" title="${t[1]}">${ic(t[2], 20)}</button>`,
      )
      .join(
        "",
      )}<span class="brs"></span>${sw.map((c) => `<button class="sw" data-b="color" data-v="${c[0]}" style="--c:${c[0]}" aria-label="${c[1]}" title="${c[1]}" aria-pressed="${b.color === c[0]}"><i></i></button>`).join("")}<span class="brs"></span><button class="bi" data-b="undo" aria-label="Deshacer" title="Deshacer">${ic("undo")}</button><button class="bi d" data-b="clear" aria-label="Borrar todo" title="Borrar todo">${ic("trash")}</button></div>
<div class="bfield"><div class="field ${state.mode === "fs" ? "fs" : ""}" id="bfield"><div class="wm"></div><div class="fm">${fieldMarks().replace('<div class="wm"></div>', "")}</div><canvas id="bcanvas" role="img" aria-label="Pizarra táctica: arrastra las fichas y dibuja con el dedo o el ratón"></canvas></div></div>
<div class="br br-p" role="toolbar" aria-label="Añadir al campo">${Object.keys(BK)
      .map(
        (k) =>
          `<button class="bpc" data-b="add" data-v="${k}" aria-label="Añadir ${BK[k].toLowerCase()}" title="Añadir ${BK[k].toLowerCase()}"${k === "own" ? ` aria-haspopup="menu" aria-expanded="${!!state.boardMenu}"` : ""}><svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">${BKI[k]}</svg><small>${BK[k]}</small></button>`,
      )
      .join("")}${menu}</div></div>
<div class="bbot"><div class="bsteps" role="toolbar" aria-label="Jugada en movimiento"><button class="bi" data-b="prev" aria-label="Paso anterior" title="Paso anterior"${dis(b.step < 1)}>${ic("left")}</button><b class="bst-n" aria-live="polite">Paso ${b.step + 1} / ${b.steps}</b><button class="bi" data-b="next" aria-label="Paso siguiente" title="Paso siguiente"${dis(b.step >= b.steps - 1)}>${ic("right")}</button><button class="bi" data-b="addstep" aria-label="Añadir paso" title="Añadir paso"${dis()}>${ic("plus")}</button><button class="bi d" data-b="delstep" aria-label="Quitar este paso" title="Quitar este paso"${dis(b.steps < 2)}>${ic("x")}</button><span class="brs"></span><button class="bi go" data-b="play" aria-label="${playing ? "Parar" : "Ver jugada"}" title="${playing ? "Parar" : "Ver jugada"}">${ic(playing ? "stop" : "play")}</button><button class="bi" data-b="video" aria-label="Vídeo de la jugada" title="Vídeo de la jugada"${dis()}>${ic("film")}</button></div>
<div class="bextra"><button class="bi" data-b="img" aria-label="Guardar imagen" title="Guardar imagen">${ic("download")}</button><button class="btx${b.clean && esPro() ? " on" : ""}" data-b="clean" aria-pressed="${!!(b.clean && esPro())}" title="Pizarra limpia: campo liso, sin rayas ni escudo${esPro() ? "" : " (plan Pro)"}">${ic("eraser", 18)}Limpia${esPro() ? "" : '<em class="pro-tag">PRO</em>'}</button><button class="btx" data-b="vids" title="Vídeos de jugadas guardados en este dispositivo">${ic("film", 18)}Vídeos</button><button class="bi go" data-b="present" aria-label="${state.present ? "Salir de pantalla completa" : "Presentar a pantalla completa"}" title="${state.present ? "Salir" : "Presentar"}">${ic(state.present ? "x" : "maximize")}</button>${gs.length ? `<label class="bgsel"><span>Titulares</span><select id="boardBg" aria-label="Poner en el campo los titulares de un partido"><option value="">Poner titulares de…</option>${gs.map((m) => `<option value="${m.id}">vs ${esc(m.rival)} · ${esc(fmtDate(m.fecha))}</option>`).join("")}</select></label>` : ""}<button class="btx" data-b="jg" title="Guardar la jugada con un nombre y ver «Mis jugadas»">${ic("download", 18)}Guardar</button></div></div>${pick}</section>`;
  }
  let boardRO = null;
  function initBoard() {
    const cv = $("bcanvas"),
      fe = $("bfield");
    if (!cv || !fe) return;
    const b = bd(),
      g = cv.getContext("2d"),
      dpr = Math.min(window.devicePixelRatio || 1, 2);
    let cur = null;
    /* En horizontal el campo se dibuja girado: las posiciones se guardan siempre
       como en vertical y aquí se pasan a pantalla (S) y de pantalla (L). */
    const land = boardLand(),
      S = land ? (q) => [q[1], 1 - q[0]] : null,
      L = (p) => (land ? [1 - p[1], p[0]] : p);
    const here = (it) => it.p[b.step];
    const redraw = (pos) => {
      g.clearRect(0, 0, cv.width, cv.height);
      if (!b.strokes.length && !b.items.length && !(b.clean && esPro())) {
        g.save();
        g.fillStyle = "rgba(241,247,234,.42)";
        g.font = `800 ${Math.round(Math.min(cv.width, cv.height) * 0.085)}px "Barlow Condensed","Arial Narrow",Impact,sans-serif`;
        g.textAlign = "center";
        g.fillText("DIBUJA AQUÍ", cv.width / 2, cv.height * (land ? 0.3 : 0.2));
        g.restore();
      }
      paintStrokes(
        g,
        b.strokes,
        0,
        0,
        cv.width,
        cv.height,
        Math.max(3, Math.min(cv.width, cv.height) * 0.0085),
        S,
      );
      paintScene(g, b, 0, 0, cv.width, cv.height, pos || here, !pos, S);
    };
    boardRedraw = redraw;
    const size = () => {
      let r = fe.getBoundingClientRect(),
        w = Math.max(1, Math.round(r.width * dpr)),
        h = Math.max(1, Math.round(r.height * dpr));
      if (cv.width !== w || cv.height !== h) {
        cv.width = w;
        cv.height = h;
      }
      if (!boardAnim) redraw();
    };
    if (boardRO) boardRO.disconnect();
    if (window.ResizeObserver) {
      boardRO = new ResizeObserver(size);
      boardRO.observe(fe);
    }
    size();
    const pt = (e) => {
      let r = cv.getBoundingClientRect();
      return L([
        Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
        Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
      ]);
    };
    /* Tamaño en píxeles de una unidad de campo a lo ancho (width) y a lo largo (height). */
    const box = () => {
      let r = cv.getBoundingClientRect();
      return land ? { width: r.height, height: r.width } : r;
    };
    const hitItem = (p) => {
      let r = box(),
        u = tokU(r.width, state.mode),
        L = byOrd(b.items).reverse();
      return L.find(
        (it) =>
          Math.hypot(
            (here(it)[0] - p[0]) * r.width,
            (here(it)[1] - p[1]) * r.height,
          ) <
          Math.max(HIT[it.k] * u, 16),
      );
    };
    const erase = (p) => {
      let r = box(),
        px = p[0] * r.width,
        py = p[1] * r.height,
        before = snap(b),
        it = hitItem(p),
        n = b.strokes.length;
      if (it) b.items = b.items.filter((x) => x !== it);
      else
        b.strokes = b.strokes.filter(
          (s) =>
            !s.p.some(
              (q) => Math.hypot(q[0] * r.width - px, q[1] * r.height - py) < 24,
            ),
        );
      if (it || b.strokes.length !== n) {
        b.hist.push(before);
        if (b.hist.length > 60) b.hist.shift();
        redraw();
      }
    };
    cv.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      if (boardAnim) return;
      if (state.boardMenu) {
        state.boardMenu = false;
        render();
        return;
      }
      try {
        cv.setPointerCapture(e.pointerId);
      } catch (x) {}
      let p = pt(e);
      if (b.tool === "erase") {
        cur = { erase: 1 };
        erase(p);
        return;
      }
      let it = hitItem(p);
      if (it) {
        cur = {
          drag: it,
          off: [here(it)[0] - p[0], here(it)[1] - p[1]],
          start: p,
          before: snap(b),
          moved: false,
        };
        return;
      }
      if (state.boardPick) {
        state.boardPick = null;
        render();
        return;
      }
      /* Con «Mover» tocar el campo nunca pinta: solo se arrastran fichas. */
      if (b.tool === "move") return;
      pushHist(b);
      cur = { c: b.color, t: b.tool, p: [p] };
      b.strokes.push(cur);
      redraw();
    });
    cv.addEventListener("pointermove", (e) => {
      if (!cur) return;
      if (cur.drag) {
        let p = pt(e),
          r = box();
        if (
          !cur.moved &&
          Math.hypot(
            (p[0] - cur.start[0]) * r.width,
            (p[1] - cur.start[1]) * r.height,
          ) < 5
        )
          return;
        cur.moved = true;
        cur.drag.p[b.step] = [
          Math.round(Math.min(1, Math.max(0, p[0] + cur.off[0])) * 10000) /
            10000,
          Math.round(Math.min(1, Math.max(0, p[1] + cur.off[1])) * 10000) /
            10000,
        ];
        redraw();
        return;
      }
      let list = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
      if (!list.length) list = [e];
      list.forEach((ev) => {
        let p = pt(ev);
        if (cur.erase) {
          erase(p);
          return;
        }
        let l = cur.p[cur.p.length - 1],
          r = box();
        if (Math.hypot((p[0] - l[0]) * r.width, (p[1] - l[1]) * r.height) > 2)
          cur.p.push([
            Math.round(p[0] * 10000) / 10000,
            Math.round(p[1] * 10000) / 10000,
          ]);
      });
      if (!cur.erase) redraw();
    });
    const end = () => {
      if (!cur) return;
      if (cur.drag) {
        /* Tocar una valla o una portería sin moverla la gira 45°. */
        if (!cur.moved && (cur.drag.k === "hurdle" || cur.drag.k === "goal"))
          cur.drag.r = (cur.drag.r + 45) % 360;
        if (cur.moved || cur.drag.k === "hurdle" || cur.drag.k === "goal") {
          b.hist.push(cur.before);
          if (b.hist.length > 60) b.hist.shift();
        }
        /* Tocar un jugador sin moverlo abre (o cierra) su color. */
        if (!cur.moved && (cur.drag.k === "own" || cur.drag.k === "riv")) {
          let id = cur.drag.id;
          cur = null;
          saveBoard();
          state.boardPick = state.boardPick === id ? null : id;
          boardPickH = false;
          render();
          return;
        }
        redraw();
      }
      cur = null;
      saveBoard();
    };
    cv.addEventListener("pointerup", end);
    cv.addEventListener("pointercancel", end);
    cv.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  /* Imagen de la pizarra (fondo del campo sin fichas de alineación + escena encima). */
  async function boardBase(b, pos, trails) {
    let o = {
      modalidad: state.mode,
      fecha: new Date().toISOString().slice(0, 10),
      rival: "",
      players: [],
      alineacion: { formation: Object.keys(formations[state.mode])[0], slots: {} },
      pizarra: true,
      limpia: !!b.clean && esPro(),
      paint: pos
        ? (g, x, y, w, h) => {
            paintStrokes(g, b.strokes, x, y, w, h, 10);
            paintScene(g, b, x, y, w, h, pos, trails);
          }
        : null,
    };
    try {
      await Promise.all([
        document.fonts.load('800 40px "Barlow Condensed"'),
        document.fonts.load('700 30px "Barlow Condensed"'),
        document.fonts.load('600 30px "Barlow Condensed"'),
      ]);
    } catch (e) {}
    return { cv: await drawLineup(o), o };
  }
  async function shareOrSave(blob, fname, title, done) {
    let file = new File([blob], fname, { type: blob.type });
    if (
      navigator.canShare &&
      navigator.canShare({ files: [file] }) &&
      window.matchMedia("(pointer:coarse)").matches
    ) {
      try {
        await navigator.share({ files: [file], title });
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return;
      }
    }
    let a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    note(done, true);
  }
  async function boardExport() {
    let b = bd();
    if (!b.strokes.length && !b.items.length) {
      note("Dibuja algo en la pizarra antes de descargar la imagen.");
      return;
    }
    note("Preparando imagen…", true);
    let { cv, o } = await boardBase(b, (it) => it.p[b.step], true),
      blob = await new Promise((r) => cv.toBlob(r, "image/png"));
    note("");
    await shareOrSave(
      blob,
      `pizarra-${MFN(o.modalidad)}-${o.fecha}.png`,
      "Pizarra",
      "Imagen descargada.",
    );
  }
  /* Vídeo de la jugada: se dibuja cada fotograma en un lienzo y se graba con MediaRecorder. */
  let boardRec = false;
  async function boardVideo() {
    let b = bd();
    if (b.steps < 2 || !b.items.length) {
      note("Para el vídeo, pon fichas en el campo y añade al menos un paso más moviéndolas.");
      return;
    }
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
      note("Tu navegador no permite crear vídeos. Prueba con Chrome.");
      return;
    }
    if (boardRec) return;
    boardRec = true;
    note("Creando el vídeo de la jugada…", true);
    try {
      let { cv: base, o } = await boardBase(b, null),
        W = 720,
        H = Math.round((base.height * W) / base.width / 2) * 2,
        cv = document.createElement("canvas"),
        g = cv.getContext("2d"),
        sc = W / base.width,
        F = { x: 90 * sc, y: 300 * sc, w: 900 * sc, h: 1085 * sc },
        types = [
          "video/mp4;codecs=avc1",
          "video/mp4",
          "video/webm;codecs=vp9",
          "video/webm",
        ],
        type = types.find((t) => MediaRecorder.isTypeSupported(t)) || "";
      cv.width = W;
      cv.height = H;
      const frame = (pos) => {
        g.drawImage(base, 0, 0, W, H);
        g.save();
        rr(g, F.x, F.y, F.w, F.h, 36 * sc);
        g.clip();
        paintStrokes(g, b.strokes, F.x, F.y, F.w, F.h, 10 * sc);
        paintScene(g, b, F.x, F.y, F.w, F.h, pos, false);
        g.restore();
      };
      frame((it) => it.p[0]);
      let st = cv.captureStream(30),
        rec = new MediaRecorder(st, type ? { mimeType: type, videoBitsPerSecond: 3e6 } : {}),
        parts = [];
      rec.ondataavailable = (e) => e.data && e.data.size && parts.push(e.data);
      let stopped = new Promise((r) => (rec.onstop = r));
      rec.start(250);
      const HOLD = 700,
        tot = HOLD + animTotal(b) + 1000,
        t0 = performance.now();
      await new Promise((res) => {
        const tick = () => {
          let t = performance.now() - t0;
          frame(t < HOLD ? (it) => it.p[0] : animPos(b, t - HOLD));
          if (t >= tot) return res();
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      rec.stop();
      await stopped;
      st.getTracks().forEach((x) => x.stop());
      let mt = (rec.mimeType || type || "video/webm").split(";")[0],
        blob = new Blob(parts, { type: mt });
      note("");
      await shareOrSave(
        blob,
        `jugada-${MFN(o.modalidad)}-${o.fecha}.${mt.includes("mp4") ? "mp4" : "webm"}`,
        "Jugada",
        "Vídeo descargado.",
      );
    } finally {
      boardRec = false;
    }
  }
  $("view").addEventListener("click", (e) => {
    let t = e.target.closest("[data-b]");
    if (!t || state.tab !== "pizarra") return;
    let b = bd(),
      k = t.dataset.b;
    if (boardAnim && k !== "play" && k !== "present" && k !== "est" && k !== "jg" && k !== "jgsave") return;
    if (k !== "add" && k !== "addp") state.boardMenu = false;
    if (k === "est") {
      estOpen();
    } else if (k === "estx") {
      b.est = "";
      saveBoard();
      render();
    } else if (k === "clean") {
      if (!b.clean && !esPro()) return proLimite("La <b>pizarra limpia</b> (campo liso, sin rayas ni escudo) es del plan Pro.");
      b.clean = !b.clean;
      saveBoard();
      render();
      note(b.clean ? "Pizarra limpia: campo liso, sin rayas ni escudo." : "Pizarra normal.", true);
    } else if (k === "vids") {
      vjAbre();
    } else if (k === "jg") {
      jgAbre();
    } else if (k === "jgsave") {
      jgGuarda().catch((x) => note(x.message || String(x)));
    } else if (k === "tool") {
      b.tool = t.dataset.v;
      saveBoard();
      render();
    } else if (k === "color") {
      b.color = t.dataset.v;
      if (b.tool === "erase" || b.tool === "move") b.tool = "pen";
      saveBoard();
      render();
    } else if (k === "undo") {
      if (b.hist.length) {
        restoreHist(b, b.hist.pop());
        saveBoard();
        render();
      }
    } else if (k === "clear") {
      if (b.strokes.length || b.items.length || b.steps > 1) {
        pushHist(b);
        b.strokes = [];
        b.items = [];
        b.steps = 1;
        b.step = 0;
        b.est = "";
        b.f = "";
        saveBoard();
        render();
      }
    } else if (k === "add") {
      if (t.dataset.v === "own") state.boardMenu = !state.boardMenu;
      else {
        state.boardMenu = false;
        addItem(t.dataset.v);
      }
      render();
    } else if (k === "addp") {
      state.boardMenu = false;
      addItem("own", t.dataset.v);
      render();
    } else if (k === "prev" || k === "next") {
      b.step = Math.min(b.steps - 1, Math.max(0, b.step + (k === "next" ? 1 : -1)));
      saveBoard();
      render();
    } else if (k === "addstep") {
      if (!esPro() && b.steps >= LIM.pasos)
        return proLimite(`En el plan gratuito una jugada puede tener <b>${LIM.pasos} pasos</b>. Con el plan Pro, todos los que quieras.`);
      if (b.steps >= PASOS_MAX) {
        note(`Una jugada puede tener como mucho ${PASOS_MAX} pasos.`);
        return;
      }
      pushHist(b);
      b.items.forEach((it) => it.p.splice(b.step + 1, 0, it.p[b.step].slice()));
      b.steps++;
      b.step++;
      saveBoard();
      render();
      note(`Paso ${b.step + 1}: arrastra las fichas a donde se mueven.`, true);
    } else if (k === "delstep") {
      if (b.steps < 2) return;
      pushHist(b);
      b.items.forEach((it) => it.p.splice(b.step, 1));
      b.steps--;
      b.step = Math.min(b.step, b.steps - 1);
      saveBoard();
      render();
    } else if (k === "play") {
      if (boardAnim) stopAnim(true);
      else playAnim();
    } else if (k === "video")
      boardVideo().catch((x) => {
        boardRec = false;
        note("No se pudo crear el vídeo: " + x.message);
      });
    else if (k === "img")
      boardExport().catch((x) =>
        note("No se pudo crear la imagen: " + x.message),
      );
    else if (k === "present") {
      state.present = !state.present;
      state.autoPres = false;
      if (!state.present && boardPhoneLand()) state.presentOff = true;
      render();
    }
  });
  $("view").addEventListener("change", (e) => {
    if (e.target.id === "boardBg" && e.target.value) {
      stopAnim();
      loadLineup(e.target.value);
      render();
      note("Titulares puestos en el campo. Arrástralos para moverlos.", true);
    }
  });
  /* Selector de color de las fichas (pizarra «bd» y alineación «al»). */
  let boardPickH = false;
  function setPickColor(ctx, c, all, done) {
    if (ctx === "bd") {
      let b = bd(),
        it = b.items.find((i) => i.id === state.boardPick);
      if (!it) return;
      if (!boardPickH) {
        pushHist(b);
        boardPickH = true;
      }
      if (all) {
        b.items.forEach((i) => {
          if (i.k === it.k) i.c = c;
        });
        b.tcol = { ...(b.tcol || {}), [it.k]: c };
      } else it.c = c;
      if (boardRedraw) boardRedraw();
      if (done) {
        saveBoard();
        render();
      }
    } else if (ctx === "al" && state.draft && state.selectedSlot !== null) {
      let al = state.draft.alineacion,
        pid = al.slots[state.selectedSlot];
      if (!pid) return;
      al.colors = al.colors || {};
      if (all) {
        al.color = c;
        al.colors = {};
      } else if (c) al.colors[pid] = c;
      else delete al.colors[pid];
      let bt = document.querySelector(`button[data-slot="${state.selectedSlot}"]`),
        pc = slotCol(al, pid, gkOf(al, state.draft.players.map((x) => x.id)));
      if (bt && pc) {
        bt.style.setProperty("--pc", pc);
        bt.style.setProperty("--pi", inkOn(pc));
      }
      if (done) render();
    }
  }
  const pickHex = (k) => {
    let h = +k.querySelector(".cpk-h").value,
      l = +k.querySelector(".cpk-l").value;
    return hslHex(h, 85, l);
  };
  document.addEventListener("input", (e) => {
    let k = e.target.dataset && e.target.dataset.pch && e.target.closest(".cpk");
    if (!k) return;
    let c = pickHex(k);
    k.style.setProperty("--cpk", c);
    k.querySelector(".cpk-l").style.setProperty("--h", k.querySelector(".cpk-h").value);
    setPickColor(k.dataset.for, c, false, false);
  });
  document.addEventListener("change", (e) => {
    let k = e.target.dataset && e.target.dataset.pch && e.target.closest(".cpk");
    if (k) setPickColor(k.dataset.for, pickHex(k), false, true);
  });
  document.addEventListener("click", (e) => {
    let x = e.target.closest("[data-pcx]");
    if (x) {
      state.boardPick = null;
      render();
      return;
    }
    let t = e.target.closest("[data-pc],[data-pca]"),
      k = t && t.closest(".cpk");
    if (!k) return;
    let all = t.dataset.pca !== undefined,
      c = all ? k.style.getPropertyValue("--cpk").trim() : t.dataset.pc;
    if (all && !isHex(c)) c = pickHex(k);
    if (!c && k.dataset.for === "bd") {
      setPickColor("bd", "", false, true);
      return;
    }
    setPickColor(k.dataset.for, c, all, true);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.boardPick) {
      state.boardPick = null;
      render();
    } else if (e.key === "Escape" && state.boardMenu) {
      state.boardMenu = false;
      render();
    } else if (e.key === "Escape" && state.present) {
      state.present = state.autoPres = false;
      if (boardPhoneLand()) state.presentOff = true;
      render();
    }
  });

  /* ===== Que no se cierre la sesión sola (por ejemplo, en mitad de un partido) =====
     Cada hora la app renueva el pase de la cuenta. Si en ese momento no hay cobertura
     (campo de fútbol, el móvil estaba en el bolsillo o grabando), Supabase a veces da la
     sesión por perdida y la app enseñaba la pantalla de «Entrar». Ahora solo se sale
     cuando el entrenador pulsa «Cerrar sesión» (o el servidor dice que la sesión ya no vale):
     si es por falta de conexión, la app sigue abierta con sus datos y lo reintenta sola. */
  const SES_KEY = "mf_sesion_copia";
  let saliendo = false,
    appCargada = false,
    sesPerdida = false,
    sesTimer = null,
    sesEspera = 3000;
  const sesCopia = () => {
    try {
      let j = JSON.parse(localStorage.getItem(SES_KEY) || "null");
      return j && j.rt && j.uid ? j : null;
    } catch (e) {
      return null;
    }
  };
  function sesGuarda(s) {
    try {
      if (s && s.refresh_token && s.user)
        localStorage.setItem(SES_KEY, JSON.stringify({ rt: s.refresh_token, uid: s.user.id }));
      else localStorage.removeItem(SES_KEY);
    } catch (e) {}
  }
  /* El pase que tenga guardado Supabase (puede ser más nuevo que la copia) */
  function sesTokenActual() {
    try {
      for (let k of Object.keys(localStorage))
        if (/^sb-.*-auth-token$/.test(k)) {
          let j = JSON.parse(localStorage.getItem(k) || "null");
          if (j && j.refresh_token) return j.refresh_token;
        }
    } catch (e) {}
    let c = sesCopia();
    return c ? c.rt : "";
  }
  /* true = el servidor dice que la sesión ya no vale (no es un problema de conexión) */
  const sesDefinitivo = (e) =>
    !!e &&
    (["refresh_token_not_found", "refresh_token_already_used", "session_expired", "session_not_found", "user_not_found", "user_banned"].includes(e.code) ||
      (e.status >= 400 && e.status < 500 && e.name !== "AuthRetryableFetchError"));
  function sesAviso(on) {
    let d = $("sesAviso");
    if (!on) return d && d.remove();
    if (!d) {
      d = document.createElement("div");
      d.id = "sesAviso";
      d.setAttribute("role", "status");
      d.innerHTML =
        '<span><b>Sin conexión con tu cuenta</b><small>Tranquilo: no se ha cerrado la sesión y lo que apuntes se queda en este móvil. Se vuelve a conectar sola en cuanto haya cobertura.</small></span><button type="button" class="secondary small" data-ses="ya">Reintentar</button>';
      document.body.appendChild(d);
    }
  }
  async function sesRecupera() {
    clearTimeout(sesTimer);
    sesTimer = null;
    if (!sesPerdida) return;
    let rt = sesTokenActual(),
      r;
    if (!rt) return sesFin();
    try {
      r = await db.auth.refreshSession({ refresh_token: rt });
    } catch (e) {
      r = { error: e };
    }
    if (r && r.data && r.data.session) return; /* onAuthStateChange se encarga del resto */
    if (r && sesDefinitivo(r.error)) return sesFin(true);
    sesEspera = Math.min(30000, sesEspera * 2);
    sesTimer = setTimeout(sesRecupera, sesEspera);
  }
  /* Ahora sí: se sale de verdad y se enseña la pantalla de entrar */
  function sesFin(caducada) {
    sesPerdida = false;
    clearTimeout(sesTimer);
    sesAviso(false);
    sesGuarda(null);
    salirDeVerdad();
    if (caducada) loginNote("Tu sesión ha caducado. Vuelve a entrar con tu email y contraseña.");
  }
  function sesSinConexion() {
    if (!sesPerdida) {
      sesPerdida = true;
      sesEspera = 3000;
    }
    /* Si la app aún no estaba abierta (se abrió sin cobertura) se enseña igual, sin cargar nada */
    $("login").classList.add("hidden");
    $("app").classList.remove("hidden");
    sesAviso(true);
    if (!sesTimer) sesTimer = setTimeout(sesRecupera, 1500);
  }
  window.addEventListener("online", () => sesPerdida && sesRecupera());
  document.addEventListener("visibilitychange", () => {
    if (sesPerdida && document.visibilityState === "visible") sesRecupera();
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest && e.target.closest('[data-ses="ya"]')) {
      sesEspera = 3000;
      sesRecupera();
    }
  });
  function salirDeVerdad() {
    salirVer();
    curUser = null;
    appCargada = false;
    liveRows = {};
    Object.assign(state, {
      players: [],
      matches: [],
      draft: null,
      editing: null,
      live: null,
      tab: "plantilla",
    });
    $("info").classList.add("hidden");
    $("login").classList.remove("hidden");
    $("app").classList.add("hidden");
    if (amode === "newpass" && !recovering) setAm("login");
  }
  db.auth.onAuthStateChange((event, session) => {
    if (PUB || EQ || PF || AN) return;
    if (event === "PASSWORD_RECOVERY") recovering = true;
    if (session) sesGuarda(session);
    if (session && recovering) {
      $("login").classList.remove("hidden");
      $("app").classList.add("hidden");
      if (amode !== "newpass") setAm("newpass");
      return;
    }
    if (session) {
      let volvio = sesPerdida;
      sesPerdida = false;
      clearTimeout(sesTimer);
      sesTimer = null;
      sesAviso(false);
      let first =
        curUser !== session.user.id || !appCargada || (!volvio && $("app").classList.contains("hidden"));
      useUser(session.user);
      /* No esperar aquí: dentro de este aviso Supabase mantiene un bloqueo y cualquier consulta quedaría colgada */
      if (first) setTimeout(enterApp, 0);
      else if (volvio)
        setTimeout(() => {
          /* Vuelve la conexión: se guarda lo que se apuntó sin cobertura en el directo */
          let x = state.live && liveRows[state.live];
          if (x) liveSave(x, () => liveMatch(x, null, 0));
        }, 0);
    } else {
      let copia = sesCopia();
      if (!saliendo && copia && (!curUser || curUser === copia.uid)) {
        if (!curUser) curUser = copia.uid;
        sesSinConexion();
      } else {
        sesPerdida = false;
        sesAviso(false);
        sesGuarda(null);
        salirDeVerdad();
      }
    }
  });
  const APP_VERSION =
    (document.querySelector('meta[name="app-version"]') || {}).content || "0";
  let lastCheck = 0;
  function showUpdate(v, notas) {
    if ($("upd")) return;
    let d = document.createElement("div");
    d.id = "upd";
    d.setAttribute("role", "status");
    let sp = document.createElement("span");
    let t = document.createElement("b");
    t.textContent = "Hay una versión nueva de Mi Fútbol JV32.";
    sp.appendChild(t);
    if (notas) {
      let n = document.createElement("small");
      n.textContent = notas;
      sp.appendChild(n);
    }
    let bt = document.createElement("button");
    bt.type = "button";
    bt.textContent = "Actualizar";
    bt.onclick = async () => {
      if (!leaveDraft()) return;
      bt.disabled = true;
      bt.textContent = "Actualizando…";
      /* Borra las copias guardadas para que se descargue todo de nuevo */
      try {
        const ks = await caches.keys();
        await Promise.all(ks.map((k) => caches.delete(k)));
      } catch (e) {}
      try {
        const rs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(rs.map((r) => r.update().catch(() => {})));
      } catch (e) {}
      location.replace(location.pathname + "?v=" + encodeURIComponent(v));
    };
    d.append(sp, bt);
    document.body.appendChild(d);
  }
  async function checkUpdate(force) {
    try {
      if (!force && Date.now() - lastCheck < 300000) return;
      lastCheck = Date.now();
      let r = await fetch("version.json?_=" + Date.now(), {
        cache: "no-store",
      });
      if (!r.ok) return;
      let j = await r.json();
      if (j && j.version && j.version !== APP_VERSION)
        showUpdate(j.version, j.notas);
    } catch (e) {}
  }
  /* Al abrir la app ya actualizada (sin pasar por el botón «Actualizar») se enseña
     un momento «Actualizando…» para que se note que hay versión nueva.
     Quien la abre por primera vez no lo ve. */
  const VER_KEY = "mf_version_abierta";
  function actualizaRevisa() {
    let antes;
    try {
      antes =
        localStorage.getItem(VER_KEY) ||
        localStorage.getItem("mf_novedades_visto");
      localStorage.setItem(VER_KEY, APP_VERSION);
    } catch (e) {
      return;
    }
    if (!antes || antes === APP_VERSION) return;
    if (navigator.webdriver && !window.__probarActualiza) return;
    let d = document.createElement("div");
    d.id = "actu";
    d.setAttribute("role", "status");
    d.innerHTML = `<div class="actu-box"><b>Actualizando Mi Fútbol JV32…</b><div class="actu-bar"><i></i></div><small>Versión ${esc(antes)} → ${esc(APP_VERSION)}</small></div>`;
    document.body.appendChild(d);
    setTimeout(() => {
      d.querySelector("b").textContent = "¡App actualizada!";
      d.querySelector("small").textContent =
        "Ya tienes la versión " + APP_VERSION + ". Sigo mejorando la app cada semana.";
      d.classList.add("ok");
    }, 1800);
    setTimeout(() => {
      d.classList.add("fuera");
      setTimeout(() => d.remove(), 400);
    }, 3600);
    d.addEventListener("click", () => d.remove());
  }
  actualizaRevisa();
  setTimeout(() => checkUpdate(true), 2500);
  setInterval(() => checkUpdate(false), 600000);
  window.addEventListener("focus", () => checkUpdate(false));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkUpdate(false);
  });
  db.auth.getSession();
  if (
    ("serviceWorker" in navigator && location.protocol === "https:") ||
    ("serviceWorker" in navigator && location.hostname === "localhost")
  ) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
})();
