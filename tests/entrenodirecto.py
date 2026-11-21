import sys,os,re;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json,datetime
from playwright.sync_api import sync_playwright
# Entreno en directo (v11.52): desde Entrenos se emite el entreno con la misma cámara y el mismo
# "Cloudflare" que el directo del partido. Enlace ?directo= sin marcador. Plan gratuito: 2 entrenos al mes.
FAKE=re.search(r'FAKE=r"""(.*?)"""',open(os.path.join(TESTS,'live.py'),encoding='utf-8').read(),re.S).group(1)
SFU=re.search(r'SFU=r"""(.*?)"""',open(os.path.join(TESTS,'video.py'),encoding='utf-8').read(),re.S).group(1)
HOY=datetime.date.today().isoformat()
P=[{'id':f'p{i}','owner_id':'u1','modalidad':'7','nombre':f'J{i}','foto':'','created_at':''} for i in range(4)]
T=[{'id':'t1','owner_id':'u1','modalidad':'7','fecha':HOY,'asistencia':{},'lugar':{'n':'Campo Municipal','lat':37.1,'lon':-3.6}}]
def seed(plan):return{'futbol_personal_jugadores':P,'futbol_personal_partidos':[],'entrenamientos':json.loads(json.dumps(T)),'perfiles':[{'id':'u1','plan':plan}]}
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8853),functools.partial(H,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8853/index.html'
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
ON="localStorage.setItem('mf_entrenos:u1','1');"
def page(b,sd,extra=''):
    ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block',accept_downloads=True,permissions=['camera','microphone'])
    pg=ctx.new_page()
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' and 'directo_vist' not in m.text else None)
    pg.on('dialog',lambda d:d.accept())
    pg.route('https://*.tile.openstreetmap.org/**',lambda r:r.fulfill(status=200,content_type='image/png',body=b''))
    pg.route('https://tile.openstreetmap.org/**',lambda r:r.fulfill(status=200,content_type='image/png',body=b''))
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    pg.add_init_script('window.__seed='+json.dumps(sd)+';'+SFU+ON+extra)
    return pg
def login(pg):
    pg.goto(URL);pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto12');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)');pg.wait_for_timeout(300)
def abre(pg):
    pg.click('[data-tab=entrenos]');pg.wait_for_selector('#view [data-tr=emite]')
    pg.click('#view [data-tr=emite]');pg.wait_for_selector('.cam canvas')
    pg.wait_for_function("()=>document.querySelector('.cam canvas').width>0",timeout=5000)
    pg.wait_for_selector('.cam [data-cam-lnk]',timeout=5000)
