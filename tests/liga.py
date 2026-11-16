# Clasificación de la liga (v11.41): pegar la tabla o los resultados de la web de la federación,
# apuntar a mano, tus partidos de liga se suman solos, tu equipo marcado, WhatsApp, Inicio y límite gratis.
import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json,re
from urllib.parse import unquote
from playwright.sync_api import sync_playwright
FAKE2=re.search(r'FAKE=r"""(.*?)"""',open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'datos.py'),encoding='utf-8').read(),re.S).group(1)
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8873),functools.partial(type('Q',(http.server.SimpleHTTPRequestHandler,),{'log_message':lambda *a:None}),directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
J=[{'id':f'j{i}','owner_id':'u1','modalidad':'7','nombre':n,'dorsal':i+1,'foto':'','created_at':'','equipo_id':'e1'} for i,n in enumerate(['Hugo','Leo','Mario','Pablo','Dani','Álex','Iker'])]
PART=json.dumps([{'id':f'j{i}','minutes':50,'goals':0,'starter':True} for i in range(7)])
M=[{'id':'m1','owner_id':'u1','modalidad':'7','equipo_id':'e1','fecha':'2026-11-08','rival':'UD Sur','participaciones':PART,'alineacion':json.dumps({'formation':'2-3-1','slots':{},'resultado':{'gf':2,'gc':1},'jornada':{'t':'liga','n':'1'}}),'created_at':''}]
EQ=[{'id':'e1','owner_id':'u1','modalidad':'7','nombre':'CD Norte','created_at':'2026-01-01'}]
SEED={'futbol_personal_jugadores':J,'futbol_personal_partidos':M,'equipos':EQ,'perfiles':[{'id':'u1','plan':'gratis'}]}
# Tabla copiada en el móvil de una web tipo iSquad: cada celda en su línea, con cabecera
T1="Pos\nEquipo\nPuntos\nJ\nG\nE\nP\nF\nC\n1\nC.D. NORTE\n25\n10\n8\n1\n1\n30\n8\n2\nU.D. SUR\n22\n10\n7\n1\n2\n25\n12\n3\nATLÉTICO 2000\n15\n10\n4\n3\n3\n18\n16\n4\nRACING VEGA\n4\n10\n1\n1\n8\n6\n33\n"
# Tabla con tabuladores (una fila por línea) y columna de sanción
T2="1\tCF Ribera\t21\t9\t7\t0\t2\t28\t10\t0\n2\tClub Vega Alta\t18\t9\t6\t0\t3\t20\t15\t0\n3\tCD Norte\t12\t9\t4\t0\t5\t14\t19\t0\n"
R1="C.D. NORTE 3 - 0 ATLÉTICO 2000\nU.D. SUR 1-1 RACING VEGA\n"
R2="Jornada 3\n16/11/2026\nRACING VEGA\n0 - 2\nC.D. NORTE\n11:00\nATLÉTICO 2000\n1 - 0\nU.D. SUR\nCampo Municipal\n"
def abre(b,sd,pro=False):
    ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block',device_scale_factor=2)
    pg=ctx.new_page();pg.on('pageerror',lambda e:errs.append(str(e)))
    sd=json.loads(json.dumps(sd))
    if pro: sd['perfiles'][0]['plan']='pro'
    pg.add_init_script('window.__seed='+json.dumps(sd)+';')
    pg.add_init_script("try{localStorage.setItem('mf_version_abierta','99');localStorage.setItem('mf_tut_visto','1')}catch(e){}")
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE2))
    pg.route('**/config.js',lambda r:r.fulfill(content_type='application/javascript',body="window.APP_CONFIG={supabaseUrl:'https://x.supabase.co',supabaseAnonKey:'k',noTutorial:true}"))
    pg.add_init_script("window.open=function(u){window.__abierto=u;return null}")
    pg.goto('http://127.0.0.1:8873/index.html')
    pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto1');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)')
    pg.wait_for_timeout(1300)
    while pg.locator('#info').is_visible():
        pg.click('#closeInfo');pg.wait_for_timeout(200)
    pg.wait_for_timeout(700)
    return ctx,pg
def filas(pg):
    return [[c.strip() for c in r.split('\t')] for r in pg.locator('#infoBody .lg-t tbody tr').all_inner_texts()]
