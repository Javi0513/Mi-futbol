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
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8833),functools.partial(H,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8833/index.html'
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
# Datos del partido: cambios, tarjetas, capitán y portero (en el Directo y al editar el partido)
AL=lambda pg:pg.evaluate("JSON.parse(window.__db.futbol_personal_partidos[0].alineacion)")
PA=lambda pg:pg.evaluate("Object.fromEntries(JSON.parse(window.__db.futbol_personal_partidos[0].participaciones).map(x=>[x.id,x.minutes]))")
P[7]['dorsal']=12;P[0]['dorsal']=7
SEED['futbol_personal_partidos'][0]['alineacion']=json.dumps({'formation':'2-3-1','slots':{str(i):f'p{i}' for i in range(7)}})
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=page(b,SEED);login(pg)
    pg.click('[data-tab=partidos]');pg.click('[data-action=live][data-id=m1]');pg.wait_for_selector('.lv-board')
    pg.click('[data-live=start]');wait(pg,"d.estado==='1T'")
    check('hay botones de cambio y tarjetas',pg.locator('[data-live=sub],[data-live=ta],[data-live=tr]').count()==3)
    pg.select_option('#lvCap','p1');pg.wait_for_function("JSON.parse(window.__db.futbol_personal_partidos[0].alineacion).capitan==='p1'",timeout=4000)
    check('el capitán se elige en el directo',AL(pg)['capitan']=='p1')
    check('portero por defecto: el de la portería',pg.input_value('#lvGk')=='p0')
    pg.click('[data-live=sub]');pg.wait_for_selector('.lv-pick [data-lvp]')
    check('cambio: primero quién sale (los 7 del campo)',pg.locator('.lv-pick [data-lvp]').count()==7 and '(C)' in pg.inner_text('.lv-pick') and '(POR)' in pg.inner_text('.lv-pick'))
    check('se ve el dorsal al elegir',pg.locator('.lv-pick [data-lvp=p0]').inner_text().startswith('7 · J0'),pg.locator('.lv-pick [data-lvp=p0]').inner_text())
    pg.click('.lv-pick [data-lvp=p0]');pg.wait_for_selector('.lv-pick h3:has-text("entra")')
    check('luego quién entra (solo suplentes)',pg.locator('.lv-pick [data-lvp]').count()==1 and pg.locator('.lv-pick [data-lvp=p7]').count()==1)
    pg.click('.lv-pick [data-lvp=p7]');wait(pg,"d.eventos.length===1")
    check('el cambio queda con quién sale, quién entra y dorsales',D(pg,"(e=>e.t==='s'&&e.pid==='p0'&&e.pin==='p7'&&e.d==='7'&&e.di==='12'&&e.n==='J0'&&e.ni==='J7'&&e.m===1)(d.eventos[0])"),D(pg,'d.eventos[0]'))
    pg.wait_for_function("(JSON.parse(window.__db.futbol_personal_partidos[0].alineacion).cambios||[]).length===1",timeout=4000)
    check('el cambio pasa al partido',(lambda c:c['sale']=='p0' and c['entra']=='p7' and c['lv']==1)(AL(pg)['cambios'][0]))
    check('se ve en la lista del directo',pg.locator('.lv-e.s').count()==1 and '▲ 12 J7' in pg.inner_text('.lv-e.s') and '▼ 7 J0' in pg.inner_text('.lv-e.s'),pg.inner_text('.lv-ev'))
    pg.click('[data-live=sub]');pg.wait_for_selector('.lv-pick [data-lvp]')
    check('después del cambio, en el campo está el que entró',pg.locator('.lv-pick [data-lvp=p7]').count()==1 and pg.locator('.lv-pick [data-lvp=p0]').count()==0)
    pg.click('[data-live=nopick]')
    for _ in range(2):
        pg.click('[data-live=ta]');pg.click('.lv-pick [data-lvp=p2]')
    wait(pg,"d.eventos.length===3")
    check('dos amarillas: la 2ª sale como expulsión',pg.locator('.lv-e.t.a').count()==2 and 'expulsado' in pg.locator('.lv-e.t.a').first.inner_text())
    pg.click('[data-live=tr]')
    check('el expulsado ya no sale para más tarjetas',pg.locator('.lv-pick [data-lvp=p2]').count()==0)
    pg.click('.lv-pick [data-lvp=p3]');wait(pg,"d.eventos.length===4&&d.eventos[3].t==='r'")
    pg.click('[data-live=sub]')
    check('los expulsados no pueden salir ni entrar en un cambio',pg.locator('.lv-pick [data-lvp=p2],.lv-pick [data-lvp=p3]').count()==0)
    pg.click('[data-live=nopick]')
    check('las tarjetas no cambian el marcador',D(pg,"d.gf===0&&d.gc===0"))
    pg.wait_for_function("(JSON.parse(window.__db.futbol_personal_partidos[0].alineacion).tarjetas||[]).length===3",timeout=4000)
    check('las tarjetas pasan al partido',[t['c'] for t in AL(pg)['tarjetas']]==['a','a','r'])
    ev=D(pg,"d.eventos[3].id");pg.click(f'[data-lvdel="{ev}"]');wait(pg,"d.eventos.length===3")
    pg.wait_for_function("(JSON.parse(window.__db.futbol_personal_partidos[0].alineacion).tarjetas||[]).length===2",timeout=4000)
    check('quitar una tarjeta la quita también del partido',D(pg,'d.gf===0'))
    pg.click('[data-live=tr]');pg.click('.lv-pick [data-lvp=p3]');wait(pg,"d.eventos.length===4")
    pg.set_viewport_size({'width':390,'height':1500});pg.evaluate('scrollTo(0,0)');pg.wait_for_timeout(300);pg.screenshot(path=OUT+'/datos_directo.png');pg.set_viewport_size({'width':390,'height':844})
    pg.click('[data-live=half]');wait(pg,"d.estado==='DES'");pg.click('[data-live=start2]');wait(pg,"d.estado==='2T'")
    pg.click('[data-live=end]');wait(pg,"d.estado==='FIN'")
    pg.wait_for_function("JSON.parse(window.__db.futbol_personal_partidos[0].participaciones).some(x=>x.minutes>0)",timeout=4000)
    mn=PA(pg)
    check('al terminar se calculan los minutos con los cambios',mn['p1']==60 and mn['p0']==1 and mn['p7']==59 and mn['p2']==1 and mn['p3']==1,mn)
    db=pg.evaluate('window.__db');did=db['directos'][0]['id']
    pub=page(b,db);pub.goto(URL+'?directo='+did);pub.wait_for_selector('#pub .lv-board')
    t=pub.inner_text('#pub')
    check('el enlace público muestra cambios y tarjetas',pub.locator('.lv-e.s').count()==1 and pub.locator('.lv-e.t').count()==3 and 'J7' in t and pub.locator('#pub [data-lvdel],#pub select').count()==0,t[:300])
    pub.screenshot(path=OUT+'/datos_publico.png',full_page=True)
    # Después del partido: editar
    pg.click('[data-live=close]');pg.wait_for_selector('.mrow')
    pg.click('[data-action=edit-match][data-id=m1]');pg.wait_for_selector('.mdata')
    check('en el editor salen cambios y tarjetas del directo',pg.locator('.mdata .mdrow').count()==4 and pg.input_value('#mdCap')=='p1')
    check('portero de otro color y capitán con C en el campo',pg.locator('.slot button.gk').count()==1 and pg.locator('.slot .capb').count()==1)
    check('etiquetas C y POR en la convocatoria',pg.locator('.checkline .tg.c').count()==1 and pg.locator('.checkline .tg.g').count()==1)
    pg.click('[data-mdadd=cambios]');r=pg.locator('.mdrow.cb').nth(1)
    r.locator('input').fill('40');r.locator('input').dispatch_event('change')
    pg.locator('.mdrow.cb').nth(1).locator('select[data-k=sale]').select_option('p1')
    pg.locator('.mdrow.cb').nth(1).locator('select[data-k=entra]').select_option('p0')
    pg.select_option('#mdGk','p4')
    check('cambiar el portero a mano',pg.locator('.slot button.gk[aria-label^="J4"]').count()==1)
    pg.click('[data-mdadd=tarjetas]');pg.locator('.mdrow:not(.cb)').last.locator('select[data-k=pid]').select_option('p5');pg.locator('.mdrow:not(.cb)').last.locator('select[data-k=c]').select_option('r')
    pg.locator('.mdrow:not(.cb)').last.locator('input').fill('50');pg.locator('.mdrow:not(.cb)').last.locator('input').dispatch_event('change')
    pg.click('[data-mdcalc]')
    check('calcular minutos (sale J1 al 40, vuelve J0, roja a J5 al 50)',pg.input_value('[data-field=minutes][data-id=p1]')=='40' and pg.input_value('[data-field=minutes][data-id=p0]')=='21' and pg.input_value('[data-field=minutes][data-id=p5]')=='50',[pg.input_value(f'[data-field=minutes][data-id=p{i}]') for i in range(8)])
    pg.set_viewport_size({'width':390,'height':2400});pg.wait_for_timeout(200);pg.screenshot(path=OUT+'/datos_editor.png');pg.set_viewport_size({'width':390,'height':844})
    pg.click('[data-img=draft]');pg.wait_for_timeout(1200)
    pg.click('[data-action=save]');pg.wait_for_selector('.mrow')
    al=AL(pg)
    check('se guarda todo en el partido',al['portero']=='p4' and al['capitan']=='p1' and len(al['cambios'])==2 and al['cambios'][1]['m']==40 and len(al['tarjetas'])==4 and al['tarjetas'][-1]['c']=='r',al)
    pg.click('[data-tab=plantilla]')
    check('la plantilla cuenta tarjetas y capitanías',pg.locator('.row[data-pid=p2] .tj.a').count()==1 and 'capitán' in pg.inner_text('.row[data-pid=p1]'),pg.inner_text('.row[data-pid=p2]'))
    # Partido sin datos nuevos: guarda igual que antes
    pg.click('[data-tab=partidos]');pg.click('[data-action=edit-match][data-id=m1]');pg.wait_for_selector('.mdata')
    for i in range(4):pg.locator('[data-mddel]').first.click()
    pg.locator('[data-mddel]').first.click();pg.locator('[data-mddel]').first.click()
    pg.select_option('#mdCap','');pg.click('[data-action=save]');pg.wait_for_selector('.mrow')
    al=AL(pg);check('sin cambios ni tarjetas no quedan listas vacías',('cambios' not in al) and ('tarjetas' not in al) and ('capitan' not in al),al)
    b.close()
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
if errs:print('\n'.join('FALLA consola: '+e for e in errs))
sys.exit(0 if all(res) and not errs else 1)
