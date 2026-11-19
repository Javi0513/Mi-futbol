import sys,os,re;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json
from playwright.sync_api import sync_playwright
# Llamada durante el directo o la grabación (v11.48): si una llamada u otra app deja la cámara o el micro
# en pausa o los corta, no se para nada: la grabación y la emisión siguen, la familia ve «Pausa»,
# la cámara y el micro se piden otra vez solos y el audio de la emisión pasa al micro nuevo.
FAKE=re.search(r'FAKE=r"""(.*?)"""',open(os.path.join(TESTS,'live.py'),encoding='utf-8').read(),re.S).group(1)
SFU=re.search(r'SFU=r"""(.*?)"""',open(os.path.join(TESTS,'video.py'),encoding='utf-8').read(),re.S).group(1)
HOOK=r"""
window.__st=[];window.__gumFail=false;window.__mr=[];window.__rep=[];
const _gum=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
navigator.mediaDevices.getUserMedia=async(c)=>{if(window.__gumFail)throw new DOMException('en llamada','NotReadableError');let s=await _gum(c);window.__st.push({c,s});return s};
const _MR=window.MediaRecorder;window.MediaRecorder=function(st,o){window.__mr.push(st);return new _MR(st,o)};window.MediaRecorder.isTypeSupported=(t)=>_MR.isTypeSupported(t);
const _rt=RTCRtpSender.prototype.replaceTrack;RTCRtpSender.prototype.replaceTrack=function(t){window.__rep.push(t&&t.kind+':'+t.readyState);return _rt.call(this,t)};
window.__hid=false;Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.__hid});Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.__hid?'hidden':'visible'});
window.__mute=(t,on)=>{Object.defineProperty(t,'muted',{configurable:true,get:()=>on});t.dispatchEvent(new Event(on?'mute':'unmute'))};
"""
P=[{'id':f'p{i}','owner_id':'u1','modalidad':'7','nombre':f'J{i}','foto':'','created_at':''} for i in range(8)]
PART=[{'id':f'p{i}','nombre':f'J{i}','minutes':0,'goals':0,'starter':i<7} for i in range(8)]
def seed(plan):return{'futbol_personal_jugadores':P,'futbol_personal_partidos':[{'id':'m1','owner_id':'u1','modalidad':'7','fecha':'2026-10-18','rival':'Los Pinos','participaciones':json.dumps(PART),'alineacion':'{}','created_at':''}],'perfiles':[{'id':'u1','plan':plan}]}
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8863),functools.partial(H,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8863/index.html'
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
def page(b,sd):
    ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block',accept_downloads=True,permissions=['camera','microphone'])
    pg=ctx.new_page()
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    pg.on('dialog',lambda d:d.accept())
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    pg.add_init_script('window.__seed='+json.dumps(sd)+';'+SFU+HOOK)
    return pg
def login(pg):
    pg.goto(URL);pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto12');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)');pg.wait_for_timeout(200)
def abre(pg):
    pg.click('[data-tab=partidos]');pg.click('[data-action=live][data-id=m1]');pg.wait_for_selector('.lv-board')
    pg.click('[data-live=start]');pg.wait_for_function("()=>(window.__db.directos||[])[0].estado==='1T'")
    pg.click('[data-live=cam]');pg.wait_for_function("()=>document.querySelector('.cam canvas')&&document.querySelector('.cam canvas').width>0",timeout=5000);pg.wait_for_timeout(400)
