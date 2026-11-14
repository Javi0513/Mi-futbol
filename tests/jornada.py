# Jornada de cada partido (v11.32): competición + jornada/ronda, en la lista, resumen, WhatsApp, búsqueda y Directo.
import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json
from urllib.parse import unquote
from playwright.sync_api import sync_playwright
import re
# Supabase simulado del directo (el mismo de datos.py): update/insert con .select() y rpc ver_directo
FAKE2=re.search(r'FAKE=r"""(.*?)"""',open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'datos.py'),encoding='utf-8').read(),re.S).group(1)
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8871),functools.partial(type('Q',(http.server.SimpleHTTPRequestHandler,),{'log_message':lambda *a:None}),directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
NOM=['Hugo','Leo','Mario','Pablo','Dani','Álex','Iker','Nico','Saúl']
J=[{'id':f'j{i}','owner_id':'u1','modalidad':'7','nombre':n,'dorsal':i+1,'foto':'','created_at':''} for i,n in enumerate(NOM)]
PART=json.dumps([{'id':f'j{i}','minutes':50,'goals':1 if i==3 else 0,'starter':i<7} for i in range(9)])
M=[{'id':'m1','owner_id':'u1','modalidad':'7','fecha':'2026-11-08','rival':'Los Pinos','participaciones':PART,'alineacion':json.dumps({'formation':'2-3-1','slots':{},'resultado':{'gf':2,'gc':1},'jornada':{'t':'liga','n':'7'}}),'created_at':''},
   {'id':'m2','owner_id':'u1','modalidad':'7','fecha':'2026-11-01','rival':'Real Norte','participaciones':PART,'alineacion':json.dumps({'formation':'2-3-1','slots':{},'resultado':{'gf':0,'gc':0}}),'created_at':''}]
SEED='window.__seed='+json.dumps({'futbol_personal_jugadores':J,'futbol_personal_partidos':M,'perfiles':[{'id':'u1','plan':'gratis'}]})+';'
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block',device_scale_factor=2)
    pg=ctx.new_page();pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.add_init_script(SEED)
    pg.add_init_script("try{localStorage.setItem('mf_version_abierta','99');localStorage.setItem('mf_tut_visto','1')}catch(e){}")
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE2))
    pg.goto('http://127.0.0.1:8871/index.html')
    pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto1');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)')
    pg.wait_for_timeout(1200)
    while pg.locator('#info').is_visible():
        pg.click('#closeInfo');pg.wait_for_timeout(200)
    pg.click('[data-tab=partidos]');pg.wait_for_timeout(400)
    row=pg.locator('[data-mid=m1]').inner_text()
    check('la lista de partidos muestra la jornada',pg.locator('[data-mid=m1] small.jor').inner_text().lower()=='jornada 7',row[:80])
    check('un partido sin jornada no muestra nada',pg.locator('[data-mid=m2] small.jor').count()==0)
    pg.screenshot(path=os.path.join(OUT,'jornada-1-lista.png'))
    pg.click('[data-rs=m1]');pg.wait_for_timeout(400)
    check('el resumen lleva la jornada','Jornada 7' in pg.locator('#infoBody .rs-m').inner_text())
    t=unquote(pg.get_attribute('[data-rsx=wa]','href').split('text=')[1])
    check('el WhatsApp del resumen lleva la jornada','Jornada 7' in t.split('\n')[1],t.split('\n')[1])
    pg.click('#closeInfo');pg.wait_for_timeout(200)
    # partido nuevo: propone la jornada siguiente
    pg.click('[data-action=add-match] >> nth=0')
    pg.wait_for_timeout(400)
    check('partido nuevo: propone Liga y la jornada siguiente',pg.input_value('#jorT')=='liga' and pg.input_value('#jorN')=='8',(pg.input_value('#jorT'),pg.input_value('#jorN')))
    pg.screenshot(path=os.path.join(OUT,'jornada-2-nuevo.png'))
    pg.click('[data-action=cancel]');pg.wait_for_timeout(300)
    if pg.locator('#info').is_visible(): pg.click('#closeInfo')
    # editar el otro: Copa · Octavos
    pg.click('[data-action=edit-match][data-id=m2]');pg.wait_for_timeout(400)
    check('al editar un partido sin jornada sale «Sin indicar»',pg.input_value('#jorT')=='' and pg.input_value('#jorN')=='')
    pg.select_option('#jorT','copa');pg.fill('#jorN','Octavos');pg.wait_for_timeout(100)
    pg.click('[data-action=save]');pg.wait_for_timeout(800)
    al=pg.evaluate("JSON.parse(JSON.stringify(window.__db?window.__db.futbol_personal_partidos.find(m=>m.id==='m2').alineacion:null))")
    al=json.loads(al) if isinstance(al,str) else al
    check('se guarda dentro de la alineación (sin SQL)',al and al.get('jornada')=={'t':'copa','n':'Octavos'},al and al.get('jornada'))
    check('la lista muestra «Copa · Octavos»',pg.locator('[data-mid=m2] small.jor').count()==1 and pg.locator('[data-mid=m2] small.jor').inner_text().lower()=='copa · octavos')
    # búsqueda
    pg.click('#sbtn')
    pg.wait_for_timeout(200)
    if pg.locator('#sq').count():
        pg.fill('#sq','jornada 7');pg.wait_for_timeout(300)
        check('la lupa encuentra «jornada 7»','Los Pinos' in pg.locator('#sres').inner_text(),pg.locator('#sres').inner_text()[:100])
        pg.click('[data-sclose]')
    else: check('la lupa encuentra «jornada 7»',False,'sin buscador')
    # Directo
    pg.click('[data-action=live][data-id=m1]');pg.wait_for_timeout(600)
    check('el Directo muestra la jornada','Jornada 7' in pg.locator('section.live .bar').inner_text())
    d=pg.evaluate("(window.__db&&window.__db.directos||[]).find(x=>x.partido_id==='m1')")
    check('y la guarda para el enlace de la familia',d and d.get('jornada')=='Jornada 7',d and d.get('jornada'))
    pg.screenshot(path=os.path.join(OUT,'jornada-3-directo.png'))
    did=d and d.get('id')
    pub=b.new_context(viewport={'width':390,'height':844},service_workers='block').new_page();pub.on('pageerror',lambda e:errs.append(str(e)))
    pub.add_init_script('window.__seed='+json.dumps({'directos':[d] if d else []})+';')
    pub.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE2))
    pub.goto('http://127.0.0.1:8871/index.html?directo='+str(did));pub.wait_for_selector('#pub .lv-board')
    check('el enlace de la familia muestra la jornada','jornada 7' in pub.locator('#pub .kicker').first.inner_text().lower(),pub.locator('#pub .kicker').first.inner_text())
    pub.screenshot(path=os.path.join(OUT,'jornada-4-enlace-familia.png'))
    b.close()
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
sys.exit(0 if all(res) and not errs else 1)
