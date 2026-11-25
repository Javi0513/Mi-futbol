import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json
from playwright.sync_api import sync_playwright
from fake2 import FAKE2
# v11.63: en el árbol del club los textos (email, «Supervisor · Desde el…») no se montan encima de «Ver»
# ni de «Quitar supervisor» / «Quitar», en móvil estrecho, iPhone, iPad y PC.
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8846),functools.partial(type('Q',(http.server.SimpleHTTPRequestHandler,),{'log_message':lambda *a:None}),directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
CFG=open(os.path.join(APP,'config.js')).read().replace("window.APP_CONFIG = {","window.APP_CONFIG = {noTutorial:true,noInicio:true,")
MIEMBROS=[{'id':'u1','email':'ana@x.es','desde':'2026-10-27T10:00:00Z','admin':True,'supervisor':True,'comparte':False,'nombre':None,'foto':None},
          {'id':'u7','email':'entrenador.encargado1621@gmail.com','desde':'2026-11-20T10:00:00Z','admin':False,'supervisor':False,'comparte':True,'nombre':'Juan Diego Costela Martínez','foto':None},
          {'id':'u9','email':'nombremuylargo.rodriguez02@gmail.com','desde':'2026-11-25T11:00:00Z','admin':False,'supervisor':True,'comparte':True,'nombre':'Nono','foto':None},
          {'id':'u8','email':'eva.sinnombre.ninguno.largo@hotmail.com','desde':'2026-11-25T12:00:00Z','admin':False,'supervisor':False,'comparte':False,'nombre':None,'foto':None}]
ADMIN={'id':'c1','nombre':'Alomartes c.f','escudo':None,'activo':True,'soy_admin':True,'soy_supervisor':True,'comparto':False,'codigo':'K7M2Q9XA4P','plazas':5,'usadas':4,'pagado':True,'miembros':MIEMBROS}
SOLAPA="""()=>{const R=e=>e.getBoundingClientRect(),cr=(a,b)=>a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1;let mal=[];
 document.querySelectorAll('#info .arbol .an').forEach((li,i)=>{const t=[...li.querySelectorAll('.an-p b,.an-p small')],o=[...li.querySelectorAll('.an-ver,.an-b .lnk,.avatar')];
  t.forEach(a=>o.forEach(b=>{if(cr(R(a),R(b)))mal.push(i+':'+a.textContent.slice(0,20)+' / '+b.textContent.slice(0,12))}));
  const L=R(li);[...t,...o].forEach(e=>{const r=R(e);if(r.right>L.right+1||r.left<L.left-1)mal.push(i+':se sale '+e.textContent.slice(0,20))})});return mal}"""
with sync_playwright() as p:
    b=p.chromium.launch()
    for nom,w,h in (('móvil estrecho',320,640),('iPhone',390,844),('iPad',768,1024),('PC',1280,800)):
        ctx=b.new_context(viewport={'width':w,'height':h},service_workers='block')
        ctx.add_init_script('window.__seed='+json.dumps({'futbol_personal_jugadores':[],'futbol_personal_partidos':[],'perfiles':[{'id':'u1','plan':'pro','nombre':None,'foto':None}]}))
        pg=ctx.new_page();pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE2))
        pg.route('**/config.js*',lambda r:r.fulfill(content_type='application/javascript',body=CFG))
        pg.goto('http://127.0.0.1:8846/index.html')
        pg.evaluate("a=>{window.__club=a;window.__cfg.rpcData={mi_club:()=>window.__club}}",json.loads(json.dumps(ADMIN)))
        pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto1');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)');pg.wait_for_timeout(400)
        if pg.locator('#info').is_visible(): pg.click('#closeInfo')
        pg.click('#acct');pg.wait_for_timeout(150);pg.click('#info [data-info=club]');pg.wait_for_timeout(300)
        mal=pg.evaluate(SOLAPA)
        check(nom+' (%d px): ningún texto del árbol se monta encima de otro ni se sale'%w,pg.locator('#info .arbol .an').count()==4 and not mal,str(mal[:4]))
        nono=pg.locator('#info .arbol .an').nth(2)
        bb=nono.locator('.an-b').bounding_box();tb=nono.locator('.an-p').bounding_box()
        check(nom+': «Quitar supervisor» y «Quitar» van debajo de los datos',bb['y']>=tb['y']+tb['height']-1 and 'Quitar supervisor' in nono.locator('.an-b').inner_text())
        check(nom+': el email sale entero en su propia línea',nono.locator('.an-mail').inner_text()=='nombremuylargo.rodriguez02@gmail.com')
        nono.scroll_into_view_if_needed();pg.wait_for_timeout(100)
        pg.locator('#info .arbol').screenshot(path=OUT+'/arbol-%d.png'%w)
        ctx.close()
    b.close()
check('sin errores',not errs,str(errs[:3]))
print('%d/%d'%(sum(res),len(res)));sys.exit(0 if all(res) else 1)
