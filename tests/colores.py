import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import sys;pass;import fonts
import http.server,threading,functools,json
from playwright.sync_api import sync_playwright
from PIL import Image
# v9.8: color de cada jugador en la pizarra (muestras + barra de color) y en la alineación.
FAKE=open(TESTS+'/run.py').read().split('FAKE = r"""')[1].split('"""')[0]
src=open(TESTS+'/feat.py').read();SEED=src.split('SEED="""')[1].split('"""')[0]
N7=['Adri leon','Antonio Miguel','Camacho','Capi','Chamako','Chinchilla','Chuches','David','Edu wadro'];N11=N7+['German','Hugo','Jairo','Javier Casado']
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8797),functools.partial(http.server.SimpleHTTPRequestHandler,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
def store(pg,k='7'):return json.loads(pg.evaluate("localStorage.getItem('mf_pizarra_v1')||'{}'")).get(k,{})
def items(pg,k='7'):return store(pg,k).get('items',[])
def see(pg):pg.evaluate("document.getElementById('bfield').scrollIntoView({block:'center'})");pg.wait_for_timeout(80)
def at(pg,q):
    b=pg.locator('#bcanvas').bounding_box()
    if pg.locator('#boardPanel.land').count():q=(q[1],1-q[0])
    return (b['x']+b['width']*q[0],b['y']+b['height']*q[1])
def tapc(pg,q):
    see(pg);a=at(pg,q);pg.mouse.click(*a);pg.wait_for_timeout(120)
def px(pg,q):
    """Color del canvas en la posición q (0..1)."""
    return pg.evaluate("""(q)=>{let c=document.getElementById('bcanvas'),l=document.getElementById('boardPanel').classList.contains('land');if(l)q=[q[1],1-q[0]];let u=Math.min(c.width,c.height)*0.038*0.7,d=c.getContext('2d').getImageData(Math.round(q[0]*c.width-u),Math.round(q[1]*c.height),1,1).data;return [d[0],d[1],d[2]]}""",list(q))
def near(a,b,t=40):return all(abs(x-y)<=t for x,y in zip(a,b))
def login(pg):
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    pg.goto('http://127.0.0.1:8797/index.html');pg.evaluate(SEED,[N7,N11])
    pg.fill('input[name=email]','c@x.es');pg.fill('input[name=password]','secreto1');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)');pg.wait_for_timeout(1500)
    if pg.locator('#info').is_visible():
        b=pg.locator('#info [data-acct=novedades-ok]')
        if b.count():b.click();pg.wait_for_timeout(150)
