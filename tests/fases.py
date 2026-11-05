import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json
from playwright.sync_api import sync_playwright
# v11.7: contexto de la carga (edad, días, horario, periodo), día del microciclo, fases del juego y ABP en F7/F11.
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
    else if(op==='update'&&window.__noCtx&&t==='equipos'&&payload&&payload.contexto!==undefined)out={data:null,error:{message:"Could not find the 'contexto' column of 'equipos'"}};else if(op==='update'){rows.filter(ok).forEach(r=>Object.assign(r,CP(payload)));window.__calls.push(['update',t,payload]);out={data:null,error:null}}
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
D=datetime.date.today()
HOY=D.isoformat()
def f(dd):return (D-datetime.timedelta(days=dd)).isoformat()
# lunes de esta semana: los entrenos de las semanas anteriores van en su lunes
LUN=D-datetime.timedelta(days=D.weekday())
def sem(i):return (LUN-datetime.timedelta(days=7*i)).isoformat()
P=[{'id':f'p{i}','owner_id':'u1','modalidad':'7','equipo_id':'e1','nombre':f'J{i}','foto':''} for i in range(3)]
EJ=[{'n':'Rondo 4x2','d':'','t':600,'f':'at'},{'n':'Repliegue','d':'','t':900,'f':'tad'},{'n':'Córners','d':'','t':300,'f':'abp'},{'n':'Calentar','d':'','t':300}]
def sd(plan,cat='benjamin'):
    T=[{'id':'t0','owner_id':'u1','modalidad':'7','equipo_id':'e1','fecha':HOY,'asistencia':{'p0':'si','p1':'si'},'carga':{'dur':70,'rpe':{'p0':6}},'ejercicios':EJ}]
    for i in range(1,5):T.append({'id':f't{i}','owner_id':'u1','modalidad':'7','equipo_id':'e1','fecha':sem(i),'asistencia':{'p0':'si'},'carga':{'dur':60,'rpe':{'p0':5}},'ejercicios':None})
    G=(D+datetime.timedelta(days=2)).isoformat()
    return {'futbol_personal_jugadores':CP(P),'perfiles':[{'id':'u1','plan':plan}],'entrenamientos':T,'circuitos':[],'ejercicios_guardados':[],'jugadas_guardadas':[],
      'equipos':[{'id':'e1','owner_id':'u1','modalidad':'7','nombre':'Benjamín A','categoria':cat,'created_at':'2026-01-01T00:00:00Z'}],
      'futbol_personal_partidos':[{'id':'m1','owner_id':'u1','modalidad':'7','equipo_id':'e1','fecha':G,'rival':'Los Pinos','participaciones':'[]','alineacion':'{}','created_at':''}]}
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8847),functools.partial(H,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8847/index.html'
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
RESP={'v':''}
def page(b,s,extra=''):
    pg=b.new_context(viewport={'width':390,'height':844},service_workers='block').new_page()
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    pg.on('dialog',lambda d:d.accept(RESP['v']) if d.type=='prompt' and RESP['v'] else d.accept())
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    pg.add_init_script('window.__seed='+json.dumps(s)+';'+extra)
    return pg
def login(pg):
    pg.goto(URL);pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto12');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)');pg.wait_for_timeout(300)
