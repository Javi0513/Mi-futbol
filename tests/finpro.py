import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json,datetime
from playwright.sync_api import sync_playwright
from fake2 import FAKE2
# v11.14 · Aviso 2 días antes de que termine el plan Pro (prueba, suscripción cancelada, club)
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8846),functools.partial(type('Q',(http.server.SimpleHTTPRequestHandler,),{'log_message':lambda *a:None}),directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
CFG=open(os.path.join(APP,'config.js')).read().replace("window.APP_CONFIG = {","window.APP_CONFIG = {noTutorial:true,portalUrl:'https://billing.stripe.com/p/login/test_xyz',")
def iso(**k):return (datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(**k)).strftime('%Y-%m-%dT%H:%M:%SZ')
SHOT=os.environ.get('FINPRO_SHOT')
def abrir(b,perfil,club=None,ctx=None,android=False):
    if ctx is None:
        ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block',device_scale_factor=2 if SHOT else 1)
        if android: ctx.add_init_script("Object.defineProperty(document,'referrer',{get:()=>'android-app://com.monetizaplus.mifutbol/'})")
        ctx.add_init_script('window.__seed='+json.dumps({'futbol_personal_jugadores':[],'futbol_personal_partidos':[],'perfiles':[perfil]}))
    pg=ctx.new_page()
    pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' and 'Failed to load resource' not in m.text else None)
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE2))
    pg.route('**/config.js*',lambda r:r.fulfill(content_type='application/javascript',body=CFG))
    pg.goto('http://127.0.0.1:8846/index.html')
    pg.evaluate("c=>{window.__cfg.rpcData={revisar_prueba_pro:'',mi_club:c}}",club)
    pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto1');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)')
    pg.wait_for_timeout(400)
    return pg
def aviso(pg):
    el=pg.locator('#finPro')
    return el.inner_text() if el.is_visible() else ''
