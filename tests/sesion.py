import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json,time
from playwright.sync_api import sync_playwright
# La sesión no se cierra sola en mitad del partido si falla la renovación por falta de cobertura.
FAKE=r"""
window.__calls=[];window.__out=()=>window.__cb('SIGNED_OUT',null);
window.__db=window.__seed||{};
const NOW=()=>new Date().toISOString(),CP=(x)=>JSON.parse(JSON.stringify(x));
window.supabase={createClient:()=>{let cb=null,session=null;
 const q=(t)=>{let f=null,op='select',payload=null,sel=false;
  const o={select(){sel=true;return o},order(){return o},eq(c,v){f=[c,v];return o},insert(p){op='insert';payload=p;return o},update(p){op='update';payload=p;return o},delete(){op='delete';return o},
  then(res){let out;
   if(window.__noTable&&t==='directos')out={data:null,error:{message:'relation "public.directos" does not exist'}};
   else{let rows=window.__db[t]=window.__db[t]||[];
    if(op==='select')out={data:rows.filter(r=>!f||r[f[0]]===f[1]).map(CP),error:null};
    else if(op==='insert'){let r=CP(payload);if(t==='directos'){r.actualizado=NOW();if(r.desde)r.desde=NOW()}rows.push(r);window.__calls.push(['insert',t]);out={data:sel?[CP(r)]:null,error:null}}
    else if(op==='update'){let r=rows.find(r=>r[f[0]]===f[1]),p=CP(payload);
      if(t==='directos'){p.actualizado=NOW();if(p.desde&&p.desde!==r.desde)p.desde=NOW()}
      Object.assign(r,p);window.__calls.push(['update',t]);out={data:sel?[CP(r)]:null,error:null}}
    else{window.__db[t]=rows.filter(r=>r[f[0]]!==f[1]);window.__calls.push(['delete',t]);out={error:null}}}
   return Promise.resolve(out).then(res)}};return o};
 return{from:q,
  rpc:async(n,a)=>{window.__calls.push(['rpc',n]);if(n==='ver_directo'){let r=(window.__db.directos||[]).find(x=>x.id===a.codigo);return{data:r?{...CP(r),ahora:NOW()}:null,error:null}}return{error:null}},
  auth:{getSession:async()=>({data:{session}}),
   onAuthStateChange(c){cb=c;window.__cb=c;if(window.__autoSes)session={user:{id:'u1',email:'ana@x.es'},refresh_token:'rt1'};setTimeout(()=>c('INITIAL_SESSION',session),0);return{data:{subscription:{}}}},
   refreshSession:async(a)=>{window.__calls.push(['refresh',a&&a.refresh_token]);let m=window.__ref||'ok';
    if(m==='red')return{data:{session:null},error:{name:'AuthRetryableFetchError',status:0,message:'Failed to fetch'}};
    if(m==='caducada')return{data:{session:null},error:{name:'AuthApiError',status:400,code:'refresh_token_not_found',message:'Invalid Refresh Token'}};
    session={user:{id:'u1',email:'ana@x.es'},refresh_token:'rt2'};cb('TOKEN_REFRESHED',session);return{data:{session},error:null}},
   signInWithPassword:async()=>{session={user:{id:'u1',email:'ana@x.es'},refresh_token:'rt1'};cb('SIGNED_IN',session);return{data:{session},error:null}},
   getUser:async()=>({data:{user:session&&session.user}}),signOut:async()=>{session=null;cb('SIGNED_OUT',null)}}}}};
"""
P=[{'id':f'p{i}','owner_id':'u1','modalidad':'7','nombre':f'J{i}','foto':'','created_at':''} for i in range(8)]
PART=[{'id':f'p{i}','nombre':f'J{i}','minutes':0,'goals':0,'starter':i<7} for i in range(8)]
SEED={'futbol_personal_jugadores':P,'futbol_personal_partidos':[{'id':'m1','owner_id':'u1','modalidad':'7','fecha':'2026-10-18','rival':'Los Pinos','participaciones':json.dumps(PART),'alineacion':'{}','created_at':''}],'perfiles':[{'id':'u1','plan':'gratis'}]}
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8841),functools.partial(H,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8841/index.html'
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
def page(b,seed,extra=''):
    pg=b.new_context(viewport={'width':390,'height':844},service_workers='block').new_page()
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    pg.on('dialog',lambda d:d.accept())
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    pg.add_init_script('window.__seed='+json.dumps(seed)+';'+extra)
    return pg
def login(pg):
    pg.goto(URL);pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto12');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)');pg.wait_for_timeout(200)
D=lambda pg,js:pg.evaluate('(()=>{let d=(window.__db.directos||[])[0];return '+js+'})()')
M=lambda pg:pg.evaluate("(()=>{let m=window.__db.futbol_personal_partidos[0];return{r:JSON.parse(m.alineacion).resultado,g:Object.fromEntries(JSON.parse(m.participaciones).map(x=>[x.id,x.goals]))}})()")
wait=lambda pg,js:pg.wait_for_function('(()=>{let d=(window.__db.directos||[])[0];return '+js+'})()',timeout=4000)

