import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import sys;pass;import fonts
import http.server,threading,functools,json
from playwright.sync_api import sync_playwright
# v11.20: tamaño de las fichas, botón Portero, flecha discontinua y app en horizontal (tablet).
FAKE=open(TESTS+'/run.py').read().split('FAKE = r"""')[1].split('"""')[0]
src=open(TESTS+'/feat.py').read();SEED=src.split('SEED="""')[1].split('"""')[0]
N7=['Adri leon','Antonio Miguel','Camacho','Capi','Chamako','Chinchilla','Chuches','David','Edu wadro'];N11=N7+['German','Hugo','Jairo','Javier Casado']
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8871),functools.partial(http.server.SimpleHTTPRequestHandler,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
def store(pg,k='7'):return json.loads(pg.evaluate("localStorage.getItem('mf_pizarra_v1')||'{}'")).get(k,{})
def items(pg,k='7'):return store(pg,k).get('items',[])
def see(pg):pg.evaluate("document.getElementById('bfield').scrollIntoView({block:'center'})");pg.wait_for_timeout(80)
def at(pg,q):
    b=pg.locator('#bcanvas').bounding_box()
    if pg.locator('#boardPanel.land').count():q=(q[1],1-q[0])
    return (b['x']+b['width']*q[0],b['y']+b['height']*q[1])
def drag(pg,q0,q1):
    see(pg);a=at(pg,q0);c=at(pg,q1);pg.mouse.move(*a);pg.mouse.down();pg.mouse.move(*c,steps=10);pg.mouse.up();pg.wait_for_timeout(80)
def login(pg):
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    pg.goto('http://127.0.0.1:8871/index.html');pg.evaluate(SEED,[N7,N11])
    pg.fill('input[name=email]','c@x.es');pg.fill('input[name=password]','secreto1');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)');pg.wait_for_timeout(1500)
# Radio en píxeles de la ficha que está en q: mira hasta dónde llega su color desde el centro.
RAD="""(q)=>{const c=document.getElementById('bcanvas'),g=c.getContext('2d'),land=!!document.querySelector('#boardPanel.land');
 const m=land?[q[1],1-q[0]]:q,x=Math.round(m[0]*c.width),y=Math.round(m[1]*c.height),p=g.getImageData(x,y,1,1).data;
 for(let r=1;r<c.width/4;r++){const d=g.getImageData(x+r,y,1,1).data;if(Math.abs(d[0]-p[0])+Math.abs(d[1]-p[1])+Math.abs(d[2]-p[2])>90&&!(d[0]>230&&d[1]>230&&d[2]>230))return r}return -1}"""
