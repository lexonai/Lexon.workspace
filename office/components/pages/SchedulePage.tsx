'use client'
import { useState } from 'react'
import { useOffice } from '@/store/officeStore'
import { uid, todayStr } from '@/shared/engine.mjs'
export default function SchedulePage(){
  const o=useOffice(); const [day,setDay]=useState(todayStr()); const [b,setB]=useState({time:'09:00',title:'',kind:'Work'}),[c,setC]=useState<any>({time:'10:00',title:'',kind:'Task',assignee:''})
  const custom=o.schedule.custom.filter((e:any)=>e.date===day).sort((a:any,b:any)=>a.time.localeCompare(b.time))
  return <div className="page fade"><div className="ph"><div><h2>Schedule</h2><small className="mut">Daily base schedule repeats; custom actions belong to one day only</small></div></div>
   <div className="two-col"><section className="card2"><h3>Daily base schedule</h3>{[...o.schedule.base].sort((a:any,b:any)=>a.time.localeCompare(b.time)).map((e:any)=><div key={e.id} className="srow"><b>{e.time}</b><span>{e.title}</span><small className="mut">{e.kind}</small><button className="ghost" onClick={()=>o.set({schedule:{...o.schedule,base:o.schedule.base.filter((x:any)=>x.id!==e.id)}})}>✕</button></div>)}
     <div className="comp"><input type="time" value={b.time} onChange={e=>setB({...b,time:e.target.value})}/><input value={b.title} placeholder="Meeting / break / routine" onChange={e=>setB({...b,title:e.target.value})}/><select value={b.kind} onChange={e=>setB({...b,kind:e.target.value})}>{['Work','Meeting','Break'].map(x=><option key={x}>{x}</option>)}</select><button className="pri" onClick={()=>{if(b.title.trim()){o.set({schedule:{...o.schedule,base:[...o.schedule.base,{id:uid('b'),...b,title:b.title.trim()}]}});setB({...b,title:''})}}}>Add</button></div></section>
    <section className="card2"><div className="ph" style={{margin:0}}><h3>Custom actions</h3><input type="date" value={day} onChange={e=>setDay(e.target.value)}/></div>
     {custom.length===0&&<small className="mut">No custom actions on this day.</small>}{custom.map((e:any)=><div key={e.id} className="srow"><b>{e.time}</b><span>{e.title}{e.assignee&&<small className="mut"> → {o.people[e.assignee]?.name.split(' ')[0]}</small>}</span><small className={e.firedAt?'ok':'mut'}>{e.kind}{e.firedAt?' ✓':''}</small><button className="ghost" onClick={()=>o.set({schedule:{...o.schedule,custom:o.schedule.custom.filter((x:any)=>x.id!==e.id)}})}>✕</button></div>)}
     <div className="form tight"><div className="two"><input type="time" value={c.time} onChange={e=>setC({...c,time:e.target.value})}/><select value={c.kind} onChange={e=>setC({...c,kind:e.target.value})}>{['Task','Announcement','Meeting','Deadline'].map(x=><option key={x}>{x}</option>)}</select></div>
      <input value={c.title} placeholder="e.g. Rohit thumbnail banaye / Everyone in Meeting Room" onChange={e=>setC({...c,title:e.target.value})}/>
      {c.kind==='Task'&&<select value={c.assignee} onChange={e=>setC({...c,assignee:e.target.value})}><option value="">Manager auto-assigns</option>{Object.values(o.people).filter((p:any)=>!p.isManager).map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}</select>}
      <button className="pri" onClick={()=>{if(c.title.trim()){o.set({schedule:{...o.schedule,custom:[...o.schedule.custom,{id:uid('c'),date:day,...c,title:c.title.trim(),assignee:c.assignee||undefined}]}});setC({...c,title:''})}}}>Add for {day===todayStr()?'today':day}</button></div></section></div></div>
}
