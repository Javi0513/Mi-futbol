import sys,os,re;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json
from playwright.sync_api import sync_playwright
# Espectadores del directo (v11.51): la página del enlace avisa de que sigue abierta (rpc directo_visto)
# y el entrenador ve cuántos lo están viendo (rpc directo_viendo); quien sigue el enlace también lo ve. Gratis.
FAKE=re.search(r'FAKE=r"""(.*?)"""',open(os.path.join(TESTS,'live.py'),encoding='utf-8').read(),re.S).group(1)
A="return{data:r?{...CP(r),ahora:NOW()}:null,error:null}}return{error:null}},"
assert A in FAKE
FAKE=FAKE.replace(A,"return{data:r?{...CP(r),ahora:NOW()}:null,error:null}}if(n==='directo_visto'){(window.__vistos=window.__vistos||[]).push(a);return{data:window.__viendo||1,error:null}}if(n==='directo_viendo'){window.__pide=(window.__pide||0)+1;if(window.__sinSQL)return{data:null,error:{message:'Could not find the function public.directo_viendo(codigo) in the schema cache'}};return{data:window.__viendo||0,error:null}}return{error:null}},")
P=[{'id':f'p{i}','owner_id':'u1','modalidad':'7','nombre':f'J{i}','foto':'','created_at':''} for i in range(8)]
PART=[{'id':f'p{i}','nombre':f'J{i}','minutes':0,'goals':0,'starter':i<7} for i in range(8)]
def seed(plan,n=1):return{'futbol_personal_jugadores':P,'futbol_personal_partidos':[{'id':f'm{k}','owner_id':'u1','modalidad':'7','fecha':'2026-10-1%d'%k,'rival':'Los Pinos %d'%k,'participaciones':json.dumps(PART),'alineacion':'{}','created_at':''} for k in range(1,n+1)],'perfiles':[{'id':'u1','plan':plan}]}
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8872),functools.partial(H,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8872/index.html'
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
def page(b,sd,extra=''):
    ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block',permissions=['camera','microphone'])
    pg=ctx.new_page()
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)))
    pg.on('dialog',lambda d:d.accept())
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    pg.add_init_script('window.__seed='+json.dumps(sd)+';'+extra)
    return pg
def login(pg):
    pg.goto(URL);pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto12');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)');pg.wait_for_timeout(200)
def abre(pg,mid='m1'):
    pg.click('[data-tab=partidos]');pg.click(f'[data-action=live][data-id={mid}]');pg.wait_for_selector('.lv-board');pg.wait_for_timeout(1500)
V=lambda pg:pg.locator('.lv-viendo').first.inner_text() if pg.locator('.lv-viendo').count() else ''
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
    # 1) Pro: siempre
    pg=page(b,seed('pro'));login(pg);abre(pg)
    check('en el Directo, debajo del marcador, dice que nadie tiene abierto el enlace','nadie tiene abierto el enlace' in V(pg),V(pg))
    check('lo pregunta al servidor solo para su directo',pg.evaluate('window.__pide')>=1)
    pg.evaluate('window.__viendo=12');pg.wait_for_timeout(16500)
    check('se actualiza solo (cada 15 s): «12 personas están viendo»','12 personas están viendo el directo ahora' in V(pg),V(pg))
    pg.evaluate('window.__viendo=1');pg.wait_for_timeout(16000)
    check('en singular con 1','1 persona está viendo' in V(pg),V(pg))
    pg.click('[data-live=start]');pg.wait_for_timeout(300)
    pg.click('[data-live=cam]');pg.wait_for_function("()=>document.querySelector('.cam canvas')&&document.querySelector('.cam canvas').width>0",timeout=5000);pg.wait_for_timeout(1200)
    check('también se ve en la cámara mientras emites',pg.locator('.cam-ui .lv-viendo').count()==1 and 'persona' in pg.locator('.cam-ui .lv-viendo').inner_text(),pg.locator('.cam-ui').inner_text()[:120])
    pg.screenshot(path=OUT+'/espectadores_camara.png')
    pg.click('[data-cam=close]');pg.wait_for_selector('.lv-board');pg.wait_for_timeout(1200)
    pg.screenshot(path=OUT+'/espectadores_directo.png')
    did=pg.evaluate("(window.__db.directos||[])[0].id")
    # 2) La página del enlace avisa de que sigue abierta, con un código al azar, y no ve el número
    db=pg.evaluate('window.__db')
    pub=page(b,db);pub.goto(URL+'?directo='+did);pub.wait_for_selector('#pub .lv-board');pub.wait_for_timeout(500)
    v=pub.evaluate('window.__vistos||[]')
    check('la página del enlace avisa de que está abierta',len(v)>=1 and v[0]['codigo']==did and len(v[0]['quien'])>=8,v)
    check('quien sigue el enlace también ve cuántos son (cuenta a sí mismo)','1 persona está viendo este partido' in pub.locator('#pubViendo').inner_text(),pub.locator('#pubViendo').inner_text())
    pub.evaluate('window.__viendo=7');pub.wait_for_timeout(10500)
    check('y se le actualiza solo','7 personas están viendo este partido' in pub.locator('#pubViendo').inner_text(),pub.locator('#pubViendo').inner_text())
    pub.screenshot(path=OUT+'/espectadores_familia.png')
    q=v[0]['quien'];pub.reload();pub.wait_for_selector('#pub .lv-board');pub.wait_for_timeout(500)
    check('al recargar sigue siendo la misma persona (no cuenta doble)',pub.evaluate('window.__vistos')[0]['quien']==q)
    # 3) Plan gratuito: también lo ve, sin tope
    fr=page(b,seed('gratis',4),'window.__viendo=5;');login(fr)
    for k in (1,2,3,4):
        abre(fr,f'm{k}');fr.wait_for_timeout(300)
        if k<4:fr.click('[data-live=close]');fr.wait_for_timeout(2100)
    check('plan gratuito: lo ve en todos los partidos, sin tope','5 personas están viendo' in V(fr) and 'Plan gratuito' not in V(fr),V(fr))
    # 4) Sin el SQL aplicado: no sale nada ni falla
    ns=page(b,seed('pro'),'window.__sinSQL=true;');login(ns);abre(ns);ns.wait_for_timeout(500)
    check('sin el SQL de espectadores no se enseña nada',ns.locator('.lv-viendo').count()==0)
    b.close()
print(('PASS' if all(res) else 'FAIL'),sum(res),'/',len(res),errs[:5])
sys.exit(0 if all(res) and not errs else 1)
