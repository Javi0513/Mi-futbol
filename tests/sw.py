import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,sys
pass
from playwright.sync_api import sync_playwright
from fake2 import FAKE2
import json;VER=json.load(open(APP+'/version.json'))['version']
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8801),functools.partial(http.server.SimpleHTTPRequestHandler,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
with sync_playwright() as p:
    b=p.chromium.launch();ctx=b.new_context(viewport={'width':390,'height':844},service_workers='allow')
    pg=ctx.new_page();pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE2))
    pg.goto('http://localhost:8801/index.html');pg.wait_for_selector('#login')
    pg.wait_for_function("navigator.serviceWorker.ready.then(()=>true)",timeout=10000);pg.wait_for_timeout(1500)
    names=pg.evaluate("caches.keys()");check('caché creada con versión',names==['jv32-'+VER],names)
    n=pg.evaluate("caches.open('jv32-"+VER+"').then(c=>c.keys()).then(k=>k.length)");check('archivos guardados (>=20)',n>=20,n)
    pg.reload();pg.wait_for_timeout(800)
    check('el SW controla la página',pg.evaluate("!!navigator.serviceWorker.controller"))
    ctx.set_offline(True)
    pg.goto('http://localhost:8801/index.html');pg.wait_for_timeout(800)
    check('SIN INTERNET: la pantalla de acceso abre',pg.locator('#login h1').count()==1 and 'JV32' in pg.locator('#login h1').inner_text())
    st=pg.evaluate("getComputedStyle(document.querySelector('.mark.xl')).backgroundImage.slice(0,20)");check('SIN INTERNET: logo y estilos cargan',st.startswith('url('),st)
    ok=pg.evaluate("document.fonts.load(\"700 20px 'Barlow Condensed'\").then(f=>f.length>0)");check('SIN INTERNET: letra local disponible',ok)
    ctx.set_offline(False)
    # turnstile
    ctx2=b.new_context(service_workers='block');p2=ctx2.new_page()
    p2.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE2))
    p2.route('**/config.js',lambda r:r.fulfill(content_type='application/javascript',body="window.APP_CONFIG={supabaseUrl:'https://x.supabase.co',supabaseAnonKey:'k',turnstileSiteKey:'1x00000000000000000000AA'}"))
    p2.route('https://challenges.cloudflare.com/**',lambda r:r.fulfill(content_type='application/javascript',body="window.turnstile={render:(el,o)=>{setTimeout(()=>o.callback('TOK123'),50);return 'w1'},reset:()=>{}}"))
    p2.on('pageerror',lambda e:errs.append(str(e)))
    p2.goto('http://127.0.0.1:8801/index.html');p2.wait_for_timeout(600)
    check('con turnstileSiteKey aparece el hueco del captcha',p2.locator('#captcha:not(.hidden)').count()==1)
    p2.evaluate("window.__auth=[];const o=window.supabase.createClient;")
    check('sin turnstileSiteKey NO aparece captcha',pg.locator('#captcha.hidden').count()==1)
    b.close()
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
