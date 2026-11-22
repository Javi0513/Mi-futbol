import sys,os,re;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json,datetime
from playwright.sync_api import sync_playwright
# Cámara externa (v11.55): el entrenador pega el enlace de YouTube (XbotGo, Veo…) en el Directo o en
# Entrenos y quien abre el enlace del directo ve el vídeo debajo del marcador. Gratis: 2 al mes.
FAKE=re.search(r'FAKE=r"""(.*?)"""',open(os.path.join(TESTS,'live.py'),encoding='utf-8').read(),re.S).group(1)
HOY=datetime.date.today().isoformat()
P=[{'id':f'p{i}','owner_id':'u1','modalidad':'7','nombre':f'J{i}','foto':'','created_at':''} for i in range(8)]
PART=[{'id':f'p{i}','nombre':f'J{i}','minutes':0,'goals':0,'starter':i<7} for i in range(8)]
def seed(plan):return{'futbol_personal_jugadores':P,'futbol_personal_partidos':[{'id':f'm{k}','owner_id':'u1','modalidad':'7','fecha':'2026-10-1'+str(k),'rival':'Rival '+str(k),'participaciones':json.dumps(PART),'alineacion':'{}','created_at':''} for k in (1,2,3)],'entrenamientos':[{'id':'t1','owner_id':'u1','modalidad':'7','fecha':HOY,'asistencia':{}}],'perfiles':[{'id':'u1','plan':plan}]}
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8861),functools.partial(H,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8861/index.html'
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
def page(b,sd,extra=''):
    ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block')
    pg=ctx.new_page()
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' and 'directo_vist' not in m.text and 'youtube' not in m.text.lower() else None)
    pg.on('dialog',lambda d:d.accept())
    # YouTube no se carga de verdad en las pruebas
    pg.route('https://www.youtube-nocookie.com/**',lambda r:r.fulfill(status=200,content_type='text/html',body='<body style="background:#000;color:#fff">VIDEO</body>'))
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    pg.add_init_script('window.__seed='+json.dumps(sd)+";localStorage.setItem('mf_entrenos:u1','1');"+extra)
    return pg
def login(pg):
    pg.goto(URL);pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto12');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)');pg.wait_for_timeout(300)
    if pg.locator('#info').is_visible():pg.evaluate("document.getElementById('info').classList.add('hidden')")
def directo(pg,mid):
    if pg.locator('[data-live=close]').count():pg.click('[data-live=close]')
    pg.click('[data-tab=partidos]');pg.click(f'[data-action=live][data-id={mid}]');pg.wait_for_selector('.lv-ext')
