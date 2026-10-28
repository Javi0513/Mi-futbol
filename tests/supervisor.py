import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json
from playwright.sync_api import sync_playwright
from fake2 import FAKE2
# Supervisor del club: consentimiento del entrenador, nombrar supervisores y ver a un entrenador en solo lectura
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8815),functools.partial(type('Q',(http.server.SimpleHTTPRequestHandler,),{'log_message':lambda *a:None}),directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
CFG=open(os.path.join(APP,'config.js')).read().replace("window.APP_CONFIG = {","window.APP_CONFIG = {noTutorial:true,")
MIOS=[{'id':'mio1','owner_id':'u1','modalidad':'7','nombre':'Mio Uno','foto':''}]
MIEMBROS=[{'id':'u1','email':'ana@x.es','desde':'2026-10-27T10:00:00Z','admin':True,'supervisor':True,'comparte':False},
          {'id':'u9','email':'luis@x.es','desde':'2026-10-27T11:00:00Z','admin':False,'supervisor':False,'comparte':True},
          {'id':'u8','email':'eva@x.es','desde':'2026-10-27T12:00:00Z','admin':False,'supervisor':False,'comparte':False}]
ADMIN={'id':'c1','nombre':'CD Granada Norte','activo':True,'soy_admin':True,'soy_supervisor':True,'comparto':False,'codigo':'K7M2Q9XA4P','plazas':10,'usadas':3,'pagado':True,'miembros':MIEMBROS}
PART=[{'id':'q1','nombre':'Luis Uno','minutes':50,'goals':2,'starter':True}]
DATOS={'email':'luis@x.es','equipos':[{'id':'e1','modalidad':'7','nombre':'Alevín A'}],
       'jugadores':[{'id':'q1','modalidad':'7','equipo_id':'e1','nombre':'Luis Uno','foto':''},{'id':'q2','modalidad':'7','equipo_id':'e1','nombre':'Luis Dos','foto':''}],
       'partidos':[{'id':'m9','modalidad':'7','equipo_id':'e1','fecha':'2026-10-18','rival':'Los Pinos','participaciones':json.dumps(PART),'alineacion':'{"formation":"3-2-1","slots":{"0":"q1"}}'}],
       'entrenamientos':[{'id':'t1','modalidad':'7','equipo_id':'e1','fecha':'2026-10-20','asistencia':{'q1':'si'}}]}
def abrir(b,club,plan='pro'):
    ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block')
    ctx.add_init_script('window.__seed='+json.dumps({'futbol_personal_jugadores':json.loads(json.dumps(MIOS)),'futbol_personal_partidos':[],'perfiles':[{'id':'u1','plan':plan}]}))
    pg=ctx.new_page()
    pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    pg.on('dialog',lambda d:d.accept())
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE2))
    pg.route('**/config.js*',lambda r:r.fulfill(content_type='application/javascript',body=CFG))
    pg.goto('http://127.0.0.1:8815/index.html')
    pg.evaluate("a=>{window.__club=a[0];window.__datos=a[1];window.__cfg.rpcData={mi_club:()=>window.__club,club_datos_entrenador:x=>x.entrenador==='u9'?window.__datos:{__error:'NO_COMPARTE'}}}",[club,DATOS])
    pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto1');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)')
    pg.wait_for_timeout(400)
    if pg.locator('#info').is_visible(): pg.click('#closeInfo')
    return ctx,pg
