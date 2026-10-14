import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,sys,json
pass
from playwright.sync_api import sync_playwright
from fake2 import FAKE2
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8807),functools.partial(http.server.SimpleHTTPRequestHandler,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
names7=['Adrián','Antonio','Camacho','Chuches','David']
names11=['Álvaro Núñez','Bernabé','Chinchilla','Zacarías']+['Relleno %d'%i for i in range(18)]
with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_context(viewport={'width':390,'height':844},service_workers='block').new_page()
    pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE2))
    pg.goto('http://127.0.0.1:8807/index.html')
    pg.evaluate("""([a,c])=>{let i=0;a.forEach(n=>window.__db.futbol_personal_jugadores.push({id:'a'+(i++),modalidad:'7',nombre:n,foto:''}));c.forEach(n=>window.__db.futbol_personal_jugadores.push({id:'b'+(i++),modalidad:'11',nombre:n,foto:''}));
      window.__db.futbol_personal_partidos.push({id:'m1',modalidad:'7',fecha:'2026-09-20',rival:'Rival Granada CF',participaciones:'[]',alineacion:'{}'},{id:'m2',modalidad:'11',fecha:'2026-10-04',rival:'Atlético Albolote',participaciones:'[]',alineacion:'{}'})}""",[names7,names11])
    pg.fill('input[name=email]','c@x.es');pg.fill('input[name=password]','secreto1');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)')
    check('estoy en Fútbol 7',pg.locator('[data-mode="7"].on').count()==1)
    pg.click('#sbtn');check('abre el buscador y enfoca',pg.evaluate("document.activeElement&&document.activeElement.id")=='sq')
    pg.fill('#sq','nunez');pg.wait_for_timeout(150)
    t=pg.locator('#sres .sitem').all_inner_texts();check('sin acentos: "nunez" encuentra Álvaro Núñez (F11)',len(t)==1 and 'Álvaro' in t[0] and 'Fútbol 11' in t[0],t)
    pg.screenshot(path='srch.png')
    pg.click('#sres .sitem');pg.wait_for_timeout(700)
    check('cierra y cambia a Fútbol 11 / Plantilla',pg.locator('#srch').count()==0 and pg.locator('[data-mode="11"].on').count()==1 and pg.locator('[data-tab=plantilla].on').count()==1)
    check('el jugador queda resaltado y a la vista',pg.locator('[data-pid] >> text=Álvaro').count()>=1 and pg.evaluate("(()=>{const e=document.querySelector('.row.flash');if(!e)return false;const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()"))
    pg.click('#sbtn');pg.fill('#sq','albolote');pg.keyboard.press('Enter');pg.wait_for_timeout(600)
    check('Enter va al partido (F11 / Partidos)',pg.locator('[data-tab=partidos].on').count()==1 and pg.locator('.row.flash[data-mid=m2]').count()==1)
    pg.click('#sbtn');pg.fill('#sq','zzzz');check('sin resultados: mensaje',pg.locator('#sres').inner_text().startswith('No hay resultados'))
    pg.fill('#sq','20/09');t=pg.locator('#sres .sitem').all_inner_texts();check('busca por fecha',len(t)==1 and 'Granada' in t[0],t)
    pg.keyboard.press('Escape');check('Escape cierra',pg.locator('#srch').count()==0)
    pg.screenshot(path='header3.png',clip={'x':0,'y':0,'width':390,'height':70})
    b.close()
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
