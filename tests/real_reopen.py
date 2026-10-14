import sys,os;sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from paths import *
import json, http.server, threading, functools, base64, time
from playwright.sync_api import sync_playwright
UMD=open(APP+'/supabase.js',encoding='utf-8').read()
def jwt():
    b=lambda d:base64.urlsafe_b64encode(json.dumps(d).encode()).rstrip(b'=').decode()
    return b({'alg':'HS256'})+'.'+b({'sub':'u1','role':'authenticated','exp':int(time.time())+3600})+'.sig'
PL=[{'id':'p1','owner_id':'u1','modalidad':'7','nombre':'Antiguo Uno','foto':'','created_at':'2026-09-01T10:00:00Z'},
    {'id':'p2','owner_id':'u1','modalidad':'11','nombre':'Antiguo Once','foto':'','created_at':'2026-09-01T10:00:00Z'}]
MA=[{'id':'m1','owner_id':'u1','modalidad':'7','fecha':'2026-09-20','rival':'Rival Viejo','participaciones':json.dumps([{'id':'p1','nombre':'Antiguo Uno','minutes':50,'goals':1,'starter':True}]),'alineacion':'{}','created_at':'2026-09-20T10:00:00Z'}]
reqs=[]
def handler(route):
    r=route.request;u=r.url;reqs.append((r.method,u.split('supabase.co')[1][:90]))
    h={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}
    if r.method=='OPTIONS':return route.fulfill(status=204,headers=h)
    if '/auth/v1/token' in u:
        t=jwt();return route.fulfill(headers=h,content_type='application/json',body=json.dumps({'access_token':t,'token_type':'bearer','expires_in':3600,'expires_at':int(time.time())+3600,'refresh_token':'r','user':{'id':'u1','aud':'authenticated','email':'c@x.es','app_metadata':{},'user_metadata':{},'created_at':'2026-01-01T00:00:00Z'}}))
    if '/auth/v1/user' in u:
        return route.fulfill(headers=h,content_type='application/json',body=json.dumps({'id':'u1','aud':'authenticated','email':'c@x.es','app_metadata':{},'user_metadata':{},'created_at':'2026-01-01T00:00:00Z'}))
    if '/rest/v1/futbol_personal_jugadores' in u and r.method=='GET':return route.fulfill(headers=h,content_type='application/json',body=json.dumps(PL))
    if '/rest/v1/futbol_personal_partidos' in u and r.method=='GET':return route.fulfill(headers=h,content_type='application/json',body=json.dumps(MA))
    return route.fulfill(headers=h,content_type='application/json',body='[]')

import sys
ROOT=sys.argv[1]; OLD=len(sys.argv)>2
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8803),functools.partial(http.server.SimpleHTTPRequestHandler,directory=ROOT))
threading.Thread(target=srv.serve_forever,daemon=True).start()
sess={'access_token':jwt(),'token_type':'bearer','expires_in':3600,'expires_at':int(time.time())-100,'refresh_token':'r','user':{'id':'u1','aud':'authenticated','email':'c@x.es','app_metadata':{},'user_metadata':{},'created_at':'2026-01-01T00:00:00Z'}}
with sync_playwright() as p:
    b=p.chromium.launch();ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block');pg=ctx.new_page()
    pg.add_init_script("if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.setItem('sb-zsbygyahqtgxfvofplbl-auth-token',%s)}"%json.dumps(json.dumps(sess)))
    if OLD: pg.route('https://cdn.jsdelivr.net/**',lambda r:r.fulfill(content_type='application/javascript',body=UMD))
    else: pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=UMD))
    pg.route('**/fonts.g*/**',lambda r:r.abort())
    pg.route('https://zsbygyahqtgxfvofplbl.supabase.co/**',handler)
    pg.goto('http://127.0.0.1:8803/index.html');pg.wait_for_timeout(3500)
    names=pg.locator('#view .row strong').all_inner_texts()
    print('reabrir con sesión caducada -> jugadores visibles:',names)
    if names:
        pg.click('#logout');pg.wait_for_timeout(3500)
        print('tras cerrar sesión, login visible:',pg.locator('#login:not(.hidden)').count()==1, '| token borrado:',pg.evaluate("localStorage.getItem('sb-zsbygyahqtgxfvofplbl-auth-token')")is None)
    b.close()
