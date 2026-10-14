import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json,sys
pass
from playwright.sync_api import sync_playwright
FAKE2=r"""
window.__calls=[];window.__cfg={confirm:true,user:{id:'u1',email:'ana@x.es'}};
window.__db=window.__seed||{futbol_personal_jugadores:[],futbol_personal_partidos:[],perfiles:[{id:'u1',plan:'gratis'}]};
window.supabase={createClient:()=>{let cb=null,session=null;
 const q=(t)=>{let rows=window.__db[t]||[],op='select',payload=null;
  const o={select(){return o},order(){return o},eq(){return o},insert(p){op='insert';payload=p;return o},update(){return o},delete(){return o},
   then(res){let out;if(op==='insert'){if(window.__cfg.limit)out={error:{message:'LIMITE_PLAN'}};else{rows.push(payload);out={error:null}}}else out={data:rows.map(r=>({...r})),error:null};return Promise.resolve(out).then(res)}};return o};
 return{from:q,rpc:async(n)=>{window.__calls.push(['rpc',n]);return{error:null}},auth:{
  getSession:async()=>({data:{session}}),
  onAuthStateChange(c){cb=c;setTimeout(()=>{if(window.__cfg.recovery){session={user:window.__cfg.user};c('PASSWORD_RECOVERY',session)}else c('INITIAL_SESSION',null)},0);return{data:{subscription:{}}}},
  signInWithPassword:async(a)=>{window.__calls.push(['login',a.email]);if(a.password==='mala')return{data:{},error:{message:'Invalid login credentials'}};session={user:window.__cfg.user};cb('SIGNED_IN',session);return{data:{session},error:null}},
  signUp:async(a)=>{window.__calls.push(['signup',a.email,a.options&&a.options.data&&!!a.options.data.accepted_terms_at]);if(a.email==='dup@x.es')return{data:{},error:{message:'User already registered'}};if(window.__cfg.confirm)return{data:{user:{id:'n'},session:null},error:null};session={user:{id:'u2',email:a.email}};cb('SIGNED_IN',session);return{data:{session},error:null}},
  resetPasswordForEmail:async(e,o)=>{window.__calls.push(['reset',e,o&&o.redirectTo]);return{data:{},error:null}},
  updateUser:async(a)=>{window.__calls.push(['newpass',a.password]);return{data:{user:session.user},error:null}},
  getUser:async()=>({data:{user:session&&session.user}}),signOut:async()=>{session=null;cb('SIGNED_OUT',null)}}}}};
"""
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8796),functools.partial(http.server.SimpleHTTPRequestHandler,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
def newpage(b,cfg='',w=390,h=844,hash_=''):
    ctx=b.new_context(viewport={'width':w,'height':h},accept_downloads=True);pg=ctx.new_page()
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE2))
    pg.add_init_script(cfg) if cfg else None
    pg.goto('http://127.0.0.1:8796/index.html'+hash_);pg.wait_for_timeout(200);return pg
