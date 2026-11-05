import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json,datetime,subprocess
from playwright.sync_api import sync_playwright
# v11.4: límites del plan gratuito (dispositivos, convocatorias, envíos de entreno, vídeos,
# pizarra limpia, pasos, ejercicios) e ilimitado con Pro.
src=open(TESTS+'/entrenos.py',encoding='utf-8').read();FAKE=src.split('FAKE=r"""')[1].split('"""')[0]
FAKE=FAKE.replace("rpc:async()=>({error:null})","rpc:async(n,a)=>{window.__rpcs=(window.__rpcs||[]).concat([n]);return n==='registrar_dispositivo'&&window.__disp?window.__disp(a):{error:null}}")
FAKE=FAKE.replace('order(){return o},','order(){return o},limit(){return o},',1)
assert 'window.__disp' in FAKE and 'limit()' in FAKE
HOY=datetime.date.today().isoformat()
NOM=['Pablo','Iván','Rubén','Dani','Sergio','Álex','Hugo']
def seed(plan,tr=None):
    P=[{'id':f'p{i}','owner_id':'u1','modalidad':'fs','nombre':n,'foto':'','dorsal':i+1} for i,n in enumerate(NOM)]
    return {'futbol_personal_jugadores':P,'futbol_personal_partidos':[],'perfiles':[{'id':'u1','plan':plan}],'entrenamientos':tr or [],
            'dispositivos':[{'owner_id':'u1','id':'dAAAAAAAA1','nombre':'iPhone','visto':HOY},{'owner_id':'u1','id':'dAAAAAAAA2','nombre':'iPad','visto':HOY},{'owner_id':'u1','id':'dAAAAAAAA3','nombre':'Ordenador Windows','visto':HOY}]}
TR=[{'id':f't{i}','owner_id':'u1','modalidad':'fs','fecha':HOY,'hora':'19:30','nota':f'Entreno {i}','asistencia':{},'ejercicios':[{'n':f'E{j}','d':'','t':300} for j in range(3 if i==0 else 0)]} for i in range(4)]
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8833),functools.partial(H,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8833/index.html'
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
VID=os.path.join(OUT,'jugada-prueba.mp4')
if not os.path.exists(VID):
    try:subprocess.run(['ffmpeg','-loglevel','error','-y','-f','lavfi','-i','testsrc=size=320x180:rate=25','-t','2','-pix_fmt','yuv420p',VID],check=True)
    except Exception:open(VID,'wb').write(b'\x00\x00\x00\x18ftypmp42'+b'\x00'*2000)
DISP_LLENO="window.__disp=(a)=>{let L=window.__db.dispositivos.filter(d=>d.owner_id==='u1');if(L.some(d=>d.id===a.p_id))return{data:{ok:true},error:null};if(L.length>=3&&window.__db.perfiles[0].plan!=='pro')return{data:{ok:false,max:3,lista:L},error:null};window.__db.dispositivos.push({owner_id:'u1',id:a.p_id,nombre:a.p_nombre,visto:new Date().toISOString()});return{data:{ok:true},error:null}};"
def nueva(b,sd,extra=''):
    ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block');pg=ctx.new_page()
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' and 'media' not in m.text.lower() else None)
    pg.on('dialog',lambda d:d.accept())
    ctx.route('https://wa.me/**',lambda r:r.fulfill(body='wa'))
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    pg.add_init_script('window.__seed='+json.dumps(sd)+';try{localStorage.setItem("mf_tut_done","1")}catch(e){};'+extra)
    pg.goto(URL);pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto12');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)');pg.wait_for_timeout(500)
    return ctx,pg
def cierra(pg):
    if pg.locator('#info:not(.hidden)').count():pg.click('#closeInfo');pg.wait_for_timeout(100)
def popups(ctx):
    for p2 in ctx.pages[1:]:p2.close()
