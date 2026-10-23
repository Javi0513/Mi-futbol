import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json
from playwright.sync_api import sync_playwright
from fake2 import FAKE2
# Prueba del plan Pro para testers: aviso al activarse, "modo prueba" en Mi cuenta y aviso al terminar
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8814),functools.partial(type('Q',(http.server.SimpleHTTPRequestHandler,),{'log_message':lambda *a:None}),directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
CFG=open(os.path.join(APP,'config.js')).read().replace("window.APP_CONFIG = {","window.APP_CONFIG = {noTutorial:true,")
def abrir(b,perfil,rpc):
    ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block')
    ctx.add_init_script('window.__seed='+json.dumps({'futbol_personal_jugadores':[],'futbol_personal_partidos':[],'perfiles':[perfil]}))
    pg=ctx.new_page()
    pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE2))
    pg.route('**/config.js*',lambda r:r.fulfill(content_type='application/javascript',body=CFG))
    pg.goto('http://127.0.0.1:8814/index.html')
    pg.evaluate("r=>{window.__cfg.rpcData={revisar_prueba_pro:r}}",rpc)
    pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto1');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)')
    pg.wait_for_timeout(300)
    return pg
fin=__import__('datetime').datetime.utcnow()+__import__('datetime').timedelta(days=15,minutes=-1)
FIN=fin.strftime('%Y-%m-%dT%H:%M:%SZ')
with sync_playwright() as p:
    b=p.chromium.launch()
    # 1) tester que entra por primera vez
    pg=abrir(b,{'id':'u1','plan':'pro','prueba_hasta':FIN},'activada')
    check('se llama a revisar_prueba_pro al entrar',pg.evaluate("window.__calls.some(c=>c[0]==='rpc'&&c[1]==='revisar_prueba_pro')"))
    m=pg.locator('#message').inner_text()
    check('aviso: Pro gratis en modo prueba 15 días','modo prueba' in m and '15 días' in m,m)
    pg.click('#acct');pg.wait_for_timeout(200)
    t=pg.locator('#infoBody').inner_text()
    check('Mi cuenta: "Pro · modo prueba" y días que quedan','Pro · modo prueba' in t and 'quedan 15 días' in t and pg.locator('#info .pro-fin').count()==1,t[:200])
    pg.context.close()
    # 2) prueba terminada
    pg=abrir(b,{'id':'u1','plan':'gratis'},'terminada')
    m=pg.locator('#message').inner_text()
    check('aviso: la prueba ha terminado','prueba del plan Pro ha terminado' in m,m)
    pg.click('#acct');pg.wait_for_timeout(200)
    t=pg.locator('#infoBody').inner_text()
    check('Mi cuenta: plan Gratuito sin modo prueba','Gratuito' in t and 'modo prueba' not in t)
    pg.context.close()
    # 3) usuario Pro normal (sin prueba): sin avisos
    pg=abrir(b,{'id':'u1','plan':'pro'},'')
    pg.click('#acct');pg.wait_for_timeout(200)
    t=pg.locator('#infoBody').inner_text()
    check('Pro de pago: "Pro · sin límites" y sin modo prueba','Pro · sin límites' in t and 'modo prueba' not in t)
    pg.context.close()
    # 4) tester que se suscribió con Stripe durante la prueba: ya no sale "modo prueba"
    pg=abrir(b,{'id':'u1','plan':'pro','prueba_hasta':FIN,'stripe_customer':'cus_1'},'')
    pg.click('#acct');pg.wait_for_timeout(200)
    check('tester que ya paga: sin modo prueba','modo prueba' not in pg.locator('#infoBody').inner_text())
    pg.context.close()
    b.close()
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
