import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import http.server,threading,functools,json,io,zipfile,base64
from playwright.sync_api import sync_playwright
# v11.64 Porteros (paradas, goles encajados, % de paradas) y «¿En qué minutos marcamos?» en Estadísticas,
# minutos de los goles al editar el partido y hojas «Porteros» y «Goles por minutos» del Excel.
FAKE=r"""
window.__db=window.__seed||{};
const CP=(x)=>JSON.parse(JSON.stringify(x));
window.supabase={createClient:()=>{let cb=null,session=null;
 const q=(t)=>{let f=null,op='select',payload=null,sel=false;
  const o={select(){sel=true;return o},order(){return o},eq(c,v){f=[c,v];return o},in(){return o},gte(){return o},insert(p){op='insert';payload=p;return o},update(p){op='update';payload=p;return o},upsert(p){op='insert';payload=p;return o},delete(){op='delete';return o},single(){return o},maybeSingle(){return o},limit(){return o},
  then(res){let out,rows=window.__db[t]=window.__db[t]||[];
    if(op==='select')out={data:rows.filter(r=>!f||r[f[0]]===f[1]).map(CP),error:null};
    else if(op==='insert'){let r=CP(payload);rows.push(r);out={data:sel?[CP(r)]:null,error:null}}
    else if(op==='update'){let r=rows.find(r=>r[f[0]]===f[1]);Object.assign(r||{},CP(payload));out={data:sel?[CP(r)]:null,error:null}}
    else{window.__db[t]=rows.filter(r=>r[f[0]]!==f[1]);out={error:null}}
   return Promise.resolve(out).then(res)}};return o};
 return{from:q,rpc:async()=>({data:null,error:null}),
  auth:{getSession:async()=>({data:{session}}),
   onAuthStateChange(c){cb=c;setTimeout(()=>c('INITIAL_SESSION',null),0);return{data:{subscription:{}}}},
   signInWithPassword:async()=>{session={user:{id:'u1',email:'ana@x.es'}};cb('SIGNED_IN',session);return{data:{session},error:null}},
   getUser:async()=>({data:{user:session&&session.user}}),signOut:async()=>{session=null;cb('SIGNED_OUT',null)}}}}};
"""
P=[{'id':f'p{i}','owner_id':'u1','modalidad':'11','nombre':f'J{i}','dorsal':str(i+1),'foto':'','created_at':''} for i in range(13)]
def part(par):
    return json.dumps([{'id':f'p{i}','nombre':f'J{i}','minutes':90 if i<11 else 0,'goals':0,'starter':i<11,**({'st':{'par':par[i]}} if i in par else {})} for i in range(13)])
# Partido 1: portero p0 todo el partido, 3-1, goles 10', 50', 80' y en contra 30'. p0 3 paradas.
# Partido 2: p0 hasta el 45' y entra p12 de portero; 1-2, nuestro 88', en contra 20' (p0) y 70' (p12). p0 2 paradas, p12 4.
# Partido 3: 0-0, portero p12 todo el partido → portería a cero.
M=[
 {'id':'m1','fecha':'2026-10-04','rival':'Uno','al':{'portero':'p0','resultado':{'gf':3,'gc':1},'gmin':{'f':[10,50,80],'c':[30]},'parte':45},'par':{0:3}},
 {'id':'m2','fecha':'2026-10-11','rival':'Dos','al':{'portero':'p0','resultado':{'gf':1,'gc':2},'gmin':{'f':[88],'c':[20,70]},'parte':45,'cambios':[{'id':'c1','m':45,'sale':'p0','entra':'p12'}]},'par':{0:2,12:4}},
 {'id':'m3','fecha':'2026-10-18','rival':'Tres','al':{'portero':'p12','resultado':{'gf':0,'gc':0},'parte':45},'par':{}},
]
def seed(plan='pro',extra=0):
    ms=[{'id':m['id'],'owner_id':'u1','modalidad':'11','fecha':m['fecha'],'rival':m['rival'],'participaciones':part(m['par']),'alineacion':json.dumps(m['al']),'created_at':''} for m in M]
    for k in range(extra):
        ms.append({'id':f'x{k}','owner_id':'u1','modalidad':'11','fecha':f'2026-11-{10+k:02d}','rival':f'R{k}','participaciones':part({}),'alineacion':json.dumps({'portero':'p0','resultado':{'gf':1,'gc':0},'gmin':{'f':[5]},'parte':45}),'created_at':''})
    return {'futbol_personal_jugadores':P,'futbol_personal_partidos':ms,'perfiles':[{'id':'u1','plan':plan}]}
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8871),functools.partial(H,directory=APP));threading.Thread(target=srv.serve_forever,daemon=True).start()
URL='http://127.0.0.1:8871/index.html'
res=[];errs=[]
def check(n,c,x=''):res.append(bool(c));print(('OK   ' if c else 'FALLA'),n,x)
def page(b,sd):
    pg=b.new_context(viewport={'width':390,'height':844},service_workers='block',accept_downloads=True).new_page()
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)))
    pg.on('dialog',lambda d:d.accept())
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    pg.add_init_script('window.__seed='+json.dumps(sd)+';try{if(!sessionStorage.getItem("s")){sessionStorage.setItem("s",1);localStorage.setItem("mf_novedades_visto","99.0");localStorage.setItem("mf_version_abierta","99.0");localStorage.setItem("mf_tut","1");["campo","liga","porteros","prevencion","jugadas"].forEach(k=>localStorage.setItem("mf_ftut:"+k,"1"))}}catch(e){}')
    return pg
