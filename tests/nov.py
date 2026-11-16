import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json
from playwright.sync_api import sync_playwright
from fake2 import FAKE2
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8814),functools.partial(type('Q',(http.server.SimpleHTTPRequestHandler,),{'log_message':lambda *a:None}),directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
VER=json.load(open(os.path.join(APP,'version.json'),encoding='utf-8'))
SEED="window.__seed={futbol_personal_jugadores:[{id:'j1',user_id:'u1',nombre:'Leo',dorsal:10,modalidad:'f7'}],futbol_personal_partidos:[],perfiles:[{id:'u1',plan:'gratis'}]};"
def abre(b,ctx=None,android=False):
    ctx=ctx or b.new_context(viewport={'width':390,'height':844},service_workers='block')
    pg=ctx.new_page();pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.add_init_script("window.__probarNovedades=true;"+SEED+("Object.defineProperty(document,'referrer',{get:()=>'android-app://com.monetizaplus.mifutbol'});" if android else ""))
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE2))
    entra(pg)
    return ctx,pg
def entra(pg):
    pg.goto('http://127.0.0.1:8814/index.html')
    pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto1');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)')
    pg.wait_for_timeout(1200)
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx,pg=abre(b)
    t=pg.locator('#infoTitle').inner_text() if pg.locator('#info').is_visible() else ''
    check('al entrar tras actualizar salen las novedades',('novedades' in t.lower()) and VER['version'] in t,t)
    body=pg.locator('#infoBody').inner_text()
    check('también siguen las de la v11.26: las novedades explican la app en horizontal y la pizarra',all(w in body for w in ('PARA TODOS','horizontal','Portero','discontinua')),body[:200])
    check('y el tamaño de las fichas','fichas más pequeñas' in body)
    check('v11.27: las novedades explican el mapa de calor y el campograma',all(w in body for w in ('PARA TODOS','Mapa de calor','campograma','toca en el campo')),body[:200])
    check('y la hoja «Mapa» del Excel para Power BI','«Mapa»' in body and 'Power BI' in body)
    check('v11.34: las novedades explican el resumen de cada jugador',all(w in body for w in ('Resumen de cada jugador','familia','3 resúmenes de jugador')),body[:200])
    check('v11.32: las novedades explican la jornada de cada partido',all(w in body for w in ('Jornada de cada partido','Liga','Amistoso','Octavos')),body[:200])
    check('v11.31: novedades: ya en Google Play y valorar la app',all(w in body for w in ('Google Play','valorarla')),body[:200])
    check('v11.28: las novedades explican el código promocional JV32PLAY',all(w in body for w in ('Códigos promocionales','JV32PLAY','sin tarjeta')),body[:200])
    check('v11.30: las novedades explican que el anotador lleva el reloj (descanso)',all(w in body for w in ('anotador','«Descanso»','«Empezar 2ª parte»','«Terminar partido»')),body[:300])
    check('v11.34: las novedades explican el mapa de calor como en Power BI',all(w in body for w in ('mapa de calor, como en Power BI','verde a rayas','azul donde hay pocas')),body[:300])
    check('v11.34: las novedades explican el arreglo del reloj y «Reiniciar reloj»',all(w in body for w in ('Arreglado el reloj del Directo','Reiniciar reloj','Sin empezar')),body[:300])
    check('v11.35: las novedades explican la nueva pantalla de Inicio',all(w in body for w in ('Nueva pantalla de Inicio','Empezar el Directo','primeros pasos')),body[:300])
    check('v11.36: las novedades explican la animación de entrada',all(w in body for w in ('animación de entrada','Saltar')),body[:300])
    check('v11.37: las novedades explican el plan para clubes más claro',all(w in body for w in ('Plan para clubes más claro','todavía no ha pagado','pack más grande')),body[:300])
    check('v11.38: la animación sale también con la sesión iniciada','también si ya tienes la sesión iniciada' in body,body[:300])
    check('v11.39: las novedades explican los tiros desde el anotador',all(w in body for w in ('El anotador ya apunta los tiros','Tiro a puerta','Tiro fuera','2 partidos al mes')),body[:300])
    check('v11.41: las novedades explican la clasificación de la liga',all(w in body for w in ('Nueva clasificación de la liga','Federación Andaluza','web de tu federación','a mano','4 días al mes')),body[:300])
    check('v11.40: las novedades explican el arreglo del partido llevado por el anotador',all(w in body for w in ('Arreglado el partido llevado por el anotador','sin empezar','sin contar nada dos veces')),body[:300])
    pg.click('#info [data-acct=novedades-ok]');pg.wait_for_timeout(200)
    check('«Entendido» las cierra',pg.locator('#info').is_hidden())
    entra(pg)
    check('no vuelven a salir en la misma versión',pg.locator('#info').is_hidden())
    pg.click('#acct');pg.click('#info [data-acct=novedades]');pg.wait_for_timeout(500)
    check('se pueden ver otra vez desde Mi cuenta','novedades' in pg.locator('#infoTitle').inner_text().lower())
    pg.click('#closeInfo');pg.wait_for_timeout(200)
    pg.click('#acct');pg.wait_for_timeout(300)
    check('Mi cuenta muestra el precio anual','3,33 €/mes' in pg.locator('#infoBody').inner_text().lower(),pg.locator('#infoBody').inner_text().replace(chr(10),' | '))
    ctx.close()
    ctx,pg=abre(b,android=True)
    body=pg.locator('#infoBody').inner_text() if pg.locator('#info').is_visible() else ''
    check('en la app de Android también salen las novedades','campograma' in body and 'Portero' in body,body[:80])
    b.close()
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
sys.exit(0 if all(res) and not errs else 1)
