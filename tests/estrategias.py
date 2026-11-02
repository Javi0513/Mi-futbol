import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json
from playwright.sync_api import sync_playwright
# v10.8: estrategias de fútbol sala en la pizarra (biblioteca, gratis/Pro, carga animada y explicación por pasos).
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
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8841),functools.partial(H,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8841/index.html'
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

def st(pg):return json.loads(pg.evaluate("localStorage.getItem('mf_pizarra_v1')||'{}'")).get('fs',{})
def board(pg,w=390,h=844):
    pg.click('[data-mode="fs"]');pg.click('[data-tab=pizarra]');pg.wait_for_selector('#bcanvas');pg.wait_for_timeout(300)
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=page(b,sd('gratis'));login(pg)
    pg.click('[data-tab=pizarra]');pg.wait_for_selector('#bcanvas')
    check('en fútbol 7 no sale el botón de estrategias',pg.locator('[data-b=est]').count()==0)
    board(pg)
    check('en fútbol sala sale el botón «Estrategias de fútbol sala»',pg.locator('[data-b=est]').count()==1 and 'ESTRATEGIAS' in pg.inner_text('[data-b=est]').upper())
    pg.screenshot(path=OUT+'/est_boton.png')
    pg.click('[data-b=est]');pg.wait_for_selector('#info:not(.hidden)')
    n=pg.locator('#infoBody .est-item').count()
    check('la biblioteca tiene 34 estrategias',n==34,n)
    check('gratis: 10 libres (TOP) y 24 con candado',pg.locator('#infoBody .est-item:not(.lock)').count()==10 and pg.locator('#infoBody .est-item.lock').count()==24)
    check('cada estrategia tiene su dibujo',pg.locator('#infoBody .est-item svg.est-pv').count()==34)
    pg.screenshot(path=OUT+'/est_biblioteca.png')
    pg.click('#infoBody [data-estc=corner]');pg.wait_for_timeout(100)
    check('filtro Córners',pg.locator('#infoBody .est-item').count()==8 and pg.locator('#infoBody [data-estc=corner][aria-pressed=true]').count()==1)
    pg.click('#infoBody [data-estc=top]');pg.wait_for_timeout(100)
    check('filtro Las más usadas',pg.locator('#infoBody .est-item').count()==10)
    pg.click('#infoBody [data-estc=""]');pg.wait_for_timeout(100)
    pg.click('#infoBody .est-item.lock >> nth=0');pg.wait_for_timeout(150)
    check('una Pro sin plan Pro: explica el plan y no carga',pg.locator('#infoTitle').text_content()=='Estrategia Pro' and 'plan Pro' in info(pg) and not st(pg).get('items'))
    pg.click('#infoBody [data-estlib]');pg.wait_for_timeout(100)
    check('volver a la biblioteca',pg.locator('#infoBody .est-item').count()==34)
    pg.click('#infoBody [data-est=c1]');pg.wait_for_timeout(300)
    s=st(pg)
    check('carga el córner: 11 fichas y 4 pasos',len(s.get('items',[]))==11 and s.get('steps')==4 and s.get('est')=='c1',(len(s.get('items',[])),s.get('steps')))
    check('se cierra la ventana',pg.locator('#info').is_hidden())
    check('sale la explicación encima del campo',pg.locator('.est-card').is_visible() and 'Paso 1:' in pg.inner_text('#estStep'))
    check('etiquetas de puestos (C, PV, AD, AI y portero)',sorted(i['n'] for i in s['items'] if i['k']=='own')==['AD','AI','C','P','PV'])
    check('el portero sale en amarillo',[i.get('c') for i in s['items'] if i['n']=='P' and i['k']=='own']==['#fbbf24'])
    check('las posiciones están dentro del campo',all(0<=q[0]<=1 and 0<=q[1]<=1 for i in s['items'] for q in i['p']))
    pg.wait_for_timeout(350)
    check('la jugada se pone en marcha sola',pg.locator('#boardPanel.playing').count()==1)
    pg.wait_for_timeout(1400)
    check('mientras se mueve cambia el texto del paso',('Paso 2:' in pg.inner_text('#estStep')) or ('Paso 3:' in pg.inner_text('#estStep')),pg.inner_text('#estStep'))
    pg.screenshot(path=OUT+'/est_cargada_movil.png')
    pg.wait_for_timeout(3500)
    check('al terminar queda en el último paso',pg.locator('#boardPanel.playing').count()==0 and 'Paso 4:' in pg.inner_text('#estStep') and 'Paso 4 / 4' in pg.inner_text('.bst-n'))
    pg.click('[data-b=prev]');pg.wait_for_timeout(150)
    check('con ‹ cambia la explicación al paso 3',pg.inner_text('#estStep').startswith('Paso 3:'))
    pg.click('.est-claves summary');pg.wait_for_timeout(100)
    check('claves para que salga bien',pg.locator('.est-claves li').count()>=2)
    pg.click('[data-b=undo]');pg.wait_for_timeout(200)
    check('deshacer vuelve a la pizarra anterior y quita la explicación',len(st(pg).get('items',[]))==0 and pg.locator('.est-card').count()==0)
    # con fichas propias pide confirmación (se acepta)
    pg.click('[data-b=add][data-v=riv]');pg.wait_for_timeout(100)
    msgs=[]
    pg.on('dialog',lambda d:msgs.append(d.message))
    pg.click('[data-b=est]');pg.click('#infoBody [data-est=f1]');pg.wait_for_timeout(300)
    check('si tenías algo en la pizarra, avisa antes de cambiarlo',len(msgs)==1 and 'Deshacer' in msgs[0] and st(pg).get('est')=='f1')
    login(pg);board(pg)
    check('al volver a abrir la app sigue la estrategia y su explicación',st(pg).get('est')=='f1' and pg.locator('.est-card').is_visible())
    pg.click('[data-b=estx]');pg.wait_for_timeout(100)
    check('la X quita la explicación pero no la jugada',pg.locator('.est-card').count()==0 and len(st(pg)['items'])>5)
    pg.click('[data-b=present]');pg.wait_for_timeout(200)
    check('en pantalla completa no sale la barra de estrategias',pg.locator('.est-bar').count()==0)
    pg.click('[data-b=present]')
    pg.context.close()
    # Pro: las 34 libres
    pg=page(b,sd('pro'));login(pg);board(pg)
    pg.click('[data-b=est]');pg.wait_for_selector('#info:not(.hidden)')
    check('Pro: las 34 sin candado',pg.locator('#infoBody .est-item.lock').count()==0 and pg.locator('#infoBody .est-item').count()==34)
    import re
    ids=pg.evaluate("window.MF_EST_FS.list.map(e=>e.id)")
    bad=[]
    for i in ids:
        if pg.locator('#info').is_hidden():pg.click('[data-b=est]')
        pg.click(f'#infoBody [data-est={i}]');pg.wait_for_timeout(120)
        s=st(pg)
        if s.get('est')!=i or not s.get('items') or not pg.locator('.est-card').is_visible():bad.append(i)
    check('Pro: todas se cargan con su explicación',not bad,bad)
    pg.click('[data-b=est]');pg.click('#infoBody [data-est=x1]');pg.wait_for_timeout(300)
    s=st(pg)
    check('5x4: portero-jugador en amarillo y sin portero propio',[i.get('c') for i in s['items'] if i['n']=='PJ']==['#fbbf24'] and not [i for i in s['items'] if i['k']=='own' and i['n']=='P'])
    pg.wait_for_timeout(5000)
    pg.screenshot(path=OUT+'/est_5x4.png')
    pg.context.close()
    # tablet en horizontal
    pg=b.new_context(viewport={'width':1180,'height':820},service_workers='block').new_page()
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)))
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    pg.add_init_script('window.__seed='+json.dumps(sd('pro'))+';')
    pg.on('dialog',lambda d:d.accept())
    login(pg);board(pg)
    pg.click('[data-b=est]');pg.wait_for_selector('#info:not(.hidden)');pg.screenshot(path=OUT+'/est_biblioteca_tablet.png')
    pg.click('#infoBody [data-est=b1]');pg.wait_for_timeout(5500)
    check('tablet: campo en horizontal con la estrategia',pg.locator('#boardPanel.land').count()==1 and st(pg).get('est')=='b1')
    pg.screenshot(path=OUT+'/est_tablet.png')
    # guía de uso
    pg.click('#acct');pg.wait_for_timeout(200);pg.click('#infoBody [data-info=ayuda]');pg.wait_for_timeout(200)
    check('la guía de uso explica las estrategias',info(pg).find('Estrategias de fútbol sala')>=0)
    b.close()
check('sin errores en la consola',not errs,errs[:5])
print(sum(res),'/',len(res))
sys.exit(0 if all(res) else 1)
