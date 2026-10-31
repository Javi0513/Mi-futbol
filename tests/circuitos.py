import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json
from playwright.sync_api import sync_playwright
# Circuitos de fuerza y coordinación (v10.4): biblioteca, circuito en el entreno, Mis circuitos y cronómetro.
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
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8831),functools.partial(H,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8831/index.html'
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

ON="localStorage.setItem('mf_entrenos:u1','1');"
TR=lambda:[{'id':'t1','owner_id':'u1','modalidad':'7','fecha':HOY,'asistencia':{},'circuito':None}]
def sd(plan,circs=None):
    d=seed(plan,TR());d['circuitos']=circs or [];return d
def info(pg):return pg.locator('#infoBody').inner_text()
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=page(b,sd('gratis'),ON);login(pg);pg.click('[data-tab=entrenos]');pg.wait_for_selector('.trs')
    check('el entreno tiene el botón para añadir circuito',pg.locator('.trs [data-ci=nuevo]').count()==1)
    check('sale el apartado Circuitos con 0 / 3',pg.locator('.ci-panel').inner_text().find('0 / 3')>=0)
    pg.click('.trs [data-ci=nuevo]');pg.wait_for_selector('#info:not(.hidden)')
    check('empieza ofreciendo las plantillas',pg.locator('#infoBody [data-ci=usaplant]').count()==5)
    pg.screenshot(path=OUT+'/circ_plantillas.png')
    pg.click('#infoBody [data-ci=usaplant] >> nth=0')
    pg.screenshot(path=OUT+'/circ_editor.png')
    check('la plantilla copia sus 6 ejercicios',pg.locator('#infoBody .ci-est li').count()==6 and pg.locator('#infoBody input[data-cif=nombre]').input_value()=='Fuerza básica sin material')
    check('cada ejercicio de la biblioteca lleva su dibujo',pg.locator('#infoBody .ci-est li svg.ci-pic').count()==6)
    pg.select_option('#infoBody select[data-cif=trabajo]','40');pg.wait_for_timeout(50)
    check('cambiar el tiempo recalcula la duración',info(pg).find('40 s trabajo / 15 s descanso · 3 series')>=0,info(pg)[:300])
    pg.click('#infoBody [data-ci=lib]')
    check('biblioteca: 5 tipos de ejercicio',pg.locator('#infoBody .ci-cats .chip').count()==5)
    n=0
    for k in ['fuerza','core','coord','veloc','movil']:
        pg.click(f'#infoBody [data-ci=cat][data-k={k}]');n+=pg.locator('#infoBody .ci-ej').count()
    check('biblioteca: 40 ejercicios con dibujo y explicación',n==40 and pg.locator('#infoBody .ci-ej svg').count()>0,str(n))
    pg.click('#infoBody [data-ci=cat][data-k=coord]');pg.screenshot(path=OUT+'/circ_biblioteca.png');pg.click('#infoBody .ci-ej:has-text("Escalera: un pie") [data-ci=add]')
    pg.click('#infoBody [data-ci=volver]')
    check('añadir de la biblioteca suma un ejercicio',pg.locator('#infoBody .ci-est li').count()==7)
    pg.click('#infoBody [data-ci=sube] >> nth=6')
    check('se puede cambiar el orden',pg.locator('#infoBody .ci-est li >> nth=5').inner_text().startswith('Escalera'))
    pg.click('#infoBody [data-ci=fuera] >> nth=0')
    check('se puede quitar un ejercicio',pg.locator('#infoBody .ci-est li').count()==6 and not pg.locator('#infoBody .ci-est li >> nth=0').inner_text().startswith('Sentadilla'))
    pg.click('#infoBody [data-ci=propio]');pg.fill('#infoBody [data-cip=n]','Saltos a la comba');pg.fill('#infoBody [data-cip=d]','Un minuto sin parar');pg.click('#infoBody [data-ci=propiook]')
    check('ejercicio propio con su explicación',pg.locator('#infoBody .ci-est li').count()==7 and info(pg).find('Saltos a la comba')>=0)
    pg.check('#infoBody input[data-cif=guardar]');pg.click('#infoBody [data-ci=ok]');pg.wait_for_timeout(300)
    c=DB(pg,"d.entrenamientos[0].circuito")
    check('se guarda en el entreno',c and len(c['est'])==7 and c['trabajo']==40 and c['est'][-1]['n']=='Saltos a la comba' and c['est'][-1]['e'] is None,str(c)[:200])
    check('y también en Mis circuitos',DB(pg,"d.circuitos.length")==1 and DB(pg,"d.circuitos[0].nombre")=='Fuerza básica sin material')
    check('el entreno enseña el circuito',pg.locator('.trs .ci-card').count()==1 and pg.locator('.trs .ci-mini li').count()==7)
    check('el apartado cuenta 1 / 3',pg.locator('.ci-panel').inner_text().find('1 / 3')>=0 and pg.locator('.ci-panel .ci-row').count()==1)
    pg.screenshot(path=OUT+'/circ_entreno.png',full_page=True)
    # cronómetro
    pg.click('.trs [data-ci=run]');pg.wait_for_selector('.cto')
    check('el cronómetro empieza con «Prepárate»',pg.locator('.cto.ph-prep').count()==1 and pg.locator('.cto-t').inner_text() in ('10','9'))
    check('enseña el primer ejercicio que viene',pg.locator('.cto-ej').inner_text().find('Zancadas')>=0)
    pg.screenshot(path=OUT+'/circ_prep.png')
    pg.click('.cto [data-cto=next]')
    check('Saltar pasa al trabajo',pg.locator('.cto.ph-work').count()==1 and pg.locator('.cto-top').inner_text().find('Ejercicio 1/7')>=0)
    pg.wait_for_timeout(1300)
    t1=int(pg.locator('.cto-t').inner_text())
    check('la cuenta atrás corre',38<=t1<=39,str(t1))
    pg.screenshot(path=OUT+'/circ_trabajo.png')
    pg.click('.cto [data-cto=pausa]');a=pg.locator('.cto-t').inner_text();pg.wait_for_timeout(1300)
    check('Pausa para el tiempo',pg.locator('.cto.parado').count()==1 and pg.locator('.cto-t').inner_text()==a and pg.locator('.cto-ph').inner_text().lower()=='en pausa')
    pg.click('.cto [data-cto=pausa]')
    pg.click('.cto [data-cto=next]')
    check('después del trabajo viene el descanso',pg.locator('.cto.ph-rest').count()==1 and pg.locator('.cto-ej').inner_text().find('Flexiones')>=0)
    pg.click('.cto [data-cto=prev]')
    check('Atrás vuelve al ejercicio',pg.locator('.cto.ph-work').count()==1)
    for i in range(60):
        if pg.locator('.cto.ph-fin').count():break
        pg.click('.cto [data-cto=next]')
    check('al final sale «Circuito terminado»',pg.locator('.cto.ph-fin').count()==1)
    pg.click('.cto [data-cto=x]')
    check('Cerrar quita el cronómetro',pg.locator('.cto').count()==0 and not pg.evaluate("document.body.classList.contains('cam-on')"))
    # editar y quitar
    pg.click('.trs [data-ci=editar]');pg.fill('#infoBody input[data-cif=nombre]','Fuerza martes');pg.click('#infoBody [data-ci=ok]');pg.wait_for_timeout(250)
    check('se puede editar el circuito del entreno',DB(pg,"d.entrenamientos[0].circuito.nombre")=='Fuerza martes' and DB(pg,"d.circuitos.length")==1)
    pg.click('.trs [data-ci=quitar]');pg.wait_for_timeout(250)
    check('se puede quitar del entreno',DB(pg,"d.entrenamientos[0].circuito") is None and pg.locator('.trs [data-ci=nuevo]').count()==1)
    # Mis circuitos
    pg.click('.ci-panel [data-ci=editmis]');pg.fill('#infoBody input[data-cif=nombre]','Mi fuerza');pg.click('#infoBody [data-ci=ok]');pg.wait_for_timeout(250)
    check('editar uno de Mis circuitos',DB(pg,"d.circuitos[0].nombre")=='Mi fuerza' and DB(pg,"d.circuitos[0].datos.nombre")=='Mi fuerza')
    pg.click('.trs [data-ci=nuevo]');pg.click('#infoBody [data-ci=usamis]')
    check('usar uno de Mis circuitos en el entreno',pg.locator('#infoBody input[data-cif=nombre]').input_value()=='Mi fuerza')
    pg.click('#closeInfo')
    pg.click('.ci-panel [data-ci=runmis]');pg.wait_for_selector('.cto');pg.click('.cto [data-cto=x]')
    check('iniciar desde Mis circuitos',pg.locator('.cto').count()==0)
    pg.click('.ci-panel [data-ci=delmis]');pg.wait_for_timeout(250)
    check('borrar uno de Mis circuitos',DB(pg,"d.circuitos.length")==0 and pg.locator('.ci-panel .ci-row').count()==0)
    pg.click('.ci-panel [data-ci=biblio]')
    check('la biblioteca se puede ver sin crear circuito',pg.locator('#infoBody .ci-ej').count()>0 and pg.locator('#infoBody [data-ci=add]').count()==0)
    pg.click('#closeInfo')
    pg.click('#acct');pg.locator('#info [data-acct=export]').count()
    pg.context.close()
    # límite del plan gratuito
    C=[{'id':f'c{i}','owner_id':'u1','nombre':f'C{i}','datos':{'nombre':f'C{i}','trabajo':30,'descanso':15,'series':2,'pausa':60,'est':[{'e':'sent','n':'Sentadilla','d':''}]}} for i in range(3)]
    pg=page(b,sd('gratis',CP(C)),ON);login(pg);pg.click('[data-tab=entrenos]');pg.wait_for_selector('.ci-panel')
    pg.click('.ci-panel [data-ci=nuevomis]');pg.wait_for_selector('#info:not(.hidden)')
    check('gratis: con 3 circuitos guardados enseña el plan Pro',info(pg).find('3 circuitos')>=0 and pg.locator('#infoTitle').text_content()=='Plan Pro')
    pg.click('#closeInfo')
    pg.click('.trs [data-ci=nuevo]');pg.click('#infoBody [data-ci=usaplant] >> nth=1');pg.check('#infoBody input[data-cif=guardar]');pg.click('#infoBody [data-ci=ok]');pg.wait_for_timeout(300)
    check('gratis: el circuito sí se pone en el entreno aunque no quepa en Mis circuitos',DB(pg,"d.entrenamientos[0].circuito.est.length")==6 and DB(pg,"d.circuitos.length")==3 and pg.locator('#infoTitle').text_content()=='Plan Pro')
    pg.context.close()
    pg=page(b,sd('pro',CP(C)),ON);login(pg);pg.click('[data-tab=entrenos]');pg.wait_for_selector('.ci-panel')
    check('Pro: no enseña contador',pg.locator('.ci-panel').inner_text().find('/ 3')<0)
    pg.click('.ci-panel [data-ci=nuevomis]');pg.click('#infoBody [data-ci=usaplant] >> nth=2');pg.click('#infoBody [data-ci=ok]');pg.wait_for_timeout(300)
    check('Pro: circuitos guardados ilimitados',DB(pg,"d.circuitos.length")==4)
    pg.context.close()
    # sin ejecutar el SQL la app sigue igual
    pg=page(b,sd('gratis'),ON)
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE.replace("if(window.__noTeams&&t==='equipos')","if(t==='circuitos')")))
    login(pg);pg.click('[data-tab=entrenos]');pg.wait_for_selector('.trs')
    check('sin el SQL no sale nada de circuitos y todo funciona',pg.locator('[data-ci]').count()==0 and pg.locator('.trs .trow').count()==4)
    pg.context.close()
    # móvil en horizontal / pantalla pequeña: el cronómetro cabe
    pg=page(b,sd('gratis'),ON);pg.set_viewport_size({'width':844,'height':390});login(pg);pg.click('[data-tab=entrenos]');pg.wait_for_selector('.trs')
    pg.click('.trs [data-ci=nuevo]');pg.click('#infoBody [data-ci=usaplant] >> nth=0');pg.click('#infoBody [data-ci=ok]');pg.wait_for_timeout(250)
    pg.click('.trs [data-ci=run]');pg.click('.cto [data-cto=next]')
    bb=pg.locator('.cto [data-cto=pausa]').bounding_box()
    check('móvil girado: los botones del cronómetro se ven',bb and bb['y']+bb['height']<=390+1,str(bb))
    pg.screenshot(path=OUT+'/circ_horizontal.png')
    pg.context.close()
    b.close()
srv.shutdown()
errs=[e for e in errs if 'Failed to load resource' not in e]
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
sys.exit(0 if all(res) and not errs else 1)
