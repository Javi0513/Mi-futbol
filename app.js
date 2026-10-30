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
    hand: '<path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-6-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
    maximize:
      '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  };
  const ic = (n, s = 20) =>
    `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]}</svg>`;
  const empty = (i, t, s) =>
    `<div class="blank">${ic(i, 34)}<b>${t}</b><span>${s}</span></div>`;
  const mini = (t) =>
    `<div class="mini" aria-label="${t.games} partidos, ${t.minutes} minutos, ${t.goals} goles, ${t.starts} titularidades${t.amarillas ? ", " + t.amarillas + " amarillas" : ""}${t.rojas ? ", " + t.rojas + " rojas" : ""}"><span><b>${t.games}</b>partidos</span><span><b>${t.minutes}</b>min</span><span><b>${t.goals}</b>goles</span><span><b>${t.starts}</b>titular</span>${t.cap ? `<span><b>${t.cap}</b>capitán</span>` : ""}${t.amarillas ? `<span class="tjm"><i class="tj a"></i><b>${t.amarillas}</b></span>` : ""}${t.rojas ? `<span class="tjm"><i class="tj r"></i><b>${t.rojas}</b></span>` : ""}</div>`;
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
    let [{ data: ps, error: pe }, { data: ms, error: me }, tr, en] = await Promise.all([
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
    ]);
    if (pe || me) throw pe || me;
    state.teamsOk = !tr.error;
    state.teams = tr.data || [];
    state.trOk = !en.error;
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
          mdList(m.alineacion, "tarjetas").forEach((t) => {
            if (t.pid === pid) r[t.c === "r" ? "rojas" : "amarillas"]++;
          });
          if (m.alineacion && m.alineacion.capitan === pid) r.cap++;
        }
        return r;
      },
      { games: 0, starts: 0, minutes: 0, goals: 0, amarillas: 0, rojas: 0, cap: 0 },
    );
  }
  function render() {
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
    return `<div class="team-chips" role="group" aria-label="Equipos de ${esc(MN())}">${chips}</div><button type="button" class="ib" data-teamact="rename" aria-label="Cambiar el nombre del equipo" title="Cambiar nombre">${ic("pencil", 18)}</button>${L.length > 1 ? `<button type="button" class="ib d" data-teamact="del" aria-label="Borrar este equipo" title="Borrar equipo">${ic("trash", 18)}</button>` : ""}<button type="button" class="ib add" data-teamact="add" aria-label="Añadir otro equipo" title="Añadir equipo">${ic("plus", 18)}<span>Equipo</span></button>${catSel()}`;
  }
  /* Categoría del equipo: marca cuánto dura cada parte (para el Directo y los minutos) */
  const CATS = [
    ["prebenjamin", "Prebenjamín", 25],
    ["benjamin", "Benjamín", 30],
    ["alevin", "Alevín", 35],
    ["infantil", "Infantil", 40],
    ["cadete", "Cadete", 45],
    ["juvenil", "Juvenil", 45],
    ["senior", "Senior / Aficionado", 45],
  ];
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
      return c ? c[2] : LIVE_PARTE[k] || 30;
    };
  function catSel() {
    let c = catOf(state.mode, curTeam());
    return `<label class="tcat"><span>Categoría</span><select id="teamCat" aria-label="Categoría del equipo"><option value="">Sin categoría (${LIVE_PARTE[state.mode] || 30}' por parte)</option>${CATS.map((z) => `<option value="${z[0]}" ${c && c[0] === z[0] ? "selected" : ""}>${z[1]} · 2 × ${z[2]}'</option>`).join("")}</select></label>`;
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
      (c ? `Categoría ${c[1]}: partes de ${c[2]} minutos.` : `Sin categoría: partes de ${LIVE_PARTE[state.mode] || 30} minutos.`) +
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
    return `<section class="panel"><div class="bar"><div><div class="kicker">Partidos</div><h2>${MN()}</h2><p class="muted">${plan === "pro" ? "" : games().length + " / " + MODES[state.mode].maxM + " partidos · "}Convocatoria, titulares, posiciones y goles.</p></div><button class="primary" data-action="add-match">${ic("plus")}Partido</button></div>${
      g.length
        ? g
            .map((m) => {
              let e = entries(m),
                a = m.alineacion || {};
              return `<div class="row mrow" data-mid="${m.id}">${dtile(m.fecha)}<div class="info"><strong>${esc(m.rival)}</strong><small>${liveChip(m.id)}${resChip(a)}${esc(a.formation || "Sin formación")} · ${e.length} convocados · ${e.reduce((s, x) => s + (Number(x.minutes) || 0), 0)} min · ${e.reduce((s, x) => s + (Number(x.goals) || 0), 0)} goles</small><small class="cl">Inicial: ${
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
    return `<section class="panel"><h2 class="h2s">Jugadores</h2><p class="muted">Ordenados por goles y minutos · ${MN()}</p><div style="height:6px"></div>${r.length ? r.map((x, i) => `<div class="row"><div class="rank">${i + 1}</div>${avatar(x.p)}<div class="info"><strong>${esc(x.p.nombre)}</strong>${mini(x.t)}</div><div class="big"><b>${x.t.goals}</b><small>goles</small></div></div>`).join("") : empty("chart", "Aún no hay datos.", "Añade jugadores y partidos para ver el resumen.")}</section>`;
  }
  /* ===== Control de entrenamientos (opcional: se activa en Mi cuenta) =====
     Un calendario por equipo; en cada entrenamiento se marca quién vino, quién faltó
     y quién tuvo falta justificada. Asistencia: {id del jugador: "si" | "no" | "jus"}. */
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
      let r = { si: 0, no: 0, jus: 0 },
        ids = new Set(roster().map((p) => p.id));
      Object.entries(t.asistencia || {}).forEach(([id, v]) => {
        if (ids.has(id) && r[v] !== undefined) r[v]++;
      });
      return r;
    },
    pct = (r) => {
      let n = r.si + r.no + r.jus;
      return n ? Math.round((r.si * 100) / n) : null;
    };
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
            a.no += c.no;
            a.jus += c.jus;
            return a;
          },
          { si: 0, no: 0, jus: 0 },
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
        ["no", "Faltó", "x"],
        ["jus", "Justificada", ""],
      ];
    return `<div class="trs" data-tid="${t.id}"><div class="formgrid"><label>Hora<input type="time" data-trf="hora" data-id="${t.id}" value="${esc(t.hora || "")}"></label><label>Nota<input data-trf="nota" data-id="${t.id}" maxlength="300" placeholder="Ej.: táctica, físico…" value="${esc(t.nota || "")}" autocomplete="off"></label></div><p class="muted trsum"><b class="w">${c.si}</b> vinieron · <b class="l">${c.no}</b> faltaron · <b class="d">${c.jus}</b> justificadas${r.length - c.si - c.no - c.jus > 0 ? ` · ${r.length - c.si - c.no - c.jus} sin marcar` : ""}</p>${
      r.length
        ? `<div class="btools"><button type="button" class="secondary small" data-tr="all" data-id="${t.id}">${ic("check", 18)}Todos vinieron</button><button type="button" class="secondary small" data-action="add-player">${ic("plus", 18)}Añadir jugador</button></div>${r
            .map(
              (p) =>
                `<div class="row trow">${avatar(p)}<div class="info"><strong>${esc(p.nombre)}</strong></div><div class="asis" role="group" aria-label="Asistencia de ${esc(p.nombre)}">${B.map(
                  (b) =>
                    `<button type="button" class="${b[0]}${a[p.id] === b[0] ? " on" : ""}" data-tr="mark" data-id="${t.id}" data-pid="${p.id}" data-v="${b[0]}" aria-pressed="${a[p.id] === b[0]}" aria-label="${b[1]}" title="${b[1]}">${b[2] ? ic(b[2], 18) : "J"}</button>`,
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
          let x = { si: 0, no: 0, jus: 0 };
          T.forEach((t) => {
            let v = (t.asistencia || {})[p.id];
            if (x[v] !== undefined) x[v]++;
          });
          return { p, x, pc: pct(x) };
        })
        .sort(
          (a, b) =>
            (b.pc ?? -1) - (a.pc ?? -1) ||
            b.x.si - a.x.si ||
            a.p.nombre.localeCompare(b.p.nombre, "es"),
        );
    return `<section class="panel"><h2 class="h2s">Asistencia por jugador</h2><p class="muted">${T.length} ${T.length === 1 ? "entrenamiento" : "entrenamientos"} · ${esc(teamName())}</p><div style="height:6px"></div>${
      r.length
        ? r
            .map(
              (o) =>
                `<div class="row">${avatar(o.p)}<div class="info"><strong>${esc(o.p.nombre)}</strong><small>${o.x.si} vino · ${o.x.no} faltó · ${o.x.jus} justificada${o.x.jus === 1 ? "" : "s"}</small><div class="trbar" aria-hidden="true"><i style="width:${o.pc || 0}%"></i></div></div><div class="big"><b>${o.pc === null ? "–" : o.pc + "%"}</b><small>asistencia</small></div></div>`,
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
          a.no += c.no;
          a.jus += c.jus;
          return a;
        },
        { si: 0, no: 0, jus: 0 },
      ),
      tp = pct(tot),
      dayT = T.filter((t) => t.fecha === state.trDay);
    if (!state.trOk)
      return `<section class="panel"><div class="kicker">Entrenamientos</div><h2>${MN()}</h2><p class="muted">El control de entrenamientos aún no está activado en el servidor (falta ejecutar supabase-entrenamientos.sql en Supabase).</p></section>`;
    return `<section class="panel"><div class="bar"><div><div class="kicker">Entrenamientos</div><h2>${MN()}</h2><p class="muted">${plan === "pro" ? "" : state.trainings.filter((t) => t.modalidad === state.mode).length + " / " + MODES[state.mode].maxE + " · "}${T.length} ${T.length === 1 ? "entrenamiento" : "entrenamientos"}${tp === null ? "" : " · " + tp + "% de asistencia"}</p></div><button class="primary" data-tr="new">${ic("plus")}Entreno</button></div>${trCalendar()}</section><section class="panel"><div class="bar"><div><div class="kicker">${esc(trDayLabel(state.trDay))}</div><h2 class="h2s">${dayT.length ? (dayT.length > 1 ? dayT.length + " entrenamientos" : "Pasar lista") : "Sin entrenamiento"}</h2></div>${dayT.length ? `<button type="button" class="secondary small" data-tr="new">${ic("plus", 18)}Otro</button>` : ""}</div>${viendo ? "" : `<div class="btools"><button type="button" class="secondary small" data-tr="rec">${ic("live", 18)}Grabar el entreno</button></div>`}${
      dayT.length
        ? dayT.map(trSession).join("")
        : `<p class="muted">Este día no hay entrenamiento.</p><div class="stack"><button type="button" class="primary" data-tr="new">${ic("plus")}Crear entrenamiento este día</button></div>`
    }</section>${trPlayers()}`;
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
    return `<section class="panel"><div class="bar"><div><div class="kicker">${viendo ? "Partido (solo lectura)" : state.editing ? "Editar partido" : "Nuevo partido"}</div><h2>${MN()}</h2><p class="muted">${d.players.length}${MODES[state.mode].cap ? " / " + MODES[state.mode].cap : ""} convocados · ${start.length}/${modeCount()} titulares</p></div><button class="secondary small" data-action="cancel">${ic("back", 18)}Volver</button></div><div class="formgrid"><label>Fecha<input id="date" type="date" value="${esc(d.fecha)}"></label><label>Rival<input id="rival" value="${esc(d.rival)}" maxlength="100" autocomplete="off"></label></div><div class="score"><label>Goles a favor<input id="gf" type="number" min="0" max="99" inputmode="numeric" placeholder="–" value="${esc(d.gf)}"></label><span class="dash" aria-hidden="true">–</span><label>Goles en contra<input id="gc" type="number" min="0" max="99" inputmode="numeric" placeholder="–" value="${esc(d.gc)}"></label><p class="hint">Resultado (opcional)</p></div>
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
    return `<div class="mdata"><h3 style="margin-top:18px">Datos del partido</h3><label class="mdparte">Minutos por parte<input id="mdParte" type="number" min="5" max="60" inputmode="numeric" value="${mdParte(d, state.editing)}"></label><div class="formgrid"><label>Capitán<select id="mdCap">${opt(al.capitan || "", "Sin capitán")}</select></label><label>Portero<select id="mdGk">${opt(gk, "—")}</select></label></div><p class="hint">Si no eliges portero, es el que pongas en la portería (POR).</p><h4>Cambios</h4>${cb || '<p class="muted">Sin cambios.</p>'}<div class="hbtns"><button type="button" class="secondary small" data-mdadd="cambios">${ic("plus", 18)}Añadir cambio</button>${cb ? `<button type="button" class="secondary small" data-mdcalc="1">Calcular minutos</button>` : ""}</div><h4>Tarjetas</h4>${tj || '<p class="muted">Sin tarjetas.</p>'}<div class="hbtns"><button type="button" class="secondary small" data-mdadd="tarjetas">${ic("plus", 18)}Añadir tarjeta</button></div><h3 style="margin-top:18px">${rv} (rival)</h3><p class="hint">Del rival se apunta el dorsal y, si quieres, el nombre.</p><h4>Cambios del rival</h4>${cbR || '<p class="muted">Sin cambios.</p>'}<div class="hbtns"><button type="button" class="secondary small" data-mdadd="cambiosR">${ic("plus", 18)}Añadir cambio del rival</button></div><h4>Tarjetas del rival</h4>${tjR || '<p class="muted">Sin tarjetas.</p>'}<div class="hbtns"><button type="button" class="secondary small" data-mdadd="tarjetasR">${ic("plus", 18)}Añadir tarjeta del rival</button></div></div>`;
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
    g.fillStyle = fsal ? "#0f3b57" : "#0e3a24";
    g.fillRect(fx, fy, fw, fh);
    if (fsal) {
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
    g.fillRect(fx, fy, fw, fh);
    if (wm) {
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
  async function enterApp() {
    $("login").classList.add("hidden");
    $("app").classList.remove("hidden");
    try {
      let prueba = await revisarPrueba();
      await loadPlan();
      await loadClub();
      if (prueba === "activada" && pruebaHasta)
        note(`¡Gracias por probar la app! Tienes el plan Pro gratis en modo prueba durante ${diasQuedan(pruebaHasta)} días, hasta el ${fechaLarga(pruebaHasta)}.`, true);
      else if (prueba === "terminada" && plan !== "pro")
        note("Tu prueba del plan Pro ha terminado. Ahora tienes el plan gratuito.");
      await load();
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
    } catch (e) {}
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
        `<p>Última actualización: octubre de 2026.</p><h3>Quién es el responsable</h3><p>${id}. Contacto: ${ct}.</p><h3>Qué datos tratamos</h3><p>Tu email y contraseña (la contraseña se guarda cifrada), y el contenido que introduces: jugadores (nombre y foto opcional), partidos, alineaciones, resultados y estadísticas. Los dibujos de la pizarra se guardan solo en tu dispositivo.</p><h3>Para qué y con qué base</h3><p>Solo para darte el servicio de la app (art. 6.1.b RGPD, ejecución del contrato). No hacemos publicidad, no vendemos datos ni elaboramos perfiles.</p><h3>Con quién se comparten</h3><p>Con nuestros proveedores técnicos: <b>Supabase</b> (base de datos y autenticación, servidores en la Unión Europea), <b>GitHub Pages</b> (alojamiento de la web), <b>Resend</b> (envío de correo) y <b>Stripe</b> (cobro del plan Pro: los datos de la tarjeta los trata Stripe directamente, nosotros nunca los vemos).${c.turnstileSiteKey ? " Y <b>Cloudflare</b> (verificación anti-robots)." : ""} No se ceden datos a otros terceros salvo obligación legal.</p><h3>Lista de avisos del plan Pro</h3><p>Si pulsas «Avísame cuando esté disponible», guardamos tu email en una lista para avisarte una sola vez cuando el plan Pro esté disponible. Puedes pedirnos que te quitemos cuando quieras; se borra también si eliminas tu cuenta.</p><h3>Plan para clubes</h3><p>Si te unes a un club con su código, el encargado del club ve tu email y la fecha en que te uniste, para poder gestionar las plazas. Los demás entrenadores del club no ven nada tuyo. Solo si lo aceptas (al unirte o después, en «Mi cuenta › Plan para clubes»), el <b>supervisor del club</b> (el encargado y las personas del club que él nombre supervisoras) puede <b>ver, sin poder cambiarlos</b>, tus equipos, jugadores, partidos, alineaciones, convocatorias y entrenamientos, mientras el club esté pagado. Nunca ve tu contraseña, tu plan ni tus pagos. Puedes dejar de compartirlos cuando quieras desde el mismo sitio. El encargado puede quitarte del club (pierdes el plan Pro del club, pero conservas tu cuenta y tus datos) y tú puedes salir cuando quieras.</p><h3>Directo de partidos</h3><p>Si activas el directo de un partido, se crea un enlace secreto. Cualquiera que tenga ese enlace puede ver, sin cuenta, los nombres de los dos equipos, el marcador, el minuto, y el nombre y dorsal de quien marca cada gol, de los jugadores que entran y salen en los cambios y de quien recibe una tarjeta en ese partido, también los del rival que apuntes (nada más). Tú decides con quién compartirlo y puedes desactivarlo cuando quieras; también se borra si borras el partido o tu cuenta.</p><h3>Vídeo del partido</h3><p>Si usas la cámara del directo, el vídeo se graba en tu móvil y se guarda solo en tu dispositivo: no lo subimos a ningún sitio. Si además pulsas «Emitir», el vídeo y el sonido se envían en vivo, a través de <b>Cloudflare</b> (que solo los reparte y no los guarda), a quien abra el enlace del directo, mientras emites. No grabamos ni conservamos esa emisión. Si en el vídeo aparecen menores, eres responsable de contar con la autorización de sus tutores antes de grabar o emitir.</p><h3>Cuánto tiempo</h3><p>Mientras mantengas la cuenta. Si la borras desde «Mi cuenta», se eliminan tus datos de forma definitiva.</p><h3>Tus derechos</h3><p>Puedes acceder, rectificar, suprimir, portar, limitar u oponerte al tratamiento. Desde «Mi cuenta» puedes descargar y borrar tus datos tú mismo; también puedes escribirnos. Si no estás conforme, puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).</p><h3>Datos de jugadores y menores</h3><p>La app es para entrenadores y responsables adultos. Si introduces datos de otras personas, y en especial de menores, eres responsable de contar con su autorización (o la de sus tutores). Te recomendamos usar solo el nombre de pila y subir fotos solo con permiso. En relación con esos datos de terceros, tú eres quien decide para qué se usan y nosotros actuamos como encargados del tratamiento: los guardamos solo para prestarte el servicio, no los usamos para ningún otro fin y los borramos cuando borras la cuenta o el dato.</p><h3>Almacenamiento en tu dispositivo</h3><p>Usamos únicamente almacenamiento técnico necesario (sesión y pizarra). No usamos cookies de publicidad ni de analítica.${c.turnstileSiteKey ? " Para evitar registros automáticos, al crear la cuenta o entrar se usa la verificación anti-robots de <b>Cloudflare Turnstile</b>, que puede tratar datos técnicos del navegador." : ""}</p>`,
      ];
    return [
      "Términos de uso",
      `<p>Última actualización: octubre de 2026.</p><h3>Qué es</h3><p>Mi Fútbol JV32 es una aplicación web para gestionar plantillas, alineaciones, partidos, estadísticas y pizarra táctica. Titular del servicio: ${id}.</p><h3>Cuenta</h3><p>Debes ser mayor de edad. Eres responsable de mantener tu contraseña en secreto y de la actividad de tu cuenta.</p><h3>Tu contenido</h3><p>Los datos que introduces son tuyos. Garantizas que tienes derecho a usarlos y que cuentas con la autorización de las personas cuyos datos introduces. No puedes usar la app para fines ilícitos ni subir contenido ofensivo o que vulnere derechos de terceros.</p><h3>Plan gratuito y plan Pro</h3><p>El plan gratuito permite, en cada modalidad, un equipo, hasta 5 partidos y un máximo de jugadores (25 en Fútbol 11, 14 en Fútbol 7 y 16 en Fútbol sala). Para superar esos límites o llevar varios equipos existe el plan Pro, de 39,99 € al año (IVA incluido), con renovación anual. Quien ya lo tenga contratado a un precio anterior lo mantiene mientras no cancele su suscripción. Las suscripciones mensuales contratadas antes se mantienen hasta que se cancelen. Los clubes pueden contratar un plan para clubes: un pack anual según el número de entrenadores, con el que todos los entrenadores que se unan al club con su código tienen el plan Pro mientras el club esté pagado y sigan en el club. El encargado del club es quien lo contrata y gestiona, y puede quitar entrenadores del club. El encargado y los supervisores que él nombre pueden ver, sin modificarlos, los datos de los entrenadores del club que lo hayan aceptado. Solo se contrata y se cobra con tu aceptación expresa y puedes cancelarlo cuando quieras. Podremos modificar planes y precios avisando con antelación; el cambio no se aplicará a una suscripción en curso sin tu consentimiento.</p><h3>Disponibilidad</h3><p>La app se ofrece «tal cual». Hacemos copias razonables, pero te recomendamos descargar tus datos de vez en cuando desde «Mi cuenta». No respondemos de pérdidas indirectas ni de interrupciones ajenas a nuestro control, en los límites que permite la ley.</p><h3>Propiedad</h3><p>El nombre, logo, diseño y código de la app son propiedad de su titular y no pueden copiarse ni reutilizarse sin permiso.</p><h3>Cambios y baja</h3><p>Podemos actualizar estos términos avisando en la app. Puedes darte de baja y borrar tus datos cuando quieras desde «Mi cuenta». Podemos suspender cuentas que incumplan estos términos.</p><h3>Ley aplicable</h3><p>Legislación española. Si eres consumidor, te amparan además las normas de tu lugar de residencia.</p>`,
    ];
  }
  /* Mientras Stripe esté en modo prueba (enlace test_), el pago solo se ve abriendo la app con ?probarpago */
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
      p: "En cada partido puedes sacar una imagen de la alineación para mandarla por WhatsApp, y abrir el Directo: marcador, minuto, goleadores, cambios y tarjetas en vivo, con un enlace para que la familia lo siga sin cuenta. Con la cámara del Directo grabas el partido con el marcador encima.",
    },
    {
      el: '[data-tab="pizarra"]',
      t: "Pizarra táctica",
      p: "Campo grande con los botones alrededor: pon jugadores con su dorsal, rivales, balón, conos y vallas, y arrástralos. Toca un jugador para cambiarle el color. Crea pasos con el + y pulsa ▶ para ver la jugada en movimiento, o sácala en imagen o vídeo.",
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
      p: "Tu plan, el plan para clubes (si eres supervisor del club, desde ahí ves a tus entrenadores), el control de entrenamientos (actívalo aquí si quieres pasar lista en cada entreno), la guía de uso, descargar tus datos, privacidad y borrar la cuenta. Desde aquí puedes volver a ver este tutorial cuando quieras.",
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
        "Debajo eliges la <b>categoría</b> del equipo. Marca cuánto dura cada parte: prebenjamín 25', benjamín 30', alevín 35', infantil 40' y de cadete en adelante 45'. Sin categoría se usa la duración normal de la modalidad.",
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
        "Los cambios y tarjetas que apuntes en el Directo aparecen solos aquí. Las tarjetas de cada jugador salen en su ficha de Plantilla y en Estadísticas.",
        "Puedes sacar una imagen de la alineación para mandarla por WhatsApp.",
      ],
    },
    {
      t: "Directo",
      p: [
        "En «Partidos», pulsa el botón de directo de un partido: llevas el marcador, el minuto y los goleadores en vivo.",
        "<b>Cambios</b>: pulsa «🔄 Cambio», elige quién sale y luego quién entra (salen con su dorsal). <b>Tarjetas</b>: pulsa «Amarilla» o «Roja» y elige al jugador. La segunda amarilla cuenta como expulsión. Con la ✕ quitas un gol, cambio o tarjeta apuntado por error.",
        "<b>Del rival</b>: al pulsar «🔄 Cambio», «Amarilla» o «Roja», elige arriba el nombre del rival. Pon el dorsal (en las tarjetas, también el nombre si quieres) y pulsa «Apuntar». Salen marcados con el nombre del rival.",
        "Los <b>minutos por parte</b> salen de la categoría del equipo. Si un día se juega con otra duración, cámbialos antes de pulsar «Empezar partido».",
        "Debajo eliges el <b>capitán</b> y el <b>portero</b>. Al pulsar «Terminar partido», los minutos de cada jugador se calculan solos con los cambios.",
        "Con «Compartir enlace» mandas un enlace para que la familia siga el partido sin tener cuenta: ve el marcador, el minuto, los goles, los cambios y las tarjetas. Con «Desactivar enlace» deja de funcionar.",
        "«Cámara: grabar el partido» graba vídeo con el marcador y el minuto dentro. Pon el móvil en horizontal. El vídeo se guarda solo en tu móvil. Grabar es gratis.",
        "«Emitir» envía el vídeo en vivo a quien tenga el enlace del directo (plan Pro). Puedes emitir y grabar a la vez.",
        "El vídeo en vivo lo pueden ver hasta <b>25 personas a la vez</b> en cada partido. Si ya hay 25, los demás siguen viendo el marcador y los goles, y el vídeo les entra solo en cuanto alguien lo deja de ver. El marcador no tiene límite.",
        "Consejo: para y guarda en el descanso, así los archivos son más pequeños.",
      ],
    },
    {
      t: "Control de entrenamientos",
      p: [
        "Es opcional: actívalo en «Mi cuenta › Activar el control de entrenamientos». Aparece la pestaña <b>Entrenos</b> abajo.",
        "Verás un calendario del mes. Toca un día y pulsa «Crear entrenamiento este día» (o «+ Entreno»). Con las flechas cambias de mes.",
        "Pasa lista con los jugadores de tu plantilla: <b>✓</b> vino, <b>✗</b> faltó y <b>J</b> falta justificada. Se guarda solo. «Todos vinieron» los marca a todos de una vez.",
        "Si falta alguien en la lista, pulsa «Añadir jugador» y escribe su nombre: queda en tu plantilla.",
        "Puedes apuntar la hora y una nota (por ejemplo, «táctica» o «físico»). Cada día del calendario sale de un color según la asistencia.",
        "<b>Grabar el entreno</b>: toca un día y pulsa «Grabar el entreno». Se abre la cámara; pulsa «● Grabar» y luego «Parar». Con «Guardar en el móvil» o «Compartir / Guardar en galería» el vídeo se queda en tu móvil (no se sube a internet). El vídeo lleva el nombre del equipo y la fecha. Grabar es gratis.",
        "Abajo tienes la <b>asistencia por jugador</b>: cuántas veces ha venido, faltado o justificado, y su porcentaje.",
        "Cada equipo tiene sus propios entrenamientos. En el plan gratuito puedes guardar hasta 5 entrenamientos por modalidad; con el plan Pro, ilimitados.",
        "Si lo desactivas, la pestaña se oculta pero tus entrenamientos no se borran.",
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
      ],
    },
    {
      t: "Estadísticas y buscador",
      p: [
        "En <b>Estadísticas</b> ves el ranking de tus jugadores por goles, minutos, partidos y titularidades.",
        "Con la lupa buscas cualquier jugador o partido de todas tus modalidades.",
      ],
    },
    {
      t: "Plan gratuito y plan Pro",
      p: [
        "El plan gratuito tiene un límite de jugadores, partidos y entrenamientos en cada modalidad y un equipo por modalidad. En «Mi cuenta» ves cuánto llevas.",
        "El plan Pro quita los límites, permite varios equipos y emitir vídeo en el Directo.",
        { texto: "El plan Pro cuesta 39,99 € al año (IVA incluido), unos 3,33 € al mes. Se contrata y se cancela desde «Mi cuenta».", soloWeb: true },
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
        "<b>Supervisor del club:</b> el encargado es siempre supervisor y puede pulsar «Hacer supervisor» junto a otra persona del club (por ejemplo, el gerente o el director deportivo). Con el club pagado, el supervisor pulsa «Ver» junto a un entrenador y la app le enseña su plantilla, partidos, alineaciones y entrenamientos en <b>solo lectura</b>: arriba sale «Viendo a…» y el botón «Volver a mis datos».",
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
      h = `<p>Sesión iniciada como <b>${esc(curEmail)}</b></p><p>Plan: <b>${plan === "pro" ? (club && club.activo ? "Pro · gracias a tu club" : enPrueba() ? "Pro · modo prueba" : "Pro · sin límites") : "Gratuito"}</b></p>${enPrueba() ? `<p class="pro-fin">Estás en <b>modo prueba</b>: tienes el plan Pro gratis hasta el <b>${esc(fechaLarga(pruebaHasta))}</b> (${diasQuedan(pruebaHasta) === 1 ? "queda 1 día" : "quedan " + diasQuedan(pruebaHasta) + " días"}). Después pasarás al plan gratuito.</p>` : ""}${plan === "pro" && proHasta ? `<p class="pro-fin">Has cancelado tu suscripción. Tu plan Pro estará activo hasta el <b>${esc(fechaLarga(proHasta))}</b>; después pasarás al plan gratuito. Si cambias de idea, puedes reactivarla en «Gestionar o cancelar mi suscripción».</p>` : ""}${plan === "pro" ? "" : usageHtml()}<div class="stack">${enAndroid ? "" : plan === "pro" ? (c.portalUrl && (pagoActivo || stripeCliente) ? `<a class="secondary" href="${esc(c.portalUrl + (c.portalUrl.includes("?") ? "&" : "?") + "prefilled_email=" + encodeURIComponent(curEmail) + "&locale=es")}" target="_blank" rel="noopener" data-pro-portal>Gestionar o cancelar mi suscripción</a>` : "") : '<button type="button" class="primary" data-info="pro">Pasar a Pro · 39,99 €/año</button>'}<button type="button" class="secondary" data-info="club">${club ? "Mi club: " + esc(club.nombre) : "Plan para clubes"}</button><button type="button" class="secondary" data-acct="entrenos" aria-pressed="${entrenosOn()}">${entrenosOn() ? "Desactivar el control de entrenamientos" : "Activar el control de entrenamientos"}</button><button type="button" class="secondary" data-info="ayuda">Guía de uso</button><button type="button" class="secondary" data-acct="tutorial">Ver el tutorial</button><button type="button" class="secondary" data-acct="novedades">Novedades de esta versión</button><button type="button" class="secondary" data-acct="export">Descargar mis datos</button><button type="button" class="secondary" data-info="privacy">Política de privacidad</button><button type="button" class="secondary" data-info="terms">Términos de uso</button><button type="button" class="secondary" data-acct="logout">Cerrar sesión</button><button type="button" class="danger" data-acct="delete">Borrar mi cuenta y mis datos</button></div>`;
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
      return `${estado}${compartirHtml()}${club.soy_supervisor ? supervisarHtml() : privado}<div class="stack"><button type="button" class="danger" data-acct="club-salir">Salir del club</button></div>`;
    let enlace = location.origin + location.pathname + "?club=" + encodeURIComponent(club.codigo);
    let wa = "https://wa.me/?text=" + encodeURIComponent(`Únete al club ${club.nombre} en Mi Fútbol JV32 y tendrás el plan Pro. Entra en Mi cuenta › Plan para clubes y escribe este código: ${club.codigo}\n${enlace}`);
    let lista = (club.miembros || [])
      .map((m) => `<div class="cm"><span><b>${esc(m.email || "")}</b><small>${m.admin ? "Encargado" : (m.supervisor ? "Supervisor · " : "") + "Desde el " + esc(fechaLarga(m.desde))}${verEstado(m)}</small></span><span class="cm-b">${verBtn(m)}${m.admin || m.supervisor === undefined ? "" : `<button type="button" class="lnk" data-acct="club-sup" data-id="${esc(m.id)}" data-si="${m.supervisor ? "" : "1"}" data-mail="${esc(m.email || "")}">${m.supervisor ? "Quitar supervisor" : "Hacer supervisor"}</button>`}${m.admin ? "" : `<button type="button" class="lnk" data-acct="club-quitar" data-id="${esc(m.id)}" data-mail="${esc(m.email || "")}">Quitar</button>`}</span></div>`)
      .join("");
    let pago = enAndroid
      ? ""
      : club.activo
        ? c.portalUrl && club.pagado
          ? `<a class="secondary" href="${esc(c.portalUrl + (c.portalUrl.includes("?") ? "&" : "?") + "prefilled_email=" + encodeURIComponent(curEmail) + "&locale=es")}" target="_blank" rel="noopener" data-pro-portal>Gestionar la suscripción del club</a>`
          : ""
        : "";
    return `${estado}<h3>Código para tus entrenadores</h3><p class="club-cod">${esc(club.codigo)}</p><p class="muted">Cada entrenador entra con su propia cuenta en «Mi cuenta › Plan para clubes» y escribe este código.</p><div class="hbtns"><button type="button" class="secondary" data-acct="club-copiar">Copiar</button><a class="secondary" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a><button type="button" class="secondary" data-acct="club-codigo">Cambiar</button></div>${club.activo ? "" : `<h3>Elige el pack del club</h3>${clubPacksHtml(true)}`}<h3>Entrenadores del club</h3>${privado}${club.soy_supervisor && club.activo ? '<p class="muted">Pulsa «Ver» para mirar los datos de un entrenador. Pulsa «Hacer supervisor» para que otra persona del club (por ejemplo, el director deportivo) también pueda verlos.</p>' : ""}<div class="club-lista">${lista}</div>${compartirHtml()}<div class="stack">${pago}${club.activo ? "" : '<button type="button" class="danger" data-acct="club-borrar">Borrar el club</button>'}</div>`;
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
  const verBtn = (m) =>
    club.soy_supervisor && club.activo && m.comparte && m.id !== curUser
      ? `<button type="button" class="lnk" data-acct="club-ver" data-id="${esc(m.id)}">Ver</button>`
      : "";
  function supervisarHtml() {
    let lista = (club.miembros || [])
      .filter((m) => m.id !== curUser)
      .map((m) => `<div class="cm"><span><b>${esc(m.email || "")}</b><small>${m.admin ? "Encargado" : m.supervisor ? "Supervisor" : "Entrenador"}${verEstado(m)}</small></span><span class="cm-b">${verBtn(m)}</span></div>`)
      .join("");
    return `<h3>Eres supervisor del club</h3><p class="muted">${club.activo ? "Pulsa «Ver» para mirar los equipos, jugadores, partidos y entrenamientos de un entrenador. Solo puedes mirar: no puedes cambiar nada." : "Podrás ver los datos de los entrenadores cuando el club esté pagado."}</p><div class="club-lista">${lista || '<p class="muted">Aún no hay más entrenadores en el club.</p>'}</div>`;
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
    bar.innerHTML = `<span>${ic("eye", 18)}Viendo a <b>${esc(viendo.email)}</b> · solo lectura</span><button type="button" class="secondary small" data-ver-salir>Volver a mis datos</button>`;
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
    } else if (w === "club-copiar") {
      try {
        await navigator.clipboard.writeText(club.codigo);
        note("Código copiado.", true);
      } catch (e) {
        note("Código: " + club.codigo);
      }
    }
  }
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
          directos: Object.values(liveRows),
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
    liveErr = (t) =>
      /directos|does not exist|schema cache|ver_directo/i.test(t || "")
        ? "El directo aún no está activado en la base de datos (falta ejecutar supabase-directo.sql en Supabase)."
        : t;
  async function loadLive() {
    liveRows = {};
    try {
      let r = await db.from("directos").select("*");
      (r.data || []).forEach((x) => (liveRows[x.partido_id] = x));
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
    return `<div class="lv-board"><div class="lv-team">${own ? `<input id="lvTeam" value="${esc(x.equipo)}" maxlength="60" aria-label="Nombre de tu equipo" title="Toca para cambiar el nombre de tu equipo">` : `<span>${esc(x.equipo)}</span>`}</div><div class="lv-score" role="img" aria-label="Marcador ${x.gf} a ${x.gc}"><b>${x.gf}</b><i>-</i><b>${x.gc}</b></div><div class="lv-team"><span>${esc(x.rival)}</span></div></div><div class="lv-clock${x.desde ? " run" : ""}"><span class="lv-st">${x.estado === "1T" || x.estado === "2T" ? "● " + LIVE_EST[x.estado] : x.estado === "pre" ? LIVE_EST.pre : ""}</span><b data-lvmin>${c[0]}</b><small data-lvss>${c[1]}</small></div>`;
  }
  const lvN = (n, d) => (n ? (d ? d + " " : "") + n : d ? "Dorsal " + d : "—");
  function liveEvents(x, own) {
    let am = {},
      all = (Array.isArray(x.eventos) ? x.eventos : []).map((e) => {
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
    return `<section class="panel live"><div class="bar"><div><div class="kicker">Directo</div><h2>${MN()}</h2><p class="muted">${esc(fmtDate(m.fecha))}</p></div><button class="secondary small" data-live="close">${ic("back", 18)}Volver</button></div>${liveBoard(x, serverNow(), true)}<div class="lv-ctl">${ctl}</div>${adj}<div class="lv-ctl">${B("cam", ic("live", 18) + "Cámara: grabar el partido", "secondary lv-cam")}</div><div class="lv-goals">${B("gf", ic("plus", 18) + "Gol nuestro", "primary")}${B("gc", ic("plus", 18) + "Gol rival")}</div>${ids.length ? `<div class="lv-ctl lv-more">${B("sub", "🔄 Cambio")}${B("ta", '<i class="tj a"></i>Amarilla')}${B("tr", '<i class="tj r"></i>Roja')}</div>` : ""}${pick}${capgk}<h3 class="lv-h">Goles, cambios y tarjetas</h3>${liveEvents(x, true)}<div class="lv-share"><h3>Enlace para compartir</h3><p class="muted">Quien tenga el enlace verá los equipos, el marcador, el minuto, los goleadores, los cambios y las tarjetas, sin necesidad de cuenta. Se actualiza solo.</p><input id="lvUrl" readonly value="${esc(liveUrl(x))}" aria-label="Enlace del directo"><div class="lv-ctl">${B("share", ic("share", 18) + "Compartir enlace", "primary")}${B("off", "Desactivar enlace", "danger")}</div></div></section>`;
  }
  /* Elegir jugadores para un cambio (sale y luego entra) o una tarjeta */
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
    if (k === "sub") {
      t = "Cambio · ¿Quién sale?";
      list = L([...c.on]) || '<span class="muted">No hay nadie en el campo.</span>';
    } else if (k.out) {
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
    if (x.eventos.length >= 80) return note("Demasiadas jugadas apuntadas en este partido.");
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
    }
    state.live = id;
    state.livePick = false;
    state.lvPick = null;
    render();
    window.scrollTo(0, 0);
  }
  /* Guarda en orden (una petición detrás de otra) para que no se pisen */
  function liveSave(x, after) {
    liveQ = liveQ
      .then(async () => {
        let r = await db
          .from("directos")
          .update({
            equipo: x.equipo,
            rival: x.rival,
            gf: x.gf,
            gc: x.gc,
            estado: x.estado,
            parte_min: x.parte_min,
            acum_ms: Math.round(Number(x.acum_ms) || 0),
            desde: x.desde,
            eventos: x.eventos,
          })
          .eq("id", x.id)
          .select();
        if (r.error) return note(liveErr(r.error.message));
        let s = r.data && r.data[0];
        if (s) {
          liveSync(s);
          x.desde = s.desde;
          x.actualizado = s.actualizado;
        }
        if (after) await after();
      })
      .catch((e) => note(e.message));
    return liveQ;
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
      .concat(ev.filter((z) => z.t === "s" && !z.r && !hay.has(z.id)).map((z) => ({ id: z.id, m: Number(z.m) || 0, sale: z.pid || "", entra: z.pin || "", lv: 1 })))
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
    /* Al terminar, los minutos de cada jugador salen solos de los cambios */
    if (fin && (ev.some((z) => z.t !== "f" && z.t !== "c" && !z.r) || entries(m).every((z) => !Number(z.minutes)))) {
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
  function liveGoal(x, t, pid) {
    if (!Array.isArray(x.eventos)) x.eventos = [];
    if (x.eventos.length >= 80) return note("Demasiadas jugadas apuntadas en este partido.");
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
    if (x.eventos.length >= 80) return note("Demasiadas jugadas apuntadas en este partido.");
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
      sd = e.target.closest("[data-lvside]");
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
      return render();
    }
    if (k === "rok") return liveRival(x);
    if (k === "sub" || k === "ta" || k === "tr") {
      state.livePick = false;
      state.lvSide = "n";
      state.lvPick = k === "sub" ? "sub" : k === "ta" ? "a" : "r";
      return render();
    }
    if (k === "cam") return camAbre(x.partido_id);
    if (k === "share") return liveShare(x);
    if (k === "off") return liveOff(x);
    if (k === "nopick") state.livePick = state.lvPick = null;
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
  });
  try {
    let r = JSON.parse(localStorage.getItem("mf_pizarra_v1") || "{}");
    Object.keys(MODES).forEach((k) => {
      let x = r[k] || {},
        n = Math.min(20, Math.max(1, parseInt(x.steps) || 1));
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
    return `<section class="panel board ${state.present ? "present" : ""}${playing ? " playing" : ""}${boardWasLand ? " land" : ""}${b.tool === "move" ? " tool-move" : ""}" id="boardPanel">
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
<div class="bextra"><button class="bi" data-b="img" aria-label="Guardar imagen" title="Guardar imagen">${ic("download")}</button><button class="bi go" data-b="present" aria-label="${state.present ? "Salir de pantalla completa" : "Presentar a pantalla completa"}" title="${state.present ? "Salir" : "Presentar"}">${ic(state.present ? "x" : "maximize")}</button>${gs.length ? `<label class="bgsel"><span>Titulares</span><select id="boardBg" aria-label="Poner en el campo los titulares de un partido"><option value="">Poner titulares de…</option>${gs.map((m) => `<option value="${m.id}">vs ${esc(m.rival)} · ${esc(fmtDate(m.fecha))}</option>`).join("")}</select></label>` : ""}</div></div>${pick}</section>`;
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
      if (!b.strokes.length && !b.items.length) {
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
    if (boardAnim && k !== "play" && k !== "present") return;
    if (k !== "add" && k !== "addp") state.boardMenu = false;
    if (k === "tool") {
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
      if (b.steps >= 20) {
        note("Una jugada puede tener como mucho 20 pasos.");
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

  db.auth.onAuthStateChange((event, session) => {
    if (PUB) return;
    if (event === "PASSWORD_RECOVERY") recovering = true;
    if (session && recovering) {
      $("login").classList.remove("hidden");
      $("app").classList.add("hidden");
      if (amode !== "newpass") setAm("newpass");
      return;
    }
    if (session) {
      let first =
        curUser !== session.user.id || $("app").classList.contains("hidden");
      useUser(session.user);
      /* No esperar aquí: dentro de este aviso Supabase mantiene un bloqueo y cualquier consulta quedaría colgada */
      if (first) setTimeout(enterApp, 0);
    } else {
      salirVer();
      curUser = null;
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
