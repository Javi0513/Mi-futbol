import sys,os,re;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json
from playwright.sync_api import sync_playwright
# Móvil en el trípode (v11.66): el entrenador deja el móvil esperando (pantalla encendida, cámara cerrada,
# directos.cam_est='espera') y el anotador abre la cámara («abrir») o la abre y emite («emit1»), como en
# supabase-anotador-tripode.sql. El anotador ve si emite (directos.cam_emi → «emi»).
FAKE=re.search(r'FAKE=r"""(.*?)"""',open(os.path.join(TESTS,'anotador.py'),encoding='utf-8').read(),re.S).group(1)
FAKE0=FAKE.replace("actualizado:d.actualizado,ahora:","cam:d.cam_est||'',cam_ord:d.cam_ord||null,actualizado:d.actualizado,ahora:")
FAKE=FAKE.replace("actualizado:d.actualizado,ahora:","cam:d.cam_est||'',cam_ord:d.cam_ord||null,sig:!!d.cam_sig,emi:!!d.cam_emi,actualizado:d.actualizado,ahora:")
CAMARA="""   if(n==='anotar_camara'){let d=AN(a.codigo);if(!d)return{error:{message:'NO_EXISTE'}};if(!d.cam_est)return{error:{message:'SIN_CAMARA'}};
     d.cam_ord={a:a.accion,n:((d.cam_ord&&d.cam_ord.n)||0)+1,at:new Date().toISOString()};d.actualizado=NOW();return{data:VA(d),error:null}}
   if(n==='anotar_quitar')"""
FAKE=FAKE.replace("   if(n==='anotar_quitar')",CAMARA);FAKE0=FAKE0.replace("   if(n==='anotar_quitar')",CAMARA)
P=[{'id':f'p{i}','owner_id':'u1','modalidad':'7','nombre':f'J{i}','dorsal':str(i+1),'foto':'','created_at':''} for i in range(8)]
PART=[{'id':f'p{i}','nombre':f'J{i}','minutes':0,'goals':0,'starter':i<7} for i in range(8)]
SEED={'futbol_personal_jugadores':P,'futbol_personal_partidos':[{'id':'m1','owner_id':'u1','modalidad':'7','fecha':'2026-11-08','rival':'Los Pinos','participaciones':json.dumps(PART),'alineacion':'{}','created_at':''}],'perfiles':[{'id':'u1','plan':'gratis'}]}
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8879),functools.partial(H,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8879/index.html'
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
def page(b,seed,fake=None):
    pg=b.new_context(viewport={'width':390,'height':844},service_workers='block',permissions=['camera','microphone']).new_page()
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)))
    pg.on('dialog',lambda d:d.accept())
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=fake or FAKE))
    pg.add_init_script('window.__seed='+json.dumps(seed)+';')
    return pg
D=lambda pg,js:pg.evaluate('(()=>{let d=(window.__db.directos||[])[0];return '+js+'})()')
wait=lambda pg,js,t=9000:pg.wait_for_function('()=>{let d=(window.__db.directos||[])[0];return '+js+'}',timeout=t)
SIG="window.__mfSgEst()"
def manda(pg,an,k):
    """El anotador pulsa y la orden llega al móvil que graba (cada uno tiene su copia de la base de datos)"""
    an.click(f'[data-anc={k}]');an.wait_for_timeout(300)
    o=an.evaluate('window.__db.directos[0].cam_ord')
    pg.evaluate('o=>{let d=window.__db.directos[0];d.cam_ord=o;d.actualizado=new Date(Date.now()+o.n*1e6).toISOString()}',o)
    return o
PN=[0]
def pasa(pg,an):
    PN[0]+=1;an.evaluate('([d,k])=>{d[0].actualizado=new Date(Date.now()+k*1e8).toISOString();window.__db.directos=d}',[pg.evaluate('window.__db.directos'),PN[0]])
