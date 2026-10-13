'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useOffice, convOf } from '@/store/officeStore'
import { ROOMS } from '@/config/office.config'
import { ago, STATUS_LABEL, SC } from '@/lib/ui'
import Avatar from '../ui/Avatar'
import Modal from '../ui/Modal'
function AddEmployee({onClose}:{onClose:()=>void}){
  const o=useOffice(); const [f,setF]=useState<any>({name:'',role:'',gender:'male',room:'main',skills:'',instructions:'',knowledge:'',tools:''})
  const set=(k:string,v:any)=>setF({...f,[k]:v}); const list=(s:string)=>s.split(/[,\n]/).map(x=>x.trim()).filter(Boolean)
  return <Modal title="Add employee" onClose={onClose}><div className="form">
    <label>Name<input value={f.name} onChange={e=>set('name',e.target.value)} autoFocus/></label><label>Role<input value={f.role} onChange={e=>set('role',e.target.value)} placeholder="e.g. Video Editor"/></label>
    <div className="two"><label>Gender (voice)<select value={f.gender} onChange={e=>set('gender',e.target.value)}><option value="male">Male</option><option value="female">Female</option></select></label>
    <label>Room<select value={f.room} onChange={e=>set('room',e.target.value)}>{ROOMS.filter(r=>['dev','youtube','content','main'].includes(r.id)).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label></div>
    <label>Skills (comma separated)<input value={f.skills} onChange={e=>set('skills',e.target.value)}/></label><label>Tools<input value={f.tools} onChange={e=>set('tools',e.target.value)} placeholder="Web search, YouTube API…"/></label>
    <label>Knowledge (one per line)<textarea rows={3} value={f.knowledge} onChange={e=>set('knowledge',e.target.value)}/></label><label>Instructions / behavior<textarea rows={3} value={f.instructions} onChange={e=>set('instructions',e.target.value)}/></label>
    <small className="mut">New employees are automatically available in People, Tasks, Workflow, Chat and report to the Manager. A desk is assigned in the 3D office.</small>
    <button className="pri" disabled={!f.name.trim()} onClick={()=>{o.addEmployee({...f,skills:list(f.skills),tools:list(f.tools),knowledge:list(f.knowledge)});onClose()}}>Add employee</button></div></Modal>
}
function Detail({id,onClose}:{id:string;onClose:()=>void}){
  const o=useOffice(),router=useRouter(),p:any=o.people[id]; const [tab,setTab]=useState('Present'); const [ins,setIns]=useState(p.instructions||'')
  const mine=o.tasks.filter((t:any)=>t.chain.includes(id)&&!o.people[id].isManager||t.assignee===id)
  const past=mine.filter((t:any)=>t.status==='done'),present=mine.filter((t:any)=>t.status==='working'||t.status==='review'),future=mine.filter((t:any)=>t.status==='queued'||t.status==='blocked')
  const todayEv=o.schedule.custom.filter((e:any)=>e.date===new Date().toISOString().slice(0,10)&&(!e.assignee||e.assignee===id))
  const TL=(l:any[])=>l.length?l.map((t:any)=><div key={t.id} className="trow"><b>{t.title}</b><small className="mut">{STATUS_LABEL[t.status]} · {t.progress}%</small>{t.output&&<small>Output ready</small>}</div>):<small className="mut">Nothing here.</small>
  return <Modal title={p.name} wide onClose={onClose}><div className="pd"><div className="pdh"><Avatar p={p} size={56}/><div><b>{p.name}</b><div className="mut">{p.role}</div><span className="badge" style={{borderColor:SC[p.presence],color:SC[p.presence]}}>{p.presence==='busy'?'Busy':p.presence==='away'?'Away':p.presence==='offline'?'Offline':'Online'}</span></div>
    <div className="acts"><button disabled={p.presence==='offline'} onClick={()=>{o.markRead(convOf(p));router.push('/chat')}}>Chat</button><button disabled={p.presence==='offline'} onClick={()=>o.startCall(id)}>Call</button><button onClick={()=>{o.set({selected:id,mode:'follow',follow:id,focusCam:'cam1',camId:'cam1'});router.push('/office')}}>Follow in office</button><button onClick={()=>o.requestMeet(id)}>Talk in person</button></div></div>
    <div className="kv"><span>Current activity</span><b>{p.state.charAt(0)+p.state.slice(1).toLowerCase()}</b><span>Current task</span><b>{p.task}</b><span>On screen</span><b>{p.app||'—'}</b><span>Location</span><b>{ROOMS.find(r=>r.id===p.room)?.name}</b></div>
    <div className="tabs">{['Past','Present','Future','Outputs','Profile'].map(t=><button key={t} className={tab===t?'on':''} onClick={()=>setTab(t)}>{t}</button>)}</div>
    <div className="pdb">{tab==='Past'&&<>{TL(past)}<h4>Recent activity</h4>{o.activity.filter((a:any)=>a.pid===id).slice(0,8).map((a:any)=><div key={a.id} className="act"><small>{ago(a.t)}</small>{a.text}</div>)}</>}
     {tab==='Present'&&TL(present)}{tab==='Future'&&<>{TL(future)}{todayEv.map((e:any)=><div key={e.id} className="act"><small>{e.time} · {e.kind}</small>{e.title}</div>)}</>}
     {tab==='Outputs'&&(mine.filter((t:any)=>t.output).length?mine.filter((t:any)=>t.output).map((t:any)=><div key={t.id} className="trow"><b>{t.title}</b>{t.output.imageUrl&&<img className="thumbimg" src={t.output.imageUrl} alt=""/>}<pre>{t.output.text.slice(0,500)}</pre></div>):<small className="mut">No outputs yet.</small>)}
     {tab==='Profile'&&<div className="kv"><span>Skills</span><b>{(p.skills||[]).join(', ')||'—'}</b><span>Tools</span><b>{(p.tools||[]).join(', ')||'—'}</b><span>Knowledge</span><b>{(p.knowledge||[]).join(' · ')||'—'}</b><span>Instructions</span><b><textarea rows={3} value={ins} onChange={e=>setIns(e.target.value)} onBlur={()=>o.set({people:{...o.people,[id]:{...p,instructions:ins}}})}/></b><span>Reports to</span><b>{p.reportsTo?o.people[p.reportsTo]?.name:'Owner'}</b></div>}</div></div></Modal>
}
export default function PeoplePage(){
  const o=useOffice(); const [open,setOpen]=useState<string|null>(null),[add,setAdd]=useState(false),[tab,setTab]=useState('Team')
  const list=Object.values(o.people) as any[]
  return <div className="page fade"><div className="ph"><div><h2>People</h2><div className="tabs" style={{marginTop:8}}>{['Team'].map(t=><button key={t} className={tab===t?'on':''} onClick={()=>setTab(t)}>{t}</button>)}</div><small className="mut">{list.filter(p=>p.presence==='online').length} online · {list.length} total</small></div>{tab==='Team'&&<button className="pri" onClick={()=>setAdd(true)}>+ Add employee</button>}</div>
    {<div className="cards">{list.map((p,i)=><button key={p.id} className="pc" style={{animationDelay:i*30+'ms'}} onClick={()=>setOpen(p.id)}><Avatar p={p} size={56}/><b>{p.name}</b><span className="mut">{p.role}</span></button>)}</div>}
    {open&&<Detail id={open} onClose={()=>setOpen(null)}/>}{add&&<AddEmployee onClose={()=>setAdd(false)}/>}</div>
}