with sync_playwright() as p:
    b=p.chromium.launch();ctx=b.new_context(viewport={'width':1100,'height':900},accept_downloads=True);pg=ctx.new_page()
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    login(pg)
    # ---- pizarra
    pg.click('[data-tab=pizarra]');pg.wait_for_selector('#bcanvas');pg.wait_for_timeout(400)
    pg.click('[data-b=clear]')
    pg.click('[data-b=add][data-v=own]');pg.locator('.bmenu button').first.click()
    pg.click('[data-b=add][data-v=own]');pg.locator('.bmenu button').first.click()
    pg.click('[data-b=add][data-v=riv]')
    it=items(pg);q=it[0]['p'][0]
    check('ficha nueva sale verde',near(px(pg,q),(0x2b,0xe3,0x6a)),px(pg,q))
    tapc(pg,q)
    check('tocar un jugador abre su color',pg.locator('.bcolp').is_visible() and 'Color del jugador 1' in pg.inner_text('.bcolp'),pg.inner_text('.bcolp') if pg.locator('.bcolp').count() else '')
    pg.screenshot(path=OUT+'/colores_pizarra_abierto.png')
    pg.click('.bcolp [data-pc="#ff8a1f"]');pg.wait_for_timeout(150)
    it=items(pg)
    check('muestra naranja: se guarda en la ficha',it[0].get('c')=='#ff8a1f' and not it[1].get('c'),[i.get('c') for i in it])
    check('el campo pinta la ficha naranja',near(px(pg,q),(0xff,0x8a,0x1f)),px(pg,q))
    check('sigue abierto tras elegir',pg.locator('.bcolp').is_visible())
    # barra de color: azul (tono 220)
    pg.evaluate("""()=>{let r=document.querySelector('.bcolp .cpk-h');r.value=220;r.dispatchEvent(new Event('input',{bubbles:true}));r.dispatchEvent(new Event('change',{bubbles:true}))}""");pg.wait_for_timeout(150)
    c=items(pg)[0].get('c','');rgb=tuple(int(c[i:i+2],16) for i in (1,3,5)) if c else (0,0,0)
    check('barra de color cambia a azul',rgb[2]>200 and rgb[0]<80,c)
    check('el campo pinta el color de la barra',near(px(pg,q),rgb),(px(pg,q),rgb))
    pg.evaluate("""()=>{let r=document.querySelector('.bcolp .cpk-l');r.value=80;r.dispatchEvent(new Event('input',{bubbles:true}));r.dispatchEvent(new Event('change',{bubbles:true}))}""");pg.wait_for_timeout(150)
    c2=items(pg)[0].get('c','')
    check('barra claro/oscuro aclara el color',c2!=c and sum(int(c2[i:i+2],16) for i in (1,3,5))>sum(rgb),(c,c2))
    pg.click('.bcolp [data-pca=all]');pg.wait_for_timeout(150);it=items(pg)
    check('«A todos los míos» pinta a los dos y no al rival',it[0]['c']==c2 and it[1]['c']==c2 and not it[2].get('c'),[i.get('c') for i in it])
    pg.click('[data-b=add][data-v=own]');pg.locator('.bmenu button').first.click();it=items(pg)
    check('el siguiente jugador sale del color del equipo',it[-1].get('c')==c2)
    pg.click('.bcolp [data-pcx]');pg.wait_for_timeout(100);check('la X cierra el color',pg.locator('.bcolp').count()==0)
    # rival
    tapc(pg,it[2]['p'][0]);check('tocar un rival abre su color','rival' in pg.inner_text('.bcolp'))
    pg.click('.bcolp [data-pc="#ffffff"]');pg.wait_for_timeout(120)
    check('rival blanco',items(pg)[2]['c']=='#ffffff')
    pg.click('.bcolp [data-pc=""]');pg.wait_for_timeout(120)
    check('«Color normal» lo deja como estaba',not items(pg)[2].get('c') and near(px(pg,it[2]['p'][0]),(0xff,0x4d,0x5e)),px(pg,it[2]['p'][0]))
    tapc(pg,(0.1,0.95));check('tocar el campo cierra el color',pg.locator('.bcolp').count()==0)
    check('tocar el campo para cerrar no pinta',len(store(pg)['strokes'])==0)
    tapc(pg,it[2]['p'][0]);pg.click('.bcolp [data-pc="#ffffff"]');pg.wait_for_timeout(120);pg.click('.bcolp [data-pcx]');pg.wait_for_timeout(100)
    pg.click('[data-b=undo]');check('deshacer quita el cambio de color',not items(pg)[2].get('c'),items(pg)[2].get('c'))
    pg.reload();login(pg);pg.click('[data-tab=pizarra]');pg.wait_for_timeout(400)
    check('el color sobrevive a recargar',items(pg)[0].get('c')==c2 and store(pg).get('tcol',{}).get('own')==c2)
    with pg.expect_download() as d:pg.click('[data-b=img]')
    pth=OUT+'/colores_pizarra_img.png';d.value.save_as(pth);check('imagen de la pizarra se crea',Image.open(pth).size==(1080,1520))
    # ---- alineación
    pg.click('[data-tab=partidos]');pg.wait_for_timeout(300);mid=pg.locator('[data-action=edit-match]').first.get_attribute('data-id');pg.locator('[data-action=edit-match]').first.click();pg.wait_for_timeout(400)
    sl=pg.locator('.slot button.fill').first;i=sl.get_attribute('data-slot');sl.click();pg.wait_for_timeout(150)
    check('alineación: tocar un jugador muestra su color',pg.locator('.slotcol .cpk').is_visible() and 'Color de' in pg.inner_text('.slotcol h4'))
    pg.click('.slotcol [data-pc="#a855f7"]');pg.wait_for_timeout(150)
    bg=pg.evaluate(f"getComputedStyle(document.querySelector('button[data-slot=\"{i}\"]')).backgroundColor")
    check('alineación: la ficha se pone morada',bg=='rgb(168, 85, 247)',bg)
    other=pg.locator('.slot button.fill').nth(1).get_attribute('data-slot')
    bg2=pg.evaluate(f"getComputedStyle(document.querySelector('button[data-slot=\"{other}\"]')).backgroundColor")
    check('alineación: los demás siguen verdes',bg2=='rgb(43, 227, 106)',bg2)
    pg.screenshot(path=OUT+'/colores_alineacion.png',full_page=False)
    pg.evaluate("""()=>{let r=document.querySelector('.slotcol .cpk-h');r.value=0;r.dispatchEvent(new Event('input',{bubbles:true}))}""");pg.wait_for_timeout(80)
    bg=pg.evaluate(f"getComputedStyle(document.querySelector('button[data-slot=\"{i}\"]')).backgroundColor")
    check('alineación: la barra cambia el color mientras la mueves',bg.startswith('rgb(2') or bg.startswith('rgb(24'),bg)
    pg.evaluate("""()=>{let r=document.querySelector('.slotcol .cpk-h');r.dispatchEvent(new Event('change',{bubbles:true}))}""");pg.wait_for_timeout(120)
    pg.click('.slotcol [data-pca=all]');pg.wait_for_timeout(120)
    cols=pg.evaluate("[...document.querySelectorAll('.slot button.fill:not(.gk)')].map(b=>getComputedStyle(b).backgroundColor)")
    check('alineación: «a todo el equipo» los pinta igual',len(cols)>=5 and len(set(cols))==1 and cols[0]!='rgb(43, 227, 106)',cols[:3])
    gkb=pg.evaluate("(()=>{let b=document.querySelector('.slot button.fill.gk');return b?getComputedStyle(b).backgroundColor:''})()")
    check('alineación: el portero no coge el color del equipo',gkb=='rgb(251, 191, 36)',gkb)
    pg.locator('.slot button.fill').nth(1).click();pg.wait_for_timeout(100);pg.click('.slotcol [data-pc="#ffd60a"]');pg.wait_for_timeout(100)
    pg.click('[data-action=save]');pg.wait_for_timeout(800)
    al=pg.evaluate("(id)=>{let m=window.__db.futbol_personal_partidos.find(x=>x.id===id);return typeof m.alineacion==='string'?JSON.parse(m.alineacion):m.alineacion}",mid)
    check('alineación: colores guardados con el partido',al.get('color','').startswith('#') and '#ffd60a' in (al.get('colors') or {}).values(),(al.get('color'),al.get('colors')))
    with pg.expect_download() as d:pg.locator(f'[data-img="{mid}"]').click()
    pth=OUT+'/colores_alineacion_img.png';d.value.save_as(pth);im=Image.open(pth).convert('RGB')
    cnt=sum(1 for x in range(0,1080,4) for y in range(300,1400,4) if near(im.getpixel((x,y)),(0xff,0xd6,0x0a),20))
    check('imagen de la alineación lleva el amarillo',cnt>60,cnt)
    # pizarra: titulares con los colores de la alineación
    pg.click('[data-tab=pizarra]');pg.wait_for_timeout(300);pg.select_option('#boardBg',value=mid);pg.wait_for_timeout(200)
    cs=[i.get('c') for i in items(pg) if i['k']=='own']
    check('titulares en la pizarra con sus colores','#ffd60a' in cs and all(cs),cs)
    # ---- móvil
    m=b.new_context(viewport={'width':375,'height':812},device_scale_factor=2,has_touch=True,is_mobile=True).new_page()
    m.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)))
    login(m);m.tap('[data-tab=pizarra]');m.wait_for_selector('#bcanvas');m.wait_for_timeout(400)
    m.tap('[data-b=add][data-v=riv]');m.wait_for_timeout(100);q=items(m)[-1]['p'][0]
    see(m);a=at(m,q);m.touchscreen.tap(*a);m.wait_for_timeout(200)
    bb=m.locator('.bcolp').bounding_box() if m.locator('.bcolp').count() else None
    check('móvil: el color se abre y cabe en pantalla',bb and bb['x']>=0 and bb['x']+bb['width']<=375 and bb['y']+bb['height']<=812,bb)
    m.screenshot(path=OUT+'/colores_movil.png')
    m.tap('.bcolp [data-pc="#38bdf8"]');m.wait_for_timeout(120);check('móvil: elegir muestra',items(m)[-1].get('c')=='#38bdf8')
    # ---- guía y novedades
    js=open(REPO+'/app.js').read();nov=json.load(open(REPO+'/version.json'))
    check('guía de uso explica el color','<b>Color de los jugadores</b>' in js and '<b>Color de las fichas</b>' in js)
    check('novedades al día (desde 10.3)',float(nov['version'])>=10.3)
    check('sin errores de página',not [e for e in errs if 'PAGEERR' in e],errs[:3])
    b.close()
srv.shutdown()
print(f'\n{sum(res)}/{len(res)} correctas');sys.exit(0 if all(res) else 1)
