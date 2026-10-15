/* Service worker de Mi Fútbol JV32.
   - Código (html/js/css/config/version): primero red, para que las actualizaciones lleguen enseguida;
     si no hay conexión, usa la copia guardada (la app abre sin internet).
   - Letras, iconos y librería: primero la copia guardada (no cambian).
   - Las llamadas a Supabase NO se tocan nunca. */
const VERSION = "7.9";
const CACHE = "jv32-" + VERSION;
const SHELL = [
  "./",
  "index.html",
  "styles.css",
  "logo.css",
  "app.js",
  "config.js",
  "version.json",
  "supabase.js",
  "manifest.webmanifest",
  "favicon.png",
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
  "barlow-400.woff2",
  "barlow-500.woff2",
  "barlow-600.woff2",
  "barlow-700.woff2",
  "barlow-condensed-600.woff2",
  "barlow-condensed-700.woff2",
  "barlow-condensed-800.woff2",
];
const NETWORK_FIRST = /\.(html|js|css|json)$|\/$/;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) =>
        Promise.all(
          SHELL.map((u) =>
            fetch(u, { cache: "no-store" })
              .then((r) => r.ok && c.put(u, r))
              .catch(() => {}),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) =>
        Promise.all(
          ks
            .filter((k) => k.startsWith("jv32-") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // Supabase, Cloudflare, etc.: no se tocan
  if (url.pathname.endsWith("/sw.js")) return;
  const networkFirst =
    req.mode === "navigate" || NETWORK_FIRST.test(url.pathname);
  if (networkFirst) {
    e.respondWith(
      fetch(req, { cache: "no-store" })
        .then((r) => {
          if (r.ok) {
            const copy = r.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return r;
        })
        .catch(() =>
          caches
            .match(req, { ignoreSearch: true })
            .then((m) => m || caches.match("index.html")),
        ),
    );
  } else {
    e.respondWith(
      caches.match(req, { ignoreSearch: true }).then(
        (m) =>
          m ||
          fetch(req).then((r) => {
            if (r.ok) {
              const copy = r.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return r;
          }),
      ),
    );
  }
});
