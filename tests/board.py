import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import sys;pass;import fonts
import http.server,threading,functools,json
from playwright.sync_api import sync_playwright
from PIL import Image
FAKE=open(TESTS+'/run.py').read().split('FAKE = r"""')[1].split('"""')[0]
src=open(TESTS+'/feat.py').read();SEED=src.split('SEED="""')[1].split('"""')[0]
N7=['Adri leon','Antonio Miguel','Camacho','Capi','Chamako','Chinchilla','Chuches','David','Edu wadro'];N11=N7+['German','Hugo','Jairo','Javier Casado']
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8795),functools.partial(http.server.SimpleHTTPRequestHandler,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
def store(pg,k='7'):return json.loads(pg.evaluate("localStorage.getItem('mf_pizarra_v1')||'{}'")).get(k,{})
def ink(pg):return pg.evaluate("(()=>{const c=document.getElementById('bcanvas'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>0)n++;return n})()")
def box(pg):return pg.locator('#bcanvas').bounding_box()
def stroke(pg,fr):
    pg.evaluate("document.getElementById('bfield').scrollIntoView({block:'center'})");pg.wait_for_timeout(60)
    bb=box(pg);pts=[(bb['x']+bb['width']*a,bb['y']+bb['height']*c) for a,c in fr]
    pg.mouse.move(*pts[0]);pg.mouse.down()
    for p in pts[1:]:pg.mouse.move(*p,steps=6)
    pg.mouse.up();pg.wait_for_timeout(60)
with sync_playwright() as p:
    b=p.chromium.launch();ctx=b.new_context(viewport={'width':1100,'height':900},accept_downloads=True);pg=ctx.new_page()
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    pg.goto('http://127.0.0.1:8795/index.html');pg.evaluate(SEED,[N7,N11])
    pg.fill('input[name=email]','c@x.es');pg.fill('input[name=password]','secreto1');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)')
    pg.click('[data-tab=pizarra]');pg.wait_for_selector('#bcanvas');pg.wait_for_timeout(500)
    check('empieza con «Mover» (tocar no pinta)',pg.get_attribute('[data-b=tool][data-v=move]','aria-pressed')=='true')
    pg.click('[data-b=tool][data-v=pen]')
    pg.evaluate("document.getElementById('bfield').scrollIntoView({block:'start'})");pg.wait_for_timeout(200)
    bx=box(pg);fb=pg.locator('#bfield').bounding_box()
    check('canvas cubre el campo',abs(bx['width']-fb['width'])<3 and abs(bx['height']-fb['height'])<3,(bx,fb))
    check('pizarra empieza vacía (solo el rótulo)',len(store(pg).get('strokes',[]))==0)
    x0,y0,w,h=bx['x'],bx['y'],bx['width'],bx['height']
    stroke(pg,[(.2,.8),(.4,.6),(.6,.55)])
    check('lápiz dibuja (hay tinta)',ink(pg)>300,ink(pg));s=store(pg);check('trazo guardado tipo pen amarillo',len(s['strokes'])==1 and s['strokes'][0]['t']=='pen' and s['strokes'][0]['c']=='#ffd60a',s['strokes'][0]['c'] if s.get('strokes') else s)
    pg.click('[data-b=tool][data-v=arrow]');pg.click('[data-b=color][data-v="#ff4d5e"]')
    stroke(pg,[(.7,.9),(.75,.6),(.8,.3)]);s=store(pg)
    check('flecha roja guardada',len(s['strokes'])==2 and s['strokes'][1]['t']=='arrow' and s['strokes'][1]['c']=='#ff4d5e')
    pg.screenshot(path=OUT+'/pizarra_desktop.png')
    pg.click('[data-b=undo]');check('deshacer quita la flecha',len(store(pg)['strokes'])==1)
    pg.click('[data-b=undo]');check('deshacer vacía',len(store(pg)['strokes'])==0)
    pg.click('[data-b=undo]');check('deshacer sin nada no rompe',True)
    pg.click('[data-b=tool][data-v=pen]')
    stroke(pg,[(.2,.2),(.4,.2)]);stroke(pg,[(.2,.4),(.4,.4)])
    check('2 trazos',len(store(pg)['strokes'])==2)
    pg.click('[data-b=tool][data-v=erase]');stroke(pg,[(.3,.35),(.3,.45)])
    check('goma borra solo la línea tocada',len(store(pg)['strokes'])==1)
    pg.click('[data-b=undo]');check('deshacer recupera la línea borrada',len(store(pg)['strokes'])==2)
    pg.click('[data-b=clear]');check('borrar todo',len(store(pg)['strokes'])==0)
    pg.click('[data-b=undo]');check('deshacer recupera tras borrar todo',len(store(pg)['strokes'])==2)
    # persistencia al cambiar de pestaña
    pg.click('[data-tab=partidos]');pg.click('[data-tab=pizarra]');pg.wait_for_selector('#bcanvas');pg.wait_for_timeout(300)
    check('trazos siguen al volver a la pestaña',ink(pg)>200)
    pg.reload();pg.evaluate(SEED,[N7,N11]);pg.fill('input[name=email]','c@x.es');pg.fill('input[name=password]','secreto1');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)');pg.click('[data-tab=pizarra]');pg.wait_for_timeout(400)
    check('trazos sobreviven a recargar',ink(pg)>200)
    # fondo con alineación
    opts=pg.locator('#boardBg option').all_inner_texts();print(opts)
    check('«Poner titulares» ofrece los partidos con posiciones',len(opts)==4,opts)
    pg.select_option('#boardBg',index=1);pg.wait_for_timeout(300)
    check('titulares del partido como fichas en la pizarra',len([i for i in store(pg)['items'] if i['k']=='own' and i['pid']])==7,store(pg).get('items'))
    check('tinta se conserva con el fondo',ink(pg)>200)
    # F11 es independiente
    pg.click('[data-mode="11"]');pg.click('[data-tab=pizarra]');pg.wait_for_timeout(300)
    check('F11 pizarra independiente',len(store(pg,'11').get('strokes',[]))==0 and len(store(pg,'11').get('items',[]))==0)
    pg.click('[data-mode="7"]');pg.click('[data-tab=pizarra]');pg.wait_for_timeout(300)
    # exportar
    with pg.expect_download() as d:pg.click('[data-b=img]')
    dl=d.value;path=OUT+'/exp_pizarra.png';dl.save_as(path);im=Image.open(path)
    check('imagen pizarra 1080x1520',im.size==(1080,1520) and dl.suggested_filename.startswith('pizarra-f7-'),dl.suggested_filename)
    # presentar
    pg.click('[data-b=present]');pg.wait_for_timeout(500)
    pf=pg.locator('#bfield').bounding_box();vp=pg.viewport_size
    check('presentar: campo cabe en pantalla',pf['y']>=0 and pf['y']+pf['height']<=vp['height']+1 and pf['x']>=0 and pf['x']+pf['width']<=vp['width']+1,pf)
    check('presentar: tinta redibujada',ink(pg)>200)
    pg.screenshot(path=OUT+'/pizarra_present.png')
    pg.keyboard.press('Escape');pg.wait_for_timeout(300);check('Escape sale de presentar',pg.locator('#boardPanel.present').count()==0)
    # botones de colores accesibles
    check('4 colores con nombre',pg.locator('.sw[aria-label]').count()==4)
    # móvil táctil
    m=b.new_context(viewport={'width':375,'height':812},device_scale_factor=2,has_touch=True,is_mobile=True).new_page()
    m.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    m.goto('http://127.0.0.1:8795/index.html');m.evaluate(SEED,[N7,N11]);m.fill('input[name=email]','c@x.es');m.fill('input[name=password]','secreto1');m.tap('[data-auth=login]');m.wait_for_selector('#app:not(.hidden)')
    m.tap('[data-tab=pizarra]');m.wait_for_selector('#bcanvas');m.wait_for_timeout(500);m.tap('[data-b=tool][data-v=pen]');m.wait_for_timeout(200)
    m.evaluate("document.getElementById('bfield').scrollIntoView({block:'center'})");m.wait_for_timeout(300)
    bb=m.locator('#bcanvas').bounding_box();cdp=m.context.new_cdp_session(m)
    def tpts(pts):
        cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':pts[0][0],'y':pts[0][1]}]})
        for q in pts[1:]:cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':q[0],'y':q[1]}]})
        cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});m.wait_for_timeout(80)
    sy0=m.evaluate('window.scrollY')
    tpts([(bb['x']+bb['width']*.2+i*8,bb['y']+bb['height']*.7-i*5) for i in range(20)])
    check('táctil: dibuja con el dedo',ink(m)>300 and len(store(m)['strokes'])==1,len(store(m).get('strokes',[])))
    check('táctil: la página no se desplaza al dibujar',abs(m.evaluate('window.scrollY')-sy0)<2)
    m.evaluate("window.scrollTo(0,0)");m.wait_for_timeout(200);m.tap('[data-b=tool][data-v=arrow]');m.wait_for_timeout(200);m.evaluate("document.getElementById('bfield').scrollIntoView({block:'center'})");m.wait_for_timeout(200);bb=m.locator('#bcanvas').bounding_box();tpts([(bb['x']+bb['width']*.5,bb['y']+bb['height']*.9-i*10) for i in range(15)])
    check('táctil: flecha',store(m)['strokes'][-1]['t']=='arrow',[(x['t'],len(x['p'])) for x in store(m)['strokes']]+[bb,m.evaluate('window.scrollY')])
    m.screenshot(path=OUT+'/pizarra_movil.png')
    m.tap('[data-b=present]');m.wait_for_timeout(500);pf=m.locator('#bfield').bounding_box()
    check('móvil presentar: campo cabe',pf['y']>=0 and pf['y']+pf['height']<=812+1 and pf['x']+pf['width']<=375+1,pf)
    m.screenshot(path=OUT+'/pizarra_movil_present.png')
    check('sin errores de consola',not errs,errs)
    b.close()
print('RESUMEN:',sum(res),'/',len(res))
