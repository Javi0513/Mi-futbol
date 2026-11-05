import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json,datetime,subprocess
from playwright.sync_api import sync_playwright
# v11.5: enlace del equipo (página de los jugadores con «Voy» / «No puedo ir») y «Mis jugadas».
src=open(TESTS+'/entrenos.py',encoding='utf-8').read();FAKE=src.split('FAKE=r"""')[1].split('"""')[0]
FAKE=FAKE.replace('order(){return o},','order(){return o},limit(){return o},',1)
FAKE=FAKE.replace("let r=CP(payload);","let r=CP(payload);if(t==='espacios'&&!r.id)r.id='1b2c3d4e-0000-4000-8000-'+String(Date.now()).slice(-12).padStart(12,'0');",1)
FAKE=FAKE.replace("rpc:async()=>({error:null})","""rpc:async(n,a)=>{let D=window.__db;
  if(n==='ver_espacio'){let e=(D.espacios||[]).find(x=>x.id===a.codigo);if(!e)return{data:null,error:null};
    return{data:CP({datos:e.datos,actualizado:new Date().toISOString(),respuestas:(D.espacio_respuestas||[]).filter(r=>r.espacio_id===e.id).map(r=>({tipo:r.tipo,ref:r.ref,j:r.jugador_id,estado:r.estado}))}),error:null}}
  if(n==='responder_espacio'){D.espacio_respuestas=(D.espacio_respuestas||[]).filter(r=>!(r.espacio_id===a.codigo&&r.tipo===a.p_tipo&&r.ref===a.p_ref&&r.jugador_id===a.p_jugador));
    D.espacio_respuestas.push({espacio_id:a.codigo,tipo:a.p_tipo,ref:a.p_ref,jugador_id:a.p_jugador,estado:a.p_estado,motivo:a.p_motivo});return{data:{ok:true},error:null}}
  return{error:null}},
 storage:{from:()=>({upload:async(p)=>{window.__up=(window.__up||[]).concat([p]);return{data:{path:p},error:null}},getPublicUrl:(p)=>({data:{publicUrl:'http://127.0.0.1:8853/v/'+p}}),remove:async(L)=>{window.__rm=(window.__rm||[]).concat(L);return{error:null}}})}""")
assert 'limit()' in FAKE and 'ver_espacio' in FAKE and "t==='espacios'" in FAKE
HOY=datetime.date.today().isoformat()
NOM=['Pablo','Iván','Rubén','Dani','Sergio','Álex','Hugo']
def seed(plan):
    P=[{'id':f'p{i}','owner_id':'u1','modalidad':'fs','nombre':n,'foto':'','dorsal':i+1} for i,n in enumerate(NOM)]
    T=[{'id':f't{i}','owner_id':'u1','modalidad':'fs','fecha':HOY,'hora':f'1{i}:00','nota':f'Trabajo {i}','asistencia':{},'ejercicios':[{'n':'Rondo 4x1','d':'Dos toques','t':600}] if i==0 else []} for i in range(4)]
    return {'futbol_personal_jugadores':P,'futbol_personal_partidos':[],'perfiles':[{'id':'u1','plan':plan}],'entrenamientos':T}
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8853),functools.partial(H,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8853/index.html'
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
VID=os.path.join(OUT,'jugada-prueba.mp4')
if not os.path.exists(VID):
    try:subprocess.run(['ffmpeg','-loglevel','error','-y','-f','lavfi','-i','testsrc=size=320x180:rate=25','-t','2','-pix_fmt','yuv420p',VID],check=True)
    except Exception:open(VID,'wb').write(b'\x00\x00\x00\x18ftypmp42'+b'\x00'*2000)
RESP={'v':''}
def ctxpage(b,w=390,h=844):
    ctx=b.new_context(viewport={'width':w,'height':h},service_workers='block');pg=ctx.new_page()
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' and 'media' not in m.text.lower() and '/v/' not in m.text and '404' not in m.text else None)
    pg.on('dialog',lambda d:d.accept(RESP['v']) if d.type=='prompt' and RESP['v'] else d.accept())
    ctx.route('https://wa.me/**',lambda r:r.fulfill(body='wa'))
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    return ctx,pg
def entra(b,sd):
    ctx,pg=ctxpage(b)
    pg.add_init_script('window.__seed='+json.dumps(sd)+';try{localStorage.setItem("mf_tut_done","1")}catch(e){};')
    pg.goto(URL);pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto12');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)');pg.wait_for_timeout(500)
    if pg.locator('#info:not(.hidden)').count():pg.click('#closeInfo')
    pg.click('[data-mode="fs"]');pg.wait_for_timeout(200)
    return ctx,pg
