# Marcar en el campo después del partido (v11.49): en «Editar partido» se elige jugador y acción
# y se toca dónde fue, para completar el mapa de calor y el campograma sin haber usado el Directo.
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
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8897),functools.partial(H,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8897/index.html'
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

def tocaMd(pg,fx,fy):
    pg.locator('svg[data-mdloc]').scroll_into_view_if_needed()
    bb=pg.evaluate("(()=>{let s=document.querySelector('svg[data-mdloc]'),r=s.getBoundingClientRect(),v=s.viewBox.baseVal,W=+s.dataset.w,H=+s.dataset.h;return{l:r.left,t:r.top,sx:r.width/v.width,sy:r.height/v.height,vx:v.x,vy:v.y,W,H}})()")
    x=bb['l']+(fx*bb['W']-bb['vx'])*bb['sx'];y=bb['t']+(fy*bb['H']-bb['vy'])*bb['sy']
    pg.mouse.click(x,y);pg.wait_for_timeout(150)
def edita(pg):
    pg.click('[data-tab=partidos]');pg.click('[data-action=edit-match][data-id=m1]');pg.wait_for_selector('.md-loc')
def guarda(pg):
    pg.click('[data-action=save]');pg.wait_for_selector('.mrow')
def sd2(plan='gratis',mod='7'):
    s=seed(plan,mod);P=json.loads(s['futbol_personal_partidos'][0]['participaciones'])
    P[1]['st']={'rob':2};P[1]['stm']={'rob':[5,30]};P[3]['goals']=1
    s['futbol_personal_partidos'][0]['participaciones']=json.dumps(P);return s
def card(pg):return pg.locator('#tut .tut-card').inner_text() if pg.locator('#tut').count() else ''
def sig(pg):pg.click('#tut [data-tut=next]');pg.wait_for_timeout(450)
def hueco(pg):
    return pg.evaluate("(()=>{let t=document.getElementById('tut');if(!t||!t.classList.contains('on-el'))return null;let h=t.querySelector('.tut-hole').getBoundingClientRect();return {x:h.left+h.width/2,y:h.top+h.height/2}})()")
def señala(pg,sel):
    h=hueco(pg)
    if not h:return False
    return pg.evaluate("([s,x,y])=>{let e=document.querySelector(s);if(!e)return false;let r=e.getBoundingClientRect();return x>=r.left-8&&x<=r.right+8&&y>=r.top-8&&y<=r.bottom+8}",[sel,h['x'],h['y']])
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=page(b,sd2())
    edita(pg)
    check('en Editar partido sale «Dónde fue cada acción» con el campo','Dónde fue cada acción' in pg.inner_text('.md-loc') and pg.locator('svg[data-mdloc]').count()==1)
    check('plan gratuito: avisa del límite de 2 partidos al mes','2 partidos al mes' in pg.inner_text('.md-loc'))
    pg.select_option('#mdLocP','p1');pg.wait_for_timeout(150)
    check('dice cuántos robos faltan por marcar','0 de 2' in pg.inner_text('.md-loc'))
    pg.locator('svg[data-mdloc]').scroll_into_view_if_needed();y0=pg.evaluate('scrollY')
    tocaMd(pg,0.30,0.20)
    check('al tocar no salta la pantalla arriba',abs(pg.evaluate('scrollY')-y0)<40,(y0,pg.evaluate('scrollY')))
    check('sale el punto y cuenta 1 de 2',pg.locator('svg[data-mdloc] circle.ml-on').count()==1 and '1 de 2' in pg.inner_text('.md-loc'))
    tocaMd(pg,0.6,0.7)
    check('con todos marcados avisa que otro toque suma uno','Ya están marcados sus 2 robos' in pg.inner_text('.md-loc'))
    tocaMd(pg,0.8,0.5)
    check('el tercer toque suma un robo en la tabla',pg.input_value('[data-mdst=p1][data-k=rob]')=='3')
    pg.click('[data-mdloc=undo]');pg.wait_for_timeout(150)
    check('«Quitar la última» quita una marca (el número de robos no cambia)',pg.locator('svg[data-mdloc] circle.ml-on').count()==2 and pg.input_value('[data-mdst=p1][data-k=rob]')=='3')
    pg.fill('#mdLocM','40');pg.dispatch_event('#mdLocM','change')
    tocaMd(pg,0.5,0.5)
    pg.screenshot(path=os.path.join(OUT,'mapa-despues-1-editar.png'),full_page=False)
    pg.locator('.md-loc').screenshot(path=os.path.join(OUT,'mapa-despues-2-bloque.png'))
    # Goles de Pablo: solo los que tiene
    pg.select_option('#mdLocP','p3');pg.select_option('#mdLocK','gol');pg.wait_for_timeout(150)
    pg.fill('#mdLocM','');pg.dispatch_event('#mdLocM','change')
    tocaMd(pg,0.9,0.5);tocaMd(pg,0.9,0.4)
    check('goles: no deja marcar más que los que tiene',pg.locator('svg[data-mdloc] circle.ml-on').count()==1 and 'Ya están marcados sus 1 goles' in pg.inner_text('.md-loc'))
    # Bajar los goles quita la marca
    guarda(pg)
    l=LOC(pg)
    check('se guarda en el partido: robos con x,y y minuto (stm o el escrito)',[z[0] for z in l['p1']]==['rob','rob','rob'] and l['p1'][0][3]==5 and l['p1'][1][3]==30 and l['p1'][2][3]==40 and 25<=l['p1'][0][1]<=35,l['p1'])
    check('se guarda el gol de Pablo',len(l['p3'])==1 and l['p3'][0][0]=='gol' and l['p3'][0][1]>=85,l['p3'])
    check('cuenta como partido del mes (gratis)',pg.evaluate("Object.values(JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('mf_envios:'))))).flat().includes('m1')"))
    # La ficha del jugador ya tiene el mapa
    pg.click('[data-tab=resumen]');pg.wait_for_timeout(300)
    pg.evaluate("(()=>{let b=[...document.querySelectorAll('[data-ficha]')].find(x=>x.dataset.ficha==='p1');b&&b.click()})()");pg.wait_for_timeout(300)
    if pg.locator('#info').is_visible():
        check('la ficha del jugador enseña el mapa de calor',pg.locator('#infoBody #mapaHeat').count()==1)
        pg.click('#closeInfo')
    pg.context.close()
    # Tutorial paso a paso en la app
    pg=page(b,sd2())
    pg.click('#acct');pg.click('#info [data-info=ayuda]');pg.wait_for_timeout(300)
    check('la Guía de uso trae el tutorial del mapa después del partido',pg.locator('#infoBody .ayuda-tut [data-ftut=mapa]').count()==1)
    check('y la guía lo explica','Dónde fue cada acción' in pg.locator('#infoBody').text_content())
    pg.click('#infoBody .ayuda-tut [data-ftut=mapa]');pg.wait_for_timeout(400)
    check('el tutorial empieza','paso 1 de 10' in card(pg).lower(),card(pg)[:80])
    SEL=['#view [data-action="edit-match"]','#view .md-loc','#mdLocP','#mdLocK','#mdLocM','#view svg[data-mdloc]','#view .md-loc .hbtns','#view [data-action="save"]']
    for i,sel in enumerate(SEL):
        sig(pg)
        check('paso %d señala %s'%(i+2,sel),señala(pg,sel),card(pg)[:50])
    sig(pg);check('último paso: ¡Listo!','listo' in card(pg).lower())
    sig(pg)
    check('al terminar se cierra sin guardar nada',pg.locator('#tut').count()==0 and pg.locator('.md-loc').count()==0 and not any(c[0]=='update' for c in pg.evaluate('window.__calls')))
    # Gratis con 2 partidos ya usados este mes: no sale el campo
    pg.context.close()
    mes=time.strftime('%Y-%m')
    pg=page(b,sd2(),"try{localStorage.setItem('mf_envios:u1:"+mes+"',JSON.stringify({mp:['a','b']}))}catch(e){}")
    edita(pg)
    check('gratis con 2 partidos usados: sin campo y con aviso Pro',pg.locator('svg[data-mdloc]').count()==0 and 'ya has marcado en el campo en 2 partidos' in pg.inner_text('.md-loc'))
    pg.click('[data-mdloc-pro]');pg.wait_for_timeout(200)
    check('«Ver el plan Pro» abre el plan',pg.locator('#info').is_visible())
    pg.context.close()
    # Pro + fútbol sala
    pg=page(b,sd2('pro','fs'),"try{localStorage.setItem('mf_envios:u1:"+mes+"',JSON.stringify({mp:['a','b']}))}catch(e){}")
    pg.click('[data-mode=fs]');pg.wait_for_timeout(200)
    edita(pg)
    check('Pro: sin aviso de límite y campo de sala',pg.locator('.md-loc .lim-q').count()==0 and pg.locator('svg[data-mdloc].sala').count()==1)
    tocaMd(pg,0.3,0.3)
    check('Pro sala: marca sin gastar partidos',pg.locator('svg[data-mdloc] circle.ml-on').count()==1)
    b.close()
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
if errs:print('\n'.join('FALLA consola: '+e for e in errs))
sys.exit(0 if all(res) and not errs else 1)
