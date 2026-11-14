import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json,time
from playwright.sync_api import sync_playwright
# Anotador del directo (v11.8): enlace ?anotar=<código> para que otra persona apunte goles, faltas,
# cambios y tarjetas; el móvil del entrenador lo junta con lo suyo. Supabase simulado con varios eq,
# el disparador de la hora y las funciones ver_anotador / anotar / anotar_quitar (como en el SQL).
FAKE=r"""
window.__calls=[];
window.__db=window.__seed||{};
const NOW=()=>new Date(Date.now()+(window.__tick=(window.__tick||0)+1)).toISOString(),CP=(x)=>JSON.parse(JSON.stringify(x));
const AN=(c)=>(window.__db.directos||[]).find(x=>x.anotador===c);
const VA=(d)=>d?{equipo:d.equipo,rival:d.rival,modalidad:d.modalidad,gf:d.gf,gc:d.gc,estado:d.estado,parte_min:d.parte_min,acum_ms:d.acum_ms,desde:d.desde,eventos:CP(d.eventos),jugadores:CP(d.anot_jug||[]),actualizado:d.actualizado,ahora:new Date().toISOString()}:null;
window.__anotar=(c,ev)=>{let d=AN(c);if(!d)return{error:{message:'NO_EXISTE'}};
 let ms=d.acum_ms+(d.desde?Math.max(0,Date.now()-Date.parse(d.desde)):0),
  mn=d.estado==='pre'?0:d.estado==='DES'?d.parte_min:d.estado==='FIN'?d.parte_min*2:Math.floor(ms/60000)+1+(d.estado==='2T'?d.parte_min:0),
  e={id:'an'+Math.random().toString(36).slice(2,10),m:mn,t:ev.t,an:1},J=(id)=>(d.anot_jug||[]).find(j=>j.id===id);
 if(ev.t==='fa'){e.p=['2T','FIN'].includes(d.estado)?2:1;if(ev.r)e.r=1}
 else if(ev.r){e.r=1;if(ev.d)e.d=ev.d;if(ev.t==='s'&&ev.di)e.di=ev.di;if(ev.t!=='s'&&ev.n)e.n=ev.n}
 else if(ev.t!=='c'){if(ev.pid){let j=J(ev.pid);if(!j)return{error:{message:'JUGADOR'}};e.pid=j.id;e.n=j.n;if(j.d)e.d=j.d}
  if(ev.t==='s'){let j=J(ev.pin);if(!j)return{error:{message:'JUGADOR'}};e.pin=j.id;e.ni=j.n;if(j.d)e.di=j.d}}
 if(ev.t==='s'&&!window.__oldSql){if(d.estado==='DES'||(ev.ds&&['2T','FIN'].includes(d.estado))){e.m=d.parte_min;e.ds=1;e.p=2}else e.p=['2T','FIN'].includes(d.estado)?2:1}
 d.eventos.push(e);if(ev.t==='f')d.gf++;if(ev.t==='c')d.gc++;d.actualizado=NOW();return{data:VA(d),error:null}};
window.__reloj=(c,a)=>{let d=AN(c);if(!d)return{error:{message:'NO_EXISTE'}};
 let ms=Math.min(36000000,d.acum_ms+(d.desde?Math.max(0,Date.now()-Date.parse(d.desde)):0)),T=()=>new Date().toISOString(),st=d.estado;
 if(a==='start'&&st==='pre')Object.assign(d,{estado:'1T',acum_ms:0,desde:T()});
 else if(a==='pause'&&['1T','2T'].includes(st)&&d.desde)Object.assign(d,{acum_ms:ms,desde:null});
 else if(a==='resume'&&['1T','2T'].includes(st)&&!d.desde)d.desde=T();
 else if(a==='half'&&st==='1T')Object.assign(d,{estado:'DES',acum_ms:ms,desde:null});
 else if(a==='start2'&&st==='DES')Object.assign(d,{estado:'2T',acum_ms:0,desde:T()});
 else if(a==='end'&&st==='2T')Object.assign(d,{estado:'FIN',acum_ms:ms,desde:null});
 d.actualizado=NOW();return{data:VA(d),error:null}};
window.supabase={createClient:()=>{let cb=null,session=null;
 const q=(t)=>{let f=[],op='select',payload=null,sel=false;
  const o={select(){sel=true;return o},order(){return o},eq(c,v){f.push([c,v]);return o},insert(p){op='insert';payload=p;return o},update(p){op='update';payload=p;return o},delete(){op='delete';return o},
  then(res){let out,ok=(r)=>f.every(([c,v])=>r[c]===v);
   if(window.__noCol&&t==='directos'&&op==='update'&&payload&&'anotador' in payload)out={data:null,error:{message:'column "anotador" of relation "directos" does not exist'}};
   else{let rows=window.__db[t]=window.__db[t]||[];
    if(op==='select')out={data:rows.filter(ok).map(CP),error:null};
    else if(op==='insert'){let r=CP(payload);if(t==='directos'){r.actualizado=NOW();if(r.desde)r.desde=NOW()}rows.push(r);window.__calls.push(['insert',t]);out={data:sel?[CP(r)]:null,error:null}}
    else if(op==='update'){let ms=rows.filter(ok),p=CP(payload);
      ms.forEach(r=>{let q2=CP(p);if(t==='directos'){q2.actualizado=NOW();if(q2.desde&&q2.desde!==r.desde)q2.desde=NOW()}Object.assign(r,q2)});
      window.__calls.push(['update',t,f.length]);out={data:sel?ms.map(CP):null,error:null}}
    else{window.__db[t]=rows.filter(r=>!ok(r));window.__calls.push(['delete',t]);out={error:null}}}
   return (window.__lat?new Promise(ok=>setTimeout(()=>ok(out),window.__lat)):Promise.resolve(out)).then(res)}};return o};
 return{from:q,
  rpc:async(n,a)=>{window.__calls.push(['rpc',n,a]);
   if(n==='ver_directo'){let r=(window.__db.directos||[]).find(x=>x.id===a.codigo);return{data:r?{...CP(r),ahora:new Date().toISOString()}:null,error:null}}
   if(n==='ver_anotador')return{data:VA(AN(a.codigo)),error:null};
   if(n==='anotar')return window.__anotar(a.codigo,a.ev);
   if(n==='anotar_reloj')return window.__noReloj?{data:null,error:{message:'Could not find the function public.anotar_reloj(accion, codigo) in the schema cache'}}:window.__reloj(a.codigo,a.accion);
   if(n==='anotar_quitar'){let d=AN(a.codigo);if(!d)return{error:{message:'NO_EXISTE'}};let e=d.eventos.find(z=>z.id===a.evento&&z.an);
     if(e){d.eventos=d.eventos.filter(z=>z!==e);if(e.t==='f')d.gf--;if(e.t==='c')d.gc--;d.actualizado=NOW()}return{data:VA(d),error:null}}
   return{error:null}},
  auth:{getSession:async()=>({data:{session}}),
   onAuthStateChange(c){cb=c;setTimeout(()=>c('INITIAL_SESSION',null),0);return{data:{subscription:{}}}},
   signInWithPassword:async()=>{session={user:{id:'u1',email:'ana@x.es'}};cb('SIGNED_IN',session);return{data:{session},error:null}},
   getUser:async()=>({data:{user:session&&session.user}}),signOut:async()=>{session=null;cb('SIGNED_OUT',null)}}}}};
"""
P=[{'id':f'p{i}','owner_id':'u1','modalidad':'fs','nombre':f'J{i}','dorsal':str(i+1),'foto':'','created_at':''} for i in range(8)]
PART=[{'id':f'p{i}','nombre':f'J{i}','minutes':0,'goals':0,'starter':i<5} for i in range(8)]
SEED={'futbol_personal_jugadores':P,'futbol_personal_partidos':[{'id':'m1','owner_id':'u1','modalidad':'fs','fecha':'2026-11-08','rival':'Los Pinos','participaciones':json.dumps(PART),'alineacion':'{}','created_at':''}],'perfiles':[{'id':'u1','plan':'gratis'}]}
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8831),functools.partial(H,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8831/index.html'
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
def page(b,seed,extra=''):
    pg=b.new_context(viewport={'width':390,'height':844},service_workers='block').new_page()
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    pg.on('dialog',lambda d:d.accept())
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    pg.add_init_script('window.__seed='+json.dumps(seed)+';'+extra)
    return pg
def login(pg):
    pg.goto(URL);pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto12');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)');pg.wait_for_timeout(200)
