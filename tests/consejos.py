import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json,datetime,subprocess
from playwright.sync_api import sync_playwright
# v11.3 (consejos de un entrenador de fútbol sala): convocatoria por WhatsApp, enviar el entreno
# a los jugadores, pizarra limpia y vídeos de jugadas guardados en el dispositivo.
src=open(TESTS+'/entrenos.py',encoding='utf-8').read();FAKE=src.split('FAKE=r"""')[1].split('"""')[0]
HOY=datetime.date.today().isoformat()
NOM=['Pablo','Iván','Rubén','Dani','Sergio','Álex','Hugo','Marcos','Leo','Nico','Jorge','Raúl','Toni','Pepe','Luis','Kike']
def seed(tr):
    P=[{'id':f'p{i}','owner_id':'u1','modalidad':'fs','nombre':n,'foto':'','dorsal':i+1} for i,n in enumerate(NOM)]
    return {'futbol_personal_jugadores':P,'futbol_personal_partidos':[],'perfiles':[{'id':'u1','plan':'pro'}],'entrenamientos':tr}
EJ=[{'n':'Activación con balón','d':'Rondos 4x1, dos toques.','t':600},{'n':'Juego de 4','d':'Rotaciones ala-cierre.','t':1200}]
TR=[{'id':'t1','owner_id':'u1','modalidad':'fs','fecha':HOY,'hora':'19:30','nota':'Juego de 4 y defensa con cambio','asistencia':{},'ejercicios':EJ}]
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8831),functools.partial(H,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8831/index.html'
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
VID=os.path.join(OUT,'jugada-prueba.mp4')
if not os.path.exists(VID):
    try:subprocess.run(['ffmpeg','-loglevel','error','-y','-f','lavfi','-i','testsrc=size=320x180:rate=25','-t','2','-pix_fmt','yuv420p',VID],check=True)
    except Exception:open(VID,'wb').write(b'\x00\x00\x00\x18ftypmp42'+b'\x00'*2000)
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block');pg=ctx.new_page()
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' and 'media' not in m.text.lower() else None)
    pg.on('dialog',lambda d:d.accept())
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    pg.add_init_script('window.__seed='+json.dumps(seed(TR))+';try{localStorage.setItem("mf_tut_done","1")}catch(e){}')
    pg.goto(URL);pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto12');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)');pg.wait_for_timeout(400)
    if pg.locator('#info:not(.hidden)').count():pg.click('#closeInfo')
    check('CSP deja reproducir vídeos guardados (media-src blob:)',"media-src 'self' blob:" in open(REPO+'/index.html',encoding='utf-8').read())
    pg.click('[data-mode=fs]');pg.wait_for_timeout(200);pg.click('[data-tab=partidos]');pg.wait_for_timeout(300)
    # ---- Convocatoria
    check('botón Convocatoria en Partidos',pg.locator('#view [data-cv=abrir]').count()==1)
    check('sin convocatoria guardada no hay tarjeta',pg.locator('.cv-card').count()==0)
    pg.click('#view [data-cv=abrir]');pg.wait_for_selector('#info:not(.hidden) [data-cvt]')
    check('lista con toda la plantilla',pg.locator('[data-cvp]').count()==len(NOM))
    pg.fill('[data-cvf=rival]','CD Alhambra');pg.fill('[data-cvf=lugar]','Pabellón Municipal');pg.fill('[data-cvf=hora]','11:00');pg.fill('[data-cvf=cita]','10:15');pg.fill('[data-cvf=nota]','Equipación azul')
    pg.click('[data-cv=todos]');n=pg.locator('[data-cvp]:checked').count()
    check('«Todos» respeta el máximo de 14 en sala',n==14 and pg.inner_text('[data-cvn]')=='14',n)
    pg.click('[data-cv=ninguno]');check('«Ninguno» desmarca',pg.locator('[data-cvp]:checked').count()==0)
    for i in [0,3,5]:pg.locator(f'[data-cvp=p{i}]').check()
    t=pg.inner_text('[data-cvt]');print(t)
    check('mensaje con rival, lugar, horas y nota','Rival: CD Alhambra' in t and 'Pabellón Municipal' in t and 'Partido: 11:00 · Citación: 10:15' in t and 'Equipación azul' in t)
    check('mensaje con los 3 convocados y dorsal','*Convocados (3):*' in t and 'Pablo (1)' in t and 'Dani (4)' in t and 'Álex (6)' in t and 'Iván' not in t)
    href=pg.get_attribute('[data-cv=wa]','href')
    check('enlace de WhatsApp con el mensaje',href.startswith('https://wa.me/?text=') and 'CD%20Alhambra' in href)
    pg.locator('[data-cvp=p15]').check();pg.locator('[data-cvp=p15]').uncheck()
    s=pg.evaluate("JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('mf_conv:'))))")
    check('se guarda en el dispositivo',s['rival']=='CD Alhambra' and sorted(s['ids'])==['p0','p3','p5'] and s['cita']=='10:15')
    pg.click('#closeInfo');pg.wait_for_timeout(200)
    check('tarjeta de la convocatoria en Partidos',pg.locator('.cv-card').count()==1 and 'CD Alhambra' in pg.inner_text('.cv-card') and '3 convocados' in pg.inner_text('.cv-card'))
    pg.click('.cv-card [data-cv=abrir]');pg.wait_for_selector('#info:not(.hidden) [data-cvt]')
    check('al volver a abrir mantiene los datos',pg.input_value('[data-cvf=lugar]')=='Pabellón Municipal' and pg.locator('[data-cvp]:checked').count()==3)
    for i in [1,2,4,6]:pg.locator(f'[data-cvp=p{i}]').check()
    pg.click('[data-cv=partido]');pg.wait_for_timeout(300)
    check('crear partido: rival y convocados ya puestos',pg.input_value('#rival')=='CD Alhambra' and pg.locator('[data-field=called]:checked').count()==7)
    check('el partido tiene botón Convocatoria',pg.locator('#view [data-cv=desde]').count()==1)
    for i in [0,1,2,3,4]:pg.locator(f'[data-field=starter][data-id=p{i}]').check()
    pg.click('[data-action=save]');pg.wait_for_timeout(500)
    m=pg.evaluate("window.__db.futbol_personal_partidos[0]")
    al=json.loads(m['alineacion']) if m else {}
    check('partido guardado con citación y lugar',m and m['rival']=='CD Alhambra' and al.get('conv',{}).get('cita')=='10:15' and al['conv'].get('lugar')=='Pabellón Municipal',al.get('conv'))
    check('la lista de partidos enseña la citación','Citación 10:15' in pg.inner_text('#view'))
    pg.click('[data-action=edit-match]');pg.wait_for_timeout(300);pg.locator('[data-field=called][data-id=p6]').uncheck()
    pg.click('#view [data-cv=desde]');pg.wait_for_selector('#info:not(.hidden) [data-cvt]')
    t=pg.inner_text('[data-cvt]')
    check('convocatoria desde el partido usa sus convocados','*Convocados (6):*' in t and 'Hugo' not in t and pg.locator('[data-cv=partido]').count()==0)
    pg.click('#closeInfo');pg.click('[data-action=cancel] >> nth=0');pg.wait_for_timeout(200)
    # ---- Enviar el entreno
    pg.click('#trTab');pg.wait_for_timeout(400)
    check('campo «Qué vamos a trabajar»','Qué vamos a trabajar' in pg.inner_text('#view'))
    pg.click('[data-tr=enviar]');pg.wait_for_selector('#info:not(.hidden) pre')
    t=pg.inner_text('#infoBody pre');print(t)
    check('mensaje del entreno: día, hora y qué se trabaja','*ENTRENAMIENTO*' in t and '19:30' in t and 'Vamos a trabajar:* Juego de 4 y defensa con cambio' in t)
    check('mensaje del entreno: ejercicios explicados con tiempo','1. Activación con balón (10 min)' in t and 'Rondos 4x1' in t and '2. Juego de 4 (20 min)' in t)
    check('botón de WhatsApp del entreno','wa.me/?text=' in (pg.get_attribute('#infoBody a.primary','href') or ''))
    pg.click('#closeInfo')
    # ---- Pizarra limpia
    pg.click('[data-tab=pizarra]');pg.wait_for_selector('#bcanvas');pg.wait_for_timeout(300)
    check('pizarra normal: con rayas y escudo',pg.locator('#boardPanel.clean').count()==0 and pg.evaluate("getComputedStyle(document.querySelector('#bfield .wm')).display")!='none')
    pg.click('[data-b=clean]');pg.wait_for_timeout(200)
    bg=pg.evaluate("getComputedStyle(document.querySelector('#bfield')).backgroundImage")
    check('«Limpia»: campo liso sin escudo',pg.locator('#boardPanel.clean').count()==1 and bg=='none' and pg.evaluate("getComputedStyle(document.querySelector('#bfield .wm')).display")=='none',bg)
    check('«Limpia» se recuerda',json.loads(pg.evaluate("localStorage.getItem('mf_pizarra_v1')"))['fs'].get('clean') is True)
    pg.reload();pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto12');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)');pg.wait_for_timeout(400)
    if pg.locator('#info:not(.hidden)').count():pg.click('#closeInfo')
    pg.click('[data-mode=fs]');pg.click('[data-tab=pizarra]');pg.wait_for_selector('#bcanvas');pg.wait_for_timeout(200)
    check('sigue limpia al volver a entrar',pg.locator('#boardPanel.clean').count()==1)
    pg.click('[data-b=present]');pg.wait_for_timeout(200)
    check('pantalla completa y limpia a la vez',pg.locator('#boardPanel.clean.present').count()==1)
    pg.click('[data-b=present]');pg.wait_for_timeout(200)
    # ---- Vídeos de jugadas
    pg.click('[data-b=vids]')
    pg.wait_for_selector('#info:not(.hidden) .vj-up')
    check('vídeos: vacío al principio',pg.locator('.vj-vacio').count()==1)
    pg.set_input_files('[data-vjf]',VID);pg.wait_for_selector('.vj-it',timeout=5000)
    check('vídeo subido y en la lista',pg.locator('.vj-it').count()==1 and 'jugada-prueba' in pg.inner_text('.vj-list'))
    pg.click('[data-vj=ver]');pg.wait_for_selector('.vj-video');pg.wait_for_timeout(600)
    check('el vídeo se abre con su reproductor',pg.evaluate("document.querySelector('.vj-video').src.startsWith('blob:')"))
    pg.click('[data-vj=lista]');pg.wait_for_selector('.vj-it')
    pg.click('#closeInfo');pg.click('[data-mode="7"]');pg.wait_for_timeout(200);pg.click('[data-tab=pizarra]');pg.wait_for_timeout(200)
    pg.click('[data-b=vids]');pg.wait_for_timeout(400)
    check('cada modalidad tiene sus vídeos',pg.locator('.vj-it').count()==0)
    pg.click('#closeInfo');pg.click('[data-mode=fs]');pg.wait_for_timeout(200);pg.click('[data-tab=pizarra]');pg.wait_for_timeout(200)
    pg.click('[data-b=vids]');pg.wait_for_selector('.vj-it')
    pg.click('[data-vj=borrar]');pg.wait_for_selector('.vj-vacio',timeout=4000)
    check('borrar el vídeo',pg.locator('.vj-it').count()==0)
    pg.click('#closeInfo')
    # ---- Guía de uso y novedades
    v=json.load(open(REPO+'/version.json',encoding='utf-8'))
    check('novedades con texto',v['version'] and len(v['novedades'])>=1)
    js=open(REPO+'/app.js',encoding='utf-8').read()
    check('Guía de uso explica convocatoria, entreno, limpia y vídeos','t: "Convocatoria"' in js and 'Enviar el entreno a los jugadores</b>' in js and '<b>Limpia</b>' in js and '<b>Vídeos</b>' in js)
    check('sin errores en la página',not errs,errs[:3])
    b.close()
print(f'{sum(res)}/{len(res)} correctas');sys.exit(0 if all(res) else 1)
