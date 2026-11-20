import sys,os,re;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json
from playwright.sync_api import sync_playwright
# Directo con el móvil en el trípode (v11.50): la imagen sale derecha aunque el móvil tenga la rotación
# bloqueada (sensor de movimiento o a mano), aviso de cómo dejar la pantalla siempre encendida si se apagó,
# y en el enlace de la familia: pantalla encendida, vídeo en grande al girar el móvil y reconexión.
FAKE=re.search(r'FAKE=r"""(.*?)"""',open(os.path.join(TESTS,'live.py'),encoding='utf-8').read(),re.S).group(1)
SFU=re.search(r'SFU=r"""(.*?)"""',open(os.path.join(TESTS,'video.py'),encoding='utf-8').read(),re.S).group(1)
HOOK=r"""
window.__wl=0;if(navigator.wakeLock){const _r=navigator.wakeLock.request.bind(navigator.wakeLock);navigator.wakeLock.request=(t)=>{window.__wl++;return _r(t).catch(()=>({released:false,release:async()=>{},addEventListener(){}}))}}
window.__hid=false;Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.__hid});Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.__hid?'hidden':'visible'});
"""
P=[{'id':f'p{i}','owner_id':'u1','modalidad':'7','nombre':f'J{i}','foto':'','created_at':''} for i in range(8)]
PART=[{'id':f'p{i}','nombre':f'J{i}','minutes':0,'goals':0,'starter':i<7} for i in range(8)]
def seed(plan):return{'futbol_personal_jugadores':P,'futbol_personal_partidos':[{'id':'m1','owner_id':'u1','modalidad':'7','fecha':'2026-10-18','rival':'Los Pinos','participaciones':json.dumps(PART),'alineacion':'{}','created_at':''}],'perfiles':[{'id':'u1','plan':plan}]}
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8871),functools.partial(H,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8871/index.html'
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
def page(b,sd,extra='',vp=(390,844)):
    ctx=b.new_context(viewport={'width':vp[0],'height':vp[1]},service_workers='block',accept_downloads=True,permissions=['camera','microphone'])
    pg=ctx.new_page()
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)))
    pg.on('dialog',lambda d:d.accept())
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    pg.add_init_script('window.__seed='+json.dumps(sd)+';'+SFU+HOOK+extra)
    return pg
def login(pg):
    pg.goto(URL);pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto12');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)');pg.wait_for_timeout(200)
def abre(pg):
    pg.click('[data-tab=partidos]');pg.click('[data-action=live][data-id=m1]');pg.wait_for_selector('.lv-board')
    pg.click('[data-live=start]');pg.wait_for_function("()=>(window.__db.directos||[])[0].estado==='1T'")
    pg.click('[data-live=cam]');pg.wait_for_function("()=>document.querySelector('.cam canvas')&&document.querySelector('.cam canvas').width>0",timeout=5000);pg.wait_for_timeout(400)
def grav(pg,x,y):
    pg.evaluate(f"window.dispatchEvent(new DeviceMotionEvent('devicemotion',{{accelerationIncludingGravity:{{x:{x},y:{y},z:0}}}}))")
    pg.wait_for_timeout(1150);pg.evaluate(f"window.dispatchEvent(new DeviceMotionEvent('devicemotion',{{accelerationIncludingGravity:{{x:{x},y:{y},z:0}}}}))");pg.wait_for_timeout(300)
