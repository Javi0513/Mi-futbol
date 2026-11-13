# Mapa de calor y campograma de tiro (v11.27): en el Directo se toca dónde fue cada acción,
# la ficha del jugador y el resumen del partido enseñan los mapas y el Excel trae la hoja «Mapa».
import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json,time
from playwright.sync_api import sync_playwright
FAKE=r"""
window.__calls=[];
window.__db=window.__seed||{};
const NOW=()=>new Date().toISOString(),CP=(x)=>JSON.parse(JSON.stringify(x));
window.supabase={createClient:()=>{let cb=null,session=null;
 const q=(t)=>{let f=null,op='select',payload=null,sel=false;
  const o={select(){sel=true;return o},order(){return o},eq(c,v){f=[c,v];return o},insert(p){op='insert';payload=p;return o},update(p){op='update';payload=p;return o},delete(){op='delete';return o},
  then(res){let out;
   if(window.__noTable&&t==='directos')out={data:null,error:{message:'relation "public.directos" does not exist'}};
   else{let rows=window.__db[t]=window.__db[t]||[];
    if(op==='select')out={data:rows.filter(r=>!f||r[f[0]]===f[1]).map(CP),error:null};
    else if(op==='insert'){let r=CP(payload);if(t==='directos'){r.actualizado=NOW();if(r.desde)r.desde=NOW()}rows.push(r);window.__calls.push(['insert',t]);out={data:sel?[CP(r)]:null,error:null}}
    else if(op==='update'){let r=rows.find(r=>r[f[0]]===f[1]),p=CP(payload);
      if(t==='directos'){p.actualizado=NOW();if(p.desde&&p.desde!==r.desde)p.desde=NOW()}
      Object.assign(r,p);window.__calls.push(['update',t]);out={data:sel?[CP(r)]:null,error:null}}
    else{window.__db[t]=rows.filter(r=>r[f[0]]!==f[1]);window.__calls.push(['delete',t]);out={error:null}}}
   return Promise.resolve(out).then(res)}};return o};
 return{from:q,
  rpc:async(n,a)=>{window.__calls.push(['rpc',n]);if(n==='ver_directo'){let r=(window.__db.directos||[]).find(x=>x.id===a.codigo);return{data:r?{...CP(r),ahora:NOW()}:null,error:null}}return{error:null}},
  auth:{getSession:async()=>({data:{session}}),
   onAuthStateChange(c){cb=c;setTimeout(()=>c('INITIAL_SESSION',null),0);return{data:{subscription:{}}}},
   signInWithPassword:async()=>{session={user:{id:'u1',email:'ana@x.es'}};cb('SIGNED_IN',session);return{data:{session},error:null}},
   getUser:async()=>({data:{user:session&&session.user}}),signOut:async()=>{session=null;cb('SIGNED_OUT',null)}}}}};
"""
J=[{'id':f'p{i}','owner_id':'u1','modalidad':'7','nombre':n,'dorsal':i+1,'foto':'','created_at':''} for i,n in enumerate(['Hugo','Leo','Mario','Pablo','Dani','Álex','Iker','Nico'])]
PART=[{'id':f'p{i}','minutes':0,'goals':0,'starter':i<7} for i in range(8)]
def seed(plan='gratis',mod='7'):
    jj=[dict(j,modalidad=mod) for j in J]
    return {'futbol_personal_jugadores':jj,'futbol_personal_partidos':[{'id':'m1','owner_id':'u1','modalidad':mod,'fecha':'2026-11-08','rival':'Los Pinos','participaciones':json.dumps(PART),'alineacion':json.dumps({'formation':'2-3-1','slots':{str(i):f'p{i}' for i in range(7)}}),'created_at':''}],'perfiles':[{'id':'u1','plan':plan}]}
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8893),functools.partial(H,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8893/index.html'
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
def page(b,sd,extra=''):
    ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block',accept_downloads=True,device_scale_factor=2)
    pg=ctx.new_page()
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    pg.on('dialog',lambda d:d.accept())
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    pg.add_init_script('window.__seed='+json.dumps(sd)+';'+extra)
    pg.add_init_script("try{localStorage.setItem('mf_version_abierta','99');localStorage.setItem('mf_tut_visto','1');localStorage.setItem('mf_novedades_visto','99')}catch(e){}")
    pg.goto(URL);pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto12');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)');pg.wait_for_timeout(600)
    while pg.locator('#info').is_visible():
        pg.click('#closeInfo');pg.wait_for_timeout(200)
    return pg
