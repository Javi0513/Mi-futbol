import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json,time
from playwright.sync_api import sync_playwright
# Supabase simulado con lo que usa el directo: filtros eq, update/insert con .select(), rpc ver_directo
# y el disparador que pone la hora del servidor (desde / actualizado).
FAKE=r"""
window.__calls=[];
window.__db=window.__seed||{};
const NOW=()=>new Date().toISOString(),CP=(x)=>JSON.parse(JSON.stringify(x));
window.supabase={createClient:()=>{let cb=null,session=null;
 const q=(t)=>{let f=null,op='select',payload=null,sel=false;
  const o={select(){sel=true;return o},order(){return o},eq(c,v){f=[c,v];return o},insert(p){op='insert';payload=p;return o},update(p){op='update';payload=p;return o},delete(){op='delete';return o},
  then(res){let out;
   if(window.__noTable&&t==='directos')out={data:null,error:{message:'relation "public.directos" does not exist'}};
   else{let rows=window.__db[t]=window.__db[t]||[];
    if(op==='select')out={data:rows.filter(r=>!f||r[f[0]]===f[1]).map(CP),error:null};
    else if(op==='insert'){let r=CP(payload);if(t==='directos'){r.actualizado=NOW();if(r.desde)r.desde=NOW()}rows.push(r);window.__calls.push(['insert',t]);out={data:sel?[CP(r)]:null,error:null}}
    else if(op==='update'){let r=rows.find(r=>r[f[0]]===f[1]),p=CP(payload);
      if(t==='directos'){p.actualizado=NOW();if(p.desde&&p.desde!==r.desde)p.desde=NOW()}
      Object.assign(r,p);window.__calls.push(['update',t]);out={data:sel?[CP(r)]:null,error:null}}
    else{window.__db[t]=rows.filter(r=>r[f[0]]!==f[1]);window.__calls.push(['delete',t]);out={error:null}}}
   return Promise.resolve(out).then(res)}};return o};
 return{from:q,
  rpc:async(n,a)=>{window.__calls.push(['rpc',n]);if(n==='ver_directo'){let r=(window.__db.directos||[]).find(x=>x.id===a.codigo);return{data:r?{...CP(r),ahora:NOW()}:null,error:null}}return{error:null}},
  auth:{getSession:async()=>({data:{session}}),
   onAuthStateChange(c){cb=c;setTimeout(()=>c('INITIAL_SESSION',null),0);return{data:{subscription:{}}}},
   signInWithPassword:async()=>{session={user:{id:'u1',email:'ana@x.es'}};cb('SIGNED_IN',session);return{data:{session},error:null}},
   getUser:async()=>({data:{user:session&&session.user}}),signOut:async()=>{session=null;cb('SIGNED_OUT',null)}}}}};
"""
P=[{'id':f'p{i}','owner_id':'u1','modalidad':'7','nombre':f'J{i}','foto':'','created_at':''} for i in range(8)]
PART=[{'id':f'p{i}','nombre':f'J{i}','minutes':0,'goals':0,'starter':i<7} for i in range(8)]
SEED={'futbol_personal_jugadores':P,'futbol_personal_partidos':[{'id':'m1','owner_id':'u1','modalidad':'7','fecha':'2026-10-18','rival':'Los Pinos','participaciones':json.dumps(PART),'alineacion':'{}','created_at':''}],'perfiles':[{'id':'u1','plan':'gratis'}]}
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8834),functools.partial(H,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8834/index.html'
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
def page(b,seed,extra=''):
    pg=b.new_context(viewport={'width':390,'height':844},service_workers='block').new_page()
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    pg.on('dialog',lambda d:d.accept())
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    pg.add_init_script('window.__seed='+json.dumps(seed)+';'+extra)
    return pg
def login(pg):
    pg.goto(URL);pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto12');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)');pg.wait_for_timeout(200)
