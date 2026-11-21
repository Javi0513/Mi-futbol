import sys,os,re;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json
from playwright.sync_api import sync_playwright
# Grabación desde el anotador (v11.53): el móvil que graba dice cómo está la cámara (directos.cam_est)
# y hace las órdenes del anotador (directos.cam_ord: empezar a grabar, pausar, reanudar).
# Usa el Supabase simulado de anotador.py, con ver_anotador / anotar_camara como en supabase-anotador-grabar.sql.
FAKE=re.search(r'FAKE=r"""(.*?)"""',open(os.path.join(TESTS,'anotador.py'),encoding='utf-8').read(),re.S).group(1)
FAKE=FAKE.replace("actualizado:d.actualizado,ahora:","cam:d.cam_est||'',cam_ord:d.cam_ord||null,actualizado:d.actualizado,ahora:")
FAKE=FAKE.replace("   if(n==='anotar_quitar')","""   if(n==='anotar_camara'){let d=AN(a.codigo);if(!d)return{error:{message:'NO_EXISTE'}};if(!d.cam_est)return{error:{message:'SIN_CAMARA'}};
     d.cam_ord={a:a.accion,n:((d.cam_ord&&d.cam_ord.n)||0)+1,at:new Date().toISOString()};d.actualizado=NOW();return{data:VA(d),error:null}}
   if(n==='anotar_quitar')""")
P=[{'id':f'p{i}','owner_id':'u1','modalidad':'fs','nombre':f'J{i}','dorsal':str(i+1),'foto':'','created_at':''} for i in range(8)]
PART=[{'id':f'p{i}','nombre':f'J{i}','minutes':0,'goals':0,'starter':i<5} for i in range(8)]
SEED={'futbol_personal_jugadores':P,'futbol_personal_partidos':[{'id':'m1','owner_id':'u1','modalidad':'fs','fecha':'2026-11-08','rival':'Los Pinos','participaciones':json.dumps(PART),'alineacion':'{}','created_at':''}],'perfiles':[{'id':'u1','plan':'gratis'}]}
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8836),functools.partial(H,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8836/index.html'
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
def page(b,seed):
    pg=b.new_context(viewport={'width':390,'height':844},service_workers='block',permissions=['camera','microphone']).new_page()
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)))
    pg.on('dialog',lambda d:d.accept())
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    pg.add_init_script('window.__seed='+json.dumps(seed)+';')
    return pg
