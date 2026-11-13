import sys,os,re;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json,urllib.parse
from playwright.sync_api import sync_playwright
# Enlaces del directo antes del partido (v11.19): desde «Partidos» el entrenador prepara el enlace
# para la familia y el del anotador sin abrir el Directo; son los mismos cuando empieza el partido.
# Usa el Supabase simulado de anotador.py.
FAKE=re.search(r'FAKE=r"""(.*?)"""',open(os.path.join(TESTS,'anotador.py'),encoding='utf-8').read(),re.S).group(1)
P=[{'id':f'p{i}','owner_id':'u1','modalidad':'fs','nombre':f'J{i}','dorsal':str(i+1),'foto':'','created_at':''} for i in range(8)]
PART=json.dumps([{'id':f'p{i}','nombre':f'J{i}','minutes':0,'goals':0,'starter':i<5} for i in range(8)])
AL=json.dumps({'conv':{'hora':'10:30','lugar':'Pabellón Norte'}})
def M(i,res=False):return{'id':f'm{i}','owner_id':'u1','modalidad':'fs','fecha':'2026-12-0'+str(i),'rival':f'Rival {i}','participaciones':PART,'alineacion':json.dumps({'resultado':{'gf':2,'gc':1}}) if res else AL,'created_at':''}
def SEED(plan='gratis',n=4):return{'futbol_personal_jugadores':P,'futbol_personal_partidos':[M(i) for i in range(1,n+1)]+[M(9,True)],'perfiles':[{'id':'u1','plan':plan}]}
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8836),functools.partial(H,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8836/index.html'
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
def page(b,seed,extra=''):
    pg=b.new_context(viewport={'width':390,'height':844},service_workers='block').new_page()
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)))
    pg.on('dialog',lambda d:d.accept())
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    pg.add_init_script('window.__seed='+json.dumps(seed)+';try{localStorage.setItem("mf_mode","fs")}catch(e){}'+extra)
    return pg
def login(pg):
    pg.goto(URL);pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto12');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)');pg.wait_for_timeout(300)
    if pg.locator('#info').is_visible():pg.click('#closeInfo');pg.wait_for_timeout(100)
    if pg.locator('[data-mode="fs"]').count():pg.click('[data-mode="fs"]')
    pg.click('[data-tab=partidos]');pg.wait_for_timeout(200)
