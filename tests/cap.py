import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,sys,io,random
pass
from playwright.sync_api import sync_playwright
from fake2 import FAKE2
from PIL import Image
APP=APP+''
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8802),functools.partial(http.server.SimpleHTTPRequestHandler,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
WRAP=FAKE2+"""
;(()=>{const o=window.supabase.createClient;window.supabase.createClient=(...a)=>{const c=o(...a);const li=c.auth.signInWithPassword;c.auth.signInWithPassword=(x)=>{window.__la=JSON.stringify(x);return li(x)};const su=c.auth.signUp;c.auth.signUp=(x)=>{window.__sa=JSON.stringify(x);return su(x)};return c}})();"""
# imagen ruidosa grande (peor caso para el tamaño)
im=Image.frombytes('RGB',(1600,1200),bytes(random.getrandbits(8) for _ in range(1600*1200*3)));im.save(OUT+'/ruido.jpg',quality=95)
with sync_playwright() as p:
    b=p.chromium.launch();ctx=b.new_context(service_workers='block');pg=ctx.new_page();pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=WRAP))
    pg.route('**/config.js',lambda r:r.fulfill(content_type='application/javascript',body="window.APP_CONFIG={supabaseUrl:'https://x.supabase.co',supabaseAnonKey:'k',turnstileSiteKey:'1x00000000000000000000AA',noTutorial:true}"))
    pg.route('https://challenges.cloudflare.com/**',lambda r:r.fulfill(content_type='application/javascript',body="window.turnstile={render:(el,o)=>{setTimeout(()=>o.callback('TOK123'),50);return 'w1'},reset:()=>{}}"))
    pg.goto('http://127.0.0.1:8802/index.html');pg.wait_for_timeout(500)
    pg.fill('input[name=email]','c@x.es');pg.fill('input[name=password]','secreto1');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)')
    la=pg.evaluate('window.__la');check('login envía captchaToken',"TOK123" in la,la)
    # foto grande -> jugador nuevo
    pg.click('[data-mode="11"]') if pg.locator('[data-mode="11"]').count() else None
    pg.wait_for_timeout(200)
    pg.click('[data-action=add-player]');pg.wait_for_selector('#playerForm')
    pg.fill('#playerForm input[name=nombre]','Ruido');pg.set_input_files('#playerForm input[name=foto]',OUT+'/ruido.jpg')
    pg.click('#playerForm .primary');pg.wait_for_timeout(2500)
    L=pg.evaluate("(window.__db.futbol_personal_jugadores.find(x=>x.nombre==='Ruido')||{foto:''}).foto.length")
    check('foto ruidosa guardada y por debajo de 85.000',0<L<=85000,L)
    b.close()
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