DB=lambda pg,js:pg.evaluate('(()=>{let d=window.__db;return '+js+'})()')
ON="localStorage.setItem('mf_entrenos:u1','1');"
info=lambda pg:pg.locator('#infoBody').inner_text()
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=page(b,sd('pro'),ON);login(pg);pg.click('[data-tab=entrenos]');pg.wait_for_selector('.cg-panel')
    row=pg.locator('.cx-row')
    check('contexto: sale la categoría y el botón «Poner»','Benjamín' in row.inner_text() and row.locator('[data-cx=abrir]').text_content().strip()=='Poner')
    check('benjamín: el aviso salta antes (1,4 veces su media ya es «Cuidado»)','Cuidado' in pg.locator('.cg-row:has-text("J0")').inner_text(),pg.locator('.cg-row:has-text("J0")').inner_text())
    pg.click('[data-cx=abrir]');pg.wait_for_selector('#info:not(.hidden) [data-cx=ok]')
    check('editor: días, horario y periodo',pg.locator('#infoBody [data-cx=dias]').count()==7 and pg.locator('#infoBody [data-cx=hora]').count()==3 and pg.locator('#infoBody [data-cx=per]').count()==3)
    pg.click('#infoBody [data-cx=dias][data-v="3"]');pg.click('#infoBody [data-cx=hora][data-v=t]');pg.click('#infoBody [data-cx=per][data-v=comp]')
    check('al elegir periodo pregunta desde qué día',pg.locator('#infoBody [data-cxf=desde]').count()==1)
    pg.screenshot(path=OUT+'/contexto_editor.png')
    pg.click('#infoBody [data-cx=ok]');pg.wait_for_timeout(300)
    c=DB(pg,"d.equipos[0].contexto")
    check('se guarda en equipos.contexto',c=={'dias':3,'hora':'t','per':[{'d':HOY,'p':'comp'}]},str(c))
    check('la fila resume el contexto','3 días/semana · tarde · Competición' in pg.locator('.cx-row').inner_text(),pg.locator('.cx-row').inner_text())
    check('consejos según el contexto',pg.locator('.cx-tips li').count()>=2 and 'partido' in pg.locator('.cx-tips').text_content())
    check('Pro: el periodo sale debajo del gráfico',pg.locator('.cx-ejes .cx-comp').count()>=1)
    check('día del microciclo: MD-2 con el partido en 2 días','MD-2' in pg.locator('.trs .cx-md').inner_text() and 'faltan 2 días' in pg.locator('.trs .cx-md').inner_text())
    fa=pg.locator('.fa-panel')
    check('fases: panel con los minutos de cada fase',fa.count()==1 and fa.locator('.fa-row').count()==5)
    t=fa.inner_text()
    check('fases: 10 min ataque organizado, 15 reorganización, 5 ABP','Ataque organizado' in t and fa.locator('.fa-row:has-text("Reorganización") .fa-v b').text_content()=='15' and fa.locator('.fa-row:has-text("ABP") .fa-v b').text_content()=='5',t)
    check('fases: la carga = minutos × esfuerzo medio',fa.locator('.fa-row:has-text("Ataque organizado")').inner_text().find('carga 60')>=0,fa.locator('.fa-row:has-text("Ataque organizado")').inner_text())
    check('Pro: 6 semanas por fase y reparto en %',fa.locator('.fa-st span').count()==6 and '%' in fa.locator('.fa-tot').inner_text())
    check('el ejercicio enseña su fase',pg.locator('.ej-it:has-text("Rondo") .fa-tag').text_content()=='Ataque organizado')
    pg.screenshot(path=OUT+'/fases_panel.png',full_page=True)
    # añadir un ejercicio con fase
    pg.click('.trs [data-ej=nuevo]');pg.wait_for_selector('#infoBody [data-ej=fase]')
    check('editor del ejercicio: fases agrupadas en ataque, defensa y balón parado',pg.locator('#infoBody .fa-chips').count()==3 and pg.locator('#infoBody [data-ej=fase]').count()==5)
    pg.fill('#infoBody [data-ejf=n]','Contra 3x2');pg.click('#infoBody [data-ej=fase][data-f=tda]')
    check('la fase elegida se marca y lo escrito se mantiene',pg.locator('#infoBody [data-ej=fase].on').get_attribute('data-f')=='tda' and pg.input_value('#infoBody [data-ejf=n]')=='Contra 3x2')
    pg.click('#infoBody [data-ej=ok]');pg.wait_for_timeout(300)
    L=DB(pg,"d.entrenamientos.find(t=>t.id==='t0').ejercicios")
    check('se guarda la fase en el ejercicio',L[-1].get('f')=='tda' and L[-1]['n']=='Contra 3x2',str(L[-1]))
    g=DB(pg,"d.ejercicios_guardados")
    check('y también en «Mis ejercicios»',len(g)==1 and g[0]['datos'].get('f')=='tda')
    check('el panel suma el contraataque',pg.locator('.fa-row:has-text("Contraataque") .fa-v b').text_content()=='10')
    pg.click('.trs [data-tr=enviar]');pg.wait_for_selector('#info:not(.hidden)')
    check('el mensaje del entreno lleva la fase','Rondo 4x2 (10 min · Ataque organizado)' in info(pg))
    pg.click('#closeInfo')
    # pizarra F7: biblioteca ABP
    pg.click('[data-tab=pizarra]');pg.wait_for_selector('[data-b=est]')
    check('F7: botón «Jugadas a balón parado (ABP)» con 14','Jugadas a balón parado (ABP)' in pg.locator('[data-b=est]').text_content() and '14' in pg.locator('[data-b=est] small').text_content())
    pg.click('[data-b=est]');pg.wait_for_selector('#infoBody .est-item')
    check('lista de 14 con dibujo',pg.locator('#infoBody .est-item').count()==14 and pg.locator('#infoBody .est-item svg').count()==14)
    check('Pro: ninguna bloqueada',pg.locator('#infoBody .est-item.lock').count()==0)
    pg.click('#infoBody [data-est=a-c1]');pg.wait_for_timeout(600)
    n=pg.evaluate("JSON.parse(localStorage.getItem('mf_pizarra_v1'))['7']")
    check('se carga en la pizarra con sus pasos',n['est']=='a-c1' and n['steps']==5 and len(n['items'])==15 and n.get('f')=='abp',str((n['est'],n['steps'],len(n['items']),n.get('f'))))
    check('tarjeta con la explicación del paso',pg.locator('.est-card').count()==1 and 'Paso' in pg.locator('#estStep').inner_text())
    pg.wait_for_timeout(5500)
    pg.screenshot(path=OUT+'/abp_f7.png',full_page=True)
    # Mis jugadas con fase
    pg.click('[data-b=jg]');pg.wait_for_selector('#infoBody [data-jg=guardar]')
    check('«Mis jugadas»: la fase ya viene marcada como ABP',pg.locator('#infoBody [data-jg=fase].on').get_attribute('data-f')=='abp')
    pg.click('#infoBody [data-jg=fase][data-f=at]')
    RESP['v']='Mi córner';pg.click('#infoBody [data-jg=guardar]');pg.wait_for_timeout(300)
    j=DB(pg,"d.jugadas_guardadas")
    check('la jugada se guarda con su fase',len(j)==1 and j[0]['datos']['f']=='at' and j[0]['datos']['est']=='a-c1',str(j and j[0]['datos'].get('f')))
    pg.click('#closeInfo');pg.click('[data-b=jg]');pg.wait_for_selector('#infoBody [data-jg=abrir]')
    check('la lista enseña la fase y deja filtrar',pg.locator('#infoBody .vj-it .fa-tag').count()==1 and pg.locator('#infoBody [data-jg=filtro]').count()==2)
    pg.click('#closeInfo')
    # F11 también
    pg.click('[data-mode="11"]');pg.wait_for_timeout(400);pg.click('[data-tab=pizarra]');pg.wait_for_selector('[data-b=est]')
    check('F11: también tiene las ABP','Jugadas a balón parado' in pg.locator('[data-b=est]').text_content())
    pg.click('[data-mode=fs]');pg.wait_for_timeout(400);pg.click('[data-tab=pizarra]');pg.wait_for_selector('[data-b=est]')
    check('fútbol sala: sigue con sus estrategias','Estrategias de fútbol sala' in pg.locator('[data-b=est]').text_content() and '34' in pg.locator('[data-b=est] small').text_content())
    pg.context.close()
    # gratis
    pg=page(b,sd('gratis','senior'),ON);login(pg);pg.click('[data-tab=entrenos]');pg.wait_for_selector('.fa-panel')
    check('gratis: fases de la semana con aviso del Pro',pg.locator('.fa-panel .fa-row').count()==5 and pg.locator('.fa-panel .fa-st').count()==0 and pg.locator('.fa-panel .cg-pro').count()==1)
    check('gratis: el contexto también se puede poner',pg.locator('.cx-row [data-cx=abrir]').count()==1)
    pg.click('[data-tab=pizarra]');pg.click('[data-b=est]');pg.wait_for_selector('#infoBody .est-item')
    check('gratis: 5 ABP TOP libres y 9 con candado',pg.locator('#infoBody .est-item:not(.lock)').count()==5 and pg.locator('#infoBody .est-item.lock').count()==9)
    pg.click('#infoBody [data-est=a-c4]')
    check('gratis: la bloqueada explica el plan Pro',pg.locator('#infoTitle').text_content()=='Jugada Pro' and 'las 14' in info(pg))
    pg.context.close()
    # senior Pro: 1,4 veces la media es «Está subiendo», no «Cuidado»
    pg=page(b,sd('pro','senior'),ON);login(pg);pg.click('[data-tab=entrenos]');pg.wait_for_selector('.cg-panel')
    check('senior: con 1,4 veces la media solo «Está subiendo»','Está subiendo' in pg.locator('.cg-row:has-text("J0")').inner_text(),pg.locator('.cg-row:has-text("J0")').inner_text())
    pg.context.close()
    # parón
    s=sd('pro','senior');s['equipos'][0]['contexto']={'dias':2,'hora':'n','per':[{'d':sem(8),'p':'comp'},{'d':sem(0),'p':'paron'}]}
    pg=page(b,s,ON);login(pg);pg.click('[data-tab=entrenos]');pg.wait_for_selector('.cg-panel')
    check('parón: el aviso lo tiene en cuenta','Parón' in pg.locator('.cg-row:has-text("J0")').inner_text(),pg.locator('.cg-row:has-text("J0")').inner_text())
    check('parón: consejo de volver poco a poco','Parón' in pg.locator('.cx-tips').text_content())
    pg.context.close()
    # sin la columna contexto: se guarda en el dispositivo
    pg=page(b,sd('pro'),ON+"window.__noCtx=1;");login(pg);pg.click('[data-tab=entrenos]');pg.wait_for_selector('.cx-row')
    pg.click('[data-cx=abrir]');pg.click('#infoBody [data-cx=dias][data-v="4"]');pg.click('#infoBody [data-cx=ok]');pg.wait_for_timeout(300)
    check('sin el SQL: se guarda en este dispositivo','4 días/semana' in pg.locator('.cx-row').inner_text() and 'este dispositivo' in pg.locator('#message').inner_text() and 'mf_ctx:e1' in pg.evaluate("Object.keys(localStorage).join(',')"),pg.locator('#message').inner_text())
    pg.context.close()
    b.close()
bad=[e for e in errs if 'favicon' not in e]
check('sin errores en la consola',not bad,str(bad[:3]))
print(f"\n{sum(res)}/{len(res)} correctas");sys.exit(0 if all(res) else 1)