LOC=lambda pg:pg.evaluate("Object.fromEntries(JSON.parse(window.__db.futbol_personal_partidos[0].participaciones).map(x=>[x.id,x.loc||[]]))")
wait=lambda pg,js:pg.wait_for_function('()=>{let d=(window.__db.directos||[])[0];return '+js+'}',timeout=4000)
def toca(pg,fx,fy):
    """Toca en el campo de la hoja en la posición fx,fy (0-1 del campo, sin márgenes)."""
    bb=pg.evaluate("(()=>{let s=document.querySelector('.lv-loc svg[data-lvloc]'),r=s.getBoundingClientRect(),v=s.viewBox.baseVal,W=+s.dataset.w,H=+s.dataset.h;return{l:r.left,t:r.top,sx:r.width/v.width,sy:r.height/v.height,vx:v.x,vy:v.y,W,H}})()")
    x=bb['l']+(fx*bb['W']-bb['vx'])*bb['sx'];y=bb['t']+(fy*bb['H']-bb['vy'])*bb['sy']
    pg.mouse.click(x,y)
def directo(pg):
    pg.click('[data-tab=partidos]');pg.click('[data-action=live][data-id=m1]');pg.wait_for_selector('.lv-board')
    pg.click('[data-live=start]');wait(pg,"d.estado==='1T'")
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=page(b,seed())
    directo(pg)
    check('botón para activar/quitar «Marcar en el campo»',pg.locator('[data-lvloc-tg]').count()==1 and 'SÍ' in pg.inner_text('[data-lvloc-tg]').upper())
    check('plan gratuito: aviso de 2 partidos al mes','2 partidos al mes' in pg.inner_text('.lv-locc'))
    pg.click('.lv-pl [data-lvsp=p1]')
    check('al apuntar un robo sale el campo para tocar dónde fue',pg.locator('.lv-loc svg[data-lvloc]').count()==1 and 'Robo' in pg.inner_text('.lv-loc') and 'Leo' in pg.inner_text('.lv-loc'))
    check('el campo de fútbol 7 con la flecha de ataque','Atacamos' in pg.inner_text('.lv-loc') and pg.locator('.lv-loc svg.sala').count()==0)
    pg.screenshot(path=os.path.join(OUT,'mapa-1-directo-tocar.png'))
    toca(pg,0.30,0.20)
    check('al tocar se cierra la hoja',pg.locator('.lv-loc').count()==0)
    pg.wait_for_function("()=>JSON.parse(window.__db.futbol_personal_partidos[0].participaciones).some(x=>x.loc)",timeout=4000)
    l=LOC(pg)['p1']
    check('se guarda la marca con x,y (0-100) y minuto',len(l)==1 and l[0][0]=='rob' and 25<=l[0][1]<=35 and 15<=l[0][2]<=25 and l[0][3]==1,l)
    # Tiros de Pablo: a puerta y fuera
    pg.click('[data-lvst=tp]');pg.click('.lv-pl [data-lvsp=p3]');toca(pg,0.85,0.45)
    pg.click('[data-lvst=tf]');pg.click('.lv-pl [data-lvsp=p3]');toca(pg,0.78,0.70)
    pg.click('[data-lvst=tf]');pg.click('.lv-pl [data-lvsp=p3]');pg.click('[data-lvloc-no]')
    check('«Sin marcar» apunta el dato sin marca',pg.locator('.lv-loc').count()==0 and pg.locator('.lv-pl [data-lvsp=p3] b').inner_text()=='2')
    # Seguir apuntando sin tocar el campo: la hoja se quita sola
    pg.click('[data-lvst=rob]');pg.click('.lv-pl [data-lvsp=p4]')
    pg.locator('.lv-pl [data-lvsp=p5]').click(force=True)
    check('si sigues apuntando sin marcar, sigue (pregunta por el nuevo)',pg.locator('.lv-pl [data-lvsp=p4] b').inner_text()=='1' and pg.locator('.lv-pl [data-lvsp=p5] b').inner_text()=='1' and 'Álex' in pg.inner_text('.lv-loc'))
    toca(pg,0.55,0.5)
    # Gol de Pablo con su sitio
    pg.click('[data-live=gf]');pg.click('[data-scorer=p3]');wait(pg,"d.gf===1")
    check('al marcar gol también pregunta dónde','Gol' in pg.inner_text('.lv-loc') and 'Pablo' in pg.inner_text('.lv-loc'))
    toca(pg,0.92,0.52)
    pg.wait_for_function("()=>(JSON.parse(window.__db.futbol_personal_partidos[0].participaciones).find(x=>x.id==='p3').loc||[]).length===3",timeout=4000)
    l=LOC(pg)['p3'];gid=pg.evaluate("window.__db.directos[0].eventos.find(e=>e.t==='f').id")
    check('el gol queda enlazado con su marca',[z[0] for z in l]==['tp','tf','gol'] and l[2][4]==gid,l)
    check('las marcas no van al enlace público',pg.evaluate("JSON.stringify(window.__db.directos[0]).indexOf('loc')<0"))
    # Deshacer quita el dato y su marca
    pg.click('.lv-pl [data-lvsp=p2]');toca(pg,0.4,0.4)
    pg.wait_for_function("()=>(JSON.parse(window.__db.futbol_personal_partidos[0].participaciones).find(x=>x.id==='p2').loc||[]).length===1",timeout=4000)
    pg.click('[data-live=undo]')
    pg.wait_for_function("()=>!JSON.parse(window.__db.futbol_personal_partidos[0].participaciones).find(x=>x.id==='p2').loc",timeout=4000)
    check('«Deshacer» quita el dato y su marca',pg.locator('.lv-pl [data-lvsp=p2] b').inner_text()=='0')
    # Desactivar
    pg.click('[data-lvloc-tg]')
    pg.click('.lv-pl [data-lvsp=p2]')
    check('con «Marcar en el campo: No» no pregunta',pg.locator('.lv-loc').count()==0 and 'NO' in pg.inner_text('[data-lvloc-tg]').upper())
    pg.click('[data-live=undo]');pg.click('[data-lvloc-tg]')
    check('el partido cuenta como 1 de 2 del mes',pg.evaluate("Object.entries(localStorage).some(([k,v])=>k.startsWith('mf_envios:')&&(JSON.parse(v).mp||[]).includes('m1'))"))
    pg.click('[data-live=half]');wait(pg,"d.estado==='DES'");pg.click('[data-live=start2]');wait(pg,"d.estado==='2T'")
    pg.click('[data-live=end]');wait(pg,"d.estado==='FIN'")
    pg.click('[data-live=close]');pg.wait_for_selector('.mrow')
    # Ficha de Pablo: mapa de calor y campograma
    pg.click('[data-tab=plantilla]');pg.click('[data-pid=p3] .info');pg.wait_for_selector('#info:not(.hidden)')
    body=pg.inner_text('#infoBody')
    check('la ficha tiene mapa de calor y campograma','MAPA DE CALOR' in body.upper() and 'CAMPOGRAMA DE TIRO' in body.upper())
    check('campograma: 1 gol, 1 a puerta, 1 fuera',pg.locator('#infoBody svg.cg .cg-gol').count()==1 and pg.locator('#infoBody svg.cg .cg-tp').count()==1 and pg.locator('#infoBody svg.cg .cg-tf').count()==1 and '33 % acaban en gol' in body,body[-300:])
    check('mapa de calor con un punto por acción',pg.locator('#infoBody #mapaHeat .mc-dot').count()==3)
    pg.set_viewport_size({'width':390,'height':2400});pg.wait_for_timeout(300)
    pg.locator('#infoBody').screenshot(path=os.path.join(OUT,'mapa-2-ficha-jugador.png'))
    pg.set_viewport_size({'width':390,'height':844});pg.wait_for_timeout(200)
    pg.click('#infoBody [data-mapk=gol]')
    check('filtro: solo goles',pg.locator('#infoBody #mapaHeat .mc-dot').count()==1 and pg.locator('#infoBody [data-mapk=gol].on').count()==1)
    # Excel: hoja «Mapa»
    with pg.expect_download() as dl: pg.click('#infoBody [data-xl]')
    f=os.path.join(OUT,'mapa-estadisticas.xlsx');dl.value.save_as(f)
    import openpyxl
    wb=openpyxl.load_workbook(f)
    check('el Excel trae la hoja «Mapa»','Mapa' in wb.sheetnames,wb.sheetnames)
    ws=wb['Mapa'];rows=list(ws.values)
    check('cabecera con X, Y, metros, tercio y carril',rows[0][8:]==('X (0-100)','Y (0-100)','X (metros)','Y (metros)','Tercio','Carril'),rows[0])
    gol=[r for r in rows[1:] if r[4]=='Gol']
    check('una fila por acción marcada (5)',len(rows)==6,len(rows))
    check('el gol: Pablo, ofensivo, central, X en metros',len(gol)==1 and gol[0][6]=='Pablo' and gol[0][12]=='Ofensivo' and gol[0][13]=='Central' and isinstance(gol[0][8],(int,float)) and 55<gol[0][10]<=65,gol)
    rob=[r for r in rows[1:] if r[6]=='Leo'][0]
    check('el robo de Leo: defensivo, carril izquierdo',rob[12]=='Defensivo' and rob[13]=='Izquierdo',rob)
    pg.click('#closeInfo')
    # Resumen del partido
    pg.click('[data-tab=partidos]');pg.click('[data-rs=m1]');pg.wait_for_selector('#info:not(.hidden)')
    body=pg.inner_text('#infoBody')
    check('el resumen del partido tiene los mapas del equipo','MAPA DE CALOR' in body.upper() and 'CAMPOGRAMA DE TIRO' in body.upper() and pg.locator('#infoBody #mapaHeat .mc-dot').count()==5)
    pg.set_viewport_size({'width':390,'height':3000});pg.wait_for_timeout(300)
    pg.locator('#infoBody').screenshot(path=os.path.join(OUT,'mapa-4-resumen-partido.png'))
    pg.set_viewport_size({'width':390,'height':844});pg.wait_for_timeout(200)
    pg.click('#closeInfo')
    # Guía de uso
    pg.click('#acct');pg.click('#info [data-info=ayuda]');pg.wait_for_timeout(300)
    check('la guía explica el mapa de calor','MAPA DE CALOR Y CAMPOGRAMA DE TIRO' in pg.inner_text('#infoBody').upper())
    pg.context.close()
    # Plan gratuito: 2 partidos ya usados este mes -> no pregunta y avisa
    mes=time.strftime('%Y-%m')
    pg=page(b,seed(),"try{localStorage.setItem('mf_envios:u1:"+mes+"',JSON.stringify({mp:['a','b']}))}catch(e){}")
    directo(pg)
    pg.click('.lv-pl [data-lvsp=p1]')
    check('gratis con 2 partidos usados: no sale el campo',pg.locator('.lv-loc').count()==0 and pg.locator('.lv-pl [data-lvsp=p1] b').inner_text()=='1')
    check('y avisa con el plan Pro','ya has marcado en el campo en 2 partidos' in pg.inner_text('.lv-locc'))
    pg.click('[data-lvloc-pro]')
    check('«Ver el plan Pro» explica el límite',pg.locator('#info').is_visible() and 'mapa de calor' in pg.inner_text('#infoBody'))
    pg.context.close()
    # Pro + fútbol sala: sin límite y campo de sala
    pg=page(b,seed('pro','fs'),"try{localStorage.setItem('mf_envios:u1:"+mes+"',JSON.stringify({mp:['a','b']}))}catch(e){}")
    pg.click('[data-mode=fs]');pg.wait_for_timeout(200)
    directo(pg)
    check('Pro: sin aviso de límite',pg.locator('.lv-locc .lim-q').count()==0)
    pg.click('.lv-pl [data-lvsp=p1]')
    check('Pro: pregunta aunque haya 2 partidos usados; campo de fútbol sala',pg.locator('.lv-loc svg.sala').count()==1)
    pg.screenshot(path=os.path.join(OUT,'mapa-5-directo-sala.png'))
    toca(pg,0.7,0.3)
    pg.wait_for_function("()=>JSON.parse(window.__db.futbol_personal_partidos[0].participaciones).some(x=>x.loc)",timeout=4000)
    check('se guarda en sala',LOC(pg)['p1'][0][0]=='rob')
    b.close()
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
if errs:print('\n'.join('FALLA consola: '+e for e in errs))
sys.exit(0 if all(res) and not errs else 1)
