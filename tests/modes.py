import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json,sys
pass
from playwright.sync_api import sync_playwright
from fake2 import FAKE2
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8797),functools.partial(http.server.SimpleHTTPRequestHandler,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
def seed(plan,n7=14,n11=25,nfs=16,m7=5):
    P=[]
    for m,n in (('7',n7),('11',n11),('fs',nfs)):
        for i in range(n):P.append({'id':f'{m}-{i}','owner_id':'u1','modalidad':m,'nombre':f'J{m}{i}','foto':'','created_at':''})
    M=[{'id':f'm{i}','owner_id':'u1','modalidad':'7','fecha':'2026-09-%02d'%(i%28+1),'rival':f'R{i}','participaciones':'[]','alineacion':'{}','created_at':''} for i in range(m7)]
    return json.dumps({'futbol_personal_jugadores':P,'futbol_personal_partidos':M,'perfiles':[{'id':'u1','plan':plan}]})
def page(b,plan,**kw):
    ctx=b.new_context(viewport={'width':390,'height':844});pg=ctx.new_page()
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)))
    pg.on('console',lambda m:errs.append(m.text) if m.type=='error' and 'ERR_TUNNEL' not in m.text else None)
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE2))
    pg.add_init_script("window.__seed="+seed(plan,**kw)+";")
    pg.goto('http://127.0.0.1:8797/index.html');pg.fill('input[name=email]','a@x.es');pg.fill('input[name=password]','secreto12');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)');pg.wait_for_timeout(200);return pg
vis=lambda pg,s:pg.locator(s).is_visible()
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=page(b,'gratis')
    check('3 modalidades en el selector',pg.locator('.switch button').count()==3 and pg.locator('[data-mode="fs"]').text_content()=='Fútbol sala')
    pg.screenshot(path=OUT+'/m_switch.png')
    for mode,name,mx in (('7','Fútbol 7',14),('11','Fútbol 11',25),('fs','Fútbol sala',16)):
        pg.click(f'[data-mode="{mode}"]');pg.wait_for_timeout(100)
        check(f'{name}: título y contador {mx}/{mx}',name.lower() in pg.locator('#view h2').first.inner_text().lower() and f'{mx} / {mx}' in pg.locator('#view .muted').first.inner_text(),pg.locator('#view .muted').first.inner_text())
        pg.click('[data-action=add-player]');pg.wait_for_timeout(120)
        check(f'{name}: al llegar al límite sale el plan Pro (sin abrir formulario)',vis(pg,'#info') and pg.locator('#infoTitle').inner_text().lower()=='plan pro' and not vis(pg,'#modal'))
        txt=pg.locator('#infoBody').inner_text()
        check(f'{name}: el aviso cita límites y precio',f'{mx} jugadores' in txt and '5 partidos' in txt and '39,99' in txt,txt[:90])
        pg.click('#closeInfo')
    pg.click('[data-mode="7"]');pg.click('[data-tab=partidos]');pg.wait_for_timeout(100)
    check('F7 partidos: contador 5/5',('5 / 5 partidos' in pg.locator('#view .muted').first.inner_text()),pg.locator('#view .muted').first.inner_text())
    pg.click('[data-action=add-match]');pg.wait_for_timeout(100);check('F7: 21º partido bloqueado → Pro',vis(pg,'#info') and 'plan pro' in pg.locator('#infoTitle').inner_text().lower())
    pg.screenshot(path=OUT+'/m_pro.png');pg.click('#closeInfo')
    pg.click('[data-mode="fs"]');pg.click('[data-tab=partidos]');pg.wait_for_timeout(100);pg.click('[data-action=add-match]');pg.wait_for_timeout(100)
    check('Fútbol sala: se puede crear partido (0/20) con 5 titulares',vis(pg,'#view .field') or pg.locator('#view .field').count()>0)
    opts=pg.locator('#formation option').all_inner_texts();check('Fútbol sala: formaciones 2-2, 1-2-1, 3-1, 1-1-2',opts==['2-2','1-2-1','3-1','1-1-2'],opts)
    check('Fútbol sala: 5 posiciones en el campo',pg.locator('#view button[data-slot]').count()==5,pg.locator('#view button[data-slot]').count())
    pg.screenshot(path=OUT+'/m_fs_editor.png',full_page=False)
    pg.click('[data-action=cancel]')
    # cuenta
    pg.click('#acct');pg.wait_for_timeout(100);t=pg.locator('#infoBody').inner_text()
    check('cuenta: uso por modalidad y botón Pro',('fútbol sala' in t.lower() and '16' in t and 'pasar a pro' in t.lower()),t[:160]);pg.screenshot(path=OUT+'/m_cuenta.png')
    pg.click('#info [data-info=pro]');pg.wait_for_timeout(100);check('botón Pro abre el plan',pg.locator('#infoTitle').inner_text().lower()=='plan pro')
    pg.click('#closeInfo')
    # error del servidor LIMITE_PLAN (por si el cliente va desfasado)
    pg2=page(b,'gratis',n7=3,n11=0,nfs=0,m7=0);pg2.evaluate("window.__cfg.limit=true")
    pg2.click('[data-action=add-player]');pg2.fill('#playerForm input[name=nombre]','Nuevo');pg2.click('#playerForm .primary');pg2.wait_for_timeout(250)
    check('servidor devuelve LIMITE_PLAN → sale el plan Pro',vis(pg2,'#info') and 'plan pro' in pg2.locator('#infoTitle').inner_text().lower() and not vis(pg2,'#modal'))
    # pro
    pg3=page(b,'pro')
    check('Pro: sin contadores de límite',' / ' not in pg3.locator('#view .muted').first.inner_text(),pg3.locator('#view .muted').first.inner_text())
    pg3.click('[data-action=add-player]');pg3.wait_for_timeout(100);check('Pro: se abre el formulario aunque haya 14',vis(pg3,'#modal') and not vis(pg3,'#info'))
    pg3.click('#closeModal');pg3.click('#acct');check('Pro: cuenta dice sin límites',('sin límites' in pg3.locator('#infoBody').inner_text()) and 'pasar a pro' not in pg3.locator('#infoBody').inner_text().lower())
    # términos con precio
    pg3.click('#info [data-info=terms]');tt=pg3.locator('#infoBody').inner_text();check('términos: plan Pro y límites',('39,99' in tt and 'Fútbol sala' in tt and '5 partidos' in tt))
    b.close()
print('\nPASS' if all(res) and not errs else 'FAIL',sum(res),'/',len(res),errs)
