import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *

import http.server,threading,functools,sys,io,base64
pass
from playwright.sync_api import sync_playwright
from fake2 import FAKE2
from PIL import Image
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8804),functools.partial(http.server.SimpleHTTPRequestHandler,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
im=Image.new('RGB',(400,400),(200,120,40))
for x in range(400):
    for y in range(400):
        if (x-200)**2+(y-170)**2<90**2: im.putpixel((x,y),(240,200,170))
buf=io.BytesIO();im.save(buf,'JPEG',quality=70);foto='data:image/jpeg;base64,'+base64.b64encode(buf.getvalue()).decode()
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
with sync_playwright() as p:
    b=p.chromium.launch();ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block');pg=ctx.new_page()
    pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE2))
    pg.goto('http://127.0.0.1:8804/index.html')
    pg.evaluate("f=>{window.__db.futbol_personal_jugadores.push({id:'z1',modalidad:'fs',nombre:'Pedro',foto:f})}",foto)
    pg.fill('input[name=email]','c@x.es');pg.fill('input[name=password]','secreto1');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)')
    pg.click('[data-mode="fs"]');pg.wait_for_timeout(400)
    pg.screenshot(path='plantilla_fs.png')
    pg.click('#view img.avatar.zoomable');pg.wait_for_timeout(300)
    check('foto ampliada abre',pg.locator('#zoom img').count()==1)
    bb=pg.locator('#zoom img').bounding_box();check('foto grande (>250px)',bb['width']>250,bb)
    pg.screenshot(path='zoom.png');pg.keyboard.press('Escape');check('Escape cierra',pg.locator('#zoom').count()==0)
    pg.click('[data-tab=pizarra]');pg.wait_for_selector('#bfield');pg.wait_for_timeout(400)
    check('campo fs tiene clase fs',pg.locator('#bfield.fs').count()==1 and pg.locator('#bfield .pen').count()==2)
    pg.locator('#bfield').scroll_into_view_if_needed();pg.screenshot(path='pizarra_fs.png')
    pg.click('[data-mode="7"]');pg.click('[data-tab=pizarra]');pg.wait_for_timeout(300)
    check('campo f7 sin clase fs',pg.locator('#bfield.fs').count()==0 and pg.locator('#bfield .six').count()==2)
    b.close()
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
