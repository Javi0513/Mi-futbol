import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json,time
from playwright.sync_api import sync_playwright
# Entrar con Face ID / huella (v11.15): bloqueo opcional con WebAuthn, comprobado con un autenticador virtual de Chromium.
FAKE=r"""
window.__calls=[];window.__out=()=>window.__cb('SIGNED_OUT',null);
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
   onAuthStateChange(c){cb=c;window.__cb=c;if(window.__autoSes)session={user:{id:'u1',email:'ana@x.es'},refresh_token:'rt1'};setTimeout(()=>c('INITIAL_SESSION',session),0);return{data:{subscription:{}}}},
   refreshSession:async(a)=>{window.__calls.push(['refresh',a&&a.refresh_token]);let m=window.__ref||'ok';
    if(m==='red')return{data:{session:null},error:{name:'AuthRetryableFetchError',status:0,message:'Failed to fetch'}};
    if(m==='caducada')return{data:{session:null},error:{name:'AuthApiError',status:400,code:'refresh_token_not_found',message:'Invalid Refresh Token'}};
    session={user:{id:'u1',email:'ana@x.es'},refresh_token:'rt2'};cb('TOKEN_REFRESHED',session);return{data:{session},error:null}},
   signInWithPassword:async()=>{session={user:{id:'u1',email:'ana@x.es'},refresh_token:'rt1'};cb('SIGNED_IN',session);return{data:{session},error:null}},
   getUser:async()=>({data:{user:session&&session.user}}),signOut:async()=>{session=null;cb('SIGNED_OUT',null)}}}}};
"""
P=[{'id':f'p{i}','owner_id':'u1','modalidad':'7','nombre':f'J{i}','foto':'','created_at':''} for i in range(8)]
PART=[{'id':f'p{i}','nombre':f'J{i}','minutes':0,'goals':0,'starter':i<7} for i in range(8)]
SEED={'futbol_personal_jugadores':P,'futbol_personal_partidos':[{'id':'m1','owner_id':'u1','modalidad':'7','fecha':'2026-10-18','rival':'Los Pinos','participaciones':json.dumps(PART),'alineacion':'{}','created_at':''}],'perfiles':[{'id':'u1','plan':'gratis'}]}
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8852),functools.partial(H,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://localhost:8852/index.html'
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
vis=lambda pg,sel:pg.locator(sel).count()>0 and pg.locator(sel).first.is_visible()
AUTO="window.__autoSes=!!localStorage.getItem('mf_sesion_copia');"
def ctx(b,extra='',ua=None):
    kw={'viewport':{'width':390,'height':844},'service_workers':'block'}
    if ua:kw['user_agent']=ua
    cx=b.new_context(**kw);pg=cx.new_page()
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    pg.on('dialog',lambda d:d.accept())
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    pg.add_init_script('window.__seed='+json.dumps(SEED)+';'+AUTO+extra)
    return cx,pg
def autenticador(cx,pg):
    c=cx.new_cdp_session(pg);c.send('WebAuthn.enable',{'enableUI':False})
    a=c.send('WebAuthn.addVirtualAuthenticator',{'options':{'protocol':'ctap2','transport':'internal','hasResidentKey':True,'hasUserVerification':True,'isUserVerified':True,'automaticPresenceSimulation':True}})
    return c,a['authenticatorId']
def login(pg):
    pg.goto(URL);pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto12');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)');pg.wait_for_timeout(300)
def cuenta(pg):
    pg.evaluate("document.querySelector('#info')&&document.querySelector('#info').classList.add('hidden')")
    pg.click('#acct');pg.wait_for_selector('#info:not(.hidden)')
def fondo(pg,minutos):
    pg.evaluate("""(m)=>{let set=(v)=>Object.defineProperty(document,'visibilityState',{get:()=>v,configurable:true});
      set('hidden');document.dispatchEvent(new Event('visibilitychange'));
      let real=Date.now.bind(Date),dt=m*60000;Date.now=()=>real()+dt;
      set('visible');document.dispatchEvent(new Event('visibilitychange'));}""",minutos)
