import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json,datetime
from playwright.sync_api import sync_playwright
# v11.6: los jugadores anotan su esfuerzo (1-10) desde el enlace del equipo y enlace del preparador físico.
src=open(TESTS+'/entrenos.py',encoding='utf-8').read();FAKE=src.split('FAKE=r"""')[1].split('"""')[0]
FAKE=FAKE.replace('order(){return o},','order(){return o},limit(){return o},',1)
FAKE=FAKE.replace("let F=[],op='select',payload=null,sel=false;","let F=[],op='select',payload=null,sel=false,cols='';",1)
FAKE=FAKE.replace("const o={select(){sel=true;return o},","const o={select(c){sel=true;cols=String(c||'');return o},",1)
FAKE=FAKE.replace("if(window.__noTeams&&t==='equipos')","if(window.__noEsf&&(t==='espacio_esfuerzos'||(t==='espacios'&&op==='select'&&cols.includes('codigo_pf'))))out={data:null,error:{message:'no existe'}};else if(window.__noTeams&&t==='equipos')",1)
FAKE=FAKE.replace("let r=CP(payload);","let r=CP(payload);if(t==='espacios'&&!r.id)r.id='1b2c3d4e-0000-4000-8000-'+String(Date.now()).slice(-12).padStart(12,'0');",1)
FAKE=FAKE.replace("rpc:async()=>({error:null})","""rpc:async(n,a)=>{let D=window.__db;
  if(n==='ver_espacio'){let e=(D.espacios||[]).find(x=>x.id===a.codigo);if(!e)return{data:null,error:null};
    return{data:CP({datos:e.datos,actualizado:new Date().toISOString(),respuestas:[],esfuerzos:(D.espacio_esfuerzos||[]).filter(r=>r.espacio_id===e.id).map(r=>({tipo:r.tipo,ref:r.ref,j:r.jugador_id}))}),error:null}}
  if(n==='ver_carga'){let e=(D.espacios||[]).find(x=>x.codigo_pf&&x.codigo_pf===a.codigo);if(!e)return{data:null,error:null};
    return{data:CP({equipo:e.datos.equipo,modalidad:e.datos.modalidad,jugadores:e.datos.jugadores,cg:e.datos.cg||null,actualizado:new Date().toISOString(),esfuerzos:(D.espacio_esfuerzos||[]).filter(r=>r.espacio_id===e.id).map(r=>({tipo:r.tipo,ref:r.ref,j:r.jugador_id,rpe:r.rpe}))}),error:null}}
  if(n==='anotar_esfuerzo'){let e=(D.espacios||[]).find(x=>x.id===a.codigo);let d=e&&e.datos||{};
    if(d.pideEsf===false)return{error:{message:'El entrenador no pide el esfuerzo'}};
    let s=(d.esf||[]).find(x=>x.t===a.p_tipo&&x.ref===a.p_ref);if(!s)return{error:{message:'Esa sesión ya no está'}};
    if(Array.isArray(s.j)&&!s.j.includes(a.p_jugador))return{error:{message:'No estás en esa sesión'}};
    D.espacio_esfuerzos=(D.espacio_esfuerzos||[]).filter(r=>!(r.espacio_id===a.codigo&&r.tipo===a.p_tipo&&r.ref===a.p_ref&&r.jugador_id===a.p_jugador));
    D.espacio_esfuerzos.push({espacio_id:a.codigo,tipo:a.p_tipo,ref:a.p_ref,jugador_id:a.p_jugador,rpe:a.p_rpe});return{data:{ok:true},error:null}}
  return{error:null}},
 storage:{from:()=>({upload:async(p)=>({data:{path:p},error:null}),getPublicUrl:(p)=>({data:{publicUrl:'x'}}),remove:async()=>({error:null})})}""")
