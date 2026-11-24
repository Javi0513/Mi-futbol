# v11.57: «Buscar mi equipo» en la Federación Andaluza, filtrar competiciones por categoría y
# aviso claro (con «Volver a probar») cuando la web de la federación falla al dar las competiciones.
import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json,re
from playwright.sync_api import sync_playwright
FAKE2=re.search(r'FAKE=r"""(.*?)"""',open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'datos.py'),encoding='utf-8').read(),re.S).group(1)
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8875),functools.partial(type('Q',(http.server.SimpleHTTPRequestHandler,),{'log_message':lambda *a:None}),directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
EQ=[{'id':'e1','owner_id':'u1','modalidad':'7','nombre':'Cd valderrubio Prebejamin','categoria':'prebenjamin','created_at':'2026-01-01'}]
SEED={'futbol_personal_jugadores':[],'futbol_personal_partidos':[],'equipos':EQ,'perfiles':[{'id':'u1','plan':'gratis'}]}
COMPS=[{'id':'48466193','n':'2ª Andaluza Benjamín (Granada)'},{'id':'48466637','n':'2ª Andaluza Prebenjamín (Granada)'},{'id':'48466480','n':'5ª Andaluza Prebenjamin - Centro (Granada)'},{'id':'48466184','n':'2ª Andaluza Alevín (Granada)'},{'id':'48466498','n':'2ª Andaluza Prebenjamín F.S.(Granada)'}]
CAIDA='La web de la Federación Andaluza está fallando ahora mismo (también en su propia página) y no da las competiciones, los grupos ni los partidos. Vuelve a probar en un rato.'
def abre(b):
    ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block',device_scale_factor=2)
    pg=ctx.new_page();pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.add_init_script('window.__seed='+json.dumps(SEED)+';')
    pg.add_init_script("try{localStorage.setItem('mf_version_abierta','99');localStorage.setItem('mf_tut_visto','1')}catch(e){}")
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE2))
    pg.route('**/config.js',lambda r:r.fulfill(content_type='application/javascript',body="window.APP_CONFIG={supabaseUrl:'https://x.supabase.co',supabaseAnonKey:'k',noTutorial:true}"))
    pg.goto('http://127.0.0.1:8875/index.html')
    pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto1');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)')
    pg.wait_for_timeout(1300)
    while pg.locator('#info').is_visible():
        pg.click('#closeInfo');pg.wait_for_timeout(200)
    pg.wait_for_timeout(500)
    return ctx,pg