DIR=lambda pg:pg.evaluate('window.__db.directos||[]')
WA=lambda pg,k:urllib.parse.unquote(pg.get_attribute(f'#infoBody [data-pe={k}]','href') or '')
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=page(b,SEED());login(pg)
    bt=pg.locator('[data-peo=m1]')
    check('en un partido sin jugar sale «Preparar enlaces del directo»',bt.count()==1 and 'Preparar enlaces' in bt.inner_text(),bt.count())
    check('en un partido ya jugado no sale',pg.locator('[data-peo=m9]').count()==0)
    bt.click();pg.wait_for_timeout(400)
    check('abre «Enlaces del directo»',pg.locator('#infoTitle').inner_text().lower()=='enlaces del directo')
    d=DIR(pg)
    check('crea el directo sin empezar (sin abrir el Directo)',len(d)==1 and d[0]['estado']=='pre' and d[0]['partido_id']=='m1',d)
    lid=d[0]['id']
    check('la casilla tiene el enlace del directo',pg.input_value('#infoBody [data-peurl=f]').endswith('?directo='+lid))
    w=WA(pg,'wa-f')
    check('el WhatsApp para la familia lleva enlace, rival, día, hora y lugar',all(x in w for x in ('?directo='+lid,'Rival 1','10:30','Pabellón Norte','se pone en marcha solo')),w[:300])
    check('el directo no se ha abierto',pg.locator('.panel.live').count()==0)
    pg.click('#infoBody [data-pe=an-on]');pg.wait_for_timeout(400)
    d=DIR(pg)[0]
    check('«Crear enlace de anotador» crea el código y los convocados',bool(d.get('anotador')) and len(d.get('anot_jug') or [])==8,d.get('anot_jug'))
    w=WA(pg,'wa-a')
    check('WhatsApp para el anotador con su enlace','?anotar='+d['anotador'] in w and 'Anotador' in w,w[:200])
    check('el enlace del anotador no va en el mensaje de la familia','?anotar=' not in WA(pg,'wa-f'))
    pg.click('#closeInfo');pg.wait_for_timeout(200)
    check('después el botón dice «Enlaces del directo»',pg.locator('[data-peo=m1]').inner_text().strip()=='Enlaces del directo')
    pg.click('[data-action=live][data-id=m1]');pg.wait_for_timeout(400)
    d2=DIR(pg)
    check('al abrir el Directo son los mismos enlaces (no crea otro)',len(d2)==1 and d2[0]['id']==lid and pg.input_value('#lvUrl').endswith(lid) and pg.input_value('#anUrl').endswith(d['anotador']))
    pg.click('[data-live=close]');pg.wait_for_timeout(200)
    # límite del plan gratuito
    pg.click('[data-peo=m2]');pg.wait_for_timeout(300);pg.click('#closeInfo')
    pg.click('[data-peo=m3]');pg.wait_for_timeout(300);pg.click('#closeInfo')
    pg.click('[data-peo=m4]');pg.wait_for_timeout(300)
    check('gratis: el 4º partido del mes pide Pro',pg.locator('#infoTitle').inner_text().lower()=='plan pro' and '3 partidos al mes' in pg.locator('#infoBody').inner_text() and len(DIR(pg))==3,len(DIR(pg)))
    pg.click('#closeInfo');pg.click('[data-peo=m1]');pg.wait_for_timeout(300)
    check('volver a abrir uno ya preparado no gasta otro',pg.locator('#infoTitle').inner_text().lower()=='enlaces del directo')
    pg.click('#closeInfo')
    # convocatoria con el enlace del directo
    pg.click('[data-action=edit-match][data-id=m1]');pg.wait_for_timeout(300)
    check('al editar el partido sale «Enlaces del directo»',pg.locator('#view [data-peo=m1]').count()==1)
    pg.click('[data-cv=desde]');pg.wait_for_timeout(300)
    cb=pg.locator('#infoBody [data-cvdir]')
    check('la convocatoria del partido ofrece «Añadir el enlace del directo» (ya marcado)',cb.count()==1 and cb.is_checked())
    check('y el mensaje lleva el enlace','?directo='+lid in pg.locator('[data-cvt]').inner_text())
    cb.uncheck();pg.wait_for_timeout(200)
    check('desmarcado, el mensaje ya no lo lleva','?directo=' not in pg.locator('[data-cvt]').inner_text())
    pg.click('#closeInfo');pg.click('#view .savebar [data-action=cancel]');pg.wait_for_timeout(200)
    # cambio de rival al guardar: el directo se pone al día
    pg.click('[data-action=edit-match][data-id=m1]');pg.wait_for_timeout(300)
    pg.fill('#rival','Rival Nuevo');pg.click('#view [data-action=save]');pg.wait_for_timeout(600)
    check('al guardar el partido, el directo coge el rival nuevo',[x for x in DIR(pg) if x['partido_id']=='m1'][0]['rival']=='Rival Nuevo')
    # página pública antes de empezar
    pub=b.new_context(viewport={'width':390,'height':844},service_workers='block').new_page();pub.on('pageerror',lambda e:errs.append('PUB '+str(e)))
    pub.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    db=pg.evaluate('JSON.stringify(window.__db)')
    pub.add_init_script('window.__seed='+db+';')
    pub.goto(URL+'?directo='+lid);pub.wait_for_timeout(800)
    t=pub.locator('#pubData').inner_text()
    check('la familia ve el partido sin empezar y que se pondrá en marcha solo','aún no ha empezado' in t and 'rival nuevo' in t.lower(),t[:200])
    pub.context.close()
    pg.context.close()
    # v11.25: partido con 0-0 puesto por el Directo antes de empezar y convocatoria desde «Ver y enviar»
    sd=SEED('pro',2);sd['futbol_personal_partidos'][0]['alineacion']=json.dumps({'resultado':{'gf':0,'gc':0},'conv':{'hora':'18:30'}})
    sd['directos']=[{'id':'d1','partido_id':'m1','owner_id':'u1','estado':'pre','gf':0,'gc':0,'eventos':[],'rival':'Rival 1'}]
    conv=json.dumps({'rival':'rival 1','fecha':'2026-12-01','hora':'18:30','cita':'','lugar':'','nota':'','ids':['p0','p1']})
    pg=page(b,sd,'try{localStorage.setItem("mf_conv:u1:fs:",'+json.dumps(conv)+')}catch(e){}');login(pg)
    check('con 0-0 del Directo sin empezar sigue saliendo «Enlaces del directo»',pg.locator('[data-peo=m1]').count()==1)
    check('un partido jugado de verdad (sin directo) sigue sin botón',pg.locator('[data-peo=m9]').count()==0)
    pg.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('mf_conv:')).forEach(k=>localStorage.setItem(k,"+json.dumps(conv)+"))")
    pg.click('[data-tab=plantilla]');pg.click('[data-tab=partidos]');pg.wait_for_timeout(200)
    pg.click('[data-cv=abrir]');pg.wait_for_timeout(300)
    cb=pg.locator('#infoBody [data-cvdir]')
    check('la convocatoria de «Ver y enviar» ofrece el enlace del directo (ya marcado)',cb.count()==1 and cb.is_checked(),cb.count())
    check('y el mensaje lleva el enlace','?directo=d1' in pg.locator('[data-cvt]').inner_text())
    pg.click('#closeInfo')
    pg.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('mf_conv:')).forEach(k=>localStorage.setItem(k,"+json.dumps(conv.replace('2026-12-01','2026-12-02').replace('rival 1','Otro'))+"))")
    pg.click('[data-cv=abrir]');pg.wait_for_timeout(300)
    check('m2 sin directo: casilla sin marcar, al marcarla crea el enlace',pg.locator('#infoBody [data-cvdir]').count()==1 and not pg.locator('#infoBody [data-cvdir]').is_checked())
    pg.locator('#infoBody [data-cvdir]').check();pg.wait_for_timeout(500)
    check('y el mensaje lleva el enlace nuevo','?directo=' in pg.locator('[data-cvt]').inner_text() and any(x['partido_id']=='m2' for x in DIR(pg)))
    pg.click('#closeInfo')
    pg.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('mf_conv:')).forEach(k=>localStorage.setItem(k,"+json.dumps(conv.replace('2026-12-01','2027-01-20'))+"))")
    pg.click('[data-cv=abrir]');pg.wait_for_timeout(300)
    check('sin partido guardado ese día no sale la casilla',pg.locator('#infoBody [data-cvdir]').count()==0)
    pg.click('#closeInfo')
    pg.click('[data-action=live][data-id=m2]');pg.wait_for_timeout(400)
    pg.click('[data-live=close]');pg.wait_for_timeout(300)
    check('abrir el Directo sin empezar no pone «Empate 0-0»',pg.evaluate("(()=>{let m=window.__db.futbol_personal_partidos.find(z=>z.id==='m2');let a=typeof m.alineacion==='string'?JSON.parse(m.alineacion):m.alineacion;return !(a&&a.resultado)})()"))
    pg.context.close()
    # Pro: sin límite
    pg=page(b,SEED('pro',5));login(pg)
    for i in range(1,6):
        pg.click(f'[data-peo=m{i}]');pg.wait_for_timeout(250);pg.click('#closeInfo')
    check('Pro: enlaces preparados en todos los partidos',len(DIR(pg))==5,len(DIR(pg)))
    pg.context.close()
    b.close()
check('sin errores de página',not errs,errs[:3])
print('PASS' if all(res) else 'FAIL',sum(res),'/',len(res),errs[:3])
