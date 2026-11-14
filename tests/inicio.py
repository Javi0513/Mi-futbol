# Inicio (v11.35): la pantalla que se ve al abrir la app (próximo partido, temporada, accesos, mejores, entrenos).
import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json,datetime
from playwright.sync_api import sync_playwright
from fake2 import FAKE2
FAKE2=FAKE2.replace('order(){return o},','order(){return o},limit(){return o},',1)  # para que detecte la columna de la carga
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8871),functools.partial(type('Q',(http.server.SimpleHTTPRequestHandler,),{'log_message':lambda *a:None}),directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
HOY=datetime.date.today();F=lambda d:(HOY+datetime.timedelta(days=d)).isoformat()
NOM=['Hugo','Leo','Mario','Pablo','Dani','Álex','Iker','Nico','Saúl']
J=[{'id':f'j{i}','owner_id':'u1','modalidad':'7','nombre':n,'dorsal':i+1,'foto':'','created_at':'','equipo_id':'e1'} for i,n in enumerate(NOM)]
def part(g):return json.dumps([{'id':f'j{i}','minutes':50 if i<7 else 20,'goals':g[i] if i<len(g) else 0,'starter':i<7,'st':{'asi':1} if i==4 else {}} for i in range(9)])
M=[]
for k,(r,d,gf,gc,g) in enumerate([('Los Pinos',-6,3,1,[0,0,0,2,1]),('Atlético Sur',-13,2,2,[0,0,0,1,1]),('Real Norte',-20,1,0,[0,0,0,1]),('CD Río',-27,0,1,[])]):
    M.append({'id':f'm{k+1}','owner_id':'u1','modalidad':'7','equipo_id':'e1','fecha':F(d),'rival':r,'participaciones':part(g),'alineacion':json.dumps({'formation':'2-3-1','resultado':{'gf':gf,'gc':gc}}),'created_at':''})
M.append({'id':'m9','owner_id':'u1','modalidad':'7','equipo_id':'e1','fecha':F(1),'rival':'UD Vega','participaciones':'[]','alineacion':json.dumps({'formation':'2-3-1','jornada':{'t':'liga','n':'9'},'conv':{'hora':'10:30','lugar':'Campo Municipal'}}),'created_at':''})
EQ=[{'id':'e1','owner_id':'u1','modalidad':'7','nombre':'CD Alhambra','categoria':'alevin','created_at':'2026-01-01'}]
TR=[{'id':'t1','owner_id':'u1','modalidad':'7','equipo_id':'e1','fecha':F(-2),'hora':'18:30','asistencia':json.dumps({f'j{i}':('si' if i<7 else 'no') for i in range(9)}),'carga':json.dumps({'dur':75,'rpe':{f'j{i}':6 for i in range(7)}}),'created_at':''},
    {'id':'t2','owner_id':'u1','modalidad':'7','equipo_id':'e1','fecha':F(2),'hora':'18:30','asistencia':'{}','carga':None,'created_at':''}]
def seed(plan='gratis',datos=True,live=False):
    d={'perfiles':[{'id':'u1','plan':plan,'nombre':'Luis García','foto':''}]}
    if datos:
        d.update({'futbol_personal_jugadores':J,'futbol_personal_partidos':M,'equipos':EQ,'entrenamientos':TR})
        if live:d['directos']=[{'id':'00000000-0000-4000-8000-000000000001','owner_id':'u1','partido_id':'m9','modalidad':'7','equipo':'CD Alhambra','rival':'UD Vega','gf':2,'gc':1,'estado':'2T','parte_min':35,'acum_ms':0,'desde':None,'eventos':[]}]
    return 'window.__seed='+json.dumps(d)+';'
def abre(b,ancho=390,alto=844,**k):
    ctx=b.new_context(viewport={'width':ancho,'height':alto},service_workers='block',device_scale_factor=2)
    pg=ctx.new_page();pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.add_init_script(seed(**k))
    pg.add_init_script("try{localStorage.setItem('mf_version_abierta','99');localStorage.setItem('mf_entrenos:u1','1');localStorage.setItem('mf_tut_v1:u1','1')}catch(e){}")
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE2))
    pg.route('**/config.js',lambda r:r.fulfill(content_type='application/javascript',body="window.APP_CONFIG={supabaseUrl:'https://x.supabase.co',supabaseAnonKey:'k',noTutorial:true}"))
    pg.goto('http://127.0.0.1:8871/index.html')
    pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto1');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)')
    pg.wait_for_timeout(1300)
    while pg.locator('#info').is_visible():
        pg.click('#closeInfo');pg.wait_for_timeout(200)
    pg.wait_for_timeout(700)
    return ctx,pg
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx,pg=abre(b)
    check('al abrir la app sale el Inicio',pg.locator('.ini-hero').count()==1 and pg.locator('[data-tab=inicio][aria-current=page]').count()==1)
    t=pg.locator('.ini-hero').inner_text()
    check('saludo con el nombre y el equipo','Luis' in t and 'CD ALHAMBRA' in t.upper() and 'Alevín' in t,t[:120])
    check('próximo partido: mañana vs UD Vega, hora y jornada','MAÑANA' in t.upper() and 'UD VEGA' in t.upper() and '10:30' in t and 'Jornada 9' in t,t)
    check('botón grande para empezar el Directo',pg.locator('.ini-hero [data-action=live][data-id=m9]').count()==1)
    check('el resumen de arriba (#stats) no se repite en el Inicio',not pg.locator('#stats').is_visible())
    tt=pg.locator('.ini-temp').inner_text()
    check('temporada: 2 V, 1 E, 1 D, 50% de victorias','50%' in tt and '6-4' in tt.replace('\n',''),tt.replace('\n',' '))
    check('dock con 6 secciones (Inicio + Entrenos)',pg.evaluate("document.querySelector('.dock').classList.contains('d6')"))
    check('8 accesos rápidos',pg.locator('.ini-t').count()==8)
    tp=pg.locator('.ini-best').inner_text()
    check('los mejores: máximo goleador Pablo (4 goles)','Pablo' in tp and '4 goles' in tp.replace('\n',' '),tp.replace('\n',' '))
    tr=pg.locator('.ini-tr').inner_text()
    check('próximo entreno en 2 días, asistencia del último y carga','EN 2 DÍAS' in tr.upper() and '78%' in tr and 'Carga' in tr,tr.replace('\n',' '))
    check('tarjeta del plan Pro en el plan gratuito',pg.locator('.ini-pro').count()==1)
    check('sin primeros pasos si ya está todo hecho... (falta el Directo)',pg.locator('.ini-pasos').count()==1)
    check('no se sale de ancho en el móvil',pg.evaluate("document.documentElement.scrollWidth<=innerWidth"))
    pg.screenshot(path=os.path.join(OUT,'inicio-1-movil.png'))
    pg.screenshot(path=os.path.join(OUT,'inicio-2-movil-completo.png'),full_page=True)
    pg.click('.ini-t[data-t=pizarra]');pg.wait_for_timeout(500)
    check('acceso rápido a la pizarra',pg.locator('[data-tab=pizarra][aria-current=page]').count()==1)
    pg.click('[data-tab=inicio]');pg.wait_for_timeout(400)
    pg.click('.ini-tr [data-ini=tr]');pg.wait_for_timeout(500)
    check('«Pasar lista» abre Entrenos en el día del entreno',pg.locator('[data-tab=entrenos][aria-current=page]').count()==1 and pg.locator('.cal [aria-pressed=true]').count()==1)
    pg.click('[data-tab=inicio]');pg.wait_for_timeout(400)
    pg.click('.ini-tp >> nth=0');pg.wait_for_timeout(500)
    check('tocar un jugador abre su ficha',pg.locator('#info').is_visible() and 'Pablo' in pg.locator('#infoBody').inner_text())
    pg.click('#closeInfo');pg.wait_for_timeout(200)
    pg.click('[data-mode="11"]');pg.wait_for_timeout(400)
    check('al cambiar de modalidad sigues en el Inicio',pg.locator('.ini-hero').count()==1 and 'Fútbol 11' in pg.locator('.ini-hero').inner_text())
    check('sin partidos: botón «Nuevo partido» y primeros pasos',pg.locator('.ini-hero [data-action=add-match]').count()==1 and pg.locator('.ini-pasos').count()==1)
    pg.click('[data-mode="7"]');pg.wait_for_timeout(300)
    pg.click('.ini-hero [data-action=live]');pg.wait_for_timeout(900)
    check('«Empezar el Directo» abre el Directo del partido',pg.locator('.lv-board').count()==1)
    ctx.close()
    # Pro con un partido en directo
    ctx,pg=abre(b,plan='pro',live=True)
    t=pg.locator('.ini-hero').inner_text()
    check('partido en directo: marcador y «Volver al directo»','EN DIRECTO' in t.upper() and 'VOLVER AL DIRECTO' in t.upper() and '2' in t,t.replace('\n',' '))
    check('Pro: sin tarjeta del plan Pro',pg.locator('.ini-pro').count()==0)
    check('con el Directo hecho no salen los primeros pasos',pg.locator('.ini-pasos').count()==0)
    pg.screenshot(path=os.path.join(OUT,'inicio-3-en-directo.png'))
    ctx.close()
    # Usuario nuevo
    ctx,pg=abre(b,datos=False)
    check('usuario nuevo: primeros pasos 0/4',pg.locator('.ini-pasos').count()==1 and '0/4' in pg.locator('.ini-pasos').inner_text())
    pg.click('.ini-paso[data-action=add-player]');pg.wait_for_timeout(300)
    check('«Añade jugadores» abre el formulario',pg.locator('#modal').is_visible())
    pg.click('#closeModal');pg.wait_for_timeout(200)
    pg.screenshot(path=os.path.join(OUT,'inicio-4-usuario-nuevo.png'))
    ctx.close()
    # Tablet en horizontal
    ctx,pg=abre(b,ancho=1180,alto=820)
    check('tablet: Inicio a dos columnas sin salirse',pg.evaluate("getComputedStyle(document.querySelector('.ini')).display==='grid'&&document.documentElement.scrollWidth<=innerWidth"))
    pg.screenshot(path=os.path.join(OUT,'inicio-5-tablet.png'))
    ctx.close()
    # Móvil girado
    ctx,pg=abre(b,ancho=844,alto=390)
    check('móvil girado: dock a la izquierda con 6 secciones visibles',pg.evaluate("[...document.querySelectorAll('.dock button')].filter(x=>x.offsetParent).every(x=>x.getBoundingClientRect().bottom<=innerHeight+1)"))
    pg.screenshot(path=os.path.join(OUT,'inicio-6-movil-girado.png'))
    ctx.close()
    b.close()
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
