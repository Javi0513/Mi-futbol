(() => {
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
  const TERMS_VERSION = "2026-10";
  const db = window.supabase.createClient(c.supabaseUrl, c.supabaseAnonKey);
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
  };
  const MODES = {
    7: { name: "Fútbol 7", n: 7, maxP: 14, maxM: 5, cap: 14 },
    11: { name: "Fútbol 11", n: 11, maxP: 25, maxM: 5, cap: 0 },
    fs: { name: "Fútbol sala", n: 5, maxP: 16, maxM: 5, cap: 14 },
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
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    penline:
      '<path d="M12 20h9"/><path d="M16.4 3.6a2.1 2.1 0 0 1 3 3L7.4 18.6a2 2 0 0 1-.9.5l-3 .9a.5.5 0 0 1-.6-.6l.9-3a2 2 0 0 1 .5-.9z"/>',
    arrow: '<path d="M7 17 17 7"/><path d="M7 7h10v10"/>',
    undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
    maximize:
      '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  };
  const ic = (n, s = 20) =>
    `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]}</svg>`;
  const empty = (i, t, s) =>
    `<div class="blank">${ic(i, 34)}<b>${t}</b><span>${s}</span></div>`;
  const mini = (t) =>
    `<div class="mini" aria-label="${t.games} partidos, ${t.minutes} minutos, ${t.goals} goles, ${t.starts} titularidades"><span><b>${t.games}</b>partidos</span><span><b>${t.minutes}</b>min</span><span><b>${t.goals}</b>goles</span><span><b>${t.starts}</b>titular</span></div>`;
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
    roster = () =>
      state.players
        .filter((p) => p.modalidad === state.mode)
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    games = () =>
      state.matches
        .filter((m) => m.modalidad === state.mode)
        .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    entries = (m) =>
      Array.isArray(m.participaciones) ? m.participaciones : [],
    name = (id) => state.players.find((p) => p.id === id)?.nombre || "Jugador";
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
      showInfo("pro");
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
    let [{ data: ps, error: pe }, { data: ms, error: me }] = await Promise.all([
      db
        .from("futbol_personal_jugadores")
        .select("id,modalidad,nombre,foto")
        .order("nombre"),
      db
        .from("futbol_personal_partidos")
        .select("id,modalidad,fecha,rival,participaciones,alineacion")
        .order("fecha", { ascending: false }),
    ]);
    if (pe || me) throw pe || me;
    state.players = ps || [];
    state.matches = (ms || []).map((m) => ({
      ...m,
      participaciones: parseJson(m.participaciones, []),
      alineacion: parseJson(m.alineacion, {}),
    }));
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
        }
        return r;
      },
      { games: 0, starts: 0, minutes: 0, goals: 0 },
    );
  }
  function render() {
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
      key = state.mode + state.tab + (state.draft ? "e" : "");
    if (state.tab !== "pizarra" || state.draft) state.present = false;
    document.body.classList.toggle(
      "tab-pizarra",
      state.tab === "pizarra" && !state.draft,
    );
    document.body.style.overflow = state.present ? "hidden" : "";
    v.innerHTML = state.draft
      ? editor()
      : state.tab === "plantilla"
        ? players()
        : state.tab === "partidos"
          ? matches()
          : state.tab === "pizarra"
            ? boardView()
            : summary();
    if (!state.draft && state.tab === "pizarra") initBoard();
    if (key !== lastKey) {
      lastKey = key;
      v.classList.remove("enter");
      void v.offsetWidth;
      v.classList.add("enter");
    }
  }
  function players() {
    let r = roster();
    return `<section class="panel"><div class="bar"><div><div class="kicker">Plantilla</div><h2>${MN()}</h2><p class="muted">${r.length}${plan === "pro" ? "" : " / " + MODES[state.mode].maxP} ${r.length === 1 ? "jugador" : "jugadores"}</p></div><button class="primary" data-action="add-player">${ic("plus")}Jugador</button></div>${
      r.length
        ? r
            .map((p) => {
              let t = totals(p.id);
              return `<div class="row" data-pid="${p.id}">${avatar(p, true)}<div class="info"><strong>${esc(p.nombre)}</strong>${mini(t)}</div><div class="actions"><button class="ib" data-action="edit-player" data-id="${p.id}" aria-label="Editar ${esc(p.nombre)}" title="Editar">${ic("pencil")}</button><button class="ib d" data-action="delete-player" data-id="${p.id}" aria-label="Borrar ${esc(p.nombre)}" title="Borrar">${ic("trash")}</button></div></div>`;
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
              return `<div class="row mrow" data-mid="${m.id}">${dtile(m.fecha)}<div class="info"><strong>${esc(m.rival)}</strong><small>${resChip(a)}${esc(a.formation || "Sin formación")} · ${e.length} convocados · ${e.reduce((s, x) => s + (Number(x.minutes) || 0), 0)} min · ${e.reduce((s, x) => s + (Number(x.goals) || 0), 0)} goles</small><small class="cl">Inicial: ${
                e
                  .filter((x) => x.starter)
                  .map((x) => esc(name(x.id)))
                  .join(", ") || "—"
              }</small></div><div class="actions"><button class="ib" data-img="${m.id}" aria-label="Descargar imagen de la alineación" title="Descargar imagen">${ic("image")}</button><button class="ib" data-action="edit-match" data-id="${m.id}" aria-label="Editar partido contra ${esc(m.rival)}" title="Editar">${ic("pencil")}</button><button class="ib d" data-action="delete-match" data-id="${m.id}" aria-label="Borrar partido contra ${esc(m.rival)}" title="Borrar">${ic("trash")}</button></div></div>`;
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
      start = d.players.filter((x) => x.starter);
    let choices = roster()
      .map((p) => {
        let x = d.players.find((e) => e.id === p.id);
        return `<div class="checkline"><span>${esc(p.nombre)}</span><input type="checkbox" data-field="called" data-id="${p.id}" aria-label="Convocado: ${esc(p.nombre)}" ${x ? "checked" : ""}><input type="checkbox" data-field="starter" data-id="${p.id}" aria-label="Titular: ${esc(p.nombre)}" ${x?.starter ? "checked" : ""}><input type="number" data-field="minutes" data-id="${p.id}" aria-label="Minutos de ${esc(p.nombre)}" min="0" value="${x?.minutes || 0}" ${x ? "" : "disabled"}><input type="number" data-field="goals" data-id="${p.id}" aria-label="Goles de ${esc(p.nombre)}" min="0" value="${x?.goals || 0}" ${x ? "" : "disabled"}></div>`;
      })
      .join("");
    return `<section class="panel"><div class="bar"><div><div class="kicker">${state.editing ? "Editar partido" : "Nuevo partido"}</div><h2>${MN()}</h2><p class="muted">${d.players.length}${MODES[state.mode].cap ? " / " + MODES[state.mode].cap : ""} convocados · ${start.length}/${modeCount()} titulares</p></div><button class="secondary small" data-action="cancel">${ic("back", 18)}Volver</button></div><div class="formgrid"><label>Fecha<input id="date" type="date" value="${esc(d.fecha)}"></label><label>Rival<input id="rival" value="${esc(d.rival)}" maxlength="100" autocomplete="off"></label></div><div class="score"><label>Goles a favor<input id="gf" type="number" min="0" max="99" inputmode="numeric" placeholder="–" value="${esc(d.gf)}"></label><span class="dash" aria-hidden="true">–</span><label>Goles en contra<input id="gc" type="number" min="0" max="99" inputmode="numeric" placeholder="–" value="${esc(d.gc)}"></label><p class="hint">Resultado (opcional)</p></div>
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
        return `<div class="slot" style="left:${s[1]}%;top:${s[2]}%"><button data-slot="${i}" class="${pid ? "fill" : ""} ${state.selectedSlot === i ? "sel" : ""}" aria-label="${pid ? esc(name(pid)) + " en " + s[0] : "Posición " + s[0] + " libre"}" title="${pid ? "Arrastra para mover" : "Elegir jugador"}">${pid ? (pl && pl.foto && pl.foto.startsWith("data:") ? `<img src="${esc(pl.foto)}" alt="">` : esc((name(pid)[0] || "?").toUpperCase())) : "+"}</button><span>${pid ? esc(name(pid)) : s[0]}</span></div>`;
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
            ? '<button class="danger" data-clear="1">Quitar jugador</button>'
            : "")
        : '<span class="muted">Toca una posición para elegir jugador, o arrástralo desde arriba.</span>'
    }</div></div>
