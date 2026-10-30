import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json
from playwright.sync_api import sync_playwright
from fake2 import FAKE2
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8814),functools.partial(type('Q',(http.server.SimpleHTTPRequestHandler,),{'log_message':lambda *a:None}),directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
VER=json.load(open(os.path.join(APP,'version.json'),encoding='utf-8'))
SEED="window.__seed={futbol_personal_jugadores:[{id:'j1',user_id:'u1',nombre:'Leo',dorsal:10,modalidad:'f7'}],futbol_personal_partidos:[],perfiles:[{id:'u1',plan:'gratis'}]};"
def abre(b,ctx=None,android=False):
    ctx=ctx or b.new_context(viewport={'width':390,'height':844},service_workers='block')
    pg=ctx.new_page();pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.add_init_script("window.__probarNovedades=true;"+SEED+("Object.defineProperty(document,'referrer',{get:()=>'android-app://com.monetizaplus.mifutbol'});" if android else ""))
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE2))
    entra(pg)
    return ctx,pg
def entra(pg):
    pg.goto('http://127.0.0.1:8814/index.html')
    pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto1');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)')
    pg.wait_for_timeout(1200)
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx,pg=abre(b)
    t=pg.locator('#infoTitle').inner_text() if pg.locator('#info').is_visible() else ''
    check('al entrar tras actualizar salen las novedades',('novedades' in t.lower()) and VER['version'] in t,t)
    body=pg.locator('#infoBody').inner_text()
    check('las novedades explican el color de los jugadores','color' in body.lower())
    pg.click('#info [data-acct=novedades-ok]');pg.wait_for_timeout(200)
    check('«Entendido» las cierra',pg.locator('#info').is_hidden())
    entra(pg)
    check('no vuelven a salir en la misma versión',pg.locator('#info').is_hidden())
    pg.click('#acct');pg.click('#info [data-acct=novedades]');pg.wait_for_timeout(500)
    check('se pueden ver otra vez desde Mi cuenta','novedades' in pg.locator('#infoTitle').inner_text().lower())
    pg.click('#closeInfo');pg.wait_for_timeout(200)
    pg.click('#acct');pg.wait_for_timeout(300)
    check('Mi cuenta muestra el precio anual','39,99 €/año' in pg.locator('#infoBody').inner_text().lower(),pg.locator('#infoBody').inner_text().replace(chr(10),' | '))
    ctx.close()
    ctx,pg=abre(b,android=True)
    body=pg.locator('#infoBody').inner_text() if pg.locator('#info').is_visible() else ''
    check('en la app de Android no se habla del precio',body and '39,99' not in body and '€' not in body,body[:80])
    b.close()
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
sys.exit(0 if all(res) and not errs else 1)
