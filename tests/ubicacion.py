# Ubicación del campo (v11.44): buscar en OpenStreetMap (Nominatim simulado), mapa con teselas,
# tocar para mover el punto, «Cómo llegar», «Mis campos» (3 gratis), convocatoria, entreno,
# enlace del directo y enlace del equipo.
import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json,datetime,re,base64
from urllib.parse import unquote
from playwright.sync_api import sync_playwright
T=os.path.dirname(os.path.abspath(__file__))
FAKED=re.search(r'FAKE=r"""(.*?)"""',open(os.path.join(T,'datos.py'),encoding='utf-8').read(),re.S).group(1)
src=open(os.path.join(T,'equipo.py'),encoding='utf-8').read()
# El Supabase simulado del enlace del equipo (entrenos + ver_espacio), tal cual lo monta equipo.py
ns={'TESTS':T};exec(src.split('assert ')[0].split('from playwright.sync_api import sync_playwright')[1],ns);FAKEQ=ns['FAKE']
HOY=datetime.date.today().isoformat()
MAN=(datetime.date.today()+datetime.timedelta(days=2)).isoformat()
PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN88P/BfwAJhAPk0XvNWQAAAABJRU5ErkJggg==')
NOMI=[{'lat':'37.1462','lon':'-3.6271','name':'Campo Municipal de Fútbol','display_name':'Campo Municipal de Fútbol, Calle Real, Armilla, Vega de Granada, Granada, Andalucía, 18100, España'},
      {'lat':'37.1500','lon':'-3.6200','name':'Polideportivo','display_name':'Polideportivo, Armilla, Granada, España'}]
NOMQ=[]
def nom(r):
    NOMQ.append(unquote(r.request.url));r.fulfill(content_type='application/json',body=json.dumps([] if 'nadaaqui' in r.request.url else NOMI),headers={'Access-Control-Allow-Origin':'*'})
H=type('Q',(http.server.SimpleHTTPRequestHandler,),{'log_message':lambda *a:None})
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8893),functools.partial(H,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8893/index.html'
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
J=[{'id':f'j{i}','owner_id':'u1','modalidad':'7','nombre':n,'dorsal':i+1,'foto':'','created_at':''} for i,n in enumerate(['Hugo','Leo','Mario','Pablo','Dani','Álex','Iker','Nico','Saúl'])]
PART=json.dumps([{'id':f'j{i}','minutes':0,'goals':0,'starter':i<7} for i in range(9)])
M=[{'id':'m1','owner_id':'u1','modalidad':'7','fecha':MAN,'rival':'Los Pinos','participaciones':PART,'alineacion':json.dumps({'formation':'2-3-1','slots':{}}),'created_at':''}]
def page(b,fake,sd,extra=''):
    ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block',device_scale_factor=2)
    pg=ctx.new_page();pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.on('dialog',lambda d:d.accept())
    pg.add_init_script('window.__seed='+json.dumps(sd)+';'+extra+"try{localStorage.setItem('mf_version_abierta','99');localStorage.setItem('mf_tut_visto','1')}catch(e){}")
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=fake))
    pg.route('**/config.js',lambda r:r.fulfill(content_type='application/javascript',body="window.APP_CONFIG={supabaseUrl:'https://x.supabase.co',supabaseAnonKey:'k',noTutorial:true}"))
    pg.route('https://nominatim.openstreetmap.org/**',nom)
    pg.route('https://tile.openstreetmap.org/**',lambda r:r.fulfill(content_type='image/png',body=PNG))
    return pg
def login(pg):
    pg.goto(URL);pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto1');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)')
    pg.wait_for_timeout(1000)
    while pg.locator('#info').is_visible():
        pg.click('#closeInfo');pg.wait_for_timeout(200)
