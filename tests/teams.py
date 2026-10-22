import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json
from playwright.sync_api import sync_playwright
# Varios equipos por modalidad. Supabase simulado con filtros eq / is / in encadenados,
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
P=[{'id':f'p{i}','owner_id':'u1','modalidad':'7','nombre':f'J{i}','foto':''} for i in range(8)]
PART=[{'id':f'p{i}','nombre':f'J{i}','minutes':0,'goals':0,'starter':i<7} for i in range(8)]
def seed(plan):
    return {'futbol_personal_jugadores':CP(P),'futbol_personal_partidos':[{'id':'m1','owner_id':'u1','modalidad':'7','fecha':'2026-10-18','rival':'Los Pinos','participaciones':json.dumps(PART),'alineacion':'{}'}],'perfiles':[{'id':'u1','plan':plan}]}
CP=lambda x:json.loads(json.dumps(x))
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8814),functools.partial(H,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8814/index.html'
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
ANS={'v':''}
def page(b,sd,extra=''):
    pg=b.new_context(viewport={'width':390,'height':844},service_workers='block').new_page()
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    pg.on('dialog',lambda d:d.accept(ANS['v']) if d.type=='prompt' else d.accept())
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    pg.add_init_script('window.__seed='+json.dumps(sd)+';'+extra)
    return pg
def login(pg):
    pg.goto(URL);pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto12');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)');pg.wait_for_timeout(300)
chips=lambda pg:pg.locator('#teams .team-chips button').all_inner_texts()
rows=lambda pg:pg.locator('#view .row strong').count()
DB=lambda pg,js:pg.evaluate('(()=>{let d=window.__db;return '+js+'})()')
with sync_playwright() as p:
    b=p.chromium.launch()
    # --- plan gratuito ---
    pg=page(b,seed('gratis'));login(pg)
    check('se ve el equipo de la modalidad',chips(pg)==['Mi equipo'] and rows(pg)==8,chips(pg))
    pg.click('[data-teamact=add]');pg.wait_for_selector('#info:not(.hidden)')
    check('gratis: añadir otro equipo enseña el plan Pro',pg.locator('#infoBody').inner_text().find('varios equipos')>=0 and DB(pg,"(d.equipos||[]).length")==0)
    pg.click('#closeInfo')
    ANS['v']='Alevín A';pg.click('[data-teamact=rename]');pg.wait_for_function("document.querySelector('#teams .team-chips button').textContent==='Alevín A'")
    check('gratis: se puede poner nombre al equipo',DB(pg,"d.equipos.length===1&&d.equipos[0].nombre==='Alevín A'&&d.equipos[0].modalidad==='7'"))
    check('sus jugadores y partidos pasan a ese equipo',DB(pg,"d.futbol_personal_jugadores.every(r=>r.equipo_id===d.equipos[0].id)&&d.futbol_personal_partidos[0].equipo_id===d.equipos[0].id") and rows(pg)==8)
    pg.click('[data-mode="11"]');pg.wait_for_timeout(200)
    check('cada modalidad tiene sus propios equipos',chips(pg)==['Mi equipo'] and rows(pg)==0,chips(pg))
    pg.screenshot(path=OUT+'/teams_free.png')
    pg.context.close()
    # --- plan Pro ---
    pg=page(b,seed('pro'));login(pg)
    ANS['v']='Benjamín';pg.click('[data-teamact=add]');pg.wait_for_function("document.querySelectorAll('#teams .team-chips button').length===2")
    check('Pro: crea un segundo equipo y guarda el primero',chips(pg)==['Mi equipo','Benjamín'] and DB(pg,"d.equipos.length===2"),chips(pg))
    check('el equipo nuevo queda elegido y empieza vacío',pg.locator('#teams .team-chips button.on').inner_text()=='Benjamín' and rows(pg)==0 and pg.locator('#stats .stat b').first.inner_text()=='0')
    check('los jugadores de antes siguen en el primer equipo',DB(pg,"d.futbol_personal_jugadores.every(r=>r.equipo_id===d.equipos[0].id)"))
    pg.click('[data-action=add-player]');pg.fill('#playerForm input[name=nombre]','Nuevo Benja');pg.click('#playerForm button.primary')
    pg.wait_for_function("document.querySelectorAll('#view .row strong').length===1")
    nid=DB(pg,"d.equipos[1].id")
    check('el jugador nuevo se guarda en el equipo elegido',DB(pg,"d.futbol_personal_jugadores.find(r=>r.nombre==='Nuevo Benja').equipo_id")==nid)
    pg.click('#teams .team-chips button:has-text("Mi equipo")');pg.wait_for_timeout(200)
    check('al cambiar de equipo se ve su plantilla',rows(pg)==8)
    pg.click('[data-tab=partidos]');pg.wait_for_timeout(200)
    check('y sus partidos',pg.locator('[data-action=live][data-id=m1]').count()==1)
    pg.click('#teams .team-chips button:has-text("Benjamín")');pg.wait_for_timeout(200)
    check('el otro equipo no ve esos partidos',pg.locator('[data-action=live]').count()==0)
    pg.screenshot(path=OUT+'/teams_pro.png')
    check('recuerda el equipo elegido para la próxima vez',json.loads(pg.evaluate("localStorage.getItem('mf_equipo_sel')"))['7']==nid)
    pg.click('#teams .team-chips button:has-text("Mi equipo")');pg.wait_for_timeout(200)
    pg.click('[data-tab=partidos]');pg.click('[data-action=live][data-id=m1]');pg.wait_for_selector('.lv-board')
    check('el directo usa el nombre del equipo',DB(pg,"d.directos[0].equipo")=='Mi equipo')
    pg.click('[data-live=close]');pg.wait_for_timeout(200)
    pg.click('#teams .team-chips button:has-text("Benjamín")');pg.wait_for_timeout(200)
    pg.click('[data-teamact=del]');pg.wait_for_function("document.querySelectorAll('#teams .team-chips button').length===1")
    check('borrar un equipo borra sus jugadores',DB(pg,"d.equipos.length===1&&!d.futbol_personal_jugadores.some(r=>r.nombre==='Nuevo Benja')&&d.futbol_personal_jugadores.length===8"))
    check('y vuelve al equipo que queda',chips(pg)==['Mi equipo'] and rows(pg)==8 and pg.locator('[data-teamact=del]').count()==0)
    pg.context.close()
    # --- sin el SQL de equipos todavía ---
    pg=page(b,seed('pro'),'window.__noTeams=true;');login(pg)
    check('sin la tabla de equipos la app funciona igual',chips(pg)==['Mi equipo'] and rows(pg)==8)
    pg.click('[data-teamact=add]');pg.wait_for_timeout(200)
    check('y avisa de que falta el paso del servidor',pg.locator('#message').inner_text().find('supabase-equipos.sql')>=0)
    b.close()
errs=[e for e in errs if 'favicon' not in e]
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
sys.exit(0 if all(res) and not errs else 1)