D=lambda pg,js:pg.evaluate('(()=>{let d=(window.__db.directos||[])[0];return '+js+'})()')
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
    pg=page(b,seed('gratis'));login(pg)
    pg.click('[data-tab=entrenos]');pg.wait_for_selector('#view [data-tr=emite]')
    check('en Entrenos hay botón «Emitir en directo»','emitir en directo' in pg.locator('#view [data-tr=emite]').inner_text().lower())
    pg.locator('#view [data-tr=emite]').scroll_into_view_if_needed();pg.screenshot(path=OUT+'/entrenodirecto_boton.png')
    pg.click('#view [data-tr=emite]');pg.wait_for_selector('.cam [data-cam-lnk]',timeout=5000)
    check('se crea el enlace del entreno de hoy (sin marcador)',D(pg,"d.partido_id==='tr:"+HOY+":u1'&&d.jornada==='🏃 Entreno'&&d.rival===''&&d.estado==='pre'"),D(pg,'JSON.stringify(d)'))
    check('lleva el campo del entreno',D(pg,"d.lugar&&d.lugar.n==='Campo Municipal'"))
    href=pg.locator('.cam [data-cam-lnk]').get_attribute('href')
    did=D(pg,'d.id')
    check('«Enviar el enlace» abre WhatsApp con el enlace del directo',href.startswith('https://wa.me/?text=') and ('%3Fdirecto%3D'+did) in href)
    check('dice cuántos gratis quedan este mes','2 gratis este mes' in pg.locator('.cam [data-cam=emit]').inner_text().lower())
    pg.wait_for_function("()=>document.querySelector('.cam canvas').width>0");pg.wait_for_timeout(400)
    px=pg.evaluate("(()=>{let c=document.querySelector('.cam canvas'),g=c.getContext('2d'),u=Math.min(c.width,c.height)/360;for(let x=0;x<c.width*0.5;x+=2){let d=g.getImageData(x,Math.round(20*u),1,1).data;if(d[0]<80&&d[1]>200&&d[2]<140)return true}return false})()")
    check('en el vídeo sale la etiqueta ENTRENO, no un marcador',px and pg.locator('.cam [data-cam=gf]').count()==0)
    pg.screenshot(path=OUT+'/entrenodirecto_camara.png')
    pg.click('.cam [data-cam=emit]')
    pg.wait_for_selector('text=● En directo',timeout=8000)
    fn=pg.evaluate('window.__fn[0]')
    check('plan gratuito: emite al servidor el directo del entreno',fn['b']['accion']=='emitir' and fn['b']['directo']==did)
    check('cuenta como 1 de los 2 del mes',pg.evaluate("JSON.parse(localStorage.getItem('mf_envios:u1:'+new Date().toISOString().slice(0,7))||'{}').etv.length")==1)
    check('se ve cuántos lo están viendo',pg.locator('.cam [data-viendo]').count()==1)
    pg.click('.cam [data-cam=rec]');pg.wait_for_timeout(1200)
    check('se puede grabar y emitir a la vez',pg.locator('.cam [data-cam=stop]').count()==1 and pg.locator('text=● En directo').count()==1)
    pg.click('.cam [data-cam=stop]');pg.wait_for_selector('.cam-fin')
    check('tras grabar se sigue emitiendo y se puede cortar',pg.locator('.cam [data-cam=unemit]').count()==1)
    pg.click('.cam [data-cam=unemit]');pg.wait_for_timeout(300)
    check('cortar avisa al servidor',pg.evaluate("window.__fn.some(x=>x.b.accion==='parar')"))
    pg.click('.cam [data-cam=again]');pg.wait_for_selector('.cam [data-cam=emit]')
    check('volver a emitir el mismo día no gasta otro','gratis' not in pg.locator('.cam [data-cam=emit]').inner_text().lower())
    # Gastados los 2 del mes (otro día cuenta aparte): sale el aviso del plan Pro, por encima de la cámara
    pg.evaluate("localStorage.setItem('mf_envios:u1:'+new Date().toISOString().slice(0,7),JSON.stringify({etv:['tr:x1','tr:x2']}))")
    n=pg.evaluate('window.__fn.length')
    pg.click('.cam [data-cam=emit]');pg.wait_for_timeout(500)
    check('sin entrenos gratis: aviso del plan Pro y no conecta',pg.evaluate('window.__fn.length')==n and pg.locator('#info').is_visible() and 'entrenos al mes' in pg.locator('#infoBody').inner_text())
    check('el aviso se ve encima de la cámara',pg.evaluate("+getComputedStyle(document.getElementById('info')).zIndex>+getComputedStyle(document.querySelector('.cam')).zIndex"))
    pg.screenshot(path=OUT+'/entrenodirecto_limite.png')
    pg.click('#closeInfo');pg.click('.cam [data-cam=close]');pg.wait_for_timeout(300)
    # Pro: ilimitado
    pr=page(b,seed('pro'));login(pr);abre(pr)
    check('con Pro no sale el tope','gratis' not in pr.locator('.cam [data-cam=emit]').inner_text().lower())
    pr.click('.cam [data-cam=emit]');pr.wait_for_selector('text=● En directo',timeout=8000)
    check('con Pro emite',pr.evaluate("window.__fn[0].b.accion")=='emitir')
    pr.click('.cam [data-cam=unemit]');pr.click('.cam [data-cam=close]');pr.wait_for_timeout(200)
    pr.click('#view [data-tr=emite]');pr.wait_for_selector('.cam [data-cam-lnk]',timeout=5000)
    check('abrirlo otra vez usa el mismo enlace del día',pr.evaluate("(window.__db.directos||[]).length")==1)
    pr.click('.cam [data-cam=close]')
    check('el entreno no sale como partido en directo en Inicio ni en Partidos',pr.locator('.lv').count()==0)
    # Página pública del entreno
    db=pg.evaluate('window.__db');db['directos'][0]['video_desde']=None
    pub=page(b,db);pub.goto(URL+'?directo='+did);pub.wait_for_selector('#pubData h2')
    t=pub.locator('#pubData').inner_text().lower()
    check('el enlace sin emitir dice que aún no ha empezado, sin marcador','entreno de' in t and 'todavía no está emitiendo' in t and pub.locator('.lv-score').count()==0,t)
    check('enseña dónde se entrena','campo municipal' in t)
    db['directos'][0]['video_desde']='2026-11-20T20:00:00Z'
    pv=page(b,db,'window.__hayVideo=true;');pv.goto(URL+'?directo='+did);pv.wait_for_selector('#pubData h2')
    pv.wait_for_selector('#pubVid:not(.hidden)',timeout=8000)
    check('emitiendo: la familia ve el vídeo en vivo','en directo' in pv.locator('#pubData').inner_text().lower() and pv.locator('.lv-score').count()==0)
    check('título de la página: entreno en directo','Entreno en directo' in pv.title())
    pv.screenshot(path=OUT+'/entrenodirecto_pub.png')
    b.close()
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
if errs:print('\n'.join('FALLA consola: '+e for e in errs))
sys.exit(0 if all(res) and not errs else 1)