D=lambda pg,js:pg.evaluate('(()=>{let d=(window.__db.directos||[])[0];return '+js+'})()')
M=lambda pg:pg.evaluate("(()=>{let m=window.__db.futbol_personal_partidos[0];return{r:JSON.parse(m.alineacion).resultado,g:Object.fromEntries(JSON.parse(m.participaciones).map(x=>[x.id,x.goals]))}})()")
wait=lambda pg,js:pg.wait_for_function('(()=>{let d=(window.__db.directos||[])[0];return '+js+'})()',timeout=4000)
# Categoría del equipo: marca los minutos por parte (Directo, editar partido, calcular minutos)
FAKE=FAKE.replace("else if(op==='update'){","else if(op==='update'&&window.__noCat&&t==='equipos'&&'categoria' in payload)out={data:null,error:{message:'Could not find the \\'categoria\\' column of \\'equipos\\''}};else if(op==='update'){")
FAKE=FAKE.replace("else{window.__db[t]=","else if(op!=='delete'){out={data:null,error:null}}else{window.__db[t]=")
FAKE=FAKE.replace("order(){return o},","order(){return o},is(){return o},")
FAKE=FAKE.replace("Object.assign(r,p);","if(r)Object.assign(r,p);")
TEAMQ="""(()=>(window.__db.equipos||[]).map(t=>[t.modalidad,t.categoria||'']))()"""
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=page(b,SEED);login(pg)
    check('debajo del equipo se elige la categoría',pg.locator('#teamCat').count()==1 and pg.input_value('#teamCat')=='' and '30' in pg.locator('#teamCat option').first.inner_text())
    pg.select_option('#teamCat','alevin');pg.wait_for_function("()=>(window.__db.equipos||[]).some(t=>t.categoria==='alevin')",timeout=4000)
    pg.wait_for_timeout(200)
    check('se guarda en el equipo (y se crea si no existía)',pg.evaluate(TEAMQ)==[['7','alevin']] and 'Alevín' in pg.inner_text('#message') and pg.input_value('#teamCat')=='alevin',pg.evaluate(TEAMQ))
    pg.screenshot(path=OUT+'/categoria_equipo.png')
    pg.click('[data-tab=partidos]');pg.click('[data-action=live][data-id=m1]');pg.wait_for_selector('.lv-board')
    check('el Directo usa 35 minutos por parte (alevín)',D(pg,'d.parte_min')==35 and pg.input_value('#lvDur')=='35' and 'Alevín' in pg.inner_text('.lv-dur'),D(pg,'d.parte_min'))
    pg.click('[data-live=close]');pg.select_option('#teamCat','infantil');pg.wait_for_function("()=>(window.__db.equipos||[])[0].categoria==='infantil'",timeout=4000)
    pg.click('[data-action=live][data-id=m1]');pg.wait_for_selector('.lv-board');wait(pg,'d.parte_min===40')
    check('antes de empezar, el Directo sigue a la categoría',pg.input_value('#lvDur')=='40')
    pg.click('[data-live=start]');wait(pg,"d.estado==='1T'");pg.click('[data-live=half]');wait(pg,"d.estado==='DES'");pg.click('[data-live=start2]');wait(pg,"d.estado==='2T'")
    check('la 2ª parte empieza en el 41\'',pg.locator('[data-lvmin]').inner_text()=="41'",pg.locator('[data-lvmin]').inner_text())
    pg.click('[data-live=end]');wait(pg,"d.estado==='FIN'")
    pg.wait_for_function("()=>JSON.parse(window.__db.futbol_personal_partidos[0].participaciones).some(x=>x.minutes>0)",timeout=4000)
    mins=pg.evaluate("Object.fromEntries(JSON.parse(window.__db.futbol_personal_partidos[0].participaciones).map(x=>[x.id,x.minutes]))")
    check('al terminar, los titulares juegan 80 minutos (2 × 40)',mins['p0']==80 and mins['p7']==0,mins)
    check('el partido guarda sus minutos por parte',pg.evaluate("JSON.parse(window.__db.futbol_personal_partidos[0].alineacion).parte")==40)
    pg.click('[data-live=close]');pg.click('[data-action=edit-match][data-id=m1]');pg.wait_for_selector('#mdParte')
    check('al editar, salen los minutos por parte del partido',pg.input_value('#mdParte')=='40')
    pg.fill('#mdParte','25');pg.locator('#mdParte').dispatch_event('change')
    pg.click('[data-mdadd=cambios]');r=pg.locator('.mdrow.cb').first
    r.locator('input').fill('10');r.locator('input').dispatch_event('change')
    pg.locator('.mdrow.cb').first.locator('select[data-k=sale]').select_option('p1');pg.locator('.mdrow.cb').first.locator('select[data-k=entra]').select_option('p7')
    pg.click('[data-mdcalc]')
    check('calcular minutos usa la duración del partido (2 × 25)',pg.input_value('[data-field=minutes][data-id=p0]')=='50' and pg.input_value('[data-field=minutes][data-id=p1]')=='10' and pg.input_value('[data-field=minutes][data-id=p7]')=='40')
    pg.click('[data-action=save]');pg.wait_for_selector('.mrow')
    check('y se guarda',pg.evaluate("JSON.parse(window.__db.futbol_personal_partidos[0].alineacion).parte")==25)
    # Otra modalidad: sin categoría, duración normal
    pg.click('[data-mode="11"]');pg.wait_for_timeout(200)
    check('cada modalidad tiene su categoría (F11 sin categoría: 45)',pg.input_value('#teamCat')=='' and '45' in pg.locator('#teamCat option').first.inner_text())
    # Servidor sin la columna: se guarda en el dispositivo
    nc=page(b,SEED,'window.__noCat=true;');login(nc)
    nc.select_option('#teamCat','benjamin');nc.wait_for_timeout(500)
    check('sin el paso del servidor: se guarda en este dispositivo y lo avisa','este dispositivo' in nc.inner_text('#message') and nc.input_value('#teamCat')=='benjamin',nc.inner_text('#message'))
    nc.click('[data-tab=partidos]');nc.click('[data-action=live][data-id=m1]');nc.wait_for_selector('.lv-board')
    check('y el Directo la usa (benjamín 30)',nc.input_value('#lvDur')=='30')
    b.close()
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
if errs:print('\n'.join('FALLA consola: '+e for e in errs))
sys.exit(0 if all(res) and not errs else 1)
