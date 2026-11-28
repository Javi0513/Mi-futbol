import sys,os,re;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json,datetime
from playwright.sync_api import sync_playwright
# v11.71 «📐 Lente 0,5x o 1x»: con el móvil fijo en la banda, la 0,5x mete las dos porterías.
# La cámara de prueba de Chromium no tiene zoom: se simula un móvil con zoom 0,5-4 (como Android).
FAKE=re.search(r'FAKE=r"""(.*?)"""',open(os.path.join(TESTS,'live.py'),encoding='utf-8').read(),re.S).group(1)
HOY=datetime.date.today().isoformat()
P=[{'id':f'p{i}','owner_id':'u1','modalidad':'7','nombre':f'J{i}','foto':'','created_at':''} for i in range(8)]
PART=[{'id':f'p{i}','nombre':f'J{i}','minutes':0,'goals':0,'starter':i<7} for i in range(8)]
def seed(plan):return{'futbol_personal_jugadores':P,'futbol_personal_partidos':[{'id':f'm{k}','owner_id':'u1','modalidad':'7','fecha':'2026-10-1'+str(k),'rival':'Rival '+str(k),'participaciones':json.dumps(PART),'alineacion':'{}','created_at':''} for k in (1,2,3)],'entrenamientos':[{'id':'t1','owner_id':'u1','modalidad':'7','fecha':HOY,'asistencia':{}}],'perfiles':[{'id':'u1','plan':plan}]}
ZOOM="""(()=>{window.__zoom=1;window.__zc=[];const T=MediaStreamTrack.prototype;
T.getCapabilities=function(){return {zoom:{min:0.5,max:4,step:0.1}}};
const gs=T.getSettings;T.getSettings=function(){return Object.assign({},gs.call(this),{zoom:window.__zoom})};
const ac=T.applyConstraints;T.applyConstraints=function(c){if(c&&c.advanced&&c.advanced[0]&&'zoom' in c.advanced[0]){window.__zoom=c.advanced[0].zoom;window.__zc.push(window.__zoom);return Promise.resolve()}return ac.call(this,c)}})();"""
class Hh(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8891),functools.partial(Hh,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8891/index.html'
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
def page(b,sd,extra=''):
    ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block',permissions=['camera','microphone'])
    pg=ctx.new_page()
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' and 'directo_vist' not in m.text else None)
    pg.on('dialog',lambda d:d.accept())
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    pg.add_init_script('window.__seed='+json.dumps(sd)+";localStorage.setItem('mf_entrenos:u1','1');localStorage.setItem('mf_novedades_visto','99');localStorage.setItem('mf_tut_done','1');"+extra)
    return pg
def login(pg):
    pg.goto(URL);pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto12');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)');pg.wait_for_timeout(300)
    if pg.locator('#info').is_visible():pg.evaluate("document.getElementById('info').classList.add('hidden')")
def camara(pg,mid):
    pg.click('[data-tab=partidos]');pg.click(f'[data-action=live][data-id={mid}]');pg.wait_for_selector('[data-live=cam]')
    pg.click('[data-live=cam]');pg.wait_for_selector('.cam canvas')
    pg.wait_for_function("()=>document.querySelector('.cam canvas').width>0",timeout=8000);pg.wait_for_timeout(400)
