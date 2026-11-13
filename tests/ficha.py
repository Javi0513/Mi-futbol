# Ficha del jugador y exportar a Excel (v11.21): posición, pie, estadísticas acumuladas,
# partido a partido y un .xlsx con Jugadores, Partidos, Acciones (con minuto) y Equipo.
import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json
from playwright.sync_api import sync_playwright
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
    else if(op==='update'&&window.__sinFicha&&payload&&'posicion' in payload){out={data:null,error:{message:'Could not find the \'posicion\' column of \'futbol_personal_jugadores\' in the schema cache'}}}
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
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8871),functools.partial(type('Q',(http.server.SimpleHTTPRequestHandler,),{'log_message':lambda *a:None}),directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8871/index.html'
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
NOM=['Hugo','Leo','Mario','Pablo','Dani','Álex','Iker','Nico','Saúl']
J=[{'id':f'j{i}','owner_id':'u1','modalidad':'7','nombre':n,'dorsal':i+1,'foto':'','created_at':''} for i,n in enumerate(NOM)]
J[3]['posicion']='DC';J[3]['pie']='Z'
PART=[{'id':f'j{i}','minutes':[50,50,50,50,35,50,25,15,0][i],'goals':[0,0,0,2,1,0,0,0,0][i],'starter':i<7} for i in range(9)]
PART[3]['st']={'rob':3,'tp':4,'tf':1};PART[3]['stm']={'rob':[12,5,40]};PART[0]['st']={'par':6};PART[4]['st']={'asi':2,'per':1}
AL={'formation':'2-3-1','slots':{},'resultado':{'gf':3,'gc':1},'capitan':'j3','portero':'j0','parte':25,
    'cambios':[{'id':'c1','m':25,'sale':'j6','entra':'j7'},{'id':'c2','m':35,'sale':'j4','entra':'j8'}],
    'tarjetas':[{'id':'t1','m':30,'pid':'j5','c':'a'}],'estR':{'tir':5},'faltas':{'n1':2,'r1':3,'n2':1,'r2':4}}
M=[{'id':'m1','owner_id':'u1','modalidad':'7','fecha':'2026-11-08','rival':'Los Pinos','participaciones':json.dumps(PART),'alineacion':json.dumps(AL),'created_at':''}]
for k,(r,f) in enumerate([('Atlético Sur','2026-11-01'),('Real Norte','2026-10-25'),('CD Río','2026-10-18')]):
    M.append({'id':f'm{k+2}','owner_id':'u1','modalidad':'7','fecha':f,'rival':r,'participaciones':json.dumps([{'id':'j3','minutes':50,'goals':1,'starter':True}]),'alineacion':json.dumps({'resultado':{'gf':1,'gc':k}}),'created_at':''})
P5=[{'id':f'j{i}','minutes':0,'goals':0,'starter':i<7} for i in range(9) if i!=3]
M.append({'id':'m5','owner_id':'u1','modalidad':'7','fecha':'2026-11-15','rival':'Futuro CF','participaciones':json.dumps(P5),'alineacion':json.dumps({'formation':'2-3-1','slots':{str(i):f'j{i}' for i in range(7) if i!=3}}),'created_at':''})
EV=[{'id':'e1','t':'f','m':7,'n':'Pablo','d':'4','pid':'j3','p':1},{'id':'e2','t':'c','m':18,'p':1},{'id':'e3','t':'f','m':31,'n':'Dani','d':'5','pid':'j4','p':2},{'id':'e4','t':'f','m':44,'n':'Pablo','d':'4','pid':'j3','p':2}]
D=[{'id':'00000000-0000-4000-8000-000000000001','owner_id':'u1','partido_id':'m1','modalidad':'7','equipo':'Mi equipo','rival':'Los Pinos','gf':3,'gc':1,'estado':'FIN','parte_min':25,'acum_ms':0,'desde':None,'eventos':EV}]
SEED={'futbol_personal_jugadores':J,'futbol_personal_partidos':M,'directos':D,'perfiles':[{'id':'u1','plan':'gratis'}]}
def abre(b,pro=False,extra=''):
    ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block',accept_downloads=True,device_scale_factor=2)
    pg=ctx.new_page();pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('dialog',lambda d:d.accept())
    seed=json.dumps(SEED)
    if pro: seed=seed.replace('"gratis"','"pro"')
    pg.add_init_script('window.__seed='+seed+';'+extra)
    pg.add_init_script("try{localStorage.setItem('mf_version_abierta','99');localStorage.setItem('mf_tut_visto','1');localStorage.setItem('mf_novedades_visto','99')}catch(e){}")
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    pg.goto(URL);pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto12');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)');pg.wait_for_timeout(900)
    while pg.locator('#info').is_visible():
        pg.click('#closeInfo');pg.wait_for_timeout(200)
    return ctx,pg
