import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
# v11.61: «Enviar» en la pizarra (imagen o vídeo de la jugada por WhatsApp o guardada en el móvil),
# botón «Guardar» renombrado a «Mis jugadas» y botón de enviar en cada jugada guardada.
# Reutiliza el arranque de equipo.py (base de datos falsa, servidor y entrar) en otro puerto.
_src=open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'equipo.py'),encoding='utf-8').read()
exec(_src.split('with sync_playwright() as p:')[0].replace('8853','8871'))
# Compartir falso: guarda lo compartido en window.__shared; «táctil» con __tactil
SHARE="""(()=>{window.__shared=[];
 if(window.__sinShare)return;
 navigator.canShare=(d)=>!!(d&&d.files&&d.files.length);
 navigator.share=async(d)=>{window.__shared.push({n:d.files[0].name,t:d.files[0].type,s:d.files[0].size,title:d.title||''})};
 if(window.__tactil){const mm=window.matchMedia.bind(window);window.matchMedia=(q)=>/pointer:\\s*coarse/.test(q)?{matches:true,media:q,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}}:mm(q)}
})();"""
def abre(b,plan,tactil=True,ua=None,share=True,w=390,h=844):
    ctx=b.new_context(viewport={'width':w,'height':h},service_workers='block',**({'user_agent':ua} if ua else {}),accept_downloads=True)
    pg=ctx.new_page()
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)))
    pg.on('dialog',lambda d:d.accept(RESP['v']) if d.type=='prompt' and RESP['v'] else d.accept())
    ctx.route('https://wa.me/**',lambda r:r.fulfill(body='wa'))
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    pg.add_init_script(('window.__tactil=true;' if tactil else '')+('' if share else 'window.__sinShare=true;')+SHARE)
    pg.add_init_script('window.__seed='+json.dumps(seed(plan))+';try{localStorage.setItem("mf_tut_done","1");localStorage.setItem("mf_ftut:enviar","1")}catch(e){};')
    pg.goto(URL);pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto12');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)');pg.wait_for_timeout(500)
    if pg.locator('#info:not(.hidden)').count():pg.click('#closeInfo')
    pg.click('[data-mode="fs"]');pg.wait_for_timeout(200)
    pg.click('[data-tab=pizarra]');pg.wait_for_selector('#bcanvas')
    return ctx,pg
def body(pg):return pg.text_content('#infoBody') if pg.locator('#info:not(.hidden)').count() else ''
def usados(pg):return pg.evaluate("(()=>{let k=Object.keys(localStorage).find(k=>k.startsWith('mf_envios:'));return k?(JSON.parse(localStorage.getItem(k)).je||[]).length:0})()")
def jugada(pg,extra=0):
    pg.click('[data-b=add][data-v=ball]');pg.wait_for_timeout(80)
    for i in range(extra):pg.click('[data-b=add][data-v=cone]');pg.wait_for_timeout(60)
def env(pg):
    pg.click('[data-b=env]');pg.wait_for_timeout(250)