<div><h3>Convocatoria</h3><div style="height:8px"></div><div class="checkline muted"><span>Jugador</span><span>Conv.</span><span>Inicial</span><span>Min.</span><span>Goles</span></div>${choices || '<div class="blank">Añade primero jugadores en Plantilla.</div>'}<h3 style="margin-top:18px">Inicial</h3><div style="margin-top:6px">${start.map((x) => `<span class="badge">${esc(name(x.id))}</span>`).join("") || '<span class="muted">Selecciona titulares.</span>'}</div></div></div>
<div class="savebar"><button class="primary" data-action="save" ${state.busy ? "disabled" : ""}>${ic("check", 20)}Guardar partido</button><button class="secondary" data-action="cancel">Cancelar</button></div></section>`;
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
      R0 = 46;
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
      g.fillStyle = "rgba(43,227,106,.25)";
      g.fill();
      g.beginPath();
      g.arc(px, py, R0, 0, Math.PI * 2);
      g.fillStyle = LIME;
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
        g.fillStyle = "#03140a";
        g.font = `800 58px ${ff}`;
        g.textAlign = "center";
        g.fillText((nm(id)[0] || "?").toUpperCase(), px, py + 19);
      }
      g.beginPath();
      g.arc(px, py, R0, 0, Math.PI * 2);
      g.strokeStyle = "#d6ffe4";
      g.lineWidth = 5;
      g.stroke();
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
    if (o.strokes && o.strokes.length) {
      g.save();
      rr(g, fx, fy, fw, fh, 36);
      g.clip();
      paintStrokes(g, o.strokes, fx, fy, fw, fh, 10);
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
    let payload = { modalidad: state.mode, nombre: name, foto };
    if (!original && full("p")) {
      $("modal").classList.add("hidden");
      showInfo("pro");
      return;
    }
    if (!original) {
      payload.id = crypto.randomUUID();
      payload.owner_id = (await db.auth.getUser()).data.user.id;
    }
    let q = original
      ? db
          .from("futbol_personal_jugadores")
          .update(payload)
          .eq("id", original.id)
      : db.from("futbol_personal_jugadores").insert(payload);
    let { error } = await q;
    if (error) throw error;
    $("modal").classList.add("hidden");
    state.playerId = null;
    await load();
    note("Jugador guardado.", true);
  }
  async function resize(file) {
    if (!file.type.startsWith("image/"))
      throw Error("Selecciona una imagen válida.");
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
  async function enterApp() {
    $("login").classList.add("hidden");
    $("app").classList.remove("hidden");
    try {
      await loadPlan();
      await load();
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
      let r = await db.from("perfiles").select("plan");
      plan = (r.data && r.data[0] && r.data[0].plan) || "gratis";
    } catch (e) {}
  }
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
            boardState[k].strokes = [];
            boardState[k].hist = [];
            boardState[k].bg = "";
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
          s: MODES[p.modalidad].name + " · Plantilla",
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
          s: MODES[m.modalidad].name + " · " + fmtDate(m.fecha),
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
        `<p>Última actualización: octubre de 2026.</p><h3>Quién es el responsable</h3><p>${id}. Contacto: ${ct}.</p><h3>Qué datos tratamos</h3><p>Tu email y contraseña (la contraseña se guarda cifrada), y el contenido que introduces: jugadores (nombre y foto opcional), partidos, alineaciones, resultados y estadísticas. Los dibujos de la pizarra se guardan solo en tu dispositivo.</p><h3>Para qué y con qué base</h3><p>Solo para darte el servicio de la app (art. 6.1.b RGPD, ejecución del contrato). No hacemos publicidad, no vendemos datos ni elaboramos perfiles.</p><h3>Con quién se comparten</h3><p>Con nuestros proveedores técnicos: <b>Supabase</b> (base de datos y autenticación, servidores en la Unión Europea) y <b>GitHub Pages</b> (alojamiento de la web).${c.turnstileSiteKey ? " Y <b>Cloudflare</b> (verificación anti-robots)." : ""} No se ceden datos a otros terceros salvo obligación legal.</p><h3>Cuánto tiempo</h3><p>Mientras mantengas la cuenta. Si la borras desde «Mi cuenta», se eliminan tus datos de forma definitiva.</p><h3>Tus derechos</h3><p>Puedes acceder, rectificar, suprimir, portar, limitar u oponerte al tratamiento. Desde «Mi cuenta» puedes descargar y borrar tus datos tú mismo; también puedes escribirnos. Si no estás conforme, puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).</p><h3>Datos de jugadores y menores</h3><p>La app es para entrenadores y responsables adultos. Si introduces datos de otras personas, y en especial de menores, eres responsable de contar con su autorización (o la de sus tutores). Te recomendamos usar solo el nombre de pila y subir fotos solo con permiso. En relación con esos datos de terceros, tú eres quien decide para qué se usan y nosotros actuamos como encargados del tratamiento: los guardamos solo para prestarte el servicio, no los usamos para ningún otro fin y los borramos cuando borras la cuenta o el dato.</p><h3>Almacenamiento en tu dispositivo</h3><p>Usamos únicamente almacenamiento técnico necesario (sesión y pizarra). No usamos cookies de publicidad ni de analítica.${c.turnstileSiteKey ? " Para evitar registros automáticos, al crear la cuenta o entrar se usa la verificación anti-robots de <b>Cloudflare Turnstile</b>, que puede tratar datos técnicos del navegador." : ""}</p>`,
      ];
    return [
      "Términos de uso",
      `<p>Última actualización: octubre de 2026.</p><h3>Qué es</h3><p>Mi Fútbol JV32 es una aplicación web para gestionar plantillas, alineaciones, partidos, estadísticas y pizarra táctica. Titular del servicio: ${id}.</p><h3>Cuenta</h3><p>Debes ser mayor de edad. Eres responsable de mantener tu contraseña en secreto y de la actividad de tu cuenta.</p><h3>Tu contenido</h3><p>Los datos que introduces son tuyos. Garantizas que tienes derecho a usarlos y que cuentas con la autorización de las personas cuyos datos introduces. No puedes usar la app para fines ilícitos ni subir contenido ofensivo o que vulnere derechos de terceros.</p><h3>Plan gratuito y plan Pro</h3><p>El plan gratuito permite, en cada modalidad, hasta 5 partidos y un máximo de jugadores (25 en Fútbol 11, 14 en Fútbol 7 y 16 en Fútbol sala). Para superar esos límites existe el plan Pro, de 5,99 € al mes (IVA incluido). Solo se contrata y se cobra con tu aceptación expresa y puedes cancelarlo cuando quieras. Podremos modificar planes y precios avisando con antelación; el cambio no se aplicará a una suscripción en curso sin tu consentimiento.</p><h3>Disponibilidad</h3><p>La app se ofrece «tal cual». Hacemos copias razonables, pero te recomendamos descargar tus datos de vez en cuando desde «Mi cuenta». No respondemos de pérdidas indirectas ni de interrupciones ajenas a nuestro control, en los límites que permite la ley.</p><h3>Propiedad</h3><p>El nombre, logo, diseño y código de la app son propiedad de su titular y no pueden copiarse ni reutilizarse sin permiso.</p><h3>Cambios y baja</h3><p>Podemos actualizar estos términos avisando en la app. Puedes darte de baja y borrar tus datos cuando quieras desde «Mi cuenta». Podemos suspender cuentas que incumplan estos términos.</p><h3>Ley aplicable</h3><p>Legislación española. Si eres consumidor, te amparan además las normas de tu lugar de residencia.</p>`,
    ];
  }
  function proBtn() {
    let u = c.proUrl,
      m = c.contactEmail;
    return u
      ? `<a class="primary" href="${esc(u)}" target="_blank" rel="noopener">Quiero el plan Pro</a>`
      : m
        ? `<a class="primary" href="mailto:${esc(m)}?subject=${encodeURIComponent("Quiero el plan Pro de Mi Fútbol JV32")}">Quiero el plan Pro</a>`
        : `<p>Escríbenos para activar el plan Pro.</p>`;
  }
  function usageHtml() {
    return `<div class="usage">${Object.keys(MODES)
      .map((k) => {
        let M = MODES[k];
        return `<div><span>${esc(M.name)}</span><span><b>${state.players.filter((p) => p.modalidad === k).length}</b>/${M.maxP} jug. · <b>${state.matches.filter((m) => m.modalidad === k).length}</b>/${M.maxM} part.</span></div>`;
      })
      .join("")}</div>`;
  }
  function showInfo(k) {
    let t, h;
    if (k === "pro") {
      let M = MODES[state.mode];
      t = "Plan Pro";
      h = `<p>Has llegado al límite del plan gratuito en <b>${esc(MN())}</b>: hasta ${M.maxP} jugadores y ${M.maxM} partidos.</p><p>Con el <b>plan Pro</b> tienes <b>jugadores y partidos ilimitados</b> en Fútbol 7, Fútbol 11 y Fútbol sala, y todas las novedades.</p><p class="price">5,99 € <small>al mes · IVA incluido · cancela cuando quieras</small></p><div class="stack">${proBtn()}</div>`;
    } else if (k === "account") {
      delStep = false;
      t = "Mi cuenta";
      h = `<p>Sesión iniciada como <b>${esc(curEmail)}</b></p><p>Plan: <b>${plan === "pro" ? "Pro · sin límites" : "Prueba gratuita"}</b></p>${plan === "pro" ? "" : usageHtml()}<div class="stack">${plan === "pro" ? "" : '<button type="button" class="primary" data-info="pro">Pasar a Pro · 5,99 €/mes</button>'}<button type="button" class="secondary" data-acct="export">Descargar mis datos</button><button type="button" class="secondary" data-info="privacy">Política de privacidad</button><button type="button" class="secondary" data-info="terms">Términos de uso</button><button type="button" class="secondary" data-acct="logout">Cerrar sesión</button><button type="button" class="danger" data-acct="delete">Borrar mi cuenta y mis datos</button></div>`;
    } else [t, h] = legalHtml(k);
    $("infoTitle").textContent = t;
    $("infoBody").innerHTML = h;
    $("info").classList.remove("hidden");
    $("infoBody").scrollTop = 0;
  }
  $("acct").onclick = () => showInfo("account");
  $("closeInfo").onclick = () => $("info").classList.add("hidden");
  document.addEventListener("click", async (e) => {
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
    if (w === "logout") {
      $("info").classList.add("hidden");
      doLogout();
    }
    if (w === "export") {
      let data = {
          exportado: new Date().toISOString(),
          email: curEmail,
          jugadores: state.players,
          partidos: state.matches,
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
        `<p>Se borrarán <b>para siempre</b> tu cuenta, tus jugadores, partidos y estadísticas. No se puede deshacer. Si quieres conservar algo, descarga antes tus datos.</p><label>Escribe BORRAR para confirmar<input id="delConf" autocomplete="off"></label><div class="stack"><button type="button" class="danger" data-acct="delete2">Borrar definitivamente</button></div>`;
    }
    if (w === "delete2") {
      if ($("delConf").value.trim().toUpperCase() !== "BORRAR")
        return note("Escribe BORRAR para confirmar.");
      ac.disabled = true;
      let r = await db.rpc("borrar_mi_cuenta");
      if (r.error) {
        ac.disabled = false;
        return note(r.error.message);
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
    if (!d || !(d.players.length || d.rival || d.gf || d.gc)) return true;
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
    let mode = e.target.closest("[data-mode]"),
      tab = e.target.closest("[data-tab]"),
      a = e.target.closest("[data-action]");
    if (mode) {
      if (!leaveDraft()) return;
      state.mode = mode.dataset.mode;
      state.tab = "plantilla";
      state.draft = null;
      render();
    } else if (tab) {
      if (!leaveDraft()) return;
      state.tab = tab.dataset.tab;
      state.draft = null;
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

  const boardState = {};
  try {
    let r = JSON.parse(localStorage.getItem("mf_pizarra_v1") || "{}");
    Object.keys(MODES).forEach((k) => {
      let x = r[k] || {};
      boardState[k] = {
        strokes: Array.isArray(x.strokes)
          ? x.strokes.filter((s) => s && Array.isArray(s.p))
          : [],
        hist: [],
        bg: x.bg || "",
        color: x.color || "#ffd60a",
        tool: x.tool || "pen",
      };
    });
  } catch (e) {}
  const bd = () =>
    boardState[state.mode] ||
    (boardState[state.mode] = {
      strokes: [],
      hist: [],
      bg: "",
      color: "#ffd60a",
      tool: "pen",
    });
  function saveBoard() {
    try {
      let o = {};
      Object.keys(boardState).forEach((k) => {
        let x = boardState[k];
        o[k] = { strokes: x.strokes, bg: x.bg, color: x.color, tool: x.tool };
      });
      let s = JSON.stringify(o);
      if (s.length < 900000) localStorage.setItem("mf_pizarra_v1", s);
    } catch (e) {}
  }
  function paintStrokes(g, list, x0, y0, w, h, lw) {
    g.save();
    g.lineCap = "round";
    g.lineJoin = "round";
    list.forEach((s) => {
      let P = s.p.map((q) => [x0 + q[0] * w, y0 + q[1] * h]);
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
        if (j < k) {
          let a = Math.atan2(e[1] - P[j][1], e[0] - P[j][0]),
            L = lw * 4.4;
          g.shadowBlur = 0;
          g.beginPath();
          g.moveTo(
            e[0] + Math.cos(a) * lw * 0.6,
            e[1] + Math.sin(a) * lw * 0.6,
          );
          g.lineTo(e[0] - L * Math.cos(a - 0.5), e[1] - L * Math.sin(a - 0.5));
          g.lineTo(e[0] - L * Math.cos(a + 0.5), e[1] - L * Math.sin(a + 0.5));
          g.closePath();
          g.fill();
        }
      }
    });
    g.restore();
  }
  function boardTokens() {
    let m = state.matches.find((x) => x.id === bd().bg);
    if (!m) return "";
    let a = m.alineacion || {},
      f = formations[m.modalidad][a.formation];
    if (!f) return "";
    return f
      .map((s, i) => {
        let pid = (a.slots || {})[i];
        if (!pid) return "";
        let pl = state.players.find((x) => x.id === pid);
        return `<div class="slot tk" style="left:${s[1]}%;top:${s[2]}%"><button class="fill" tabindex="-1" aria-hidden="true">${pl && pl.foto && pl.foto.startsWith("data:") ? `<img src="${esc(pl.foto)}" alt="">` : esc((name(pid)[0] || "?").toUpperCase())}</button><span>${esc(name(pid))}</span></div>`;
      })
      .join("");
  }
  function boardView() {
    let b = bd(),
      gs = games().filter(
        (m) =>
          m.alineacion &&
          m.alineacion.slots &&
          Object.keys(m.alineacion.slots).length,
      );
    if (b.bg && !gs.some((m) => m.id === b.bg)) b.bg = "";
    const sw = [
      ["#ffd60a", "Amarillo"],
      ["#ffffff", "Blanco"],
      ["#ff4d5e", "Rojo"],
      ["#38bdf8", "Azul"],
    ];
    return `<section class="panel board ${state.present ? "present" : ""}" id="boardPanel"><div class="bar"><div><div class="kicker">Pizarra</div><h2>${MN()}</h2><p class="muted">Dibuja con el dedo o el ratón para plantear el partido. Con la goma, toca una línea para borrarla.</p></div></div>
