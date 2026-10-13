// Manager brain: routing, task lifecycle, rooms/commands. Pure functions over a state object
// {people,tasks,messages,unread,activity,notifications,settings,schedule,openConv,commands,ai}. Replies are AI-generated (server); nothing here is a canned reply.
import { SLOTS } from './office-data.mjs'
export const uid=(p='t')=>p+Math.random().toString(36).slice(2,9)
export const first=e=>(e?.name||'').split(' ')[0]
const PRI={urgent:0,high:1,normal:2,low:3}
export const ROOM_IDS=['dev','youtube','content','conference','meeting','break','main']
export const CATS=[
 {id:'thumbnail',label:'Thumbnail',re:/thumbnail|thumb|cover|banner|poster/i,stages:[{role:/thumbnail|design|photo/i,cap:'image-generation'}]},
 {id:'script',label:'Script',re:/script|narration|hook|screenplay|dialogue|स्क्रिप्ट/i,stages:[{role:/research|strateg/i,cap:'web-research'},{role:/script|writer/i,cap:'llm-writing'}]},
 {id:'research',label:'Research',re:/research|find|trend|competitor|analy[sz]|top\s*\d+|topics?|ideas?|reference|compare|खोज|रिसर्च/i,stages:[{role:/research|strateg|analyst/i,cap:'web-research'}]},
 {id:'title',label:'Title / SEO',re:/title|seo|tags?|description|keyword/i,stages:[{role:/strateg|seo|youtube|content/i,cap:'llm-writing'}]},
 {id:'motion',label:'Motion / Video',re:/animation|motion|timeline|video edit|edit(ing)? video|reel|shorts/i,stages:[{role:/motion|video|shorts/i,cap:'llm-writing'}]},
 {id:'code',label:'Development',re:/\b(code|bug|api|app|website|backend|frontend|deploy|fix)\b/i,stages:[{role:/develop|engineer/i,cap:'code'}]},
 {id:'content',label:'Content',re:/post|caption|blog|article|newsletter|write|likh/i,stages:[{role:/content|writer|editor|script/i,cap:'llm-writing'}]},
]
export const manager=st=>Object.values(st.people).find(p=>p.isManager)
const load=(st,id)=>st.tasks.filter(t=>t.status!=='done'&&t.chain.includes(id)).length
export function route(st,text){
  const cat=CATS.find(c=>c.re.test(text))||{id:'general',label:'General',stages:[{role:/./,cap:'llm-chat'}]}
  const used=[],stages=[]
  for(const s of cat.stages){
    const pool=Object.values(st.people).filter(p=>!p.isManager&&p.presence!=='offline'&&!used.includes(p.id))
    const pick=pool.filter(p=>s.role.test(p.role+' '+(p.skills||[]).join(' '))).sort((a,b)=>load(st,a.id)-load(st,b.id))[0]||pool.sort((a,b)=>load(st,a.id)-load(st,b.id))[0]
    if(pick){used.push(pick.id);stages.push({emp:pick.id,cap:s.cap})}
  }
  const needs=cat.id==='thumbnail'&&/\b(my|mera|meri|me|face|photo|selfie)\b/i.test(text)?['photo']:[]
  return {category:cat.id,label:cat.label,stages,needs,capability:stages.length?stages[stages.length-1].cap:'llm-chat'}
}
export function log(st,text,kind='system',pid){st.activity=[{id:uid('a'),t:Date.now(),text,kind,pid},...st.activity].slice(0,200)}
export function notify(st,text){st.notifications=[{id:uid('n'),t:Date.now(),text,read:false},...st.notifications].slice(0,60)}
export function cmd(st,c){st.commands=[...(st.commands||[]).filter(x=>Date.now()-x.t<60000),{id:uid('c'),t:Date.now(),...c}]}
export function addMsg(st,conv,msg){
  st.messages={...st.messages,[conv]:[...(st.messages[conv]||[]),{id:uid('m'),t:Date.now(),read:msg.from==='owner',...msg}]}
  if(msg.from!=='owner'&&msg.from!=='system'&&st.openConv!==conv){st.unread={...st.unread,[conv]:(st.unread[conv]||0)+1}; notify(st,`${first(st.people[msg.from])||'Manager'}: ${String(msg.text).slice(0,70)}`)}
}
export function createTask(st,{title,priority='normal',deadline,assignee,requester='owner',category,quiet}){
  const mgr=manager(st); let r=route(st,title)
  if(category&&category!==r.category){const c=CATS.find(x=>x.id===category); if(c){r=route(st,c.label+' '+title);r.category=c.id;r.label=c.label}}
  let stages=r.stages; if(assignee&&st.people[assignee]){stages=[{emp:assignee,cap:r.capability}]}
  const emps=stages.map(s=>s.emp).filter((e,i,a)=>a.indexOf(e)===i)
  const t={id:uid('t'),title,category:r.category,label:r.label,capability:r.capability,priority,deadline,assignee:emps[emps.length-1]||null,chain:[mgr.id,...emps,mgr.id],status:r.needs.length?'blocked':'queued',progress:0,handoffs:[],needs:r.needs,inputs:[],createdAt:Date.now(),requester}
  st.tasks=[...st.tasks,t]
  log(st,`${requester==='owner'?'Owner':requester==='schedule'?'Schedule':requester==='chat'?'Owner (chat)':'Mobile'} → Manager: "${title}"`,'task')
  log(st,`Manager routed "${title}" → ${emps.map(e=>first(st.people[e])).join(' → ')||'—'} (${r.capability})`,'ai')
  if(!quiet)addMsg(st,'manager',{from:'system',system:true,text:`Routed: ${r.label} → ${emps.map(e=>first(st.people[e])).join(' → ')} · ${st.ai?.keys>0?'AI pool ready':'AI not connected'}${t.status==='blocked'?' · waiting for your photo':''}`})
  if(t.status==='blocked')notify(st,`${first(st.people[emps[0]])} needs your photo for the thumbnail`)
  return t
}
export function startNext(st){
  if(st.tasks.some(t=>t.status==='working'||t.status==='review'))return null
  const q=st.tasks.filter(t=>t.status==='queued').sort((a,b)=>PRI[a.priority]-PRI[b.priority]||a.createdAt-b.createdAt)[0]; if(!q)return null
  st.tasks=st.tasks.map(t=>t.id===q.id?{...t,status:'working',startedAt:Date.now()}:t); log(st,`${first(st.people[q.assignee])} started "${q.title}"`,'task',q.assignee); return q
}
export function completeWork(st,id,res){
  st.tasks=st.tasks.map(t=>t.id===id?{...t,status:'review',reviewAt:Date.now(),output:{text:res.text,imageUrl:res.imageUrl,sources:(res.sources||[]).slice(0,8)},model:res.modelId}:t)
  const t=st.tasks.find(x=>x.id===id); log(st,`${first(st.people[t.assignee])} completed output for "${t.title}"`,'task',t.assignee)
}
export function deliver(st,id){
  const t=st.tasks.find(x=>x.id===id); if(!t||t.status==='done')return
  st.tasks=st.tasks.map(x=>x.id===id?{...x,status:'done',progress:100,doneAt:Date.now()}:x)
  const mgr=manager(st); log(st,`Manager reviewed and delivered "${t.title}" to Owner`,'task',mgr.id)
  addMsg(st,'manager',{from:mgr.id,text:`"${t.title}" is ready — I've reviewed it.\n\n${(t.output?.text||'').slice(0,1500)}`,output:t.output,taskId:id})
}
export const isRequest=text=>/^\s*(please\s+)?(create|make|write|find|research|generate|prepare|build|design|fix|analy[sz]e|draft|plan|collect|bana|banao|likh|likho|dhund|tayyar|kar)\b/i.test(text)||/तैयार|बनाओ|करो|खोज|लिख|रिसर्च/.test(text)||(text.length>=28&&CATS.some(c=>c.re.test(text)))
const ROOM_WORDS=[['conference',/conference|कॉन्फ़्रेंस/i],['meeting',/meeting|मीटिंग/i],['dev',/dev(elopment)?|डेवलप/i],['youtube',/youtube|यूट्यूब/i],['content',/content|कंटेंट/i],['break',/break|canteen|ब्रेक/i],['main',/main\s*floor/i]]
/** deterministic room-call parsing (used when no AI is connected, and for explicit commands) */
export function parseRoomCommand(text){ if(!/\b(call|come|aao|aayein|bulao|gather|go|jao|meet)\b|बुला|आओ|आएँ|जाओ/i.test(text))return null; const r=ROOM_WORDS.find(([,re])=>re.test(text)); return r?{room:r[0],all:/\b(all|everyone|sab|team)\b|सब|सभी/i.test(text)}:null }
/** returns {task?:Task, chat?:true, room?:{room,all}} — the reply itself is generated by the AI layer */
export function ownerMessage(st,{conv='manager',text,attach,noRoute=false}){
  addMsg(st,conv,{from:'owner',text,attach})
  const mgr=manager(st), blocked=st.tasks.find(t=>t.status==='blocked')
  if(attach&&blocked&&conv==='manager'){ st.tasks=st.tasks.map(t=>t.id===blocked.id?{...t,status:'queued',inputs:[...t.inputs,{name:attach}],needs:[]}:t); log(st,`Owner provided ${attach} for "${blocked.title}"`,'task'); return {chat:true,unblocked:blocked} }
  if(noRoute)return {chat:true}
  const rc=parseRoomCommand(text); if(rc&&conv==='manager'&&!st.ai?.keys){cmd(st,{type:'roomCall',room:rc.room,all:true});return {room:rc}}
  if(!st.ai?.keys&&isRequest(text)){ const t=createTask(st,{title:text.trim(),assignee:conv==='manager'||!st.people[conv]?undefined:conv}); return {task:t} }
  return {chat:true}
}
export function employeeRequest(st,empId,text){
  const e=st.people[empId],mgr=manager(st)
  if(st.settings.directMessaging){addMsg(st,empId,{from:empId,text});log(st,`${first(e)} messaged Owner directly`,'people',empId)}
  else{addMsg(st,'manager',{from:mgr.id,text:`${first(e)} needs: ${text}`});log(st,`${first(e)} sent a request via Manager`,'people',empId)}
}
const APPS=[[/motion|video/i,'Lexon Motion'],[/design|photo|thumbnail/i,'Image Editor'],[/develop|engineer/i,'VS Code'],[/script|writer|content|editor/i,'Docs · Script'],[/youtube|strateg/i,'YouTube Studio']]
const COL=[['#3a4a63','#6b3b3b','#4b5a4a','#55524a','#2f3d4f','#46505c'],['#c99772','#b98560','#d2a47b','#a97650','#c4916a','#caa077'],['#1b1512','#15110e','#241810','#0f0d0b']]
export function addEmployee(st,d){
  const mgr=manager(st),used=new Set(Object.values(st.people).map(p=>p.slot))
  let id=(d.name||'emp').toLowerCase().replace(/[^a-z]/g,'').slice(0,12)||'emp'; while(st.people[id])id+=Math.floor(Math.random()*9)
  const free=SLOTS.filter(s=>s.type==='desk'&&!used.has(s.id)),slot=free.find(s=>s.room===d.room)||free[0]
  const h=[...id].reduce((a,c)=>a+c.charCodeAt(0),0)
  const e={id,name:d.name,role:d.role||'Team member',dept:d.dept||'General',gender:d.gender||'male',room:slot?slot.room:'main',slot:slot?.id,desk:slot?[slot.x,slot.z]:null,seat:slot?[slot.sx,slot.sz,slot.ry]:[0,7,Math.PI],sit:true,app:(APPS.find(a=>a[0].test(d.role||''))||[0,'Chrome'])[1],
    shirt:COL[0][h%6],skin:COL[1][h%6],hair:COL[2][h%4],hairStyle:h%3,build:1,state:'IDLE',task:'Ready for tasks',presence:'online',progress:0,reportsTo:mgr.id,skills:d.skills||[],instructions:d.instructions||'',knowledge:d.knowledge||[],tools:d.tools||[],voice:{pitch:d.gender==='female'?1.15:0.85,rate:1}}
  st.people={...st.people,[id]:e}; log(st,`${e.name} joined as ${e.role}`,'people',id); addMsg(st,'manager',{from:'system',system:true,text:`${e.name} (${e.role}) joined the team and reports to the Manager.`}); return e
}
export const todayStr=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
export function tickSchedule(st,now=new Date()){
  const day=todayStr(now),hm=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
  st.schedule={...st.schedule,custom:st.schedule.custom.map(ev=>{
    if(ev.date!==day||ev.firedAt||ev.time>hm)return ev
    if(ev.kind==='Task'){createTask(st,{title:ev.title,assignee:ev.assignee||undefined,requester:'schedule'})}
    else{ if(ev.kind==='Meeting')cmd(st,{type:'roomCall',room:'meeting',all:true}); log(st,`${ev.kind}: ${ev.title}`,'system'); notify(st,`${ev.kind}: ${ev.title}`) }
    return {...ev,firedAt:Date.now()}})}
  const mins=s=>{const [h,m]=s.split(':').map(Number);return h*60+m},nowM=now.getHours()*60+now.getMinutes(),fired={...(st.schedule.baseFired||{})}; let ch=false
  for(const b of st.schedule.base){ if(b.kind==='Meeting'&&fired[b.id]!==day&&nowM>=mins(b.time)&&nowM-mins(b.time)<=5){fired[b.id]=day;ch=true;cmd(st,{type:'roomCall',room:'meeting',all:true});log(st,`Meeting: ${b.title}`,'system');notify(st,`Meeting: ${b.title}`)} }
  if(ch)st.schedule={...st.schedule,baseFired:fired}
}
