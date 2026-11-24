import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
# v11.56: en iPad antiguos la barra de secciones se quedaba flotando a media pantalla tras girar.
# No se puede reproducir el fallo de Safari, así que se simula subiendo la barra y se comprueba que vuelve abajo.
import http.server,threading,functools
from playwright.sync_api import sync_playwright
from fake2 import FAKE2
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8881),functools.partial(type('Q',(http.server.SimpleHTTPRequestHandler,),{'log_message':lambda *a:None}),directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
LS="try{['campo','liga','mapa','entdir','anograb','camext'].forEach(function(k){localStorage.setItem('mf_ftut:'+k,'1')});localStorage.setItem('mf_novedades_visto','99');localStorage.setItem('mf_tour','1')}catch(e){}"
def fondo(pg):return pg.evaluate("(()=>{let r=document.querySelector('.dock').getBoundingClientRect();return [Math.round(r.bottom),innerHeight,document.querySelector('.dock').style.transform]})()")
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':768,'height':1024},service_workers='block');pg=ctx.new_page()
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.add_init_script(LS)
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE2))
    pg.goto('http://127.0.0.1:8881/index.html')
    pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto1');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)')
    pg.wait_for_timeout(1500)
    f=fondo(pg)
    check('iPad vertical: la barra está abajo del todo y sin mover',f[0]==f[1] and f[2]=='',f)
    # simula el fallo: Safari la deja 256 px por encima del borde (alto de iPad en horizontal)
    pg.evaluate("document.querySelector('.dock').style.bottom='256px'")
    f=fondo(pg);check('simulado: la barra flota a media pantalla',f[1]-f[0]==256,f)
    pg.wait_for_timeout(2300)
    f=fondo(pg)
    check('se recoloca sola abajo del todo',abs(f[0]-f[1])<3 and 'translateY' in f[2],f)
    pg.evaluate("window.scrollTo(0,300)");pg.wait_for_timeout(400)
    f=fondo(pg);check('sigue abajo al desplazar la pantalla',abs(f[0]-f[1])<3,f)
    # Safari se corrige solo: la barra no debe quedarse por debajo del borde
    pg.evaluate("document.querySelector('.dock').style.bottom=''");pg.wait_for_timeout(2300)
    f=fondo(pg);check('cuando Safari la pone bien, se quita el arreglo',f[0]==f[1] and f[2]=='',f)
    # girar: horizontal (barra a la izquierda) no se toca
    pg.set_viewport_size({'width':1024,'height':768});pg.wait_for_timeout(1800)
    lat=pg.evaluate("(()=>{let d=document.querySelector('.dock'),r=d.getBoundingClientRect();return [Math.round(r.left),Math.round(r.width),d.style.transform,getComputedStyle(d).display]})()")
    check('iPad horizontal: barra a la izquierda, sin mover',lat[0]==0 and lat[1]<120 and lat[2]=='' and lat[3]!='none',lat)
    pg.set_viewport_size({'width':768,'height':1024});pg.wait_for_timeout(1800)
    f=fondo(pg);check('al volver a vertical la barra está abajo',f[0]==f[1] and f[2]=='',f)
    # con el teclado abierto no se toca
    pg.evaluate("document.querySelector('.dock').style.bottom='200px'")
    pg.evaluate("(()=>{let i=document.createElement('input');i.id='tq';document.body.appendChild(i);i.focus()})()");pg.wait_for_timeout(2300)
    f=fondo(pg);check('con el teclado abierto no se mueve',f[2]=='',f)
    ctx.close()
    # móvil: nada cambia
    ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block');pg=ctx.new_page()
    pg.on('pageerror',lambda e:errs.append(str(e)));pg.add_init_script(LS)
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE2))
    pg.goto('http://127.0.0.1:8881/index.html')
    pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto1');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)')
    pg.wait_for_timeout(2300)
    f=fondo(pg);check('móvil: barra abajo sin mover',f[0]==f[1] and f[2]=='',f)
    b.close()
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
sys.exit(0 if all(res) and not errs else 1)
