import sys,os,re;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json
from playwright.sync_api import sync_playwright
# Grabar el entreno (v9.5): cámara desde la pestaña Entrenos, sin marcador ni emisión, el vídeo se guarda en el móvil.
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
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8833),functools.partial(H,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8833/index.html'
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
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
    T=[{'id':'t1','owner_id':'u1','modalidad':'7','fecha':HOY,'asistencia':{}}]
    pg=page(b,seed('gratis',CP(T)),ON);login(pg)
    pg.click('[data-tab=entrenos]');pg.wait_for_selector('#view [data-tr=rec]')
    check('en Entrenos hay botón «Grabar el entreno»',pg.locator('#view [data-tr=rec]').count()==1 and 'grabar el entreno' in pg.locator('#view [data-tr=rec]').inner_text().lower())
    pg.locator('#view [data-tr=rec]').scroll_into_view_if_needed();pg.screenshot(path=OUT+'/grabaentreno_boton.png')
    pg.click('#view [data-tr=rec]');pg.wait_for_selector('.cam canvas')
    pg.wait_for_function("()=>document.querySelector('.cam canvas').width>0",timeout=5000);pg.wait_for_timeout(500)
    check('se abre la cámara a pantalla completa',pg.locator('.cam').is_visible() and pg.evaluate("document.body.classList.contains('cam-on')"))
    check('sin botones de goles ni de emitir',pg.locator('[data-cam=gf],[data-cam=gc],[data-cam=emit]').count()==0)
    px=pg.evaluate("(()=>{let c=document.querySelector('.cam canvas'),g=c.getContext('2d'),u=Math.min(c.width,c.height)/360;for(let x=0;x<c.width*0.5;x+=2){let d=g.getImageData(x,Math.round(20*u),1,1).data;if(d[0]<80&&d[1]>200&&d[2]<140)return true}return false})()")
    check('la etiqueta ENTRENO está pintada en el vídeo',px)
    pg.screenshot(path=OUT+'/grabaentreno_camara.png')
    pg.click('[data-cam=rec]');pg.wait_for_selector('[data-cam=stop]');pg.wait_for_timeout(2500)
    check('mientras graba se ve el tiempo',pg.locator('[data-camt]').count()==1)
    pg.click('[data-cam=stop]');pg.wait_for_selector('.cam-fin')
    check('al parar queda listo para guardar',pg.locator('[data-cam=save]').count()==1 and pg.locator('[data-cam=emit],[data-cam=unemit]').count()==0)
    with pg.expect_download() as dl:pg.click('[data-cam=save]')
    d=dl.value;sz=os.path.getsize(d.path())
    check('se descarga al móvil con nombre del entreno',re.match(r'entreno-mi-equipo-'+HOY+r'-\d\dh\d\d\.(mp4|webm)$',d.suggested_filename) and sz>20000,f'{d.suggested_filename} {sz}')
    pg.click('[data-cam=close]');pg.wait_for_timeout(200)
    check('cerrar apaga la cámara y vuelve a Entrenos',pg.locator('.cam').count()==0 and pg.locator('[data-tab=entrenos].on').count()==1)
    check('no se sube nada al servidor',DB(pg,"window.__calls.length")==0)
    pg.context.close()
    b.close()
srv.shutdown()
errs=[e for e in errs if 'Failed to load resource' not in e]
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
sys.exit(0 if all(res) and not errs else 1)
