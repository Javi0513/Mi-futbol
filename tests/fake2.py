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
 return{from:q,rpc:async(n)=>{window.__calls.push(['rpc',n]);let d=(window.__cfg.rpcData||{})[n];if(typeof d==='function')d=d();return{error:null,data:d}},auth:{
  getSession:async()=>({data:{session}}),
  onAuthStateChange(c){cb=c;setTimeout(()=>{if(window.__cfg.recovery){session={user:window.__cfg.user};c('PASSWORD_RECOVERY',session)}else c('INITIAL_SESSION',null)},0);return{data:{subscription:{}}}},
  signInWithPassword:async(a)=>{window.__calls.push(['login',a.email]);if(a.password==='mala')return{data:{},error:{message:'Invalid login credentials'}};session={user:window.__cfg.user};cb('SIGNED_IN',session);return{data:{session},error:null}},
  signUp:async(a)=>{window.__calls.push(['signup',a.email,a.options&&a.options.data&&!!a.options.data.accepted_terms_at]);if(a.email==='dup@x.es')return{data:{},error:{message:'User already registered'}};if(window.__cfg.confirm)return{data:{user:{id:'n'},session:null},error:null};session={user:{id:'u2',email:a.email}};cb('SIGNED_IN',session);return{data:{session},error:null}},
  resetPasswordForEmail:async(e,o)=>{window.__calls.push(['reset',e,o&&o.redirectTo]);return{data:{},error:null}},
  updateUser:async(a)=>{window.__calls.push(['newpass',a.password]);return{data:{user:session.user},error:null}},
  getUser:async()=>({data:{user:session&&session.user}}),signOut:async()=>{session=null;cb('SIGNED_OUT',null)}}}}};
"""
