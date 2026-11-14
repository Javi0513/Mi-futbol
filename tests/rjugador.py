# Resumen de cada jugador en un partido (v11.34): ver y mandar solo lo de un jugador (a su familia).
import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json
from playwright.sync_api import sync_playwright
from fake2 import FAKE2
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8871),functools.partial(type('Q',(http.server.SimpleHTTPRequestHandler,),{'log_message':lambda *a:None}),directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
NOM=['Hugo','Leo','Mario','Pablo','Dani','Álex','Iker','Nico','Saúl']
J=[{'id':f'j{i}','owner_id':'u1','modalidad':'7','nombre':n,'dorsal':i+1,'foto':'','created_at':''} for i,n in enumerate(NOM)]
PART=[{'id':f'j{i}','minutes':[50,50,50,50,35,50,25,15,0][i],'goals':[0,0,0,2,1,0,0,0,-1][i],'starter':i<7} for i in range(9)]
PART[3]['st']={'rob':3,'tp':4,'tf':1,'asi':1,'per':2};PART[3]['loc']=[['rob',30,40,5],['gol',88,50,7],['tp',80,30,20],['tf',75,70,33],['gol',90,45,44]];PART[0]['st']={'par':6};PART[4]['st']={'asi':2,'per':1}
AL={'formation':'2-3-1','slots':{},'resultado':{'gf':3,'gc':1},'capitan':'j3','portero':'j0','parte':25,
    'cambios':[{'id':'c1','m':25,'sale':'j6','entra':'j7'},{'id':'c2','m':35,'sale':'j4','entra':'j8'}],
    'tarjetas':[{'id':'t1','m':30,'pid':'j5','c':'a'}],'estR':{'tir':5},'tarjetasR':[{'id':'r1','m':40,'d':'9','n':'Rubén','c':'a'}],
    'faltas':{'n1':2,'r1':3,'n2':1,'r2':4}}
M=[{'id':'m1','owner_id':'u1','modalidad':'7','fecha':'2026-11-08','rival':'Los Pinos','participaciones':json.dumps(PART),'alineacion':json.dumps(AL),'created_at':''}]
for k,(r,f) in enumerate([('Atlético Sur','2026-11-01'),('Real Norte','2026-10-25'),('CD Río','2026-10-18')]):
    M.append({'id':f'm{k+2}','owner_id':'u1','modalidad':'7','fecha':f,'rival':r,'participaciones':json.dumps([{'id':'j3','minutes':50,'goals':1,'starter':True}]),'alineacion':json.dumps({'resultado':{'gf':1,'gc':k}}),'created_at':''})
EV=[{'id':'e1','t':'f','m':7,'n':'Pablo','d':'4','pid':'j3','p':1},{'id':'e2','t':'c','m':18,'p':1},{'id':'e3','t':'f','m':31,'n':'Dani','d':'5','pid':'j4','p':2},{'id':'e4','t':'f','m':44,'n':'Pablo','d':'4','pid':'j3','p':2}]
D=[{'id':'00000000-0000-4000-8000-000000000001','owner_id':'u1','partido_id':'m1','modalidad':'7','equipo':'Mi equipo','rival':'Los Pinos','gf':3,'gc':1,'estado':'FIN','parte_min':25,'acum_ms':0,'desde':None,'eventos':EV}]
SEED='window.__seed='+json.dumps({'futbol_personal_jugadores':J,'futbol_personal_partidos':M,'directos':D,'perfiles':[{'id':'u1','plan':'gratis'}]})+';'
def abre(b,ancho=390,alto=844,pro=False):
    ctx=b.new_context(viewport={'width':ancho,'height':alto},service_workers='block',accept_downloads=True,device_scale_factor=2)
    pg=ctx.new_page();pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.add_init_script(SEED.replace("'gratis'","'pro'").replace('"gratis"','"pro"') if pro else SEED)
    pg.add_init_script("try{localStorage.setItem('mf_version_abierta','99');localStorage.setItem('mf_tut_visto','1')}catch(e){}")
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE2))
    pg.goto('http://127.0.0.1:8871/index.html')
    pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto1');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)')
    pg.wait_for_timeout(1200)
    while pg.locator('#info').is_visible():
        pg.click('#closeInfo');pg.wait_for_timeout(200)
    return ctx,pg
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx,pg=abre(b)
    pg.click('[data-tab=partidos]');pg.wait_for_timeout(400)
    pg.click('[data-rs=m1]');pg.wait_for_timeout(400)
    check('el resumen del partido tiene «Resumen de cada jugador»','resumen de cada jugador' in pg.locator('#infoBody').inner_text().lower() and pg.locator('#infoBody [data-rj^="m1|"]').count()==9)
    pg.locator('#infoBody .rj-l').scroll_into_view_if_needed();pg.screenshot(path=os.path.join(OUT,'rjugador-1-lista.png'))
    with pg.expect_download() as dl0: pg.click('[data-rsx=img]')
    check('arreglo: con un jugador en -1 goles (guardado así) el resumen y su imagen funcionan',dl0.value.suggested_filename.startswith('resumen-f7-los-pinos'))
    pg.click('[data-rj="m1|j3"]');pg.wait_for_timeout(700)
    t=pg.locator('#infoTitle').inner_text();body=pg.locator('#infoBody').inner_text()
    check('abre el resumen solo de ese jugador','pablo' in t.lower() and 'Hugo' not in body,t)
    check('titular, capitán, minutos y goles',all(w in body for w in ('Titular','Capitán',"50'","7'","44'")),body[:300])
    check('asistencias, tiros con a puerta, robos y pérdidas',all(w in body for w in ('Asistencias','5','4 a puerta','Robos','Pérdidas')))
    check('trae su mapa de calor y campograma',pg.locator('#infoBody #mapaHeat svg').count()==1 and 'campograma de tiro' in body.lower())
    check('vista previa de la imagen',pg.locator('#rjPrev img').count()==1)
    check('aviso del plan gratuito','te quedan 3 de 3 resúmenes de jugador' in body)
    from urllib.parse import unquote
    wa=unquote(pg.get_attribute('[data-rjx=wa]','href').split('text=')[1])
    check('texto de WhatsApp solo con lo suyo','Resumen de Pablo* (4)' in wa and 'Mi equipo 3 - 1 Los Pinos · Victoria' in wa and "Goles: 2 (7', 44')" in wa and 'Tiros: 5 (4 a puerta)' in wa and 'Hugo' not in wa,wa)
    pg.screenshot(path=os.path.join(OUT,'rjugador-2-modal.png'))
    pg.locator('#infoBody').evaluate('e=>e.scrollTop=e.scrollHeight');pg.wait_for_timeout(200)
    pg.screenshot(path=os.path.join(OUT,'rjugador-3-compartir.png'))
    with pg.expect_download() as dl: pg.click('[data-rjx=img]')
    f=os.path.join(OUT,'rjugador-imagen.png');dl.value.save_as(f)
    check('descarga la imagen del jugador',os.path.getsize(f)>40000 and dl.value.suggested_filename.startswith('resumen-pablo-los-pinos'),dl.value.suggested_filename)
    pg.wait_for_timeout(300)
    E="JSON.parse(Object.entries(localStorage).find(e=>e[0].startsWith('mf_envios'))[1])"
    check('compartir gasta 1 resumen de jugador (no de partido)',pg.evaluate(E+".rj.length")==1 and pg.evaluate(E+".rs.length")==1)
    pg.click('[data-rjx=copiar]');pg.wait_for_timeout(200)
    check('volver a mandar el mismo no gasta otro',pg.evaluate(E+".rj.length")==1)
    pg.click('#infoBody button[data-rs=m1]');pg.wait_for_timeout(300)
    check('«Resumen de todo el partido» vuelve al resumen','los pinos' in pg.locator('#infoTitle').inner_text().lower())
    # suplente con cambio
    pg.click('[data-rj="m1|j7"]');pg.wait_for_timeout(400)
    body=pg.locator('#infoBody').inner_text()
    check('suplente: dice cuándo entró','Suplente' in body and "entró 25'" in body,body[:200])
    check('sin mapa si no hay marcas',pg.locator('#infoBody #mapaHeat').count()==0)
    pg.click('[data-rjx=copiar]');pg.wait_for_timeout(200)
    pg.click('[data-rj="m1|j5"]') if pg.locator('[data-rj="m1|j5"]').count() else None
    pg.click('#infoBody button[data-rs=m1]');pg.wait_for_timeout(300);pg.click('[data-rj="m1|j5"]');pg.wait_for_timeout(400)
    body=pg.locator('#infoBody').inner_text()
    check('tarjeta con su minuto','Tarjetas' in body and "30'" in body and pg.locator('#infoBody .rj-st .tj.a').count()==1)
    pg.click('[data-rjx=copiar]');pg.wait_for_timeout(200)
    pg.click('#infoBody button[data-rs=m1]');pg.wait_for_timeout(300);pg.click('[data-rj="m1|j0"]');pg.wait_for_timeout(400)
    check('portero: sale «Portero» y sus paradas','Portero' in pg.locator('#infoBody').inner_text() and 'Paradas' in pg.locator('#infoBody').inner_text())
    pg.click('[data-rjx=copiar]');pg.wait_for_timeout(300)
    check('el 4º resumen de jugador del mes pide Pro',pg.locator('#infoTitle').inner_text().lower()=='plan pro' and 'resúmenes de jugador al mes' in pg.locator('#infoBody').inner_text())
    pg.click('#closeInfo')
    # desde la ficha del jugador
    pg.click('[data-tab=plantilla]');pg.wait_for_timeout(300)
    pg.click('[data-ficha=j3] >> nth=0');pg.wait_for_timeout(400)
    check('la ficha tiene «Resumen de este partido» en cada partido',pg.locator('#infoBody [data-rj]').count()==3,pg.locator('#infoBody [data-rj]').count())
    pg.locator('#infoBody [data-rj]').first.scroll_into_view_if_needed();pg.screenshot(path=os.path.join(OUT,'rjugador-4-ficha.png'))
    # informe del jugador en Excel
    with pg.expect_download() as dx: pg.click('#infoBody [data-xlj=j3]')
    fx=os.path.join(OUT,'rjugador-informe.xlsx');dx.value.save_as(fx)
    import openpyxl
    wb=openpyxl.load_workbook(fx);wv=openpyxl.load_workbook(fx,data_only=True)
    check('Excel del jugador: hojas «Resumen» y «Partido a partido»',wb.sheetnames==['Resumen','Partido a partido'] and dx.value.suggested_filename.startswith('jugador-pablo-f7'),(wb.sheetnames,dx.value.suggested_filename))
    ws=wb['Partido a partido'];vs=wv['Partido a partido']
    rows=[[c.value for c in r] for r in vs.iter_rows()]
    check('una fila por partido (4) + TOTAL + MEDIA',rows[6][0]=='TOTAL' and rows[7][0]=='MEDIA POR PARTIDO' and sum(1 for r in rows[1:5] if r[1])==4,rows[5:8])
    check('TOTAL con fórmulas (SUM) y valores',str(ws['G7'].value).startswith('=SUM(G2:G5)') and vs['G7'].value==200 and vs['H7'].value==5 and vs['M7'].value==5,(ws['G7'].value,vs['G7'].value,vs['H7'].value))
    check('media por partido y % a puerta',abs(vs['G8'].value-50)<0.01 and abs(vs['N7'].value-0.8)<0.001 and 'AVERAGE' in str(ws['H8'].value))
    rs={r[0].value:r[1].value for r in wv['Resumen'].iter_rows(min_row=2)}
    check('Resumen: % de acierto, goles por partido y minutos por gol',abs(rs['% de acierto (goles / tiros)']-1.0)<0.001 and rs['Goles por partido']==1.25 and rs['Minutos por gol']==40 and '=IF(' in str([r[1].value for r in wb['Resumen'].iter_rows() if r[0].value=='% de tiros a puerta'][0]),rs)
    pg.click('#infoBody [data-rj="m1|j3"]');pg.wait_for_timeout(400)
    check('abre el resumen del jugador desde su ficha','pablo' in pg.locator('#infoTitle').inner_text().lower(),pg.locator('#infoTitle').inner_text())
    pg.click('#infoBody button[data-ficha=j3]');pg.wait_for_timeout(300)
    check('y vuelve a su ficha',pg.locator('#infoTitle').inner_text().lower()=='ficha del jugador',pg.locator('#infoTitle').inner_text())
    ctx.close()
    ctx,pg=abre(b,pro=True)
    pg.click('[data-tab=partidos]');pg.wait_for_timeout(300);pg.click('[data-rs=m1]');pg.wait_for_timeout(300);pg.click('[data-rj="m1|j3"]');pg.wait_for_timeout(400)
    check('con Pro no hay contador',pg.locator('#infoBody .lim-q').count()==0)
    ctx.close()
    ctx,pg=abre(b,768,1024)
    pg.click('[data-tab=partidos]');pg.wait_for_timeout(300);pg.click('[data-rs=m1]');pg.wait_for_timeout(300);pg.click('[data-rj="m1|j3"]');pg.wait_for_timeout(500)
    check('en tablet se ve con la vista previa',pg.locator('#rjPrev img').count()==1)
    ctx.close()
    b.close()
check('sin errores',not errs,errs[:3])
srv.shutdown()
print(f'\n{sum(res)}/{len(res)} correctas');sys.exit(0 if all(res) else 1)
