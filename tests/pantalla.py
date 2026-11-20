import sys,os,re;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json
from playwright.sync_api import sync_playwright
# Pantalla encendida (v11.43): mientras la cámara está abierta no se apaga la pantalla (Wake Lock o vídeo mudo en iPad antiguo).
# Mismo Supabase simulado que teams.py. Supabase simulado con filtros eq / is / in encadenados,
# borrado en cascada de jugadores y partidos al borrar su equipo, y la tabla equipos opcional.
FAKE=r"""
window.__calls=[];
window.__db=window.__seed||{};
const CP=(x)=>JSON.parse(JSON.stringify(x));
window.supabase={createClient:()=>{let cb=null,session=null;
 const q=(t)=>{let F=[],op='select',payload=null,sel=false;
  const ok=(r)=>F.every(([k,c,v])=>k==='eq'?r[c]===v:k==='is'?(r[c]==null)===(v===null):v.includes(r[c]));
  const o={select(){sel=true;return o},order(){return o},eq(c,v){F.push(['eq',c,v]);return o},is(c,v){F.push(['is',c,v]);return o},in(c,v){F.push(['in',c,v]);return o},
  insert(p){op='insert';payload=p;return o},update(p){op='update';payload=p;return o},delete(){op='delete';return o},
  then(res){let out;
   if(window.__noTeams&&t==='equipos')out={data:null,error:{message:'relation "public.equipos" does not exist'}};
   else{let rows=window.__db[t]=window.__db[t]||[];
    if(op==='select')out={data:rows.filter(ok).map(CP),error:null};
    else if(op==='insert'){let r=CP(payload);if(t==='equipos')r.created_at=new Date(Date.now()+rows.length).toISOString();rows.push(r);window.__calls.push(['insert',t,r]);out={data:sel?[CP(r)]:null,error:null}}
    else if(op==='update'){rows.filter(ok).forEach(r=>Object.assign(r,CP(payload)));window.__calls.push(['update',t,payload]);out={data:null,error:null}}
    else{let gone=rows.filter(ok).map(r=>r.id);window.__db[t]=rows.filter(r=>!ok(r));window.__calls.push(['delete',t]);
      if(t==='equipos')['futbol_personal_jugadores','futbol_personal_partidos'].forEach(k=>window.__db[k]=(window.__db[k]||[]).filter(r=>!gone.includes(r.equipo_id)));
      out={error:null}}}
   return Promise.resolve(out).then(res)}};return o};
 return{from:q,rpc:async()=>({error:null}),
  auth:{getSession:async()=>({data:{session}}),
   onAuthStateChange(c){cb=c;setTimeout(()=>c('INITIAL_SESSION',null),0);return{data:{subscription:{}}}},
   signInWithPassword:async()=>{session={user:{id:'u1',email:'ana@x.es'}};cb('SIGNED_IN',session);return{data:{session},error:null}},
   getUser:async()=>({data:{user:session&&session.user}}),signOut:async()=>{session=null;cb('SIGNED_OUT',null)}}}}};
"""

CP=lambda x:json.loads(json.dumps(x))
import datetime
HOY=datetime.date.today().isoformat()
P=[{'id':f'p{i}','owner_id':'u1','modalidad':'7','nombre':f'J{i}','foto':''} for i in range(4)]
def seed(plan,tr=None):
    d={'futbol_personal_jugadores':CP(P),'futbol_personal_partidos':[],'perfiles':[{'id':'u1','plan':plan}]}
    if tr is not None:d['entrenamientos']=tr
    return d
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8853),functools.partial(H,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8853/index.html'
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
def page(b,sd,extra=''):
    pg=b.new_context(viewport={'width':390,'height':844},service_workers='block',accept_downloads=True,permissions=['camera','microphone']).new_page()
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    pg.on('dialog',lambda d:d.accept())
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    pg.add_init_script('window.__seed='+json.dumps(sd)+';'+extra)
    return pg
def login(pg):
    pg.goto(URL);pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto12');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)');pg.wait_for_timeout(300)
DB=lambda pg,js:pg.evaluate('(()=>{let d=window.__db;return '+js+'})()')

ON="localStorage.setItem('mf_entrenos:u1','1');"
WL=r"""
window.__wl={n:0,rel:0,fail:false,s:null};
Object.defineProperty(navigator,'wakeLock',{configurable:true,value:{request:async(t)=>{window.__wl.n++;if(window.__wl.fail)throw new DOMException('ahorro de batería','NotAllowedError');
 const et=new EventTarget();et.released=false;et.type=t;et.release=async()=>{if(et.released)return;et.released=true;window.__wl.rel++;et.dispatchEvent(new Event('release'))};window.__wl.s=et;return et}}});
"""
SIN="Object.defineProperty(navigator,'wakeLock',{configurable:true,value:undefined});"
IPAD="Object.defineProperty(navigator,'userAgent',{get:()=>'Mozilla/5.0 (iPad; CPU OS 15_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.2 Mobile/15E148 Safari/604.1'});"
HID="window.__hid=false;Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.__hid});Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.__hid?'hidden':'visible'});"
STR="window.__st=[];const _gum=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async(c)=>{let s=await _gum(c);window.__st.push(s);return s};"
VID="(()=>{let v=document.querySelector('video.luz-vid');return v?{on:!v.paused,muted:v.muted,inline:v.playsInline,loop:v.loop}:null})()"
T=[{'id':'t1','owner_id':'u1','modalidad':'7','fecha':HOY,'asistencia':{}}]
def abre_cam(pg):
    pg.click('[data-tab=entrenos]');pg.wait_for_selector('#view [data-tr=rec]');pg.click('#view [data-tr=rec]');pg.wait_for_selector('.cam canvas')
    pg.wait_for_function("()=>document.querySelector('.cam canvas').width>0",timeout=5000);pg.wait_for_timeout(400)