def login(pg):
    pg.goto(URL);pg.fill('input[name=email]','ana@x.es');pg.fill('input[name=password]','secreto12');pg.click('[data-auth=login]');pg.wait_for_selector('#app:not(.hidden)');pg.wait_for_timeout(300)
    pg.evaluate("document.querySelectorAll('#info:not(.hidden) [data-close], #info:not(.hidden) .close').forEach(b=>b.click())")
    pg.click('[data-mode="11"]');pg.wait_for_timeout(150);pg.click('[data-tab=resumen]');pg.wait_for_timeout(250)
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=page(b,seed());login(pg)
    t=pg.inner_text('.gk-p')
    check('panel porteros sale',"paradas y goles encajados" in t.lower())
    rows=pg.eval_on_selector_all('.gk-row',"r=>r.map(x=>x.innerText.replace(/\\s+/g,' '))")
    print(rows)
    r0=[r for r in rows if 'J0' in r][0];r12=[r for r in rows if 'J12' in r][0]
    check('p0: 2 partidos, 135 min',"2 partidos · 135'" in r0,r0)
    check('p0: 5 paradas y 2 goles encajados','5 paradas' in r0 and '2 goles encajados' in r0)
    check('p0: % de paradas 71%','71% de paradas' in r0)
    check('p0: encajados por partido 1','1 encajados por partido' in r0)
    check('p12: 2 partidos, 1 a cero, 4 paradas, 1 encajado','2 partidos' in r12 and '1 portería a cero' in r12 and '4 paradas' in r12 and '1 gol encajado' in r12 and '80% de paradas' in r12,r12)
    tt=pg.inner_text('.tr-p')
    check('tramos: donde más marcáis','Donde más marcáis' in tt and '76-90' in tt,tt[:200])
    cells=pg.eval_on_selector_all('.tr-r:not(.tr-h)',"r=>r.map(x=>x.innerText.replace(/\\s+/g,' '))")
    print(cells)
    check('6 tramos F11 de 15 min',len(cells)==6 and cells[0].startswith("0-15'") and cells[5].startswith("76-90'"))
    check('tramo 1: 1 gol a favor (25 %)','1 · 25 %' in cells[0])
    check('tramo 76-90: 2 goles (50 %)','2 · 50 %' in cells[5])
    check('en contra 16-30: 2 (67 %)','2 · 67 %' in cells[1])
    # Excel
    with pg.expect_download() as d:
        pg.click('[data-xl=go]')
    z=zipfile.ZipFile(d.value.path())
    wb=z.read('xl/workbook.xml').decode()
    check('Excel: hoja Porteros','name="Porteros"' in wb and 'name="Goles por minutos"' in wb)
    names=[n for n in z.namelist() if n.startswith('xl/worksheets/sheet')]
    allx=''.join(z.read(n).decode() for n in names)
    check('Excel: fórmula % de paradas','E2/(E2+F2)' in allx)
    check('Excel: fórmula % a favor','C2/SUM(C$2:C$7)' in allx)
    # Editar partido: minutos de los goles
    pg.click('[data-tab=partidos]');pg.wait_for_timeout(200)
    pg.click('[data-action=edit-match][data-id=m3]');pg.wait_for_timeout(300)
    i=pg.locator('[data-mdg=f]');i.scroll_into_view_if_needed()
    check('editor: campos de minutos',i.count()==1 and pg.locator('[data-mdg=c]').count()==1)
    i.fill('70,  12 y 200, 35');i.dispatch_event('change');pg.wait_for_timeout(100)
    check('editor: minutos ordenados y limpios',i.input_value()=='12, 35, 70',i.input_value())
    al=pg.evaluate("(()=>{let s=document.querySelector('[data-mdg=f]');return true})()")
    pg.screenshot(path=os.path.join(OUT,'porteros-editor.png'))
    pg.close()
    # Plan gratuito: solo los últimos 5 partidos
    pg=page(b,seed('gratis',4));login(pg)
    t=pg.inner_text('.gk-p')
    check('gratis: aviso últimos 5','últimos 5 partidos' in t)
    rows=pg.eval_on_selector_all('.gk-row',"r=>r.map(x=>x.innerText.replace(/\\s+/g,' '))")
    r0=[r for r in rows if 'J0' in r]
    check('gratis: p0 cuenta solo 4 + 0 (m3 es de p12)',r0 and r0[0].startswith('1 · J0 4 partidos'),r0)
    pg.close()
    b.close()
srv.shutdown()
print('PASS' if all(res) else 'FALLA',sum(res),'/',len(res),errs)
sys.exit(0 if all(res) and not errs else 1)
