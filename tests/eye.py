import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,sys
pass
from playwright.sync_api import sync_playwright
from fake2 import FAKE2
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8806),functools.partial(http.server.SimpleHTTPRequestHandler,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
res=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_context(viewport={'width':390,'height':844},service_workers='block').new_page()
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE2))
    pg.goto('http://127.0.0.1:8806/index.html')
    pg.fill('input[name=password]','secreto1');t=lambda:pg.get_attribute('input[name=password]','type')
    check('empieza oculta',t()=='password')
    pg.click('.pw .eye');check('ojo muestra',t()=='text' and pg.input_value('input[name=password]')=='secreto1')
    check('aria-pressed true',pg.get_attribute('.pw .eye','aria-pressed')=='true')
    pg.click('.pw .eye');check('ojo oculta',t()=='password')
    pg.click('[data-am=signup]');pg.wait_for_timeout(200)
    vis=pg.locator('[data-f=pw2] .eye');check('en crear cuenta hay 2 ojos visibles',vis.is_visible())
    pg.fill('input[name=password2]','abc');vis.click();check('2º ojo muestra',pg.get_attribute('input[name=password2]','type')=='text')
    check('el ojo no envía el formulario',pg.locator('#auth').count()==1 and pg.locator('#login:not(.hidden)').count()==1)
    pg.screenshot(path='eye.png')
    b.close()
print('PASS' if all(res) else 'FAIL',sum(res),'/',len(res))
