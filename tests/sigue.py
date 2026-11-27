import sys,os,re;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json,datetime
from playwright.sync_api import sync_playwright
# «🎯 Seguir la jugada» (v11.59, estilo Veo): con el móvil quieto viendo todo el campo, la app mira dónde se
# mueven los jugadores y el balón y hace zoom digital hacia la jugada. Gratis: 2 partidos o entrenos al mes.
# La cámara de prueba es un vídeo inventado (campo verde, jugadores y balón moviéndose en la derecha).
FAKE=re.search(r'FAKE=r"""(.*?)"""',open(os.path.join(TESTS,'live.py'),encoding='utf-8').read(),re.S).group(1)
HOY=datetime.date.today().isoformat()
P=[{'id':f'p{i}','owner_id':'u1','modalidad':'7','nombre':f'J{i}','foto':'','created_at':''} for i in range(8)]
PART=[{'id':f'p{i}','nombre':f'J{i}','minutes':0,'goals':0,'starter':i<7} for i in range(8)]
def seed(plan):return{'futbol_personal_jugadores':P,'futbol_personal_partidos':[{'id':f'm{k}','owner_id':'u1','modalidad':'7','fecha':'2026-10-1'+str(k),'rival':'Rival '+str(k),'participaciones':json.dumps(PART),'alineacion':'{}','created_at':''} for k in (1,2,3)],'entrenamientos':[{'id':'t1','owner_id':'u1','modalidad':'7','fecha':HOY,'asistencia':{}}],'perfiles':[{'id':'u1','plan':plan}]}

