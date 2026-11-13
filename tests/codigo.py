import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json
from playwright.sync_api import sync_playwright
from fake2 import FAKE2
# Códigos promocionales (v11.28): Mi cuenta › «Tengo un código promocional» → canjear_codigo → Pro en modo prueba
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8814),functools.partial(type('Q',(http.server.SimpleHTTPRequestHandler,),{'log_message':lambda *a:None}),directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
CFG=open(os.path.join(APP,'config.js')).read().replace("window.APP_CONFIG = {","window.APP_CONFIG = {noTutorial:true,")
FIN=(__import__('datetime').datetime.utcnow()+__import__('datetime').timedelta(days=7,minutes=-1)).strftime('%Y-%m-%dT%H:%M:%SZ')
RPC="""fin=>{window.__cfg.rpcData={revisar_prueba_pro:'',canjear_codigo:(a)=>{
  if(a.p_codigo==='JV32PLAY'){window.__db.perfiles[0].plan='pro';window.__db.perfiles[0].prueba_hasta=fin;return {r:'ok',hasta:fin,dias:7}}
  if(a.p_codigo==='VIEJO')return {r:'caducado'};
  if(a.p_codigo==='CAIDO')return {__error:'network'};
  return {r:'no_existe'}}}}"""
def abrir(b,perfil,android=False):
    ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block')
    ctx.add_init_script('window.__seed='+json.dumps({'futbol_personal_jugadores':[],'futbol_personal_partidos':[],'perfiles':[perfil]})+(";Object.defineProperty(document,'referrer',{get:()=>'android-app://com.monetizaplus.mifutbol'});" if android else ""))
    pg=ctx.new_page()
    pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE2))
    pg.route('**/config.js*',lambda r:r.fulfill(content_type='application/javascript',body=CFG))
    pg.goto('http://127.0.0.1:8814/index.html')
    pg.evaluate(RPC,FIN)
    pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto1');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)')
    pg.wait_for_timeout(300)
    if pg.locator('#info').is_visible():pg.click('#closeInfo')
    return pg
def msg(pg):return pg.locator('#codMsg').inner_text()
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=abrir(b,{'id':'u1','plan':'gratis'})
    pg.click('#acct');pg.wait_for_timeout(200)
    check('Mi cuenta (gratis) tiene «Tengo un código promocional»',pg.locator('#info [data-info=codigo]').count()==1)
    pg.click('#info [data-info=codigo]');pg.wait_for_timeout(150)
    check('se abre la pantalla del código',pg.locator('#infoTitle').text_content()=='Código promocional' and pg.locator('#codPro').count()==1)
    check('explica que es sin tarjeta','sin tarjeta' in pg.locator('#infoBody').inner_text())
    pg.click('#info [data-acct=codigo-canjear]');pg.wait_for_timeout(150)
    check('sin código pide escribirlo','Escribe el código' in msg(pg),msg(pg))
    pg.fill('#codPro','nada');pg.click('#info [data-acct=codigo-canjear]');pg.wait_for_timeout(200)
    check('código que no existe: lo dice','no existe' in msg(pg),msg(pg))
    pg.fill('#codPro','viejo');pg.press('#codPro','Enter');pg.wait_for_timeout(200)
    check('con Enter también canjea; código caducado: lo dice','caducado' in msg(pg),msg(pg))
    pg.fill('#codPro','caido');pg.click('#info [data-acct=codigo-canjear]');pg.wait_for_timeout(200)
    check('sin conexión: lo dice y no rompe','conexión' in msg(pg),msg(pg))
    pg.fill('#codPro',' jv32 play ');pg.click('#info [data-acct=codigo-canjear]');pg.wait_for_timeout(400)
    check('manda el código en mayúsculas y sin espacios',pg.evaluate("window.__calls.some(c=>c[0]==='rpc'&&c[1]==='canjear_codigo'&&c[2].p_codigo==='JV32PLAY')"))
    m=pg.locator('#message').inner_text()
    check('aviso: código canjeado, Pro gratis hasta…','Código canjeado' in m and 'Pro gratis hasta' in m,m)
    t=pg.locator('#infoBody').inner_text()
    check('Mi cuenta: «Pro · modo prueba» y quedan 7 días','Pro · modo prueba' in t and 'quedan 7 días' in t,t[:200])
    check('ya no sale el botón del código',pg.locator('#info [data-info=codigo]').count()==0)
    check('en la prueba sale «Seguir con Pro» y no «Gestionar o cancelar»',pg.locator('#info [data-info=pro]').count()==1 and pg.locator('#info [data-pro-portal]').count()==0)
    pg.context.close()
    pg=abrir(b,{'id':'u1','plan':'gratis'})
    pg.evaluate("window.__cfg.rpcData.canjear_codigo={r:'ya_usado'}")
    pg.click('#acct');pg.click('#info [data-info=codigo]');pg.fill('#codPro','JV32PLAY');pg.click('#info [data-acct=codigo-canjear]');pg.wait_for_timeout(200)
    check('código ya usado por esa cuenta: lo dice','una vez' in msg(pg),msg(pg))
    pg.context.close()
    pg=abrir(b,{'id':'u1','plan':'gratis'},android=True)
    pg.click('#acct');pg.wait_for_timeout(200)
    check('en la app de Android también sale el botón',pg.locator('#info [data-info=codigo]').count()==1)
    pg.context.close()
    pg=abrir(b,{'id':'u1','plan':'pro'})
    pg.click('#acct');pg.wait_for_timeout(200)
    check('con Pro no sale el botón del código',pg.locator('#info [data-info=codigo]').count()==0)
    pg.context.close()
    b.close()
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