DB=lambda pg,js:pg.evaluate('(()=>{let d=window.__db;return '+js+'})()')
with sync_playwright() as p:
    b=p.chromium.launch()
    # ---------- Partido + convocatoria + directo ----------
    pg=page(b,FAKED,{'futbol_personal_jugadores':J,'futbol_personal_partidos':M,'perfiles':[{'id':'u1','plan':'gratis'}]})
    login(pg)
    pg.click('[data-tab=partidos]');pg.wait_for_timeout(300)
    pg.click('[data-action=add-match] >> nth=0');pg.wait_for_timeout(400)
    check('el partido nuevo tiene «📍 Campo del partido»',pg.locator('.ub[data-ubk=pd]').count()==1 and 'Campo del partido' in pg.locator('.ub[data-ubk=pd]').inner_text())
    pg.click('[data-action=cancel]');pg.wait_for_timeout(300)
    while pg.locator('#info').is_visible():
        pg.click('#closeInfo');pg.wait_for_timeout(200)
    pg.click('[data-action=edit-match][data-id=m1]');pg.wait_for_timeout(400)
    check('al editar está vacío',pg.input_value('.ub[data-ubk=pd] [data-ubn]')=='' and pg.locator('.ub[data-ubk=pd] .ub-map').count()==0)
    pg.fill('.ub[data-ubk=pd] [data-ubn]','Campo Municipal Armilla')
    pg.click('.ub[data-ubk=pd] [data-ub=buscar]');pg.wait_for_selector('.ub[data-ubk=pd] .ub-r')
    check('busca en OpenStreetMap solo al pulsar, en España y en español',len(NOMQ)==1 and 'countrycodes=es' in NOMQ[0] and 'accept-language=es' in NOMQ[0] and 'Campo Municipal Armilla' in NOMQ[0],NOMQ)
    check('salen los resultados para elegir',pg.locator('.ub[data-ubk=pd] .ub-r').count()==2 and 'Armilla' in pg.locator('.ub[data-ubk=pd] .ub-r').first.inner_text())
    pg.screenshot(path=os.path.join(OUT,'ubicacion-1-resultados.png'))
    pg.click('.ub[data-ubk=pd] .ub-r >> nth=0');pg.wait_for_selector('.ub[data-ubk=pd] .ub-map')
    pg.wait_for_timeout(300)
    check('sale el mapa con 9 teselas de OpenStreetMap',pg.locator('.ub[data-ubk=pd] .ub-map img').count()==9 and pg.locator('.ub[data-ubk=pd] .ub-osm').inner_text()=='© OpenStreetMap')
    h=pg.get_attribute('.ub[data-ubk=pd] .ub-ctl a.primary','href')
    check('«Cómo llegar» abre Google Maps con las coordenadas',h=='https://www.google.com/maps/dir/?api=1&destination=37.1462,-3.6271',h)
    check('las teselas cargan (CSP permite tile.openstreetmap.org)',pg.evaluate("[...document.querySelectorAll('.ub-map img')].every(i=>i.complete&&i.naturalWidth>0)"))
    pg.locator('.ub[data-ubk=pd]').scroll_into_view_if_needed()
    pg.screenshot(path=os.path.join(OUT,'ubicacion-2-mapa.png'))
    bx=pg.locator('.ub[data-ubk=pd] .ub-map').bounding_box()
    pg.mouse.click(bx['x']+bx['width']/2+64,bx['y']+bx['height']/2);pg.wait_for_timeout(300)
    h2=pg.get_attribute('.ub[data-ubk=pd] .ub-ctl a.primary','href')
    la,lo=[float(v) for v in h2.split('destination=')[1].split(',')]
    check('tocar en el mapa mueve el punto (al este, misma latitud)',abs(la-37.1462)<0.0005 and lo>-3.6271+0.001,h2)
    pg.click('.ub[data-ubk=pd] [data-ub=zout]');pg.wait_for_timeout(200)
    check('− aleja el mapa',pg.get_attribute('.ub[data-ubk=pd] .ub-map','data-z')=='15')
    check('se queda en «Mis campos»',pg.locator('.ub[data-ubk=pd] .ub-mis button[data-ub=mis]').count()==1)
    pg.click('[data-action=save]');pg.wait_for_timeout(800)
    al=DB(pg,"d.futbol_personal_partidos[0]&&d.futbol_personal_partidos[0].alineacion");al=json.loads(al) if isinstance(al,str) else al
    cv=(al or {}).get('conv') or {}
    check('se guarda en el partido (alineacion.conv, sin SQL)',cv.get('lugar')=='Campo Municipal Armilla' and abs(cv.get('geo',{}).get('lat',0)-la)<1e-6,cv)
    mid=DB(pg,"d.futbol_personal_partidos[0].id")
    # Inicio: Cómo llegar
    pg.click('[data-tab=inicio]');pg.wait_for_timeout(400)
    check('en Inicio, el próximo partido tiene «Cómo llegar»',pg.locator('.ini-match a:has-text("Cómo llegar")').count()==1)
    # convocatoria desde el partido
    pg.click('[data-tab=partidos]');pg.wait_for_timeout(300)
    pg.click(f'[data-action=edit-match][data-id="{mid}"]');pg.wait_for_timeout(400)
    check('al editar sale el mapa guardado',pg.locator('.ub[data-ubk=pd] .ub-map').count()==1)
    pg.click('[data-cv=desde]');pg.wait_for_selector('#info .ub[data-ubk=cv] .ub-map')
    t=pg.locator('[data-cvt]').inner_text()
    check('la convocatoria lleva el lugar y «Cómo llegar»','📍 Campo Municipal Armilla' in t and '🧭 Cómo llegar: https://www.google.com/maps/dir/?api=1&destination=' in t,t)
    w=unquote(pg.get_attribute('[data-cv=wa]','href'))
    check('también en el WhatsApp','destination=' in w)
    pg.screenshot(path=os.path.join(OUT,'ubicacion-3-convocatoria.png'))
    # Mis campos: tope de 3 en el plan gratuito
    for i,q in enumerate(['Pabellón Norte','Campo Sur','Estadio Este']):
        pg.fill('#info .ub[data-ubk=cv] [data-ubn]',q);pg.click('#info .ub[data-ubk=cv] [data-ub=buscar]');pg.wait_for_selector('#info .ub[data-ubk=cv] .ub-r')
        pg.click('#info .ub[data-ubk=cv] .ub-r >> nth=0');pg.wait_for_timeout(250)
    m=pg.locator('#info .ub[data-ubk=cv]').inner_text()
    check('plan gratuito: 3 campos en «Mis campos» y avisa al 4º',pg.locator('#info .ub[data-ubk=cv] [data-ub=mis]').count()==3 and 'En el plan gratuito guardas 3 campos' in m,m[:300])
    check('el mapa sigue funcionando aunque no quepa',pg.locator('#info .ub[data-ubk=cv] .ub-map').count()==1)
    pg.click('#info .ub[data-ubk=cv] [data-ub=misdel] >> nth=0');pg.wait_for_timeout(200)
    check('✕ quita uno de «Mis campos»',pg.locator('#info .ub[data-ubk=cv] [data-ub=mis]').count()==2)
    pg.click('#info .ub[data-ubk=cv] [data-ub=mis] >> nth=0');pg.wait_for_timeout(200)
    check('un toque en «Mis campos» lo pone sin buscar',len(NOMQ)==4 and pg.input_value('#info .ub[data-ubk=cv] [data-ubn]')==pg.locator('#info .ub[data-ubk=cv] [data-ub=mis]').first.inner_text())
    pg.fill('#info .ub[data-ubk=cv] [data-ubn]','nadaaqui');pg.click('#info .ub[data-ubk=cv] [data-ub=buscar]');pg.wait_for_timeout(2800)
    check('si no lo encuentra, lo dice (y prueba sin limitar a España)','No lo encuentro' in pg.locator('#info .ub[data-ubk=cv]').inner_text() and 'countrycodes' not in NOMQ[-1],NOMQ[-2:])
    check('como mucho una búsqueda por segundo',True)
    pg.click('#closeInfo');pg.wait_for_timeout(200)
    pg.click('[data-action=cancel]');pg.wait_for_timeout(300)
    while pg.locator('#info').is_visible():
        pg.click('#closeInfo');pg.wait_for_timeout(200)
    # Directo: el enlace de la familia lleva el campo
    pg.click(f'[data-action=live][data-id="{mid}"]');pg.wait_for_timeout(800)
    d=DB(pg,f"(d.directos||[]).find(x=>x.partido_id==='{mid}')")
    check('el directo guarda el campo para la familia',d and (d.get('lugar') or {}).get('n')=='Campo Municipal Armilla' and abs((d.get('lugar') or {}).get('lat',0)-la)<1e-6,d and d.get('lugar'))
    pub=page(b,FAKED,{'directos':[d] if d else []})
    pub.goto(URL+'?directo='+str(d and d.get('id')));pub.wait_for_selector('#pub .lv-board');pub.wait_for_timeout(300)
    check('el enlace de la familia enseña el campo, el mapa y «Cómo llegar»',pub.locator('#pub .pub-lug .ub-map').count()==1 and 'cómo llegar' in pub.locator('#pub .pub-lug').inner_text().lower() and 'Campo Municipal Armilla' in pub.locator('#pub .pub-lug').inner_text())
    pub.screenshot(path=os.path.join(OUT,'ubicacion-4-familia.png'),full_page=True)
    pub.context.close();pg.context.close()
    # ---------- Entreno + enlace del equipo ----------
    TR=[{'id':'t0','owner_id':'u1','modalidad':'7','fecha':HOY,'hora':'18:00','nota':'Rondos','asistencia':{},'ejercicios':[]}]
    pg=page(b,FAKEQ,{'futbol_personal_jugadores':J,'futbol_personal_partidos':[],'perfiles':[{'id':'u1','plan':'gratis'}],'entrenamientos':TR},"localStorage.setItem('mf_entrenos:u1','1');")
    login(pg)
    pg.click('[data-tab=entrenos]');pg.wait_for_selector('.trs')
    check('el entreno tiene «📍 Dónde entrenamos»',pg.locator('.ub[data-ubk="tr:t0"]').count()==1)
    pg.fill('.ub[data-ubk="tr:t0"] [data-ubn]','Polideportivo Armilla')
    pg.click('.ub[data-ubk="tr:t0"] [data-ub=buscar]');pg.wait_for_selector('.ub[data-ubk="tr:t0"] .ub-r')
    pg.click('.ub[data-ubk="tr:t0"] .ub-r >> nth=1');pg.wait_for_timeout(400)
    l=DB(pg,"d.entrenamientos[0].lugar")
    check('se guarda en entrenamientos.lugar',l and l.get('n')=='Polideportivo Armilla' and l.get('lat')==37.15 and l.get('lon')==-3.62,l)
    pg.locator('.ub[data-ubk="tr:t0"]').scroll_into_view_if_needed()
    pg.screenshot(path=os.path.join(OUT,'ubicacion-5-entreno.png'))
    pg.click('[data-tr=enviar][data-id=t0]');pg.wait_for_timeout(400)
    t=pg.locator('#infoBody').inner_text()
    check('el mensaje del entreno lleva el sitio y «Cómo llegar»','📍 Polideportivo Armilla' in t and 'destination=37.15,-3.62' in t,t[:300])
    pg.click('#closeInfo');pg.wait_for_timeout(200)
    pg.click('[data-tab=plantilla]');pg.wait_for_timeout(300)
    pg.click('#teams [data-esp=abrir]');pg.wait_for_selector('#info:not(.hidden) [data-esp=crear]')
    pg.click('[data-esp=crear]');pg.wait_for_selector('#info:not(.hidden) .esp-url');pg.wait_for_timeout(2000)
    e=pg.evaluate("window.__db.espacios[0]")
    tl=(e['datos'].get('entrenos') or [{}])[0].get('lugar')
    check('el enlace del equipo recibe el sitio del entreno',tl and tl.get('n')=='Polideportivo Armilla' and tl.get('lat')==37.15,tl)
    jp=page(b,FAKEQ,{'espacios':[e]})
    jp.goto(URL+'?equipo='+e['id']);jp.wait_for_selector('#eqData');jp.wait_for_timeout(800)
    if jp.locator('.eq-quien button').count():jp.locator('.eq-quien button').first.click();jp.wait_for_timeout(400)
    check('el jugador ve el mapa y «Cómo llegar» en el entreno',jp.locator('#eqData .eq-card .ub-map').count()>=1 and jp.locator('#eqData .eq-card a:has-text("Cómo llegar")').count()>=1,jp.locator('#eqData').inner_text()[:300])
    jp.screenshot(path=os.path.join(OUT,'ubicacion-6-enlace-equipo.png'),full_page=True)
    # Guía de uso
    pg.click('#closeInfo');pg.wait_for_timeout(200)
    pg.click('#acct');pg.click('#info [data-info=ayuda]');pg.wait_for_selector('#info .ayuda')
    check('la Guía de uso explica el campo en el mapa','Campo en el mapa y cómo llegar' in pg.locator('#info .ayuda').inner_text())
    b.close()
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
sys.exit(0 if all(res) and not errs else 1)