D=lambda pg,js:pg.evaluate('(()=>{let d=(window.__db.directos||[])[0];return '+js+'})()')
wait=lambda pg,js,t=9000:pg.wait_for_function('()=>{let d=(window.__db.directos||[])[0];return '+js+'}',timeout=t)
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required'])
    pg=page(b,SEED)
    pg.goto(URL);pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto12');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)');pg.wait_for_timeout(200)
    pg.click('[data-mode="fs"]') if pg.locator('[data-mode="fs"]').count() else None
    pg.click('[data-tab=partidos]')
    pg.click('[data-action=live][data-id=m1]');pg.wait_for_selector('.lv-board')
    pg.click('[data-live=anon]');pg.wait_for_selector('#anUrl')
    code=D(pg,'d.anotador')
    check('sin cámara abierta no hay estado de cámara',not D(pg,'d.cam_est'))
    # Página del anotador antes de abrir la cámara
    an=page(b,pg.evaluate('window.__db'));an.goto(URL+'?anotar='+code);an.wait_for_selector('#anData .lv-board')
    check('el anotador ve el apartado Grabación y que la cámara no está abierta','grabación' in an.locator('.an-cam').inner_text().lower() and 'no está abierta' in an.locator('.an-cam').inner_text() and an.locator('[data-anc]').count()==0)
    # El entrenador abre la cámara en su móvil
    pg.click('[data-live=cam]');pg.wait_for_function("()=>document.querySelector('.cam canvas')&&document.querySelector('.cam canvas').width>0",timeout=6000)
    wait(pg,"d.cam_est==='lista'")
    check('al abrir la cámara se avisa al anotador: «lista»',True)
    # El anotador (su base de datos es la del entrenador en esta prueba: se copia lo que haga cada uno)
    an.evaluate('d=>{window.__db.directos=d}',pg.evaluate('window.__db.directos'))
    an.wait_for_selector('#anData [data-anc=rec]',timeout=9000)
    check('el anotador ve «● Empezar a grabar»',an.locator('[data-anc=rec]').count()==1 and 'sin grabar' in an.locator('.an-cam').inner_text())
    an.screenshot(path=OUT+'/anograb_lista.png',full_page=True)
    an.click('[data-anc=rec]');an.wait_for_timeout(300)
    ord1=an.evaluate('window.__db.directos[0].cam_ord')
    check('pulsar manda la orden al servidor',ord1 and ord1['a']=='rec' and ord1['n']==1,ord1)
    check('y dice que el móvil que graba lo hace en unos segundos','unos segundos' in an.locator('.message').inner_text() and an.locator('[data-anc=rec][disabled]').count()==1)
    an.screenshot(path=OUT+'/anograb_enviada.png',full_page=True)
    # La orden llega al móvil que graba
    pg.evaluate('o=>{let d=window.__db.directos[0];d.cam_ord=o;d.actualizado=new Date(Date.now()+5e6).toISOString()}',ord1)
    pg.wait_for_selector('.cam [data-cam=pause]',timeout=9000)
    check('el móvil que graba empieza a grabar solo',pg.locator('.cam [data-cam=stop]').count()==1)
    wait(pg,"d.cam_est==='rec'")
    check('y el anotador lo ve grabando',True)
    pg.wait_for_timeout(1500)
    o2={'a':'pause','n':2,'at':pg.evaluate('new Date().toISOString()')}
    pg.evaluate('o=>{let d=window.__db.directos[0];d.cam_ord=o;d.actualizado=new Date(Date.now()+6e6).toISOString()}',o2)
    pg.wait_for_selector('.cam [data-cam=resume]',timeout=9000)
    check('«Pausar» desde el anotador pausa la grabación',pg.evaluate("document.querySelector('[data-camt]').textContent.startsWith('⏸')"))
    wait(pg,"d.cam_est==='pausa'")
    t1=pg.locator('[data-camt]').inner_text();pg.wait_for_timeout(2200);t2=pg.locator('[data-camt]').inner_text()
    check('en pausa el tiempo no corre',t1==t2,(t1,t2))
    pg.screenshot(path=OUT+'/anograb_pausa_movil.png')
    # El anotador ve la pausa y reanuda
    an.evaluate('d=>{window.__db.directos=d}',pg.evaluate('window.__db.directos'));an.wait_for_selector('#anData [data-anc=resume]',timeout=9000)
    check('el anotador ve «Grabación en pausa» y «▶ Reanudar grabación»','en pausa' in an.locator('.an-cam').inner_text())
    an.screenshot(path=OUT+'/anograb_pausa.png',full_page=True)
    o3={'a':'resume','n':3,'at':pg.evaluate('new Date().toISOString()')}
    pg.evaluate('o=>{let d=window.__db.directos[0];d.cam_ord=o;d.actualizado=new Date(Date.now()+7e6).toISOString()}',o3)
    pg.wait_for_selector('.cam [data-cam=pause]',timeout=9000);wait(pg,"d.cam_est==='rec'")
    check('«Reanudar» desde el anotador sigue grabando',True)
    # Una orden repetida o vieja no hace nada
    pg.evaluate('o=>{let d=window.__db.directos[0];d.cam_ord=o;d.actualizado=new Date(Date.now()+8e6).toISOString()}',{'a':'pause','n':2,'at':'2026-01-01T00:00:00Z'})
    pg.wait_for_timeout(5000)
    check('una orden repetida o antigua no hace nada',pg.locator('.cam [data-cam=pause]').count()==1)
    # En el propio móvil también hay Pausar/Reanudar
    pg.click('.cam [data-cam=pause]');pg.wait_for_selector('.cam [data-cam=resume]')
    pg.click('.cam [data-cam=resume]');pg.wait_for_selector('.cam [data-cam=pause]')
    check('el móvil que graba también tiene «⏸ Pausar» y «▶ Reanudar»',True)
    # v11.54: el anotador también para la grabación
    pg.evaluate('o=>{let d=window.__db.directos[0];d.cam_ord=o;d.actualizado=new Date(Date.now()+9e6).toISOString()}',{'a':'stop','n':3+1,'at':pg.evaluate('new Date().toISOString()')})
    pg.wait_for_selector('.cam [data-cam=save]',timeout=9000)
    check('«Parar grabación» desde el anotador para y deja el vídeo listo para guardar en este móvil','anotador ha parado' in pg.locator('.message').inner_text())
    wait(pg,"d.cam_est==='listo'")
    check('al parar, el anotador sabe que hay un vídeo sin guardar',True)
    pg.click('.cam [data-cam=close]');wait(pg,"d.cam_est===null")
    check('al cerrar la cámara se quita el estado',True)
    # v11.54: iPhone: «Guardar en Fotos» (compartir) es el principal; la descarga no da el vídeo por guardado
    ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block',permissions=['camera','microphone'],user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 18_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1')
    ip=ctx.new_page();ip.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)));ip.on('dialog',lambda d:(errs.append('DIALOG '+d.message) if 'Archivos' not in d.message else None,d.dismiss()))
    ip.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    ip.add_init_script('window.__seed='+json.dumps(SEED)+';navigator.canShare=()=>true;navigator.share=async(o)=>{window.__shared=o.files[0].name};')
    ip.goto(URL);ip.fill('input[name=email]','ana@x.es');ip.fill('input[name=password]','secreto12');ip.click('[data-auth=login]');ip.wait_for_selector('#app:not(.hidden)');ip.wait_for_timeout(200)
    ip.click('[data-mode="fs"]') if ip.locator('[data-mode="fs"]').count() else None
    ip.click('[data-tab=partidos]');ip.click('[data-action=live][data-id=m1]');ip.wait_for_selector('.lv-board')
    ip.click('[data-live=cam]');ip.wait_for_function("()=>document.querySelector('.cam canvas')&&document.querySelector('.cam canvas').width>0",timeout=6000)
    ip.click('.cam [data-cam=rec]');ip.wait_for_timeout(1500);ip.click('.cam [data-cam=stop]');ip.wait_for_selector('.cam [data-cam=share]',timeout=6000)
    check('iPhone: el botón principal es «Guardar en Fotos»','guardar en fotos' in ip.locator('.cam .primary[data-cam=share]').inner_text().lower() and 'archivos' in ip.locator('.cam [data-cam=save]').inner_text().lower())
    check('iPhone: explica que «Guardar en Archivos» va a Archivos › Descargas','Archivos › Descargas' in ip.locator('.cam-fin').inner_text())
    ip.screenshot(path=OUT+'/anograb_iphone_guardar.png')
    ip.click('.cam [data-cam=save]');ip.wait_for_timeout(300)
    check('iPhone: descargar no da el vídeo por guardado (pregunta antes de grabar otro)',ip.evaluate('1') and 'no en Fotos' in ip.locator('.message').inner_text())
    ip.click('.cam [data-cam=again]');ip.wait_for_timeout(200)
    check('…y si dice que no lo ve en Archivos, el vídeo no se pierde',ip.locator('.cam [data-cam=share]').count()==1)
    ip.click('.cam [data-cam=share]');ip.wait_for_timeout(400)
    check('iPhone: «Guardar en Fotos» abre compartir con el vídeo',(ip.evaluate('window.__shared') or '').startswith('partido-') and 'Ya está en Fotos' in ip.locator('.cam-fin').inner_text())
    ctx.close()
    # Sin el SQL nuevo: la app no se rompe y no insiste
    an2=page(b,SEED);an2.goto(URL+'?anotar=nada');an2.wait_for_timeout(800)
    check('sin anotador válido no sale la grabación',an2.locator('.an-cam').count()==0)
    b.close()
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