assert 'anotar_esfuerzo' in FAKE and '__noEsf' in FAKE and 'cols=String' in FAKE
HOY=datetime.date.today().isoformat()
NOM=['Pablo','Iván','Rubén','Dani','Sergio','Álex','Hugo']
PART=[{'id':f'p{i}','nombre':NOM[i],'minutes':m,'goals':0,'starter':m>0} for i,m in enumerate([40,30,0,25])]
def seed(plan):
    P=[{'id':f'p{i}','owner_id':'u1','modalidad':'fs','nombre':n,'foto':'','dorsal':i+1} for i,n in enumerate(NOM)]
    T=[{'id':'t0','owner_id':'u1','modalidad':'fs','fecha':HOY,'hora':'10:00','nota':'Físico','asistencia':{'p0':'si','p1':'tarde','p2':'no'},'carga':None,'ejercicios':[]}]
    M=[{'id':'m1','owner_id':'u1','modalidad':'fs','fecha':HOY,'rival':'CD Alhambra','participaciones':json.dumps(PART),'alineacion':'{}','created_at':''}]
    return {'futbol_personal_jugadores':P,'futbol_personal_partidos':M,'perfiles':[{'id':'u1','plan':plan}],'entrenamientos':T,'circuitos':[]}
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8857),functools.partial(H,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8857/index.html'
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
SHOT=os.environ.get('SHOTS','')
def shot(pg,n):
    if SHOT:pg.screenshot(path=os.path.join(SHOT,n+'.png'))
def ctxpage(b,w=390,h=844):
    ctx=b.new_context(viewport={'width':w,'height':h},service_workers='block',device_scale_factor=2 if SHOT else 1);pg=ctx.new_page()
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' and '404' not in m.text else None)
    pg.on('dialog',lambda d:d.accept())
    ctx.route('https://wa.me/**',lambda r:r.fulfill(body='wa'))
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    return ctx,pg
def entra(b,sd,extra=''):
    ctx,pg=ctxpage(b)
    pg.add_init_script('window.__seed='+json.dumps(sd)+';try{localStorage.setItem("mf_tut_done","1");localStorage.setItem("mf_entrenos:u1","1")}catch(e){};'+extra)
    pg.goto(URL);pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto12');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)');pg.wait_for_timeout(500)
    if pg.locator('#info:not(.hidden)').count():pg.click('#closeInfo')
    pg.click('[data-mode="fs"]');pg.wait_for_timeout(200)
    return ctx,pg
def cierra(pg):
    if pg.locator('#info:not(.hidden)').count():pg.click('#closeInfo');pg.wait_for_timeout(100)
def crea(pg):
    pg.click('#teams [data-esp=abrir]');pg.wait_for_selector('#info:not(.hidden) [data-esp=crear]');pg.click('[data-esp=crear]');pg.wait_for_selector('#info:not(.hidden) .esp-url');pg.wait_for_timeout(300)
    return pg.evaluate("window.__db.espacios[0]")
def jugador(b,DB,eid,yo):
    jctx,jp=ctxpage(b)
    jp.add_init_script('window.__seed='+json.dumps(DB)+';localStorage.setItem("mf_eq_yo:'+eid+'","'+yo+'");')
    jp.goto(URL+'?equipo='+eid);jp.wait_for_selector('#eqData .eq-hola')
    return jctx,jp
