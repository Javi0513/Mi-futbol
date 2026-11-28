import sys,os,re;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json
from playwright.sync_api import sync_playwright
# «🎯 Seguir la jugada» desde el anotador (v11.62): el móvil que graba dice si sigue la jugada (directos.cam_sig)
# y hace las órdenes sig1 / sig0 del anotador (directos.cam_ord), como en supabase-anotador-sigue.sql.
FAKE=re.search(r'FAKE=r"""(.*?)"""',open(os.path.join(TESTS,'anotador.py'),encoding='utf-8').read(),re.S).group(1)
FAKE0=FAKE.replace("actualizado:d.actualizado,ahora:","cam:d.cam_est||'',cam_ord:d.cam_ord||null,actualizado:d.actualizado,ahora:")
FAKE=FAKE.replace("actualizado:d.actualizado,ahora:","cam:d.cam_est||'',cam_ord:d.cam_ord||null,sig:!!d.cam_sig,enc:d.cam_enc||'a',len:d.cam_len||'1',actualizado:d.actualizado,ahora:")
CAMARA="""   if(n==='anotar_camara'){let d=AN(a.codigo);if(!d)return{error:{message:'NO_EXISTE'}};if(!d.cam_est)return{error:{message:'SIN_CAMARA'}};
     d.cam_ord={a:a.accion,n:((d.cam_ord&&d.cam_ord.n)||0)+1,at:new Date().toISOString()};d.actualizado=NOW();return{data:VA(d),error:null}}
   if(n==='anotar_quitar')"""