body=lambda pg:pg.locator('#infoBody').inner_text()
calls=lambda pg,n:pg.evaluate("n=>window.__calls.filter(c=>c[0]==='rpc'&&c[1]===n)",n)
club_pane=lambda pg:(pg.click('#acct'),pg.wait_for_timeout(150),pg.click('#info [data-info=club]'),pg.wait_for_timeout(200))
with sync_playwright() as p:
    b=p.chromium.launch()
    # 1) Entrenador que aún no comparte: se le explica y puede aceptar
    ctx,pg=abrir(b,{'id':'c1','nombre':'CD Granada Norte','activo':True,'soy_admin':False,'soy_supervisor':False,'comparto':False})
    club_pane(pg);t=body(pg)
    check('entrenador: se le explica el supervisor','supervisor del club' in t.lower() and 'no compartes tus datos' in t and 'contraseña' in t)
    check('entrenador: no ve lista de entrenadores',pg.locator('[data-acct=club-ver]').count()==0 and '@' not in t)
    pg.evaluate("()=>{window.__cfg.rpcData.club_compartir=a=>{window.__club.comparto=!!a.si}}")
    pg.click('[data-acct=club-compartir]');pg.wait_for_timeout(300)
    check('aceptar llama a club_compartir(true)',calls(pg,'club_compartir')==[['rpc','club_compartir',{'si':True}]])
    check('después puede dejar de compartir',pg.locator('[data-acct=club-nocompartir]').count()==1 and 'Compartes tus datos' in body(pg))
    pg.click('[data-acct=club-nocompartir]');pg.wait_for_timeout(300)
    check('dejar de compartir llama a club_compartir(false)',calls(pg,'club_compartir')[-1]==['rpc','club_compartir',{'si':False}])
    ctx.close()
    # 2) Servidor sin el SQL nuevo: no aparece nada del supervisor
    ctx,pg=abrir(b,{'id':'c1','nombre':'CD Granada Norte','activo':True,'soy_admin':False})
    club_pane(pg)
    check('sin el SQL nuevo no sale el bloque del supervisor','Supervisor del club' not in body(pg) and pg.locator('[data-acct=club-salir]').count()==1)
    ctx.close()
    # 3) Encargado: «Ver» solo en quien comparte, y puede nombrar supervisores
    ctx,pg=abrir(b,ADMIN);club_pane(pg);t=body(pg)
    ver=pg.locator('[data-acct=club-ver]')
    check('encargado: «Ver» solo para quien comparte',ver.count()==1 and ver.get_attribute('data-id')=='u9')
    check('encargado: avisa de quien aún no comparte','eva@x.es' in t and 'Aún no comparte' in t)
    sup=pg.locator('[data-acct=club-sup]')
    check('encargado: «Hacer supervisor» en cada entrenador (no en sí mismo)',sup.count()==2 and 'u1' not in [sup.nth(i).get_attribute('data-id') for i in range(2)])
    pg.locator('[data-acct=club-sup][data-id=u8]').click();pg.wait_for_timeout(300)
    check('«Hacer supervisor» llama a club_hacer_supervisor',calls(pg,'club_hacer_supervisor')==[['rpc','club_hacer_supervisor',{'entrenador':'u8','si':True}]])
    # 4) Ver a un entrenador: sus datos, en solo lectura
    pg.locator('[data-acct=club-ver]').click();pg.wait_for_timeout(500)
    check('pide los datos de ese entrenador',calls(pg,'club_datos_entrenador')==[['rpc','club_datos_entrenador',{'entrenador':'u9'}]])
    check('barra «Viendo a…»',pg.locator('#verBar').is_visible() and 'luis@x.es' in pg.locator('#verBar').inner_text())
    v=pg.locator('#view').inner_text()
    check('se ve la plantilla del entrenador, no la mía','Luis Uno' in v and 'Luis Dos' in v and 'Mio Uno' not in v,v[:200])
    check('no hay botones para añadir ni borrar',pg.locator('#view [data-action=add-player]:visible, #view [data-action=delete-player]:visible, [data-teamact]:visible').count()==0)
    n0=pg.evaluate("window.__db.futbol_personal_jugadores.length")
    pg.evaluate("document.querySelector('[data-action=add-player]')&&document.querySelector('[data-action=add-player]').click()")
    pg.wait_for_timeout(200)
    check('aunque se fuerce, no se abre «Nuevo jugador»',pg.locator('#modal').is_hidden() and 'solo puedes mirar' in pg.locator('#message').inner_text())
    check('no se guarda nada en mi cuenta',pg.evaluate("window.__db.futbol_personal_jugadores.length")==n0)
    pg.click('[data-tab=partidos]');pg.wait_for_timeout(300)
    check('se ven sus partidos','Los Pinos' in pg.locator('#view').inner_text())
    pg.locator('#view [data-action=edit-match]').first.click();pg.wait_for_timeout(300)
    v=pg.locator('#view').inner_text()
    check('se ve la alineación y convocatoria en solo lectura','solo lectura' in v.lower() and 'convocatoria' in v.lower() and pg.locator('[data-action=save]:visible').count()==0)
    check('la alineación tiene al jugador en el campo',pg.locator('.field button.fill').count()==1)
    pg.click('[data-action=cancel]');pg.wait_for_timeout(200)
    check('la pestaña «Entrenos» aparece si tiene entrenamientos',pg.locator('#trTab').is_visible())
    pg.click('[data-ver-salir]');pg.wait_for_timeout(300)
    pg.click('[data-tab=plantilla]');pg.wait_for_timeout(200)
    v=pg.locator('#view').inner_text()
    check('«Volver a mis datos» recupera mi plantilla','Mio Uno' in v and 'Luis Uno' not in v and pg.locator('#verBar').count()==0)
    check('vuelvo a poder añadir jugadores',pg.locator('#view [data-action=add-player]:visible').count()>=1)
    ctx.close()
    # 5) Supervisor nombrado (no encargado): lista para ver, sin código ni «Quitar»
    m=[dict(x) for x in MIEMBROS];m[1]['id']='u9'
    ctx,pg=abrir(b,{'id':'c1','nombre':'CD Granada Norte','activo':True,'soy_admin':False,'soy_supervisor':True,'comparto':True,
                    'miembros':[{'id':'u1','email':'ana@x.es','admin':False,'supervisor':True,'comparte':True}]+m[:1]+m[1:]})
    club_pane(pg);t=body(pg)
    check('supervisor: «Eres supervisor del club» con «Ver»','eres supervisor del club' in t.lower() and pg.locator('[data-acct=club-ver]').count()==1)
    check('supervisor: sin código, «Quitar» ni «Hacer supervisor»','K7M2Q9XA4P' not in t and pg.locator('[data-acct=club-quitar], [data-acct=club-sup]').count()==0)
    ctx.close()
    # 6) Si el entrenador dejó de compartir: aviso claro
    ctx,pg=abrir(b,ADMIN)
    pg.evaluate("window.__cfg.rpcData.club_datos_entrenador={__error:'NO_COMPARTE'}")
    club_pane(pg);pg.locator('[data-acct=club-ver]').click();pg.wait_for_timeout(300)
    check('aviso si ya no comparte','aún no ha aceptado' in pg.locator('#message').inner_text() and pg.locator('#verBar').count()==0)
    ctx.close()
    # 7) Textos: privacidad y guía de uso
    ctx,pg=abrir(b,None,plan='gratis')
    pg.click('#acct');pg.click('#info [data-info=privacy]');pg.wait_for_timeout(200)
    check('privacidad explica el supervisor','supervisor del club' in body(pg) and 'sin poder cambiarlos' in body(pg))
    pg.click('#closeInfo');pg.click('#acct');pg.click('#info [data-info=ayuda]');pg.wait_for_timeout(200)
    check('la guía de uso explica el supervisor','Supervisor del club' in pg.locator('#infoBody').inner_html())
    ctx.close()
    b.close()
bad=[e for e in errs if 'favicon' not in e]
check('sin errores en la consola',not bad,bad[:3])
print(('PASS' if all(res) else 'FAIL'),sum(res),'/',len(res),[])
srv.shutdown();sys.exit(0 if all(res) else 1)