def vis(pg,hidden):
    pg.evaluate(f"window.__hid={'true' if hidden else 'false'};document.dispatchEvent(new Event('visibilitychange'))");pg.wait_for_timeout(500)
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required'])
    # 1) Android con Wake Lock
    pg=page(b,seed('gratis',CP(T)),ON+WL+HID+STR);login(pg)
    abre_cam(pg)
    w=pg.evaluate("window.__wl")
    check('al abrir la cámara (antes de grabar) se pide que la pantalla no se apague',w['n']==1,w)
    check('con Wake Lock en Android no hace falta el vídeo mudo',(pg.evaluate(VID) or {}).get('on') is not True,pg.evaluate(VID))
    pg.click('[data-cam=rec]');pg.wait_for_selector('[data-cam=stop]');pg.wait_for_timeout(600)
    check('al empezar a grabar no se pide otra vez (ya está encendida)',pg.evaluate("window.__wl.n")==1)
    pg.evaluate("window.__wl.s.release()");pg.wait_for_timeout(700)
    check('si el sistema suelta el bloqueo con la app delante, se vuelve a pedir',pg.evaluate("window.__wl.n")==2)
    vis(pg,True);pg.evaluate("window.__wl.s.release()");pg.wait_for_timeout(500)
    n_oculto=pg.evaluate("window.__wl.n")
    vis(pg,False)
    check('al volver a la app se pide otra vez',n_oculto==2 and pg.evaluate("window.__wl.n")==3,(n_oculto,pg.evaluate("window.__wl.n")))
    check('y avisa de que ese rato puede no haberse grabado','puede no haberse grabado' in pg.locator('body').inner_text(),'')
    check('la grabación sigue',pg.locator('[data-cam=stop]').count()==1)
    pg.wait_for_timeout(1500)
        # (v11.48) la cámara se corta mientras graba: se pide otra vez sola y la grabación sigue
    pg.evaluate("window.__st[0].getVideoTracks()[0].dispatchEvent(new Event('ended'))");pg.wait_for_function("()=>window.__st.length>1",timeout=6000);pg.wait_for_timeout(600)
    check('si la cámara se corta, se vuelve a abrir sola y la grabación sigue',pg.locator('[data-cam=stop]').count()==1 and pg.locator('.cam-aviso').count()==0)
    pg.click('[data-cam=stop]');pg.wait_for_selector('.cam-fin')
    check('al parar queda listo para guardar',pg.locator('[data-cam=save]').count()==1)
    with pg.expect_download() as dl:pg.click('[data-cam=save]')
    check('lo grabado se puede guardar',os.path.getsize(dl.value.path())>5000)
    pg.click('[data-cam=close]');pg.wait_for_timeout(300)
    check('al cerrar la cámara se suelta el bloqueo',pg.evaluate("window.__wl.s.released===true"))
    pg.screenshot(path=OUT+'/pantalla_android.png')
    pg.context.close()
    # 2) Ahorro de batería: el Wake Lock falla → vídeo mudo
    pg=page(b,seed('gratis',CP(T)),ON+WL+"window.__wl_fail=1;"+HID);login(pg)
    pg.evaluate("window.__wl.fail=true");abre_cam(pg)
    v=pg.evaluate(VID)
    check('si el Wake Lock falla (ahorro de batería), se usa el vídeo de silencio (sin «loop» y con sonido: el iPhone no cuenta los vídeos en bucle ni los silenciados)',v and v['on'] and v['inline'] and not v['loop'],v)
    pg.click('[data-cam=close]');pg.wait_for_timeout(300)
    check('al cerrar se para el vídeo mudo',(pg.evaluate(VID) or {}).get('on') is False,pg.evaluate(VID))
    pg.context.close()
    # 3) iPad antiguo (iOS 15, sin Wake Lock)
    pg=page(b,seed('gratis',CP(T)),ON+SIN+IPAD+HID);login(pg)
    abre_cam(pg)
    v=pg.evaluate(VID)
    check('iPad antiguo sin Wake Lock: se usa el vídeo mudo en bucle',v and v['on'],v)
    check('el vídeo mudo es diminuto y no tapa nada',pg.evaluate("(()=>{let r=document.querySelector('video.luz-vid').getBoundingClientRect();return r.width<=2&&r.height<=2&&getComputedStyle(document.querySelector('video.luz-vid')).pointerEvents==='none'})()"))
    pg.click('[data-cam=rec]');pg.wait_for_selector('[data-cam=stop]');pg.wait_for_timeout(1500)
    vis(pg,True);pg.evaluate("document.querySelector('video.luz-vid').pause()");vis(pg,False)
    check('al volver a la app el vídeo mudo se pone otra vez',pg.evaluate(VID)['on'])
    pg.click('[data-cam=stop]');pg.wait_for_selector('.cam-fin')
    check('graba y queda listo en el iPad antiguo',pg.locator('[data-cam=save]').count()==1)
    pg.context.close()
    # 4) iPhone con Wake Lock: se usan los dos (en la app de la pantalla de inicio no siempre funciona)
    pg=page(b,seed('gratis',CP(T)),ON+WL+IPAD+HID);login(pg)
    abre_cam(pg)
    check('iPhone/iPad con Wake Lock: se usan el Wake Lock y el vídeo mudo',pg.evaluate("window.__wl.n")==1 and pg.evaluate(VID)['on'])
    pg.context.close()
    b.close()
srv.shutdown()
errs=[e for e in errs if 'Failed to load resource' not in e]
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
sys.exit(0 if all(res) and not errs else 1)
