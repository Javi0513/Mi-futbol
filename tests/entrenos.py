import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json
from playwright.sync_api import sync_playwright
# Control de entrenamientos (v9.1): calendario, pasar lista y asistencia por jugador.
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
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8823),functools.partial(H,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8823/index.html'
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
def page(b,sd,extra=''):
    pg=b.new_context(viewport={'width':390,'height':844},service_workers='block').new_page()
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    pg.on('dialog',lambda d:d.accept())
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    pg.add_init_script('window.__seed='+json.dumps(sd)+';'+extra)
    return pg
def login(pg):
    pg.goto(URL);pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto12');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)');pg.wait_for_timeout(300)
DB=lambda pg,js:pg.evaluate('(()=>{let d=window.__db;return '+js+'})()')
vis=lambda pg:pg.locator('#trTab').is_visible()
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=page(b,seed('gratis',[]));login(pg)
    check('viene desactivado: no sale la pestaña Entrenos',not vis(pg) and pg.locator('.dock button:visible').count()==4)
    pg.click('#acct')
    btn=pg.locator('#info [data-acct=entrenos]')
    check('Mi cuenta tiene el botón para activarlo',btn.text_content()=='Activar el control de entrenamientos')
    btn.click();pg.wait_for_timeout(200)
    check('al activarlo sale la pestaña y se abre',vis(pg) and pg.locator('[data-tab=entrenos].on').count()==1 and pg.locator('.dock button:visible').count()==5)
    check('se ve el calendario del mes con 7 columnas',pg.locator('.cal-w span').count()==7 and pg.locator('.cal-g button').count()>=28)
    check('hoy está elegido',pg.locator(f'.cal-g button.on[data-f="{HOY}"]').count()==1)
    check('sin entrenamiento: botón para crearlo',pg.locator('#view').text_content().find('Crear entrenamiento este día')>=0)
    pg.screenshot(path=OUT+'/entrenos_vacio.png')
    pg.click('#view .stack [data-tr=new]');pg.wait_for_selector('.trs')
    check('se crea el entrenamiento en el equipo y día elegidos',DB(pg,"d.entrenamientos.length===1&&d.entrenamientos[0].fecha==='"+HOY+"'&&d.entrenamientos[0].modalidad==='7'"))
    check('la lista tiene a los jugadores de la plantilla',pg.locator('.trs .trow').count()==4)
    pg.click('.trow:has-text("J0") [data-v=si]');pg.click('.trow:has-text("J1") [data-v=no]');pg.click('.trow:has-text("J2") [data-v=jus]');pg.wait_for_timeout(250)
    check('pasar lista se guarda solo',DB(pg,"JSON.stringify(d.entrenamientos[0].asistencia)")=='{"p0":"si","p1":"no","p2":"jus"}',DB(pg,"JSON.stringify(d.entrenamientos[0].asistencia)"))
    check('el resumen cuenta vinieron, faltaron y justificadas',pg.locator('.trsum').inner_text().startswith('1 vinieron · 1 faltaron · 1 justificadas · 1 sin marcar'),pg.locator('.trsum').inner_text())
    pg.click('.trow:has-text("J0") [data-v=si]');pg.wait_for_timeout(200)
    check('tocar otra vez lo desmarca',DB(pg,"d.entrenamientos[0].asistencia.p0")is None)
    pg.click('.trs [data-tr=all]');pg.wait_for_timeout(250)
    check('«Todos vinieron» marca a todos',DB(pg,"Object.values(d.entrenamientos[0].asistencia).every(v=>v==='si')&&Object.keys(d.entrenamientos[0].asistencia).length===4"))
    pg.click('.trow:has-text("J3") [data-v=no]');pg.wait_for_timeout(200)
    pg.fill('[data-trf=nota]','Táctica');pg.press('[data-trf=nota]','Tab');pg.wait_for_timeout(200)
    check('se guarda la nota',DB(pg,"d.entrenamientos[0].nota")=='Táctica')
    check('el día sale en el calendario con su color',pg.locator(f'.cal-g button.has.d[data-f="{HOY}"]').count()==1)
    t=pg.locator('#view section').last.inner_text()
    check('asistencia por jugador con porcentaje',t.find('100%')>=0 and t.find('0%')>=0 and pg.locator('#view section').last.locator('.row').count()==4)
    pg.click('.trs [data-action=add-player]');pg.fill('#playerForm input[name=nombre]','Nuevo Chico');pg.click('#playerForm button.primary')
    pg.wait_for_function("document.querySelectorAll('.trs .trow').length===5")
    check('«Añadir jugador» lo mete en la plantilla y en la lista',DB(pg,"d.futbol_personal_jugadores.length")==5 and pg.locator('[data-tab=entrenos].on').count()==1)
    pg.screenshot(path=OUT+'/entrenos_lista.png',full_page=True)
    pg.click('.cal-h [data-tr=next]');pg.wait_for_timeout(100)
    check('las flechas cambian de mes',pg.locator('.cal-h b').inner_text()!=pg.evaluate("['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][new Date().getMonth()]+' '+new Date().getFullYear()"))
    pg.click('.cal-g button[data-f$="-15"]');pg.wait_for_timeout(100)
    check('al tocar otro día se ve sin entrenamiento',pg.locator('.trs').count()==0)
    pg.click('#acct')
    check('Mi cuenta enseña lo que llevas de entrenamientos',pg.locator('#info .usage').inner_text().find('1/5 entr.')>=0)
    pg.click('#closeInfo')
    pg.click('.cal-h [data-tr=prev]');pg.click(f'.cal-g button[data-f="{HOY}"]');pg.click('.trs [data-tr=del]');pg.wait_for_timeout(250)
    check('se puede borrar un entrenamiento',DB(pg,"d.entrenamientos.length")==0 and pg.locator('.trs').count()==0)
    pg.click('#acct');pg.click('#info [data-acct=entrenos]');pg.wait_for_timeout(150)
    check('se puede desactivar y vuelve a Plantilla',not vis(pg) and pg.locator('[data-tab=plantilla].on').count()==1)
    pg.context.close()
    # --- límite del plan gratuito y activado solo si ya hay entrenamientos ---
    T=[{'id':f't{i}','owner_id':'u1','modalidad':'7','fecha':f'2026-09-{i+1:02d}','asistencia':{}} for i in range(5)]
    pg=page(b,seed('gratis',CP(T)));login(pg)
    check('si ya tienes entrenamientos sale la pestaña sola',vis(pg))
    pg.click('[data-tab=entrenos]');pg.click('#view [data-tr=new] >> nth=0');pg.wait_for_selector('#info:not(.hidden)')
    check('gratis: con 5 entrenamientos enseña el plan Pro',pg.locator('#infoBody').inner_text().find('5 entrenamientos')>=0 and DB(pg,"d.entrenamientos.length")==5)
    pg.context.close()
    pg=page(b,seed('pro',CP(T)));login(pg)
    pg.click('[data-tab=entrenos]');pg.click('#view [data-tr=new] >> nth=0');pg.wait_for_timeout(250)
    check('Pro: entrenamientos ilimitados',DB(pg,"d.entrenamientos.length")==6)
    pg.context.close()
    # --- sin la tabla en el servidor la app sigue funcionando ---
    pg=page(b,{'futbol_personal_jugadores':CP(P),'perfiles':[{'id':'u1','plan':'gratis'}]},"localStorage.setItem('mf_entrenos:u1','1');")
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE.replace("if(window.__noTeams&&t==='equipos')","if(t==='entrenamientos')")))
    login(pg);pg.click('[data-tab=entrenos]');pg.wait_for_timeout(100)
    check('sin la tabla avisa del paso que falta',pg.locator('#view').inner_text().find('supabase-entrenamientos.sql')>=0 and pg.locator('#view .row').count()==0)
    pg.context.close()
    b.close()
srv.shutdown()
errs=[e for e in errs if 'Failed to load resource' not in e]
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
sys.exit(0 if all(res) and not errs else 1)
