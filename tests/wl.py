import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,sys
pass
from playwright.sync_api import sync_playwright
from fake2 import FAKE2
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8809),functools.partial(http.server.SimpleHTTPRequestHandler,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
F=FAKE2.replace("window.__db=window.__seed||{","window.__db=window.__seed||{interesados_pro:[],")
with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_context(viewport={'width':390,'height':844},service_workers='block').new_page()
    pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=F))
    pg.goto('http://127.0.0.1:8809/index.html')
    pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto1');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)')
    pg.click('#acct');pg.click('#info [data-info=pro]');pg.wait_for_selector('#wl')
    check('botón visible con el email',pg.locator('#wl').text_content()=='Avísame cuando esté disponible' and 'ana@x.es' in pg.locator('#wlmsg').inner_text())
    pg.screenshot(path='wl.png')
    pg.click('#wl');pg.wait_for_timeout(300)
    check('se guarda 1 interesado con su email',pg.evaluate("window.__db.interesados_pro.length")==1 and pg.evaluate("window.__db.interesados_pro[0].email")=='ana@x.es')
    check('botón pasa a "Estás en la lista"',pg.locator('#wl').is_disabled() and 'lista' in pg.locator('#wl').text_content())
    pg.click('#closeInfo');pg.click('#acct');pg.click('#info [data-info=pro]');pg.wait_for_timeout(400)
    check('al reabrir sigue apuntado',pg.locator('#wl').is_disabled())
    b.close()
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
