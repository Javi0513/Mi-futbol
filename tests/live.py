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
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8812),functools.partial(H,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8812/index.html'
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
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=page(b,SEED);login(pg)
    pg.click('[data-tab=partidos]')
    check('cada partido tiene botón de Directo',pg.locator('[data-action=live][data-id=m1]').count()==1)
    pg.click('[data-action=live][data-id=m1]');pg.wait_for_selector('.lv-board')
    check('al abrirlo se crea el directo con los dos equipos',D(pg,"d&&d.partido_id==='m1'&&d.estado==='pre'&&d.rival==='Los Pinos'&&d.equipo==='Mi equipo'&&d.parte_min===30&&d.owner_id==='u1'"))
    did=D(pg,'d.id')
    check('el enlace lleva el código del directo',pg.input_value('#lvUrl').endswith('?directo='+did),pg.input_value('#lvUrl'))
    pg.fill('#lvTeam','Juvenil A');pg.locator('#lvTeam').press('Tab');wait(pg,"d.equipo==='Juvenil A'")
    check('se puede poner el nombre de tu equipo',pg.evaluate("localStorage.getItem('mf_equipo')")=='Juvenil A')
    pg.screenshot(path=OUT+'/live_pre.png',full_page=True)
    pg.click('[data-live=start]');wait(pg,"d.estado==='1T'&&!!d.desde")
    pg.wait_for_timeout(2300)
    check('empieza la 1ª parte y corre el reloj',pg.locator('[data-lvmin]').inner_text()=="1'" and pg.locator('[data-lvss]').inner_text().startswith('00:0') and pg.locator('[data-lvss]').inner_text()!='00:00',pg.locator('[data-lvss]').inner_text())
    pg.click('[data-live=gf]');pg.wait_for_selector('.lv-pick')
    check('al marcar pregunta quién ha sido (solo convocados)',pg.locator('.lv-pick [data-scorer]').count()==9)
    pg.click('.lv-pick [data-scorer="p2"]');wait(pg,"d.gf===1&&d.eventos.length===1")
    pg.wait_for_function("JSON.parse(window.__db.futbol_personal_partidos[0].participaciones).find(x=>x.id==='p2').goals===1",timeout=4000)
    m=M(pg);check('gol nuestro: marcador, goleador y estadísticas del partido',D(pg,"d.eventos[0].n==='J2'&&d.eventos[0].m===1&&d.eventos[0].t==='f'") and m['r']=={'gf':1,'gc':0} and m['g']['p2']==1,m)
    pg.click('[data-live=gc]');wait(pg,"d.gc===1")
    check('gol del rival',pg.locator('.lv-score').inner_text().replace('\n','')=='1-1',pg.locator('.lv-score').inner_text())
    for _ in range(3):pg.click('[data-live="m+"]')
    wait(pg,"d.acum_ms>=180000")
    check('ajustar minuto +3',pg.locator('[data-lvmin]').inner_text()=="4'",pg.locator('[data-lvmin]').inner_text())
    pg.click('[data-live="m-"]');wait(pg,"d.acum_ms>=120000&&d.acum_ms<180000")
    check('ajustar minuto −1',pg.locator('[data-lvmin]').inner_text()=="3'")
    ev=D(pg,"d.eventos.find(e=>e.t==='f').id")
    pg.click(f'[data-lvdel="{ev}"]');wait(pg,"d.gf===0&&d.eventos.length===1")
    pg.wait_for_function("JSON.parse(window.__db.futbol_personal_partidos[0].participaciones).find(x=>x.id==='p2').goals===0",timeout=4000)
    check('quitar un gol lo resta también al jugador',M(pg)['r']=={'gf':0,'gc':1})
    pg.click('[data-live=pause]');wait(pg,"d.desde===null")
    a=D(pg,'d.acum_ms');pg.wait_for_timeout(1100)
    check('pausar para el reloj',D(pg,'d.acum_ms')==a and pg.locator('[data-live=resume]').count()==1)
    pg.click('[data-live=resume]');wait(pg,"!!d.desde")
    pg.click('[data-live=close]');pg.wait_for_selector('.mrow')
    check('en la lista sale «En directo» con el marcador',pg.locator('.mrow .res.lv').inner_text().strip()=='● En directo 0-1',pg.locator('.mrow .res.lv').inner_text())
    pg.click('[data-action=live][data-id=m1]');pg.wait_for_selector('.lv-board')
    pg.click('[data-live=half]');wait(pg,"d.estado==='DES'&&d.desde===null")
    check('descanso',pg.locator('[data-lvmin]').inner_text()=='Descanso')
    pg.click('[data-live=start2]');wait(pg,"d.estado==='2T'&&!!d.desde&&d.acum_ms===0")
    check('la 2ª parte empieza en el minuto 31 (partes de 30)',pg.locator('[data-lvmin]').inner_text()=="31'")
    pg.click('[data-live=gf]');pg.click('.lv-pick [data-scorer=""]');wait(pg,"d.gf===1&&d.eventos.length===2")
    check('gol sin asignar en la 2ª parte',D(pg,"d.eventos[1].m===31&&!d.eventos[1].n"))
    pg.set_viewport_size({'width':390,'height':1340});pg.evaluate('scrollTo(0,0)');pg.wait_for_timeout(800);pg.screenshot(path=OUT+'/live_2t.png');pg.set_viewport_size({'width':390,'height':844})
    pg.click('[data-live=end]');wait(pg,"d.estado==='FIN'&&d.desde===null")
    pg.wait_for_timeout(300)
    check('al terminar queda el resultado en el partido',M(pg)['r']=={'gf':1,'gc':1} and pg.locator('[data-lvmin]').inner_text()=='Final')
    db=pg.evaluate('window.__db')
    # Página pública: sin cuenta, solo con el enlace
    pub=page(b,db);pub.goto(URL+'?directo='+did);pub.wait_for_selector('#pub .lv-board')
    check('el enlace abre el directo sin pedir cuenta',pub.locator('#login').is_hidden() and pub.locator('#app').is_hidden())
    check('se ven equipos, marcador y goles',pub.locator('.lv-team').first.inner_text().upper()=='JUVENIL A' and pub.locator('.lv-score').inner_text().replace('\n','')=='1-1' and pub.locator('.lv-e').count()==2 and 'J2' not in pub.locator('#pub').inner_text(),pub.locator('#pub').inner_text()[:160])
    check('el público no puede tocar nada',pub.locator('#pub input,#pub [data-live],#pub [data-lvdel]').count()==0)
    check('pide el directo por la función pública',['rpc','ver_directo'] in pub.evaluate('window.__calls'))
    pub.screenshot(path=OUT+'/live_pub.png',full_page=True)
    # Reloj en marcha en la página pública + se actualiza solo
    run=json.loads(json.dumps(db));d0=run['directos'][0];d0.update(estado='1T',acum_ms=0,desde=time.strftime('%Y-%m-%dT%H:%M:%S.000Z',time.gmtime(time.time()-125)))
    pub2=page(b,run);pub2.clock.install();pub2.goto(URL+'?directo='+did);pub2.wait_for_selector('#pub .lv-board')
    check('el público ve el minuto en marcha',pub2.locator('[data-lvmin]').inner_text()=="3'",pub2.locator('[data-lvmin]').inner_text())
    pub2.evaluate("window.__db.directos[0].gc=5");pub2.clock.run_for(11000);pub2.wait_for_timeout(200)
    check('el marcador se actualiza solo',pub2.locator('.lv-score').inner_text().replace('\n','')=='1-5',pub2.locator('.lv-score').inner_text())
    bad=page(b,db);bad.goto(URL+'?directo=00000000-0000-4000-8000-000000000000');bad.wait_for_selector('#pub h2')
    check('enlace que no existe: aviso claro',bad.locator('#pub h2').text_content()=='Directo no disponible')
    # Desactivar el enlace
    pg.click('[data-live=off]');pg.wait_for_selector('.mrow')
    check('desactivar borra el directo y mantiene el resultado',pg.evaluate('(window.__db.directos||[]).length')==0 and M(pg)['r']=={'gf':1,'gc':1})
    # Base de datos sin el SQL del directo: la app sigue funcionando y lo explica
    nt=page(b,SEED,'window.__noTable=true;');login(nt);nt.click('[data-tab=partidos]')
    check('sin la tabla, la lista de partidos sigue funcionando',nt.locator('.mrow').count()==1)
    nt.click('[data-action=live][data-id=m1]');nt.wait_for_selector('.message')
    check('y al pulsar Directo explica qué falta',"supabase-directo.sql" in nt.locator('.message').inner_text())
    b.close()
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
if errs:print('\n'.join('FALLA consola: '+e for e in errs))
sys.exit(0 if all(res) and not errs else 1)