with sync_playwright() as p:
    b=p.chromium.launch()
    # ---- Dispositivos: 4º dispositivo en plan gratuito
    ctx,pg=nueva(b,seed('gratis'),DISP_LLENO)
    check('4º dispositivo: aviso con la lista',pg.locator('#info:not(.hidden)').count()==1 and 'Ya usas la app en 3 dispositivos' in pg.text_content('#infoTitle') and pg.locator('[data-dsp=quitar]').count()==3)
    check('mientras tanto no carga tus datos',pg.locator('#view .row').count()==0)
    pg.locator('[data-dsp=quitar]').first.click();pg.wait_for_timeout(700)
    ids=pg.evaluate("window.__db.dispositivos.map(d=>d.id)")
    check('cerrar sesión en otro deja entrar en este',pg.locator('#info.hidden').count()==1 and len(ids)==3 and 'dAAAAAAAA1' not in ids,ids)
    cierra(pg);pg.click('[data-mode=fs]');pg.wait_for_timeout(200)
    check('ya ve sus jugadores',pg.locator('#view .row').count()>=len(NOM))
    pg.click('#acct');pg.wait_for_timeout(300)
    check('«Mis dispositivos» en Mi cuenta',pg.locator('[data-dsp-ver]').count()==1)
    pg.click('[data-dsp-ver]');pg.wait_for_timeout(300)
    t=pg.inner_text('#infoBody');check('lista con 3 de 3 y este marcado','3 de 3' in t and '· este' in t,t[:120])
    cierra(pg);ctx.close()
    # ---- Sin el SQL de dispositivos: no limita
    ctx,pg=nueva(b,seed('gratis'))
    check('sin SQL de dispositivos entra sin aviso',pg.locator('#info:not(.hidden)').count()==0 or 'dispositivos' not in pg.text_content('#infoTitle'))
    cierra(pg)
    # ---- Convocatorias: 3 al mes
    pg.click('[data-mode=fs]');pg.click('[data-tab=partidos]');pg.wait_for_timeout(200)
    for i in range(3):
        pg.click('#view [data-cv=abrir]');pg.wait_for_selector('[data-cvt]')
        if i==0:check('convocatoria: aviso de cuántas quedan','te quedan 3 de 3 convocatorias' in pg.inner_text('#infoBody'))
        pg.fill('[data-cvf=rival]',f'Rival {i}');pg.locator('[data-cvp=p0]').check();pg.click('[data-cv=wa]');pg.wait_for_timeout(300);popups(ctx)
        cierra(pg)
    pg.click('#view [data-cv=abrir]');pg.wait_for_selector('[data-cvt]');pg.fill('[data-cvf=rival]','Rival 1');pg.click('[data-cv=wa]');pg.wait_for_timeout(300);popups(ctx)
    check('reenviar la misma convocatoria no gasta otra',pg.locator('[data-cvt]').count()==1)
    pg.fill('[data-cvf=rival]','Rival 9');pg.click('[data-cv=wa]');pg.wait_for_timeout(300)
    check('4ª convocatoria del mes: ventana Pro',pg.text_content('#infoTitle')=='Plan Pro' and '3 convocatorias al mes' in pg.inner_text('#infoBody') and len(ctx.pages)==1)
    cierra(pg)
    # ---- Pizarra limpia y pasos
    pg.click('[data-tab=pizarra]');pg.wait_for_selector('#bcanvas')
    check('«Limpia» lleva la etiqueta PRO',pg.locator('[data-b=clean] .pro-tag').count()==1)
    pg.click('[data-b=clean]');pg.wait_for_timeout(200)
    check('«Limpia» en gratis: ventana Pro y no se limpia',pg.text_content('#infoTitle')=='Plan Pro' and pg.locator('#boardPanel.clean').count()==0)
    cierra(pg)
    pg.click('[data-b=add][data-v=ball]');pg.click('[data-b=addstep]');pg.click('[data-b=addstep]');pg.wait_for_timeout(100)
    check('3 pasos en gratis','Paso 3 / 3' in pg.inner_text('.bst-n'))
    pg.click('[data-b=addstep]');pg.wait_for_timeout(200)
    check('4º paso: ventana Pro','Paso 3 / 3' in pg.inner_text('.bst-n') and pg.text_content('#infoTitle')=='Plan Pro')
    cierra(pg)
    # ---- Vídeos: 2
    pg.click('[data-b=vids]');pg.wait_for_selector('.vj-up')
    for i in range(2):
        pg.set_input_files('[data-vjf]',VID);pg.wait_for_function(f"()=>document.querySelectorAll('.vj-it').length=={i+1}",timeout=5000)
    check('2 vídeos en gratis','2 de 2 vídeos' in pg.inner_text('#infoBody'))
    pg.set_input_files('[data-vjf]',VID);pg.wait_for_timeout(600)
    check('3er vídeo: ventana Pro',pg.text_content('#infoTitle')=='Plan Pro' and 'vídeos de jugadas' in pg.inner_text('#infoBody'))
    cierra(pg);ctx.close()
    # ---- Envíos de entreno: 3 al mes
    ctx,pg=nueva(b,seed('gratis',TR),"localStorage.setItem('mf_entrenos:u1','1');")
    cierra(pg);pg.click('[data-mode=fs]');pg.wait_for_timeout(200);pg.click('#trTab');pg.wait_for_timeout(400)
    btn=pg.locator('[data-tr=enviar]');check('4 entrenos en el día',btn.count()==4,btn.count())
    pg.locator('[data-ej=nuevo][data-id=t0]').click();pg.wait_for_timeout(300)
    check('4º ejercicio en un entreno: ventana Pro',pg.text_content('#infoTitle')=='Plan Pro' and '3 ejercicios' in pg.inner_text('#infoBody'))
    cierra(pg)
    pg.locator('[data-ej=nuevo][data-id=t1]').click();pg.wait_for_selector('#infoBody [data-ejf=n]')
    check('en otro entreno sí puede añadir',pg.text_content('#infoTitle')=='Añadir ejercicio')
    cierra(pg)
    for i in range(3):
        btn.nth(i).click();pg.wait_for_selector('#info:not(.hidden) [data-trx=wa]');pg.click('[data-trx=wa]');pg.wait_for_timeout(300);popups(ctx);cierra(pg)
    btn.nth(3).click();pg.wait_for_selector('#info:not(.hidden) [data-trx=wa]')
    check('aviso: quedan 0 de 3','te quedan 0 de 3 envíos' in pg.inner_text('#infoBody'))
    pg.click('[data-trx=wa]');pg.wait_for_timeout(300)
    check('4º entreno del mes: ventana Pro',pg.text_content('#infoTitle')=='Plan Pro' and len(ctx.pages)==1)
    cierra(pg);ctx.close()
    # ---- Pro: sin límites
    ctx,pg=nueva(b,seed('pro'),DISP_LLENO)
    check('Pro: 4º dispositivo entra sin aviso',pg.locator('#info:not(.hidden)').count()==0 or 'dispositivos' not in pg.text_content('#infoTitle'))
    cierra(pg);pg.click('[data-mode=fs]');pg.click('[data-tab=pizarra]');pg.wait_for_selector('#bcanvas')
    pg.click('[data-b=clean]');pg.wait_for_timeout(200)
    check('Pro: pizarra limpia',pg.locator('#boardPanel.clean').count()==1 and pg.locator('[data-b=clean] .pro-tag').count()==0)
    pg.click('[data-b=add][data-v=ball]')
    for i in range(4):pg.click('[data-b=addstep]')
    check('Pro: más de 3 pasos','Paso 5 / 5' in pg.inner_text('.bst-n'))
    pg.click('[data-tab=partidos]')
    for i in range(4):
        pg.click('#view [data-cv=abrir]');pg.wait_for_selector('[data-cvt]');pg.fill('[data-cvf=rival]',f'R{i}');pg.click('[data-cv=wa]');pg.wait_for_timeout(250);popups(ctx)
        if i<3:cierra(pg)
    check('Pro: 4 convocatorias sin aviso',pg.text_content('#infoTitle')=='Convocatoria' and 'te quedan' not in pg.inner_text('#infoBody'))
    cierra(pg);ctx.close()
    js=open(REPO+'/app.js',encoding='utf-8').read()
    check('Guía de uso explica los límites','<b>3 dispositivos</b>' in js and 'Mis dispositivos' in js)
    check('SQL de dispositivos en el repositorio',os.path.exists(REPO+'/supabase-limites.sql'))
    check('sin errores en la página',not errs,errs[:3])
    b.close()
print(f'{sum(res)}/{len(res)} correctas');sys.exit(0 if all(res) else 1)
