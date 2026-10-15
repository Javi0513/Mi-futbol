import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,sys,re
pass
from playwright.sync_api import sync_playwright
from fake2 import FAKE2
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8798),functools.partial(http.server.SimpleHTTPRequestHandler,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
html=open(APP+'/index.html',encoding='utf-8').read()
with sync_playwright() as p:
    b=p.chromium.launch()
    def mk(newver):
        ctx=b.new_context(viewport={'width':390,'height':844});pg=ctx.new_page()
        pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE2))
        if newver:
            pg.route(re.compile(r'.*/version\.json\?_=.*'),lambda r:r.fulfill(content_type='application/json',body='{"version":"%s","notas":"Novedades: prueba"}'%newver))
        pg.goto('http://127.0.0.1:8798/index.html');return pg
    pg=mk(None);pg.wait_for_timeout(3500)
    check('misma versión: no aparece aviso',pg.locator('#upd').count()==0)
    pg=mk('99.0');pg.wait_for_timeout(3500)
    check('versión nueva en el servidor: aparece aviso',pg.locator('#upd').count()==1 and 'versión nueva' in pg.locator('#upd').inner_text())
    pg.screenshot(path=OUT+'/upd.png')
    check('el aviso muestra las novedades','Novedades: prueba' in pg.locator('#upd').inner_text())
    pg.click('#upd button');pg.wait_for_timeout(1500)
    check('Actualizar recarga con ?v=99.0',('?v=99.0' in pg.url),pg.url)
    b.close()
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
