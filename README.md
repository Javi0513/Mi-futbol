# Mi Fútbol JV32

App web (PWA) para entrenadores: plantilla, partidos, alineaciones, pizarra y estadísticas.
Fútbol 11, Fútbol 7 y Fútbol sala. Plan gratis con límites y plan Pro.

## Estructura
| Archivo | Para qué sirve |
|---|---|
| `index.html` | Estructura de la página y cabecera de seguridad (CSP) |
| `styles.css`, `logo.css` | Estilos (el logo va aparte porque pesa) |
| `app.js` | Toda la lógica de la app |
| `config.js` | **Tus datos** (Supabase, NIF, email legal…). No se sobrescribe al actualizar |
| `sw.js` | Modo sin conexión y actualizaciones |
| `version.json` + `<meta app-version>` | Número de versión. Súbelo en ambos sitios para que aparezca el aviso "Hay una versión nueva" |
| `vendor/supabase.js`, `fonts/` | Librería y letras alojadas aquí (no dependen de terceros) |
| `manifest.webmanifest`, iconos | Instalación como app |
| `supabase-multiusuario.sql` | Se ejecuta en Supabase → SQL Editor (se puede repetir sin riesgo) |

## config.js (ejemplo)
```js
window.APP_CONFIG = {
  supabaseUrl: '...',
  supabaseAnonKey: '...',
  legalNombre: '...', legalNif: '...', legalDir: '...', contactEmail: '...',
  proUrl: '',                 // enlace de pago del plan Pro (Stripe) cuando lo tengas
  turnstileSiteKey: ''        // opcional: clave pública de Cloudflare Turnstile (anti-robots)
};
```

## Nueva versión
Cambia el número en `index.html` (`app-version`), `version.json` y `VERSION` de `sw.js`.
