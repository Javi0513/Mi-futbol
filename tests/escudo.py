import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json,io
from playwright.sync_api import sync_playwright
from PIL import Image,ImageDraw
from fake2 import FAKE2
# Escudo del club, nombre y foto del entrenador, y árbol del supervisor (supabase-escudo.sql)
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8816),functools.partial(type('Q',(http.server.SimpleHTTPRequestHandler,),{'log_message':lambda *a:None}),directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
def png(w,h,dibuja):
    im=Image.new('RGBA',(w,h),(0,0,0,0));dibuja(ImageDraw.Draw(im));b=io.BytesIO();im.save(b,'PNG');return b.getvalue()
ESCUDO=png(900,1000,lambda d:(d.polygon([(450,20),(880,140),(820,640),(450,980),(80,640),(20,140)],fill=(200,20,40)),d.rectangle([380,140,520,860],fill=(255,255,255))))
FOTO=png(1200,1200,lambda d:(d.rectangle([0,0,1200,1200],fill=(40,120,200)),d.ellipse([350,200,850,700],fill=(240,200,170))))
def dataurl(b):
    import base64;return 'data:image/png;base64,'+base64.b64encode(b).decode()
FOTO_P=dataurl(png(64,64,lambda d:d.ellipse([4,4,60,60],fill=(240,180,40))))
ESC_P=dataurl(png(64,64,lambda d:d.polygon([(32,2),(62,10),(56,44),(32,62),(8,44),(2,10)],fill=(200,20,40))))
CFG=open(os.path.join(APP,'config.js')).read().replace("window.APP_CONFIG = {","window.APP_CONFIG = {noTutorial:true,")
MIEMBROS=[{'id':'u1','email':'ana@x.es','desde':'2026-10-27T10:00:00Z','admin':True,'supervisor':True,'comparte':False,'nombre':None,'foto':None},
          {'id':'u9','email':'luis@x.es','desde':'2026-10-27T11:00:00Z','admin':False,'supervisor':False,'comparte':True,'nombre':'Luis García','foto':FOTO_P},
          {'id':'u8','email':'eva@x.es','desde':'2026-10-27T12:00:00Z','admin':False,'supervisor':False,'comparte':False,'nombre':None,'foto':None}]
ADMIN={'id':'c1','nombre':'CD Granada Norte','escudo':None,'activo':True,'soy_admin':True,'soy_supervisor':True,'comparto':False,'codigo':'K7M2Q9XA4P','plazas':10,'usadas':3,'pagado':True,'miembros':MIEMBROS}
DATOS={'email':'luis@x.es','equipos':[],'jugadores':[{'id':'q1','modalidad':'7','nombre':'Luis Uno','foto':''}],'partidos':[],'entrenamientos':[]}
def abrir(b,club,perfil=True):
    ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block')
    pf={'id':'u1','plan':'pro'}
    if perfil: pf.update(nombre=None,foto=None)
    ctx.add_init_script('window.__seed='+json.dumps({'futbol_personal_jugadores':[],'futbol_personal_partidos':[],'perfiles':[pf]}))
    pg=ctx.new_page()
    pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    pg.on('dialog',lambda d:d.accept())
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE2))
    pg.route('**/config.js*',lambda r:r.fulfill(content_type='application/javascript',body=CFG))
    pg.goto('http://127.0.0.1:8816/index.html')
    pg.evaluate("""a=>{window.__club=a[0];window.__cfg.rpcData={mi_club:()=>window.__club,
      club_datos_entrenador:x=>x.entrenador==='u9'?a[1]:{__error:'NO_COMPARTE'},
      club_escudo:x=>{window.__club.escudo=x.escudo},
      guardar_mi_perfil:x=>{Object.assign(window.__db.perfiles[0],{nombre:x.nombre,foto:x.foto})}}}""",[club,DATOS])
    pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto1');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)')
    pg.wait_for_timeout(400)
    if pg.locator('#info').is_visible(): pg.click('#closeInfo')
    return ctx,pg