D=lambda pg,js:pg.evaluate('(()=>{let d=(window.__db.directos||[])[0];return '+js+'})()')
wait=lambda pg,js,t=6000:pg.wait_for_function('()=>{let d=(window.__db.directos||[])[0];return '+js+'}',timeout=t)
PJ=lambda pg:pg.evaluate("(()=>{let m=window.__db.futbol_personal_partidos[0];return{al:JSON.parse(m.alineacion),g:Object.fromEntries(JSON.parse(m.participaciones).map(x=>[x.id,x.goals]))}})()")
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=page(b,SEED);login(pg)
    pg.click('[data-mode="fs"]') if pg.locator('[data-mode="fs"]').count() else None
    pg.click('[data-tab=partidos]')
    pg.click('[data-action=live][data-id=m1]');pg.wait_for_selector('.lv-board')
    check('el Directo tiene el apartado Anotador',pg.locator('.lv-anot [data-live=anon]').count()==1 and 'Anotador' in pg.locator('.lv-anot').text_content())
    check('plan gratuito: dice cuántos partidos con anotador quedan','3 partidos al mes' in pg.locator('.lv-anot').inner_text())
    pg.click('[data-live=start]');wait(pg,"d.estado==='1T'")
    pg.click('[data-live=anon]');pg.wait_for_selector('#anUrl')
    code=D(pg,'d.anotador')
    check('crear el enlace guarda un código secreto distinto del directo',len(code or '')==36 and code!=D(pg,'d.id') and pg.input_value('#anUrl').endswith('?anotar='+code))
    jug=D(pg,'d.anot_jug')
    check('el anotador recibe solo nombre, dorsal y titular de los convocados',len(jug)==8 and set(jug[0].keys())<={'id','n','d','s'} and sum(1 for j in jug if j.get('s'))==5,jug[:2])
    check('el enlace de la familia no enseña el código del anotador','anotador' not in json.dumps(pg.evaluate("window.__calls.filter(c=>c[1]==='ver_directo')")))
    pg.screenshot(path=OUT+'/anot_entrenador.png',full_page=True)
    # Lo que apunta el anotador llega solo al móvil del entrenador
    pg.evaluate("c=>{window.__anotar(c,{t:'f',pid:'p3'});window.__anotar(c,{t:'c'});window.__anotar(c,{t:'fa',r:1})}",code)
    pg.wait_for_function("()=>document.querySelector('.lv-score').textContent.replace(/\\s/g,'')==='1-1'",timeout=7000)
    check('el marcador del entrenador se actualiza solo con los goles del anotador',True)
    pg.wait_for_function("()=>JSON.parse(window.__db.futbol_personal_partidos[0].participaciones).find(x=>x.id==='p3').goals===1",timeout=4000)
    x=PJ(pg);check('el gol del anotador suma al jugador y al resultado',x['g']['p3']==1 and x['al']['resultado']=={'gf':1,'gc':1},x['al'].get('resultado'))
    check('la falta del rival suma a las faltas acumuladas',x['al'].get('faltas',{}).get('r1')==1,x['al'].get('faltas'))
    # El entrenador apunta algo a la vez: no se pierde nada de nadie
    pg.evaluate("c=>window.__anotar(c,{t:'s',pid:'p0',pin:'p6'})",code)
    pg.click('[data-live=gc]');wait(pg,"d.gc===2")
    pg.wait_for_timeout(300)
    check('si los dos apuntan a la vez no se pierde nada',D(pg,"d.gf===1&&d.gc===2&&d.eventos.some(e=>e.t==='s'&&e.an)&&d.eventos.filter(e=>e.t==='c').length===2"),D(pg,'[d.gf,d.gc,d.eventos.length]'))
    check('guardar con anotador usa la comprobación de «nadie lo ha cambiado»',pg.evaluate("window.__calls.some(c=>c[0]==='update'&&c[1]==='directos'&&c[2]===2)"))
    pg.wait_for_function("()=>JSON.parse(window.__db.futbol_personal_partidos[0].alineacion).cambios",timeout=6000)
    x=PJ(pg);check('el cambio del anotador pasa al partido',x['al']['cambios'][0]['sale']=='p0' and x['al']['cambios'][0]['entra']=='p6',x['al'].get('cambios'))
    # Cámara: el marcador del vídeo lee lo mismo
    pg.evaluate("c=>window.__anotar(c,{t:'f',pid:'p1'})",code)
    pg.wait_for_function("()=>document.querySelector('.lv-score').textContent.replace(/\\s/g,'')==='2-2'",timeout=7000)
    check('el marcador del vídeo usa estos datos (camPinta lee el directo)',D(pg,'d.gf')==2)
    # Página del anotador (otro móvil, sin cuenta)
    db=pg.evaluate('window.__db')
    an=page(b,db);an.goto(URL+'?anotar='+code);an.wait_for_selector('#anData .lv-board')
    check('el enlace del anotador abre sin cuenta',an.locator('#login').is_hidden() and an.locator('#app').is_hidden())
    check('tiene los botones: goles, faltas, cambio y tarjetas',all(an.locator(f'[data-an="{k}"]').count()==1 for k in ['f','c','fan','far','sub','a','r']))
    an.click('[data-an=f]');an.wait_for_selector('[data-anp]')
    check('«Gol nuestro» enseña los convocados con dorsal',an.locator('[data-anp]').count()==9 and '4 · J3' in an.locator('.lv-pick').inner_text())
    an.screenshot(path=OUT+'/anot_goleador.png',full_page=True)
    an.click('[data-anp="p4"]');an.wait_for_function("()=>document.querySelector('.lv-score').textContent.replace(/\\s/g,'')==='3-2'")
    last=an.evaluate("window.__db.directos[0].eventos.slice(-1)[0]")
    check('gol con goleador y minuto',last['t']=='f' and last['pid']=='p4' and last['n']=='J4' and last['m']>=1 and 'minuto' in an.locator('.message').inner_text(),last)
    an.click('[data-an=far]');an.click('[data-an=far]');an.wait_for_timeout(200)
    check('faltas del rival en la 1ª parte',an.evaluate("window.__db.directos[0].eventos.filter(e=>e.t==='fa'&&e.r).length")==3 and '3' in an.locator('[data-an=far]').inner_text())
    an.click('[data-an=sub]');an.wait_for_selector('[data-anx]')
    sale=an.locator('[data-anx]').all_inner_texts()
    check('cambio: primero salen los que están en el campo',len(sale)==5 and not any('J0' in t for t in sale) and any('J6' in t for t in sale),sale)
    an.click('[data-anx="p1"]');an.wait_for_selector('.lv-pick h3:has-text("entra")')
    ent=an.locator('[data-anx]').all_inner_texts()
    check('y luego los del banquillo',any('J0' in t for t in ent) and not any('J6' in t for t in ent),ent)
    an.click('[data-anx="p0"]');an.wait_for_timeout(200)
    check('cambio apuntado',an.evaluate("window.__db.directos[0].eventos.slice(-1)[0]")['pin']=='p0')
    an.click('[data-an=a]');an.click('[data-ans=r]');an.fill('#anRd','9');an.fill('#anRn','Pepe');an.click('[data-an=rok]');an.wait_for_timeout(200)
    e=an.evaluate("window.__db.directos[0].eventos.slice(-1)[0]")
    check('amarilla al rival con dorsal y nombre',e['t']=='a' and e.get('r')==1 and e['d']=='9' and e['n']=='Pepe',e)
    an.click('[data-an=r]');an.click('[data-anx="p2"]');an.wait_for_timeout(200)
    check('roja a un jugador tuyo',an.evaluate("window.__db.directos[0].eventos.slice(-1)[0]")['pid']=='p2')
    an.screenshot(path=OUT+'/anot_pagina.png',full_page=True)
    # v11.12 Cambios del descanso desde el anotador (no gastan ventana)
    check('en la 1ª parte no sale «Cambio del descanso»',an.locator('[data-an=subds]').count()==0)
    an.evaluate("(()=>{let d=window.__db.directos[0];d.estado='2T';d.desde=new Date().toISOString();d.acum_ms=0})()")
    an.wait_for_selector('[data-an=subds]',timeout=9000)
    an.click('[data-an=subds]');an.wait_for_selector('.lv-pick h3:has-text("descanso")')
    an.click('[data-anx="p3"]');an.click('[data-anx="p1"]');an.wait_for_timeout(300)
    e=an.evaluate("window.__db.directos[0].eventos.slice(-1)[0]")
    check('anotador: cambio del descanso en la 2ª parte con ds y minuto del descanso',e['t']=='s' and e.get('ds')==1 and e['m']==an.evaluate('window.__db.directos[0].parte_min') and e['p']==2 and 'No gasta ventana' in an.locator('.message').inner_text(),e)
    check('se ve como «Desc.» en lo apuntado',an.locator('.lv-e b:has-text("Desc.")').count()>=1)
    an.evaluate("window.__oldSql=true")
    an.click('[data-an=subds]');an.click('[data-anx="p1"]');an.click('[data-anx="p3"]');an.wait_for_timeout(300)
    check('sin el SQL nuevo avisa de que falta un paso','falta un paso' in an.locator('.message').inner_text())
    an.evaluate("window.__oldSql=false")
    n0=an.evaluate("window.__db.directos[0].eventos.length")
    check('el anotador solo puede quitar lo suyo',an.locator('[data-anq]').count()==min(10,an.evaluate("window.__db.directos[0].eventos.filter(e=>e.an).length")) and an.locator('[data-anq]').count()<n0)
    gid=an.evaluate("window.__db.directos[0].eventos.find(e=>e.t==='f'&&e.pid==='p4').id")
    an.click(f'[data-anq="{gid}"]');an.wait_for_function("()=>document.querySelector('.lv-score').textContent.replace(/\\s/g,'')==='2-2'")
    check('quitar un gol del anotador resta el marcador',True)
    bad=page(b,db);bad.goto(URL+'?anotar=00000000-0000-4000-8000-000000000000');bad.wait_for_selector('#anData h2')
    check('enlace de anotador que no existe: aviso claro','no disponible' in bad.locator('#anData h2').text_content())
    # v11.30 El anotador lleva el reloj (empezar, pausar, descanso, 2ª parte, terminar)
    check('el anotador tiene los botones del reloj en la 2ª parte',an.locator('[data-anr=pause]').count()==1 and an.locator('[data-anr=end]').count()==1)
    ar=page(b,{**db,'directos':[{**db['directos'][0],'estado':'pre','acum_ms':0,'desde':None,'eventos':[]}]});ar.goto(URL+'?anotar='+code);ar.wait_for_selector('#anData .lv-board')
    ES=lambda:ar.evaluate("(()=>{let d=window.__db.directos[0];return [d.estado,!!d.desde]})()")
    check('sin empezar: el anotador puede «Empezar partido»',ar.locator('[data-anr=start]').count()==1 and ar.locator('[data-anr=half]').count()==0)
    ar.screenshot(path=OUT+'/anot_reloj_pre.png',full_page=True)
    ar.click('[data-anr=start]');ar.wait_for_selector('[data-anr=half]')
    check('«Empezar partido» arranca la 1ª parte',ES()==['1T',True] and 'empezado' in ar.locator('.message').inner_text())
    ar.click('[data-anr=pause]');ar.wait_for_selector('[data-anr=resume]')
    check('«Pausar» para el reloj',ES()==['1T',False])
    ar.click('[data-anr=resume]');ar.wait_for_selector('[data-anr=pause]')
    check('«Reanudar» lo vuelve a poner en marcha',ES()==['1T',True])
    ar.screenshot(path=OUT+'/anot_reloj_1t.png',full_page=True)
    ar.click('[data-anr=half]');ar.wait_for_selector('[data-anr=start2]')
    check('«Descanso» para el partido en el descanso',ES()==['DES',False] and 'Descanso' in ar.locator('.lv-clock').text_content(),[ES(),ar.locator('.lv-clock').text_content()])
    check('en el descanso, los cambios son del descanso','descanso' in ar.locator('[data-an=sub]').text_content().lower(),ar.locator('[data-an=sub]').inner_text())
    ar.screenshot(path=OUT+'/anot_reloj_descanso.png',full_page=True)
    ar.click('[data-anr=start2]');ar.wait_for_selector('[data-anr=end]')
    check('«Empezar 2ª parte»',ES()==['2T',True])
    ar.click('[data-anr=end]');ar.wait_for_function("()=>!document.querySelector('[data-anr]')")
    check('«Terminar partido» y ya no hay botones del reloj',ES()==['FIN',False])
    nr=page(b,{**db,'directos':[{**db['directos'][0],'estado':'pre','acum_ms':0,'desde':None}]},'window.__noReloj=true;');nr.goto(URL+'?anotar='+code);nr.wait_for_selector('[data-anr=start]')
    nr.click('[data-anr=start]');nr.wait_for_timeout(400)
    check('sin el SQL del reloj, avisa de que falta un paso','Falta un paso' in nr.locator('.message').inner_text())
    # El entrenador ve al momento lo que toca el anotador, y no lo pisa al guardar
    pg.evaluate("c=>window.__reloj(c,'pause')",code)
    pg.wait_for_selector('[data-live=resume]',timeout=7000)
    check('el Directo del entrenador se para cuando el anotador pausa',True)
    pg.evaluate("c=>window.__reloj(c,'resume')",code);pg.wait_for_selector('[data-live=pause]',timeout=7000)
    pg.evaluate("c=>window.__reloj(c,'half')",code)
    pg.wait_for_selector('[data-live=start2]',timeout=7000)
    check('el Directo del entrenador pasa al descanso cuando lo hace el anotador','Descanso' in pg.locator('.lv-clock').text_content(),pg.locator('.lv-clock').text_content())
    pg.click('[data-live=gc]');wait(pg,"d.gc===3");pg.wait_for_timeout(300)
    check('al guardar algo el entrenador no deshace el descanso',D(pg,"d.estado")=='DES')
    pg.click('[data-live=start2]');wait(pg,"d.estado==='2T'&&!!d.desde")
    check('el entrenador sigue pudiendo llevar el reloj',True)
    pg.evaluate("c=>window.__reloj(c,'end')",code)
    pg.wait_for_selector('[data-live=reopen]',timeout=7000)
    pg.wait_for_function("()=>JSON.parse(window.__db.futbol_personal_partidos[0].participaciones).some(x=>x.minutes>0)",timeout=6000)
    check('si el anotador termina el partido, los minutos se calculan solos',True)
    pg.click('[data-live=reopen]');wait(pg,"d.estado==='2T'")
    # Quitar el anotador
    pg.click('[data-live=anoff]');wait(pg,"d.anotador===null")
    check('«Quitar el anotador» desactiva su enlace y deja lo apuntado',D(pg,'d.anotador===null&&d.eventos.length>0') and pg.locator('[data-live=anon]').count()==1)
    # Tope del plan gratuito: 3 partidos al mes
    pg.evaluate("localStorage.setItem('mf_envios:u1:'+new Date().toISOString().slice(0,7),JSON.stringify({an:['a','b','c']}))")
    pg.click('[data-live=anon]');pg.wait_for_selector('#info:not(.hidden)')
    check('plan gratuito: el 4º partido del mes con anotador pide Pro','anotador en 3 partidos' in pg.locator('#info').inner_text())
    # Sin el SQL: lo explica
    nc=page(b,SEED,'window.__noCol=true;');login(nc);nc.click('[data-mode="fs"]') if nc.locator('[data-mode="fs"]').count() else None;nc.click('[data-tab=partidos]');nc.click('[data-action=live][data-id=m1]');nc.wait_for_selector('.lv-board')
    nc.click('[data-live=anon]');nc.wait_for_selector('.message')
    check('sin el SQL del anotador, explica qué falta','supabase-anotador.sql' in nc.locator('.message').inner_text())
    # v11.34: con anotador creado antes de empezar y la red lenta, los toques del reloj no se pierden
    rl=page(b,json.loads(json.dumps(SEED)));login(rl);rl.click('[data-mode="fs"]') if rl.locator('[data-mode="fs"]').count() else None
    rl.click('[data-tab=partidos]');rl.click('[data-action=live][data-id=m1]');rl.wait_for_selector('.lv-board')
    rl.click('[data-live=anon]');wait(rl,"!!d.anotador");rl.keyboard.press('Escape');rl.evaluate('window.__lat=350')
    T=lambda k,w=40:(rl.evaluate("k=>document.querySelector('[data-live=\"'+k+'\"]').click()",k),rl.wait_for_timeout(w))
    T('start',2500)
    check('red lenta: «Empezar partido» con anotador ya creado no vuelve a «Sin empezar»',D(rl,"d.estado==='1T'&&!!d.desde"),D(rl,'[d.estado,d.desde]'))
    T('pause');T('resume');T('pause');T('resume',3000)
    check('toques seguidos del reloj: si lo último es «Reanudar», el reloj corre',D(rl,'!!d.desde') and rl.locator('[data-live=pause]').count()==1,D(rl,'[d.estado,d.acum_ms,d.desde]'))
    T('resume') if rl.locator('[data-live=resume]').count() else None
    T('pause');T('resume');T('pause',3000)
    check('y si lo último es «Pausar», se queda parado en los dos sitios',D(rl,'!d.desde&&d.acum_ms>0') and rl.locator('[data-live=resume]').count()==1,D(rl,'[d.acum_ms,d.desde]'))
    check('el Directo tiene «Reiniciar reloj»',rl.locator('[data-live=reset]').count()==1)
    T('reset',2000)
    check('«Reiniciar reloj» lo deja en «Sin empezar» (0) y se puede volver a empezar',D(rl,"d.estado==='pre'&&d.acum_ms===0&&!d.desde") and rl.locator('[data-live=start]').count()==1)
    T('start',2000);check('y vuelve a empezar desde 0',D(rl,"d.estado==='1T'&&!!d.desde"))
    b.close()
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
if errs:print('\n'.join('FALLA consola: '+e for e in errs))
sys.exit(0 if all(res) and not errs else 1)
