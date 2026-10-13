'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useOffice } from '@/store/officeStore'
import { CAMS, ROOMS, ROOM_CAM } from '@/config/office.config'
import { previewCanvases } from '../camera/previewRegistry'
import { world } from '@/3d/world'
import WorkflowGraph from '../workflow/WorkflowGraph'
import Avatar from '../ui/Avatar'
import { ago, STATUS_LABEL } from '@/lib/ui'
import { Kpis } from '../analytics/Analytics'
const TABS=['Activity','Tasks','Workflow','Schedule','Rooms','Analytics'] as const
function roomAt(x:number,z:number){ return ROOMS.find(r=>Math.abs(x-r.x)<=r.w/2&&Math.abs(z-r.z)<=r.d/2)?.id }
function RoomsTab(){
  const o=useOffice(),[,setT]=useState(0); useEffect(()=>{const i=setInterval(()=>setT(t=>t+1),1500);return()=>clearInterval(i)},[])
  return <div><div className="acts" style={{marginBottom:8}}><select style={{width:'auto'}} value="" onChange={e=>{if(e.target.value){o.roomCall(e.target.value);o.set({focusCam:ROOM_CAM[e.target.value]||'cam1',camId:ROOM_CAM[e.target.value]||'cam1',mode:'live'})}}}><option value="">📣 Call everyone to…</option>{ROOMS.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></div><div className="rooms">{ROOMS.map(r=>{ const here=Object.values(o.people).filter((p:any)=>{const w=world[p.id];return (w?roomAt(w.x,w.z):p.room)===r.id}) as any[]
    return <button key={r.id} className="roomc" onClick={()=>o.set({focusCam:ROOM_CAM[r.id],camId:ROOM_CAM[r.id],mode:'live'})}><div><b>{r.name}</b><small className="mut">{here.length} people · {here.some(p=>/WORKING|TYPING/.test(p.state))?'Active':here.some(p=>p.state==='MEETING'||p.state==='TALKING')?'In discussion':here.length?'Quiet':'Empty'}</small></div><div className="stack">{here.slice(0,6).map(p=><Avatar key={p.id} p={p} size={24} dot={false}/>)}</div></button>})}</div></div>
}
export default function OfficePage(){
  const o=useOffice(),router=useRouter(); const [tab,setTab]=useState<typeof TABS[number]>('Activity')
  const today=new Date().toISOString().slice(0,10),custom=o.schedule.custom.filter((e:any)=>e.date===today)
  const rooms=(id:string)=>Object.values(o.people).filter((p:any)=>p.room===CAMS.find(c=>c.id===id)?.name.replace(' Room','').toLowerCase().replace('development','dev').replace('main floor','main').replace('break area','break')).length
  if(o.focusCam) return null
  return <div className="office fade"><div className="camgrid">{CAMS.map((c,i)=><button key={c.id} className="tile" style={{animationDelay:i*40+'ms'}} onClick={()=>o.set({focusCam:c.id,camId:c.id,mode:'live'})}>
      <canvas width={480} height={270} ref={el=>{ if(el)previewCanvases.set(c.id,el); else previewCanvases.delete(c.id) }}/>
      <span className="tl"><i className="blink"/>{c.label} — {c.name}</span><span className="tr">LIVE</span></button>)}<div className="tile statc"><b>Control room</b><div className="kpis" style={{gridTemplateColumns:'1fr 1fr'}}><div className="kpi"><small>Online</small><b>{Object.values(o.people).filter((p:any)=>p.presence==='online').length}/{Object.keys(o.people).length}</b></div><div className="kpi"><small>Open tasks</small><b>{o.tasks.filter((t:any)=>t.status!=='done').length}</b></div><div className="kpi"><small>AI</small><b>{o.ai.keys?o.ai.keys+' key'+(o.ai.keys>1?'s':''):'not set'}</b></div><div className="kpi"><small>Voice</small><b>{o.ai.tts?'server':'browser'}</b></div></div><small className="mut">Feeds are live 3D renders (no video decoding).</small></div></div>
    <div className="dash"><div className="tabs">{TABS.map(t=><button key={t} className={tab===t?'on':''} onClick={()=>setTab(t)}>{t}</button>)}</div>
     <div className="dbody">
      {tab==='Activity'&&<div className="cols">{o.activity.slice(0,14).map((a:any)=><div key={a.id} className="act"><small>{ago(a.t)}</small>{a.text}</div>)}</div>}
      {tab==='Tasks'&&<div className="cols">{o.tasks.length===0&&<small className="mut">No tasks yet — create one from Tasks or tell the Manager in Chat.</small>}{[...o.tasks].reverse().slice(0,10).map((t:any)=><div key={t.id} className="trow" onClick={()=>router.push('/tasks')}><b>{t.title}</b><small className="mut">{o.people[t.assignee]?.name.split(' ')[0]} · {STATUS_LABEL[t.status]} · {t.progress}%</small><div className="bar"><div style={{width:t.progress+'%'}}/></div></div>)}</div>}
      {tab==='Workflow'&&<WorkflowGraph compact/>}
      {tab==='Schedule'&&<div className="cols">{[...o.schedule.base.map((b:any)=>({...b,k:'Daily'})),...custom.map((e:any)=>({...e,k:'Today'}))].sort((a:any,b:any)=>a.time.localeCompare(b.time)).map((e:any)=><div key={e.id} className="act"><small>{e.time} · {e.kind} · {e.k}</small>{e.title}</div>)}</div>}
      {tab==='Rooms'&&<RoomsTab/>}{tab==='Analytics'&&<Kpis/>}</div></div></div>
}
