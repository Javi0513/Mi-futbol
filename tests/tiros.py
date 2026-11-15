import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json,re
from playwright.sync_api import sync_playwright
# Tiros desde el anotador (v11.39): el anotador apunta tiros a puerta y fuera de cada jugador
# (y tiros del rival); el Directo del entrenador los suma a las estadísticas del jugador.
# Plan gratuito: tiros desde el anotador en 2 partidos al mes (directos.an_tiros); Pro ilimitado.
SRC=open(os.path.join(TESTS,'anotador.py'),encoding='utf-8').read()
FAKE=re.search(r'FAKE=r"""(.*?)"""',SRC,re.S).group(1)
FAKE=FAKE.replace("jugadores:CP(d.anot_jug||[]),","jugadores:CP(d.anot_jug||[]),tiros:!!d.an_tiros,")
FAKE=FAKE.replace("window.__anotar=(c,ev)=>{let d=AN(c);if(!d)return{error:{message:'NO_EXISTE'}};",
 "window.__anotar=(c,ev)=>{let d=AN(c);if(!d)return{error:{message:'NO_EXISTE'}};"
 "if(['tp','tf','tr'].includes(ev.t)){if(!d.an_tiros)return{error:{message:'PRO_TIROS'}};"
 "let ms=d.acum_ms+(d.desde?Math.max(0,Date.now()-Date.parse(d.desde)):0),e={id:'an'+Math.random().toString(36).slice(2,10),m:Math.floor(ms/60000)+1,t:ev.t,an:1,p:1};"
 "if(ev.t!=='tr'){if(!(d.anot_jug||[]).some(j=>j.id===ev.pid))return{error:{message:'JUGADOR'}};e.pid=ev.pid}"
 "d.eventos.push(e);d.actualizado=NOW();return{data:VA(d),error:null}}")
FAKE=FAKE.replace("if(window.__noCol&&","if(window.__noTirCol&&t==='directos'&&op==='update'&&payload&&'an_tiros' in payload)out={data:null,error:{message:'column \"an_tiros\" of relation \"directos\" does not exist'}};\n   else if(window.__noCol&&")
assert 'PRO_TIROS' in FAKE and 'tiros:!!' in FAKE and '__noTirCol' in FAKE
P=[{'id':f'p{i}','owner_id':'u1','modalidad':'fs','nombre':f'J{i}','dorsal':str(i+1),'foto':'','created_at':''} for i in range(8)]
PART=[{'id':f'p{i}','nombre':f'J{i}','minutes':0,'goals':0,'starter':i<5} for i in range(8)]
MT=lambda i,f:{'id':i,'owner_id':'u1','modalidad':'fs','fecha':f,'rival':'Los Pinos','participaciones':json.dumps(PART),'alineacion':'{}','created_at':''}
SEED={'futbol_personal_jugadores':P,'futbol_personal_partidos':[MT('m1','2026-11-08'),MT('m2','2026-11-09')],'perfiles':[{'id':'u1','plan':'gratis'}]}
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8836),functools.partial(H,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8836/index.html'
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
def page(b,seed,extra='',ctx=None):
    ctx=ctx or b.new_context(viewport={'width':390,'height':844},service_workers='block')
    pg=ctx.new_page()
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    pg.on('dialog',lambda d:d.accept())
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    pg.add_init_script('window.__seed='+json.dumps(seed)+';'+extra)
    return pg
def login(pg):
    pg.goto(URL);pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto12');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)');pg.wait_for_timeout(200)
def directo(pg,mid):
    if pg.locator('[data-mode="fs"]').count():pg.click('[data-mode="fs"]')
    pg.click('[data-tab=partidos]');pg.click(f'[data-action=live][data-id={mid}]');pg.wait_for_selector('.lv-board')
DX=lambda pg,mid,js:pg.evaluate('(()=>{let d=(window.__db.directos||[]).find(x=>x.partido_id==="'+mid+'");return '+js+'})()')
def PJ(pg,mid='m1'):
    return pg.evaluate("(m=>{m=window.__db.futbol_personal_partidos.find(x=>x.id===m);return{al:JSON.parse(m.alineacion),st:Object.fromEntries(JSON.parse(m.participaciones).map(x=>[x.id,x.st||{}])),stm:Object.fromEntries(JSON.parse(m.participaciones).map(x=>[x.id,x.stm||{}]))}})",mid)
def espera(pg,js,t=8000):
    pg.wait_for_function("()=>{let m=window.__db.futbol_personal_partidos.find(x=>x.id==='m1'),st=Object.fromEntries(JSON.parse(m.participaciones).map(x=>[x.id,x.st||{}])),al=JSON.parse(m.alineacion);return "+js+"}",timeout=t)
