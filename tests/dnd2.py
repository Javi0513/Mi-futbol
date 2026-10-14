import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import sys;pass;import fonts
import http.server, threading, functools, json
from playwright.sync_api import sync_playwright
FAKE=open(TESTS+'/run.py').read().split('FAKE = r"""')[1].split('"""')[0]
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8772),functools.partial(http.server.SimpleHTTPRequestHandler,directory=APP))
threading.Thread(target=srv.serve_forever,daemon=True).start()
errs=[];res=[]
def check(n,c,x=''):
    res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
def center(b):return b['x']+b['width']/2,b['y']+b['height']/2
def bb(pg,sel,n=0):return pg.locator(sel).nth(n).bounding_box()
def lab(pg):return pg.locator('.slot span').all_inner_texts()
def st(pg):return pg.locator('[data-field=starter]:checked').count()
def top(pg):pg.evaluate("document.querySelector('.tools').scrollIntoView({block:'start'})");pg.wait_for_timeout(80)
def drag(pg,src,dst):
    sx,sy=center(src);pg.mouse.move(sx,sy);pg.mouse.down();pg.mouse.move(sx+12,sy+12,steps=3);pg.mouse.move(dst[0],dst[1],steps=10);pg.mouse.up();pg.wait_for_timeout(120)
def seed(pg):
    pg.evaluate("""()=>{for(const m of ['7','11'])for(let i=1;i<=(m==='7'?9:13);i++)window.__db.futbol_personal_jugadores.push({id:'p'+m+'_'+i,owner_id:'u1',modalidad:m,nombre:'F'+m+'J'+i,foto:'',created_at:''})}""")
with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_context(viewport={'width':1100,'height':900}).new_page()
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    pg.goto('http://127.0.0.1:8772/index.html');seed(pg)
    pg.fill('input[name=email]','c@x.es');pg.fill('input[name=password]','secreto1');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)')
    for mode,N,nform in (('7',7,8),('11',11,11)):
        print('=== FÚTBOL',mode,'===')
        pg.click(f'[data-mode="{mode}"]');pg.click('[data-tab=partidos]');pg.click('[data-action=add-match]');pg.fill('#rival','Rival '+mode)
        check(f'F{mode}: formaciones',pg.locator('#formation option').count()==nform,pg.locator('#formation option').count())
        top(pg)
        check(f'F{mode}: lista de jugadores arrastrables',pg.locator('.pchip').count()==(9 if mode=='7' else 13))
        for i in range(N):
            top(pg);drag(pg,bb(pg,'.pchip',i),center(bb(pg,'.slot button',i)))
        l=lab(pg);check(f'F{mode}: {N} jugadores arrastrados al campo',sum(x.startswith('F'+mode) for x in l)==N and st(pg)==N,(st(pg),l))
        prev3=lab(pg)[3];top(pg);drag(pg,bb(pg,'.pchip',N),center(bb(pg,'.slot button',3)))
        l=lab(pg);check(f'F{mode}: sustituir a un titular',l[3].startswith('F') and l[3]!=prev3 and st(pg)==N,(l[3],st(pg)))
        top(pg);drag(pg,bb(pg,'.slot button',1),center(bb(pg,'.slot button',2)));l2=lab(pg)
        check(f'F{mode}: intercambio',l2[1]==l[2] and l2[2]==l[1])
        top(pg);drag(pg,bb(pg,'.slot button',1),(30,450));check(f'F{mode}: sacar del campo',not lab(pg)[1].startswith('F') and st(pg)==N-1,st(pg))
        pg.locator('.slot button').nth(1).click();n=pg.locator('[data-pick]').count();check(f'F{mode}: menú con todos',n==(9 if mode=='7' else 13),n)
        pg.locator('[data-pick]').nth(0).click();check(f'F{mode}: elegir en menú',lab(pg)[1]==f'F{mode}J1' or lab(pg)[1].startswith('F'),lab(pg)[1])
        keep=[x for x in lab(pg) if x.startswith('F')]
        other=[o for o in pg.locator('#formation option').all_inner_texts() if o!=pg.input_value('#formation')][2]
        pg.select_option('#formation',other);check(f'F{mode}: cambiar a {other} conserva jugadores',[x for x in lab(pg) if x.startswith('F')]==keep)
        pg.click('[data-wipe]');check(f'F{mode}: limpiar',not any(x.startswith('F') for x in lab(pg)) and st(pg)==0)
        for i in range(N):
            top(pg);drag(pg,bb(pg,'.pchip',i),center(bb(pg,'.slot button',i)))
        pg.screenshot(path=f'{OUT}/f{mode}_desktop.png')
        pg.click('[data-action=save]');pg.wait_for_selector('.message.ok')
        ins=[x for x in pg.evaluate('window.__log') if x[0]=='insert' and 'partidos' in x[1]][-1][2];al=json.loads(ins['alineacion'])
        check(f'F{mode}: guardado {N} posiciones',len(al['slots'])==N and ins['modalidad']==mode,al['formation'])
        pg.locator(f'.row:has-text("Rival {mode}") [data-action=edit-match]').click();pg.wait_for_selector('#formation')
        check(f'F{mode}: reabrir mantiene posiciones',sum(x.startswith('F') for x in lab(pg))==N)
        pg.click('[data-action=cancel]')
    # táctil móvil F11
    ctx=b.new_context(viewport={'width':390,'height':844},has_touch=True,is_mobile=True,device_scale_factor=2);m=ctx.new_page()
    m.on('pageerror',lambda e:errs.append('M '+str(e)))
    m.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    m.goto('http://127.0.0.1:8772/index.html');seed(m)
    m.fill('input[name=email]','c@x.es');m.fill('input[name=password]','secreto1');m.tap('[data-auth=login]');m.wait_for_selector('#app:not(.hidden)')
    m.tap('[data-mode="11"]');m.tap('[data-tab=partidos]');m.tap('[data-action=add-match]');m.select_option('#formation','5-4-1')
    cdp=ctx.new_cdp_session(m)
    def tdrag(src,dst):
        sx,sy=center(src);dx,dy=dst
        cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':sx,'y':sy}]})
        for k in range(1,11):cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':sx+(dx-sx)*k/10,'y':sy+(dy-sy)*k/10}]})
        cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});m.wait_for_timeout(150)
    m.evaluate("document.querySelector('.tools').scrollIntoView({block:'start'})");m.wait_for_timeout(150)
    print('móvil, chips/campo (top,bottom,pantalla):',m.evaluate("(()=>{const f=document.querySelector('.field').getBoundingClientRect(),c=document.querySelector('.pchips').getBoundingClientRect();return [Math.round(c.top),Math.round(f.top),Math.round(f.bottom),innerHeight]})()"))
    for i in range(11):tdrag(bb(m,'.pchip',0),center(bb(m,'.slot button',i)))  # chip 0 se atenúa pero sigue en 0; usar índice i
    b.close()
print('errores consola:',errs);print('RESUMEN:',sum(res),'/',len(res))