def pega(pg,tipo,txt,j=None):
    pg.click(f'#infoBody [data-lg={tipo}]');pg.wait_for_timeout(150)
    pg.fill('#lgTxt',txt)
    if j: pg.fill('#lgJ',str(j))
    pg.click('#infoBody [data-lg=lee]');pg.wait_for_timeout(200)
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx,pg=abre(b,SEED)
    ini=pg.locator('.ini-liga').text_content() if pg.locator('.ini-liga').count() else ''
    check('Inicio: tarjeta «¿Cómo va tu liga?»','Cómo va tu liga' in ini,ini[:80])
    pg.click('[data-tab=partidos]');pg.wait_for_timeout(300)
    check('Partidos tiene el botón «Clasificación de la liga»',pg.locator('[data-lg=abrir]').count()==1)
    pg.click('[data-lg=abrir]');pg.wait_for_timeout(300)
    check('se abre la clasificación',pg.locator('#infoTitle').text_content()=='Clasificación de la liga')
    F=filas(pg)
    check('sin pegar nada: tu partido de liga ya cuenta (CD Norte 3 pts, UD Sur 0)',len(F)==2 and F[0][1]=='CD Norte' and F[0][2]=='3' and F[1][1]=='UD Sur',F)
    pg.screenshot(path=os.path.join(OUT,'liga-1-vacia.png'))
    # Enlace de la liga
    pg.click('#infoBody [data-lg=enlace]');pg.wait_for_timeout(150)
    pg.fill('#lgUrl','resultadosffcv.isquad.es/clasificacion.php?id=1');pg.fill('#lgNom','Alevín 2ª G3')
    pg.click('#infoBody [data-lg=enlaceOk]');pg.wait_for_timeout(300)
    a=pg.locator('#infoBody a',has_text='Abrir la web de mi liga')
    check('guarda el enlace (con https) y sale «Abrir la web de mi liga»',a.count()==1 and a.get_attribute('href')=='https://resultadosffcv.isquad.es/clasificacion.php?id=1')
    lg=pg.evaluate("window.__db.equipos[0].liga")
    check('se guarda en equipos.liga',lg and lg.get('nom')=='Alevín 2ª G3',lg)
    # Pegar la tabla tipo iSquad
    pega(pg,'pegaT',T1)
    pv=pg.locator('#infoBody .lg-prev').inner_text()
    check('lee la tabla de iSquad: 4 equipos','4 equipos' in pv,pv[:60])
    F=filas(pg)
    check('nombres, puntos, PJ, G, E, P, GF, GC bien',F[0][1:10]==['C.D. NORTE','25','10','8','1','1','30','8','+22'] and F[2][1]=='ATLÉTICO 2000' and F[2][2]=='15' and F[3][1]=='RACING VEGA' and F[3][8]=='33',F)
    pg.screenshot(path=os.path.join(OUT,'liga-2-pegar.png'))
    pg.click('#infoBody [data-lg=guardaP]');pg.wait_for_timeout(300)
    F=filas(pg)
    check('guardada: se ve la tabla pegada',len(F)==4 and F[1][1]=='U.D. SUR',F)
    check('reconoce a mi equipo (CD Norte = C.D. NORTE) y lo marca',pg.locator('#infoBody .lg-t tr.yo').inner_text().split('\t')[1].strip()=='C.D. NORTE')
    check('dice el puesto: 1º de 4 · 25 puntos','1º' in pg.locator('#infoBody .lg-pos').inner_text() and '25 puntos' in pg.locator('#infoBody .lg-pos').inner_text())
    pg.screenshot(path=os.path.join(OUT,'liga-3-tabla.png'))
    # WhatsApp
    pg.click('#infoBody [data-lg=wa]');pg.wait_for_timeout(100)
    u=pg.evaluate('window.__abierto')or'';t=unquote(u.split('text=')[1]) if 'text=' in u else u
    check('WhatsApp: la clasificación con mi equipo en negrita','Alevín 2ª G3' in t and '1. *C.D. NORTE* · 25 pts' in t,t[:120])
    # Resultados pegados
    pega(pg,'pegaR',R1,2)
    pv=pg.locator('#infoBody .lg-prev').inner_text()
    check('lee resultados en una línea: 2','2 resultados' in pv,pv[:80])
    pg.click('#infoBody [data-lg=guardaP]');pg.wait_for_timeout(300)
    pega(pg,'pegaR',R2,3)
    pv=pg.locator('#infoBody .lg-prev').inner_text()
    check('lee resultados con cada cosa en su línea (salta fecha, hora y campo)','2 resultados' in pv and 'RACING VEGA' in pv and '0 - 2' in pv,pv[:200])
    pg.click('#infoBody [data-lg=guardaP]');pg.wait_for_timeout(300)
    R=pg.evaluate("window.__db.equipos[0].liga.res")
    check('resultados guardados con su jornada y los nombres de la tabla',len(R)==4 and {'j':2,'l':'C.D. NORTE','v':'ATLÉTICO 2000','gl':3,'gv':0} in R,R)
    # Quitar la tabla: se calcula con los resultados (+ mi partido de la jornada 1)
    pg.click('#infoBody [data-lg=borraT]');pg.wait_for_timeout(300)
    F=filas(pg)
    check('sin tabla: se calcula con los resultados y mi partido (Norte 9 pts, 3 PJ)',F[0][1]=='C.D. NORTE' and F[0][2]=='9' and F[0][3]=='3',F)
    check('mi partido de liga se une al rival de la tabla (U.D. SUR, sin duplicar)',not any(f[1]=='UD Sur' for f in F),F)
    # Límite gratis: ya se han usado 1 día (los tres pegados hoy cuentan una vez)
    check('gratis: los pegados de hoy cuentan como 1 día','te quedan 3' in pg.locator('#infoBody .lim-q').inner_text())
    # A mano
    pg.click('#infoBody [data-lg=mano]');pg.wait_for_timeout(150)
    check('a mano: propone la jornada siguiente (4)',pg.input_value('#lgJ')=='4')
    pg.fill('#lgL','Racing Vega');pg.fill('#lgGL','2');pg.fill('#lgV','cd norte');pg.fill('#lgGV','2')
    pg.click('#infoBody [data-lg=manoOk]');pg.wait_for_timeout(300)
    R=pg.evaluate("window.__db.equipos[0].liga.res")
    check('a mano: guarda con los nombres de la tabla',{'j':4,'l':'RACING VEGA','v':'C.D. NORTE','gl':2,'gv':2} in R,R[-1])
    pg.click('#infoBody [data-lg=ver]');pg.wait_for_timeout(200)
    F=filas(pg)
    check('el empate suma 1 punto (Norte 10)',F[0][2]=='10',F[0])
    n=len(pg.evaluate("window.__db.equipos[0].liga.res"))
    pg.locator('#infoBody .lg-res summary').click() if not pg.locator('#infoBody .lg-res[open]').count() else None
    pg.locator('#infoBody [data-lg=quita]').first.click();pg.wait_for_timeout(300)
    check('se puede quitar un resultado',len(pg.evaluate("window.__db.equipos[0].liga.res"))==n-1)
    # v11.42: G = E + P hace que PJ = G+E+P también se cumpla empezando en los puntos (18 = 10+5+3)
    pega(pg,'pegaT',"1 CD Norte 18 10 5 3 2 21 14\n2 UD Sur 15 10 4 3 3 17 15\n3 Racing Vega 9 9 2 3 4 10 16\n")
    F=filas(pg)
    check('v11.42: G = E + P no lía los puntos (18 pts, 10 PJ, 5-3-2, 21-14)',F[0][1:9]==['CD Norte','18','10','5','3','2','21','14'] and F[2][1:4]==['Racing Vega','9','9'],F)
    pg.click('#infoBody [data-lg=ver]');pg.wait_for_timeout(150)
    # Tabla con tabuladores y «Mi equipo en la tabla»
    pega(pg,'pegaT',T2)
    F=filas(pg)
    check('tabla con tabuladores y sanción: Pts y goles bien',F[0][1:4]==['CF Ribera','21','9'] and F[1][1]=='Club Vega Alta' and F[2][7]=='14' and F[2][8]=='19',F)
    pg.click('#infoBody [data-lg=guardaP]');pg.wait_for_timeout(300)
    check('reconoce CD Norte en la nueva tabla: 3º',pg.locator('#infoBody .lg-pos b').inner_text()=='3º')
    pg.select_option('#lgYo','CF Ribera');pg.wait_for_timeout(300)
    check('«Mi equipo en la tabla» cambia el marcado',pg.locator('#infoBody .lg-t tr.yo').inner_text().split('\t')[1].strip()=='CF Ribera' and pg.evaluate("window.__db.equipos[0].liga.yo")=='CF Ribera')
    pg.select_option('#lgYo','CD Norte');pg.wait_for_timeout(300)
    # Texto que no es una tabla
    pega(pg,'pegaT','hola qué tal')
    check('si no encuentra nada lo dice',pg.locator('#infoBody .lg-mal').count()==1)
    pg.click('#closeInfo');pg.wait_for_timeout(200)
    # Inicio muestra el puesto
    pg.click('[data-tab=inicio]');pg.wait_for_timeout(300)
    ini=pg.locator('.ini-liga').text_content()
    check('Inicio: «3º de 3 · 12 puntos» y la mini tabla','3º de 3 · 12 puntos' in ini and pg.locator('.ini-liga .lg-t tr.yo').count()==1,ini[:120])
    pg.screenshot(path=os.path.join(OUT,'liga-4-inicio.png'),full_page=True)
    sw=pg.evaluate("(()=>{let w=document.querySelector('.ini-liga .lg-wrap');return [w.scrollWidth,w.clientWidth]})()")
    check('v11.42: la mini tabla del Inicio cabe en el móvil (390 px) sin cortar',sw[0]<=sw[1],sw)
    # Límite: 4 días al mes en gratis
    pg.evaluate("(()=>{let k=Object.keys(localStorage).find(k=>k.indexOf('mf_envios:')===0);let x=JSON.parse(localStorage.getItem(k));x.lg=['d1','d2','d3','d4'];localStorage.setItem(k,JSON.stringify(x))})()")
    pg.click('.ini-liga [data-lg=abrir]');pg.wait_for_timeout(200)
    pega(pg,'pegaT',T1)
    pg.click('#infoBody [data-lg=guardaP]');pg.wait_for_timeout(300)
    check('gratis: el 5º día sale el plan Pro y no guarda',pg.locator('#infoTitle').text_content()=='Plan Pro' and '4 días al mes' in pg.locator('#infoBody').inner_text() and len(pg.evaluate("window.__db.equipos[0].liga.tabla"))==3)
    ctx.close()
    # Federación Andaluza: automático (función liga-rfaf simulada)
    ctx,pg=abre(b,SEED)
    pedidos=[]
    def fn(route):
        q=json.loads(route.request.post_data or '{}');pedidos.append(q)
        if q.get('op')=='comps': d={'comps':[{'id':'48466184','n':'2ª Andaluza Alevín (Granada)'},{'id':'48466297','n':'3ª Andaluza Alevín (Granada)'}]}
        elif q.get('op')=='grupos': d={'grupos':[{'id':'48466185','n':'Grupo Único'}]}
        else: d={'tabla':[{'n':'ATLÉTICO VEGA','pts':25,'pj':9,'g':8,'e':1,'p':0,'gf':43,'gc':10},{'n':'C.D. NORTE','pts':23,'pj':9,'g':7,'e':2,'p':0,'gf':38,'gc':9},{'n':'U.D. SUR','pts':19,'pj':9,'g':6,'e':1,'p':2,'gf':44,'gc':26}],'res':{'j':9,'partidos':[{'l':'C.D. NORTE','v':'U.D. SUR','gl':5,'gv':7},{'l':'ATLÉTICO VEGA','v':'C.D. X','gl':None,'gv':None}]},'jornadas':[{'id':'9','n':'9 · 15-11-2026'},{'id':'12','n':'12 · 13-12-2026'}]}
        if q.get('op')=='jornada': d={'res':{'j':12,'partidos':[{'l':'U.D. SUR','v':'C.D. NORTE','gl':None,'gv':None,'f':'13/12/2026','h':'Pendiente','lu':'Campo Municipal Sur','est':'Sin jugar'}]}}
        route.fulfill(status=200,content_type='application/json',body=json.dumps(d))
    pg.route('**/functions/v1/liga-rfaf',fn)
    pg.click('[data-tab=partidos]');pg.click('[data-lg=abrir]');pg.wait_for_timeout(200)
    check('sale «Conectar con la Federación Andaluza»',pg.locator('#infoBody [data-lg=fed]').count()==1)
    pg.click('#infoBody [data-lg=fed]');pg.wait_for_timeout(150)
    pg.select_option('#lgFd','5');pg.wait_for_timeout(400)
    check('al elegir Granada carga sus competiciones',pg.locator('#lgFc option').count()==3 and pedidos[-1]=={'op':'comps','d':'5'},pedidos)
    pg.select_option('#lgFc','48466184');pg.wait_for_timeout(400)
    check('con un solo grupo lo elige solo',pg.input_value('#lgFg')=='48466185')
    pg.screenshot(path=os.path.join(OUT,'liga-5-federacion.png'))
    pg.click('#infoBody [data-lg=fedOk]');pg.wait_for_timeout(600)
    F=filas(pg)
    check('conectada: se ve la clasificación de la federación',len(F)==3 and F[1][1]=='C.D. NORTE' and pg.locator('#infoBody .lg-pos b').inner_text()=='2º',F)
    L=pg.evaluate("window.__db.equipos[0].liga")
    check('guarda delegación, competición, grupo y la jornada 9 (sin los partidos sin jugar)',L['fed']['d']=='5' and L['fed']['g']=='48466185' and L['nom'].startswith('2ª Andaluza Alevín') and [r for r in L['res'] if r['j']==9]==[{'j':9,'l':'C.D. NORTE','v':'U.D. SUR','gl':5,'gv':7}],L)
    check('muestra que está conectada','Federación Andaluza' in pg.locator('#infoBody .lg-fed.on').inner_text())
    pg.screenshot(path=os.path.join(OUT,'liga-6-conectada.png'),full_page=True)
    pg.locator('#info .dialog').screenshot(path=os.path.join(OUT,'liga-dossier.png'))
    pg.select_option('#lgFj','12');pg.wait_for_timeout(500)
    t=pg.locator('#infoBody .lg-jfed').inner_text()
    check('v11.42: «Ver jornada» enseña los partidos con fecha, campo y estado',pedidos[-1]=={'op':'jornada','d':'5','c':'48466184','g':'48466185','j':'12'} and 'Jornada 12' in t and '13/12/2026' in t and 'Campo Municipal Sur' in t and 'Sin jugar' in t and 'hora pendiente' in t,t[:200])
    check('v11.42: mi partido sale marcado y hay enlace a las actas',pg.locator('#infoBody .lg-pf.yo').count()==1 and pg.locator('#infoBody .lg-actas a').count()==1)
    pg.locator('#infoBody .lg-jfed').screenshot(path=os.path.join(OUT,'liga-7-jornada.png'))
    n=len(pedidos)
    pg.click('#closeInfo');pg.click('[data-lg=abrir] >> nth=0');pg.wait_for_timeout(400)
    check('al volver a abrirla enseguida no vuelve a leer la federación',len(pedidos)==n)
    pg.evaluate("(()=>{let n=Date.now;Date.now=()=>n()+4*36e5})()")
    pg.click('#closeInfo');pg.click('[data-tab=inicio]');pg.click('[data-tab=partidos]');pg.click('[data-lg=abrir] >> nth=0');pg.wait_for_timeout(600)
    check('si han pasado más de 3 horas se actualiza sola',len(pedidos)==n+1 and pedidos[-1]['op']=='liga',(n,len(pedidos)))
    pg.click('#infoBody [data-lg=fedQuita]');pg.wait_for_timeout(300)
    check('«Desconectar» quita la federación y deja la tabla',pg.evaluate("window.__db.equipos[0].liga.fed")is None and len(filas(pg))==3)
    ctx.close()
    # Pro: sin límite ni texto de límite
    ctx,pg=abre(b,SEED,pro=True)
    pg.click('[data-tab=partidos]');pg.click('[data-lg=abrir]');pg.wait_for_timeout(200)
    check('Pro: sin texto de límite',pg.locator('#infoBody .lim-q').count()==0)
    ctx.close()
    b.close()
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
sys.exit(0 if all(res) and not errs else 1)