MES="JSON.parse(localStorage.getItem('mf_envios:u1:'+new Date().toISOString().slice(0,7))||'{}')"
BT=lambda pg:pg.locator('.cam [data-cam=lente]').text_content()
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
    # 1) Móvil sin 0,5x: avisa y no gasta
    pg=page(b,seed('gratis'));login(pg);camara(pg,'m1')
    check('en la cámara sale «📐 Lente: 1x» con los gratis del mes','Lente: 1x · 0,5x: 3 gratis este mes' in BT(pg),BT(pg))
    pg.click('.cam [data-cam=lente]');pg.wait_for_timeout(800)
    check('si el móvil no tiene 0,5x avisa','no deja usar la lente 0,5x' in pg.locator('body').inner_text())
    check('y no gasta ninguno de los gratis',not pg.evaluate(MES).get('lente') and 'Lente: 1x' in BT(pg))
    pg.close()
    # 2) Móvil con zoom 0,5x (plan gratuito)
    pg=page(b,seed('gratis'),ZOOM);login(pg);camara(pg,'m1')
    pg.click('.cam [data-cam=lente]');pg.wait_for_function("()=>/0,5x \\(más campo\\)/.test(document.querySelector('.cam [data-cam=lente]').textContent)",timeout=5000)
    check('pasa a 0,5x con el zoom de la cámara',pg.evaluate('window.__zoom')==0.5,pg.evaluate('window.__zc'))
    check('avisa de que se ve más campo','Lente 0,5x' in pg.locator('body').inner_text())
    check('cuenta 1 de los 3 del mes',pg.evaluate(MES).get('lente')==['m1'])
    check('se acuerda para la próxima vez',pg.evaluate("localStorage.getItem('mf_cam_lente')")=='05')
    pg.screenshot(path=OUT+'/lente_05.png')
    pg.click('.cam [data-cam=lente]');pg.wait_for_function("()=>/Lente: 1x/.test(document.querySelector('.cam [data-cam=lente]').textContent)",timeout=5000)
    check('vuelve a 1x',pg.evaluate('window.__zoom')==1 and pg.evaluate("localStorage.getItem('mf_cam_lente')")=='1')
    # Mientras graba
    pg.click('.cam [data-cam=rec]');pg.wait_for_selector('.cam [data-cam=stop]');pg.wait_for_timeout(800)
    pg.click('.cam [data-cam=lente]');pg.wait_for_timeout(800)
    check('se cambia también mientras graba, sin cortar',pg.evaluate('window.__zoom')==0.5 and pg.locator('.cam [data-cam=stop]').count()==1)
    check('volver a ponerla en el mismo partido no gasta otro',pg.evaluate(MES).get('lente')==['m1'])
    pg.click('.cam [data-cam=stop]');pg.wait_for_selector('.cam-fin')
    pg.close()
    # 3) Sin gratis este mes
    pg=page(b,seed('gratis'),ZOOM+"localStorage.setItem('mf_envios:u1:'+new Date().toISOString().slice(0,7),JSON.stringify({lente:['a','b','c']}));");login(pg);camara(pg,'m2')
    check('sin gratis: «0 gratis este mes»','0 gratis este mes' in BT(pg))
    pg.click('.cam [data-cam=lente]');pg.wait_for_timeout(600)
    check('el cuarto del mes pide Pro y no se pone',pg.evaluate('window.__zoom')==1 and 'lente 0,5x' in pg.locator('body').inner_text().lower() and 'Pro' in pg.locator('body').inner_text())
    pg.close()
    # 4) Entrenos
    pg=page(b,seed('gratis'));login(pg)
    pg.click('[data-tab=entrenos]');pg.wait_for_selector('#view [data-tr=rec]');pg.click('#view [data-tr=rec]');pg.wait_for_selector('.cam canvas');pg.wait_for_timeout(500)
    check('en «Grabar el entreno» también está «📐 Lente»',pg.locator('.cam [data-cam=lente]').count()==1)
    pg.close()
    # 5) Pro: sin límite y se pone sola la próxima vez
    pg=page(b,seed('pro'),ZOOM+"localStorage.setItem('mf_cam_lente','05');");login(pg);camara(pg,'m3')
    pg.wait_for_function("()=>/0,5x/.test(document.querySelector('.cam [data-cam=lente]').textContent)",timeout=5000)
    check('con Pro, la 0,5x se pone sola si se usó la última vez',pg.evaluate('window.__zoom')==0.5)
    check('con Pro no dice nada de gratis','gratis' not in BT(pg))
    pg.close()
    b.close()
print('errores:',errs[:5])
check('sin errores en la consola',not errs,errs[:3])
print('PASS',sum(res),'/',len(res),[i for i,x in enumerate(res) if not x])
sys.exit(0 if all(res) else 1)
