# Resumen del partido (v11.13): ver un partido sin editarlo y compartirlo con quien no tiene la app.
import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json
from playwright.sync_api import sync_playwright
from fake2 import FAKE2
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8861),functools.partial(type('Q',(http.server.SimpleHTTPRequestHandler,),{'log_message':lambda *a:None}),directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
NOM=['Hugo','Leo','Mario','Pablo','Dani','Álex','Iker','Nico','Saúl']
J=[{'id':f'j{i}','owner_id':'u1','modalidad':'7','nombre':n,'dorsal':i+1,'foto':'','created_at':''} for i,n in enumerate(NOM)]
PART=[{'id':f'j{i}','minutes':[50,50,50,50,35,50,25,15,0][i],'goals':[0,0,0,2,1,0,0,0,0][i],'starter':i<7} for i in range(9)]
PART[3]['st']={'rob':3,'tp':4,'tf':1};PART[0]['st']={'par':6};PART[4]['st']={'asi':2,'per':1}
AL={'formation':'2-3-1','slots':{},'resultado':{'gf':3,'gc':1},'capitan':'j3','portero':'j0','parte':25,
    'cambios':[{'id':'c1','m':25,'sale':'j6','entra':'j7'},{'id':'c2','m':35,'sale':'j4','entra':'j8'}],
    'tarjetas':[{'id':'t1','m':30,'pid':'j5','c':'a'}],'estR':{'tir':5},'tarjetasR':[{'id':'r1','m':40,'d':'9','n':'Rubén','c':'a'}],
    'faltas':{'n1':2,'r1':3,'n2':1,'r2':4}}
M=[{'id':'m1','owner_id':'u1','modalidad':'7','fecha':'2026-11-08','rival':'Los Pinos','participaciones':json.dumps(PART),'alineacion':json.dumps(AL),'created_at':''}]
for k,(r,f) in enumerate([('Atlético Sur','2026-11-01'),('Real Norte','2026-10-25'),('CD Río','2026-10-18')]):
    M.append({'id':f'm{k+2}','owner_id':'u1','modalidad':'7','fecha':f,'rival':r,'participaciones':json.dumps([{'id':'j3','minutes':50,'goals':1,'starter':True}]),'alineacion':json.dumps({'resultado':{'gf':1,'gc':k}}),'created_at':''})
EV=[{'id':'e1','t':'f','m':7,'n':'Pablo','d':'4','pid':'j3','p':1},{'id':'e2','t':'c','m':18,'p':1},{'id':'e3','t':'f','m':31,'n':'Dani','d':'5','pid':'j4','p':2},{'id':'e4','t':'f','m':44,'n':'Pablo','d':'4','pid':'j3','p':2}]
D=[{'id':'00000000-0000-4000-8000-000000000001','owner_id':'u1','partido_id':'m1','modalidad':'7','equipo':'Mi equipo','rival':'Los Pinos','gf':3,'gc':1,'estado':'FIN','parte_min':25,'acum_ms':0,'desde':None,'eventos':EV}]
SEED='window.__seed='+json.dumps({'futbol_personal_jugadores':J,'futbol_personal_partidos':M,'directos':D,'perfiles':[{'id':'u1','plan':'gratis'}]})+';'
def abre(b,ancho=390,alto=844,pro=False):
    ctx=b.new_context(viewport={'width':ancho,'height':alto},service_workers='block',accept_downloads=True,device_scale_factor=2)
    pg=ctx.new_page();pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.add_init_script(SEED.replace("'gratis'","'pro'").replace('"gratis"','"pro"') if pro else SEED)
    pg.add_init_script("try{localStorage.setItem('mf_version_abierta','99');localStorage.setItem('mf_tut_visto','1')}catch(e){}")
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE2))
    pg.goto('http://127.0.0.1:8861/index.html')
    pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto1');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)')
    pg.wait_for_timeout(1200)
    while pg.locator('#info').is_visible():
        pg.click('#closeInfo');pg.wait_for_timeout(200)
    return ctx,pg
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx,pg=abre(b)
    pg.click('[data-tab=partidos]');pg.wait_for_timeout(400)
    check('cada partido tiene «Ver resumen y estadísticas»',pg.locator('[data-rs=m1]').count()==1 and pg.locator('.rs-b').count()==4)
    pg.screenshot(path=os.path.join(OUT,'resumen-1-partidos.png'))
    pg.click('[data-rs=m1]');pg.wait_for_timeout(400)
    body=pg.locator('#infoBody').inner_text();bl=body.lower()
    check('abre el resumen sin entrar a editar',pg.locator('#info').is_visible() and 'los pinos' in pg.locator('#infoTitle').inner_text().lower() and pg.locator('#rival').count()==0)
    check('marcador y victoria','3-1' in body.replace('\n','').replace(' ','') and 'Victoria' in body,body[:120])
    check('goles con su minuto del directo (gol rival sin repetir)',"Los Pinos Los Pinos" not in body and "7'" in body and "44'" in body and 'Pablo' in body)
    check('minutos de cada jugador (titulares con ★)',"35'" in body and "15'" in body and pg.locator('#infoBody .rs-tit').count()==7)
    check('capitán y portero marcados','C' in [x.inner_text() for x in pg.locator('#infoBody .rs-tag').all()] and 'POR' in [x.inner_text() for x in pg.locator('#infoBody .rs-tag').all()])
    check('cambios, tarjetas y estadísticas','cambios' in bl and 'tarjetas' in bl and 'estadísticas de cada jugador' in bl and pg.locator('#infoBody .tj.a').count()>=2)
    check('lo del rival y faltas acumuladas','Tiros: 5' in body and 'Rubén' in body and 'faltas acumuladas' in bl)
    wa=pg.get_attribute('[data-rsx=wa]','href')
    from urllib.parse import unquote
    t=unquote(wa.split('text=')[1])
    check('el texto de WhatsApp lleva resultado, minutos y estadísticas','Mi equipo 3 - 1 Los Pinos' in t and "Pablo (C): 50'" in t and '4 tiros a puerta' in t and 'Minutos jugados' in t,t[:300])
    check('aviso del plan gratuito','te quedan 3 de 3' in body)
    pg.screenshot(path=os.path.join(OUT,'resumen-2-modal.png'))
    pg.locator('#infoBody').evaluate('e=>e.scrollTop=e.scrollHeight');pg.wait_for_timeout(200)
    pg.screenshot(path=os.path.join(OUT,'resumen-3-compartir.png'))
    with pg.expect_download() as dl: pg.click('[data-rsx=img]')
    f=os.path.join(OUT,'resumen-imagen.png');dl.value.save_as(f)
    check('descarga la imagen del resumen',os.path.getsize(f)>20000 and dl.value.suggested_filename.startswith('resumen-f7-los-pinos'),dl.value.suggested_filename)
    pg.wait_for_timeout(300)
    check('compartir gasta 1 del mes',pg.evaluate("Object.values(JSON.parse(Object.entries(localStorage).find(e=>e[0].startsWith('mf_envios'))[1])).flat().length")==1)
    pg.click('[data-rsx=copiar]');pg.wait_for_timeout(200)
    check('volver a mandar el mismo no gasta otro',pg.evaluate("JSON.parse(Object.entries(localStorage).find(e=>e[0].startsWith('mf_envios'))[1]).rs.length")==1)
    pg.click('[data-rsx=edit]');pg.wait_for_timeout(400)
    check('«Editar el partido» abre el editor',pg.locator('#info').is_hidden() and pg.locator('#rival').count()==1)
    pg.click('[data-action=cancel]');pg.wait_for_timeout(300)
    # temporada
    pg.click('[data-rs=tmp] >> nth=0');pg.wait_for_timeout(300)
    tb=pg.locator('#infoBody .cv-txt').inner_text()
    check('resumen de la temporada con todos los partidos','resumen de la temporada' in pg.locator('#infoTitle').inner_text().lower() and all(r in tb for r in ('Los Pinos 3-1','CD Río','Real Norte','Atlético Sur')) and '4 partidos · 2V 1E 1D' in tb,tb[:200])
    check('y minutos y goles de cada jugador',"Pablo: 4 · 200' · 5 ⚽" in tb,tb)
    pg.screenshot(path=os.path.join(OUT,'resumen-4-temporada.png'))
    pg.click('[data-rsx=copiar]');pg.wait_for_timeout(200)
    pg.click('#closeInfo')
    for i in ('m2','m3'):
        pg.click(f'[data-rs={i}]');pg.wait_for_timeout(200);pg.click('[data-rsx=copiar]');pg.wait_for_timeout(200)
        if pg.locator('#infoTitle').inner_text().lower()!='plan pro':pg.click('#closeInfo')
    check('el 4º resumen distinto del mes pide Pro',pg.locator('#infoTitle').inner_text().lower()=='plan pro' and 'resúmenes de partido al mes' in pg.locator('#infoBody').inner_text())
    pg.click('#closeInfo')
    # Estadísticas › Resultados
    pg.click('[data-tab=resumen]');pg.wait_for_timeout(300)
    pg.click('.rs-row[data-rs=m1]');pg.wait_for_timeout(300)
    check('en Estadísticas › Resultados también se abre el resumen','los pinos' in pg.locator('#infoTitle').inner_text().lower())
    pg.screenshot(path=os.path.join(OUT,'resumen-5-resultados.png'))
    pg.click('#closeInfo')
    ctx.close()
    ctx,pg=abre(b,pro=True)
    pg.click('[data-tab=partidos]');pg.wait_for_timeout(300);pg.click('[data-rs=m1]');pg.wait_for_timeout(300)
    check('con Pro no hay contador',pg.locator('#infoBody .lim-q').count()==0)
    ctx.close()
    # iPad antiguo: ancho de tablet y sin APIs nuevas
    ctx,pg=abre(b,768,1024)
    pg.click('[data-tab=partidos]');pg.wait_for_timeout(300);pg.click('[data-rs=m1]');pg.wait_for_timeout(300)
    check('en tablet se ve',pg.locator('#info').is_visible())
    ctx.close()
    b.close()
check('sin errores',not errs,errs[:3])
srv.shutdown()
print(f'\n{sum(res)}/{len(res)} correctas');sys.exit(0 if all(res) else 1)
