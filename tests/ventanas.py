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
P=[{'id':f'p{i}','owner_id':'u1','modalidad':'11','nombre':f'J{i}','foto':'','created_at':'','dorsal':i+1} for i in range(15)]
PART=[{'id':f'p{i}','nombre':f'J{i}','minutes':0,'goals':0,'starter':i<11} for i in range(15)]
P7=[{'id':f'q{i}','owner_id':'u1','modalidad':'7','nombre':f'K{i}','foto':'','created_at':''} for i in range(8)]
PART7=[{'id':f'q{i}','nombre':f'K{i}','minutes':0,'goals':0,'starter':i<7} for i in range(8)]
SEED={'futbol_personal_jugadores':P+P7,'futbol_personal_partidos':[{'id':'m1','owner_id':'u1','modalidad':'11','fecha':'2026-10-18','rival':'Los Pinos','participaciones':json.dumps(PART),'alineacion':'{}','created_at':'','equipo_id':'t11'},{'id':'m7','owner_id':'u1','modalidad':'7','fecha':'2026-10-19','rival':'Otro','participaciones':json.dumps(PART7),'alineacion':'{}','created_at':''}],'perfiles':[{'id':'u1','plan':'gratis'}],'equipos':[{'id':'t11','owner_id':'u1','modalidad':'11','nombre':'Juvenil A','categoria':'senior','created_at':''}]}
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8851),functools.partial(H,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8851/index.html'
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

# v11.9 Ventanas de cambios: 3 por parte desde juvenil (fútbol 11) y cambios de varios a la vez
AL=lambda pg,i=0:pg.evaluate(f"JSON.parse(window.__db.futbol_personal_partidos[{i}].alineacion)")
EV=lambda pg:pg.evaluate("(window.__db.directos[0].eventos||[]).filter(e=>e.t==='s')")
def shot(pg,sel,name):
    pg.evaluate("(()=>{let s=document.createElement('style');s.id='_shot';s.textContent='.head,.toasts,.dock{visibility:hidden!important}';document.head.appendChild(s)})()")
    pg.locator(sel).screenshot(path=OUT+'/'+name)
    pg.evaluate("(()=>document.getElementById('_shot').remove())()")
def sub(pg,o,i):
    pg.click('[data-live=sub]');pg.wait_for_selector('.lv-multi')
    for x in o:pg.click(f'.lv-pick [data-lvso={x}]')
    for x in i:pg.click(f'.lv-pick [data-lvsi={x}]')
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=page(b,SEED);login(pg)
    pg.click('[data-mode="11"]');pg.wait_for_timeout(200)
    pg.select_option('#teamCat','juvenil');pg.wait_for_function("()=>(window.__db.equipos||[]).some(t=>t.categoria==='juvenil')",timeout=4000)
    pg.click('[data-tab=partidos]');pg.click('[data-action=live][data-id=m1]');pg.wait_for_selector('.lv-board')
    check('juvenil F11: ventanas activadas solas',pg.locator('#lvVent').is_checked() and pg.locator('.vfila').count()==2)
    pg.click('[data-live=start]');wait(pg,"d.estado==='1T'")
    check('3 ventanas por parte y la 1ª se puede tocar',pg.locator('.vfila').nth(0).locator('.vch').count()==3 and pg.locator('.vch.next').get_attribute('aria-label').startswith('Ventana 1'))
    pg.click('.vch.next');pg.wait_for_selector('.lv-multi')
    check('título con la ventana y la parte',pg.text_content('.lv-multi h3')=='🔄 Ventana 1 de 3 · 1ª parte')
    check('salen los 11 del campo y entran los 4 del banquillo',pg.locator('[data-lvso]').count()==11 and pg.locator('[data-lvsi]').count()==4)
    for x in ['p0','p1']:pg.click(f'[data-lvso={x}]')
    for x in ['p11','p12']:pg.click(f'[data-lvsi={x}]')
    check('se ve el orden y las parejas',pg.locator('.lv-par li').count()==2 and '▼ 1 · J0' in pg.text_content('.lv-par li >> nth=0') and '▲ 12 · J11' in pg.text_content('.lv-par li >> nth=0') and pg.text_content('[data-live=subok]')=='Hacer 2 cambios')
    pg.click('[data-lvso=p1]');pg.click('[data-lvso=p1]')
    check('desmarcar y volver a marcar funciona',pg.locator('[data-lvso].selected').count()==2)
    shot(pg,'.lv-pick','ventanas_elegir.png')
    pg.click('[data-live=subok]');wait(pg,"d.eventos.length===2")
    ev=EV(pg)
    check('2 cambios en la misma ventana de la 1ª parte',ev[0]['v']==ev[1]['v'] and ev[0]['p']==1 and ev[0]['pid']=='p0' and ev[0]['pin']=='p11' and ev[1]['pid']=='p1' and ev[1]['pin']=='p12',ev)
    check('la ventana 1 queda hecha con 2 cambios',pg.locator('.vch.used').count()==1 and '2 cambios' in pg.inner_text('.vch.used') and 'Quedan 2' in pg.inner_text('.vfila >> nth=0'))
    check('aviso: después de la próxima solo queda una',pg.locator('.lv-vw.s').count()==1)
    sub(pg,['p2'],['p13'])
    check('penúltima ventana avisa',('Penúltima' in pg.text_content('.lv-multi')) and pg.text_content('.lv-multi h3').startswith('🔄 Ventana 2'))
    pg.click('[data-live=subok]');wait(pg,"d.eventos.length===3")
    check('al hacer la penúltima: queda la última',pg.locator('.vch.next small').inner_text()=='la última' and 'última ventana' in pg.inner_text('.lv-vent'))
    sub(pg,['p3','p4'],['p14'])
    check('última ventana avisa',('Es la última ventana de la 1ª parte' in pg.inner_text('.lv-multi')))
    shot(pg,'.lv-pick','ventanas_ultima.png')
    pg.click('[data-live=subok]');wait(pg,"d.eventos.length===5")
    check('sale uno sin que entre nadie (lesión)',EV(pg)[4]['pid']=='p4' and not EV(pg)[4].get('pin') and 'última ventana' in pg.inner_text('#message'))
    check('ventanas agotadas',pg.locator('.vfila >> nth=0').locator('.vch.used').count()==3 and 'Sin ventanas' in pg.inner_text('.vfila >> nth=0') and pg.locator('.vch.next').count()==0)
    shot(pg,'.lv-vent','ventanas_panel.png')
    pg.click('[data-live=sub]');pg.wait_for_selector('.lv-multi')
    check('si ya no quedan, pregunta y avisa que es de más',('ventana de más' in pg.inner_text('.lv-multi')))
    pg.click('[data-lvso=p5]')
    check('el que salió puede volver a entrar (lista de banquillo)',pg.locator('[data-lvsi=p0]').count()==1);pg.click('[data-lvsi=p0]')
    pg.click('[data-lvsi=p1]')
    pg.click('[data-live=subok]');pg.wait_for_timeout(200)
    check('entran más de los que salen: avisa y no apunta',D(pg,"d.eventos.length===5") and 'Entran más' in pg.inner_text('#message'))
    pg.click('[data-live=nopick]')
    pg.wait_for_function("(JSON.parse(window.__db.futbol_personal_partidos[0].alineacion).cambios||[]).length===5",timeout=4000)
    c=AL(pg)['cambios'];check('los cambios pasan al partido con su ventana y parte',all(z.get('v') and z.get('p')==1 for z in c) and len({z['v'] for z in c})==3,c)
    pg.click('[data-live=half]');wait(pg,"d.estado==='DES'")
    check('en el descanso: no gastan ventana',('no gastan ventana' in pg.inner_text('.lv-vent')))
    sub(pg,['p5'],['p0']);check('título del descanso',pg.text_content('.lv-multi h3')=='🔄 Cambios en el descanso')
    pg.click('[data-live=subok]');wait(pg,"d.eventos.filter(e=>e.t==='s').length===6")
    check('el cambio del descanso va con ds',EV(pg)[5].get('ds')==1 and EV(pg)[5]['p']==2)
    pg.click('[data-live=start2]');wait(pg,"d.estado==='2T'")
    check('2ª parte: sus 3 ventanas libres',pg.locator('.vfila.act .vch.used').count()==0 and 'Quedan 3' in pg.inner_text('.vfila.act') and pg.inner_text('.vfila.act .vp')=='2ª parte')
    sub(pg,['p6','p7'],['p5','p1']);pg.click('[data-live=subok]');wait(pg,"d.eventos.filter(e=>e.t==='s').length===8")
    check('2ª parte: ventana 1 hecha',pg.locator('.vfila.act .vch.used').count()==1 and EV(pg)[6]['p']==2)
    # Anotador / sin ventana: mismos minutos = una ventana
    pg.click('[data-live=end]');wait(pg,"d.estado==='FIN'")
    pg.wait_for_function("(JSON.parse(window.__db.futbol_personal_partidos[0].alineacion).cambios||[]).length===8",timeout=4000)
    m=pg.evaluate("Object.fromEntries(JSON.parse(window.__db.futbol_personal_partidos[0].participaciones).map(x=>[x.id,x.minutes]))")
    check('minutos calculados con los cambios',m['p11']>0 and m['p0']>0 and m['p8']>0,m)
    pg.click('[data-live=close]')
    pg.click('[data-action=edit-match][data-id=m1]');pg.wait_for_selector('.mdata')
    t=pg.inner_text('.md-vent')
    check('editor: resumen de ventanas por parte',('1ª parte: 3 de 3' in t) and ('2ª parte: 1 de 3' in t),t)
    shot(pg,'.md-vent','ventanas_editor.png')
    pg.click('[data-mdadd=cambios]');n=pg.locator('[data-md=cambios][data-k=m]').count()
    pg.locator('[data-md=cambios][data-k=m]').nth(n-1).fill('20');pg.locator('select[data-md=cambios][data-k=sale]').nth(n-1).select_option('p8');pg.locator('select[data-md=cambios][data-k=entra]').nth(n-1).select_option('p6')
    pg.click('#mdVent');pg.click('#mdVent');pg.wait_for_timeout(100)
    check('editor: un cambio a mano en otro minuto suma una ventana de más',('4 de 3' in pg.inner_text('.md-vent')),pg.inner_text('.md-vent'))
    pg.click('#mdVent');pg.wait_for_timeout(100)
    check('editor: se puede quitar',pg.locator('.md-vent p').count()==0)
    pg.click('[data-action=save]');pg.wait_for_selector('.mrow')
    a=AL(pg);check('se guarda vent:0 y los cambios conservan su ventana',a.get('vent')==0 and sum(1 for z in a['cambios'] if z.get('v'))==8 and len(a['cambios'])==9,a.get('vent'))
    # Fútbol 7 sin categoría: sin ventanas, pero se pueden activar; los cambios son de varios a la vez igual
    pg.click('[data-mode="7"]');pg.wait_for_timeout(200);pg.click('[data-tab=partidos]')
    pg.click('[data-action=live][data-id=m7]');pg.wait_for_selector('.lv-board')
    check('F7 sin categoría: ventanas apagadas',(not pg.locator('#lvVent').is_checked()) and pg.locator('.vfila').count()==0)
    pg.click('[data-live=start]');pg.wait_for_function("()=>(window.__db.directos||[]).some(d=>d.partido_id==='m7'&&d.estado==='1T')",timeout=4000)
    pg.click('[data-live=sub]');check('F7: cambio sin ventanas pero de varios',pg.text_content('.lv-multi h3')=='🔄 Cambio' and pg.locator('[data-lvso]').count()==7)
    pg.click('[data-live=nopick]');pg.click('#lvVent');pg.wait_for_function("JSON.parse(window.__db.futbol_personal_partidos[1].alineacion).vent===3",timeout=4000)
    check('F7: al activarlas salen las ventanas',pg.locator('.vfila').count()==2)
    # Plan gratuito: control de ventanas en 3 partidos al mes
    pg.evaluate("localStorage.setItem('mf_envios:u1:'+new Date().toISOString().slice(0,7),JSON.stringify({vt:['a','b','c']}))")
    pg.click('[data-live=close]');pg.click('[data-action=live][data-id=m7]');pg.wait_for_selector('.lv-board')
    check('gratis: tope de 3 partidos al mes',pg.locator('.vfila').count()==0 and 'ventanas en 3 partidos al mes' in pg.inner_text('.lv-vent'))
    pg.click('[data-live=sub]');check('gratis con tope: el cambio múltiple sigue',pg.text_content('.lv-multi h3')=='🔄 Cambio')
    pg.click('[data-live=nopick]')
    pg.click('[data-live=close]');pg.click('[data-mode="11"]');pg.wait_for_timeout(200);pg.click('[data-tab=partidos]');pg.click('[data-action=live][data-id=m1]');pg.wait_for_selector('.lv-board')
    check('el partido que ya contó no se bloquea',True)
    b.close()
    # fútbol sala: sin ventanas
    S2={'futbol_personal_jugadores':[{'id':f's{i}','owner_id':'u1','modalidad':'fs','nombre':f'S{i}','foto':'','created_at':''} for i in range(7)],'futbol_personal_partidos':[{'id':'mf','owner_id':'u1','modalidad':'fs','fecha':'2026-10-18','rival':'X','participaciones':json.dumps([{'id':f's{i}','nombre':f'S{i}','minutes':0,'goals':0,'starter':i<5} for i in range(7)]),'alineacion':'{}','created_at':''}],'perfiles':[{'id':'u1','plan':'pro'}]}
    b=p.chromium.launch();pg=page(b,S2);login(pg)
    pg.click('[data-mode=fs]');pg.wait_for_timeout(200);pg.click('[data-tab=partidos]');pg.click('[data-action=live][data-id=mf]');pg.wait_for_selector('.lv-board')
    check('fútbol sala: sin ventanas',pg.locator('.lv-vent').count()==0)
    b.close()
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
if errs:print('\n'.join('FALLA consola: '+e for e in errs))
sys.exit(0 if all(res) and not errs else 1)