body=lambda pg:pg.locator('#infoBody').inner_text()
calls=lambda pg,n:pg.evaluate("n=>window.__calls.filter(c=>c[0]==='rpc'&&c[1]===n)",n)
club_pane=lambda pg:(pg.click('#acct'),pg.wait_for_timeout(150),pg.click('#info [data-info=club]'),pg.wait_for_timeout(200))
with sync_playwright() as p:
    b=p.chromium.launch()
    # 1) Encargado: sube el escudo y sale arriba junto al logo
    ctx,pg=abrir(b,json.loads(json.dumps(ADMIN)))
    check('sin escudo no sale nada junto al logo',not pg.locator('#clubEsc').is_visible())
    club_pane(pg)
    check('encargado: apartado «Escudo del club»','escudo del club' in body(pg).lower() and pg.locator('#escFile').count()==1)
    pg.set_input_files('#escFile',files=[{'name':'escudo.png','mimeType':'image/png','buffer':ESCUDO}]);pg.wait_for_timeout(800)
    c=calls(pg,'club_escudo')
    check('subir el escudo llama a club_escudo con la imagen reducida',len(c)==1 and c[0][2]['escudo'].startswith('data:image/png') and len(c[0][2]['escudo'])<=140000,str(len(c[0][2]['escudo'])) if c else '')
    check('el escudo sale arriba junto al logo',pg.locator('#clubEsc').is_visible() and pg.locator('#clubEsc').get_attribute('src').startswith('data:image/'))
    check('el escudo sale en el apartado del club y en el árbol',pg.locator('#info .club-escudo img').count()==1 and pg.locator('#info .arbol-r img').count()==1)
    sz=pg.evaluate("()=>new Promise(r=>{let i=new Image();i.onload=()=>r([i.width,i.height]);i.src=document.getElementById('clubEsc').src})")
    check('el escudo se guarda pequeño y sin deformar',max(sz)<=256 and abs(sz[0]/sz[1]-0.9)<0.02,str(sz))
    pg.locator('#infoBody').evaluate('e=>e.scrollTop=0');pg.screenshot(path=OUT+'/escudo-encargado.png')
    check('encargado: árbol con cada entrenador',pg.locator('#info .arbol .an').count()==3)
    check('árbol: foto y nombre de quien los puso','Luis García' in body(pg) and pg.locator('#info .an img.avatar').count()==1)
    check('árbol: inicial para quien no tiene foto',pg.locator('#info .an div.avatar').count()==2)
    check('encargado: «Ver» solo en quien comparte',pg.locator('[data-acct=club-ver]').count()==1 and pg.locator('[data-acct=club-ver]').get_attribute('data-id')=='u9')
    check('encargado: sigue pudiendo quitar y hacer supervisor',pg.locator('[data-acct=club-quitar]').count()==2 and pg.locator('[data-acct=club-sup]').count()==2)
    pg.click('[data-acct=club-escudo-quitar]');pg.wait_for_timeout(300)
    check('quitar el escudo llama a club_escudo(null)',calls(pg,'club_escudo')[-1]==['rpc','club_escudo',{'escudo':None}] and not pg.locator('#clubEsc').is_visible())
    # 2) Tocar a un entrenador en el árbol: sus datos, en solo lectura, con su foto arriba
    pg.click('[data-acct=club-ver]');pg.wait_for_timeout(500)
    check('tocar al entrenador pide sus datos',calls(pg,'club_datos_entrenador')==[['rpc','club_datos_entrenador',{'entrenador':'u9'}]])
    vb=pg.locator('#verBar')
    check('barra «Viendo a…» con su nombre y foto',vb.is_visible() and 'Luis García' in vb.inner_text() and 'solo lectura' in vb.inner_text() and vb.locator('img.avatar').count()==1)
    check('sigue en solo lectura',pg.locator('#view [data-action=add-player]:visible').count()==0)
    pg.screenshot(path=OUT+'/escudo-viendo.png')
    ctx.close()
    # 3) Entrenador normal: ve el escudo, pone su nombre y foto, no ve a los demás
    co={'id':'c1','nombre':'CD Granada Norte','escudo':ESC_P,'activo':True,'soy_admin':False,'soy_supervisor':False,'comparto':True}
    ctx,pg=abrir(b,co)
    check('entrenador: ve el escudo de su club arriba',pg.locator('#clubEsc').is_visible())
    cabe=[]
    for w in (320,360,375,390,414):
        pg.set_viewport_size({'width':w,'height':700});pg.wait_for_timeout(80)
        cabe.append(pg.evaluate("()=>{let e=document.querySelector('.word'),b=document.querySelector('.brand').getBoundingClientRect();return e.offsetParent===null||e.getBoundingClientRect().right<=b.right+1}"))
    check('móviles pequeños: el nombre de la app no se corta con el escudo',all(cabe),str(cabe))
    pg.set_viewport_size({'width':375,'height':700});pg.wait_for_timeout(80)
    pg.screenshot(path=OUT+'/escudo-cabecera-375.png',clip={'x':0,'y':0,'width':375,'height':80})
    pg.set_viewport_size({'width':390,'height':844})
    pg.screenshot(path=OUT+'/escudo-cabecera.png',clip={'x':0,'y':0,'width':390,'height':80})
    club_pane(pg);t=body(pg)
    check('entrenador: no puede cambiar el escudo ni ve el árbol',pg.locator('#escFile').count()==0 and pg.locator('#info .arbol').count()==0 and '@' not in t)
    check('entrenador: el club le invita a poner su foto en Mi cuenta','supervisor del club sepa de quién' in t and pg.locator('#info [data-info=account]').count()==1)
    pg.click('#info [data-info=account]');pg.wait_for_timeout(200)
    check('Mi cuenta: foto de perfil arriba, la ve el supervisor',pg.locator('#perfFoto').count()==1 and 'supervisor de tu club' in body(pg))
    pg.fill('#perfNom','Ana López')
    pg.set_input_files('#perfFoto',files=[{'name':'yo.png','mimeType':'image/png','buffer':FOTO}]);pg.wait_for_timeout(800)
    c=calls(pg,'guardar_mi_perfil')
    check('poner foto llama a guardar_mi_perfil con nombre y foto pequeña',len(c)==1 and c[0][2]['nombre']=='Ana López' and c[0][2]['foto'].startswith('data:image/jpeg') and len(c[0][2]['foto'])<=50000,str(len(c[0][2]['foto'])) if c else '')
    check('después se ve su foto y su nombre en Mi cuenta',pg.locator('#info .perfil-c img.avatar').count()==1 and pg.locator('#perfNom').input_value()=='Ana López')
    check('la foto sale en el botón de la cuenta',pg.locator('#acct img').count()==1)
    pg.screenshot(path=OUT+'/escudo-mi-foto.png')
    pg.fill('#perfNom','Ana');pg.click('[data-acct=perfil-guardar]');pg.wait_for_timeout(300)
    check('«Guardar el nombre» conserva la foto',calls(pg,'guardar_mi_perfil')[-1][2]['nombre']=='Ana' and calls(pg,'guardar_mi_perfil')[-1][2]['foto'].startswith('data:image/jpeg'))
    pg.click('[data-acct=perfil-foto-quitar]');pg.wait_for_timeout(300)
    check('quitar la foto',calls(pg,'guardar_mi_perfil')[-1][2]=={'nombre':'Ana','foto':None} and pg.locator('#info .perfil-c img.avatar').count()==0 and pg.locator('#acct img').count()==0 and pg.locator('#acct svg').count()==1)
    ctx.close()
    # 3b) Usuario sin club: también pone su foto de perfil
    ctx,pg=abrir(b,None)
    pg.click('#acct');pg.wait_for_timeout(200)
    check('sin club: Mi cuenta ofrece poner la foto',pg.locator('#perfFoto').count()==1 and 'botón de tu cuenta' in body(pg))
    pg.set_input_files('#perfFoto',files=[{'name':'yo.png','mimeType':'image/png','buffer':FOTO}]);pg.wait_for_timeout(800)
    check('sin club: foto guardada y en el botón de la cuenta',len(calls(pg,'guardar_mi_perfil'))==1 and pg.locator('#acct img').count()==1)
    pg.screenshot(path=OUT+'/foto-perfil-mi-cuenta.png')
    pg.click('#closeInfo');pg.wait_for_timeout(100)
    pg.screenshot(path=OUT+'/foto-perfil-cabecera.png',clip={'x':0,'y':0,'width':390,'height':80})
    ctx.close()
    # 4) Supervisor que no es el encargado: árbol, sin gestión
    sup={'id':'c1','nombre':'CD Granada Norte','escudo':ESC_P,'activo':True,'soy_admin':False,'soy_supervisor':True,'comparto':True,
         'miembros':[dict(MIEMBROS[0],id='u7',email='jefe@x.es'),dict(MIEMBROS[1]),dict(MIEMBROS[2]),{'id':'u1','email':'ana@x.es','admin':False,'supervisor':True,'comparte':True}]}
    ctx,pg=abrir(b,sup);club_pane(pg)
    check('supervisor: árbol sin él mismo',pg.locator('#info .arbol .an').count()==3 and 'ana@x.es' not in body(pg))
    check('supervisor: sin «Quitar» ni «Hacer supervisor»',pg.locator('[data-acct=club-quitar], [data-acct=club-sup]').count()==0)
    pg.locator('#info .arbol').scroll_into_view_if_needed();pg.screenshot(path=OUT+'/escudo-arbol-supervisor.png')
    ctx.close()
    # 5) Servidor sin supabase-escudo.sql: no se ofrece nada nuevo
    old=json.loads(json.dumps(ADMIN));del old['escudo']
    ctx,pg=abrir(b,old,perfil=False);club_pane(pg)
    check('sin el SQL nuevo no sale escudo ni foto',pg.locator('#escFile, #perfFoto').count()==0 and 'Poner mi foto' not in body(pg))
    check('sin el SQL nuevo el árbol funciona',pg.locator('#info .arbol .an').count()==3)
    ctx.close()
    # 6) Textos
    ctx,pg=abrir(b,None)
    pg.click('#acct');pg.click('#info [data-info=ayuda]');pg.wait_for_timeout(200)
    h=pg.locator('#infoBody').inner_html()
    check('la guía de uso explica el escudo y la foto','Escudo del club' in h and 'Tu foto de perfil' in h and 'árbol' in h)
    pg.click('#closeInfo');pg.click('#acct');pg.click('#info [data-info=privacy]');pg.wait_for_timeout(200)
    check('privacidad explica quién ve la foto','solo los ve el supervisor del club' in body(pg) and 'tu foto de perfil' in body(pg))
    ctx.close()
    b.close()
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
sys.exit(0 if all(res) and not errs else 1)