WL="window.__wl={n:0};Object.defineProperty(navigator,'wakeLock',{configurable:true,value:{request:async()=>{window.__wl.n++;const et=new EventTarget();et.released=false;et.release=async()=>{et.released=true};window.__wl.s=et;return et}}});"
def coach(b,seed):
    pg=page(b,seed);pg.add_init_script(WL)
    pg.goto(URL);pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto12');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)');pg.wait_for_timeout(200)
    if pg.locator('#info').is_visible():pg.evaluate("document.getElementById('info').classList.add('hidden')")
    pg.click('[data-tab=partidos]');pg.click('[data-action=live][data-id=m1]');pg.wait_for_selector('.lv-board')
    return pg
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required'])
    pg=coach(b,SEED)
    check('sin enlace del anotador no sale «Dejar en el trípode»',pg.locator('[data-live=tri]').count()==0)
    pg.click('[data-live=anon]');pg.wait_for_selector('#anUrl')
    code=D(pg,'d.anotador')
    check('con anotador sale «📱 Dejar en el trípode»',pg.locator('[data-live=tri]').count()==1)
    pg.click('[data-live=tri]');pg.wait_for_selector('.tri');wait(pg,"d.cam_est==='espera'")
    check('sale la pantalla de espera, con la cámara cerrada',pg.locator('.cam').count()==0 and 'Esperando al anotador' in pg.locator('.tri').inner_text())
    check('y pide que la pantalla no se apague',pg.evaluate('window.__wl.n')>=1 and 'Pantalla encendida' in pg.locator('.tri [data-camluz]').inner_text(),pg.locator('.tri [data-camluz]').inner_text())
    check('avisa al anotador (cam_est = espera)',True)
    pg.screenshot(path=OUT+'/tripode_espera.png')
    an=page(b,pg.evaluate('window.__db'));an.goto(URL+'?anotar='+code);an.wait_for_selector('#anData [data-anc=abrir]',timeout=9000)
    t=an.locator('.an-cam').inner_text()
    check('el anotador ve que el móvil del trípode está preparado y «Abrir la cámara»','preparado' in t and an.locator('[data-anc=emit1]').count()==1 and an.locator('[data-anc=sig1]').count()==0,t)
    an.screenshot(path=OUT+'/tripode_anotador.png',full_page=True)
    o=manda(pg,an,'abrir')
    check('pulsar manda la orden «abrir»',o['a']=='abrir',o)
    check('y le dice que se abre en unos segundos','se abre en el móvil del trípode' in an.locator('.message').inner_text())
    pg.wait_for_function("()=>document.querySelector('.cam canvas')&&document.querySelector('.cam canvas').width>0",timeout=9000)
    wait(pg,"d.cam_est==='lista' && d.cam_emi===false")
    check('el móvil del trípode abre la cámara solo y quita la espera',pg.locator('.tri').count()==0 and pg.locator('.cam [data-cam=rec]').count()==1)
    pg.wait_for_function("()=>/Pantalla encendida/.test((document.querySelector('.cam [data-camluz]')||{}).textContent||'')",timeout=5000)
    check('la pantalla sigue protegida con la cámara abierta','Pantalla encendida' in pg.locator('.cam [data-camluz]').inner_text())
    pasa(pg,an);an.wait_for_selector('#anData [data-anc=rec]',timeout=9000)
    t=an.locator('.an-cam').inner_text()
    check('el anotador ya puede grabar y emitir para la familia',an.locator('[data-anc=emit1]').count()==1 and 'Directo para la familia' in t,t)
    o=manda(pg,an,'rec');wait(pg,"d.cam_est==='rec'")
    check('y la orden de grabar llega después de abrir la cámara',pg.locator('.cam [data-cam=stop]').count()==1)
    o=manda(pg,an,'emit1');pg.wait_for_function("()=>/plan Pro/.test(document.getElementById('message').innerText)",timeout=9000)
    check('«Emitir» llega al móvil (sin Pro: avisa de que es del plan Pro, la grabación sigue)',pg.locator('.cam [data-cam=stop]').count()==1)
    pg.click('.cam [data-cam=stop]');pg.wait_for_selector('.cam-fin');pg.click('.cam [data-cam=close]');wait(pg,'d.cam_est===null')
    # 2) «Abrir y emitir» desde la espera
    pg.click('[data-live=tri]');pg.wait_for_selector('.tri');wait(pg,"d.cam_est==='espera'")
    pasa(pg,an);an.wait_for_selector('#anData [data-anc=emit1]',timeout=9000)
    o=manda(pg,an,'emit1')
    pg.wait_for_function("()=>document.querySelector('.cam canvas')&&document.querySelector('.cam canvas').width>0",timeout=9000)
    pg.wait_for_selector('.tri',state='detached',timeout=5000)
    check('«Abrir y emitir» abre la cámara e intenta emitir',pg.locator('.tri').count()==0 and pg.locator('.cam').count()==1)
    pg.click('.cam [data-cam=close]');wait(pg,'d.cam_est===null')
    # 3) Una orden vieja no abre la cámara al dejarlo en el trípode; «Salir» lo quita
    pg.click('[data-live=tri]');pg.wait_for_selector('.tri');wait(pg,"d.cam_est==='espera'");pg.wait_for_timeout(5000)
    check('las órdenes de antes de dejarlo en el trípode no se hacen',pg.locator('.cam').count()==0)
    pg.click('.tri [data-tri=salir]');wait(pg,'d.cam_est===null')
    check('«Salir» quita la espera y suelta la pantalla',pg.locator('.tri').count()==0 and pg.evaluate('window.__wl.s.released===true'))
    # 4) «Abrir la cámara ya» en el propio móvil
    pg.click('[data-live=tri]');pg.wait_for_selector('.tri');pg.click('.tri [data-tri=abrir]')
    pg.wait_for_function("()=>document.querySelector('.cam canvas')&&document.querySelector('.cam canvas').width>0",timeout=9000)
    pg.wait_for_selector('.tri',state='detached',timeout=5000)
    check('«Abrir la cámara ya» la abre desde el propio móvil',pg.locator('.tri').count()==0)
    pg.click('.cam [data-cam=close]')
    # 5) Sin el SQL nuevo, el anotador no ve el directo para la familia y nada se rompe
    an2=page(b,pg.evaluate('window.__db'),FAKE0);an2.goto(URL+'?anotar='+code);an2.wait_for_selector('#anData .lv-board')
    an2.evaluate('()=>{window.__db.directos[0].cam_est="lista";window.__db.directos[0].actualizado=new Date(Date.now()+3e7).toISOString()}');an2.wait_for_selector('#anData [data-anc=rec]',timeout=9000)
    check('sin supabase-anotador-tripode.sql no sale «Emitir» en el anotador (grabar sigue igual)',an2.locator('[data-anc=emit1]').count()==0)
    b.close()
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
sys.exit(0 if all(res) and not errs else 1)
