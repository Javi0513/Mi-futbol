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
P=[{'id':f'p{i}','owner_id':'u1','modalidad':'fs','nombre':f'J{i}','foto':'','created_at':''} for i in range(7)]
PART=[{'id':f'p{i}','nombre':f'J{i}','minutes':0,'goals':0,'starter':i<5} for i in range(7)]
SEED={'futbol_personal_jugadores':P,'futbol_personal_partidos':[{'id':'m1','owner_id':'u1','modalidad':'fs','fecha':'2026-10-18','rival':'Los Pinos','participaciones':json.dumps(PART),'alineacion':'{}','created_at':''}],'perfiles':[{'id':'u1','plan':'gratis'}]}
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8841),functools.partial(H,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8841/index.html'
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
wait=lambda pg,js:pg.wait_for_function('()=>{let d=(window.__db.directos||[])[0];return '+js+'}',timeout=4000)
# v11.2 Estadísticas en directo: robos, pérdidas, tiros, paradas, asistencias y faltas acumuladas (fútbol sala)
AL=lambda pg:pg.evaluate("JSON.parse(window.__db.futbol_personal_partidos[0].alineacion)")
PA=lambda pg:pg.evaluate("Object.fromEntries(JSON.parse(window.__db.futbol_personal_partidos[0].participaciones).map(x=>[x.id,x.minutes]))")
ST=lambda pg:pg.evaluate("Object.fromEntries(JSON.parse(window.__db.futbol_personal_partidos[0].participaciones).map(x=>[x.id,x.st||{}]))")
SEED['futbol_personal_partidos'][0]['alineacion']=json.dumps({'formation':'1-2-1','slots':{str(i):f'p{i}' for i in range(5)}})
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=page(b,SEED);login(pg)
    pg.click('[data-mode=fs]');pg.wait_for_timeout(200)
    pg.click('[data-tab=partidos]');pg.click('[data-action=live][data-id=m1]');pg.wait_for_selector('.lv-board')
    pg.click('[data-live=start]');wait(pg,"d.estado==='1T'")
    check('hay panel de estadísticas con 7 datos',pg.locator('.lv-acc button').count()==7 and pg.locator('.lv-acc button.on[data-lvst=rob]').count()==1)
    check('primero los del campo y luego el banquillo',pg.locator('.lv-pl button').count()==7 and pg.locator('.lv-pl button').nth(5).get_attribute('data-lvsp') in ('p5','p6') and 'banquillo' in pg.inner_text('.lv-pl').lower())
    check('en fútbol sala salen las faltas acumuladas (0-0)',pg.locator('.lv-fal').count()==1 and '1ª parte' in pg.inner_text('.lv-fal').lower())
    for _ in range(3):pg.click('.lv-pl [data-lvsp=p1]')
    pg.click('[data-lvst=per]');pg.click('.lv-pl [data-lvsp=p2]')
    pg.click('[data-lvst=tp]');pg.click('.lv-pl [data-lvsp=p3]');pg.click('[data-lvst=tf]');pg.click('.lv-pl [data-lvsp=p3]')
    pg.click('[data-lvst=par]');pg.click('.lv-pl [data-lvsp=p0]')
    pg.click('[data-lvst=asi]');pg.click('.lv-pl [data-lvsp=p4]')
    check('el número del jugador sube al momento',pg.locator('.lv-pl [data-lvsp=p4] b').inner_text()=='1')
    pg.wait_for_function("()=>{let x=Object.fromEntries(JSON.parse(window.__db.futbol_personal_partidos[0].participaciones).map(x=>[x.id,x.st]));return x.p1&&x.p1.rob===3&&x.p4&&x.p4.asi===1}",timeout=4000)
    st=ST(pg)
    check('se guarda en el partido (por jugador)',st['p1']=={'rob':3} and st['p2']=={'per':1} and st['p3']=={'tp':1,'tf':1} and st['p0']=={'par':1} and st['p4']=={'asi':1},st)
    check('los robos no van al enlace público',D(pg,"d.eventos.length===0"))
    pg.click('[data-live=undo]');pg.wait_for_function("()=>!JSON.parse(window.__db.futbol_personal_partidos[0].participaciones).find(x=>x.id==='p4').st",timeout=4000)
    check('deshacer quita lo último',pg.locator('.lv-pl [data-lvsp=p4] b').inner_text()=='0')
    # Faltas: 5 nuestras en la 1ª parte -> aviso de doble penalti
    pg.click('[data-lvst=fal]')
    for i in range(5):pg.click(f'.lv-pl [data-lvsp=p{i}]')
    wait(pg,"d.eventos.filter(e=>e.t==='fa').length===5")
    check('cada falta suma al jugador y al equipo',pg.locator('.lv-fal b').first.inner_text()=='5' and D(pg,"d.eventos.every(e=>e.t==='fa'&&e.p===1&&!e.pid)"))
    check('a la 5ª falta: en rojo y aviso de doble penalti',pg.locator('.lv-fal b.w').count()==1 and 'doble penalti' in pg.inner_text('.lv-dp'))
    pg.click('[data-live=rfal]');pg.click('[data-live=rfal]');pg.click('[data-live=rtir]')
    wait(pg,"d.eventos.filter(e=>e.r).length===2")
    check('faltas del rival aparte',pg.locator('.lv-fal b').last.inner_text()=='2' and 'falta del rival 2' in ' '.join(pg.inner_text('[data-live=rfal]').lower().split()))
    check('las faltas no salen en la lista de goles',pg.locator('.lv-e').count()==0)
    pg.click('[data-live=gf]');pg.click('[data-scorer=p3]');wait(pg,"d.gf===1")
    check('el gol sigue funcionando con faltas apuntadas',pg.locator('.lv-e.f').count()==1)
    pg.set_viewport_size({'width':390,'height':1900});pg.evaluate('scrollTo(0,0)');pg.wait_for_timeout(300);pg.screenshot(path=OUT+'/est_directo.png');pg.set_viewport_size({'width':390,'height':844})
    pg.wait_for_function("()=>(a=>a.faltas&&a.faltas.n1===5&&a.faltas.r1===2&&a.estR&&a.estR.tir===1)(JSON.parse(window.__db.futbol_personal_partidos[0].alineacion))",timeout=4000)
    check('faltas acumuladas y tiros del rival pasan al partido',True)
    # 2ª parte: las faltas empiezan de cero
    pg.click('[data-live=half]');wait(pg,"d.estado==='DES'");pg.click('[data-live=start2]');wait(pg,"d.estado==='2T'")
    check('en la 2ª parte las faltas vuelven a 0',pg.locator('.lv-fal b').first.inner_text()=='0' and '2ª parte' in pg.inner_text('.lv-fal').lower() and pg.locator('.lv-dp').count()==0)
    pg.click('.lv-pl [data-lvsp=p1]');wait(pg,"d.eventos.filter(e=>e.p===2).length===1")
    pg.click('[data-live=undo]');wait(pg,"d.eventos.filter(e=>e.p===2).length===0")
    check('deshacer una falta la quita del equipo',pg.locator('.lv-fal b').first.inner_text()=='0')
    pg.click('[data-live=end]');wait(pg,"d.estado==='FIN'")
    pg.wait_for_function("()=>JSON.parse(window.__db.futbol_personal_partidos[0].participaciones).some(x=>x.minutes>0)",timeout=4000)
    check('al terminar se calculan los minutos igual que antes',PA(pg)['p1']==40 and PA(pg)['p5']==0,PA(pg))
    db=pg.evaluate('window.__db');did=db['directos'][0]['id']
    pub=page(b,db);pub.goto(URL+'?directo='+did);pub.wait_for_selector('#pub .lv-board')
    check('el enlace público ve las faltas pero no las estadísticas',pub.locator('#pub .lv-fal').count()==1 and pub.locator('#pub .lv-pl,#pub .lv-acc').count()==0)
    # Editar partido: tabla por jugador
    pg.click('[data-live=close]');pg.wait_for_selector('.mrow')
    pg.click('[data-action=edit-match][data-id=m1]');pg.wait_for_selector('.mdst')
    check('tabla de estadísticas en el editor',pg.locator('.mdst tbody tr').count()==7 and pg.input_value('[data-mdst=p1][data-k=rob]')=='3' and pg.input_value('[data-mdst=p1][data-k=fal]')=='1')
    check('faltas acumuladas en el editor',pg.input_value('[data-mdfal=n1]')=='5' and pg.input_value('[data-mdfal=r1]')=='2' and pg.input_value('[data-mdr=tir]')=='1')
    pg.fill('[data-mdst=p5][data-k=rob]','4');pg.dispatch_event('[data-mdst=p5][data-k=rob]','change')
    pg.fill('[data-mdst=p1][data-k=rob]','2');pg.dispatch_event('[data-mdst=p1][data-k=rob]','change')
    pg.fill('[data-mdfal=n2]','3');pg.dispatch_event('[data-mdfal=n2]','change')
    pg.set_viewport_size({'width':390,'height':2600});pg.wait_for_timeout(200);pg.locator('.mdata').screenshot(path=OUT+'/est_editor.png');pg.set_viewport_size({'width':390,'height':844})
    pg.click('[data-action=save]');pg.wait_for_selector('.mrow')
    st=ST(pg);al=AL(pg)
    check('se guarda lo corregido a mano',st['p5']=={'rob':4} and st['p1'].get('rob')==2 and al['faltas']['n2']==3 and 'lv' not in al['faltas'],(st,al.get('faltas')))
    pg.click('[data-tab=resumen]')
    pg.wait_for_timeout(300);t=pg.inner_text('#view')
    check('estadísticas de la temporada por jugador','robos' in t and 'paradas' in t and 'faltas' in t,t[:400])
    pg.screenshot(path=OUT+'/est_temporada.png',full_page=True)
    b.close()
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
if errs:print('\n'.join('FALLA consola: '+e for e in errs))
sys.exit(0 if all(res) and not errs else 1)
