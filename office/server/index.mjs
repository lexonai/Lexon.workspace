// LEXON OFFICE server: SQLite DB, users/roles, encrypted AI key vault + pool, streaming AI chat, task worker, scheduler, SSE realtime, static web + mobile admin.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { fileURLToPath } from 'node:url'
import * as E from '../shared/engine.mjs'; import * as P from '../shared/pipeline.mjs'; import { openStore } from './db.mjs'; import { createAI, bindVault, historyOf, workerSystem, managerSystem, markerFilter } from './ai.mjs'
import { SEED_EMPLOYEES, BASE_SCHEDULE, DEFAULT_SETTINGS, PROVIDERS } from '../shared/office-data.mjs'
const here=path.dirname(fileURLToPath(import.meta.url)), DATA=process.env.OFFICE_DATA||path.join(here,'..','data'); fs.mkdirSync(DATA,{recursive:true})
const BASE=(process.env.OFFICE_BASE_PATH||'').replace(/\/$/,''), SF=path.join(DATA,'secret'), WEB=process.env.OFFICE_WEB_DIR||[path.join(here,'..','web'),path.join(here,'..','out')].find(d=>fs.existsSync(path.join(d,'index.html')))||''
const PORT=+process.env.PORT||8787
// Office has NO login or password of its own. Entry is only through Lexon Workspace (single sign-on).
if(!process.env.OFFICE_SSO_SECRET||process.env.OFFICE_SSO_SECRET.length<24){console.error('✖ OFFICE_SSO_SECRET (24+ chars) is required. Office is opened only from Lexon Workspace. Set the same value in Workspace > Integrations > Lexon Office.');process.exit(1)}
const WS_FN=(process.env.WORKSPACE_FUNCTIONS_URL||'').replace(/\/$/,''), GW_SECRET=process.env.OFFICE_GATEWAY_SECRET||''
if(!WS_FN||!GW_SECRET)console.warn('⚠ WORKSPACE_FUNCTIONS_URL / OFFICE_GATEWAY_SECRET not set: Office cannot get its AI keys from Workspace.')
const SECRET=process.env.OFFICE_SECRET||(fs.existsSync(SF)?fs.readFileSync(SF,'utf8'):(()=>{const s=crypto.randomBytes(32).toString('hex');fs.writeFileSync(SF,s,{mode:0o600});return s})())
const fresh=()=>({rev:1,state:{people:Object.fromEntries(SEED_EMPLOYEES.map(e=>[e.id,e])),tasks:[],messages:{},unread:{},activity:[],notifications:[],settings:{...DEFAULT_SETTINGS},models:[],schedule:{base:BASE_SCHEDULE,custom:[]},extraNodes:[]}})
const store=await openStore(DATA); console.log('Storage:',store.kind); bindVault(SECRET); const ai=createAI(store,SECRET)
let db
if(store.isEmpty()){ const old=path.join(DATA,'state.json'); db=(store.kind.startsWith('sqlite')&&fs.existsSync(old))?JSON.parse(fs.readFileSync(old,'utf8')):fresh(); if(store.kind.startsWith('sqlite')&&fs.existsSync(old))fs.renameSync(old,old+'.migrated'); store.save(db.state,db.rev) }
else db={rev:store.getRev(),state:store.load()}
// upgrade: older data had a different roster/layout → reseed people when slots are missing
if(!Object.values(db.state.people).some(p=>p.slot&&p.seat&&p.arch)){db.state.people=fresh().state.people;db.state.tasks=[]}
db.state.settings={...DEFAULT_SETTINGS,...db.state.settings}; for(const k of ['tavilyKey','braveKey','youtubeKey'])delete db.state.settings[k]; delete db.state.models
db.state.ai=ai.summary(); db.state.commands=db.state.commands||[]
let saveT; const save=()=>{clearTimeout(saveT);saveT=setTimeout(()=>{try{store.save(db.state,db.rev)}catch(e){console.error('save failed',e.message)}},300)}
const clients=new Set()
// ---- Central AI keys: Workspace is the ONLY place keys are managed. Office pulls them (server to server). ----
const sigOf=k=>crypto.createHash('sha256').update([k.apiKey,k.model,k.baseUrl,k.kind].join('|')).digest('hex').slice(0,10)
let lastSync={at:0,ok:false,count:0,error:WS_FN&&GW_SECRET?'not synced yet':'not configured'}
async function syncKeys(){
  if(!WS_FN||!GW_SECRET)return lastSync
  try{
    const r=await fetch(WS_FN+'/office-ai',{method:'POST',headers:{'content-type':'application/json','x-office-secret':GW_SECRET},body:JSON.stringify({action:'keys'}),signal:AbortSignal.timeout(15000)})
    const j=await r.json().catch(()=>({})); if(!r.ok)throw new Error(j.error||('Workspace answered '+r.status))
    const want=new Map((j.keys||[]).map(k=>[`ws:${k.id}:${sigOf(k)}`,k])); let changed=false
    for(const k of ai.list())if(String(k.label).startsWith('ws:')&&!want.has(k.label)){ai.remove(k.id);changed=true}
    const have=new Set(ai.list().map(k=>k.label))
    for(const [label,k] of want){ if(have.has(label))continue
      const provider=k.kind==='gemini'?'gemini':k.kind==='anthropic'?'anthropic':/api\.openai\.com/.test(k.baseUrl)?'openai':'compatible'
      try{ai.add({provider,label,secret:k.apiKey&&k.apiKey.length>=8?k.apiKey:'no-key-needed',baseUrl:provider==='compatible'?k.baseUrl:'',models:k.model?{fast:k.model,deep:k.model}:undefined});changed=true}catch(e){console.warn('key skipped:',k.label,e.message)} }
    lastSync={at:Date.now(),ok:true,count:want.size,error:''}; if(changed)commit()
  }catch(e){lastSync={...lastSync,at:Date.now(),ok:false,error:e.message}; console.warn('AI key sync failed:',e.message)}
  return lastSync
}
syncKeys(); setInterval(syncKeys,5*60e3).unref()
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon','.glb':'model/gltf-binary','.woff2':'font/woff2','.txt':'text/plain'}
const view=m=>m?{...db.state,settings:{...db.state.settings}}:db.state
const commit=()=>{db.state.ai=ai.summary();db.state.commands=(db.state.commands||[]).filter(c=>Date.now()-c.t<60000);db.rev++;save();for(const c of clients)c.res.write(`data: ${JSON.stringify({rev:db.rev,state:view(c.mask)})}\n\n`)}
const mac=b=>crypto.createHmac('sha256',SECRET).update(b).digest('base64url')
const sign=o=>{const b=Buffer.from(JSON.stringify(o)).toString('base64url');return b+'.'+mac(b)}
const verify=t=>{const [b,h]=String(t||'').split('.');if(!b||!h||mac(b)!==h)return null;try{const o=JSON.parse(Buffer.from(b,'base64url'));return o.exp>Date.now()?o:null}catch{return null}}
const json=(res,code,o)=>{res.writeHead(code,{'content-type':'application/json','access-control-allow-origin':'*'});res.end(JSON.stringify(o))}
const body=req=>new Promise(r=>{let b='';req.on('data',c=>{b+=c;if(b.length>8e6)req.destroy()});req.on('end',()=>{try{r(JSON.parse(b||'{}'))}catch{r({})}})})
const raw=req=>new Promise((ok,no)=>{const c=[];let n=0;req.on('data',d=>{n+=d.length;if(n>12e6){req.destroy();no(new Error('Too large'))}else c.push(d)});req.on('end',()=>ok(Buffer.concat(c)))})
const rate=new Map(); const limited=u=>{const now=Date.now(),a=(rate.get(u)||[]).filter(t=>now-t<60000);if(a.length>=90)return true;a.push(now);rate.set(u,a);return false}
// ---------- AI chat core (streams deltas; executes [[TASK]]/[[CALL]] markers) ----------
const NOAI='AI is not connected. Ask an Admin to add an API key in Lexon Workspace → Integrations → Lexon Office.'
async function chatCore(b,onDelta){
  const st=db.state,conv=b.conv||'manager',mgr=E.manager(st); st.openConv=undefined
  const r=E.ownerMessage(st,{conv,text:String(b.text||'').slice(0,4000),attach:b.attach}); commit()
  const emp=conv==='manager'?mgr:st.people[conv]; if(!emp)throw new Error('Unknown conversation')
  if(!ai.available()){E.addMsg(st,conv,{from:'system',system:true,text:NOAI});commit();return {text:'',notice:NOAI}}
  const long=String(b.text).length>240||/research|analy|plan|strategy|explain|विस्तार|samjhao|detail/i.test(b.text)
  const system=emp.isManager?managerSystem(st,emp,{voice:b.voice}):workerSystem(st,emp,{voice:b.voice})
  let shown='';const f=markerFilter(t=>{shown+=t;onDelta(t)})
  await ai.stream({system,messages:historyOf(st,conv),tier:long?'deep':'fast',maxTokens:b.voice?160:long?900:420},t=>f.push(t))
  const markers=f.end(); shown=shown.trim()
  for(const m of markers){ const [k,...rest]=m.split(':'),v=rest.join(':').trim()
    if(/^TASK$/i.test(k)&&v)E.createTask(st,{title:v,requester:'chat',assignee:conv!=='manager'?conv:undefined})
    else if(/^CALL$/i.test(k)){const [room,who='all']=v.split('|').map(x=>x.trim().toLowerCase());const names=who==='all'?null:who.split(',').map(x=>x.trim());const ids=names?Object.values(st.people).filter(p=>names.includes(p.name.split(' ')[0].toLowerCase())).map(p=>p.id):null;E.cmd(st,{type:'roomCall',room,all:!ids,ids})} }
  if(shown)E.addMsg(st,conv,{from:emp.id,text:shown}); commit(); return {text:shown}
}
async function meetingCore(b){
  const st=db.state,mgr=E.manager(st); const ids=[...new Set([mgr.id,...(b.ids||[]).filter(i=>st.people[i])])].slice(0,10)
  E.addMsg(st,'meeting',{from:'owner',text:String(b.text||'').slice(0,1000)}); commit()
  if(!ai.available())return {lines:[],notice:NOAI}
  const roster=ids.map(i=>`${st.people[i].name} (${st.people[i].role})`).join('; ')
  const text=await ai.complete({system:`You write a short, natural office meeting exchange. Participants: ${roster}. The manager ${mgr.name} leads and speaks first; 1–3 others contribute with ideas relevant to their roles. Output ONLY 2–5 lines in the form "FirstName: sentence". Each sentence short. Language/style: mirror the boss's message (Hindi, Hinglish or English).`,prompt:`Boss says in the ${b.room||'meeting'}: ${b.text}`,tier:'fast'})
  const lines=[];for(const l of text.split('\n')){const m=l.match(/^\s*\**([A-Za-z]+)\**\s*:\s*(.+)$/);if(!m)continue;const p=ids.map(i=>st.people[i]).find(p=>p.name.split(' ')[0].toLowerCase()===m[1].toLowerCase());if(p){lines.push({id:p.id,text:m[2].trim()});E.addMsg(st,'meeting',{from:p.id,text:m[2].trim()})}}
  commit(); return {lines}
}
async function banterCore(b){
  const st=db.state,A=st.people[b.a],B=st.people[b.b]; if(!A||!B||!ai.available())return {lines:[]}
  const text=await ai.complete({system:`Write 1–2 very short lines of casual office chatter between ${A.name} (${A.role}) and ${B.name} (${B.role}) while ${b.ctx||'walking'}. Natural Hinglish or English, workplace-appropriate. Output ONLY lines like "FirstName: text".`,prompt:`Context: ${b.ctx||'on the way'}. Team is working on: ${st.tasks.filter(t=>t.status!=='done').map(t=>t.title).slice(0,2).join('; ')||'regular work'}.`,tier:'fast'})
  const lines=[];for(const l of text.split('\n').slice(0,2)){const m=l.match(/^\s*\**([A-Za-z]+)\**\s*:\s*(.+)$/);if(!m)continue;const p=[A,B].find(p=>p.name.split(' ')[0].toLowerCase()===m[1].toLowerCase());if(p)lines.push({id:p.id,text:m[2].trim().slice(0,110)})}
  return {lines}
}
http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://x'),p=u.pathname
  if(req.method==='OPTIONS'){res.writeHead(204,{'access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS'});return res.end()}
  if(p==='/health')return json(res,200,{ok:true,rev:db.rev})
  if(p==='/m'||p==='/m/')return json(res,410,{error:'The separate mobile page was retired. Open Office from Lexon Workspace.'})
  if(p==='/api/login')return json(res,410,{error:'Office has no password. Sign in to Lexon Workspace.'})
  if(p==='/api/sso'&&req.method==='POST'){ const b=await body(req),S=process.env.OFFICE_SSO_SECRET; const okk=S&&typeof b.secret==='string'&&b.secret.length===S.length&&crypto.timingSafeEqual(Buffer.from(b.secret),Buffer.from(S)); if(!okk)return json(res,401,{error:'Invalid SSO secret'}); const role=['owner','admin','viewer'].includes(b.role)?b.role:'viewer'; return json(res,200,{token:sign({u:String(b.username||'workspace').slice(0,40),r:role,exp:Date.now()+12*3600e3}),role}) }
  const isApi=p.startsWith('/api/')
  if(!isApi&&req.method==='GET'&&WEB){ const rel=BASE&&p.startsWith(BASE)?(p.slice(BASE.length)||'/'):p; let f=path.normalize(path.join(WEB,rel)); if(f.startsWith(WEB)){ if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html'); else if(!fs.existsSync(f)&&!path.extname(f)){f=fs.existsSync(f+'.html')?f+'.html':path.join(f,'index.html')} if(fs.existsSync(f)){res.writeHead(200,{...(process.env.OFFICE_FRAME_ANCESTORS?{'content-security-policy':`frame-ancestors 'self' ${process.env.OFFICE_FRAME_ANCESTORS}`}:{}),'content-type':MIME[path.extname(f)]||'application/octet-stream','cache-control':f.includes('_next')?'public,max-age=31536000,immutable':'no-cache'});return fs.createReadStream(f).pipe(res)} } }
  const auth=(req.headers.authorization||'').replace('Bearer ','')||u.searchParams.get('token'); const who=verify(auth); if(!who)return json(res,401,{error:'Unauthorized'})
  if(req.method!=='GET'&&who.r==='viewer')return json(res,403,{error:'Read-only account'})
  const mask=u.searchParams.get('mask')==='1'
  try{
  if(p==='/api/me')return json(res,200,{user:who.u,role:who.r})
  if(p==='/api/users')return json(res,410,{error:'Users are managed only in Lexon Workspace'})
  if(p.startsWith('/api/ai/keys'))return json(res,410,{error:'AI keys are managed only in Lexon Workspace > Integrations > Lexon Office'})
  if(p==='/api/ai/status')return json(res,200,{...ai.summary(),sync:lastSync})
  if(p==='/api/ai/refresh'&&req.method==='POST')return json(res,200,await syncKeys())
  if(p==='/api/ai/chat'&&req.method==='POST'){ if(limited(who.u))return json(res,429,{error:'Slow down'}); const b=await body(req)
    res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache','access-control-allow-origin':'*'}); const send=o=>res.write('data: '+JSON.stringify(o)+'\n\n')
    try{const r=await chatCore(b,d=>send({delta:d}));if(r.notice)send({notice:r.notice});send({done:true,text:r.text})}catch(e){send({error:e.message})} return res.end() }
  if(p==='/api/chat'&&req.method==='POST'){ const b=await body(req); try{const r=await chatCore(b,()=>{});return json(res,200,{ok:true,text:r.text,notice:r.notice})}catch(e){return json(res,200,{ok:false,error:e.message})} }
  if(p==='/api/ai/tts'&&req.method==='POST'){ if(limited(who.u))return json(res,429,{error:'Slow down'}); const b=await body(req),e=db.state.people[b.emp]; try{const r=await ai.tts(String(b.text||''),{gender:e?.gender||b.gender,seed:b.emp||'x'});res.writeHead(200,{'content-type':r.mime,'access-control-allow-origin':'*'});return res.end(r.buf)}catch(er){return json(res,503,{error:er.message})} }
  if(p==='/api/ai/stt'&&req.method==='POST'){ if(limited(who.u))return json(res,429,{error:'Slow down'}); try{const buf=await raw(req);const text=await ai.stt(buf,req.headers['content-type']||'audio/webm',u.searchParams.get('lang')||'hi');return json(res,200,{text})}catch(er){return json(res,503,{error:er.message})} }
  if(p==='/api/ai/meeting'&&req.method==='POST'){ if(limited(who.u))return json(res,429,{error:'Slow down'}); return json(res,200,await meetingCore(await body(req))) }
  if(p==='/api/ai/banter'&&req.method==='POST'){ if(limited(who.u))return json(res,429,{error:'Slow down'}); return json(res,200,await banterCore(await body(req))) }
  if(p==='/api/events'){res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache',connection:'keep-alive','access-control-allow-origin':'*'});const c={res,mask};clients.add(c);res.write(`data: ${JSON.stringify({rev:db.rev,state:view(mask)})}\n\n`);const k=setInterval(()=>res.write(': ping\n\n'),20000);req.on('close',()=>{clients.delete(c);clearInterval(k)});return}
  if(p==='/api/state'&&req.method==='GET')return json(res,200,{rev:db.rev,state:view(mask)})
  if(p==='/api/state'&&req.method==='PUT'){const b=await body(req);if(b.baseRev!==db.rev)return json(res,409,{rev:db.rev,state:db.state});const s=b.state||{};delete s.ai;delete s.commands;delete s.models;db.state={...db.state,...s};commit();return json(res,200,{rev:db.rev})}
  if(p==='/api/task'&&req.method==='POST'){const b=await body(req);E.createTask(db.state,{title:String(b.title||'').slice(0,2000),priority:b.priority||'normal',deadline:b.deadline,assignee:b.assignee,requester:'mobile'});commit();return json(res,200,{ok:true})}
  if(p==='/api/schedule'&&req.method==='POST'){const b=await body(req);db.state.schedule={...db.state.schedule,custom:[...db.state.schedule.custom,{id:E.uid('c'),date:b.date||E.todayStr(),time:b.time||'10:00',title:b.title,kind:b.kind||'Task',assignee:b.assignee}]};commit();return json(res,200,{ok:true})}
  json(res,404,{error:'Not found'})
  }catch(e){ if(!res.headersSent)json(res,500,{error:e.message}); else res.end() }
}).listen(PORT,()=>console.log(`LEXON OFFICE on http://localhost:${PORT}  ${WEB?'(web app served from '+WEB+')':'(no web build found — run npm run build:web)'}  mobile admin: /m  ·  AI keys: ${ai.summary().keys}`))
// ---- background worker ----
let running=false
const aiObj={available:()=>ai.available(),complete:o=>ai.complete(o),image:p=>ai.image(p),secret:p=>ai.secretOf(p)}
setInterval(async()=>{
  const st=db.state
  for(const t of st.tasks)if(t.status==='review'&&Date.now()-(t.reviewAt||0)>12000){E.deliver(st,t.id);commit()}
  if(running)return; const t=E.startNext(st); if(!t)return; commit(); running=true
  try{const res=await P.executeTask({task:t,employee:st.people[t.assignee],settings:st.settings,ai:aiObj});E.completeWork(st,t.id,res)}catch(e){E.completeWork(st,t.id,{text:'Error: '+e.message})}finally{running=false;commit()}
},2000)
setInterval(()=>{const b=JSON.stringify([db.state.schedule,db.state.commands]);E.tickSchedule(db.state);if(JSON.stringify([db.state.schedule,db.state.commands])!==b)commit()},15000)
