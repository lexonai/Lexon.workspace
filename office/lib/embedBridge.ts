'use client'
import { useOffice } from '@/store/officeStore'
/** postMessage bridge for hosting inside another app (e.g. LEXON WORKSPACE). No host imports. See integration/README.md. */
export function startBridge(push:(path:string)=>void){
  if(typeof window==='undefined'||window.parent===window)return()=>{}
  const allowed=(process.env.NEXT_PUBLIC_ALLOWED_PARENT_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean)
  const ok=(o:string)=>allowed.includes('*')||allowed.includes(o)||(allowed.length===0&&o===location.origin)
  const targets=allowed.length?allowed:[location.origin]
  const send=(m:any)=>targets.forEach(t=>{try{window.parent.postMessage({source:'lexon-office',v:1,...m},t)}catch{}})
  const snap=()=>{const s=useOffice.getState();return {people:Object.values(s.people).map((p:any)=>({id:p.id,name:p.name,role:p.role,presence:p.presence,state:p.state,task:p.task})),tasks:s.tasks.map((t:any)=>({id:t.id,title:t.title,status:t.status,progress:t.progress,assignee:t.assignee})),unread:Object.values(s.unread).reduce((a:number,b:any)=>a+b,0),generatedAt:new Date().toISOString()}}
  send({type:'office.ready',version:'2.0'})
  const onMsg=(e:MessageEvent)=>{ if(e.source!==window.parent||!ok(e.origin))return; const d=e.data; if(!d||d.target!=='lexon-office')return; const s=useOffice.getState()
    switch(d.type){
      case 'office.task.request': if(typeof d.title==='string'&&d.title.trim())s.createTask({title:d.title.trim().slice(0,2000),priority:d.priority||'normal'}); break
      case 'office.chat.send': if(typeof d.text==='string')s.sendOwner('manager',d.text.slice(0,4000)); break
      case 'office.navigate': if(/^[a-z-]+$/.test(d.section||''))push('/'+d.section); break
      case 'office.camera.focus': s.set({focusCam:d.cameraId,camId:d.cameraId,mode:'live'}); push('/office'); break
      case 'office.person.focus': if(s.people[d.personId]){s.set({selected:d.personId,mode:'follow',follow:d.personId,focusCam:'cam1',camId:'cam1'});push('/office')} break
      case 'office.mode.set': if(['live','tour','walk','free'].includes(d.mode)){s.set({mode:d.mode,focusCam:d.mode==='live'?null:'cam1',camId:'cam1'});push('/office')} break
      case 'office.room.call': s.roomCall(String(d.room),Array.isArray(d.ids)&&d.ids.length?d.ids:'all'); push('/office'); break
      case 'office.call.start': if(s.people[d.personId])s.startCall(d.personId); break
      case 'office.snapshot.request': send({type:'office.snapshot',data:snap(),id:d.id}); break } }
  window.addEventListener('message',onMsg)
  let prev=useOffice.getState()
  const unsub=useOffice.subscribe(cur=>{
    for(const t of cur.tasks as any[]){const o=(prev.tasks as any[]).find(x=>x.id===t.id); if(!o)send({type:'office.task.created',taskId:t.id,title:t.title}); else if(o.status!==t.status){send({type:t.status==='done'?'office.task.completed':'office.task.status',taskId:t.id,status:t.status})}
      if(t.handoffs.length>(o?.handoffs.length||0))send({type:'office.task.handoff',taskId:t.id,handoff:t.handoffs[t.handoffs.length-1]})}
    for(const [id,p] of Object.entries(cur.people) as any){const o=(prev.people as any)[id]; if(o&&o.presence!==p.presence)send({type:'office.person.presence',personId:id,presence:p.presence})}
    if(cur.playerRoom!==prev.playerRoom&&cur.playerRoom)send({type:'office.room.entered',room:cur.playerRoom})
    if(cur.meetingRoom!==prev.meetingRoom&&cur.meetingRoom)send({type:'office.meeting.started',room:cur.meetingRoom})
    if(cur.callState&&!prev.callState)send({type:'office.call.started',personId:cur.callState.id}); else if(!cur.callState&&prev.callState)send({type:'office.call.ended',personId:prev.callState.id})
    if(cur.ai.keys!==prev.ai.keys||cur.ai.tts!==prev.ai.tts||cur.ai.stt!==prev.ai.stt)send({type:'office.ai.status',keys:cur.ai.keys,tts:!!cur.ai.tts,stt:!!cur.ai.stt})
    const un=Object.values(cur.unread).reduce((a:number,b:any)=>a+b,0),up=Object.values(prev.unread).reduce((a:number,b:any)=>a+b,0); if(un!==up)send({type:'office.unread',count:un})
    if((cur.notifications as any[])[0]?.id!==(prev.notifications as any[])[0]?.id&&cur.notifications[0])send({type:'office.notification',text:(cur.notifications as any[])[0].text})
    prev=cur })
  return()=>{window.removeEventListener('message',onMsg);unsub()}
}
