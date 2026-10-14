import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,sys,re
pass
from playwright.sync_api import sync_playwright
from fake2 import FAKE2
R=fresh_copy()+os.sep
import json
CUR=json.load(open(R+'version.json'))['version'];NEW='999.0'
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control','max-age=600');super().end_headers()   # como GitHub Pages
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8808),functools.partial(H,directory=R));threading.Thread(target=srv.serve_forever,daemon=True).start()
res=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
with sync_playwright() as p:
    b=p.chromium.launch();ctx=b.new_context(viewport={'width':390,'height':844},service_workers='allow');pg=ctx.new_page()
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE2))
    pg.goto('http://localhost:8808/index.html');pg.wait_for_function("navigator.serviceWorker.ready.then(()=>true)");pg.wait_for_timeout(1500)
    pg.reload();pg.wait_for_timeout(800)
    check('versión instalada '+CUR,pg.evaluate("document.querySelector('meta[name=app-version]').content")==CUR and pg.evaluate("window.__marker")is None)
    # "publico" la 7.7
    f=lambda n:open(R+n).read()
    w=lambda n,fn:(lambda c:open(R+n,'w').write(fn(c)))(f(n))
    w('index.html',lambda c:c.replace('content="'+CUR+'"','content="'+NEW+'"').replace('?v='+CUR,'?v='+NEW))
    open(R+'version.json','w').write('{"version": "'+NEW+'", "notas": "Arreglo de prueba"}')
    w('sw.js',lambda c:c.replace('"'+CUR+'"','"'+NEW+'"'))
    w('app.js',lambda c:c+'\nwindow.__marker="nuevo";\n')
    pg.evaluate("(()=>{const n=Date.now();Date.now=()=>n+700000})()");pg.evaluate("window.dispatchEvent(new Event('focus'))");pg.wait_for_timeout(1200)
    check('la app abierta avisa de la nueva versión',pg.locator('#upd').count()==1 and 'Arreglo de prueba' in pg.locator('#upd').inner_text())
    pg.click('#upd button');pg.wait_for_url('**?v='+NEW);pg.wait_for_load_state('load');pg.wait_for_timeout(1500)
    
    check('tras Actualizar ya corre el código nuevo',pg.evaluate("window.__marker")=='nuevo' and pg.evaluate("document.querySelector('meta[name=app-version]').content")==NEW)
    check('desaparece el aviso',pg.locator('#upd').count()==0)
    pg.wait_for_timeout(1500);names=pg.evaluate("caches.keys()");check('caché renovada',names==['jv32-'+NEW],names)
    b.close()
print('PASS' if all(res) else 'FAIL',sum(res),'/',len(res))