with sync_playwright() as p:
    b=p.chromium.launch()
    cx,pg=ctx(b);cdp,aid=autenticador(cx,pg);login(pg)
    check('al entrar con contraseña no se bloquea',not vis(pg,'#bioLock'))
    cuenta(pg)
    bt=pg.locator('#info [data-acct=bio]')
    check('en Mi cuenta sale «Entrar con huella o cara»',bt.count()==1 and 'Entrar con huella o cara' in bt.text_content(),bt.text_content() if bt.count() else '')
    bt.click();pg.wait_for_timeout(600)
    cfg=json.loads(pg.evaluate("localStorage.getItem('mf_bio')")or'{}')
    check('se activa y se guarda la llave de este dispositivo',cfg.get('uid')=='u1' and len(cfg.get('id',''))>10,cfg)
    check('avisa de que está activado','Activado' in pg.locator('body').inner_text())
    check('el botón pasa a «Desactivar…»','Desactivar entrar con' in pg.locator('#info [data-acct=bio]').text_content())
    check('no se guarda nada en el servidor',not any(c[1] not in ('perfiles','futbol_personal_jugadores','futbol_personal_partidos') and c[0]!='rpc' for c in pg.evaluate('window.__calls') if c[0] in ('insert','update')),pg.evaluate('window.__calls'))
    # Abrir la app otra vez con la sesión guardada
    pg.reload();pg.wait_for_selector('#bioLock',state='attached',timeout=3000)
    check('al abrir la app con la sesión guardada pide la huella',True)
    pg.wait_for_selector('#bioLock',state='detached',timeout=5000)
    check('con la huella buena se desbloquea solo (Android)',not vis(pg,'#bioLock') and pg.locator('#app').is_visible() and 'J1' in pg.locator('#view').inner_text())
    # Huella que no se reconoce
    cdp.send('WebAuthn.setUserVerified',{'authenticatorId':aid,'isUserVerified':False})
    pg.reload();pg.wait_for_selector('#bioLock',timeout=3000);pg.wait_for_timeout(1200)
    check('si no reconoce la huella la app sigue bloqueada',vis(pg,'#bioLock'))
    pg.click('#bioLock [data-bio=ya]');pg.wait_for_timeout(1200)
    check('al reintentar y fallar lo explica','No se ha podido comprobar' in pg.locator('#bioMsg').inner_text(),pg.locator('#bioMsg').inner_text())
    check('el bloqueo tapa la app',pg.evaluate("(()=>{let r=document.querySelector('#bioLock').getBoundingClientRect();return r.width>=390&&r.height>=844&&getComputedStyle(document.querySelector('#bioLock')).zIndex>=20000})()"))
    pg.screenshot(path=os.path.join(OUT,'bio_bloqueo.png'))
    cdp.send('WebAuthn.setUserVerified',{'authenticatorId':aid,'isUserVerified':True})
    pg.click('#bioLock [data-bio=ya]');pg.wait_for_selector('#bioLock',state='detached',timeout=5000)
    check('al reintentar con la huella buena se desbloquea',pg.locator('#app').is_visible())
    # Segundo plano
    fondo(pg,2);pg.wait_for_timeout(200)
    check('2 minutos en segundo plano: no se bloquea',not vis(pg,'#bioLock'))
    cdp.send('WebAuthn.setUserVerified',{'authenticatorId':aid,'isUserVerified':False})
    fondo(pg,6);pg.wait_for_timeout(300)
    check('más de 5 minutos en segundo plano: se vuelve a bloquear',vis(pg,'#bioLock'))
    cdp.send('WebAuthn.setUserVerified',{'authenticatorId':aid,'isUserVerified':True})
    pg.click('#bioLock [data-bio=ya]');pg.wait_for_selector('#bioLock',state='detached',timeout=5000)
    # Durante un directo no se bloquea
    pg.reload();pg.wait_for_selector('#bioLock',state='detached',timeout=6000)
    pg.click('[data-tab=partidos]');pg.click('[data-action=live][data-id=m1]');pg.wait_for_selector('.lv-board')
    fondo(pg,30);pg.wait_for_timeout(300)
    check('durante un directo no se bloquea nunca',not vis(pg,'#bioLock') and vis(pg,'.lv-board'))
    pg.click('[data-live=close]');pg.wait_for_timeout(200)
    # Entrar con contraseña desde el bloqueo
    cdp.send('WebAuthn.setUserVerified',{'authenticatorId':aid,'isUserVerified':False})
    pg.reload();pg.wait_for_selector('#bioLock',timeout=3000);pg.wait_for_timeout(800)
    pg.click('#bioLock [data-bio=pw]');pg.wait_for_selector('#login:not(.hidden)',timeout=6000);pg.wait_for_timeout(300)
    check('«Entrar con mi email y contraseña» lleva a la pantalla de entrar',not vis(pg,'#bioLock') and pg.locator('#login').is_visible())
    login(pg)
    check('tras entrar con contraseña no pide la huella',not vis(pg,'#bioLock') and pg.locator('#app').is_visible())
    # Desactivar
    cuenta(pg);pg.click('#info [data-acct=bio]');pg.wait_for_timeout(400)
    check('se puede desactivar',pg.evaluate("localStorage.getItem('mf_bio')") is None and 'Entrar con huella o cara' in pg.locator('#info [data-acct=bio]').text_content())
    pg.reload();pg.wait_for_selector('#app:not(.hidden)');pg.wait_for_timeout(500)
    check('desactivado ya no la pide al abrir',not vis(pg,'#bioLock'))
    # Otra cuenta en el mismo móvil: no se le pide la huella de otro
    pg.evaluate("localStorage.setItem('mf_bio',JSON.stringify({uid:'otro',id:'AAAA'}))");pg.reload();pg.wait_for_selector('#app:not(.hidden)');pg.wait_for_timeout(500)
    check('la llave de otra cuenta no bloquea',not vis(pg,'#bioLock'))
    # Enlaces sin cuenta
    pg.evaluate("localStorage.setItem('mf_bio',JSON.stringify({uid:'u1',id:'AAAA'}))")
    pg.goto(URL+'?equipo=11111111-1111-1111-1111-111111111111');pg.wait_for_timeout(600)
    check('el enlace del equipo no se bloquea',not vis(pg,'#bioLock'))
    cx.close()
    # iPhone: no se lanza solo (Safari exige tocar el botón) y se llama Face ID
    cx2,pg2=ctx(b,"localStorage.setItem('mf_sesion_copia',JSON.stringify({rt:'rt1',uid:'u1'}));localStorage.setItem('mf_bio',JSON.stringify({uid:'u1',id:'AAAA'}));window.__autoSes=true;",ua='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')
    pg2.goto(URL);pg2.wait_for_selector('#bioLock',timeout=3000);pg2.wait_for_timeout(900)
    check('en iPhone pone Face ID / Touch ID','Face ID / Touch ID' in pg2.locator('#bioLock').inner_text())
    check('en iPhone espera a que se toque «Desbloquear»',vis(pg2,'#bioLock') and pg2.locator('#bioMsg').inner_text()=='')
    pg2.screenshot(path=os.path.join(OUT,'bio_iphone.png'))
    cx2.close()
    # Dispositivo sin Face ID ni huella (o iPad antiguo): no sale la opción
    cx3,pg3=ctx(b,"delete window.PublicKeyCredential;")
    login(pg3);cuenta(pg3)
    check('sin Face ID ni huella no sale la opción',pg3.locator('#info [data-acct=bio]').count()==0)
    pg3.click('#info [data-info=ayuda]');pg3.wait_for_timeout(300)
    check('la Guía de uso lo explica',all(w in pg3.locator('#info').text_content() for w in ('Entrar con Face ID o huella','Entrar con mi email y contraseña','5 minutos')))
    cx3.close()
    b.close()
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
if errs:print('\n'.join('FALLA consola: '+e for e in errs))
sys.exit(0 if all(res) and not errs else 1)
