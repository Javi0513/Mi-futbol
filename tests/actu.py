import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json
from playwright.sync_api import sync_playwright
from fake2 import FAKE2
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8815),functools.partial(type('Q',(http.server.SimpleHTTPRequestHandler,),{'log_message':lambda *a:None}),directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
VER=json.load(open(os.path.join(APP,'version.json'),encoding='utf-8'))['version']
with sync_playwright() as p:
    b=p.chromium.launch()
    def abre(guardado):
        ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block');pg=ctx.new_page()
        pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.add_init_script("window.__probarActualiza=true;"+("" if guardado is None else "if(!sessionStorage.getItem('x')){sessionStorage.setItem('x','1');localStorage.setItem('%s','8.0');}"%guardado))
        pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE2))
        pg.goto('http://127.0.0.1:8815/index.html');pg.wait_for_timeout(600);return ctx,pg
    ctx,pg=abre(None)
    check('primera vez: no sale «Actualizando»',pg.locator('#actu').count()==0)
    ctx.close()
    ctx,pg=abre('mf_version_abierta')
    t=pg.locator('#actu').inner_text() if pg.locator('#actu').count() else ''
    check('versión nueva: sale «Actualizando…»','actualizando' in t.lower() and VER in t,t.replace(chr(10),' | '))
    pg.screenshot(path=OUT+'/actu-1.png')
    pg.wait_for_timeout(1700)
    t=pg.locator('#actu').inner_text() if pg.locator('#actu').count() else ''
    check('luego dice «¡App actualizada!»','actualizada' in t.lower(),t.replace(chr(10),' | '))
    pg.screenshot(path=OUT+'/actu-2.png')
    pg.wait_for_timeout(2200)
    check('y se quita solo',pg.locator('#actu').count()==0)
    pg.reload();pg.wait_for_timeout(600)
    check('no vuelve a salir en la misma versión',pg.locator('#actu').count()==0)
    ctx.close()
    ctx,pg=abre('mf_novedades_visto')
    check('quien venía de la 8.7 (sin la marca nueva) también lo ve',pg.locator('#actu').count()==1)
    ctx.close()
    b.close()
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
sys.exit(0 if all(res) and not errs else 1)