def cierra(pg):
    if pg.locator('#info:not(.hidden)').count():pg.click('#closeInfo');pg.wait_for_timeout(100)
with sync_playwright() as p:
    b=p.chromium.launch()
    # ================= Entrenador, plan gratuito =================
    ctx,pg=entra(b,seed('gratis'))
    check('botón «Enlace» junto a los equipos',pg.locator('#teams [data-esp=abrir]').count()==1)
    pg.click('#teams [data-esp=abrir]');pg.wait_for_selector('#info:not(.hidden) [data-esp=crear]')
    check('explica qué ven los jugadores','sin crearse cuenta' in pg.inner_text('#infoBody') and 'No puedo ir' in pg.inner_text('#infoBody'))
    pg.click('[data-esp=crear]');pg.wait_for_selector('#info:not(.hidden) .esp-url');pg.wait_for_timeout(300)
    E=pg.evaluate("window.__db.espacios");eid=E[0]['id'] if E else ''
    check('enlace creado para el equipo',len(E)==1 and E[0]['modalidad']=='fs' and '?equipo='+eid in pg.input_value('.esp-url'),(E,pg.input_value('.esp-url')))
    d=E[0].get('datos') or {}
    check('resumen subido: 7 jugadores con dorsal',len(d.get('jugadores',[]))==7 and {'id':'p0','n':'Pablo','d':'1'} in d['jugadores'],d.get('jugadores',[])[:1])
    check('gratis: solo 2 próximos entrenos',[t['id'] for t in d.get('entrenos',[])]==['t0','t1'],d.get('entrenos'))
    check('entreno con lo que se trabaja y ejercicios',d['entrenos'][0]['nota']=='Trabajo 0' and d['entrenos'][0]['ej'][0]['n']=='Rondo 4x1')
    wa=pg.get_attribute('#infoBody a.primary','href') or ''
    check('enviar el enlace por WhatsApp','wa.me/?text=' in wa and 'equipo%3D'+eid in wa)
    # vídeos
    pg.set_input_files('[data-espf]',VID);pg.wait_for_timeout(700)
    pg.set_input_files('[data-espf]',VID);pg.wait_for_timeout(700)
    v=pg.evaluate("window.__db.espacios[0].datos.videos")
    check('2 vídeos compartidos y subidos a su carpeta',len(v)==2 and all(x['id'].startswith('u1/'+eid+'/') for x in v) and len(pg.evaluate("window.__up"))==2)
    check('la lista de vídeos sale en el enlace',pg.locator('#infoBody .vj-it').count()==2)
    pg.set_input_files('[data-espf]',VID);pg.wait_for_timeout(400)
    check('3er vídeo en gratis: ventana Pro',pg.text_content('#infoTitle')=='Plan Pro' and '2 vídeos de jugadas' in pg.inner_text('#infoBody') and len(pg.evaluate("window.__up"))==2)
    cierra(pg)
    # convocatoria
    pg.click('[data-tab=partidos]');pg.click('#view [data-cv=abrir]');pg.wait_for_selector('[data-cvt]')
    pg.fill('[data-cvf=rival]','CD Alhambra');pg.fill('[data-cvf=lugar]','Pabellón Municipal');pg.fill('[data-cvf=cita]','10:15')
    for i in range(6):pg.locator(f'[data-cvp=p{i}]').check()
    cierra(pg);pg.wait_for_timeout(1900)
    pt=pg.evaluate("window.__db.espacios[0].datos.partido")
    check('la convocatoria se sube sola al enlace',pt and pt['rival']=='CD Alhambra' and pt['cita']=='10:15' and len(pt['conv'])==6 and pt['ref']==pt['fecha'],pt)
    DB=pg.evaluate("window.__db")
    # ================= Página del jugador =================
    jctx,jp=ctxpage(b)
    jp.add_init_script('window.__seed='+json.dumps(DB)+';')
    jp.goto(URL+'?equipo='+eid);jp.wait_for_selector('#eqData .eq-quien')
    check('jugador: sin cuenta, no sale el login',jp.locator('#login.hidden').count()==1 and jp.locator('#app.hidden').count()==1)
    check('jugador: elige su nombre entre los 7',jp.locator('[data-eqyo]').count()==8 and 'Pablo' in jp.text_content('.eq-quien'))
    jp.click('[data-eqyo=p0]');jp.wait_for_timeout(200)
    t=jp.inner_text('#eqData')
    check('jugador: ve el partido, citación y lugar','vs CD Alhambra' in t and '10:15' in t and 'Pabellón Municipal' in t and 'Estás convocado' in t,t[:200])
    check('jugador: ve 2 entrenos con lo que se trabaja','Trabajo 0' in t and 'Trabajo 1' in t and 'Trabajo 2' not in t and 'Rondo 4x1' in t)
    check('jugador: ve los 2 vídeos',jp.locator('.eq-vid video').count()==2)
    RESP['v']='Lesionado'
    jp.locator('[data-eqr=no][data-t=entreno][data-ref=t0]').click();jp.wait_for_timeout(500)
    R=jp.evaluate("window.__db.espacio_respuestas")
    check('«No puedo ir» con motivo queda registrado',any(r['ref']=='t0' and r['estado']=='no' and r['motivo']=='Lesionado' and r['jugador_id']=='p0' for r in R),R)
    check('jugador: ve que ha avisado','Has avisado de que no puedes ir' in jp.inner_text('#eqData'))
    RESP['v']=''
    jp.locator('[data-eqr=voy][data-t=partido]').click();jp.wait_for_timeout(500)
    R=jp.evaluate("window.__db.espacio_respuestas")
    check('«Voy» al partido registrado',any(r['tipo']=='partido' and r['estado']=='voy' for r in R))
    jp.reload();jp.wait_for_selector('#eqData .eq-hola')
    check('recuerda quién es al volver a entrar','Pablo' in jp.inner_text('.eq-hola'))
    jp.click('.eq-hola [data-eqyo]');jp.wait_for_timeout(200)
    check('«No soy yo» vuelve a la lista',jp.locator('.eq-quien').count()==1)
    jp.goto(URL+'?equipo=00000000-0000-4000-8000-000000000000');jp.wait_for_timeout(600)
    check('enlace que no existe: aviso','Enlace no disponible' in jp.text_content('#eqData'))
    jctx.close()
    # ================= El entrenador ve los avisos =================
    pg.evaluate("R=>{window.__db.espacio_respuestas=R}",R)
    pg.click('#trTab');pg.wait_for_timeout(600)
    t=pg.inner_text('#view')
    check('pasar lista: junto al jugador «Avisó: no puede · Lesionado»','Avisó: no puede · Lesionado' in t,t[:300])
    check('resumen en el entreno','Desde el enlace del equipo' in t)
    pg.click('[data-tab=partidos]');pg.wait_for_timeout(300)
    check('tarjeta de la convocatoria: cuántos van','✓ 1 va' in pg.inner_text('#view .cv-card'))
    pg.click('#teams [data-esp=abrir]');pg.wait_for_selector('#info:not(.hidden) .esp-av')
    check('en el enlace: quién no puede y por qué','Pablo · Lesionado' in pg.inner_text('.esp-av'))
    cierra(pg)
    # ================= Mis jugadas (gratis: 3) =================
    pg.click('[data-tab=pizarra]');pg.wait_for_selector('#bcanvas')
    check('pizarra: botón «Guardar»',pg.locator('[data-b=jg]').count()==1 and 'Guardar' in pg.text_content('[data-b=jg]'))
    pg.click('[data-b=jg]');pg.wait_for_selector('[data-jg=guardar]');pg.click('[data-jg=guardar]');pg.wait_for_timeout(200);cierra(pg)
    check('pizarra vacía: no guarda',len(pg.evaluate("window.__db.jugadas_guardadas||[]"))==0)
    pg.click('[data-b=add][data-v=ball]');pg.click('[data-b=addstep]');pg.wait_for_timeout(100)
    for i in range(3):
        RESP['v']=f'Jugada {i}';pg.click('[data-b=jg]');pg.wait_for_selector('[data-jg=guardar]');pg.click('[data-jg=guardar]');pg.wait_for_timeout(300);cierra(pg)
    J=pg.evaluate("window.__db.jugadas_guardadas")
    check('3 jugadas guardadas con sus pasos',len(J)==3 and J[0]['datos']['steps']==2 and J[0]['nombre']=='Jugada 0' and len(J[0]['datos']['items'])==1)
    RESP['v']='Jugada 9';pg.click('[data-b=jg]');pg.wait_for_selector('[data-jg=guardar]');pg.click('[data-jg=guardar]');pg.wait_for_timeout(300)
    check('4ª jugada en gratis: ventana Pro',pg.text_content('#infoTitle')=='Plan Pro' and '3 jugadas' in pg.inner_text('#infoBody') and len(pg.evaluate("window.__db.jugadas_guardadas"))==3)
    cierra(pg)
    pg.click('[data-b=clear]');pg.wait_for_timeout(200)
    pg.click('[data-b=jg]');pg.wait_for_selector('#info:not(.hidden) [data-jg=abrir]')
    check('«Mis jugadas» lista las 3',pg.locator('[data-jg=abrir]').count()==3 and '3 de 3' in pg.inner_text('#infoBody'))
    pg.locator('[data-jg=abrir]').first.click();pg.wait_for_timeout(300)
    check('abrir una jugada la pone en la pizarra',pg.evaluate("JSON.parse(localStorage.getItem('mf_pizarra_v1')).fs.items.length")==1 and 'Paso 1 / 2' in pg.inner_text('.bst-n'))
    RESP['v']='';ctx.close()
    # ================= Pro =================
    ctx,pg=entra(b,seed('pro'))
    pg.click('#teams [data-esp=abrir]');pg.wait_for_selector('[data-esp=crear]');pg.click('[data-esp=crear]');pg.wait_for_selector('.esp-url');pg.wait_for_timeout(300)
    check('Pro: todos los entrenos en el enlace',len(pg.evaluate("window.__db.espacios[0].datos.entrenos"))==4 and 'Plan gratuito' not in pg.inner_text('#infoBody'))
    for i in range(3):pg.set_input_files('[data-espf]',VID);pg.wait_for_timeout(600)
    check('Pro: 3 vídeos sin aviso',len(pg.evaluate("window.__db.espacios[0].datos.videos"))==3)
    pg.locator('[data-esp=quitar]').first.click();pg.wait_for_timeout(500)
    check('quitar un vídeo lo borra del almacén',len(pg.evaluate("window.__db.espacios[0].datos.videos"))==2 and len(pg.evaluate("window.__rm"))==1)
    pg.click('[data-esp=borrar]');pg.wait_for_timeout(500)
    check('desactivar el enlace lo borra con sus vídeos',len(pg.evaluate("window.__db.espacios"))==0 and len(pg.evaluate("window.__rm"))==3,(pg.evaluate("window.__db.espacios"),pg.evaluate("window.__rm")))
    cierra(pg)
    pg.click('[data-tab=pizarra]');pg.wait_for_selector('#bcanvas');pg.click('[data-b=add][data-v=ball]')
    for i in range(4):
        RESP['v']=f'P{i}';pg.click('[data-b=jg]');pg.wait_for_selector('[data-jg=guardar]');pg.click('[data-jg=guardar]');pg.wait_for_timeout(250);cierra(pg)
    check('Pro: 4 jugadas guardadas sin aviso',len(pg.evaluate("window.__db.jugadas_guardadas"))==4)
    ctx.close()
    # ================= Vídeos caducados (30 días) =================
    VIEJO=(datetime.date.today()-datetime.timedelta(days=31)).isoformat()
    sd=seed('gratis');EID='1b2c3d4e-0000-4000-8000-000000000001'
    sd['espacios']=[{'id':EID,'owner_id':'u1','modalidad':'fs','equipo_id':'','datos':{'v':1,'equipo':'Mi equipo','modalidad':'fs','jugadores':[],'partido':None,'entrenos':[],'videos':[{'id':'u1/'+EID+'/viejo.mp4','n':'Viejo','url':'x','f':VIEJO,'size':10},{'id':'u1/'+EID+'/nuevo.mp4','n':'Nuevo','url':'x','f':HOY,'size':10}]}}]
    ctx,pg=entra(b,sd);pg.wait_for_timeout(500)
    V=pg.evaluate("window.__db.espacios[0].datos.videos")
    check('vídeo de hace más de 30 días: se borra solo',pg.evaluate("window.__rm||[]")==['u1/'+EID+'/viejo.mp4'] and [v['n'] for v in V]==['Nuevo'],V)
    pg.click('#teams [data-esp=abrir]');pg.wait_for_selector('.esp-url')
    check('el entrenador ve cuándo se borra','se borra el' in pg.inner_text('#infoBody'))
    ctx.close()
    js=open(REPO+'/app.js',encoding='utf-8').read()
    check('Guía de uso explica el enlace del equipo','t: "Enlace del equipo"' in js and 'Mis jugadas' in js)
    check('SQL del enlace en el repositorio',os.path.exists(REPO+'/supabase-equipo.sql'))
    check('sin errores en la página',not errs,errs[:3])
    b.close()
print(f'{sum(res)}/{len(res)} correctas');sys.exit(0 if all(res) else 1)