with sync_playwright() as p:
    b=p.chromium.launch()
    man=json.load(open(REPO+'/manifest.webmanifest'))
    check('manifest: la app puede girar (no bloquea en vertical)',man.get('orientation') in ('any','natural',None),man.get('orientation'))
    # ---- tablet en horizontal (iPad 10,2" girado)
    pg=b.new_context(viewport={'width':1180,'height':820},device_scale_factor=1,has_touch=True).new_page()
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    login(pg)
    for t in ['plantilla','partidos','resumen','pizarra']:
        if pg.locator(f'[data-tab={t}]').count()==0:continue
        pg.click(f'[data-tab={t}]');pg.wait_for_timeout(300)
        check(f'tablet horizontal: «{t}» sin desplazamiento lateral',pg.evaluate('document.documentElement.scrollWidth')<=1181)
    pg.wait_for_selector('#bcanvas')
    check('tablet horizontal: pizarra en horizontal',pg.locator('#boardPanel.land').count()==1)
    # ---- portero
    check('botón Portero en la pizarra',pg.locator('[data-b=add][data-v=gk]').count()==1)
    pg.click('[data-b=add][data-v=gk]');pg.wait_for_timeout(100)
    check('menú del portero: mío y rival',pg.locator('.bmenu [data-b=addgk]').count()==2)
    pg.click('.bmenu [data-b=addgk][data-v=own]');pg.wait_for_timeout(100)
    pg.click('[data-b=add][data-v=gk]');pg.click('.bmenu [data-b=addgk][data-v=riv]');pg.wait_for_timeout(100)
    L=items(pg);gk=[i for i in L if i['n']=='P']
    check('porteros añadidos (P, amarillo y morado)',len(gk)==2 and {(i['k'],i['c']) for i in gk}=={('own','#ffd60a'),('riv','#b388ff')},gk)
    pg.click('[data-b=add][data-v=own]');pg.locator('.bmenu button').first.click();pg.wait_for_timeout(100)
    pg.click('[data-b=add][data-v=own]');pg.locator('.bmenu button').first.click();pg.wait_for_timeout(100)
    L=items(pg);n=[i for i in L if i['k']=='own' and i['n']!='P']
    check('las fichas normales siguen numeradas 1, 2',sorted(i['n'] for i in n)==['1','2'],[i['n'] for i in n])
    # colocar separadas
    gko=[i for i in L if i['k']=='own' and i['n']=='P'][0]
    drag(pg,gko['p'][0],(0.5,0.93))
    for i,(x,y) in zip(n,[(0.3,0.6),(0.7,0.6)]):drag(pg,i['p'][0],(x,y))
    gkr=[i for i in items(pg) if i['k']=='riv'][0];drag(pg,gkr['p'][0],(0.5,0.07))
    # «a todos los míos» no pinta al portero
    see(pg);pg.mouse.click(*at(pg,(0.3,0.6)));pg.wait_for_timeout(150)
    check('tocar jugador abre su color',pg.locator('.bcolp').count()==1)
    pg.locator('.bcolp [data-pc]').first.evaluate("e=>e.closest('.bcolp')")
    sw=pg.locator('.bcolp [data-pc]:not([data-pc=""])').first;c=sw.get_attribute('data-pc');sw.click();pg.wait_for_timeout(100)
    pg.mouse.click(*at(pg,(0.3,0.6)));pg.wait_for_timeout(150)
    if pg.locator('.bcolp').count()==0:pg.mouse.click(*at(pg,(0.3,0.6)));pg.wait_for_timeout(150)
    pg.click('.bcolp [data-pca=all]');pg.wait_for_timeout(150)
    L=items(pg);own=[i for i in L if i['k']=='own']
    check('«A todos los míos» no cambia el color del portero',len({i['c'] for i in own if i['n']!='P'})==1 and own[0]['c']!='' and [i for i in own if i['n']!='P'][0]['c'] not in ('','#ffd60a') and [i for i in own if i['n']=='P'][0]['c']=='#ffd60a',[(i['n'],i['c']) for i in own])
    pg.keyboard.press('Escape');pg.wait_for_timeout(100)
    # ---- tamaño de las fichas
    check('control de tamaño: 100 %','100%' in pg.inner_text('.btsz-n'))
    ys=[pg.locator(x).bounding_box() for x in ['[data-b=tsz][data-v="-1"]','.btsz-n','[data-b=tsz][data-v="1"]']]
    check('control de tamaño en una sola fila (− 100 % +)',max(y['y']+y['height']/2 for y in ys)-min(y['y']+y['height']/2 for y in ys)<6 and ys[0]['x']<ys[1]['x']<ys[2]['x'],ys)
    r100=pg.evaluate(RAD,[0.7,0.6])
    for _ in range(5):pg.click('[data-b=tsz][data-v="-1"]');pg.wait_for_timeout(60)
    r50=pg.evaluate(RAD,[0.7,0.6])
    check('fichas al 50 %','50%' in pg.inner_text('.btsz-n') and store(pg)['ts']==0.5 and pg.locator('[data-b=tsz][data-v="-1"][disabled]').count()==1)
    check('las fichas se dibujan más pequeñas',0<r50<r100*0.65,(r50,r100))
    pg.screenshot(path=OUT+'/pizarraabp_pequenas.png')
    for _ in range(7):pg.click('[data-b=tsz][data-v="1"]');pg.wait_for_timeout(60)
    r130=pg.evaluate(RAD,[0.7,0.6])
    check('fichas al 130 % (máximo)','130%' in pg.inner_text('.btsz-n') and pg.locator('[data-b=tsz][data-v="1"][disabled]').count()==1 and r130>r100*1.15,(r130,r100))
    for _ in range(5):pg.click('[data-b=tsz][data-v="-1"]');pg.wait_for_timeout(60)
    check('el tamaño se guarda',store(pg)['ts']==0.7)
    # arrastrar una ficha pequeña sigue funcionando
    o=[i for i in items(pg) if i['k']=='own' and i['n']=='1'][0];drag(pg,o['p'][0],(0.35,0.45))
    q=[i for i in items(pg) if i['id']==o['id']][0]['p'][0];check('se arrastra una ficha pequeña',abs(q[1]-0.45)<0.03,q)
    # ---- flecha discontinua
    check('herramienta flecha discontinua',pg.locator('[data-b=tool][data-v=darrow]').count()==1 and 'discontinua' in pg.get_attribute('[data-b=tool][data-v=darrow]','title'))
    check('flecha continua explica el golpeo','golpeo' in pg.get_attribute('[data-b=tool][data-v=arrow]','title'))
    pg.click('[data-b=tool][data-v=darrow]');drag(pg,(0.15,0.3),(0.15,0.75))
    pg.click('[data-b=tool][data-v=arrow]');drag(pg,(0.85,0.3),(0.85,0.75))
    s=store(pg)['strokes'];check('se guardan las dos flechas (discontinua y continua)',[x['t'] for x in s][-2:]==['darrow','arrow'],[x['t'] for x in s])
    # la discontinua tiene huecos: a lo largo de la línea hay píxeles sin pintar
    gaps=pg.evaluate("""(xs)=>{const c=document.getElementById('bcanvas'),g=c.getContext('2d');let out=[];
      for(const fx of xs){let on=0,off=0;for(let t=0.4;t<0.6;t+=0.004){const x=Math.round(fx*c.width),y=Math.round(t*c.height);const d=g.getImageData(x,y,1,1).data;(d[0]>200&&d[1]>180&&d[2]<90)?on++:off++}out.push([on,off])}return out}""",[1-0.3+0.0,0.0])
    # (en horizontal la línea vertical del campo va en horizontal en pantalla) -> medir sobre la fila
    gaps=pg.evaluate("""()=>{const c=document.getElementById('bcanvas'),g=c.getContext('2d'),land=!!document.querySelector('#boardPanel.land');
      const row=(q0,q1)=>{let on=0,off=0;for(let t=0.35;t<0.7;t+=0.003){const q=[q0,t],m=land?[q[1],1-q[0]]:q;const d=g.getImageData(Math.round(m[0]*c.width),Math.round(m[1]*c.height),1,1).data;(d[0]>200&&d[1]>170&&d[2]<110)?on++:off++}return [on,off]};
      return [row(0.15),row(0.85)]}""")
    check('la flecha discontinua tiene huecos y la continua no',gaps[0][1]>gaps[0][0]*0.25 and gaps[1][1]<gaps[1][0]*0.15,gaps)
    pg.click('[data-b=tool][data-v=move]')
    pg.screenshot(path=OUT+'/pizarraabp_tablet.png')
    # recargar: todo se mantiene
    pg.reload();login(pg);pg.click('[data-tab=pizarra]');pg.wait_for_selector('#bcanvas');pg.wait_for_timeout(300)
    check('al volver a abrir: tamaño 70 % y flechas',('70%' in pg.inner_text('.btsz-n')) and any(x['t']=='darrow' for x in store(pg)['strokes']))
    # guía, tutorial y novedades
    js=open(REPO+'/app.js').read();nov=json.load(open(REPO+'/version.json'))
    check('guía de uso: portero, tamaño, flecha discontinua y horizontal','<b>Portero</b>' in js and '<b>Tamaño de las fichas</b>' in js and '<b>flecha discontinua</b>' in js and 'Toda la app se puede usar en horizontal' in js)
    check('tutorial menciona tamaño y flecha discontinua','con − / + haz las fichas' in js)
    t=' '.join(x['texto'] for x in nov['novedades'])
    check('novedades 11.26 (PARA TODOS)',nov['version']=='11.26' and 'Portero' in t and 'discontinua' in t and 'horizontal' in t and all(x['texto'].startswith('✅ PARA TODOS') for x in nov['novedades']))
    # ---- móvil vertical: botón portero y tamaño caben
    m=b.new_context(viewport={'width':375,'height':812},device_scale_factor=2,has_touch=True,is_mobile=True).new_page()
    m.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)))
    login(m);m.tap('[data-tab=pizarra]');m.wait_for_selector('#bcanvas');m.wait_for_timeout(300)
    check('móvil: sin desplazamiento lateral',m.evaluate('document.documentElement.scrollWidth')<=375)
    g=m.locator('[data-b=add][data-v=gk]').bounding_box();check('móvil: botón Portero dentro de pantalla',g and g['x']>=0 and g['x']+g['width']<=375,g)
    t=m.locator('.btsz').bounding_box();check('móvil: control de tamaño dentro de pantalla',t and t['x']>=0 and t['x']+t['width']<=375,t)
    m.tap('[data-b=add][data-v=gk]');m.wait_for_timeout(150);mb=m.locator('.bmenu').bounding_box()
    check('móvil: menú del portero dentro de pantalla',mb and mb['x']>=0 and mb['x']+mb['width']<=375,mb)
    m.screenshot(path=OUT+'/pizarraabp_movil_menu.png')
    m.tap('.bmenu [data-b=addgk][data-v=own]');m.wait_for_timeout(100);m.evaluate('window.scrollTo(0,0)')
    m.screenshot(path=OUT+'/pizarraabp_movil.png',full_page=True)
    # ---- móvil girado (horizontal): barra de secciones a la izquierda y nada se sale
    for vp in [{'width':812,'height':375},{'width':932,'height':430}]:
        h=b.new_context(viewport=vp,has_touch=True).new_page();h.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)));login(h);W=vp['width']
        d=h.locator('.dock').bounding_box()
        check(f'móvil girado {W}: secciones a la izquierda',d and d['x']<=1 and d['width']<110 and d['height']>=vp['height']-2,d)
        bad=[]
        for t in ['plantilla','partidos','resumen']:
            h.locator(f'[data-tab={t}]:visible').first.click();h.wait_for_timeout(300)
            if h.evaluate('document.documentElement.scrollWidth')>W+1:bad.append(t)
        h.locator('[data-tab=partidos]:visible').first.click();h.wait_for_timeout(300);h.click('[data-action=add-match]');h.wait_for_timeout(500)
        if h.evaluate('document.documentElement.scrollWidth')>W+1:bad.append('nuevo partido')
        check(f'móvil girado {W}: ninguna pantalla se sale de lado',not bad,bad)
        hd=h.evaluate("getComputedStyle(document.querySelector('.head')).position");check(f'móvil girado {W}: la cabecera no tapa (no fija)',hd!='sticky',hd)
        if W==812:h.screenshot(path=OUT+'/pizarraabp_movil_girado_partido.png')
        h.close()
    check('sin errores de consola',not errs,errs)
    b.close()
print('RESUMEN:',sum(res),'/',len(res))
