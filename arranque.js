/* v11.70 · Arranque de Mi Fútbol JV32.
   Se carga antes que todo y está escrito a la antigua (ES5) a propósito, para que funcione
   también en tablets y móviles con un Chrome / Android System WebView viejo.
   La app necesita Chrome 85 o más: si el navegador es más antiguo (o un archivo no carga),
   la app no llega a arrancar y, antes, al pulsar «Entrar» no pasaba nada.
   Ahora lo dice claro en la pantalla, con botones para actualizar Chrome y WebView o «Reparar».
   app.js pone window.MF_LISTO = true cuando la pantalla de entrada ya funciona. */
(function () {
  var errs = [];
  var ua = navigator.userAgent || "";
  var android = /Android/i.test(ua);
  window.addEventListener(
    "error",
    function (e) {
      try {
        if (errs.length < 3 && e && e.message)
          errs.push(
            e.message +
              (e.filename ? " (" + String(e.filename).split("/").pop().split("?")[0] + ":" + (e.lineno || 0) + ")" : "")
          );
      } catch (x) {}
    },
    true
  );
  function chromeV() {
    var m = /Chrome\/(\d+)/.exec(ua);
    return m ? +m[1] : 0;
  }
  /* Chrome 85 trae a la vez lo que usa la app (||=, ??=) y String.replaceAll / Promise.any */
  function viejo() {
    return (
      typeof Promise === "undefined" ||
      typeof Promise.any !== "function" ||
      typeof "".replaceAll !== "function"
    );
  }
  function esc(t) {
    return String(t).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function visible(el) {
    var l = document.getElementById("login");
    return el && l && !/\bhidden\b/.test(l.className) && el.offsetParent !== null;
  }
  function aviso() {
    if (window.MF_LISTO) return false;
    var m = document.getElementById("loginmsg");
    if (!visible(m)) return false;
    var h;
    if (viejo()) {
      var v = chromeV();
      h =
        "<span><b>Tu " +
        (android ? "tablet o móvil" : "navegador") +
        " tiene un navegador antiguo" +
        (v ? " (Chrome " + v + ")" : "") +
        " y la app no puede arrancar.</b> " +
        (android
          ? "Abre <b>Play Store</b> y actualiza <b>«Google Chrome»</b> y <b>«Android System WebView»</b>. Después reinicia el dispositivo y vuelve a abrir la app."
          : "Actualiza el navegador (o el sistema del dispositivo) y vuelve a abrir la app.") +
        "</span>" +
        (android
          ? '<span class="arr-btns"><a class="lnk" href="https://play.google.com/store/apps/details?id=com.android.chrome" target="_blank" rel="noopener">Actualizar Chrome</a> <a class="lnk" href="https://play.google.com/store/apps/details?id=com.google.android.webview" target="_blank" rel="noopener">Actualizar WebView</a></span>'
          : "");
    } else {
      h =
        "<span><b>La app no ha terminado de cargar.</b> Pulsa «Reparar»: no se borra nada de tu cuenta. Si sigue igual, manda una captura de esta pantalla a mifutboljv32@gmail.com." +
        (errs.length ? "<small class=\"arr-det\">Detalle: " + esc(errs.join(" · ")) + "</small>" : "") +
        '</span><span class="arr-btns"><button type="button" class="lnk" data-repair>Reparar</button></span>';
    }
    m.innerHTML = '<div class="message arr-aviso" role="alert">' + h + "</div>";
    try {
      m.scrollIntoView({ block: "center" });
    } catch (x) {
      try {
        m.scrollIntoView();
      } catch (y) {}
    }
    return true;
  }
  /* «Reparar» cuando app.js no ha cargado (si ha cargado, lo hace app.js) */
  function reparar() {
    var fin = function () {
      location.replace(location.pathname + "?r=" + new Date().getTime());
    };
    try {
      var p = [];
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations)
        p.push(
          navigator.serviceWorker.getRegistrations().then(function (rs) {
            for (var i = 0; i < rs.length; i++) rs[i].unregister();
          })
        );
      if (window.caches && caches.keys)
        p.push(
          caches.keys().then(function (ks) {
            for (var i = 0; i < ks.length; i++) caches["delete"](ks[i]);
          })
        );
      Promise.all(p).then(fin, fin);
      setTimeout(fin, 3000);
    } catch (e) {
      fin();
    }
  }
  function cerca(el, sel) {
    while (el && el.nodeType === 1) {
      if (el.matches ? el.matches(sel) : el.msMatchesSelector && el.msMatchesSelector(sel)) return el;
      el = el.parentNode;
    }
    return null;
  }
  document.addEventListener(
    "click",
    function (e) {
      if (window.MF_LISTO) return;
      if (cerca(e.target, "[data-repair]")) {
        e.preventDefault();
        e.stopPropagation();
        reparar();
        return;
      }
      if (cerca(e.target, "[data-auth]") && aviso()) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true
  );
  /* Si al terminar de cargar la app no ha arrancado, avisa ya (sin esperar a que pulse «Entrar») */
  window.addEventListener("load", function () {
    setTimeout(function () {
      if (!window.MF_LISTO) aviso();
    }, 1500);
  });
})();