vis=lambda pg,sel:pg.locator(sel).count()>0 and pg.locator(sel).first.is_visible()
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=page(b,SEED);login(pg)
    check('al entrar se guarda una copia de la sesión',json.loads(pg.evaluate("localStorage.getItem('mf_sesion_copia')")or'{}').get('uid')=='u1')
    pg.click('[data-tab=partidos]');pg.click('[data-action=live][data-id=m1]');pg.wait_for_selector('.lv-board')
    pg.click('[data-live=start]');wait(pg,"d.estado==='1T'&&!!d.desde")
    pg.click('[data-live=gf]');pg.click('.lv-pick [data-scorer="p2"]');wait(pg,"d.gf===1")
    check('con el directo abierto se recuerda el partido',pg.evaluate("localStorage.getItem('mf_directo_abierto')")=='m1')
    # Supabase da la sesión por perdida (sin cobertura al renovar)
    pg.evaluate("window.__ref='red';window.__out()");pg.wait_for_timeout(300)
    check('sin cobertura NO sale la pantalla de entrar',pg.locator('#login').is_hidden() and pg.locator('#app').is_visible())
    check('el directo sigue abierto con el marcador',vis(pg,'.lv-board') and pg.locator('.lv-score').inner_text().replace('\n','')=='1-0',pg.locator('.lv-score').inner_text() if vis(pg,'.lv-score') else '')
    check('sale el aviso «Sin conexión con tu cuenta»',vis(pg,'#sesAviso') and 'Sin conexión' in pg.locator('#sesAviso').inner_text())
    pg.wait_for_timeout(1800)
    check('lo reintenta solo',['refresh','rt1'] in pg.evaluate('window.__calls'))
    check('la plantilla no se ha vaciado',pg.evaluate('1')==1 and pg.locator('.lv-pick [data-scorer], [data-live=gf]').count()>0)
    pg.click('[data-live=gc]');pg.wait_for_timeout(300)
    check('se puede seguir apuntando sin conexión',pg.locator('.lv-score').inner_text().replace('\n','')=='1-1')
    # Vuelve la cobertura
    pg.evaluate("window.__ref='ok'");pg.click('[data-ses=ya]');pg.wait_for_timeout(500)
    check('al volver la cobertura se quita el aviso',not vis(pg,'#sesAviso'))
    check('y se sigue en el mismo directo',vis(pg,'.lv-board') and pg.locator('.lv-score').inner_text().replace('\n','')=='1-1')
    wait(pg,"d.gc===1")
    check('lo apuntado se guarda en el servidor',D(pg,'d.gf===1&&d.gc===1'))
    check('se guarda la sesión nueva',json.loads(pg.evaluate("localStorage.getItem('mf_sesion_copia')")).get('rt')=='rt2')
    # El servidor dice que la sesión ya no vale: entonces sí se sale
    pg.evaluate("window.__ref='caducada';window.__out()");pg.wait_for_selector('#login:not(.hidden)',timeout=5000)
    check('si la sesión ha caducado de verdad, pide entrar y lo explica','caducado' in pg.locator('#loginmsg').inner_text(),pg.locator('#loginmsg').inner_text())
    check('y borra la copia',pg.evaluate("localStorage.getItem('mf_sesion_copia')") is None)
    # Cerrar sesión a propósito
    pg2=page(b,SEED);login(pg2)
    pg2.evaluate("document.querySelector('#logout').click()");pg2.wait_for_selector('#login:not(.hidden)',timeout=5000)
    check('«Cerrar sesión» sale enseguida y borra la copia',pg2.evaluate("localStorage.getItem('mf_sesion_copia')") is None and not vis(pg2,'#sesAviso'))
    # Abrir la app en el campo sin cobertura (con sesión guardada)
    pg3=page(b,SEED,"window.__ref='red';localStorage.setItem('mf_sesion_copia',JSON.stringify({rt:'rt1',uid:'u1'}));")
    pg3.goto(URL);pg3.wait_for_timeout(500)
    check('abrir sin cobertura no pide email y contraseña',pg3.locator('#login').is_hidden() and vis(pg3,'#sesAviso'))
    pg3.evaluate("window.__ref='ok'");pg3.click('[data-ses=ya]');pg3.wait_for_timeout(800)
    check('al conectar carga los datos',not vis(pg3,'#sesAviso') and pg3.locator('#app').is_visible() and 'J1' in pg3.locator('#view').inner_text(),pg3.locator('#view').inner_text()[:120])
    # Android cierra la app durante el directo: al abrirla vuelve al directo
    db=pg.evaluate('window.__db');db['directos'][0]['estado']='1T'
    pg4=page(b,db,"window.__autoSes=true;if(!sessionStorage.getItem('x')){sessionStorage.setItem('x','1');localStorage.setItem('mf_directo_abierto','m1')}")
    pg4.goto(URL);pg4.wait_for_selector('.lv-board',timeout=5000)
    check('al volver a abrir la app se abre el directo del partido',vis(pg4,'.lv-board') and pg4.locator('.lv-score').inner_text().replace('\n','')=='1-1')
    pg4.click('[data-live=close]');pg4.wait_for_timeout(200)
    check('al cerrar el directo se olvida',pg4.evaluate("localStorage.getItem('mf_directo_abierto')") is None)
    db['directos'][0]['estado']='FIN'
    pg5=page(b,db,"window.__autoSes=true;localStorage.setItem('mf_directo_abierto','m1')")
    pg5.goto(URL);pg5.wait_for_selector('#app:not(.hidden)');pg5.wait_for_timeout(600)
    check('un partido ya terminado no se vuelve a abrir solo',not vis(pg5,'.lv-board'))
    b.close()
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
if errs:print('\n'.join('FALLA consola: '+e for e in errs))
sys.exit(0 if all(res) and not errs else 1)
