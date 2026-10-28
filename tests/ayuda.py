import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json
from playwright.sync_api import sync_playwright
# Guía de uso (Mi cuenta › Guía de uso). Usa el mismo Supabase simulado que tut.py.
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
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8817),functools.partial(H,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8817/index.html'
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
OLD={'perfiles':[{'id':'u1','plan':'gratis'}],'futbol_personal_jugadores':[{'id':'p1','owner_id':'u1','modalidad':'7','nombre':'Ana','foto':''}]}
def guia(pg):
    pg.click('#acct');pg.click('#info [data-info=ayuda]');pg.wait_for_selector('#info .ayuda');pg.wait_for_timeout(150)
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block')
    pg=page(ctx,OLD);login(pg)
    check('Mi cuenta tiene el botón «Guía de uso»',(pg.click('#acct') or True) and pg.locator('#info [data-info=ayuda]').count()==1)
    pg.click('#closeInfo')
    guia(pg)
    check('se abre la guía',pg.locator('#infoTitle').text_content()=='Guía de uso')
    tits=pg.locator('#info .ayuda summary').all_text_contents()
    check('tiene todos los apartados',len(tits)==12,tits)
    for k in ['Tus equipos','Directo','Plan para clubes','Actualizaciones']:
        check('apartado: '+k,k in tits)
    check('los apartados empiezan cerrados',pg.locator('#info .ayuda details[open]').count()==0)
    pg.locator('#info .ayuda summary',has_text='Plan para clubes').click();pg.wait_for_timeout(150)
    t=pg.locator('#info .ayuda details[open]').inner_text()
    check('clubes: explica el código y al encargado','código' in t and 'encargado' in t and 'Crear el club' in t,t[:120])
    check('en la web se ven los precios de los packs','119 €' in t)
    pg.screenshot(path=OUT+'/ayuda_club.png')
    pg.locator('#info .ayuda summary',has_text='Directo').click();pg.wait_for_timeout(150)
    t=pg.locator('#info .ayuda details',has_text='Compartir enlace').inner_text()
    check('directo: explica cámara y emitir','Cámara' in t and 'Emitir' in t,t[:120])
    pg.screenshot(path=OUT+'/ayuda_directo.png')
    pg.click('#closeInfo')
    check('se cierra',pg.locator('#info.hidden').count()==1)
    ctx.close()
    # App de Android: sin precios
    ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block')
    pg=page(ctx,OLD);pg.add_init_script("try{sessionStorage.setItem('mf_twa','1')}catch(e){}");login(pg)
    guia(pg)
    pg.evaluate("document.querySelectorAll('#info .ayuda details').forEach(d=>d.open=true)")
    t=pg.locator('#info .ayuda').inner_text()
    check('Android: la guía no habla de precios','€' not in t and 'Plan para clubes' in t,t[:80])
    b.close()
errs=[e for e in errs if 'favicon' not in e]
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
sys.exit(0 if all(res) and not errs else 1)