with sync_playwright() as p:
    b=p.chromium.launch()
    # 1) prueba gratis que termina mañana
    pg=abrir(b,{'id':'u1','plan':'pro','prueba_hasta':iso(days=1)})
    t=aviso(pg)
    check('prueba que acaba mañana: sale el aviso','prueba gratis del plan Pro termina mañana' in t,t)
    check('dice que no pierde nada','no pierdes nada' in t)
    check('botón «Seguir con Pro»',pg.locator('#finPro [data-finpro=pro]').count()==1)
    if SHOT: pg.screenshot(path=SHOT)
    pg.click('#finPro [data-finpro=pro]');pg.wait_for_timeout(200)
    check('«Seguir con Pro» abre el plan Pro',not pg.locator('#info').is_hidden() and 'pro' in pg.locator('#infoTitle').inner_text().lower(),pg.locator('#infoTitle').inner_text())
    pg.click('#closeInfo')
    pg.click('#finPro [data-finpro=cerrar]');pg.wait_for_timeout(100)
    check('«Entendido» lo quita',aviso(pg)=='')
    ctx=pg.context;pg.close()
    pg=abrir(b,None,ctx=ctx)
    check('al volver a abrir el mismo día no sale',aviso(pg)=='')
    ctx.close()
    # 2) prueba que acaba en 2 días: sale con la fecha
    pg=abrir(b,{'id':'u1','plan':'pro','prueba_hasta':iso(days=2,hours=-1)})
    t=aviso(pg)
    check('prueba en 2 días: sale con «en 2 días» y la fecha','en 2 días (el ' in t,t)
    pg.context.close()
    # 3) prueba que acaba en 5 días: no sale
    pg=abrir(b,{'id':'u1','plan':'pro','prueba_hasta':iso(days=5)})
    check('prueba en 5 días: sin aviso',aviso(pg)=='')
    pg.context.close()
    # 4) suscripción cancelada que acaba en 1 día: «Reactivar mi suscripción»
    pg=abrir(b,{'id':'u1','plan':'pro','pro_hasta':iso(days=1),'stripe_customer':'cus_1','stripe_estado':'active'})
    t=aviso(pg)
    check('cancelada: aviso «cancelaste la suscripción»','Tu plan Pro termina mañana' in t and 'cancelaste' in t,t)
    check('cancelada: botón «Reactivar mi suscripción»',pg.locator('#finPro a[data-pro-portal]').count()==1)
    pg.context.close()
    # 5) Pro que se renueva solo: sin aviso
    pg=abrir(b,{'id':'u1','plan':'pro','stripe_customer':'cus_1','stripe_estado':'active'})
    check('Pro que se renueva solo: sin aviso',aviso(pg)=='')
    pg.context.close()
    # 6) gratis: sin aviso
    pg=abrir(b,{'id':'u1','plan':'gratis'})
    check('plan gratuito: sin aviso',aviso(pg)=='')
    pg.context.close()
    # 7) tester que ya paga con Stripe: sin aviso de prueba
    pg=abrir(b,{'id':'u1','plan':'pro','prueba_hasta':iso(days=1),'stripe_customer':'cus_1','stripe_estado':'active'})
    check('tester que ya paga: sin aviso',aviso(pg)=='')
    pg.context.close()
    # 8) club cancelado que acaba hoy
    pg=abrir(b,{'id':'u1','plan':'pro','pro_por_club':True},{'nombre':'CD Prueba','activo':True,'soy_admin':False,'pro_hasta':iso(hours=2)})
    t=aviso(pg)
    check('club cancelado: aviso del plan del club','plan Pro de tu club termina' in t and 'encargado' in t,t)
    check('club: sin botón de pago',pg.locator('#finPro .primary').count()==0)
    pg.context.close()
    # 9) Guía de uso explica el aviso
    pg=abrir(b,{'id':'u1','plan':'gratis'})
    pg.click('#acct');pg.wait_for_timeout(200);pg.click('#info [data-info=ayuda]');pg.wait_for_timeout(200)
    check('Guía de uso: explica el aviso','Aviso antes de que termine el Pro' in pg.locator('#infoBody').text_content())
    pg.context.close()
    # 10) v11.17 · Android: el aviso explica cómo seguir con el Pro desde el navegador
    pg=abrir(b,{'id':'u1','plan':'pro','prueba_hasta':iso(days=1)},android=True)
    t=aviso(pg)
    check('Android: sale el aviso de la prueba','prueba gratis del plan Pro termina mañana' in t,t)
    check('Android: explica que se abre en el navegador','navegador' in t and 'Pasar a Pro' in t,t)
    check('Android: sin botón de pago de Stripe',pg.locator('#finPro [data-finpro=pro]').count()==0)
    check('Android: botón «Copiar la dirección»',pg.locator('#finPro [data-finpro=copiar]').count()==1)
    if os.environ.get('FINPRO_SHOT_A'): pg.screenshot(path=os.environ['FINPRO_SHOT_A'])
    pg.context.grant_permissions(['clipboard-read','clipboard-write'])
    pg.click('#finPro [data-finpro=copiar]');pg.wait_for_timeout(200)
    check('Android: copia la dirección',pg.evaluate('navigator.clipboard.readText()').endswith('127.0.0.1:8846'),pg.evaluate('navigator.clipboard.readText()'))
    check('Android: el aviso sigue a la vista tras copiar',aviso(pg)!='')
    pg.context.close()
    # 11) Android, plan gratuito: «Mi cuenta» explica cómo pasar a Pro
    pg=abrir(b,{'id':'u1','plan':'gratis'},android=True)
    pg.click('#acct');pg.wait_for_timeout(300)
    t=pg.locator('#infoBody').inner_text()
    check('Android Mi cuenta: explica cómo pasar a Pro','Desde la app de Android no se puede contratar' in t,t[:200])
    check('Android Mi cuenta: botón copiar',pg.locator('#infoBody [data-finpro=copiar]').count()==1)
    check('Android Mi cuenta: sin botón de Stripe',pg.locator('#infoBody [data-info=pro]').count()==0)
    if os.environ.get('FINPRO_SHOT_B'): pg.screenshot(path=os.environ['FINPRO_SHOT_B'])
    pg.context.close()
    # 12) Web: Mi cuenta sin esa explicación
    pg=abrir(b,{'id':'u1','plan':'gratis'})
    pg.click('#acct');pg.wait_for_timeout(300)
    check('Web Mi cuenta: sin explicación de Android','Desde la app de Android' not in pg.locator('#infoBody').inner_text())
    pg.context.close()
    b.close()
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
sys.exit(0 if all(res) and not errs else 1)