<div class="btools"><div class="seg" role="group" aria-label="Herramienta">${[
      ["pen", "Lápiz", "penline"],
      ["arrow", "Flecha", "arrow"],
      ["erase", "Goma", "eraser"],
    ]
      .map(
        (t) =>
          `<button data-b="tool" data-v="${t[0]}" aria-pressed="${b.tool === t[0]}">${ic(t[2], 18)}${t[1]}</button>`,
      )
      .join(
        "",
      )}</div><div class="swatches" role="group" aria-label="Color">${sw.map((c) => `<button class="sw" data-b="color" data-v="${c[0]}" style="--c:${c[0]}" aria-label="${c[1]}" aria-pressed="${b.color === c[0]}"><i></i></button>`).join("")}</div><button class="ib" data-b="undo" aria-label="Deshacer" title="Deshacer">${ic("undo")}</button><button class="ib d" data-b="clear" aria-label="Borrar todo" title="Borrar todo">${ic("trash")}</button><span class="bsep"></span><button class="secondary small" data-b="img">${ic("download", 18)}Imagen</button><button class="primary small" data-b="present">${ic(state.present ? "x" : "maximize", 18)}${state.present ? "Salir" : "Presentar"}</button></div>
<label class="bgsel">Fondo<select id="boardBg" aria-label="Fondo de la pizarra"><option value="">Campo vacío</option>${gs.map((m) => `<option value="${m.id}" ${b.bg === m.id ? "selected" : ""}>Alineación vs ${esc(m.rival)} · ${esc(fmtDate(m.fecha))}</option>`).join("")}</select></label>
<div class="bfield"><div class="field ${state.mode === "fs" ? "fs" : ""}" id="bfield">${fieldMarks()}${boardTokens()}<canvas id="bcanvas" role="img" aria-label="Pizarra táctica: dibuja con el dedo o el ratón"></canvas></div></div></section>`;
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
    const redraw = () => {
      g.clearRect(0, 0, cv.width, cv.height);
      if (!b.strokes.length) {
        g.save();
        g.fillStyle = "rgba(241,247,234,.42)";
        g.font = `800 ${Math.round(cv.width * 0.085)}px "Barlow Condensed","Arial Narrow",Impact,sans-serif`;
        g.textAlign = "center";
        g.fillText("DIBUJA AQUÍ", cv.width / 2, cv.height * 0.2);
        g.restore();
      }
      paintStrokes(
        g,
        b.strokes,
        0,
        0,
        cv.width,
        cv.height,
        Math.max(3, cv.width * 0.0085),
      );
    };
    const size = () => {
      let r = fe.getBoundingClientRect(),
        w = Math.max(1, Math.round(r.width * dpr)),
        h = Math.max(1, Math.round(r.height * dpr));
      if (cv.width !== w || cv.height !== h) {
        cv.width = w;
        cv.height = h;
      }
      redraw();
    };
    if (boardRO) boardRO.disconnect();
    if (window.ResizeObserver) {
      boardRO = new ResizeObserver(size);
      boardRO.observe(fe);
    }
    size();
    const pt = (e) => {
      let r = cv.getBoundingClientRect();
      return [
        Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
        Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
      ];
    };
    const erase = (p) => {
      let r = cv.getBoundingClientRect(),
        px = p[0] * r.width,
        py = p[1] * r.height,
        n = b.strokes.length,
        before = JSON.stringify(b.strokes);
      b.strokes = b.strokes.filter(
        (s) =>
          !s.p.some(
            (q) => Math.hypot(q[0] * r.width - px, q[1] * r.height - py) < 24,
          ),
      );
      if (b.strokes.length !== n) {
        b.hist.push(before);
        if (b.hist.length > 60) b.hist.shift();
        redraw();
      }
    };
    cv.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      try {
        cv.setPointerCapture(e.pointerId);
      } catch (x) {}
      let p = pt(e);
      if (b.tool === "erase") {
        cur = { erase: 1 };
        erase(p);
        return;
      }
      b.hist.push(JSON.stringify(b.strokes));
      if (b.hist.length > 60) b.hist.shift();
      cur = { c: b.color, t: b.tool, p: [p] };
      b.strokes.push(cur);
      redraw();
    });
    cv.addEventListener("pointermove", (e) => {
      if (!cur) return;
      let list = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
      if (!list.length) list = [e];
      list.forEach((ev) => {
        let p = pt(ev);
        if (cur.erase) {
          erase(p);
          return;
        }
        let l = cur.p[cur.p.length - 1],
          r = cv.getBoundingClientRect();
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
      cur = null;
      saveBoard();
    };
    cv.addEventListener("pointerup", end);
    cv.addEventListener("pointercancel", end);
    cv.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  async function boardExport() {
    let b = bd();
    if (!b.strokes.length && !b.bg) {
      note("Dibuja algo en la pizarra antes de descargar la imagen.");
      return;
    }
    let m = state.matches.find((x) => x.id === b.bg),
      al =
        m && m.alineacion
          ? {
              formation: m.alineacion.formation,
              slots: m.alineacion.slots || {},
            }
          : { formation: Object.keys(formations[state.mode])[0], slots: {} },
      o = {
        modalidad: state.mode,
        fecha: new Date().toISOString().slice(0, 10),
        rival: m ? m.rival : "",
        players: [],
        alineacion: al,
        pizarra: true,
        strokes: b.strokes,
      };
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
      fname = `pizarra-${MFN(o.modalidad)}-${o.fecha}.png`;
    note("");
    let file = new File([blob], fname, { type: "image/png" });
    if (
      navigator.canShare &&
      navigator.canShare({ files: [file] }) &&
      window.matchMedia("(pointer:coarse)").matches
    ) {
      try {
        await navigator.share({ files: [file], title: "Pizarra" });
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
  $("view").addEventListener("click", (e) => {
    let t = e.target.closest("[data-b]");
    if (!t || state.tab !== "pizarra") return;
    let b = bd(),
      k = t.dataset.b;
    if (k === "tool") {
      b.tool = t.dataset.v;
      saveBoard();
      render();
    } else if (k === "color") {
      b.color = t.dataset.v;
      if (b.tool === "erase") b.tool = "pen";
      saveBoard();
      render();
    } else if (k === "undo") {
      if (b.hist.length) {
        b.strokes = JSON.parse(b.hist.pop());
        saveBoard();
        render();
      }
    } else if (k === "clear") {
      if (b.strokes.length) {
        b.hist.push(JSON.stringify(b.strokes));
        b.strokes = [];
        saveBoard();
        render();
      }
    } else if (k === "img")
      boardExport().catch((x) =>
        note("No se pudo crear la imagen: " + x.message),
      );
    else if (k === "present") {
      state.present = !state.present;
      render();
    }
  });
  $("view").addEventListener("change", (e) => {
    if (e.target.id === "boardBg") {
      bd().bg = e.target.value;
      saveBoard();
      render();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.present) {
      state.present = false;
      render();
    }
  });

  db.auth.onAuthStateChange((event, session) => {
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
      curUser = null;
      Object.assign(state, {
        players: [],
        matches: [],
        draft: null,
        editing: null,
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
  function showUpdate(v) {
    if ($("upd")) return;
    let d = document.createElement("div");
    d.id = "upd";
    d.setAttribute("role", "status");
    d.innerHTML =
      '<span>Hay una versión nueva de Mi Fútbol JV32.</span><button type="button">Actualizar</button>';
    d.querySelector("button").onclick = () => {
      location.replace(location.pathname + "?v=" + encodeURIComponent(v));
    };
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
      if (j && j.version && j.version !== APP_VERSION) showUpdate(j.version);
    } catch (e) {}
  }
  setTimeout(() => checkUpdate(true), 2500);
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
