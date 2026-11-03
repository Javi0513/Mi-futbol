import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json
from playwright.sync_api import sync_playwright
# Ejercicios sueltos en el entreno (v11.0): nombre, explicación y tiempo propio, sin circuito.
# Mismo Supabase simulado que teams.py. Supabase simulado con filtros eq / is / in encadenados,
# borrado en cascada de jugadores y partidos al borrar su equipo, y la tabla equipos opcional.
FAKE=r"""
window.__calls=[];
window.__db=window.__seed||{};
const CP=(x)=>JSON.parse(JSON.stringify(x));
window.supabase={createClient:()=>{let cb=null,session=null;
 const q=(t)=>{let F=[],op='select',payload=null,sel=false;
  const ok=(r)=>F.every(([k,c,v])=>k==='eq'?r[c]===v:k==='is'?(r[c]==null)===(v===null):v.includes(r[c]));
  const o={select(c){sel=true;if(window.__noEj&&String(c||'').includes('ejercicios'))t='__falta';return o},order(){return o},limit(){return o},eq(c,v){F.push(['eq',c,v]);return o},is(c,v){F.push(['is',c,v]);return o},in(c,v){F.push(['in',c,v]);return o},
  insert(p){op='insert';payload=p;return o},update(p){op='update';payload=p;return o},delete(){op='delete';return o},
  then(res){let out;
   if((window.__noTeams&&t==='equipos')||t==='__falta')out={data:null,error:{message:'relation "public.equipos" does not exist'}};
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
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8836),functools.partial(H,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8836/index.html'
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
ON="localStorage.setItem('mf_entrenos:u1','1');"
def sd(ej=None):
    return {'futbol_personal_jugadores':CP(P),'futbol_personal_partidos':[],'perfiles':[{'id':'u1','plan':'gratis'}],
      'entrenamientos':[{'id':'t1','owner_id':'u1','modalidad':'7','fecha':HOY,'asistencia':{},'circuito':None,'ejercicios':ej}],'circuitos':[]}
def mmss(pg,m,s_):
    pg.fill('#infoBody [data-ejm=m]',str(m));pg.fill('#infoBody [data-ejm=s]',str(s_))
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=page(b,sd(),ON);login(pg);pg.click('[data-tab=entrenos]');pg.wait_for_selector('.trs')
    add=pg.locator('.trs [data-ej=nuevo]');ci=pg.locator('.trs [data-ci=nuevo]')
    check('sale «Añadir ejercicio» en el entreno',add.count()==1 and 'Añadir ejercicio' in add.text_content())
    check('está justo debajo de «Añadir circuito»',ci.bounding_box()['y']<add.bounding_box()['y'])
    pg.screenshot(path=OUT+'/ej_boton.png')
    add.click();pg.wait_for_selector('#info:not(.hidden)')
    check('el formulario pide nombre, explicación y tiempo',pg.locator('#infoBody [data-ejf=n]').count()==1 and pg.locator('#infoBody [data-ejf=d]').count()==1 and pg.locator('#infoBody [data-ejm]').count()==2)
    check('tiempo por defecto 10 min',pg.locator('#infoBody [data-ejm=m]').input_value()=='10' and pg.locator('#infoBody [data-ejm=s]').input_value()=='0')
    pg.click('#infoBody [data-ej=ok]');pg.wait_for_timeout(150)
    check('sin nombre no se guarda',not DB(pg,"d.entrenamientos[0].ejercicios") and pg.locator('#message').inner_text().find('nombre')>=0)
    pg.fill('#infoBody [data-ejf=n]','Rondo 4 contra 2');pg.fill('#infoBody [data-ejf=d]','Dos dentro roban, cuatro fuera tocan a dos toques.');mmss(pg,12,30)
    pg.screenshot(path=OUT+'/ej_form.png')
    pg.click('#infoBody [data-ej=ok]');pg.wait_for_timeout(250)
    L=DB(pg,"d.entrenamientos[0].ejercicios")
    check('se guarda en el entreno con su tiempo (12:30 = 750 s)',L==[{'n':'Rondo 4 contra 2','d':'Dos dentro roban, cuatro fuera tocan a dos toques.','t':750}],str(L))
    check('el circuito no se toca',DB(pg,"d.entrenamientos[0].circuito")==None)
    check('se ve en el entreno con su tiempo',pg.locator('.ej-it').count()==1 and '12:30 min' in pg.locator('.ej-it').inner_text())
    pg.click('.trs [data-ej=nuevo]');pg.wait_for_selector('#info:not(.hidden)')
    pg.fill('#infoBody [data-ejf=n]','Partidillo');mmss(pg,150,0);pg.click('#infoBody [data-ej=ok]');pg.wait_for_timeout(250)
    L=DB(pg,"d.entrenamientos[0].ejercicios")
    check('segundo ejercicio; el tiempo no tiene tope (150 min)',len(L)==2 and L[1]['t']==9000,str(L))
    check('suma el total',pg.locator('.ej-card').inner_text().find('2 ejercicios · unos 163 min')>=0,pg.locator('.ej-card').inner_text()[:80])
    pg.screenshot(path=OUT+'/ej_lista.png',full_page=False)
    pg.click('.ej-it >> nth=1 >> [data-ej=editar]');pg.wait_for_selector('#info:not(.hidden)')
    check('editar trae los datos',pg.locator('#infoBody [data-ejf=n]').input_value()=='Partidillo' and pg.locator('#infoBody [data-ejm=m]').input_value()=='150')
    pg.fill('#infoBody [data-ejf=n]','Partidillo final');mmss(pg,0,45);pg.click('#infoBody [data-ej=ok]');pg.wait_for_timeout(250)
    L=DB(pg,"d.entrenamientos[0].ejercicios")
    check('editar cambia nombre y tiempo',L[1]=={'n':'Partidillo final','d':'','t':45},str(L))
    pg.click('.ej-it >> nth=0 >> [data-ej=run]');pg.wait_for_selector('.cto')
    check('▶ abre el cronómetro de ese ejercicio',pg.locator('.cto-ej').inner_text().find('Rondo 4 contra 2')>=0)
    pg.click('.cto [data-cto=next]')
    check('el trabajo dura su tiempo',pg.locator('.cto.ph-work').count()==1 and pg.locator('.cto-t').inner_text() in ('12:30','12:29'),pg.locator('.cto-t').inner_text())
    pg.click('.cto [data-cto=x]');pg.wait_for_timeout(200)
    check('se cierra el cronómetro',pg.locator('.cto').count()==0)
    pg.click('.ej-it >> nth=0 >> [data-ej=quitar]');pg.wait_for_timeout(250)
    L=DB(pg,"d.entrenamientos[0].ejercicios")
    check('quitar borra solo ese',len(L)==1 and L[0]['n']=='Partidillo final',str(L))
    pg.close()
    # Sin el SQL no sale el botón y todo lo demás funciona
    pg=page(b,sd(),ON+'window.__noEj=1;');login(pg);pg.click('[data-tab=entrenos]');pg.wait_for_selector('.trs')
    check('sin el SQL no sale «Añadir ejercicio» y el circuito sigue',pg.locator('[data-ej=nuevo]').count()==0 and pg.locator('[data-ci=nuevo]').count()==1)
    pg.close()
    b.close()
src_app=open(os.path.join(APP,'app.js'),encoding='utf-8').read()
check('la Guía de uso tiene «Ejercicios del entreno»','t: "Ejercicios del entreno"' in src_app and 'Añadir ejercicio' in src_app)
errs=[e for e in errs if 'favicon' not in e]
print('PASS',sum(res),'/',len(res),errs)
sys.exit(0 if all(res) and not errs else 1)