with sync_playwright() as p:
    b=p.chromium.launch()
    # ================= Plan gratuito, móvil Android (táctil + compartir) =================
    ctx,pg=abre(b,'gratis')
    check('pizarra: botón «Enviar»',pg.locator('[data-b=env]').count()==1 and 'Enviar' in pg.text_content('[data-b=env]'))
    check('el botón «Guardar» ahora se llama «Mis jugadas»','Mis jugadas' in pg.text_content('[data-b=jg]') and 'Guardar' not in pg.text_content('[data-b=jg]'))
    env(pg)
    check('pizarra vacía: avisa y no abre nada',pg.locator('#info:not(.hidden)').count()==0)
    jugada(pg);env(pg)
    t=body(pg)
    check('se abre «Enviar la jugada»',pg.text_content('#infoTitle')=='Enviar la jugada')
    check('imagen: enviar por WhatsApp y guardar en el móvil',pg.locator('[data-je=wa][data-t=img]').count()==1 and 'Guardar la imagen en el móvil' in t)
    check('vídeo con 1 paso: explica que hace falta otro paso','al menos un paso más' in t and pg.locator('[data-je=prep]').count()==0)
    check('dice cuántas quedan en el plan gratuito','te quedan 3 de 3' in t and 'gratis siempre' in t,t[:300])
    check('explica la ventana de compartir y WhatsApp','toca WhatsApp' in t)
    pg.click('[data-je=wa][data-t=img]');pg.wait_for_timeout(800)
    S=pg.evaluate('window.__shared')
    check('enviar imagen: abre compartir con la imagen PNG',len(S)==1 and S[0]['t']=='image/png' and S[0]['n'].endswith('.png') and S[0]['s']>1000,S)
    check('cuenta 1 envío',usados(pg)==1)
    pg.click('[data-je=wa][data-t=img]');pg.wait_for_timeout(500)
    check('mandar la misma otra vez no gasta',usados(pg)==1 and len(pg.evaluate('window.__shared'))==2)
    with pg.expect_download() as dl:pg.click('[data-je=save][data-t=img]')
    check('guardar en el móvil (Android): descarga la imagen',dl.value.suggested_filename.endswith('.png'))
    check('guardar no gasta envíos',usados(pg)==1)
    # Vídeo: 2 pasos
    pg.click('#closeInfo');pg.click('[data-b=addstep]');pg.wait_for_timeout(100);env(pg)
    check('con 2 pasos: botón «Crear el vídeo de la jugada»',pg.locator('[data-je=prep]').count()==1)
    pg.click('[data-je=prep]');pg.wait_for_timeout(200)
    check('mientras se crea, lo dice',pg.locator('.je-prep').count()==1)
    pg.wait_for_selector('#infoBody .je-ok',timeout=20000)
    check('el vídeo está listo: enviar o guardar',pg.locator('[data-je=wa][data-t=vid]').count()==1 and pg.locator('[data-je=save][data-t=vid]').count()==1)
    pg.click('[data-je=wa][data-t=vid]');pg.wait_for_timeout(500)
    S=pg.evaluate('window.__shared')
    check('enviar vídeo: comparte el vídeo',S[-1]['t'].startswith('video/') and S[-1]['s']>500,S[-1])
    check('2 envíos (la jugada cambió de pasos)',usados(pg)==2,usados(pg))
    pg.click('#closeInfo')
    jugada(pg,1);env(pg);pg.click('[data-je=wa][data-t=img]');pg.wait_for_timeout(500)
    check('3ª jugada distinta: se envía',usados(pg)==3 and '0 de 3' in body(pg))
    pg.click('#closeInfo');jugada(pg,1);env(pg);pg.click('[data-je=wa][data-t=img]');pg.wait_for_timeout(400)
    check('4ª en gratis: ventana Pro y no se envía',pg.text_content('#infoTitle')=='Plan Pro' and '3 jugadas de la pizarra al mes' in body(pg) and 'Guardarlas en el móvil sigue siendo gratis' in body(pg) and len(pg.evaluate('window.__shared'))==4)
    pg.click('#closeInfo');env(pg)
    with pg.expect_download() as dl:pg.click('[data-je=save][data-t=img]')
    check('sin envíos, guardar en el móvil sigue funcionando',dl.value.suggested_filename.endswith('.png'))
    # Mis jugadas: botón de enviar en cada jugada, con su nombre
    pg.click('#closeInfo');RESP['v']='Córner 1'
    pg.click('[data-b=jg]');pg.wait_for_selector('[data-jg=guardar]');pg.click('[data-jg=guardar]');pg.wait_for_timeout(400)
    check('«Mis jugadas»: cada jugada tiene su botón de enviar',pg.locator('[data-jg=enviar]').count()==1)
    pg.click('#closeInfo');pg.click('[data-b=clear]');pg.wait_for_timeout(200)
    pg.click('[data-b=jg]');pg.wait_for_selector('[data-jg=enviar]');pg.click('[data-jg=enviar]');pg.wait_for_timeout(400)
    check('enviar desde «Mis jugadas»: la carga y abre «Enviar la jugada» con su nombre',pg.text_content('#infoTitle')=='Enviar la jugada' and 'Córner 1' in body(pg))
    with pg.expect_download() as dl:pg.click('[data-je=save][data-t=img]')
    check('el archivo lleva el nombre de la jugada',dl.value.suggested_filename.startswith('jugada-corner-1'),dl.value.suggested_filename)
    pg.screenshot(path=OUT+'/enviar_jugada_movil.png')
    ctx.close()
    # ================= iPhone: guardar va a Fotos (hoja de compartir) =================
    IPH='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    ctx,pg=abre(b,'gratis',ua=IPH);jugada(pg);env(pg)
    check('iPhone: «Guardar la imagen en Fotos»','Guardar la imagen en Fotos' in body(pg) and 'Guardar imagen' in body(pg))
    pg.click('[data-je=save][data-t=img]');pg.wait_for_timeout(600)
    check('iPhone: guardar abre compartir (Guardar imagen → Fotos) y no gasta',len(pg.evaluate('window.__shared'))==1 and usados(pg)==0)
    ctx.close()
    # ================= Ordenador: descarga + abre WhatsApp =================
    ctx,pg=abre(b,'gratis',tactil=False,share=False,w=1280,h=800);jugada(pg);env(pg)
    check('ordenador: explica que se adjunta con el clip','clip' in body(pg))
    with pg.expect_popup() as pop:
        with pg.expect_download() as dl:pg.click('[data-je=wa][data-t=img]')
    check('ordenador: descarga la imagen y abre WhatsApp',dl.value.suggested_filename.endswith('.png') and 'wa.me' in pop.value.url,pop.value.url)
    pg.wait_for_timeout(200);pg.screenshot(path=OUT+'/enviar_jugada_pc.png')
    ctx.close()
    # ================= Pro: ilimitado =================
    ctx,pg=abre(b,'pro')
    for i in range(5):
        jugada(pg,1);env(pg)
        if i==0:check('Pro: sin aviso de límite','Plan gratuito' not in body(pg))
        pg.click('[data-je=wa][data-t=img]');pg.wait_for_timeout(400);pg.click('#closeInfo')
    check('Pro: 5 jugadas enviadas sin ventana Pro',len(pg.evaluate('window.__shared'))==5)
    ctx.close()
    # ================= Móvil girado: caben los botones de abajo =================
    ctx,pg=abre(b,'gratis',w=844,h=390)
    pg.wait_for_timeout(300)
    vis=lambda s:pg.evaluate("s=>{let e=document.querySelector(s);if(!e)return false;let r=e.getBoundingClientRect();return r.width>0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1&&r.left>=-1}",s)
    check('horizontal: «Enviar» y «Mis jugadas» se ven enteros',vis('[data-b=env]') and vis('[data-b=jg]'))
    pg.screenshot(path=OUT+'/enviar_jugada_horizontal.png')
    ctx.close()
    # Guía y tutorial
    ctx,pg=abre(b,'gratis');pg.click('[data-tab=partidos]');pg.wait_for_timeout(200)
    pg.click('#acct');pg.click('#info [data-info=ayuda]');pg.wait_for_selector('#info .ayuda')
    pg.evaluate("document.querySelectorAll('#info .ayuda details').forEach(d=>d.open=true)")
    t=pg.inner_text('#info .ayuda')
    check('Guía de uso: explica «Enviar» y «Mis jugadas»',all(w in t for w in ('Enviar (abajo','por WhatsApp','guárdala en el móvil','toca el botón «Mis jugadas»','3 jugadas de la pizarra al mes')))
    ctx.close()
    b.close()
print('PASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
