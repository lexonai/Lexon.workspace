'use client'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { rtc } from '@/lib/rtc'
import { streamChat } from '@/lib/ai-client'
import { SEED_EMPLOYEES, BASE_SCHEDULE, DEFAULT_SETTINGS, CAMS } from '@/config/office.config'
import * as E from '@/shared/engine.mjs'
import * as P from '@/shared/pipeline.mjs'
export type PState='IDLE'|'WORKING'|'TYPING'|'READING'|'WALKING'|'TALKING'|'MEETING'|'CALLING'|'BREAK'|'AWAY'|'COMPLETED'
export type Emp=any; export type Task=any
export type Msg={id?:string;from:string;text:string;t:number;read?:boolean;attach?:string;output?:any;taskId?:string;system?:boolean}
const SL=['people','tasks','messages','unread','activity','notifications','settings','schedule','openConv','commands','ai'] as const
const NOAI='AI is not connected. An Admin adds the API key in Lexon Workspace → Integrations → Lexon Office.'
type S={
 ready:boolean; people:Record<string,Emp>; tasks:Task[]; messages:Record<string,Msg[]>; unread:Record<string,number>; activity:any[]; notifications:any[]
 settings:any; schedule:{base:any[];custom:any[];baseFired?:any}; extraNodes:any[]; openConv:string; commands:any[]; ai:{keys:number;providers:string[];search?:string[];tts?:boolean;stt?:boolean}
 backend:{connected:boolean;url:string;error:string}; typing:Record<string,boolean>; streaming:{conv:string;text:string}|null; bubbles:Record<string,{text:string}>
 selected:string|null; camId:string; mode:'live'|'tour'|'follow'|'room'|'free'|'walk'; follow:string|null; zoom:number; focusCam:string|null; chatWith:string|null
 callState:{id:string;status:'calling'|'connected';since:number;mode:'ai'|'voice'}|null; callPrev:any; calls:{from:string;to:string;t:number;dur?:number}[]
 meetReq:string|null; busyIds:string[]; roomCallReq:{room:string;ids:string[];hold:boolean;t:number}|null; playerRoom:string|null;perfLevel:number; meetingRoom:string|null; vis:{id:string;step:number}
 set:(p:Partial<S>)=>void; run:<T>(f:(st:any)=>T)=>T; afterHydrate:()=>void
 setState:(id:string,s:PState,task?:string)=>void; log:(t:string,kind?:string,pid?:string)=>void; say:(id:string,text:string,ms?:number)=>void
 sendOwner:(conv:string,text:string,attach?:string)=>Promise<void>; addMsg:(conv:string,msg:Partial<Msg>)=>void
 createTask:(o:any)=>void; patchTask:(id:string,p:any)=>void; setTaskProgress:(id:string,p:number)=>void; addHandoff:(id:string,h:string)=>void; deliverTask:(id:string)=>void
 addEmployee:(d:any)=>void; setSettings:(p:any)=>void; pump:()=>void; tick:()=>void; ambient:()=>void; markRead:(conv:string)=>void
 roomCall:(room:string,ids?:string[]|'all',hold?:boolean)=>void; execCommand:(c:any)=>void
 startCall:(id:string)=>void; connectCall:()=>void; endCall:()=>void; requestMeet:(id:string)=>void
}
export const convOf=(p:Emp)=>p?.isManager?'manager':p?.id
export const NO_AI_NOTICE=NOAI
const seedPeople=()=>Object.fromEntries(SEED_EMPLOYEES.map((e:any)=>[e.id,{...e}]))
export const useOffice = create<S>()(persist((set,get)=>{
 function run<T>(f:(st:any)=>T):T{ let out:any; let cmds:any[]=[]; set(s=>{ const st:any={}; SL.forEach(k=>st[k]=(s as any)[k]); const n0=s.notifications[0]?.id; out=f(st)
   const n1=st.notifications[0]; if(n1&&n1.id!==n0&&st.settings.browserNotify&&typeof Notification!=='undefined'&&Notification.permission==='granted'){try{new Notification('LEXON OFFICE',{body:n1.text})}catch{}}
   if(st.commands?.length&&!s.backend.connected){cmds=st.commands;st.commands=[]} return st }); cmds.forEach(c=>get().execCommand(c)); return out }
 return {
 ready:false, people:seedPeople(), tasks:[], messages:{}, unread:{}, activity:[{id:'a0',t:Date.now(),text:'Office is live',kind:'system'}], notifications:[],
 settings:{...DEFAULT_SETTINGS}, schedule:{base:BASE_SCHEDULE,custom:[]}, extraNodes:[], openConv:'manager', commands:[], ai:{keys:0,providers:[]},
 backend:{connected:false,url:'',error:''}, typing:{}, streaming:null, bubbles:{},
 selected:null, camId:CAMS[0].id, mode:'live', follow:null, zoom:1, focusCam:null, chatWith:null,
 callState:null, callPrev:null, calls:[], meetReq:null, busyIds:[], roomCallReq:null, playerRoom:null, perfLevel:0, meetingRoom:null, vis:{id:'',step:0},
 set:(p)=>set(p as any), run,
 afterHydrate:()=>set(s=>({ready:true,openConv:'manager',tasks:s.tasks.map((t:any)=>t.status==='working'&&!localStorage.getItem('office.token')?{...t,status:'queued'}:t)})),
 setState:(id,st,task)=>set(s=>s.people[id]?{people:{...s.people,[id]:{...s.people[id],state:st,task:task??s.people[id].task,progress:st==='COMPLETED'?100:s.people[id].progress}}}:{}),
 log:(t,kind='system',pid)=>run(st=>E.log(st,t,kind,pid)),
 say:(id,text,ms=5500)=>{ set(s=>({bubbles:{...s.bubbles,[id]:{text}}})); setTimeout(()=>set(s=>s.bubbles[id]?.text===text?{bubbles:Object.fromEntries(Object.entries(s.bubbles).filter(([k])=>k!==id))}:{}),ms) },
 addMsg:(conv,msg)=>run(st=>E.addMsg(st,conv,{from:'system',text:'',...msg} as any)),
 sendOwner:async(conv,text,attach)=>{
  if(get().backend.connected){
   set({streaming:{conv,text:''}})
   try{ await streamChat({conv,text,attach},{onDelta:d=>set(s=>({streaming:{conv,text:(s.streaming?.text||'')+d}})),onNotice:()=>{}}) }
   catch(e:any){ run(st=>E.addMsg(st,conv,{from:'system',system:true,text:'Error: '+e.message})) }
   setTimeout(()=>set({streaming:null}),400); return }
  const r=run(st=>E.ownerMessage(st,{conv,text,attach}))
  if(r.task&&conv!=='manager')run(st=>E.addMsg(st,conv,{from:'system',system:true,text:`Passed to the manager as a task.`}))
  if(r.chat)run(st=>E.addMsg(st,conv,{from:'system',system:true,text:NOAI}))
 },
 createTask:(o)=>run(st=>E.createTask(st,o)),
 patchTask:(id,p)=>set(s=>({tasks:s.tasks.map((t:any)=>t.id===id?{...t,...p}:t)})),
 setTaskProgress:(id,p)=>set(s=>{const t=s.tasks.find((x:any)=>x.id===id);return t&&t.progress!==p?{tasks:s.tasks.map((x:any)=>x.id===id?{...x,progress:p}:x)}:{}}),
 addHandoff:(id,h)=>set(s=>({tasks:s.tasks.map((t:any)=>t.id===id?{...t,handoffs:[...t.handoffs,h]}:t)})),
 deliverTask:(id)=>run(st=>E.deliver(st,id)),
 addEmployee:(d)=>run(st=>E.addEmployee(st,d)),
 setSettings:(p)=>set(s=>({settings:{...s.settings,...p}})),
 pump:()=>{ const s=get(); if(!s.ready||s.backend.connected||!s.settings.autoStart)return
  const t=run(st=>E.startNext(st)); if(!t)return
  P.executeTask({task:t,employee:get().people[t.assignee],settings:get().settings,ai:null}).then((res:any)=>run(st=>E.completeWork(st,t.id,res))).catch((e:any)=>run(st=>E.completeWork(st,t.id,{text:'Error: '+e.message}))) },
 tick:()=>{ if(!get().backend.connected) run(st=>E.tickSchedule(st)) },
 ambient:()=>{ const ids=Object.keys(get().people).filter(i=>!get().people[i].isManager&&get().callState?.id!==i); const id=ids[Math.floor(Math.random()*ids.length)]; if(!id)return
  const p=get().people[id],next=p.presence==='online'?'away':p.presence==='away'?'online':p.presence
  if(next!==p.presence){set(s=>({people:{...s.people,[id]:{...p,presence:next}}}));get().log(`${p.name.split(' ')[0]} is now ${next}`,'people',id)} },
 markRead:(conv)=>set(s=>({unread:{...s.unread,[conv]:0},openConv:conv,messages:{...s.messages,[conv]:(s.messages[conv]||[]).map(m=>({...m,read:true}))}})),
 roomCall:(room,ids='all',hold=false)=>{ const s=get(); const all=Object.values(s.people).filter((p:any)=>p.presence!=='offline'&&s.callState?.id!==p.id).map((p:any)=>p.id)
  const list=(ids==='all'?all:ids.filter(i=>s.people[i]&&s.people[i].presence!=='offline')); const mgr=Object.values(s.people).find((p:any)=>p.isManager) as any
  const withMgr=[...new Set([mgr?.id,...list].filter(Boolean))] as string[]
  set({roomCallReq:{room,ids:withMgr,hold,t:Date.now()}}); get().log(`Everyone called to the ${room} room`,'people') },
 execCommand:(c)=>{ if(c?.type==='roomCall')get().roomCall(c.room,c.ids?.length?c.ids:'all') },
 startCall:(id)=>{ const p=get().people[id]; if(!p||p.presence==='offline'||get().callState)return; const real=rtc.isOnline(id); if(real)rtc.call(id)
  set({callState:{id,status:'calling',since:Date.now(),mode:real?'voice':'ai'},selected:id}); get().log(real?`Owner is calling ${p.name.split(' ')[0]} (live voice)`:`Owner is calling ${p.name.split(' ')[0]}`,'people',id) },
 connectCall:()=>{ const c=get().callState; if(!c||c.status!=='calling')return; const p=get().people[c.id]
  set(st=>({callState:{...c,status:'connected',since:Date.now()},callPrev:{state:p.state,task:p.task,presence:p.presence},people:{...st.people,[c.id]:{...st.people[c.id],state:'CALLING',task:'On a call with Owner',presence:'busy'}}}))
  get().log(`${p.name.split(' ')[0]} picked up the call`,'people',c.id) },
 endCall:()=>{ const c=get().callState; if(!c)return; set({callState:null}); if(c.mode==='voice')rtc.hangup()
  const pv=get().callPrev,dur=Math.round((Date.now()-c.since)/1000),p=get().people[c.id]
  if(c.status==='connected'&&pv){ set(st=>({people:{...st.people,[c.id]:{...st.people[c.id],state:pv.state==='CALLING'?'IDLE':pv.state,task:pv.task,presence:pv.presence}},calls:[{from:'owner',to:c.id,t:Date.now(),dur},...st.calls].slice(0,50)}))
   get().addMsg(convOf(p),{from:'system',system:true,text:`📞 Call ended · ${Math.floor(dur/60)}:${String(dur%60).padStart(2,'0')}`}); get().log(`Call with ${p.name.split(' ')[0]} ended (${dur}s)`,'people',c.id) }
  set({callPrev:null}) },
 requestMeet:(id)=>{ if(get().people[id].presence==='offline')return; set({meetReq:id}) },
 }},{
  name:'lexon-office-v5', storage:createJSONStorage(()=>localStorage), skipHydration:true, version:1,
  partialize:(s)=>({people:s.people,tasks:s.tasks,messages:s.messages,unread:s.unread,activity:s.activity.slice(0,120),notifications:s.notifications,settings:s.settings,schedule:s.schedule,extraNodes:s.extraNodes,calls:s.calls}) as any,
  merge:(p:any,c)=>({...c,...p,settings:{...DEFAULT_SETTINGS,...(p?.settings||{})}}),
}))
