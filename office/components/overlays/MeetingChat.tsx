'use client'
import { useState } from 'react'
import { useOffice } from '@/store/officeStore'
import { world } from '@/3d/world'
import { roomAt } from '@/3d/layout'
import { postAI } from '@/lib/ai-client'
import { speak } from '@/lib/voice'
/** Shown while you stand in the Conference/Meeting room in Free Walk: address the meeting; the manager and workers answer (AI). */
export default function MeetingChat(){
  const o=useOffice(); const [v,setV]=useState(''),[note,setNote]=useState(''),[busy,setBusy]=useState(false)
  if(!o.meetingRoom)return null
  const send=async()=>{ const text=v.trim(); if(!text)return; setV(''); if(!o.backend.connected||!o.ai.keys){setNote('AI is not connected — ask an Admin to add a key in Lexon Workspace > Integrations > Lexon Office');return}; setBusy(true);setNote('')
    try{ const ids=Object.keys(world).filter(i=>roomAt(world[i].x,world[i].z)===o.meetingRoom); const r=await postAI('/api/ai/meeting',{room:o.meetingRoom,ids,text}); if(r.notice)setNote(r.notice)
      ;(r.lines||[]).forEach((l:any,i:number)=>setTimeout(()=>{const s=useOffice.getState();s.say(l.id,l.text,6000);if(s.settings.voiceEnabled)speak(s.people[l.id],l.text)},i*3200)) }catch(e:any){setNote(e.message)}; setBusy(false) }
  return <div className="mchat"><small>You are in the {o.meetingRoom} room — speak to the team</small><div className="composer"><input value={v} disabled={busy} placeholder="Say something to the meeting…" onChange={e=>setV(e.target.value)} onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter')send()}}/><button className="pri" disabled={busy} onClick={send}>{busy?'…':'Send'}</button></div>{note&&<small style={{color:'var(--y)'}}>{note}</small>}</div>
}
