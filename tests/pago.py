import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools
from playwright.sync_api import sync_playwright
from fake2 import FAKE2
# Pago del plan Pro con Stripe: enlace con el usuario, activación al volver, y sin pago dentro de la app Android
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8812),functools.partial(type('Q',(http.server.SimpleHTTPRequestHandler,),{'log_message':lambda *a:None}),directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
CFG=open(os.path.join(APP,'config.js')).read().replace("window.APP_CONFIG = {","window.APP_CONFIG = {proUrl:'https://buy.stripe.com/test_abc',portalUrl:'https://billing.stripe.com/p/login/test_xyz',")
def abrir(b,android=False,prueba=True):
    ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block')
    if android: ctx.add_init_script("Object.defineProperty(document,'referrer',{get:()=>'android-app://com.monetizaplus.mifutbol/'})")
    pg=ctx.new_page()
    pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE2))
    pg.route('**/config.js*',lambda r:r.fulfill(content_type='application/javascript',body=CFG))
    pg.goto('http://127.0.0.1:8812/index.html'+('?probarpago' if prueba else ''))
    pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto1');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)')
    return pg
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=abrir(b)
    pg.click('#acct');pg.click('#info [data-info=pro]');pg.wait_for_selector('[data-pro-pay]')
    href=pg.get_attribute('[data-pro-pay]','href')
    check('enlace de pago lleva el usuario y el email',href.startswith('https://buy.stripe.com/test_abc?client_reference_id=u1&prefilled_email=ana%40x.es'),href)
    col=pg.evaluate("(()=>{let a=document.querySelector('[data-pro-pay]'),s=getComputedStyle(a);return [s.color,s.backgroundColor]})()")
    check('texto del botón de pago visible (no del color del fondo)',col[0]!=col[1],str(col))
    check('se ve el precio',pg.locator('#info .price').count()==1)
    pg.evaluate("document.querySelector('[data-pro-pay]').addEventListener('click',e=>e.preventDefault(),{once:true})")
    pg.click('[data-pro-pay]')
    pg.evaluate("window.__db.perfiles[0].plan='pro'")
    pg.evaluate("Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'visible'});document.dispatchEvent(new Event('visibilitychange'))")
    pg.wait_for_timeout(800)
    check('al volver del pago se activa el Pro',pg.locator('#info').is_hidden() and 'Pro activado' in pg.locator('#message').inner_text())
    pg.click('#acct');pg.wait_for_timeout(200)
    t=pg.locator('#infoBody').inner_html()
    check('Mi cuenta: plan Pro y enlace para gestionar',"Pro · sin límites" in t and 'billing.stripe.com/p/login/test_xyz?prefilled_email=ana%40x.es' in t and 'data-info="pro"' not in t)
    check('Mi cuenta: sin aviso de fin si no ha cancelado',pg.locator('#info .pro-fin').count()==0)
    # cancela en el portal de Stripe: el webhook guarda pro_hasta y, al volver, Mi cuenta muestra la fecha
    pg.evaluate("document.querySelector('[data-pro-portal]').addEventListener('click',e=>e.preventDefault(),{once:true})")
    pg.click('[data-pro-portal]')
    pg.evaluate("window.__db.perfiles[0].pro_hasta='2026-11-20T19:00:00Z'")
    pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
    pg.wait_for_timeout(800)
    t=pg.locator('#info .pro-fin').inner_text() if pg.locator('#info .pro-fin').count() else ''
    check('tras cancelar: "activo hasta el 20 de noviembre de 2026"','activo hasta el 20 de noviembre de 2026' in t,t)
    pg.context.close()
    pg=abrir(b,android=True)
    pg.click('#acct');pg.wait_for_timeout(200)
    check('Android: sin botón "Pasar a Pro"',pg.locator('#info [data-info=pro]').count()==0)
    # el aviso de límite (lo abre el servidor con LIMITE_PLAN): se simula insertando su botón dentro de #info
    pg.evaluate("document.querySelector('#infoBody').insertAdjacentHTML('beforeend','<button id=tpro data-info=pro>x</button>')")
    pg.click('#tpro');pg.wait_for_timeout(200)
    check('Android: aviso Pro sin precio ni botón de pago',pg.locator('#info [data-pro-pay]').count()==0 and pg.locator('#info .price').count()==0 and pg.locator('#wl').count()==0)
    pg.context.close()
    pg=abrir(b,prueba=False)
    pg.click('#acct');pg.click('#info [data-info=pro]');pg.wait_for_timeout(300)
    check('enlace de prueba oculto sin ?probarpago (sale la lista de espera)',pg.locator('[data-pro-pay]').count()==0 and pg.locator('#wl').count()==1)
    pg.context.close()
    b.close()
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
