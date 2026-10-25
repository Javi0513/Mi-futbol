import sys,os,re;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json
from playwright.sync_api import sync_playwright
# Cámara del directo: grabar con el marcador encima, guardar en el móvil y emitir en vivo.
# Usa la cámara y el micro falsos de Chromium. El "Cloudflare" es otro RTCPeerConnection en la misma página.
FAKE=re.search(r'FAKE=r"""(.*?)"""',open(os.path.join(TESTS,'live.py'),encoding='utf-8').read(),re.S).group(1)
SFU=r"""
window.__fn=[];window.__sfu=[];
const _f=window.fetch;
window.fetch=async(u,o)=>{if(!String(u).includes('/functions/v1/video-directo'))return _f(u,o);
 const b=JSON.parse(o.body);window.__fn.push({b,h:o.headers});
 const J=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{'Content-Type':'application/json'}});
 if(window.__fnErr)return J({error:window.__fnErr},400);
 if(b.accion==='emitir'){const pc=new RTCPeerConnection();window.__sfu.push(pc);
  pc.ontrack=e=>window.__got=(window.__got||[]).concat(e.track.kind);
  await pc.setRemoteDescription({type:'offer',sdp:b.sdp});await pc.setLocalDescription(await pc.createAnswer());await new Promise(r=>{if(pc.iceGatheringState==='complete')return r();pc.onicegatheringstatechange=()=>pc.iceGatheringState==='complete'&&r()});
  return J({sdp:pc.localDescription.sdp})}
 if(b.accion==='parar')return J({ok:true});
 if(b.accion==='ver'){if(!window.__hayVideo)return J({video:false});
  const cv=document.createElement('canvas');cv.width=320;cv.height=180;const g=cv.getContext('2d');
  setInterval(()=>{g.fillStyle='#'+Math.floor(Math.random()*16777215).toString(16).padStart(6,'0');g.fillRect(0,0,320,180)},50);
  const pc=new RTCPeerConnection();window.__sfu.push(pc);cv.captureStream(20).getTracks().forEach(t=>pc.addTransceiver(t,{direction:'sendonly'}));
  await pc.setLocalDescription(await pc.createOffer());await new Promise(r=>{if(pc.iceGatheringState==='complete')return r();pc.onicegatheringstatechange=()=>pc.iceGatheringState==='complete'&&r()});
  return J({video:true,sesion:'sesion-prueba-123',sdp:pc.localDescription.sdp,renegociar:true})}
 if(b.accion==='responder'){await window.__sfu[window.__sfu.length-1].setRemoteDescription({type:'answer',sdp:b.sdp});return J({ok:true})}
 return J({error:'?'},400)};
"""
P=[{'id':f'p{i}','owner_id':'u1','modalidad':'7','nombre':f'J{i}','foto':'','created_at':''} for i in range(8)]
PART=[{'id':f'p{i}','nombre':f'J{i}','minutes':0,'goals':0,'starter':i<7} for i in range(8)]
def seed(plan):return{'futbol_personal_jugadores':P,'futbol_personal_partidos':[{'id':'m1','owner_id':'u1','modalidad':'7','fecha':'2026-10-18','rival':'Los Pinos','participaciones':json.dumps(PART),'alineacion':'{}','created_at':''}],'perfiles':[{'id':'u1','plan':plan}]}
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8813),functools.partial(H,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8813/index.html'
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
def page(b,sd,extra=''):
    ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block',accept_downloads=True,permissions=['camera','microphone'])
    pg=ctx.new_page()
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    pg.on('dialog',lambda d:d.accept())
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    pg.add_init_script('window.__seed='+json.dumps(sd)+';'+SFU+extra)
    return pg
def login(pg):
    pg.goto(URL);pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto12');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)');pg.wait_for_timeout(200)
