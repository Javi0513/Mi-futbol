import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json
from playwright.sync_api import sync_playwright
# Tutorial de bienvenida para cuentas nuevas. Usa el mismo Supabase simulado que teams.py.
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
CFG="window.APP_CONFIG={supabaseUrl:'https://zsbygyahqtgxfvofplbl.supabase.co',supabaseAnonKey:'x'};"
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8815),functools.partial(H,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8815/index.html'
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
def page(ctx,sd):
    pg=ctx.new_page()
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    pg.on('dialog',lambda d:d.accept())
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    pg.route('**/config.js',lambda r:r.fulfill(content_type='application/javascript',body=CFG))
    pg.add_init_script('window.__seed='+json.dumps(sd)+';')
    return pg
def login(pg):
    pg.goto(URL);pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto12');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)');pg.wait_for_timeout(400)
NEW={'perfiles':[{'id':'u1','plan':'gratis'}]}
OLD={'perfiles':[{'id':'u1','plan':'gratis'}],'futbol_personal_jugadores':[{'id':'p1','owner_id':'u1','modalidad':'7','nombre':'Ana','foto':''}]}
step=lambda pg:pg.locator('.tut-card .kicker').inner_text()
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block')
    pg=page(ctx,NEW);login(pg)
    check('cuenta nueva: aparece el tutorial al entrar',pg.locator('#tut .tut-card').count()==1 and step(pg)=='PASO 1 DE 12',step(pg) if pg.locator('#tut').count() else '')
    pg.screenshot(path=OUT+'/tut_1.png')
    pg.click('[data-tut=next]');pg.wait_for_timeout(350)
    r=pg.evaluate("(()=>{let a=document.querySelector('.tut-hole').getBoundingClientRect(),b=document.querySelector('.switch').getBoundingClientRect();return [a.left<=b.left,a.top<=b.top,a.right>=b.right,a.bottom>=b.bottom]})()")
    check('señala la parte de la app que explica',all(r) and 'MODALIDAD' in pg.locator('#tutT').text_content().upper(),r)
    pg.screenshot(path=OUT+'/tut_2.png')
    for _ in range(4):pg.click('[data-tut=next]')
    pg.wait_for_timeout(350)
    check('explica las pestañas (Partidos)',pg.locator('#tutT').text_content()=='Partidos')
    pg.screenshot(path=OUT+'/tut_6.png')
    pg.click('[data-tut=prev]');pg.wait_for_timeout(200)
    check('se puede volver atrás',pg.locator('#tutT').text_content()=='Plantilla')
    check('mientras se ve, no se puede tocar la app de detrás',pg.evaluate("document.elementFromPoint(195,420).closest('#tut')!==null"))
    while pg.locator('[data-tut=next]').text_content()!='Empezar':pg.click('[data-tut=next]')
    pg.screenshot(path=OUT+'/tut_last.png')
    pg.click('[data-tut=next]');pg.wait_for_timeout(200)
    check('al terminar se cierra y te deja en la plantilla',pg.locator('#tut').count()==0 and pg.locator('[data-tab=plantilla].on').count()==1)
    check('queda apuntado que ya lo has visto',pg.evaluate("localStorage.getItem('mf_tut_v1:u1')")=='1')
    login(pg)
    check('no vuelve a salir al entrar otra vez',pg.locator('#tut').count()==0)
    pg.click('#acct');pg.click('[data-acct=tutorial]');pg.wait_for_selector('#tut')
    check('se puede volver a ver desde Mi cuenta',step(pg)=='PASO 1 DE 12')
    pg.click('[data-tut=skip]')
    check('Saltar lo cierra',pg.locator('#tut').count()==0)
    pg.close();ctx.close()
    ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block')
    pg=page(ctx,NEW);login(pg)
    pg.keyboard.press('Escape')
    check('Escape lo cierra',pg.locator('#tut').count()==0)
    ctx.close()
    ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block')
    pg=page(ctx,OLD);login(pg)
    check('a quien ya tiene datos no le sale',pg.locator('#tut').count()==0)
    ctx.close()
    ctx=b.new_context(viewport={'width':1280,'height':800},service_workers='block')
    pg=page(ctx,NEW);login(pg)
    for _ in range(5):pg.click('[data-tut=next]')
    pg.wait_for_timeout(350)
    check('también funciona en ordenador',pg.locator('#tutT').text_content()=='Partidos' and pg.locator('.tut-hole').is_visible())
    pg.screenshot(path=OUT+'/tut_pc.png')
    b.close()
errs=[e for e in errs if 'favicon' not in e]
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
sys.exit(0 if all(res) and not errs else 1)
