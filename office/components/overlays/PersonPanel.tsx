'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useOffice, convOf } from '@/store/officeStore'
import { ROOMS } from '@/config/office.config'
import { ago, STATUS_LABEL } from '@/lib/ui'
import { moodKey } from '@/lib/mood'
import Avatar from '../ui/Avatar'
function MiniChat({p}:{p:any}){
  const o=useOffice(),conv=convOf(p),msgs=(o.messages[conv]||[]).slice(-14); const [v,setV]=useState(''); const end=useRef<HTMLDivElement>(null)
  useEffect(()=>{end.current?.scrollIntoView({block:'end'})},[msgs.length,o.streaming?.text])
  const send=()=>{if(v.trim()){o.sendOwner(conv,v.trim());setV('')}}
  return <div className="mini"><div className="msgs">{msgs.map((m:any,i:number)=>m.system?<small key={i} className="note">{m.text}</small>:<div key={i} className={'bub '+(m.from==='owner'?'me':'')}><div className="bt">{m.text}</div><small>{ago(m.t)}</small></div>)}
    {o.streaming?.conv===conv&&<div className="bub"><div className="bt">{o.streaming.text||<span className="typing">● ● ●</span>}</div></div>}<div ref={end}/></div>
    <div className="composer"><input value={v} placeholder={`Message ${p.name.split(' ')[0]}…`} onChange={e=>setV(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()}/><button className="pri" onClick={send}>Send</button></div></div>
}
/** Side interaction panel for the selected worker. Call goes straight to a voice call. */
export default function PersonPanel(){
  const o=useOffice(),router=useRouter(); const p:any=o.selected?o.people[o.selected]:null; const [tab,setTab]=useState('Task')
  useEffect(()=>setTab('Task'),[o.selected]); const mood=useOffice(s=>moodKey(p,s.tasks)).split('|')[0]
  if(!p)return null; const off=p.presence==='offline',mine=o.tasks.filter((t:any)=>t.chain.includes(p.id)&&t.status!=='done')
  return <aside className="pp fade"><div className="pph"><Avatar p={p} size={44}/><div><b>{p.name}</b><small className="mut">{p.role}</small><small>{p.presence}{mood?` · ${mood}`:''}</small></div><button className="ghost" onClick={()=>o.set({selected:null})}>✕</button></div>
    <div className="acts"><button className="pri big" disabled={off} onClick={()=>o.startCall(p.id)}>📞 Call</button><button onClick={()=>o.set({mode:'follow',follow:p.id})}>Follow</button><button onClick={()=>o.requestMeet(p.id)}>Talk in person</button></div>
    <div className="tabs">{['Task','Chat','Profile'].map(t=><button key={t} className={tab===t?'on':''} onClick={()=>setTab(t)}>{t}</button>)}</div>
    {tab==='Task'&&<div><div className="card"><small>Current task</small><b>{p.task}</b><div className="bar"><div style={{width:p.progress+'%'}}/></div><small>{p.progress}% · {String(p.state).toLowerCase()} · {ROOMS.find(r=>r.id===p.room)?.name}</small></div>
      {mine.map((t:any)=><div key={t.id} className="trow" onClick={()=>router.push('/tasks')}><b>{t.title}</b><small className="mut">{STATUS_LABEL[t.status]} · {t.progress}%</small></div>)}</div>}
    {tab==='Chat'&&<MiniChat p={p}/>}
    {tab==='Profile'&&<div className="kv"><span>Department</span><b>{p.dept}</b><span>Skills</span><b>{(p.skills||[]).join(', ')||'—'}</b><span>Knowledge</span><b>{(p.knowledge||[]).join(' · ')||'—'}</b><span>Reports to</span><b>{p.reportsTo?o.people[p.reportsTo]?.name:'Owner'}</b></div>}</aside>
}