FAKE=FAKE.replace("   if(n==='anotar_quitar')",CAMARA);FAKE0=FAKE0.replace("   if(n==='anotar_quitar')",CAMARA)
P=[{'id':f'p{i}','owner_id':'u1','modalidad':'7','nombre':f'J{i}','dorsal':str(i+1),'foto':'','created_at':''} for i in range(8)]
PART=[{'id':f'p{i}','nombre':f'J{i}','minutes':0,'goals':0,'starter':i<7} for i in range(8)]
SEED={'futbol_personal_jugadores':P,'futbol_personal_partidos':[{'id':'m1','owner_id':'u1','modalidad':'7','fecha':'2026-11-08','rival':'Los Pinos','participaciones':json.dumps(PART),'alineacion':'{}','created_at':''}],'perfiles':[{'id':'u1','plan':'gratis'}]}
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8873),functools.partial(H,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8873/index.html'
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
ZOOM="""(()=>{window.__zoom=1;const T=MediaStreamTrack.prototype;T.getCapabilities=function(){return {zoom:{min:0.5,max:4,step:0.1}}};const gs=T.getSettings;T.getSettings=function(){return Object.assign({},gs.call(this),{zoom:window.__zoom})};const ac=T.applyConstraints;T.applyConstraints=function(c){if(c&&c.advanced&&c.advanced[0]&&'zoom' in c.advanced[0]){window.__zoom=c.advanced[0].zoom;return Promise.resolve()}return ac.call(this,c)}})();"""
def page(b,seed,fake=None,extra=''):
    pg=b.new_context(viewport={'width':390,'height':844},service_workers='block',permissions=['camera','microphone']).new_page()
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)))
    pg.on('dialog',lambda d:d.accept())
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=fake or FAKE))
    pg.add_init_script('window.__seed='+json.dumps(seed)+';'+extra)
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
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required'])
    pg=page(b,SEED,extra=ZOOM)
    pg.goto(URL);pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto12');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)');pg.wait_for_timeout(200)
    if pg.locator('#info').is_visible():pg.evaluate("document.getElementById('info').classList.add('hidden')")
    pg.click('[data-tab=partidos]');pg.click('[data-action=live][data-id=m1]');pg.wait_for_selector('.lv-board')
    pg.click('[data-live=anon]');pg.wait_for_selector('#anUrl')
    code=D(pg,'d.anotador')
    an=page(b,pg.evaluate('window.__db'));an.goto(URL+'?anotar='+code);an.wait_for_selector('#anData .lv-board')
    check('sin cámara abierta el anotador no ve «Seguir la jugada»',an.locator('[data-anc=sig1],[data-anc=sig0]').count()==0)
    pg.click('[data-live=cam]');pg.wait_for_function("()=>document.querySelector('.cam canvas')&&document.querySelector('.cam canvas').width>0",timeout=6000)
    wait(pg,"d.cam_est==='lista' && d.cam_sig===false")
    check('al abrir la cámara el móvil avisa de que no sigue la jugada (cam_sig = false)',True)
    pasa(pg,an);an.wait_for_selector('#anData [data-anc=sig1]',timeout=9000)
    t=an.locator('.an-cam').inner_text()
    # v11.71: lente 0,5x / 1x desde el anotador
    check('v11.71: el anotador ve «📐 Lente: 1x» con sus dos botones','Lente: 1x' in an.locator('.an-cam').inner_text() and an.locator('[data-anc=len05]').count()==1 and an.locator('[data-anc=len1]').count()==1)
    o=manda(pg,an,'len05')
    check('v11.71: pulsar «0,5x» manda la orden «len05»',o['a']=='len05' and '0,5x' in an.locator('.message').inner_text(),o)
    pg.wait_for_function('()=>window.__zoom===0.5',timeout=9000)
    check('v11.71: el móvil que graba pasa a la lente 0,5x','0,5x' in pg.locator('.cam [data-cam=lente]').text_content())
    wait(pg,"d.cam_len==='05'")
    pasa(pg,an);an.wait_for_function("()=>/Lente: 0,5x/.test(document.querySelector('.an-cam').innerText)",timeout=9000)
    check('v11.71: y el anotador ve que está en 0,5x',an.locator('[data-anc=len05].primary').count()==1)
    an.screenshot(path=OUT+'/anosigue_lente.png',full_page=True)
    o=manda(pg,an,'len1')
    pg.wait_for_function('()=>window.__zoom===1',timeout=9000);wait(pg,"d.cam_len==='1'")
    check('v11.71: «1x» la vuelve a la normal',o['a']=='len1' and 'Lente: 1x' in pg.locator('.cam [data-cam=lente]').text_content())
    pasa(pg,an);an.wait_for_function("()=>/Lente: 1x/.test(document.querySelector('.an-cam').innerText)",timeout=9000)
    check('el anotador ve «🎯 Seguir la jugada» y que se ve todo el campo','se ve todo el campo' in t and 'seguir la jugada' in an.locator('[data-anc=sig1]').inner_text().lower(),t)
    o=manda(pg,an,'sig1')
    check('pulsar manda la orden «sig1»',o['a']=='sig1',o)
    check('y le dice que el móvil que graba lo hace en unos segundos','empieza a seguir la jugada' in an.locator('.message').inner_text() and an.locator('[data-anc=sig1][disabled]').count()==1)
    an.screenshot(path=OUT+'/anosigue_enviada.png',full_page=True)
    pg.wait_for_function('()=>'+SIG+'!==null',timeout=9000)
    check('el móvil que graba se pone a seguir la jugada','Sí' in pg.locator('.cam [data-cam=sigue]').text_content())
    wait(pg,'d.cam_sig===true')
    check('y avisa al anotador (cam_sig = true)',True)
    check('cuenta para los 2 gratis del mes del entrenador',json.loads(pg.evaluate("localStorage.getItem('mf_envios:u1:'+new Date().toISOString().slice(0,7))") or '{}').get('sig')==['m1'])
    pasa(pg,an);an.wait_for_selector('#anData [data-anc=sig0]',timeout=9000)
    check('el anotador ve «Siguiendo la jugada» y «Ver todo el campo»','Siguiendo la jugada' in an.locator('.an-cam').inner_text() and 'todo el campo' in an.locator('[data-anc=sig0]').inner_text().lower())
    an.screenshot(path=OUT+'/anosigue_siguiendo.png',full_page=True)
    # v11.69: el anotador elige el encuadre
    check('v11.69: el anotador ve «🔍 Encuadre: Abierto» con sus tres botones','Encuadre: Abierto' in an.locator('.an-cam').inner_text() and all(an.locator('[data-anc=enc%s]'%k).count()==1 for k in 'amc'))
    o=manda(pg,an,'encc')
    check('v11.69: pulsar «Cerrado» manda la orden «encc»',o['a']=='encc' and 'Cerrado' in an.locator('.message').inner_text(),o)
    pg.wait_for_function("()=>localStorage.getItem('mf_cam_enc')==='c'",timeout=9000)
    check('v11.69: el móvil que graba pasa a «Encuadre: Cerrado»','Encuadre: Cerrado' in pg.locator('.cam [data-cam=encuadre]').text_content())
    wait(pg,"d.cam_enc==='c'")
    pasa(pg,an);an.wait_for_function("()=>/Encuadre: Cerrado/.test(document.querySelector('.an-cam').innerText)",timeout=9000)
    check('v11.69: y el anotador ve que está en «Cerrado»',an.locator('[data-anc=encc].primary').count()==1)
    an.screenshot(path=OUT+'/anosigue_encuadre.png',full_page=True)
    pg.click('.cam [data-cam=encuadre]');wait(pg,"d.cam_enc==='a'")
    check('v11.69: si lo cambia el entrenador en su móvil, el anotador lo sabe (cam_enc)',True)
    o=manda(pg,an,'sig0')
    pg.wait_for_function('()=>'+SIG+'===null',timeout=9000);wait(pg,'d.cam_sig===false')
    check('«Ver todo el campo» lo quita en el móvil que graba',o['a']=='sig0' and 'No' in pg.locator('.cam [data-cam=sigue]').text_content())
    # Una orden repetida no lo cambia de golpe al revés
    pg.evaluate('o=>{let d=window.__db.directos[0];d.cam_ord=o;d.actualizado=new Date(Date.now()+9e6).toISOString()}',{'a':'sig1','n':o['n'],'at':o['at']})
    pg.wait_for_timeout(5000)
    check('una orden ya hecha no se repite',pg.evaluate(SIG) is None)
    # Si lo pone el entrenador en su móvil, el anotador también lo ve
    pg.click('.cam [data-cam=sigue]');wait(pg,'d.cam_sig===true')
    check('si el entrenador lo pone en su móvil, el anotador lo sabe',True)
    # Mientras graba también se puede
    pg.click('.cam [data-cam=rec]');wait(pg,"d.cam_est==='rec'")
    pasa(pg,an);an.wait_for_selector('#anData [data-anc=pause]',timeout=9000)
    check('grabando, el anotador también puede quitarlo',an.locator('[data-anc=pause]').count()==1 and an.locator('[data-anc=sig0]').count()==1)
    pg.click('.cam [data-cam=stop]');pg.wait_for_selector('.cam-fin');wait(pg,"d.cam_est==='listo'")
    pasa(pg,an);an.wait_for_timeout(5000)
    check('con un vídeo sin guardar no sale el botón (primero hay que guardarlo)',an.locator('[data-anc=sig1],[data-anc=sig0]').count()==0)
    pg.click('.cam [data-cam=again]');pg.wait_for_selector('.cam [data-cam=close]');pg.click('.cam [data-cam=close]');wait(pg,'d.cam_est===null && d.cam_sig===false')
    check('al cerrar la cámara se quita (cam_sig = false)',True)
    # Sin el SQL nuevo (ver_anotador no da «sig»): no sale el botón y no se rompe nada
    an2=page(b,pg.evaluate('window.__db'),FAKE0);an2.goto(URL+'?anotar='+code);an2.wait_for_selector('#anData .lv-board')
    an2.evaluate('d=>{d[0].cam_est="lista"}',an2.evaluate('window.__db.directos'))
    an2.evaluate('()=>{window.__db.directos[0].cam_est="lista";window.__db.directos[0].actualizado=new Date(Date.now()+3e7).toISOString()}');an2.wait_for_selector('#anData [data-anc=rec]',timeout=9000)
    check('sin supabase-anotador-sigue.sql el anotador no ve el botón (y grabar sigue igual)',an2.locator('[data-anc=sig1]').count()==0 and an2.locator('[data-anc=enca]').count()==0 and an2.locator('[data-anc=len05]').count()==0 and an2.locator('[data-anc=rec]').count()==1)
    b.close()
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
sys.exit(0 if all(res) and not errs else 1)
