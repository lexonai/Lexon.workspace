'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useOffice } from '@/store/officeStore'
import { ago } from '@/lib/ui'
export default function OfficeHeader(){
  const o=useOffice(),router=useRouter(); const [q,setQ]=useState(''),[now,setNow]=useState(''),[bell,setBell]=useState(false)
  useEffect(()=>{const f=()=>setNow(new Date().toLocaleString([], {weekday:'short',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}));f();const i=setInterval(f,20000);return()=>clearInterval(i)},[])
  const go=()=>{const t=q.trim().toLowerCase(); if(!t)return; const p=Object.values(o.people).find((p:any)=>p.name.toLowerCase().includes(t)||p.role.toLowerCase().includes(t)); if(p){o.set({selected:(p as any).id});router.push('/people');setQ('')}}
  const unread=o.notifications.filter((n:any)=>!n.read).length
  return <header className="top"><span className="live"><i className="blink"/>LIVE</span><span className="mut hide-m">{o.backend.connected?'Backend connected':'Local mode'}</span>
    <input className="search" value={q} placeholder="Search people, roles…" onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&go()}/>
    <span className="mut hide-m">{now}</span>
    <div className="bellw"><button className="ghost bell" onClick={()=>{setBell(!bell)}}>🔔{unread>0&&<em>{unread}</em>}</button>
     {bell&&<div className="drop"><div className="dh"><b>Notifications</b><button className="ghost" onClick={()=>o.set({notifications:o.notifications.map((n:any)=>({...n,read:true}))})}>Mark read</button></div>{o.notifications.length===0&&<small className="mut">Nothing yet</small>}{o.notifications.slice(0,12).map((n:any)=><div key={n.id} className={'ni '+(n.read?'':'new')}><small>{ago(n.t)}</small>{n.text}</div>)}</div>}</div>
    <span className="me">AK</span></header>
}