opts=lambda pg:[o for o in pg.locator('#lgFc option').all_inner_texts()][1:]
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx,pg=abre(b)
    pedidos=[];modo={'caida':True}
    def fn(route):
        q=json.loads(route.request.post_data or '{}');pedidos.append(q)
        if q.get('op')=='comps':
            if modo['caida']: return route.fulfill(status=503,content_type='application/json',body=json.dumps({'error':CAIDA}))
            d={'comps':COMPS}
        elif q.get('op')=='busca': d={'eq':[{'c':'48466480','cn':'5ª Andaluza Prebenjamin - Centro (Granada)','g':'48466481','gn':'Grupo único - Primera Fase','n':'C.D. VALDERRUBIO FÚTBOL 98','s':0.9}],'grupos':11}
        elif q.get('op')=='grupos': d={'grupos':[{'id':'48466481','n':'Grupo único - Primera Fase'}]}
        else: d={'tabla':[{'n':'C.D. ESPAÑOL ALBOLOTE','pts':9,'pj':3,'g':3,'e':0,'p':0,'gf':29,'gc':1},{'n':'C.D. DURCAL','pts':9,'pj':3,'g':3,'e':0,'p':0,'gf':20,'gc':3},{'n':'C.D. VALDERRUBIO FÚTBOL 98','pts':9,'pj':4,'g':3,'e':0,'p':1,'gf':20,'gc':7},{'n':"CHURRIANA C.F. 'A'",'pts':6,'pj':4,'g':2,'e':0,'p':2,'gf':10,'gc':9}],'res':{'j':4,'partidos':[]},'jornadas':[{'id':'4','n':'4 · 22-11-2026'}]}
        route.fulfill(status=200,content_type='application/json',body=json.dumps(d))
    pg.route('**/functions/v1/liga-rfaf',fn)
    pg.click('[data-tab=partidos]');pg.click('[data-lg=abrir]');pg.wait_for_timeout(200)
    pg.click('#infoBody [data-lg=fed]');pg.wait_for_timeout(150)
    # 1) La federación falla al dar las competiciones: aviso claro, no «no hay competiciones»
    pg.select_option('#lgFd','5');pg.wait_for_timeout(400)
    t=pg.locator('#infoBody').inner_text()
    check('si la federación falla, lo dice claro (no «no hay competiciones»)','está fallando ahora mismo' in t and 'No hay competiciones' not in t,t[:300])
    check('y sale «Volver a probar»',pg.locator('#infoBody [data-lg=fedOtra]').count()==1)
    pg.screenshot(path=os.path.join(OUT,'ligabusca-1-caida.png'))
    modo['caida']=False
    pg.click('#infoBody [data-lg=fedOtra]');pg.wait_for_timeout(400)
    check('«Volver a probar» vuelve a pedir las competiciones y salen',pedidos[-1]=={'op':'comps','d':'5'} and pg.locator('#lgFc').count()==1 and pg.locator('#infoBody .lg-mal').count()==0)
    # 2) Filtro por categoría: con el equipo en Prebenjamín salen solo las de prebenjamín (sin benjamín ni sala)
    check('la búsqueda de competición viene con la categoría del equipo',pg.input_value('#lgFf')=='Prebenjamín',pg.input_value('#lgFf'))
    o=opts(pg)
    check('solo salen las competiciones de prebenjamín (no las de benjamín)',o==['2ª Andaluza Prebenjamín (Granada)','5ª Andaluza Prebenjamin - Centro (Granada)','2ª Andaluza Prebenjamín F.S.(Granada)'],o)
    pg.fill('#lgFf','alevin');pg.wait_for_timeout(100)
    check('escribir «alevin» (sin tilde) filtra al momento',opts(pg)==['2ª Andaluza Alevín (Granada)'],opts(pg))
    pg.fill('#lgFf','benjamín');pg.wait_for_timeout(100)
    check('«benjamín» no saca las de prebenjamín',opts(pg)==['2ª Andaluza Benjamín (Granada)'],opts(pg))
    pg.fill('#lgFf','');pg.wait_for_timeout(100)
    check('vacío: salen todas',len(opts(pg))==5)
    check('el teclado no se pierde al escribir',pg.evaluate("document.activeElement&&document.activeElement.id")=='lgFf')
    # 3) Buscar mi equipo
    check('«Buscar mi equipo» viene con el nombre y la categoría del equipo',pg.input_value('#lgFq')=='Cd valderrubio Prebejamin' and pg.input_value('#lgFcat')=='prebenjamin')
    pg.screenshot(path=os.path.join(OUT,'ligabusca-2-form.png'))
    pg.fill('#lgFq','Valderrubio')
    pg.click('#infoBody [data-lg=fedBusca]');pg.wait_for_timeout(500)
    check('pide buscar en la federación con el nombre, la categoría y que no es sala',pedidos[-1]=={'op':'busca','d':'5','q':'Valderrubio','cat':'prebenjamin','fs':False},pedidos[-1])
    h=pg.locator('#infoBody .lg-hit').all_inner_texts()
    check('enseña el equipo encontrado con su competición y grupo',len(h)==1 and 'C.D. VALDERRUBIO FÚTBOL 98' in h[0] and '5ª Andaluza Prebenjamin - Centro' in h[0] and 'Grupo único' in h[0],h)
    pg.screenshot(path=os.path.join(OUT,'ligabusca-3-encontrado.png'))
    pg.locator('#info .dialog').screenshot(path=os.path.join(OUT,'ligabusca-dossier.png'))
    pg.click('#infoBody .lg-hit');pg.wait_for_timeout(700)
    L=pg.evaluate("window.__db.equipos[0].liga")
    check('al tocarlo se conecta a esa competición y grupo',L and L['fed']['c']=='48466480' and L['fed']['g']=='48466481' and L['fed']['gn']=='Grupo único - Primera Fase' and pedidos[-1]=={'op':'liga','d':'5','c':'48466480','g':'48466481'},L and L.get('fed'))
    check('y marca ese equipo como el mío: 3º',L['yo']=='C.D. VALDERRUBIO FÚTBOL 98' and pg.locator('#infoBody .lg-pos b').inner_text()=='3º')
    pg.screenshot(path=os.path.join(OUT,'ligabusca-4-conectada.png'))
    ctx.close()
    # 4) Sin resultados: lo explica
    ctx,pg=abre(b)
    pg.click('[data-tab=partidos]');pg.click('[data-lg=abrir]');pg.wait_for_timeout(200)
    pg.click('#infoBody [data-lg=fed]');pg.wait_for_timeout(150)
    pg.route('**/functions/v1/liga-rfaf',lambda r:r.fulfill(status=200,content_type='application/json',body=json.dumps({'comps':COMPS} if json.loads(r.request.post_data)['op']=='comps' else {'eq':[],'grupos':11})))
    pg.select_option('#lgFd','5');pg.wait_for_timeout(400)
    pg.fill('#lgFq','Equipo Que No Existe');pg.click('#infoBody [data-lg=fedBusca]');pg.wait_for_timeout(400)
    t=pg.locator('#infoBody .lg-busca').inner_text()
    check('si no lo encuentra, dice qué probar','No encuentro ningún equipo' in t and 'Prebenjamín' in t,t[-200:])
    ctx.close()
    b.close()
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
sys.exit(0 if all(res) and not errs else 1)