def reabre(pg,js=''):
    db=pg.evaluate('window.__db');ctx=pg.context;pg.close();q=page(b,db,js,ctx);login(q);return q
def anota(b,db,code):
    an=page(b,db);an.goto(URL+'?anotar='+code);an.wait_for_selector('#anData .lv-board');return an
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=page(b,SEED);login(pg)
    directo(pg,'m1')
    pg.click('[data-live=start]');pg.wait_for_timeout(300)
    check('el Directo explica que el anotador apunta los tiros','tiros a puerta y fuera' in pg.locator('.lv-anot').inner_text())
    pg.click('[data-live=anon]');pg.wait_for_selector('#anUrl');pg.wait_for_timeout(300)
    code=DX(pg,'m1','d.anotador')
    check('plan gratuito: al crear el anotador se activan los tiros (1º del mes)',DX(pg,'m1','d.an_tiros')==True)
    check('y cuenta como uno de los 2 partidos del mes',pg.evaluate("(()=>{for(let i=0;i<localStorage.length;i++){let k=localStorage.key(i);if(k.indexOf('mf_envios:')===0)return JSON.parse(localStorage.getItem(k)).at||[]}return []})()")==['m1'])
    check('el Directo dice que este partido ya cuenta','tiros desde el anotador en 2 partidos al mes' in pg.locator('.lv-anot').inner_text())
    db=pg.evaluate('window.__db')
    an=anota(b,db,code)
    check('el anotador tiene «Tiro a puerta», «Tiro fuera» y «Tiro del rival»',all(an.locator(f'[data-an="{k}"]').count()==1 for k in ['tp','tf','tr']))
    an.click('[data-an=tp]');an.wait_for_selector('.lv-pick h3:has-text("tirado")')
    L=an.locator('.lv-pick [data-anx]').all_inner_texts()
    check('«Tiro a puerta» pregunta quién ha tirado: primero los del campo',len(L)==8 and all(('J%d'%i) in L[i] for i in range(5)),L)
    check('y luego el banquillo',an.locator('.lv-pick .lv-bn').count()==1)
    an.screenshot(path=OUT+'/tiros_anotador_quien.png',full_page=True)
    an.click('.lv-pick [data-anx="p3"]');an.wait_for_timeout(300)
    e=an.evaluate("window.__db.directos[0].eventos.slice(-1)[0]")
    check('tiro a puerta apuntado al jugador',e['t']=='tp' and e['pid']=='p3' and e['an']==1,e)
    check('mensaje claro','Tiro a puerta de 4 · J3 apuntado' in an.locator('.message').inner_text(),an.locator('.message').inner_text())
    an.click('[data-an=tf]');an.click('.lv-pick [data-anx="p3"]');an.wait_for_timeout(250)
    an.click('[data-an=tp]');an.click('.lv-pick [data-anx="p1"]');an.wait_for_timeout(250)
    an.click('[data-an=tr]');an.wait_for_timeout(250)
    ev=an.evaluate("window.__db.directos[0].eventos.map(e=>e.t)")
    check('tiro fuera, otro a puerta y tiro del rival',ev==['tp','tf','tp','tr'],ev)
    txt=an.locator('#anData').inner_text()
    check('salen en «Apuntado desde aquí» con el nombre','Tiro fuera · 4 · J3' in txt and 'Tiro de Los Pinos' in txt)
    check('pero no en «Todo el partido» (como en el enlace de la familia)','Tiro' not in an.locator('#anData .lv-ev').last.inner_text())
    an.screenshot(path=OUT+'/tiros_anotador.png',full_page=True)
    # El Directo del entrenador lo junta
    pg.evaluate("db=>{window.__db.directos=db.directos}",an.evaluate('window.__db'))
    espera(pg,"st.p3.tp===1&&st.p3.tf===1&&st.p1.tp===1&&(al.estR||{}).tir===1")
    x=PJ(pg)
    check('el entrenador recibe los tiros en las estadísticas de cada jugador',x['st']['p3']=={'tp':1,'tf':1} and x['st']['p1']=={'tp':1},x['st'])
    check('el tiro del rival suma a «Tiros del rival»',x['al']['estR']['tir']==1)
    check('con su minuto (para el Excel)',x['stm']['p3'].get('tp')==[1],x['stm']['p3'])
    check('recuerda cuáles ya ha sumado',len(x['al'].get('anTir',[]))==4)
    pg.wait_for_timeout(400)
    s=pg.locator('.lv-sum').inner_text()
    check('el resumen del Directo cuenta los tiros del anotador','Tiros 3' in s.replace('\n',' ') and '2 a puerta' in s,s)
    check('en la lista de jugadas del entrenador no salen los tiros','Tiro' not in pg.locator('.lv-ev').first.inner_text())
    pg.screenshot(path=OUT+'/tiros_directo.png',full_page=True)
    # Quitar desde el anotador resta
    tf=an.evaluate("window.__db.directos[0].eventos.find(e=>e.t==='tf').id")
    an.evaluate("db=>{window.__db.directos=db.directos}",pg.evaluate('window.__db'))
    an.click(f'[data-anq="{tf}"]');an.wait_for_timeout(300)
    pg.evaluate("db=>{window.__db.directos=db.directos}",an.evaluate('window.__db'))
    espera(pg,"!st.p3.tf&&st.p3.tp===1")
    check('si el anotador quita un tiro, se resta al jugador',PJ(pg)['st']['p3']=={'tp':1} and len(PJ(pg)['al']['anTir'])==3)
    # Volver a entrar no los suma dos veces
    pg=reabre(pg);directo(pg,'m1');pg.wait_for_timeout(900)
    x=PJ(pg);check('al volver a abrir el Directo no se suman dos veces',x['st']['p3']=={'tp':1} and x['st']['p1']=={'tp':1} and x['al']['estR']['tir']==1,x['st'])
    # Con la app cerrada: lo apuntado se suma al abrir el Directo
    db=pg.evaluate('window.__db');pg.close()
    an2=anota(b,db,code);an2.click('[data-an=tp]');an2.click('.lv-pick [data-anx="p2"]');an2.wait_for_timeout(300)
    db=an2.evaluate('window.__db')
    pg=page(b,db);login(pg);directo(pg,'m1')
    espera(pg,"st.p2.tp===1")
    check('lo que apunta el anotador con tu app cerrada se suma al abrir el Directo',PJ(pg)['st']['p2']=={'tp':1})
    # Plan gratuito: 3er partido del mes sin tiros desde el anotador
    pg.evaluate("(()=>{let k='mf_envios:u1:'+new Date().toISOString().slice(0,7),x=JSON.parse(localStorage.getItem(k)||'{}');x.at=['m1','mx'];localStorage.setItem(k,JSON.stringify(x))})()")
    pg=reabre(pg);directo(pg,'m2');pg.click('[data-live=anon]');pg.wait_for_selector('#anUrl');pg.wait_for_timeout(300)
    check('gratis, 3er partido del mes: el anotador se crea sin tiros',DX(pg,'m2','d.an_tiros')!=True and DX(pg,'m2','!!d.anotador'))
    t=pg.locator('.lv-anot').inner_text()
    check('el Directo avisa de que ya se han usado y que tú los puedes apuntar','ya has usado los tiros desde el anotador' in t and 'los tiros los apuntas tú' in t,t)
    pg.click('[data-antir-pro]');pg.wait_for_timeout(200)
    check('«Ver el plan Pro» explica el límite','2 partidos al mes' in pg.locator('#infoBody').inner_text() and 'tiros a puerta y fuera' in pg.locator('#infoBody').inner_text())
    pg.click('#closeInfo')
    code2=DX(pg,'m2','d.anotador');db=pg.evaluate('window.__db')
    an3=anota(b,db,code2)
    check('y el anotador de ese partido no tiene botones de tiros',an3.locator('[data-an=tp]').count()==0 and an3.locator('[data-an=f]').count()==1)
    r=an3.evaluate("c=>window.__anotar(c,{t:'tp',pid:'p1'})",code2)
    check('el servidor no deja apuntar tiros sin activarlos',r.get('error',{}).get('message')=='PRO_TIROS')
    # Pro: ilimitado (se activa al abrir el Directo)
    pg.evaluate("window.__db.perfiles[0].plan='pro'");pg=reabre(pg);directo(pg,'m2');pg.wait_for_timeout(600)
    check('con Pro se activan siempre',DX(pg,'m2','d.an_tiros')==True)
    check('y no sale el aviso del plan gratuito','Plan gratuito' not in pg.locator('.lv-anot').inner_text())
    # Sin el SQL nuevo: el anotador se crea igual, sin tiros y sin errores
    sq={**SEED,'futbol_personal_partidos':[MT('m1','2026-11-08')]}
    p4=page(b,sq,'window.__noTirCol=true;');login(p4);directo(p4,'m1');p4.click('[data-live=anon]');p4.wait_for_selector('#anUrl');p4.wait_for_timeout(400)
    check('sin supabase-anotador-tiros.sql el anotador se crea igual (sin tiros)',DX(p4,'m1','!!d.anotador&&!d.an_tiros') and p4.locator('#anUrl').count()==1)
    b.close()
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
sys.exit(0 if all(res) and not errs else 1)