vis=lambda pg,s:pg.locator(s).is_visible()
msg=lambda pg:pg.locator('#loginmsg').inner_text()
with sync_playwright() as p:
    b=p.chromium.launch()
    # ---- login/registro
    pg=newpage(b)
    check('login: pestañas visibles',vis(pg,'[data-am=signup]') and vis(pg,'#forgot'))
    check('login: sin campos de registro',not vis(pg,'[data-f=pw2]') and not vis(pg,'[data-f=terms]'))
    pg.screenshot(path=OUT+'/a_login.png')
    pg.click('[data-am=signup]');pg.wait_for_timeout(100)
    check('registro: campos extra visibles',vis(pg,'[data-f=pw2]') and vis(pg,'[data-f=terms]') and not vis(pg,'#forgot'))
    check('registro: botón dice Crear mi cuenta',pg.locator('#goBtn').text_content()=='Crear mi cuenta')
    pg.screenshot(path=OUT+'/a_signup.png')
    pg.fill('input[name=email]','ana');pg.click('#goBtn');check('valida email',('email válido' in msg(pg)),msg(pg))
    pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','corta');pg.fill('input[name=password2]','corta');pg.click('#goBtn');check('valida longitud 8',('8 caracteres' in msg(pg)),msg(pg))
    pg.fill('input[name=password]','largaclave1');pg.fill('input[name=password2]','otraclave1');pg.click('#goBtn');check('valida coincidencia',('no coinciden' in msg(pg)),msg(pg))
    pg.fill('input[name=password2]','largaclave1');pg.click('#goBtn');check('exige aceptar términos',('aceptar' in msg(pg)),msg(pg))
    check('no llamó a signUp aún',pg.evaluate("window.__calls.length")==0)
    pg.check('input[name=terms]');pg.click('#goBtn');pg.wait_for_timeout(150)
    check('signUp con confirmación por email: mensaje',('Cuenta creada' in msg(pg)) and vis(pg,'#login'),msg(pg))
    check('signUp envió aceptación de términos',pg.evaluate("window.__calls")==[['signup','ana@x.es',True]],pg.evaluate("window.__calls"))
    check('mensaje de éxito con estilo ok',pg.locator('#loginmsg .message.ok').count()==1)
    pg.fill('input[name=email]','dup@x.es');pg.click('#goBtn');pg.wait_for_timeout(150);check('email duplicado: mensaje claro',('ya tiene cuenta' in msg(pg)),msg(pg))
    # registro sin confirmación -> entra
    pg.evaluate("window.__cfg.confirm=false");pg.fill('input[name=email]','nuevo@x.es');pg.click('#goBtn');pg.wait_for_selector('#app:not(.hidden)',timeout=3000)
    check('registro sin confirmación entra a la app',vis(pg,'#app') and not vis(pg,'#login'))
    # cuenta
    pg.click('#acct');pg.wait_for_timeout(150)
    check('cuenta: abre modal con email',vis(pg,'#info') and 'nuevo@x.es' in pg.locator('#infoBody').inner_text(),pg.locator('#infoBody').inner_text()[:80])
    check('cuenta: plan gratuito',('Prueba gratuita' in pg.locator('#infoBody').inner_text()))
    pg.screenshot(path=OUT+'/a_cuenta.png')
    with pg.expect_download() as d:pg.click('[data-acct=export]')
    data=json.load(open(d.value.path()));check('exportar: JSON con claves',set(data)>={'exportado','email','jugadores','partidos'} and data['email']=='nuevo@x.es',list(data))
    pg.click('#info [data-info=privacy]');pg.wait_for_timeout(100);check('privacidad: texto legal',('RGPD' in pg.locator('#infoBody').inner_text()) and 'Francisco Javier' in pg.locator('#infoBody').inner_text())
    pg.screenshot(path=OUT+'/a_priv.png')
    pg.click('#closeInfo');check('cierra modal',not vis(pg,'#info'))
    pg.click('#acct');pg.click('[data-acct=delete]');pg.wait_for_timeout(100);pg.click('[data-acct=delete2]');pg.wait_for_timeout(100)
    check('borrar: exige escribir BORRAR',pg.evaluate("window.__calls.filter(c=>c[0]==='rpc').length")==0 and vis(pg,'#info'))
    pg.fill('#delConf','borrar');pg.click('[data-acct=delete2]');pg.wait_for_timeout(300)
    check('borrar: llama rpc borrar_mi_cuenta',pg.evaluate("window.__calls.filter(c=>c[0]==='rpc')")==[['rpc','borrar_mi_cuenta']])
    check('borrar: vuelve al login con aviso',vis(pg,'#login') and not vis(pg,'#app') and not vis(pg,'#info') and 'borrado' in msg(pg),msg(pg))
    # login normal + límite + logout desde cuenta + pizarra por usuario
    pg.click('[data-am=login]');pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','mala');pg.click('#goBtn');pg.wait_for_timeout(150)
    check('login mal: mensaje',('incorrectos' in msg(pg)),msg(pg))
    pg.fill('input[name=password]','buenaclave');pg.click('#goBtn');pg.wait_for_selector('#app:not(.hidden)')
    pg.evaluate("localStorage.setItem('mf_pizarra_v1',JSON.stringify({'7':{strokes:[{p:[[.1,.1],[.2,.2]],c:'#fff',w:3,t:'pen'}]}}));localStorage.setItem('mf_pizarra_uid','u1')")
    pg.evaluate("window.__cfg.limit=true");pg.click('[data-action=add-player]');pg.fill('#playerForm input[name=nombre]','Pepe');pg.click('#playerForm .primary');pg.wait_for_timeout(300)
    check('límite del plan: abre el plan Pro',('plan pro' in pg.locator('#infoTitle').inner_text().lower()))
    pg.click('#closeInfo');pg.click('#acct');pg.click('[data-acct=logout]');pg.wait_for_selector('#login:not(.hidden)')
    check('logout deja login y oculta datos',vis(pg,'#login') and not vis(pg,'#app'))
    pg.evaluate("window.__cfg.user={id:'u9',email:'otro@x.es'}");pg.fill('input[name=email]','otro@x.es');pg.fill('input[name=password]','buenaclave');pg.click('#goBtn');pg.wait_for_selector('#app:not(.hidden)')
    check('otro usuario: pizarra de ana NO se hereda',pg.evaluate("localStorage.getItem('mf_pizarra_v1')")is None and pg.evaluate("localStorage.getItem('mf_pizarra_uid')")=='u9')
    # ---- reset
    pg2=newpage(b)
    pg2.click('#forgot');pg2.wait_for_timeout(100)
    check('reset: solo email',vis(pg2,'[data-f=mail]') and not vis(pg2,'[data-f=pw]') and pg2.locator('#goBtn').text_content()=='Enviar enlace')
    pg2.fill('input[name=email]','ana@x.es');pg2.click('#goBtn');pg2.wait_for_timeout(150)
    check('reset: llama a resetPasswordForEmail',pg2.evaluate("window.__calls")[0][:2]==['reset','ana@x.es'] and msg(pg2).startswith('Si ese email'),pg2.evaluate("window.__calls"))
    pg2.screenshot(path=OUT+'/a_reset.png')
    # ---- recuperación
    pg3=newpage(b,"window.__RECOV=1",hash_='#access_token=x&type=recovery')
    pg3.evaluate("0")
    pg4=newpage(b,"Object.defineProperty(window,'__x',{value:1})",hash_='#type=recovery')
    pg4.close()
    ctx=b.new_context(viewport={'width':390,'height':844});pg5=ctx.new_page()
    pg5.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)))
    pg5.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE2))
    pg5.add_init_script("window.addEventListener('DOMContentLoaded',()=>{});")
    pg5.goto('http://127.0.0.1:8796/index.html#access_token=x&type=recovery');
    pg5.evaluate("window.__cfg.recovery=true");pg5.reload();pg5.wait_for_timeout(300)
    # tras reload se pierde el flag (init script), así que simulamos con init script
    ctx2=b.new_context(viewport={'width':390,'height':844});pg6=ctx2.new_page()
    pg6.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)))
    pg6.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE2.replace("window.__cfg={confirm:true,","window.__cfg={recovery:true,confirm:true,")))
    pg6.goto('http://127.0.0.1:8796/index.html#access_token=x&type=recovery');pg6.wait_for_timeout(400)
    check('recuperación: muestra «nueva contraseña», no la app',vis(pg6,'#login') and not vis(pg6,'#app') and pg6.locator('#goBtn').text_content()=='Guardar contraseña' and not vis(pg6,'[data-f=mail]'))
    pg6.screenshot(path=OUT+'/a_newpass.png')
    pg6.fill('input[name=password]','nuevaclave1');pg6.fill('input[name=password2]','distinta');pg6.click('#goBtn');check('recuperación: valida coincidencia','no coinciden' in msg(pg6))
    pg6.fill('input[name=password2]','nuevaclave1');pg6.click('#goBtn');pg6.wait_for_selector('#app:not(.hidden)',timeout=3000)
    check('recuperación: guarda y entra',pg6.evaluate("window.__calls.filter(c=>c[0]==='newpass')")==[['newpass','nuevaclave1']] and not vis(pg6,'#login'))
    # ---- escritorio login
    pg7=newpage(b,w=1280,h=800);pg7.click('[data-am=signup]');pg7.screenshot(path=OUT+'/a_signup_desktop.png')
    b.close()
print('\nPASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),'errores:',errs)