def vis(pg,h):pg.evaluate(f"window.__hid={'true' if h else 'false'};document.dispatchEvent(new Event('visibilitychange'))");pg.wait_for_timeout(400)
# hay cartel «Pausa» (amarillo) en el centro del vídeo
PAUSA="(()=>{let c=document.querySelector('.cam canvas'),g=c.getContext('2d'),y=Math.round(c.height/2-12*Math.min(c.width,c.height)/360);for(let x=0;x<c.width;x+=2){let d=g.getImageData(x,y,1,1).data;if(d[0]>220&&d[1]>180&&d[2]<60)return true}return false})()"
VT="window.__st[window.__st.length-1].s.getVideoTracks()[0]"
AT="window.__st[0].s.getAudioTracks()[0]"
txt=lambda pg:pg.locator('body').inner_text()
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required'])
    # 1) Grabando el partido: llega una llamada (iPhone: cámara y micro en pausa)
    pg=page(b,seed('gratis'));login(pg);abre(pg)
    check('sin llamada no hay cartel de pausa',not pg.evaluate(PAUSA) and pg.locator('.cam-aviso').count()==0)
    pg.click('[data-cam=rec]');pg.wait_for_selector('[data-cam=stop]');pg.wait_for_timeout(1200)
    pg.evaluate(f"window.__mute({VT},true);window.__mute({AT},true)");pg.wait_for_timeout(500)
    check('al llegar la llamada sale el aviso «Cámara o sonido en pausa»',pg.locator('.cam-aviso').count()==1 and 'la grabación sigue' in pg.locator('.cam-aviso').inner_text(),pg.locator('.cam-ui').inner_text()[:200])
    check('la grabación no se para',pg.locator('[data-cam=stop]').count()==1)
    check('el vídeo lleva el cartel «Pausa» en vez de una imagen congelada',pg.evaluate(PAUSA))
    pg.screenshot(path=OUT+'/llamada_pausa.png')
    pg.evaluate(f"window.__mute({VT},false);window.__mute({AT},false)");pg.wait_for_timeout(500)
    check('al colgar se quita el aviso y avisa de que han vuelto',pg.locator('.cam-aviso').count()==0 and 'han vuelto' in txt(pg) and 'ha seguido todo el rato' in txt(pg))
    pg.wait_for_timeout(300)
    check('y se quita el cartel del vídeo',not pg.evaluate(PAUSA))
    # 2) La llamada corta la cámara (pista terminada): se pide otra vez sola y se sigue grabando
    n0=pg.evaluate('window.__st.length')
    pg.evaluate(f"{VT}.dispatchEvent(new Event('ended'))");pg.wait_for_function(f"()=>window.__st.length>{n0}",timeout=6000);pg.wait_for_timeout(600)
    nuevo=pg.evaluate('window.__st[window.__st.length-1].c')
    check('si la cámara se corta, se vuelve a pedir sola (solo la imagen, misma cámara)',nuevo.get('video') and not nuevo.get('audio') and nuevo['video'].get('facingMode')=='environment',nuevo)
    check('y la grabación sigue sin cortarse',pg.locator('[data-cam=stop]').count()==1 and pg.locator('.cam-fin').count()==0)
    pg.wait_for_timeout(500)
    check('el vídeo vuelve a tener imagen (sin cartel)',not pg.evaluate(PAUSA) and pg.locator('.cam-aviso').count()==0)
    # 3) Con la llamada en curso la cámara no se deja abrir: se reintenta sola
    pg.evaluate("window.__gumFail=true");n0=pg.evaluate('window.__st.length')
    pg.evaluate(f"{VT}.dispatchEvent(new Event('ended'))");pg.wait_for_timeout(1500)
    check('mientras dura la llamada sigue el aviso y la grabación',pg.locator('.cam-aviso').count()==1 and pg.locator('[data-cam=stop]').count()==1)
    pg.evaluate("window.__gumFail=false");pg.wait_for_function(f"()=>window.__st.length>{n0}",timeout=12000);pg.wait_for_timeout(600)
    check('al acabar la llamada la cámara vuelve sola',pg.locator('.cam-aviso').count()==0 and pg.locator('[data-cam=stop]').count()==1)
    # 4) La cámara se queda en pausa tras la llamada (fallo del iPhone): con la app delante se pide otra vez
    vis(pg,True);pg.evaluate(f"window.__mute({VT},true)");n0=pg.evaluate('window.__st.length')
    check('al salir de la app (contestar la llamada) se pinta «Pausa» para la familia',pg.evaluate(PAUSA))
    vis(pg,False)
    check('al volver avisa de que ese rato puede no haberse grabado','puede no haberse grabado' in txt(pg))
    pg.wait_for_function(f"()=>window.__st.length>{n0}",timeout=12000);pg.wait_for_timeout(600)
    check('si la cámara sigue en pausa unos segundos, se vuelve a pedir sola',pg.locator('.cam-aviso').count()==0 and pg.locator('[data-cam=stop]').count()==1)
    # 5) Se corta el micro: se pide otro; este vídeo sigue sin sonido y el siguiente trozo ya lo tiene
    n0=pg.evaluate('window.__st.length')
    pg.evaluate(f"{AT}.dispatchEvent(new Event('ended'))");pg.wait_for_function(f"()=>window.__st.length>{n0}",timeout=6000);pg.wait_for_timeout(600)
    c=pg.evaluate('window.__st[window.__st.length-1].c')
    check('si se corta el micro, se pide solo el micro',c.get('audio') is True and not c.get('video'),c)
    check('avisa de que el sonido vuelve en el siguiente trozo','sonido no vuelve hasta' in txt(pg))
    pg.click('[data-cam=stop]');pg.wait_for_selector('.cam-fin')
    with pg.expect_download() as dl:pg.click('[data-cam=save]')
    check('todo lo grabado (antes, durante y después de la llamada) es un solo vídeo que se guarda',os.path.getsize(dl.value.path())>20000,os.path.getsize(dl.value.path()))
    pg.click('[data-cam=again]');pg.click('[data-cam=rec]');pg.wait_for_selector('[data-cam=stop]')
    check('el siguiente trozo se graba con el micro nuevo',pg.evaluate("(()=>{let s=window.__mr[window.__mr.length-1].getAudioTracks();return s.length===1&&s[0].readyState==='live'})()"))
    pg.click('[data-cam=stop]');pg.wait_for_selector('.cam-fin')
    check('al pulsar «Parar» no sale el aviso de grabación parada sola','se ha parado sola' not in txt(pg))
    pg.click('[data-cam=save]');pg.click('[data-cam=close]');pg.wait_for_selector('.lv-board')
    n0=pg.evaluate('window.__st.length');pg.wait_for_timeout(2500)
    check('al cerrar la cámara no se vuelve a pedir',pg.evaluate('window.__st.length')==n0 and pg.locator('.cam').count()==0)
    pg.context.close()
    # 6) Pro emitiendo: la familia ve «Pausa» y el sonido pasa al micro nuevo sin cortar el directo
    pr=page(b,seed('pro'));login(pr);abre(pr)
    pr.click('[data-cam=emit]');pr.wait_for_selector('text=● En directo',timeout=8000)
    pr.evaluate(f"window.__mute({VT},true)");pr.wait_for_timeout(500)
    check('emitiendo: el aviso dice que la familia ve «Pausa» y el marcador','la familia ve' in pr.locator('.cam-aviso').inner_text())
    check('y el vídeo emitido lleva el cartel',pr.evaluate(PAUSA))
    pr.screenshot(path=OUT+'/llamada_emite.png')
    pr.evaluate(f"window.__mute({VT},false)");pr.wait_for_timeout(400)
    fn=pr.evaluate('window.__fn.length')
    pr.evaluate(f"{AT}.dispatchEvent(new Event('ended'))");pr.wait_for_function("()=>window.__rep.length>0",timeout=6000)
    check('si se corta el micro emitiendo, el directo pasa al micro nuevo',pr.evaluate('window.__rep')==['audio:live'],pr.evaluate('window.__rep'))
    pr.wait_for_timeout(500)
    check('sin volver a conectar ni cortar el directo',pr.evaluate('window.__fn.length')==fn and pr.locator('text=● En directo').count()==1)
    pr.context.close()
    b.close()
srv.shutdown()
errs=[e for e in errs if 'Failed to load resource' not in e]
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
if errs:print('\n'.join('FALLA consola: '+e for e in errs))
sys.exit(0 if all(res) and not errs else 1)
