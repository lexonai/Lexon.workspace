'use client'
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useOffice } from '@/store/officeStore'
import { world, seat, ensureWorld } from '@/3d/world'
import { moveTo } from '@/3d/move'
/** Plays the active task in the 3D office: Manager → employees → Manager, with real hand-offs. Pipeline/AI runs separately (store.pump / backend). */
export function Sim(){
  const S=useRef({id:'',step:0,phase:'work',t:0,entered:false,pr:-1,idle:0,fin:0})
  useFrame((_,dt0)=>{
    const dt=Math.min(dt0,0.1),k=S.current,o=useOffice.getState(); if(!o.ready)return
    let task=o.tasks.find((t:any)=>t.id===k.id)
    if(!task||task.status==='done'||task.status==='queued'||task.status==='blocked'){
      if(task&&task.status==='done'&&k.fin===0){ k.fin=1; for(const c of task.chain)if(o.people[c]&&o.people[c].state!=='WALKING')o.setState(c,'COMPLETED','Task delivered') ; setTimeout(()=>{for(const c of task.chain){const p=useOffice.getState().people[c];if(p&&p.state==='COMPLETED')useOffice.getState().setState(c,'IDLE','Ready for tasks')}},4000) }
      k.id='';k.idle+=dt; if(k.idle>1){k.idle=0;o.pump()}
      const nt=o.tasks.find((t:any)=>t.status==='working'||t.status==='review'); if(nt){Object.assign(k,{id:nt.id,step:0,phase:'work',t:0,entered:false,pr:-1,fin:0});task=nt;o.set({vis:{id:nt.id,step:0}})} else return }
    const ch:string[]=task.chain,cur=ch[k.step],nx=ch[k.step+1],name=(i:string)=>o.people[i]?.name.split(' ')[0]||i,WORK=7
    if(o.busyIds.includes(cur)||(nx&&o.busyIds.includes(nx))||!o.people[cur])return
    ensureWorld(cur); if(nx)ensureWorld(nx)
    if(k.phase==='work'){
      const last=!nx
      if(!k.entered){k.entered=true;o.setState(cur,k.step===0||last?'READING':'TYPING',k.step===0?'Reading owner request':last?'Reviewing final output':task.title);o.log(`${name(cur)} ${k.step===0?'received the request':last?'is reviewing the output':'started work'}`,'task',cur)}
      if(last&&task.status==='working'){ o.setState(cur,'READING','Waiting for output'); }
      else k.t+=dt
      const pr=Math.round((k.step+Math.min(k.t/WORK,1))/ch.length*100)
      if(pr!==k.pr&&pr<100){k.pr=pr;o.setTaskProgress(task.id,pr);o.set({people:{...useOffice.getState().people,[cur]:{...useOffice.getState().people[cur],progress:Math.min(100,Math.round(k.t/WORK*100))}}})}
      if(k.t>WORK){
        if(last){ if(task.status==='review'&&!o.backend.connected)o.deliverTask(task.id); return }
        k.phase='walk';o.setState(cur,'WALKING',`Handing work to ${name(nx)}`)
      }
    } else if(k.phase==='walk'){
      const s=seat(nx); if(moveTo(cur,s.x+1.1,s.z,dt,-Math.PI/2)){k.phase='hand';k.t=0;o.setState(cur,'TALKING');o.setState(nx,'TALKING');o.addHandoff(task.id,`${name(cur)} → ${name(nx)}`);o.log(`${name(cur)} handed "${task.title}" to ${name(nx)}`,'task',cur)}
    } else if(k.phase==='hand'){
      k.t+=dt; if(k.t>2.2){k.phase='back';o.setState(cur,'WALKING','Returning to desk');o.setState(nx,'READING','Reading incoming work')}
    } else if(k.phase==='back'){
      const s=seat(cur); if(moveTo(cur,s.x,s.z,dt,s.ry)){o.setState(cur,'IDLE','Waiting for review');k.step++;k.phase='work';k.t=0;k.entered=false;o.set({vis:{id:task.id,step:k.step}})}
    }
  })
  return null
}