R=lambda pg,pid,js:pg.evaluate("(()=>{let d=(window.__db.directos||[]).find(z=>z.partido_id===%r);return %s})()"%(pid,js))
YT='https://youtube.com/live/AbCdEfGhIjK?si=xyz'
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=page(b,seed('gratis'));login(pg)
    directo(pg,'m1')
    check('en el Directo sale «📺 Cámara externa»','cámara externa' in pg.locator('.lv-ext').inner_text().lower())
    check('dice cuántos quedan en el plan gratuito','te quedan 2 de 2' in pg.locator('.lv-ext').inner_text())
    pg.locator('.lv-ext').scroll_into_view_if_needed();pg.screenshot(path=OUT+'/camext_vacio.png')
    pg.fill('#vextIn','https://www.youtube.com/@miclub');pg.click('[data-vext=pon]');pg.wait_for_timeout(200)
    check('un enlace de YouTube sin vídeo no vale',R(pg,'m1','!d.video_ext') and 'no es de un vídeo' in pg.locator('body').inner_text())
    pg.fill('#vextIn','hola');pg.click('[data-vext=pon]');pg.wait_for_timeout(200)
    check('un texto que no es enlace no vale',R(pg,'m1','!d.video_ext'))
    pg.fill('#vextIn',YT);pg.click('[data-vext=pon]');pg.wait_for_selector('.lv-ext-ok')
    check('se guarda el enlace de YouTube (limpio) en el directo',R(pg,'m1',"d.video_ext==='https://www.youtube.com/watch?v=AbCdEfGhIjK'"),R(pg,'m1','d.video_ext'))
    check('cuenta 1 de los 2 del mes',pg.evaluate("JSON.parse(localStorage.getItem('mf_envios:u1:'+new Date().toISOString().slice(0,7))||'{}').ext.length")==1)
    pg.locator('.lv-ext').scroll_into_view_if_needed();pg.screenshot(path=OUT+'/camext_puesto.png')
    did=R(pg,'m1','d.id')
    # Página pública
    pub=page(b,pg.evaluate('window.__db'));pub.goto(URL+'?directo='+did);pub.wait_for_selector('#pubExt iframe')
    src=pub.locator('#pubExt iframe').get_attribute('src')
    check('la familia ve el vídeo de YouTube (sin cookies, sin sonido al empezar)',src.startswith('https://www.youtube-nocookie.com/embed/AbCdEfGhIjK?') and 'mute=1' in src and 'playsinline=1' in src,src)
    y=pub.evaluate("(()=>{let b=document.querySelector('#pubTop').getBoundingClientRect(),f=document.querySelector('#pubExt iframe').getBoundingClientRect();return [b.bottom,f.top]})()")
    check('el marcador va justo encima del vídeo',y[0]<=y[1]<y[0]+30,y)
    check('y debajo siguen los goles','goles' in pub.locator('#pubMore').inner_text().lower())
    pub.screenshot(path=OUT+'/camext_familia.png')
    fr=pub.locator('#pubExt iframe').element_handle()
    pub.wait_for_timeout(10600)
    check('el vídeo no se vuelve a cargar cada 10 s',pub.locator('#pubExt iframe').element_handle().evaluate('(e,o)=>e===o',fr))
    pub.mouse.wheel(0,500);pub.wait_for_timeout(300)
    check('al bajar, el marcador se queda arriba',pub.evaluate("document.querySelector('#pubTop').getBoundingClientRect().top")>=-1)
    # Quitar
    pg.click('[data-vext=quita]');pg.wait_for_function("!(window.__db.directos||[]).find(z=>z.partido_id==='m1').video_ext")
    check('«Quitar el vídeo» lo quita',pg.locator('#vextIn').count()==1)
    pub.evaluate("window.__db.directos.find(z=>z.partido_id==='m1').video_ext=null")
    pub.wait_for_timeout(10600)
    check('y en el enlace de la familia desaparece',pub.locator('#pubExt iframe').count()==0 and pub.locator('#pubExt').is_hidden())
    # Veo: botón
    pg.fill('#vextIn','https://app.veo.co/matches/123-abc/');pg.click('[data-vext=pon]');pg.wait_for_selector('.lv-ext-ok')
    pub.evaluate("window.__db.directos.find(z=>z.partido_id==='m1').video_ext='https://app.veo.co/matches/123-abc/'")
    check('volver a poner en el mismo partido no gasta otro',pg.evaluate("JSON.parse(localStorage.getItem('mf_envios:u1:'+new Date().toISOString().slice(0,7))||'{}').ext.length")==1)
    pub.wait_for_timeout(10600)
    a=pub.locator('#pubExt a.pub-ext-btn')
    check('un enlace de Veo sale como botón «▶ Ver el vídeo»',a.count()==1 and 'app.veo.co' in a.inner_text().lower() and a.get_attribute('target')=='_blank')
    pub.close()
    # «Cambiar el enlace» y Cancelar
    pg.click('[data-vext=cambia]');pg.wait_for_selector('#vextIn')
    pg.click('[data-vext=no]');pg.wait_for_selector('.lv-ext-ok')
    check('«Cambiar el enlace» › Cancelar deja el que había',R(pg,'m1',"d.video_ext.includes('veo.co')"))
    # Segundo partido gasta el 2º; el tercero pide Pro
    directo(pg,'m2');pg.fill('#vextIn',YT);pg.click('[data-vext=pon]');pg.wait_for_selector('.lv-ext-ok')
    directo(pg,'m3')
    check('en el 3er partido ya no quedan',('te quedan 0 de 2' in pg.locator('.lv-ext').inner_text()))
    pg.fill('#vextIn',YT);pg.click('[data-vext=pon]');pg.wait_for_timeout(300)
    check('el 3er partido del mes pide el plan Pro',pg.locator('#info').is_visible() and 'cámara externa' in pg.locator('#infoBody').inner_text().lower() and R(pg,'m3','!d.video_ext'))
    pg.evaluate("document.getElementById('info').classList.add('hidden')")
    pg.click('[data-live=close]')
    # Entrenos
    pg.click('[data-tab=entrenos]');pg.wait_for_selector('#view [data-tr=ext]')
    check('en Entrenos hay botón «📺 Cámara externa»','cámara externa' in pg.locator('#view [data-tr=ext]').inner_text().lower())
    pg.click('#view [data-tr=ext]');pg.wait_for_selector('#infoBody .lv-ext')
    k='tr:'+HOY+':u1'
    check('se prepara el enlace del entreno de hoy',R(pg,k,"!!d&&d.jornada==='🏃 Entreno'") and pg.locator('#infoBody [data-cam-lnk]').get_attribute('href').startswith('https://wa.me/'))
    pg.screenshot(path=OUT+'/camext_entreno.png')
    ctx2=page(b,seed('pro'));login(ctx2)
    ctx2.click('[data-tab=entrenos]');ctx2.wait_for_selector('#view [data-tr=ext]');ctx2.click('#view [data-tr=ext]');ctx2.wait_for_selector('#infoBody #vextIn')
    check('con Pro no sale el tope',ctx2.locator('#infoBody .lim-q').count()==0)
    ctx2.fill('#vextIn','https://youtu.be/ZyXwVuTsRqP');ctx2.click('#infoBody [data-vext=pon]');ctx2.wait_for_selector('#infoBody .lv-ext-ok')
    did2=R(ctx2,k,'d.id')
    check('Pro: se guarda en el entreno',R(ctx2,k,"d.video_ext==='https://www.youtube.com/watch?v=ZyXwVuTsRqP'"))
    pub=page(b,ctx2.evaluate('window.__db'));pub.goto(URL+'?directo='+did2);pub.wait_for_selector('#pubExt iframe')
    t=pub.locator('#pubData').inner_text().lower()
    check('el enlace del entreno enseña el vídeo y dice «En directo»','en directo' in t and 'todavía no está emitiendo' not in t,t[:120])
    pub.screenshot(path=OUT+'/camext_entreno_familia.png')
    # CSP
    csp=open(os.path.join(APP,'index.html'),encoding='utf-8').read()
    check('la CSP deja ver YouTube (youtube-nocookie)','frame-src https://challenges.cloudflare.com https://www.youtube-nocookie.com' in csp)
    b.close()
check('sin errores en la página',not errs,errs[:5])
print(f'{sum(res)}/{len(res)}')
sys.exit(0 if all(res) else 1)