# Vídeo de prueba (formato y4m, sin librerías): 320x180, 20 imágenes por segundo, la jugada a la derecha
W,H,N=320,180,80
Y4M=os.path.join(OUT,'sigue_campo.y4m')
def frame(f):
    y=bytearray([95])*(W*H)
    def rect(x0,y0,w,h,v):
        for yy in range(max(0,y0),min(H,y0+h)):
            a=yy*W+max(0,x0);b=yy*W+min(W,x0+w)
            if b>a:y[a:b]=bytes([v])*(b-a)
    rect(0,20,W,2,200);rect(0,H-22,W,2,200);rect(W//2,20,2,H-40,200)  # líneas del campo (quietas)
    import math
    for k in range(9):  # jugadores oscuros moviéndose alrededor de x≈240
        cx=int(240+28*math.sin(f*0.25+k*1.7)+(k-4)*6);cy=int(60+k*9+6*math.cos(f*0.3+k))
        rect(cx-3,cy-7,6,14,25)
    bx=int(225+35*math.sin(f*0.4));by=int(95+15*math.cos(f*0.33))  # balón blanco
    rect(bx-2,by-2,4,4,250)
    return bytes(y)+bytes([128])*(W*H//2)
if not os.path.exists(Y4M):
    with open(Y4M,'wb') as fh:
        fh.write(f'YUV4MPEG2 W{W} H{H} F20:1 Ip A1:1 C420jpeg\n'.encode())
        for f in range(N):fh.write(b'FRAME\n'+frame(f))

class Hh(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8871),functools.partial(Hh,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8871/index.html'
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
def page(b,sd,extra=''):
    ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block',accept_downloads=True,permissions=['camera','microphone'])
    pg=ctx.new_page()
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' and 'directo_vist' not in m.text else None)
    pg.on('dialog',lambda d:d.accept())
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    pg.add_init_script('window.__seed='+json.dumps(sd)+";localStorage.setItem('mf_entrenos:u1','1');"+extra)
    return pg
def login(pg):
    pg.goto(URL);pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto12');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)');pg.wait_for_timeout(300)
    if pg.locator('#info').is_visible():pg.evaluate("document.getElementById('info').classList.add('hidden')")
def camara(pg,mid):
    pg.click('[data-tab=partidos]');pg.click(f'[data-action=live][data-id={mid}]');pg.wait_for_selector('[data-live=cam]')
    pg.click('[data-live=cam]');pg.wait_for_selector('.cam canvas')
    pg.wait_for_function("()=>document.querySelector('.cam canvas').width>0",timeout=8000);pg.wait_for_timeout(300)
MES="localStorage.getItem('mf_envios:u1:'+new Date().toISOString().slice(0,7))"
EST=lambda pg:pg.evaluate('window.__mfSgEst()')
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--use-file-for-fake-video-capture='+Y4M])
    pg=page(b,seed('gratis'));login(pg)
    # 1) El análisis, con imágenes inventadas
    r=pg.evaluate("""(()=>{const A=window.__mfSg,aw=80,ah=45,L=aw*ah;
      const img=(f)=>{let g=new Uint8Array(L).fill(90),b=new Uint8Array(L);f(g,b);return [g,b]};
      const put=(g,x,y,w,h,v,b)=>{for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++){g[yy*aw+xx]=v;if(b)b[yy*aw+xx]=1}};
      let out={};
      let [p0]=img(()=>{}),[q0,b0]=img(()=>{});
      out.quieto=A(q0,p0,b0,aw,ah,1);
      let [p1]=img(g=>{for(let k=0;k<6;k++)put(g,55+k*3,10+k*4,2,4,20)}),[q1,b1]=img(g=>{for(let k=0;k<6;k++)put(g,57+k*3,11+k*4,2,4,20)});
      out.derecha=A(q1,p1,b1,aw,ah,1);
      let [p2]=img(g=>{put(g,5,5,3,6,20);put(g,10,30,3,6,20)}),[q2,b2]=img(g=>{put(g,7,6,3,6,20);put(g,12,31,3,6,20)});
      out.izquierda=A(q2,p2,b2,aw,ah,1);
      let [p3]=img(g=>{put(g,40,20,2,2,240)}),[q3,b3]=img((g,b)=>{put(g,43,22,2,2,240,b)});
      out.balon=A(q3,p3,b3,aw,ah,1);
      let [p4]=img(()=>{}),[q4,b4]=img(g=>g.fill(200));
      out.todo=A(q4,p4,b4,aw,ah,1);
      let [p5]=img(g=>{put(g,15,10,2,4,20);put(g,30,30,2,4,20);put(g,45,15,2,4,20);put(g,60,30,2,4,20)}),[q5,b5]=img(g=>{put(g,16,11,2,4,20);put(g,31,31,2,4,20);put(g,46,16,2,4,20);put(g,61,31,2,4,20)});
      let [p6]=img(g=>{put(g,40,20,2,4,20);put(g,44,22,2,4,20)}),[q6,b6]=img(g=>{put(g,41,21,2,4,20);put(g,45,23,2,4,20)});
      out.junto=A(q6,p6,b6,aw,ah,1);out.lejos=A(q5,p5,b5,aw,ah,1);
      // v11.67: alguien que pasa pegado a la cámara (mancha alta a la izquierda, hasta abajo) y jugadores pequeños a la derecha
      let [p7]=img(g=>{put(g,8,12,9,33,20);for(let k=0;k<5;k++)put(g,58+k*3,14+k%2*3,2,3,20)}),[q7,b7]=img(g=>{put(g,11,12,9,33,20);for(let k=0;k<5;k++)put(g,59+k*3,15+k%2*3,2,3,20)});
      out.cerca=A(q7,p7,b7,aw,ah,1);
      // solo se mueve alguien pegado a la cámara: no hay jugada
      let [p8]=img(g=>put(g,30,14,10,31,20)),[q8,b8]=img(g=>put(g,33,14,10,31,20));
      out.solocerca=A(q8,p8,b8,aw,ah,1);
      return out})()""")
    check('si no se mueve nada no hay jugada que seguir',r['quieto'] is None)
    check('jugadores moviéndose a la derecha → encuadre a la derecha',r['derecha'] and r['derecha']['x']>0.65,r['derecha'] and r['derecha']['x'])
    check('jugadores moviéndose a la izquierda → encuadre a la izquierda',r['izquierda'] and r['izquierda']['x']<0.3,r['izquierda'] and r['izquierda']['x'])
    check('encuentra el balón (punto claro pequeño que se mueve)',r['balon'] and r['balon']['ball'] and abs(r['balon']['ball']['x']-0.55)<0.06,r['balon'] and r['balon']['ball'])
    check('si cambia toda la imagen (móvil movido o luz) no se mueve el encuadre',r['todo'] is None)
    check('no se va detrás de quien pasa pegado a la cámara: sigue a los jugadores',r['cerca'] and r['cerca']['x']>0.65,r['cerca'] and r['cerca']['x'])
    check('si solo se mueve alguien delante de la cámara, no hay jugada',r['solocerca'] is None,r['solocerca'] and r['solocerca']['x'])
    check('jugadores juntos → más zoom que separados',r['junto']['z']>r['lejos']['z']+0.3 and r['junto']['z']<=2.0,[r['junto']['z'],r['lejos']['z']])
    # 2) En la cámara del Directo, plan gratuito
    camara(pg,'m1')
    bt=pg.locator('[data-cam=sigue]')
    check('en la cámara sale «🎯 Seguir la jugada: No» con los gratis del mes',bt.count()==1 and 'Seguir la jugada: No (2 gratis este mes)' in bt.text_content(),bt.text_content() if bt.count() else '')
    check('apagado: no hay encuadre',EST(pg) is None)
    pg.screenshot(path=OUT+'/sigue_antes.png')
    bt.click();pg.wait_for_timeout(600)
    avisa='siguiendo la jugada' in pg.locator('body').inner_text().lower()
    pg.wait_for_timeout(3900)
    e=EST(pg)
    check('al tocarlo se pone en «Sí»','Seguir la jugada: Sí' in pg.locator('[data-cam=sigue]').text_content())
    check('cuenta 1 de los 2 del mes',json.loads(pg.evaluate(MES) or '{}').get('sig')==['m1'])
    check('el encuadre se va hacia la jugada (derecha)',e and e['x']>e['w']*0.58,e)
    check('y se acerca (zoom)',e and e['z']>1.15,e)
    check('el encuadre no se sale de la imagen',e and e['x']+e['w']/(2*e['z'])<=e['w']+0.5 and e['y']-e['h']/(2*e['z'])>=-0.5,e)
    check('avisa de cómo poner el móvil',avisa)
    check('v11.68: si la jugada está hacia un lado, el encuadre llega hasta esa portería (borde de la imagen)',e and e['x']+e['w']/(2*e['z'])>=e['w']-1,e)
    pg.screenshot(path=OUT+'/sigue_activo.png')
    # v11.68: encuadre Abierto por defecto (acerca poco), y se puede cambiar a Medio y Cerrado
    en=pg.locator('[data-cam=encuadre]')
    check('v11.68: con el seguimiento puesto sale «🔍 Encuadre: Abierto»',en.count()==1 and 'Encuadre: Abierto' in en.text_content())
    check('v11.68: en Abierto acerca poco (máx. 1,35x) para ver el balón',e and e['z']<=1.36,e)
    pg.click('[data-cam=encuadre]');pg.wait_for_timeout(200)
    check('v11.68: se cambia a «Medio»','Encuadre: Medio' in pg.locator('[data-cam=encuadre]').text_content())
    pg.click('[data-cam=encuadre]');pg.wait_for_timeout(2500)
    e2=EST(pg)
    check('v11.68: en «Cerrado» acerca más',('Encuadre: Cerrado' in pg.locator('[data-cam=encuadre]').text_content()) and e2['z']>e['z']+0.05,[e['z'],e2['z']])
    check('v11.68: la app recuerda el encuadre',pg.evaluate("localStorage.getItem('mf_cam_enc')")=='c')
    pg.screenshot(path=OUT+'/sigue_encuadre.png')
    pg.click('[data-cam=encuadre]');pg.wait_for_timeout(200)
    # La imagen pintada es la de la derecha ampliada: los jugadores (oscuros) se ven más grandes → más oscuro
    dark=pg.evaluate("(()=>{let c=document.querySelector('.cam canvas'),d=c.getContext('2d').getImageData(0,c.height*0.25,c.width,c.height*0.5).data,n=0;for(let i=0;i<d.length;i+=4)if(d[i]<50&&d[i+1]<50)n++;return n/(d.length/4)})()")
    check('la imagen grabada es la parte ampliada',dark>0.03,dark)
    # Grabar con el seguimiento puesto
    pg.click('[data-cam=rec]');pg.wait_for_selector('[data-cam=stop]');pg.wait_for_timeout(2500)
    pg.click('[data-cam=stop]');pg.wait_for_selector('.cam-fin')
    with pg.expect_download() as dl:pg.click('[data-cam=save]')
    sz=os.path.getsize(dl.value.path())
    check('se graba y se guarda el vídeo siguiendo la jugada',sz>20000,sz)
    pg.click('[data-cam=again]');pg.wait_for_selector('[data-cam=sigue]')
    pg.click('[data-cam=sigue]');pg.wait_for_timeout(300)
    check('sin seguimiento no sale el botón de encuadre',pg.locator('[data-cam=encuadre]').count()==0)
    check('se puede quitar: vuelve a todo el campo',EST(pg) is None and 'Seguir la jugada: No' in pg.locator('[data-cam=sigue]').text_content())
    pg.click('[data-cam=sigue]');pg.wait_for_timeout(200)
    check('volver a ponerlo en el mismo partido no gasta otro',json.loads(pg.evaluate(MES) or '{}').get('sig')==['m1'] and EST(pg) is not None)
    pg.click('[data-cam=close]');pg.wait_for_timeout(300)
    # Límite del plan gratuito
    pg.evaluate("localStorage.setItem('mf_envios:u1:'+new Date().toISOString().slice(0,7),JSON.stringify({sig:['m1','m2']}))")
    if pg.locator('[data-live=close]').count():pg.click('[data-live=close]')
    camara(pg,'m3')
    check('sin gratis este mes: «(0 gratis este mes)»','(0 gratis este mes)' in pg.locator('[data-cam=sigue]').text_content())
    pg.click('[data-cam=sigue]');pg.wait_for_timeout(400)
    check('el tercero del mes pide Pro y no se pone',EST(pg) is None and 'Seguir la jugada' in pg.locator('body').inner_text() and 'Pro' in pg.locator('body').inner_text())
    pg.screenshot(path=OUT+'/sigue_limite.png')
    pg.close()
    # 3) Entrenos: también sale
    pg=page(b,seed('gratis'));login(pg)
    pg.click('[data-tab=entrenos]');pg.wait_for_selector('#view [data-tr=rec]');pg.click('#view [data-tr=rec]');pg.wait_for_selector('.cam canvas');pg.wait_for_timeout(500)
    pg.screenshot(path=OUT+'/sigue_entreno.png')
    check('en «Grabar el entreno» también está «Seguir la jugada»',pg.locator('[data-cam=sigue]').count()==1)
    pg.close()
    # 4) Pro: sin límite y se acuerda
    pg=page(b,seed('pro'),"localStorage.setItem('mf_envios:u1:'+new Date().toISOString().slice(0,7),JSON.stringify({sig:['a','b','c']}));");login(pg)
    camara(pg,'m2')
    check('con Pro no dice nada de gratis',pg.locator('[data-cam=sigue]').text_content().strip()=='🎯 Seguir la jugada: No')
    pg.click('[data-cam=sigue]');pg.wait_for_timeout(300)
    check('con Pro se pone aunque se hayan usado más de 2',EST(pg) is not None)
    pg.click('[data-cam=close]');pg.wait_for_timeout(300)
    if pg.locator('[data-live=close]').count():pg.click('[data-live=close]')
    camara(pg,'m3');pg.wait_for_timeout(300)
    check('con Pro, la próxima vez ya sale puesto',EST(pg) is not None and 'Sí' in pg.locator('[data-cam=sigue]').text_content())
    # 5) Móvil lento: mira menos veces por segundo
    pg.evaluate("(()=>{let o=CanvasRenderingContext2D.prototype.getImageData;CanvasRenderingContext2D.prototype.getImageData=function(...a){let t=performance.now();while(performance.now()-t<30);return o.apply(this,a)}})()")
    pg.wait_for_timeout(2500)
    e=EST(pg)
    check('en un móvil lento mira menos veces (no se cuelga)',e and e['cada']>=200,e)
    pg.close()
    b.close()
print('errores:',errs[:5])
check('sin errores en la consola',not errs,errs[:3])
print('PASS',sum(res),'/',len(res),[i for i,x in enumerate(res) if not x])
sys.exit(0 if all(res) else 1)