with sync_playwright() as p:
    b=p.chromium.launch()
    # ================= Gratis =================
    ctx,pg=entra(b,seed('gratis'))
    E=crea(pg);eid=E['id'];d=E['datos']
    check('gratis: se pide el esfuerzo por defecto',d.get('pideEsf') is True)
    check('gratis: solo la última sesión (el partido de hoy)',[x['ref'] for x in d.get('esf',[])]==['m1'],d.get('esf'))
    check('partido: solo pueden anotar los que jugaron',sorted(d['esf'][0]['j'])==['p0','p1','p3'],d['esf'][0])
    t=pg.inner_text('#infoBody')
    check('en el enlace: apartado «Esfuerzo y carga física»','Esfuerzo y carga física' in pg.text_content('#infoBody') and pg.locator('[data-esp=esf]').is_checked())
    check('gratis: explica el límite','anotan solo la última sesión' in t)
    check('botón para crear el enlace del preparador',pg.locator('[data-esp=pf-crear]').count()==1)
    check('aún no hay enlace del preparador ni datos de carga','cg' not in d)
    shot(pg,'1-entrenador-enlace')
    DB=pg.evaluate("window.__db")
    # jugador que jugó
    jctx,jp=jugador(b,DB,eid,'p0')
    t=jp.text_content('#eqData')
    check('jugador: sale «¿Cuánto te ha costado?» con el partido','¿Cuánto te ha costado?' in t and 'Partido vs CD Alhambra' in t,t[:300])
    check('jugador: escala del 1 al 10',jp.locator('[data-eqesf]').count()==10)
    shot(jp,'2-jugador-esfuerzo')
    jp.click('[data-eqesf="7"]');jp.wait_for_timeout(500)
    R=jp.evaluate("window.__db.espacio_esfuerzos")
    check('jugador: su 7 queda guardado',R==[{'espacio_id':eid,'tipo':'partido','ref':'m1','jugador_id':'p0','rpe':7}],R)
    check('jugador: ve lo que ha anotado','Has anotado 7 · Muy duro' in jp.inner_text('#eqData'))
    check('jugador: el 7 sale marcado',jp.locator('[data-eqesf="7"].on').count()==1)
    shot(jp,'3-jugador-anotado')
    jp.click('[data-eqesf="8"]');jp.wait_for_timeout(500)
    R=jp.evaluate("window.__db.espacio_esfuerzos")
    check('jugador: puede cambiarlo',len(R)==1 and R[0]['rpe']==8)
    R0=R
    jctx.close()
    jctx,jp=jugador(b,DB,eid,'p2')
    check('jugador que no jugó: no le sale','¿Cuánto te ha costado?' not in jp.text_content('#eqData'))
    jctx.close()
    # el entrenador lo ve en Carga física
    pg.evaluate("R=>{window.__db.espacio_esfuerzos=R}",R0+[{'espacio_id':eid,'tipo':'partido','ref':'m1','jugador_id':'p1','rpe':5}])
    cierra(pg);pg.click('#trTab');pg.wait_for_timeout(700)
    t=pg.inner_text('#view .cg-panel')
    check('Carga física suma lo de los jugadores (8×40 + 5×30)','470' in t and '320' in t and '150' in t,t[:400])
    check('el partido ya no sale como «sin esfuerzo»','Partidos sin esfuerzo anotado' not in t)
    check('aviso para que lo anoten ellos','enlace del equipo' in t and pg.locator('.cg-panel [data-esp=abrir]').count()==1)
    shot(pg,'4-entrenador-carga')
    # enlace del preparador (gratis: semana actual)
    pg.locator('.cg-panel [data-esp=abrir]').click();pg.wait_for_selector('#info:not(.hidden) [data-esp=pf-crear]')
    check('en el enlace: «8» de Pablo',pg.locator('.esp-esf-l i').first.inner_text().strip()=='Pablo 8' and '2 de 3 han anotado' in pg.inner_text('#infoBody'))
    pg.click('[data-esp=pf-crear]');pg.wait_for_selector('#info:not(.hidden) [data-esp=pf-quitar]');pg.wait_for_timeout(300)
    E=pg.evaluate("window.__db.espacios[0]");cod=E.get('codigo_pf')
    check('enlace del preparador creado',bool(cod) and '?carga='+cod in pg.inner_text('#infoBody') or pg.locator('.esp-url').nth(1).input_value().endswith('?carga='+cod))
    check('gratis: el preparador ve 1 semana',E['datos']['cg']['sem']==1 and E['datos']['cg']['pro'] is False and any(s['ref']=='m1' for s in E['datos']['cg']['s']),E['datos'].get('cg'))
    wa=pg.locator('#infoBody a[href^="https://wa.me"]').nth(1).get_attribute('href')
    check('enviar el enlace al preparador por WhatsApp','carga%3D'+cod in wa)
    shot(pg,'5-entrenador-preparador')
    DB=pg.evaluate("window.__db")
    pctx,pp=ctxpage(b);pp.add_init_script('window.__seed='+json.dumps(DB)+';')
    pp.goto(URL+'?carga='+cod);pp.wait_for_selector('#pfData .kicker')
    t=pp.text_content('#pfData')
    check('preparador: sin cuenta',pp.locator('#login.hidden').count()==1 and pp.locator('#app.hidden').count()==1)
    check('preparador: carga de cada jugador','Pablo' in t and '320' in t and '150' in t and 'Preparador físico' in t,t[:300])
    check('preparador: esfuerzo de la sesión','vs CD Alhambra' in t and 'Pablo 8' in t)
    check('preparador gratis: sin gráfico y con explicación',pp.locator('.cg-eq').count()==0 and 'plan gratuito' in t)
    shot(pp,'6-preparador')
    pp.goto(URL+'?carga=00000000-0000-4000-8000-000000000000');pp.wait_for_timeout(600)
    check('preparador: enlace que no existe','Enlace no disponible' in pp.text_content('#pfData'))
    pctx.close()
    # dejar de pedir el esfuerzo
    pg.click('[data-esp=esf]');pg.wait_for_timeout(500)
    d=pg.evaluate("window.__db.espacios[0].datos")
    check('desmarcar: deja de pedirse',d['pideEsf'] is False and 'esf' not in d)
    DB=pg.evaluate("window.__db")
    jctx,jp=jugador(b,DB,eid,'p0')
    check('jugador: ya no le sale','¿Cuánto te ha costado?' not in jp.text_content('#eqData'))
    jctx.close()
    pg.click('[data-esp=pf-quitar]');pg.wait_for_timeout(500)
    E=pg.evaluate("window.__db.espacios[0]")
    check('quitar el enlace del preparador',E.get('codigo_pf') is None and 'cg' not in E['datos'])
    ctx.close()
    # ================= Pro =================
    ctx,pg=entra(b,seed('pro'))
    E=crea(pg);eid=E['id'];d=E['datos']
    check('Pro: todas las sesiones de los últimos 7 días',sorted(x['ref'] for x in d['esf'])==['m1','t0'],d['esf'])
    check('entreno: solo los que vinieron',sorted([x for x in d['esf'] if x['ref']=='t0'][0]['j'])==['p0','p1'])
    check('Pro: sin aviso de límite','anotan solo la última sesión' not in pg.inner_text('#infoBody'))
    DB=pg.evaluate("window.__db")
    jctx,jp=jugador(b,DB,eid,'p1')
    check('Pro: el jugador ve partido y entreno',jp.locator('.eq-esf .eq-card').count()==2)
    jp.locator('[data-eqesf="6"][data-ref=t0]').click();jp.wait_for_timeout(500)
    R=jp.evaluate("window.__db.espacio_esfuerzos");jctx.close()
    check('entreno anotado',R==[{'espacio_id':eid,'tipo':'entreno','ref':'t0','jugador_id':'p1','rpe':6}],R)
    pg.evaluate("R=>{window.__db.espacio_esfuerzos=R}",R)
    cierra(pg);pg.click('#trTab');pg.wait_for_timeout(700)
    check('en el entreno: «📱 1 desde el enlace»','1 desde el enlace' in pg.inner_text('#view'))
    pg.locator('[data-cg=tr][data-id=t0]').click();pg.wait_for_selector('#info:not(.hidden) .cg-j')
    check('al revisar: Iván con su 6 «lo anotó él»','lo anotó él' in pg.inner_text('#infoBody') and pg.locator('[data-cg=v][data-pid=p1][data-v="6"].on').count()==1)
    shot(pg,'7-revisar-esfuerzo')
    pg.click('[data-cg=v][data-pid=p0][data-v="5"]');pg.click('[data-cg=ok]');pg.wait_for_timeout(400)
    c=pg.evaluate("window.__db.entrenamientos[0].carga")
    check('al guardar quedan los dos en el entreno',c and c['rpe']=={'p0':5,'p1':6},c)
    pg.click('#teams [data-esp=abrir]');pg.wait_for_selector('[data-esp=pf-crear]');pg.click('[data-esp=pf-crear]');pg.wait_for_selector('[data-esp=pf-quitar]');pg.wait_for_timeout(300)
    E=pg.evaluate("window.__db.espacios[0]");cod=E['codigo_pf']
    check('Pro: el preparador ve 6 semanas',E['datos']['cg']['sem']==6 and E['datos']['cg']['pro'] is True)
    DB=pg.evaluate("window.__db")
    pctx,pp=ctxpage(b);pp.add_init_script('window.__seed='+json.dumps(DB)+';')
    pp.goto(URL+'?carga='+cod);pp.wait_for_selector('#pfData .kicker')
    check('preparador Pro: gráfico de 6 semanas',pp.locator('#pfData .cg-eq').count()==1 and pp.locator('.cg-row .cg-bars').count()==7)
    shot(pp,'8-preparador-pro')
    pctx.close();ctx.close()
    # ================= Sin el SQL nuevo =================
    ctx,pg=entra(b,seed('gratis'),'window.__noEsf=1;')
    E=crea(pg)
    check('sin SQL: el enlace funciona igual',E and 'jugadores' in E['datos'] and 'esf' not in E['datos'])
    check('sin SQL: avisa de que se está activando','se está activando' in pg.inner_text('#infoBody') and pg.locator('[data-esp=pf-crear]').count()==0)
    ctx.close()
    js=open(REPO+'/app.js',encoding='utf-8').read()
    check('SQL en el repositorio',os.path.exists(REPO+'/supabase-esfuerzo.sql'))
    check('sin errores en la página',not errs,errs[:3])
    b.close()
print(f'{sum(res)}/{len(res)} correctas');sys.exit(0 if all(res) else 1)
