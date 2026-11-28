import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools
from playwright.sync_api import sync_playwright
from fake2 import FAKE2
# v11.70: en una tablet Android con Chrome / WebView antiguo la app no arrancaba y al pulsar «Entrar» no pasaba nada.
# arranque.js (ES5) avisa en pantalla: navegador antiguo → actualizar Chrome y WebView; otro fallo → «Reparar».
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8817),functools.partial(type('Q',(http.server.SimpleHTTPRequestHandler,),{'log_message':lambda *a:None}),directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
res=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
TAB_UA='Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.162 Safari/537.36'
VIEJO="try{delete String.prototype.replaceAll;delete Promise.any;}catch(e){}"
ROTO='window.__roto = a ?. ?. b;'  # error de sintaxis, como le pasa a un Chrome viejo con el código nuevo
def abre(b,ua=None,init='',roto=False,w=1138,h=712):
    ctx=b.new_context(viewport={'width':w,'height':h},user_agent=ua,service_workers='block',has_touch=True)
    pg=ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    if init:pg.add_init_script(init)
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=ROTO if roto else FAKE2))
    if roto:pg.route('**/app.js*',lambda r:r.fulfill(content_type='application/javascript',body=ROTO))
    pg.goto('http://127.0.0.1:8817/index.html');pg.wait_for_timeout(400)
    return ctx,pg,errs
def en_pantalla(pg,sel):
    return pg.evaluate("s=>{const r=document.querySelector(s).getBoundingClientRect();return r.height>0&&r.top>=0&&r.bottom<=innerHeight}",sel)
with sync_playwright() as p:
    b=p.chromium.launch()
    # 1) Navegador al día: todo como siempre
    ctx,pg,errs=abre(b)
    check('la app carga arranque.js antes que nada',pg.evaluate("[...document.scripts].map(s=>s.src.split('/').pop().split('?')[0])")[:2]==['arranque.js','supabase.js'])
    check('con un navegador al día la app marca que está lista',pg.evaluate('window.MF_LISTO===true'))
    pg.wait_for_timeout(2200)
    check('y no sale ningún aviso de arranque',pg.locator('#loginmsg .arr-aviso').count()==0)
    pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto1');pg.click('[data-auth=login]')
    try:pg.wait_for_selector('#app:not(.hidden)',timeout=5000);ok=True
    except Exception:ok=False
    check('se entra con email y contraseña como siempre',ok)
    check('sin errores',not errs,errs)
    ctx.close()
    # 2) Tablet Android apaisada con Chrome viejo: la app no arranca → aviso claro, no «no pasa nada»
    ctx,pg,errs=abre(b,ua=TAB_UA,init=VIEJO,roto=True)
    pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto1')
    pg.evaluate("window.scrollTo(0,document.body.scrollHeight)")
    pg.click('[data-auth=login]');pg.wait_for_timeout(600)
    t=pg.locator('#loginmsg').inner_text()
    check('Chrome viejo: al pulsar «Entrar» sale el aviso «navegador antiguo»','navegador antiguo' in t and 'Chrome 80' in t,t)
    check('dice que actualice Google Chrome y Android System WebView',all(w in t for w in ('Play Store','Google Chrome','Android System WebView','reinicia')))
    check('con botón «Actualizar Chrome» a Play Store',pg.locator('#loginmsg a[href*="id=com.android.chrome"]').count()==1)
    check('y botón «Actualizar WebView»',pg.locator('#loginmsg a[href*="id=com.google.android.webview"]').count()==1)
    check('el aviso se ve en la pantalla (tablet apaisada)',en_pantalla(pg,'#loginmsg .arr-aviso'))
    ctx.close()
    # sin pulsar nada, al terminar de cargar ya avisa
    ctx,pg,errs=abre(b,ua=TAB_UA,init=VIEJO,roto=True)
    pg.wait_for_timeout(2300)
    check('Chrome viejo: el aviso sale solo al abrir, sin pulsar «Entrar»','navegador antiguo' in pg.locator('#loginmsg').inner_text())
    ctx.close()
    # 3) Navegador al día pero app.js no carga: «Reparar» con el detalle del fallo
    ctx,pg,errs=abre(b,roto=True)
    pg.click('[data-auth=login]');pg.wait_for_timeout(500)
    t=pg.locator('#loginmsg').inner_text()
    check('si falla un archivo, sale «La app no ha terminado de cargar»','no ha terminado de cargar' in t and 'mifutboljv32@gmail.com' in t,t)
    check('con el detalle del fallo para la captura','Detalle:' in t and 'app.js' in t,t)
    pg.click('#loginmsg [data-repair]');pg.wait_for_timeout(1200)
    check('«Reparar» funciona aunque app.js no haya cargado (recarga la app)','?r=' in pg.url,pg.url)
    ctx.close()
    # 4) Tablet apaisada con el teclado abierto: el aviso de contraseña mal se ve
    ctx,pg,errs=abre(b,ua=TAB_UA,w=1138,h=380)
    pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','mala')
    pg.evaluate("window.scrollTo(0,document.body.scrollHeight)")
    pg.click('[data-auth=login]');pg.wait_for_timeout(900)
    check('tablet apaisada con teclado: el aviso de email/contraseña se ve en pantalla',pg.locator('#loginmsg .message').count()==1 and en_pantalla(pg,'#loginmsg .message'),pg.locator('#loginmsg').inner_text())
    ctx.close()
    b.close()
# arranque.js tiene que poder leerlo un navegador antiguo: nada de => ni let/const ni comas finales
src=open(os.path.join(REPO,'arranque.js'),encoding='utf-8').read()
import re
code=re.sub(r'/\*.*?\*/','',src,flags=re.S)
check('arranque.js está escrito para navegadores antiguos (sin =>, let, const, `)',not re.search(r'=>|\blet\b|\bconst\b|`',code))
check('y está en la copia sin conexión (sw.js)','"arranque.js"' in open(os.path.join(REPO,'sw.js'),encoding='utf-8').read())
print(f'\n{sum(res)}/{len(res)} OK');sys.exit(0 if all(res) else 1)
