import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json
from playwright.sync_api import sync_playwright
# Carga física (v10.5): esfuerzo 1-10 × minutos en entrenos y partidos, gráfico y aviso de sobrecarga (Pro).
# Mismo Supabase simulado que teams.py. Supabase simulado con filtros eq / is / in encadenados,
# borrado en cascada de jugadores y partidos al borrar su equipo, y la tabla equipos opcional.
FAKE=r"""
window.__calls=[];
window.__db=window.__seed||{};
const CP=(x)=>JSON.parse(JSON.stringify(x));
window.supabase={createClient:()=>{let cb=null,session=null;
 const q=(t)=>{let F=[],op='select',payload=null,sel=false;
  const ok=(r)=>F.every(([k,c,v])=>k==='eq'?r[c]===v:k==='is'?(r[c]==null)===(v===null):v.includes(r[c]));
  const o={select(){sel=true;return o},order(){return o},limit(){return o},eq(c,v){F.push(['eq',c,v]);return o},is(c,v){F.push(['is',c,v]);return o},in(c,v){F.push(['in',c,v]);return o},
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
D=datetime.date.today()
def f(dd):return (D-datetime.timedelta(days=dd)).isoformat()
def tr():
    T=[{'id':'t0','owner_id':'u1','modalidad':'7','fecha':HOY,'asistencia':{'p0':'si','p1':'si','p2':'si','p3':'no'},'carga':None}]
    for i in range(1,5):T.append({'id':f't{i}','owner_id':'u1','modalidad':'7','fecha':f(7*i),'asistencia':{'p0':'si'},'carga':{'dur':60,'rpe':{'p0':5}}})
    return T
PART=[{'id':f'p{i}','nombre':f'J{i}','minutes':m,'goals':0,'starter':m>0} for i,m in enumerate([50,30,0,20])]
def sd(plan):
    d=seed(plan,tr());d['circuitos']=[]
    d['futbol_personal_partidos']=[{'id':'m1','owner_id':'u1','modalidad':'7','fecha':f(2),'rival':'Los Pinos','participaciones':json.dumps(PART),'alineacion':'{}','created_at':''}]
    return d
def info(pg):return pg.locator('#infoBody').inner_text()
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=page(b,sd('pro'),ON);login(pg);pg.click('[data-tab=entrenos]');pg.wait_for_selector('.cg-panel')
    check('sale el apartado Carga física',pg.locator('.cg-panel h2').text_content()=='Carga física')
    check('avisa de los partidos sin esfuerzo anotado',pg.locator('.cg-pend [data-cg=pa]').count()==1 and 'Los Pinos' in pg.locator('.cg-pend').text_content())
    check('el entreno tiene «Anotar esfuerzo»',pg.locator('.trs [data-cg=tr]').count()==1)
    pg.click('.trs [data-cg=tr]');pg.wait_for_selector('#info:not(.hidden)')
    check('solo salen los que vinieron',pg.locator('#infoBody .cg-j').count()==3 and 'J3' not in info(pg))
    check('escala de 1 a 10 por jugador',pg.locator('#infoBody .cg-j >> nth=0').locator('.cg-n').count()==10)
    pg.fill('#infoBody [data-cgf=dur]','80')
    pg.click('#infoBody [data-cg=todos][data-v="6"]')
    pg.click('#infoBody .cg-j:has-text("J0") [data-v="9"]')
    check('el botón elegido se marca y dice qué significa',pg.locator('#infoBody .cg-j:has-text("J0") .cg-n.on').text_content()=='9' and 'Casi al máximo' in pg.locator('#infoBody .cg-j:has-text("J0")').inner_text())
    pg.screenshot(path=OUT+'/carga_anotar.png')
    pg.click('#infoBody [data-cg=ok]');pg.wait_for_timeout(300)
    c=DB(pg,"d.entrenamientos.find(t=>t.id==='t0').carga")
    check('se guarda el esfuerzo y los minutos',c=={'dur':80,'rpe':{'p0':9,'p1':6,'p2':6}},str(c))
    check('el entreno enseña el resumen',pg.locator('.trs .cg-res').inner_text().startswith('7,0 esfuerzo medio · 80 min · 3 jugadores'),pg.locator('.trs .cg-res').inner_text())
    row=pg.locator('.cg-row:has-text("J0")')
    check('carga de la semana = esfuerzo × minutos',row.locator('.big b').text_content()=='720')
    check('Pro: aviso de sobrecarga para quien sube de golpe','J0' in pg.locator('.cg-alerta').inner_text() and 'Cuidado' in row.inner_text())
    check('Pro: gráfico de 6 semanas del equipo y de cada jugador',pg.locator('.cg-eq .cg-bars span').count()==6 and row.locator('.cg-bars span').count()==6)
    pg.click('.cg-pend [data-cg=pa]');pg.wait_for_selector('#info:not(.hidden)')
    check('partido: salen los que jugaron con sus minutos',pg.locator('#infoBody .cg-j').count()==3 and '50 min' in info(pg) and 'J2' not in info(pg))
    pg.click('#infoBody [data-cg=todos][data-v="7"]');pg.click('#infoBody [data-cg=ok]');pg.wait_for_timeout(300)
    PP=json.loads(DB(pg,"d.futbol_personal_partidos[0].participaciones"))
    check('partido: el esfuerzo va con cada jugador',[x.get('rpe') for x in PP]==[7,7,None,7] and PP[0]['minutes']==50,str(PP))
    check('ya no sale como pendiente',pg.locator('.cg-pend').count()==0)
    sem=pg.evaluate("(()=>{let d=new Date();d.setDate(d.getDate()-((d.getDay()+6)%7));return d})()")
    exp=720+6*80*2+(7*50+7*30+7*20 if datetime.date.fromisoformat(f(2))>=datetime.date.fromisoformat(pg.evaluate("(()=>{let d=new Date();d.setDate(d.getDate()-((d.getDay()+6)%7));let p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())})()")) else 0)
    check('la carga del equipo suma entrenos y partidos',pg.locator('.cg-panel .bar .muted b').text_content()==str(exp),pg.locator('.cg-panel .bar .muted b').text_content()+' vs '+str(exp))
    pg.screenshot(path=OUT+'/carga_panel.png',full_page=True)
    pg.click('.cg-panel [data-cg=info]')
    check('la ayuda «?» explica la carga',info(pg).find('esfuerzo (del 1 al 10) × minutos')>=0)
    pg.click('#closeInfo')
    pg.click('.trs [data-cg=tr]');pg.click('#infoBody [data-cg=borrar]');pg.click('#infoBody [data-cg=ok]');pg.wait_for_timeout(300)
    check('se puede borrar lo anotado',DB(pg,"d.entrenamientos.find(t=>t.id==='t0').carga") is None and pg.locator('.trs [data-cg=tr]').count()==1)
    pg.context.close()
    # gratis: se anota y se ve la semana, sin gráfico ni avisos
    pg=page(b,sd('gratis'),ON);login(pg);pg.click('[data-tab=entrenos]');pg.wait_for_selector('.cg-panel')
    pg.click('.trs [data-cg=tr]');pg.click('#infoBody [data-cg=todos][data-v="8"]');pg.click('#infoBody [data-cg=ok]');pg.wait_for_timeout(300)
    check('gratis: también se puede anotar',DB(pg,"d.entrenamientos.find(t=>t.id==='t0').carga.rpe.p1")==8)
    check('gratis: ve la carga de la semana',pg.locator('.cg-row:has-text("J1") .big b').text_content()=='600')
    check('gratis: sin gráfico ni aviso, con explicación del Pro',pg.locator('.cg-bars').count()==0 and pg.locator('.cg-alerta').count()==0 and pg.locator('.cg-pro').count()==1)
    pg.click('.cg-pro [data-cg=pro]')
    check('gratis: el botón explica el plan Pro',pg.locator('#infoTitle').text_content()=='Plan Pro' and 'aviso de sobrecarga' in info(pg))
    pg.context.close()
    # sin ejecutar el SQL no sale nada
    pg=page(b,sd('pro'),ON)
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE.replace("limit(){return o},","")))
    login(pg);pg.click('[data-tab=entrenos]');pg.wait_for_selector('.trs')
    check('sin el SQL no sale nada de carga y todo funciona',pg.locator('[data-cg]').count()==0 and pg.locator('.trs .trow').count()==4)
    pg.context.close()
    b.close()
srv.shutdown()
errs=[e for e in errs if 'Failed to load resource' not in e]
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
sys.exit(0 if all(res) and not errs else 1)
