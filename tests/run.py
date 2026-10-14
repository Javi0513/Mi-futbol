import json, http.server, threading, functools
from playwright.sync_api import sync_playwright

FAKE = r"""
window.__db={futbol_personal_jugadores:[],futbol_personal_partidos:[
 {id:'old1',owner_id:'u1',modalidad:'7',fecha:'2026-09-01',rival:'Antiguo',participaciones:'[]',alineacion:'{}',created_at:''}]};
window.__log=[];
window.supabase={createClient:()=>{
 let cb=null,session=null;
 const q=(t)=>{let rows=window.__db[t],f=null,op='select',payload=null;
  const o={select(){return o},order(){return o},eq(c,v){f=[c,v];return o},
   insert(p){op='insert';payload=p;return o},update(p){op='update';payload=p;return o},delete(){op='delete';return o},
   then(res){let out;
     if(op==='select')out={data:rows.map(r=>({...r})),error:null};
     else if(op==='insert'){window.__log.push(['insert',t,JSON.parse(JSON.stringify(payload))]);if(typeof payload.participaciones==='object'&&payload.participaciones!==null&&t.includes('partidos'))out={error:{message:'participaciones debe ser texto'}};else{rows.push({created_at:'',...payload});out={error:null}}}
     else if(op==='update'){window.__log.push(['update',t,JSON.parse(JSON.stringify(payload))]);let r=rows.find(r=>r[f[0]]===f[1]);Object.assign(r,payload);out={error:null}}
     else{window.__db[t]=rows.filter(r=>r[f[0]]!==f[1]);out={error:null}}
     return Promise.resolve(out).then(res)}};
  return o};
 return{from:q,auth:{
  getSession:async()=>({data:{session}}),
  onAuthStateChange(c){cb=c;setTimeout(()=>c('INITIAL_SESSION',null),0);return{data:{subscription:{}}}},
  signInWithPassword:async()=>{session={user:{id:'u1'}};cb('SIGNED_IN',session);return{data:{session},error:null}},
  getUser:async()=>({data:{user:{id:'u1'}}}),signOut:async()=>{session=null;cb('SIGNED_OUT',null)}}}}};
"""
root='/tmp/claude-0/build'
h=functools.partial(http.server.SimpleHTTPRequestHandler,directory=root)
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8765),h)
threading.Thread(target=srv.serve_forever,daemon=True).start()
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/opt/pw-browsers/chromium' if False else None)
    pg=b.new_page(viewport={'width':390,'height':844})
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.on('console',lambda m:errs.append(m.text) if m.type=='error' and 'favicon' not in m.text else None)
    pg.route('**/supabase.js',lambda r:r.fulfill(content_type='application/javascript',body=FAKE))
    pg.goto('http://127.0.0.1:8765/index.html')
    assert pg.locator('[data-auth="signup"]').count()==0
    pg.fill('input[name=email]','c@x.es');pg.fill('input[name=password]','secreto1');pg.click('[data-auth=login]')
    pg.wait_for_selector('#app:not(.hidden)')
    # add 7 players
    for i in range(8):
        pg.click('[data-action=add-player]');pg.fill('#playerForm input[name=nombre]',f'Jug{i+1}');pg.click('#playerForm button.primary');pg.wait_for_selector('#modal.hidden',state='attached')
        pg.wait_for_function(f"document.querySelectorAll('#view .row').length=={i+1}")
    # old match opens without crash
    pg.click('[data-tab=partidos]');pg.click('[data-action=edit-match]');pg.wait_for_selector('#formation')
    pg.click('[data-action=cancel]')
    # new match
    pg.click('[data-action=add-match]');pg.fill('#rival','Los Pinos')
    for i in range(8):
        pg.locator('[data-field=called]').nth(i).check()
    for i in range(7):
        pg.locator('[data-field=starter]').nth(i).check()
    pg.select_option('#formation','3-3')
    pg.click('[data-slot="0"]');pg.click('.slotmenu [data-pick]:has-text("Jug1")')
    pg.click('[data-slot="1"]');pg.click('.slotmenu [data-pick]:has-text("Jug2")')
    # duplicate pick moves the player
    pg.click('[data-slot="2"]');pg.click('.slotmenu [data-pick]:has-text("Jug2")')
    spans=pg.locator('.slot span').all_inner_texts()
    print('slots tras duplicar:',spans)
    # clear slot
    pg.click('[data-slot="0"]');pg.click('[data-clear]')
    pg.screenshot(path=OUT+'/editor.png',full_page=True)
    pg.click('[data-slot="0"]');pg.click('.slotmenu [data-pick]:has-text("Jug1")')
    pg.locator('[data-field=minutes]').nth(0).fill('60');pg.locator('[data-field=goals]').nth(0).fill('2')
    pg.click('[data-action=save]')
    pg.wait_for_selector('.message.ok')
    ins=[l for l in pg.evaluate('window.__log') if l[0]=='insert' and 'partidos' in l[1]][0][2]
    print('insert partido:',{k:(v if k in('modalidad','fecha','rival','owner_id') else str(v)[:70]) for k,v in ins.items()})
    assert isinstance(ins['participaciones'],str) and isinstance(ins['alineacion'],str) and 'id' in ins and ins['owner_id']=='u1'
    # reopen and check persistence
    pg.locator('.row:has-text("Los Pinos") [data-action=edit-match]').click()
    pg.wait_for_selector('#formation')
    print('formación reabierta:',pg.input_value('#formation'),pg.locator('.slot span').all_inner_texts())
    print('goles Jug1:',pg.locator('[data-field=goals]').nth(0).input_value())
    pg.click('[data-action=cancel]')
    pg.click('[data-tab=resumen]')
    print('resumen:',pg.locator('#view .row .info small').first.inner_text())
    pg.screenshot(path=OUT+'/resumen.png')
    b.close()
print('errores consola:',errs)
