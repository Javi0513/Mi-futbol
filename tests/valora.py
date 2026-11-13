import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json,datetime
from playwright.sync_api import sync_playwright
from fake2 import FAKE2
# v11.29: pedir valoración en Google Play (solo Android) + el pago con Stripe oculto en la app de Android
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8814),functools.partial(type('Q',(http.server.SimpleHTTPRequestHandler,),{'log_message':lambda *a:None}),directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
CFG=open(os.path.join(APP,'config.js')).read().replace("window.APP_CONFIG = {","window.APP_CONFIG = {noTutorial:true,")
real=open(os.path.join(REPO,'config.js'),encoding='utf-8').read()
check('config.js real: pago oculto en Android (norma de Google Play)','ocultarPagoAndroid:true' in real.replace(' ',''))
AND='Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'
IOS='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
hoy=datetime.date.today()
D=[(hoy-datetime.timedelta(days=k)).isoformat() for k in (3,1)]
PART=[{'id':'m1','user_id':'u1','modalidad':'f7','rival':'Los Pinos','fecha':'2026-11-01','gf':2,'gc':1}]
def abrir(b,ua,val,partidos=True,twa=False):
    ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block',user_agent=ua)
    ctx.add_init_script('window.__probarValora=true;window.__seed='+json.dumps({'futbol_personal_jugadores':[],'futbol_personal_partidos':PART if partidos else [],'perfiles':[{'id':'u1','plan':'gratis'}]})+';try{localStorage.setItem("mf_valora",'+json.dumps(json.dumps(val))+')}catch(e){}'+(";Object.defineProperty(document,'referrer',{get:()=>'android-app://com.monetizaplus.mifutbol'});" if twa else ""))
    pg=ctx.new_page()
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE2))
    pg.route('**/config.js*',lambda r:r.fulfill(content_type='application/javascript',body=CFG))
    pg.goto('http://127.0.0.1:8814/index.html')
    pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto1');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)')
    pg.wait_for_timeout(700)
    return pg
def sale(pg):return pg.locator('#info [data-valora=si]').count()==1 and pg.locator('#info').is_visible()
def val(pg):return json.loads(pg.evaluate("localStorage.getItem('mf_valora')") or '{}')
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=abrir(b,AND,{'dias':D},twa=True)
    check('Android, 3er día con partidos: pregunta si quiere valorar',sale(pg))
    href=pg.locator('#info [data-valora=si]').get_attribute('href') or ''
    check('en la app de Android abre la ficha en Play Store','market://details?id=com.monetizaplus.mifutbol'==href,href)
    check('sin premios ni precios en el aviso','gratis' not in pg.locator('#infoBody').inner_text().lower())
    pg.click('#info [data-valora=luego]');pg.wait_for_timeout(150)
    v=val(pg)
    check('«Ahora no» cierra y vuelve a preguntar en 14 días',pg.locator('#info').is_hidden() and v.get('otra',0)>0 and not v.get('hecho'),v)
    pg.context.close()
    pg=abrir(b,AND,{'dias':D,'otra':9e15})
    check('dentro de esos 14 días no pregunta',not sale(pg))
    pg.context.close()
    pg=abrir(b,AND,{'dias':D})
    href=pg.locator('#info [data-valora=si]').get_attribute('href') or ''
    check('en el navegador de Android abre la web de Play','https://play.google.com/store/apps/details?id=com.monetizaplus.mifutbol'==href,href)
    pg.context.close()
    pg=abrir(b,AND,{'dias':D})
    pg.click('#info [data-valora=no]');pg.wait_for_timeout(150)
    check('«No, gracias» no vuelve a preguntar',val(pg).get('hecho')=='no')
    pg.context.close()
    pg=abrir(b,AND,{'dias':[D[1]]})
    check('con solo 2 días de uso aún no pregunta',not sale(pg))
    check('apunta el día de hoy',len(val(pg).get('dias',[]))==2)
    pg.context.close()
    pg=abrir(b,AND,{'dias':D},partidos=False)
    check('sin ningún partido aún no pregunta',not sale(pg))
    pg.context.close()
    pg=abrir(b,IOS,{'dias':D})
    check('en iPhone no pregunta (no hay Google Play)',not sale(pg))
    pg.context.close()
    b.close()
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