def xlsx(path):
    import openpyxl
    return openpyxl.load_workbook(path)
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx,pg=abre(b)
    check('la posición sale junto al nombre en la plantilla',pg.locator('[data-pid=j3] .pos-chip').inner_text()=='DC')
    check('cada jugador tiene botón de ficha',pg.locator('.row [data-ficha]').count()>=9)
    pg.click('[data-pid=j3] .info');pg.wait_for_timeout(300)
    body=pg.locator('#infoBody').inner_text();bl=body.lower()
    check('tocar el nombre abre la ficha',pg.locator('#info').is_visible() and pg.locator('#infoTitle').inner_text().lower()=='ficha del jugador' and 'Pablo' in body)
    check('posición y pie en la ficha','delantero centro' in bl and 'zurdo' in bl,body[:150])
    tiles={x.locator('small').inner_text():x.locator('b').inner_text() for x in pg.locator('#infoBody .stat').all()}
    check('totales: 4 partidos, 200 min, 5 goles',tiles.get('Partidos')=='4' and tiles.get('Minutos')=='200' and tiles.get('Goles')=='5' and tiles.get('Min. por gol')=='40',tiles)
    check('estadísticas del Directo y % a puerta',tiles.get('Robos')=='3' and tiles.get('Tiros')=='5' and tiles.get('A puerta')=='4 (80 %)' and tiles.get('Capitán')=='1',tiles)
    check('partido a partido con el minuto de sus goles',"(7', 44')" in body and 'Los Pinos' in body and '★ Titular' in body)
    check('gratis: solo los 3 últimos partidos',pg.locator('#infoBody .fi-p').count()==3 and 'ves los 3 últimos partidos de 4' in body and 'CD Río' not in body)
    check('aviso de exportaciones del plan gratuito','te quedan 2 de 2 exportaciones' in body)
    pg.screenshot(path=os.path.join(OUT,'ficha-1-jugador.png'))
    pg.locator('#infoBody').evaluate('e=>e.scrollTop=e.scrollHeight');pg.wait_for_timeout(150)
    pg.screenshot(path=os.path.join(OUT,'ficha-2-partidos.png'))
    # editar desde la ficha
    pg.click('[data-ficha-ed=j3]');pg.wait_for_timeout(250)
    check('«Editar» abre el jugador con su posición y pie',pg.locator('#modal').is_visible() and pg.input_value('#playerForm [name=posicion]')=='DC' and pg.input_value('#playerForm [name=pie]')=='Z')
    ops=pg.locator('#playerForm [name=posicion] option').all_inner_texts()
    check('posiciones de fútbol 7/11',len(ops)==12 and 'Mediapunta' in ops and 'Pívot' not in ops,ops)
    pg.screenshot(path=os.path.join(OUT,'ficha-3-editar.png'))
    pg.select_option('#playerForm [name=posicion]','MP');pg.select_option('#playerForm [name=posicion2]','DC');pg.select_option('#playerForm [name=pie]','A')
    pg.click('#playerForm button.primary');pg.wait_for_timeout(500)
    j3=pg.evaluate("window.__db.futbol_personal_jugadores.find(x=>x.id==='j3')")
    check('se guarda posición, otra posición y pie',j3.get('posicion')=='MP' and j3.get('posicion2')=='DC' and j3.get('pie')=='A',j3)
    check('y se ve en la plantilla',pg.locator('[data-pid=j3] .pos-chip').inner_text()=='MP')
    # sin columnas en el servidor: se guarda lo demás y avisa
    pg.evaluate('window.__sinFicha=1')
    pg.click('[data-action=edit-player][data-id=j1]');pg.wait_for_timeout(200)
    pg.select_option('#playerForm [name=posicion]','LD');pg.click('#playerForm button.primary');pg.wait_for_timeout(500)
    check('sin supabase-ficha.sql guarda el resto y avisa','falta activarlo en el servidor' in pg.locator('#message').inner_text() and pg.locator('#modal').is_hidden())
    pg.evaluate('window.__sinFicha=0')
    # Estadísticas › Exportar a Excel
    pg.click('[data-tab=resumen]');pg.wait_for_timeout(300)
    check('botón «Exportar a Excel» en Estadísticas',pg.locator('#view [data-xl]').count()==1)
    pg.click('#view .row[data-ficha=j4]');pg.wait_for_timeout(200)
    check('tocar un jugador en Estadísticas abre su ficha','Dani' in pg.locator('#infoBody').inner_text());pg.click('#closeInfo')
    with pg.expect_download() as dl: pg.click('#view [data-xl]')
    f=os.path.join(OUT,'ficha-estadisticas.xlsx');dl.value.save_as(f)
    check('descarga un .xlsx',dl.value.suggested_filename.startswith('estadisticas-f7-') and dl.value.suggested_filename.endswith('.xlsx'),dl.value.suggested_filename)
    wb=xlsx(f)
    check('5 hojas (v11.27: + Mapa)',wb.sheetnames==['Jugadores','Partidos','Acciones','Equipo','Mapa'],wb.sheetnames)
    ws=wb['Jugadores'];H=[c.value for c in ws[1]];rows=[[c.value for c in r] for r in ws.iter_rows(min_row=2)]
    pab=[r for r in rows if r[1]=='Pablo'][0];X=lambda r,h:r[H.index(h)]
    check('Jugadores: totales de Pablo',X(pab,'Dorsal')==4 and X(pab,'Posición')=='Mediapunta' and X(pab,'Otra posición')=='Delantero centro' and X(pab,'Pie')=='Ambidiestro' and X(pab,'Partidos')==4 and X(pab,'Minutos')==200 and X(pab,'Goles')==5 and X(pab,'Robos')==3 and X(pab,'% a puerta')==80,pab)
    check('Jugadores: una fila por jugador',len(rows)==9)
    ws=wb['Partidos'];H2=[c.value for c in ws[1]];r2=[[c.value for c in r] for r in ws.iter_rows(min_row=2)]
    import datetime
    pl=[r for r in r2 if r[H2.index('Jugador')]=='Pablo' and r[H2.index('Rival')]=='Los Pinos'][0]
    check('Partidos: fecha de Excel, minutos y minuto de los goles',isinstance(pl[0],datetime.datetime) and pl[0].date()==datetime.date(2026,11,8) and pl[H2.index('Minutos')]==50 and pl[H2.index('Minuto de los goles')]=="7', 44'" and pl[H2.index('Capitán')]=='Sí',pl)
    check('Partidos: 9 + 3 filas (no sale el partido sin jugar sin datos?)',len(r2)>=12,len(r2))
    ws=wb['Acciones'];H3=[c.value for c in ws[1]];a=[[c.value for c in r] for r in ws.iter_rows(min_row=2)]
    los=[r for r in a if r[1]=='Los Pinos'];acc=[(r[2],r[4],r[6]) for r in los]
    check('Acciones: goles con minuto',(7,'Gol','Pablo') in acc and (44,'Gol','Pablo') in acc and (18,'Gol del rival','Los Pinos') in acc,acc[:8])
    check('Acciones: robos con su minuto (ordenados)',(5,'Robo','Pablo') in acc and (12,'Robo','Pablo') in acc and (40,'Robo','Pablo') in acc)
    check('Acciones: cambios y tarjetas',(25,'Cambio: sale','Iker') in acc and (25,'Cambio: entra','Nico') in acc and (30,'Amarilla','Álex') in acc)
    check('Acciones: lo puesto a mano sale sin minuto',(None,'Parada','Hugo') in acc and (None,'Asistencia','Dani') in acc)
    mins=[r[2] for r in los if r[2] is not None]
    check('Acciones: en orden de minuto y con su parte',mins==sorted(mins) and [r[3] for r in los if r[2]==40][0]==2 and [r[3] for r in los if r[2]==12][0]==1)
    otros=[r for r in a if r[1]=='CD Río']
    check('sin Directo: los goles salen sin minuto',otros==[] or all(r[2] is None for r in otros) and any(r[4]=='Gol' for r in otros),otros)
    e=[[c.value for c in r] for r in wb['Equipo'].iter_rows(min_row=2)]
    check('Equipo: un partido por fila',len(e)==5 and any(r[1]=='Los Pinos' and r[2]==3 and r[3]==1 and r[4]=='Victoria' and r[9]==5 for r in e),e[:2])
    pg.wait_for_timeout(300)
    with pg.expect_download() as dl: pg.click('#view [data-xl]')
    pg.wait_for_timeout(300);pg.click('#view [data-xl]');pg.wait_for_timeout(300)
    check('la 3ª exportación del mes pide Pro',pg.locator('#infoTitle').inner_text().lower()=='plan pro' and 'exportar a excel' in pg.locator('#infoBody').inner_text().lower())
    pg.click('#closeInfo')
    # Directo: cada dato se guarda con su minuto
    pg.click('[data-tab=partidos]');pg.click('[data-action=live][data-id=m5]');pg.wait_for_selector('.lv-board')
    pg.click('[data-live=start]');pg.wait_for_timeout(400)
    pg.click('.lv-pl [data-lvsp=j2]');pg.click('.lv-pl [data-lvsp=j2]')
    pg.wait_for_function("()=>{let e=JSON.parse(window.__db.futbol_personal_partidos.find(m=>m.id==='m5').participaciones).find(x=>x.id==='j2');return e.st&&e.st.rob===2}",timeout=4000)
    e3=pg.evaluate("JSON.parse(window.__db.futbol_personal_partidos.find(m=>m.id==='m5').participaciones).find(x=>x.id==='j2')")
    check('el Directo guarda el minuto de cada robo',e3.get('stm')=={'rob':[1,1]},e3)
    pg.click('[data-live=undo]')
    pg.wait_for_function("()=>{let e=JSON.parse(window.__db.futbol_personal_partidos.find(m=>m.id==='m5').participaciones).find(x=>x.id==='j2');return e.st&&e.st.rob===1}",timeout=4000)
    e3=pg.evaluate("JSON.parse(window.__db.futbol_personal_partidos.find(m=>m.id==='m5').participaciones).find(x=>x.id==='j2')")
    check('deshacer quita también su minuto',e3.get('stm')=={'rob':[1]},e3)
    pg.click('[data-live=close]');pg.wait_for_timeout(300)
    # nuevo jugador: posiciones de fútbol sala
    pg.click('[data-mode=fs]');pg.click('[data-tab=plantilla]');pg.click('[data-action=add-player]');pg.wait_for_timeout(200)
    ops=pg.locator('#playerForm [name=posicion] option').all_inner_texts()
    check('en fútbol sala: cierre, alas, pívot y universal','Pívot' in ops and 'Cierre' in ops and 'Universal' in ops and 'Lateral derecho' not in ops,ops)
    pg.fill('#playerForm [name=nombre]','Pivote Uno');pg.select_option('#playerForm [name=posicion]','PIV');pg.click('#playerForm button.primary');pg.wait_for_timeout(500)
    nj=pg.evaluate("window.__db.futbol_personal_jugadores.find(x=>x.nombre==='Pivote Uno')")
    check('al crear se guarda la posición',nj and nj.get('posicion')=='PIV' and nj.get('modalidad')=='fs',nj)
    ctx.close()
    # Pro: todos los partidos y exportar sin límite
    ctx,pg=abre(b,pro=True)
    pg.click('[data-ficha=j3] >> nth=0');pg.wait_for_timeout(300)
    body=pg.locator('#infoBody').inner_text()
    check('Pro: la ficha muestra todos los partidos',pg.locator('#infoBody .fi-p').count()==4 and 'CD Río' in body and 'exportaciones' not in body)
    for i in range(3):
        with pg.expect_download() as dl: pg.click('#infoBody [data-xl]')
        pg.wait_for_timeout(200)
    check('Pro: exporta sin límite',pg.locator('#infoTitle').inner_text().lower()=='ficha del jugador',pg.locator('#infoTitle').inner_text())
    # Guía de uso
    pg.click('#closeInfo');pg.click('#acct');pg.click('[data-info=ayuda]');pg.wait_for_timeout(200)
    g=pg.locator('#infoBody').text_content()
    check('la Guía explica la ficha y el Excel','Ficha del jugador' in g and 'Exportar a Excel' in g and '2 exportaciones a Excel al mes' in g,g[-600:])
    ctx.close()
    check('sin errores de JavaScript',not errs,errs[:3])
    b.close()
srv.shutdown()
print(f'\n{sum(res)}/{len(res)} correctas');sys.exit(0 if all(res) else 1)