D=lambda pg,js:pg.evaluate('(()=>{let d=(window.__db.directos||[])[0];return '+js+'})()')
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
    pg=page(b,seed('gratis'));login(pg)
    pg.click('[data-tab=partidos]');pg.click('[data-action=live][data-id=m1]');pg.wait_for_selector('.lv-board')
    check('el directo tiene botón de cámara',pg.locator('[data-live=cam]').count()==1)
    pg.click('[data-live=start]');pg.wait_for_function("()=>(window.__db.directos||[])[0].estado==='1T'")
    pg.click('[data-live=cam]');pg.wait_for_selector('.cam canvas')
    pg.wait_for_function("()=>document.querySelector('.cam canvas').width>0",timeout=5000);pg.wait_for_timeout(500)
    check('se abre la cámara a pantalla completa',pg.locator('.cam').is_visible() and pg.evaluate("document.body.classList.contains('cam-on')"))
    px=lambda: pg.evaluate("(()=>{let c=document.querySelector('.cam canvas'),g=c.getContext('2d'),u=Math.min(c.width,c.height)/360,w=c.width;for(let x=0;x<w*0.8;x+=2){let d=g.getImageData(x,Math.round(20*u),1,1).data;if(d[0]<80&&d[1]>200&&d[2]<140)return true}return false})()")
    check('el marcador está pintado encima del vídeo',px())
    pg.click('[data-cam=gc]');pg.wait_for_function("()=>(window.__db.directos||[])[0].gc===1",timeout=4000)
    check('se puede apuntar un gol sin salir de la cámara',D(pg,'d.gc===1&&d.eventos.length===1'))
    pg.click('[data-cam=gf]');pg.wait_for_selector('.cam-pick');pg.click('.cam-pick [data-camsc="p3"]');pg.wait_for_function("()=>(window.__db.directos||[])[0].gf===1",timeout=4000)
    check('gol nuestro con goleador desde la cámara',D(pg,"d.eventos[1].n==='J3'"))
    pg.click('[data-cam=rec]');pg.wait_for_selector('[data-cam=stop]');pg.wait_for_timeout(2500)
    check('mientras graba se ve el tiempo',re.search(r'0:0[1-9]',pg.locator('[data-camt]').inner_text()),pg.locator('[data-camt]').inner_text())
    pg.click('[data-cam=flip]');pg.wait_for_timeout(800)
    check('girar la cámara no corta la grabación',pg.locator('[data-cam=stop]').count()==1)
    pg.click('[data-cam=stop]');pg.wait_for_selector('.cam-fin')
    check('al parar el vídeo queda listo para guardar',pg.locator('[data-cam=save]').count()==1,pg.locator('.cam-fin p').inner_text())
    with pg.expect_download() as dl:pg.click('[data-cam=save]')
    d=dl.value;f=d.path();sz=os.path.getsize(f)
    check('se descarga al móvil con nombre del partido',re.match(r'partido-mi-equipo-los-pinos-2026-10-18-\d\dh\d\d\.(mp4|webm)$',d.suggested_filename) and sz>20000,f'{d.suggested_filename} {sz}')
    pg.screenshot(path=OUT+'/video_fin.png')
    pg.click('[data-cam=again]');pg.wait_for_selector('[data-cam=rec]')
    pg.click('[data-cam=emit]');pg.wait_for_timeout(300)
    check('emitir sin Pro: avisa de que es Pro y no conecta',pg.evaluate('window.__fn.length')==0 and 'Pro' in pg.locator('.message').inner_text())
    pg.click('[data-cam=close]');pg.wait_for_selector('.lv-board')
    check('cerrar apaga la cámara y vuelve al directo',pg.locator('.cam').count()==0)
    did=D(pg,'d.id')
    # Con Pro: emite al "Cloudflare" falso
    pr=page(b,seed('pro'));login(pr)
    pr.click('[data-tab=partidos]');pr.click('[data-action=live][data-id=m1]');pr.wait_for_selector('.lv-board')
    pr.click('[data-live=cam]');pr.wait_for_function("()=>document.querySelector('.cam canvas')&&document.querySelector('.cam canvas').width>0",timeout=5000)
    pr.click('[data-cam=emit]')
    try:pr.wait_for_selector('text=● En directo',timeout=8000)
    except Exception as e:print('DEBUG',pr.evaluate("[window.__fn.length,window.__sfu.map(p=>p.connectionState+'/'+p.iceConnectionState),document.querySelector('.cam-ui').innerText,(document.querySelector('.message')||{}).innerText]"));raise
    fn=pr.evaluate('window.__fn[0]')
    check('emite al servidor el directo con vídeo + sonido',fn['b']['accion']=='emitir' and fn['b']['directo']==D(pr,'d.id') and sorted(x['trackName'] for x in fn['b']['pistas'])==['a','v'] and 'm=video' in fn['b']['sdp'],json.dumps(fn)[:200])
    pr.wait_for_function("()=>(window.__got||[]).length===2",timeout=5000)
    check('el servidor recibe las pistas de vídeo y audio',sorted(pr.evaluate('window.__got'))==['audio','video'])
    pr.click('[data-cam=rec]');pr.wait_for_timeout(1200)
    check('se puede grabar y emitir a la vez',pr.locator('[data-cam=stop]').count()==1 and pr.locator('text=● En directo').count()==1)
    pr.click('[data-cam=stop]');pr.wait_for_selector('.cam-fin')
    pr.screenshot(path=OUT+'/video_emite.png')
    check('tras grabar se sigue emitiendo y se puede cortar',pr.locator('[data-cam=unemit]').count()==1)
    pr.click('[data-cam=unemit]')
    pr.wait_for_timeout(300)
    check('cortar avisa al servidor',pr.evaluate("window.__fn.some(x=>x.b.accion==='parar')"))
    # Error del servidor (p. ej. sin configurar)
    pr.evaluate("window.__fnErr='El vídeo en directo aún no está configurado'")
    pr.click('[data-cam=again]');pr.click('[data-cam=emit]');pr.wait_for_timeout(500)
    check('si el servidor falla, lo explica y se puede reintentar',pr.locator('[data-cam=emit]').count()==1 and 'configurado' in pr.locator('.message').inner_text())
    # Página pública con vídeo
    db=pg.evaluate('window.__db');db['directos'][0]['video_desde']='2026-10-23T20:00:00Z'
    pub=page(b,db,'window.__hayVideo=true;');pub.goto(URL+'?directo='+did);pub.wait_for_selector('#pub .lv-board')
    pub.wait_for_selector('#pubVid:not(.hidden)',timeout=8000)
    pub.wait_for_function("()=>document.querySelector('#pubVid video').videoWidth>0",timeout=8000)
    check('el enlace público muestra el vídeo en vivo y el marcador',pub.locator('.lv-score').count()==1 and pub.evaluate("document.querySelector('#pubVid video').videoWidth")==320)
    check('el espectador responde a la oferta del servidor',[x['b']['accion'] for x in pub.evaluate('window.__fn')]==['ver','responder'] and pub.evaluate('window.__fn[1].b.sesion')=='sesion-prueba-123')
    pub.screenshot(path=OUT+'/video_pub.png')
    pub.click('[data-pubsound]')
    check('botón para activar el sonido',pub.evaluate("!document.querySelector('#pubVid video').muted"))
    sin=page(b,pg.evaluate('window.__db'));sin.goto(URL+'?directo='+did);sin.wait_for_selector('#pub .lv-board');sin.wait_for_timeout(300)
    check('sin emisión no se pide vídeo ni se ve el reproductor',sin.evaluate('window.__fn.length')==0 and sin.locator('#pubVid').is_hidden())
    b.close()
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
if errs:print('\n'.join('FALLA consola: '+e for e in errs))
sys.exit(0 if all(res) and not errs else 1)
