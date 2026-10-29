import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import sys;pass;import fonts
import http.server,threading,functools,json
from playwright.sync_api import sync_playwright
from PIL import Image
# v9.3/9.4: dorsales + fichas (jugadores, rivales, balón, conos, vallas…) + jugada por pasos animada + vídeo.
FAKE=open(TESTS+'/run.py').read().split('FAKE = r"""')[1].split('"""')[0]
src=open(TESTS+'/feat.py').read();SEED=src.split('SEED="""')[1].split('"""')[0]
N7=['Adri leon','Antonio Miguel','Camacho','Capi','Chamako','Chinchilla','Chuches','David','Edu wadro'];N11=N7+['German','Hugo','Jairo','Javier Casado']
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8796),functools.partial(http.server.SimpleHTTPRequestHandler,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
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
def tapc(pg,q):
    see(pg);a=at(pg,q);pg.mouse.click(*a);pg.wait_for_timeout(80)
def login(pg):
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    pg.goto('http://127.0.0.1:8796/index.html');pg.evaluate(SEED,[N7,N11])
    pg.evaluate("window.__db.futbol_personal_jugadores.find(p=>p.id==='a1').dorsal=10")
    pg.fill('input[name=email]','c@x.es');pg.fill('input[name=password]','secreto1');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)');pg.wait_for_timeout(1500)
