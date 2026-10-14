import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import sys;pass;import fonts
import http.server, threading, functools, json, re
from playwright.sync_api import sync_playwright
from PIL import Image
FAKE=open(TESTS+'/run.py').read().split('FAKE = r"""')[1].split('"""')[0]
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8771),functools.partial(http.server.SimpleHTTPRequestHandler,directory=APP))
threading.Thread(target=srv.serve_forever,daemon=True).start()
errs=[];res=[]
def check(n,c,x=''):
    res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
def center(b):return b['x']+b['width']/2,b['y']+b['height']/2
def bb(pg,sel,n=0):return pg.locator(sel).nth(n).bounding_box()
def lab(pg):return pg.locator('.slot span').all_inner_texts()
def top(pg):pg.evaluate("document.querySelector('.tools').scrollIntoView({block:'start'})");pg.wait_for_timeout(80)
def drag(pg,src,dst):
    sx,sy=center(src);pg.mouse.move(sx,sy);pg.mouse.down();pg.mouse.move(sx+12,sy+12,steps=3);pg.mouse.move(dst[0],dst[1],steps=10);pg.mouse.up();pg.wait_for_timeout(120)
N7=['Adri leon','Antonio Miguel','Camacho','Capi','Chamako','Chinchilla','Chuches','David','Edu wadro']
N11=['Adri leon','Antonio Miguel','Camacho','Capi','Chamako','Chinchilla','Chuches','David','Edu wadro','German','Hugo','Jairo','Javier Casado']
SEED="""([n7,n11])=>{
 const c=document.createElement('canvas');c.width=c.height=120;const x=c.getContext('2d');x.fillStyle='#e07a2f';x.fillRect(0,0,120,120);x.fillStyle='#fff';x.fillRect(30,30,60,60);const foto=c.toDataURL('image/jpeg',.8);
 const db=window.__db;db.futbol_personal_partidos.length=0;
 n7.forEach((n,i)=>db.futbol_personal_jugadores.push({id:'a'+i,owner_id:'u1',modalidad:'7',nombre:n,foto:i==0?foto:'',created_at:''}));
 n11.forEach((n,i)=>db.futbol_personal_jugadores.push({id:'b'+i,owner_id:'u1',modalidad:'11',nombre:n,foto:'',created_at:''}));
 const part=(k)=>JSON.stringify(Array.from({length:9},(_,i)=>({id:'a'+i,nombre:n7[i],minutes:40,goals:i==0?1:0,starter:i<7})));
 const sl={};for(let i=0;i<7;i++)sl[i]='a'+i;
 const mk=(id,f,r,res,pos)=>({id,owner_id:'u1',modalidad:'7',fecha:f,rival:r,participaciones:pos?part():'[]',alineacion:JSON.stringify(pos?{formation:'2-3-1',slots:sl,...(res?{resultado:res}:{})}:{}),created_at:''});
 db.futbol_personal_partidos.push(mk('m1','2026-09-20','Rival A',{gf:3,gc:1},true),mk('m2','2026-09-27','Rival B',{gf:1,gc:1},true),mk('m3','2026-10-04','Rival C',{gf:0,gc:2},true),mk('m4','2026-08-30','Amistoso viejo',null,false));
}"""
with sync_playwright() as p:
    b=p.chromium.launch();ctx=b.new_context(viewport={'width':1100,'height':900},accept_downloads=True);pg=ctx.new_page()
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    pg.goto('http://127.0.0.1:8771/index.html');pg.evaluate(SEED,[N7,N11])
    pg.fill('input[name=email]','c@x.es');pg.fill('input[name=password]','secreto1');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)')
    pg.click('[data-tab=partidos]');rows=pg.locator('#view .row .info').all_inner_texts()
    txt=' | '.join(r.replace('\n',' ') for r in rows);print(txt)
    check('chips de resultado en la lista','Victoria 3-1' in txt and 'Empate 1-1' in txt and 'Derrota 0-2' in txt)
    check('partido viejo sin chip y sin romper','Amistoso viejo' in txt)
    pg.click('[data-tab=resumen]');team=pg.locator('.tstats .stat').all_inner_texts();team=[t.replace('\n',': ') for t in team];print(team)
    check('estadísticas de equipo',team==['Victorias: 1','Empates: 1','Derrotas: 1','Goles a favor: 4','Goles en contra: 4','Diferencia: 0'],team)
    body=pg.locator('#view').inner_text()
    check('3 de 4 con resultado + lista',('3 de 4 partidos con resultado' in body) and ('Victoria 3-1' in body) and ('Sin resultado' in body))
    # exportar partido guardado m1
    pg.click('[data-tab=partidos]')
    with pg.expect_download() as d:pg.locator('[data-img="m1"]').click()
    dl=d.value;path=OUT+'/exp_guardado.png';dl.save_as(path);im=Image.open(path);print('descarga:',dl.suggested_filename,im.size)
    check('imagen guardada 1080x1520 PNG',im.size==(1080,1520) and dl.suggested_filename.endswith('.png'),dl.suggested_filename)
    # partido viejo sin posiciones
    pg.locator('[data-img="m4"]').click();pg.wait_for_timeout(300)
    check('partido sin posiciones avisa',('no tiene posiciones' in pg.locator('#message').inner_text()))
    # nuevo partido con resultado, valores sobreviven a drags
    pg.click('[data-action=add-match]');pg.fill('#rival','Los Pinos');pg.fill('#gf','5')
    top(pg)
    for i in range(7):top(pg);drag(pg,bb(pg,'.pchip',i),center(bb(pg,'.slot button',i)))
    check('el resultado escrito sobrevive a los arrastres',pg.input_value('#gf')=='5',pg.input_value('#gf'))
    pg.fill('#gf','2');pg.fill('#gc','0')
    pg.select_option('#formation','3-2-1')
    with pg.expect_download() as d:pg.locator('[data-img=draft]').click()
    d.value.save_as(OUT+'/exp_borrador.png');print('borrador:',Image.open(OUT+'/exp_borrador.png').size)
    pg.click('[data-action=save]');pg.wait_for_selector('.message.ok')
    ins=[x for x in pg.evaluate('window.__log') if x[0]=='insert' and 'partidos' in x[1]][-1][2];al=json.loads(ins['alineacion'])
    check('guarda resultado 2-0 en la alineación',al.get('resultado')=={'gf':2,'gc':0} and len(al['slots'])==7,al.get('resultado'))
    pg.click('[data-tab=partidos]');check('lista muestra Victoria 2-0','Victoria 2-0' in pg.locator('#view').inner_text())
    pg.locator('.row:has-text("Los Pinos") [data-action=edit-match]').click();pg.wait_for_selector('#gf')
    check('al reabrir salen los goles',pg.input_value('#gf')=='2' and pg.input_value('#gc')=='0')
    pg.fill('#gf','');pg.fill('#gc','');pg.click('[data-action=save]');pg.wait_for_selector('.message.ok');pg.click('[data-tab=partidos]')
    check('vaciar goles quita el resultado','Victoria 2-0' not in pg.locator('#view').inner_text())
    # F11
    pg.click('[data-mode="11"]');pg.click('[data-tab=partidos]');pg.click('[data-action=add-match]');pg.fill('#rival','Atlético Granada Norte');pg.fill('#gf','1');pg.fill('#gc','2')
    pg.select_option('#formation','5-4-1')
    for i in range(11):top(pg);drag(pg,bb(pg,'.pchip',i),center(bb(pg,'.slot button',i)))
    top(pg);pg.locator('[data-field=called]').nth(11).check();pg.locator('[data-field=called]').nth(12).check()
    top(pg)
    with pg.expect_download() as d:pg.locator('[data-img=draft]').click()
    d.value.save_as(OUT+'/exp_f11.png');print('F11:',Image.open(OUT+'/exp_f11.png').size)
    pg.click('[data-action=save]');pg.wait_for_selector('.message.ok')
    pg.click('[data-tab=resumen]');team=[t.replace('\n',': ') for t in pg.locator('.tstats .stat').all_inner_texts()];print('F11 equipo:',team)
    check('F11 estadísticas Derrota 1-2',team[2]=='Derrotas: 1' and team[3]=='Goles a favor: 1' and team[4]=='Goles en contra: 2',team)
    pg.screenshot(path=OUT+'/stats_f11.png',full_page=True)
    pg.click('[data-mode="7"]');pg.click('[data-tab=resumen]');pg.screenshot(path=OUT+'/stats_f7.png',full_page=True)
    b.close()
print('errores consola:',errs);print('RESUMEN:',sum(res),'/',len(res))