DIM="(()=>{let c=document.querySelector('.cam canvas');return [c.width,c.height]})()"
ROT="document.querySelector('.cam canvas').style.transform"
GIRO=lambda pg:pg.locator('[data-cam=giro]').text_content()
def vis(pg,h):pg.evaluate(f"window.__hid={'true' if h else 'false'};document.dispatchEvent(new Event('visibilitychange'))");pg.wait_for_timeout(400)
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required'])
    # 1) Imagen derecha con la rotación bloqueada
    pg=page(b,seed('gratis'));login(pg);abre(pg)
    W,H=pg.evaluate(DIM)
    check('la cámara tiene el botón «🔄 Imagen: Automática»','Imagen: Automática' in GIRO(pg),GIRO(pg))
    check('el consejo dice qué hacer si la imagen sale de lado y cómo dejar la pantalla encendida','si la imagen sale de lado' in pg.locator('.cam-tip').inner_text() and 'Bloqueo automático' in pg.locator('.cam-tip').inner_text())
    check('con el móvil derecho la imagen no se gira',pg.evaluate(DIM)==[W,H] and not pg.evaluate(ROT),[W,H])
    grav(pg,9.8,0)
    check('móvil en horizontal con la app en vertical (rotación bloqueada): la imagen se endereza',pg.evaluate(DIM)==[H,W],pg.evaluate(DIM))
    check('y en la pantalla del entrenador se ve derecha con el móvil en la mano','rotate(-270deg)' in pg.evaluate(ROT),pg.evaluate(ROT))
    pg.click('[data-cam=rec]');pg.wait_for_selector('[data-cam=stop]');pg.wait_for_timeout(1200)
    check('se graba con la imagen enderezada',pg.evaluate(DIM)==[H,W])
    grav(pg,-9.8,0)
    check('girado hacia el otro lado también se endereza',pg.evaluate(DIM)==[H,W] and 'rotate(-90deg)' in pg.evaluate(ROT),pg.evaluate(ROT))
    grav(pg,0,9.8)
    check('al ponerlo derecho vuelve a la imagen normal sin cortar la grabación',pg.evaluate(DIM)==[W,H] and not pg.evaluate(ROT) and pg.locator('[data-cam=stop]').count()==1)
    pg.evaluate("window.dispatchEvent(new DeviceMotionEvent('devicemotion',{accelerationIncludingGravity:{x:9.8,y:0,z:0}}))");pg.wait_for_timeout(300)
    check('un movimiento corto no gira la imagen (espera 1 s quieto)',pg.evaluate(DIM)==[W,H])
    grav(pg,0,9.8)
    pg.click('[data-cam=giro]');pg.wait_for_timeout(300)
    check('a mano: «Girada ↶»','Girada ↶' in GIRO(pg) and pg.evaluate(DIM)==[H,W],GIRO(pg))
    check('se recuerda para la próxima vez',pg.evaluate("localStorage.getItem('mf_cam_giro')")=='270')
    pg.click('[data-cam=giro]');pg.wait_for_timeout(300)
    check('a mano: «Girada ↷»','Girada ↷' in GIRO(pg) and pg.evaluate(DIM)==[H,W] and 'rotate(-90deg)' in pg.evaluate(ROT))
    pg.click('[data-cam=giro]');pg.wait_for_timeout(300)
    check('a mano: «Sin girar» aunque el sensor diga horizontal',(grav(pg,9.8,0) or True) and 'Sin girar' in GIRO(pg) and pg.evaluate(DIM)==[W,H])
    pg.click('[data-cam=giro]');pg.wait_for_timeout(300)
    check('y otra vez «Automática»','Automática' in GIRO(pg) and pg.evaluate(DIM)==[H,W])
    # 2) La pantalla se apagó grabando: al volver, dice qué tocar
    vis(pg,True);vis(pg,False)
    m=pg.locator('.message').inner_text()
    check('si la app salió de la pantalla grabando, al volver explica cómo dejarla siempre encendida','Tiempo de espera de la pantalla' in m and 'ahorro de batería' in m,m[:200])
    check('la grabación sigue',pg.locator('[data-cam=stop]').count()==1)
    pg.click('[data-cam=stop]');pg.wait_for_selector('.cam-fin')
    check('lo grabado queda listo para guardar',pg.locator('[data-cam=save]').count()==1)
    pg.click('[data-cam=save]');pg.click('[data-cam=close]');pg.wait_for_selector('.lv-board')
    did=pg.evaluate("(window.__db.directos||[])[0].id")
    # 2b) En iPhone, el aviso habla de Bloqueo automático y Modo de bajo consumo
    ip=page(b,seed('pro'),"Object.defineProperty(navigator,'userAgent',{get:()=>'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'});")
    login(ip);abre(ip)
    ip.click('[data-cam=emit]');ip.wait_for_selector('text=● En directo',timeout=8000)
    vis(ip,True);vis(ip,False)
    m=ip.locator('.message').inner_text()
    check('iPhone emitiendo: al volver dice «Bloqueo automático › Nunca» y lo del Modo de bajo consumo','Bloqueo automático › Nunca' in m and 'Modo de bajo consumo' in m and 'directo se vuelve a conectar' in m,m[:220])
    v=ip.evaluate("(()=>{let v=document.querySelector('video.luz-vid');return v?{on:!v.paused,loop:v.loop}:null})()")
    check('en iPhone el vídeo que mantiene la pantalla encendida no va en bucle (el iPhone no lo cuenta)',v and v['on'] and not v['loop'],v)
    ip.click('[data-cam=unemit]');ip.click('[data-cam=close]')
    # 3) La familia en el enlace del directo
    db=pg.evaluate('window.__db');db['directos'][0]['video_desde']='2026-10-23T20:00:00Z'
    pub=page(b,db,'window.__hayVideo=true;');pub.goto(URL+'?directo='+did);pub.wait_for_selector('#pub .lv-board')
    pub.wait_for_selector('#pubVid:not(.hidden)',timeout=8000);pub.wait_for_timeout(600)
    check('mientras la familia ve el vídeo se pide que su pantalla no se apague',pub.evaluate('window.__wl')>=1 or pub.evaluate("!!document.querySelector('video.luz-vid')&&!document.querySelector('video.luz-vid').paused"))
    check('en vertical dice que gire el móvil para verlo en grande',pub.locator('.pub-gira').is_visible())
    pub.set_viewport_size({'width':844,'height':390});pub.wait_for_timeout(300)
    r=pub.evaluate("(()=>{let r=document.querySelector('#pubVid video').getBoundingClientRect();return [r.left,r.top,r.width,r.height,getComputedStyle(document.querySelector('#pubVid video')).position]})()")
    check('al girar el móvil el vídeo ocupa toda la pantalla',r[4]=='fixed' and r[0]==0 and r[1]==0 and r[2]==844 and r[3]==390,r)
    check('y el botón de sonido sigue a mano',pub.locator('[data-pubsound]').is_visible())
    pub.screenshot(path=OUT+'/giro_pub_horizontal.png')
    pub.set_viewport_size({'width':390,'height':844});pub.wait_for_timeout(300)
    check('al volver a vertical, vuelve a su sitio con el marcador debajo',pub.evaluate("getComputedStyle(document.querySelector('#pubVid video')).position")!='fixed')
    b.close()
print(('PASS' if all(res) else 'FAIL'),sum(res),'/',len(res),errs[:5])
sys.exit(0 if all(res) and not errs else 1)