with sync_playwright() as p:
    b=p.chromium.launch();ctx=b.new_context(viewport={'width':1100,'height':900},accept_downloads=True);pg=ctx.new_page()
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    # pizarra guardada con el formato antiguo (alineación de fondo): pasa a fichas
    pg.add_init_script("if(!localStorage.getItem('mf_old_done')){localStorage.setItem('mf_pizarra_v1',JSON.stringify({'7':{strokes:[{c:'#fff',t:'pen',p:[[.1,.1],[.2,.2]]}],bg:'m1',color:'#ffd60a',tool:'pen'}}));localStorage.setItem('mf_old_done','1')}")
    login(pg)
    # ---- dorsales en la plantilla
    rows=pg.locator('#view .row .info strong').all_inner_texts();print(rows)
    check('plantilla: dorsal junto al nombre','10Antonio Miguel' in [r.replace('\n','') for r in rows] and pg.locator('.dor').count()==1)
    pg.click('[data-action=edit-player][data-id=a2]');pg.wait_for_selector('#modal:not(.hidden)');pg.wait_for_timeout(150)
    check('formulario tiene campo dorsal',pg.locator('#playerForm input[name=dorsal]').count()==1)
    pg.fill('#playerForm input[name=dorsal]','7');pg.click('#playerForm .primary');pg.wait_for_selector('#message:has-text("Jugador guardado")')
    try:pg.wait_for_function("window.__db.futbol_personal_jugadores.find(p=>p.id==='a2').dorsal===7",timeout=3000)
    except Exception:print('LOG',pg.evaluate('window.__log'),pg.inner_text('#message'))
    j=pg.evaluate("window.__db.futbol_personal_jugadores.find(p=>p.id==='a2')")
    check('guardar dorsal 7',j.get('dorsal')==7,j.get('dorsal'))
    pg.click('[data-action=edit-player][data-id=a2]');pg.wait_for_selector('#modal:not(.hidden)');pg.wait_for_timeout(150)
    check('editar muestra el dorsal',pg.input_value('#playerForm input[name=dorsal]')=='7')
    pg.fill('#playerForm input[name=dorsal]','120');pg.click('#playerForm .primary');pg.wait_for_timeout(300)
    check('dorsal fuera de rango no se guarda',pg.evaluate("window.__db.futbol_personal_jugadores.find(p=>p.id==='a2').dorsal")==7 and pg.locator('#modal:not(.hidden)').count()==1)
    pg.fill('#playerForm input[name=dorsal]','');pg.click('#playerForm .primary');pg.wait_for_timeout(300)
    check('dorsal vacío = sin dorsal',pg.evaluate("window.__db.futbol_personal_jugadores.find(p=>p.id==='a2').dorsal")is None)
    # ---- dorsal en la alineación del partido
    pg.click('[data-tab=partidos]');pg.locator('[data-action=edit-match]').first.click() if pg.locator('[data-action=edit-match]').count() else pg.locator('#view .row').first.click()
    pg.wait_for_timeout(400)
    txt=pg.locator('.slot button.fill').all_inner_texts();print('slots',txt)
    check('alineación: ficha con dorsal 10','10' in [t.strip() for t in txt])
    check('alineación: foto lleva su dorsal si lo tiene',pg.locator('.slot button.fill img').count()>=1)
    pg.locator('[data-action=cancel]').first.click();pg.wait_for_timeout(200)
    # ---- pizarra
    pg.click('[data-tab=pizarra]');pg.wait_for_selector('#bcanvas');pg.wait_for_timeout(400)
    it=items(pg);s=store(pg)
    check('formato antiguo: alineación de fondo pasa a 7 fichas',len([i for i in it if i['k']=='own' and i['pid']])==7 and s.get('bg')=='' and len(s['strokes'])==1,(len(it),s.get('bg')))
    pg.click('[data-b=clear]');check('borrar todo quita fichas y trazos',not items(pg) and not store(pg)['strokes'])
    pg.click('[data-b=undo]');check('deshacer devuelve las fichas',len(items(pg))==7)
    pg.click('[data-b=clear]')
    # añadir jugador de la plantilla
    pg.click('[data-b=add][data-v=own]');check('menú de jugadores',pg.locator('.bmenu button').count()==1+len(N7),pg.locator('.bmenu button').count())
    pg.locator('.bmenu button',has_text='Antonio Miguel').click();pg.wait_for_timeout(100)
    it=items(pg);check('ficha del jugador con su id',len(it)==1 and it[0]['pid']=='a1' and it[0]['k']=='own')
    pg.click('[data-b=add][data-v=own]');check('el que ya está no se repite en el menú',pg.locator('.bmenu button',has_text='Antonio Miguel').count()==0)
    pg.locator('.bmenu button').first.click()
    pg.click('[data-b=add][data-v=own]');pg.locator('.bmenu button').first.click()
    it=items(pg);check('fichas con número 1 y 2',[i['n'] for i in it if not i['pid']]==['1','2'],[i['n'] for i in it])
    for k in ['riv','riv','ball','cone','cone','hurdle','pole','goal']:pg.click(f'[data-b=add][data-v={k}]')
    it=items(pg);check('añadir rivales, balón y material',[i['k'] for i in it][3:]==['riv','riv','ball','cone','cone','hurdle','pole','goal'] and [i['n'] for i in it if i['k']=='riv']==['1','2'])
    pg.keyboard.press('Escape')
    # arrastrar
    ball=[i for i in it if i['k']=='ball'][0];q=ball['p'][0]
    drag(pg,q,(0.5,0.85));nb=[i for i in items(pg) if i['k']=='ball'][0]['p'][0]
    check('arrastrar el balón',abs(nb[0]-0.5)<0.02 and abs(nb[1]-0.85)<0.02,nb)
    check('arrastrar no dibuja línea',len(store(pg)['strokes'])==0)
    pg.click('[data-b=undo]');nb=[i for i in items(pg) if i['k']=='ball'][0]['p'][0]
    check('deshacer devuelve el balón',abs(nb[0]-q[0])<0.01 and abs(nb[1]-q[1])<0.01,nb)
    drag(pg,q,(0.5,0.85))
    # girar valla tocándola
    h=[i for i in items(pg) if i['k']=='hurdle'][0];tapc(pg,h['p'][0])
    check('tocar la valla la gira 45°',[i for i in items(pg) if i['k']=='hurdle'][0]['r']==45)
    # dibujar fuera de las fichas sigue funcionando
    check('por defecto «Mover»',store(pg).get('tool')=='move' or pg.get_attribute('[data-b=tool][data-v=move]','aria-pressed')=='true')
    drag(pg,(0.08,0.95),(0.3,0.97));check('con «Mover» arrastrar en hueco no pinta',len(store(pg)['strokes'])==0)
    pg.click('[data-b=tool][data-v=pen]')
    o=[i for i in items(pg) if i['pid']=='a1'][0]['p'][0];drag(pg,o,(o[0]+.05,o[1]+.05));check('con el lápiz, arrastrar una ficha la mueve y no pinta',len(store(pg)['strokes'])==0)
    drag(pg,(0.08,0.95),(0.3,0.97));check('lápiz sigue dibujando en hueco',len(store(pg)['strokes'])==1)
    pg.click('[data-b=tool][data-v=move]')
    # jugada por pasos
    check('empieza en paso 1/1','Paso 1 / 1' in pg.inner_text('.bst-n'))
    pg.click('[data-b=addstep]');s=store(pg)
    check('+ Paso crea paso 2 copiando posiciones',s['steps']==2 and s['step']==1 and all(i['p'][0]==i['p'][1] for i in s['items']))
    own=[i for i in items(pg) if i['pid']=='a1'][0];drag(pg,own['p'][1],(0.3,0.3))
    own=[i for i in items(pg) if i['pid']=='a1'][0]
    check('mover en paso 2 no cambia el paso 1',own['p'][0]!=own['p'][1] and abs(own['p'][1][0]-0.3)<0.02,own['p'])
    nb=[i for i in items(pg) if i['k']=='ball'][0];drag(pg,nb['p'][1],(0.3,0.36))
    pg.click('[data-b=addstep]');own=[i for i in items(pg) if i['pid']=='a1'][0];drag(pg,own['p'][2],(0.6,0.15))
    check('3 pasos','Paso 3 / 3' in pg.inner_text('.bst-n'))
    pg.screenshot(path=OUT+'/pizarra2_pasos.png')
    pg.click('[data-b=prev]');check('‹ vuelve al paso 2',store(pg)['step']==1)
    pg.click('[data-b=next]');check('› va al paso 3',store(pg)['step']==2)
    # reproducir
    pg.click('[data-b=play]');pg.wait_for_timeout(500)
    check('Ver jugada: botón Parar y pasos bloqueados','PARAR' in pg.get_attribute('[data-b=play]','aria-label').upper() and pg.locator('[data-b=addstep][disabled]').count()==1)
    shot1=pg.locator('#bcanvas').screenshot();pg.wait_for_timeout(400);shot2=pg.locator('#bcanvas').screenshot()
    check('la jugada se mueve (el dibujo cambia)',shot1!=shot2)
    pg.wait_for_timeout(2600)
    check('al acabar vuelve a «Ver jugada» en el último paso','VER JUGADA' in pg.get_attribute('[data-b=play]','aria-label').upper() and store(pg)['step']==2)
    pg.click('[data-b=play]');pg.wait_for_timeout(300);pg.click('[data-b=play]');pg.wait_for_timeout(200)
    check('Parar detiene la jugada','VER JUGADA' in pg.get_attribute('[data-b=play]','aria-label').upper())
    # quitar paso
    pg.click('[data-b=delstep]');s=store(pg);check('quitar paso',s['steps']==2 and all(len(i['p'])==2 for i in s['items']))
    pg.click('[data-b=undo]');check('deshacer devuelve el paso',store(pg)['steps']==3)
    # goma quita fichas
    pg.click('[data-b=tool][data-v=erase]');c=[i for i in items(pg) if i['k']=='cone'][0];n0=len(items(pg))
    tapc(pg,c['p'][2]);check('goma quita la ficha tocada',len(items(pg))==n0-1)
    pg.click('[data-b=undo]');check('deshacer devuelve la ficha',len(items(pg))==n0)
    pg.click('[data-b=tool][data-v=pen]')
    # persistencia
    pg.reload();login(pg);pg.click('[data-tab=pizarra]');pg.wait_for_timeout(400)
    check('fichas y pasos sobreviven a recargar',len(items(pg))==n0 and 'Paso 3 / 3' in pg.inner_text('.bst-n'))
    # poner titulares
    pg.select_option('#boardBg',index=1);pg.wait_for_timeout(200);it=items(pg)
    check('poner titulares cambia jugadores, deja rivales y material',len([i for i in it if i['k']=='own'])==7 and len([i for i in it if i['k']=='riv'])==2 and all(len(i['p'])==3 for i in it))
    # imagen
    with pg.expect_download() as d:pg.click('[data-b=img]')
    dl=d.value;path=OUT+'/pizarra2_img.png';dl.save_as(path);im=Image.open(path).convert('RGB')
    check('imagen 1080x1520',im.size==(1080,1520))
    # vídeo
    with pg.expect_download(timeout=20000) as d:pg.click('[data-b=video]')
    dl=d.value;vp=OUT+'/'+dl.suggested_filename;dl.save_as(vp)
    check('vídeo de la jugada',dl.suggested_filename.startswith('jugada-f7-') and os.path.getsize(vp)>20000,(dl.suggested_filename,os.path.getsize(vp)))
    # F11 independiente
    pg.click('[data-mode="11"]');pg.click('[data-tab=pizarra]');pg.wait_for_timeout(200)
    check('F11 empieza vacía','Paso 1 / 1' in pg.inner_text('.bst-n') and not items(pg,'11'))
    pg.click('[data-b=video]');pg.wait_for_timeout(200);check('vídeo sin pasos avisa','al menos un paso' in pg.inner_text('#message'))
    pg.click('[data-mode="7"]');pg.click('[data-tab=pizarra]');pg.wait_for_timeout(200)
    # presentar
    pg.click('[data-b=present]');pg.wait_for_timeout(400);pf=pg.locator('#bfield').bounding_box()
    check('presentar: campo cabe',pf['y']>=0 and pf['y']+pf['height']<=901,pf)
    pg.screenshot(path=OUT+'/pizarra2_present.png');pg.keyboard.press('Escape')
    # guía y novedades
    nov=json.load(open(REPO+'/version.json'))
    check('novedades al día (9.8: precio y máximo de vídeo)',nov['version']=='9.8' and any('25 personas' in (x if isinstance(x,str) else x['texto']) for x in nov['novedades']))
    js=open(REPO+'/app.js').read()
    check('guía de uso explica pasos y conos','fila «Paso»' in js and 'conos, vallas' in js)
    # móvil
    m=b.new_context(viewport={'width':375,'height':812},device_scale_factor=2,has_touch=True,is_mobile=True).new_page()
    m.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)))
    login(m);m.tap('[data-tab=pizarra]');m.wait_for_selector('#bcanvas');m.wait_for_timeout(400)
    m.tap('[data-b=add][data-v=own]');m.wait_for_timeout(150)
    mb=m.locator('.bmenu').bounding_box();check('móvil: menú de jugadores dentro de pantalla',mb and mb['x']>=0 and mb['x']+mb['width']<=375 and mb['y']>=0,mb)
    m.screenshot(path=OUT+'/pizarra2_movil_menu.png')
    m.locator('.bmenu button').nth(2).tap();m.wait_for_timeout(100)
    m.locator('[data-b=add][data-v=cone]').tap();m.wait_for_timeout(100)
    check('móvil: añadir fichas',len(items(m))==2)
    see(m);it=items(m)[0];bb=m.locator('#bcanvas').bounding_box();cdp=m.context.new_cdp_session(m)
    a=(bb['x']+bb['width']*it['p'][0][0],bb['y']+bb['height']*it['p'][0][1]);sy=m.evaluate('window.scrollY')
    cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':a[0],'y':a[1]}]})
    for i in range(1,12):cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':a[0]-i*6,'y':a[1]+i*12}]})
    cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});m.wait_for_timeout(100)
    q=items(m)[0]['p'][0];check('móvil: arrastrar con el dedo',q[1]>it['p'][0][1]+0.1 and abs(m.evaluate('window.scrollY')-sy)<2,q)
    m.evaluate('window.scrollTo(0,0)');m.wait_for_timeout(100);m.screenshot(path=OUT+'/pizarra2_movil.png',full_page=True)
    tb=m.locator('.bsteps').bounding_box();check('móvil: fila de jugada no se sale',tb['x']>=0 and tb['x']+tb['width']<=375,tb)
    check('móvil: sin desplazamiento horizontal',m.evaluate('document.documentElement.scrollWidth')<=375)
    check('móvil vertical: campo en vertical',m.locator('#boardPanel.land').count()==0)
    # horizontal
    check('ordenador: campo en horizontal',pg.locator('#boardPanel.land').count()==1)
    fb=pg.locator('#bfield').bounding_box();check('horizontal: campo más ancho que alto y visible',fb['width']>fb['height']*1.3 and fb['height']>300,fb)
    o=[i for i in items(pg) if i['k']=='own'][0];q0=o['p'][store(pg)['step']];drag(pg,q0,(q0[0],min(.95,q0[1]+.15)))
    q1=[i for i in items(pg) if i['id']==o['id']][0]['p'][store(pg)['step']]
    check('horizontal: arrastrar guarda la posición como en vertical',abs(q1[1]-min(.95,q0[1]+.15))<.03 and abs(q1[0]-q0[0])<.03,(q0,q1))
    m.set_viewport_size({'width':812,'height':375});m.wait_for_timeout(500)
    check('móvil girado: pizarra en horizontal a pantalla completa',m.locator('#boardPanel.land.present').count()==1)
    fb=m.locator('#bfield').bounding_box();check('móvil girado: el campo cabe en la pantalla',fb['y']>=0 and fb['y']+fb['height']<=376 and fb['x']>=0 and fb['x']+fb['width']<=813,fb)
    m.screenshot(path=OUT+'/pizarra2_movil_horizontal.png')
    m.tap('[data-b=present]');m.wait_for_timeout(300);check('móvil girado: la X sale de pantalla completa',m.locator('#boardPanel.present').count()==0)
    m.set_viewport_size({'width':375,'height':812});m.wait_for_timeout(400)
    check('volver a vertical: campo vertical y sin pantalla completa',m.locator('#boardPanel.land').count()==0 and m.locator('#boardPanel.present').count()==0)
    check('sin errores de consola',not errs,errs)
    b.close()
print('RESUMEN:',sum(res),'/',len(res))
