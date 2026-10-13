'use client'
import { useEffect, useState } from 'react'
import { useOffice } from '@/store/officeStore'
import { rtc } from '@/lib/rtc'
import WindowFrame from './WindowFrame'
/** Callee side of a live voice call (shown on the client signed in as an employee, or the owner when an employee calls). */
export default function IncomingCall(){
  const [inc,setInc]=useState<string|null>(null),[live,setLive]=useState<string|null>(null),[muted,setMuted]=useState(false)
  useEffect(()=>{
    const a=rtc.on('incoming',d=>setInc(d.from))
    const b=rtc.on('connected',d=>{ if(useOffice.getState().callState)return; setInc(null); setLive(d.peer); if(useOffice.getState().people[rtc.me])useOffice.getState().setState(rtc.me as any,'CALLING','On a call') })
    const c=rtc.on('ended',()=>{ if(useOffice.getState().callState)return; setInc(null); setLive(null); setMuted(false); if(useOffice.getState().people[rtc.me])useOffice.getState().setState(rtc.me as any,'IDLE','Call ended') })
    return()=>{a();b();c()}
  },[])
  const name=(id:string)=>useOffice.getState().people[id]?.name||'Owner'
  if(inc) return <WindowFrame fixed title={name(inc)} sub="Incoming call" init={{x:120,y:90}} w={260} onClose={()=>{rtc.decline();setInc(null)}}>
    <div className="call"><div className="av big">{name(inc)[0]}</div><b>{name(inc)}</b><small>● Calling you…</small><div className="acts" style={{justifyContent:'center'}}><button className="pri" onClick={()=>rtc.accept()}>Accept</button><button className="end" onClick={()=>{rtc.decline();setInc(null)}}>Decline</button></div></div></WindowFrame>
  if(live) return <WindowFrame fixed title={name(live)} sub="Live voice" init={{x:120,y:90}} w={260} onClose={()=>rtc.hangup()}>
    <div className="call"><div className="av big">{name(live)[0]}</div><b>{name(live)}</b><small>● Connected</small><div className="acts" style={{justifyContent:'center'}}><button className={muted?'on':''} onClick={()=>{rtc.mute(!muted);setMuted(!muted)}}>{muted?'🔇 Unmute':'🎙 Mute'}</button><button className="end" onClick={()=>rtc.hangup()}>✕ End</button></div></div></WindowFrame>
  return null
}
