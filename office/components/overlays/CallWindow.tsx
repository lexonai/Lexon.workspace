'use client'
import { useEffect, useRef, useState } from 'react'
import { useOffice, convOf, NO_AI_NOTICE } from '@/store/officeStore'
import { rtc } from '@/lib/rtc'
import { listen } from '@/lib/voice'
import { startVAD, transcribe } from '@/lib/recorder'
import { playRing } from '@/lib/ringtone'
import { greetingFor } from '@/lib/greetings'
import { speakAI, stopAI, isSpeaking, lastWasServer, outAnalyser } from '@/lib/voiceAI'
import { streamChat } from '@/lib/ai-client'
import { employeeCam } from '../camera/previewRegistry'
import WindowFrame from './WindowFrame'
type Ph='ringing'|'listening'|'thinking'|'speaking'
/** Direct voice call. You speak → server speech-to-text → AI reply streamed → spoken with the worker's own voice. Waveform is real audio (your mic / the worker's voice). */
export default function CallWindow(){
  const o=useOffice(); const c=o.callState
  const [phase,setPhase]=useState<Ph>('ringing'),[line,setLine]=useState(''),[you,setYou]=useState(''),[muted,setMuted]=useState(false),[txt,setTxt]=useState(''),[err,setErr]=useState(''),[sec,setSec]=useState(0)
  const ph=useRef<Ph>('ringing'),mutedRef=useRef(false),wave=useRef<HTMLCanvasElement>(null),vad=useRef<any>(null),rec=useRef<any>(null),done=useRef(true)
  const setP=(p:Ph)=>{ph.current=p;setPhase(p);vad.current?.pause(p!=='listening'||mutedRef.current)}
  mutedRef.current=muted
  useEffect(()=>{ if(!c||c.status!=='calling'||c.mode!=='ai')return; setP('ringing'); let off=false; const r=playRing(); r.done.then(ok=>{ if(ok&&!off)useOffice.getState().connectCall() }); return()=>{off=true;r.stop()} },[c?.status,c?.id])
  useEffect(()=>{ if(!c||c.mode!=='voice')return; const a=rtc.on('connected',()=>useOffice.getState().connectCall()),b=rtc.on('ended',()=>useOffice.getState().endCall()),d=rtc.on('declined',()=>useOffice.getState().endCall()),e=rtc.on('error',()=>useOffice.getState().endCall()); return()=>{a();b();d();e()} },[c?.id,c?.mode])
  useEffect(()=>{ rtc.mute(muted); vad.current?.pause(muted||ph.current!=='listening') },[muted])
  useEffect(()=>{ if(c?.status!=='connected'){setSec(0);return} const i=setInterval(()=>setSec(s=>s+1),1000); return()=>clearInterval(i)},[c?.status])
  const ask=async(text:string)=>{ const s=useOffice.getState(),cs=s.callState; if(!cs||!text.trim())return; const emp=s.people[cs.id]; setYou(text); setLine(''); setErr(''); setP('thinking'); done.current=false
    if(!s.backend.connected){setErr(NO_AI_NOTICE);setP('listening');return}
    let buf='',spoke=false; const idle=()=>{if(done.current&&!isSpeaking())setP('listening')}
    const flush=(t:string)=>{const x=t.trim();if(!x)return;spoke=true;setP('speaking');if(s.settings.voiceEnabled)speakAI(emp,x,idle)}
    try{ await streamChat({conv:convOf(emp),text,voice:true},{onDelta:d=>{buf+=d;setLine(l=>l+d);const m=buf.match(/^([\s\S]*?[.!?।\n]+)\s+([\s\S]*)$/);if(m){flush(m[1]);buf=m[2]}},onNotice:n=>setErr(n)}); flush(buf) }catch(e:any){setErr(e.message)}
    done.current=true; if(!spoke||!isSpeaking()||!s.settings.voiceEnabled)setP('listening') }
  useEffect(()=>{ if(c?.status!=='connected'||c.mode!=='ai')return; let dead=false; const s=useOffice.getState(); const emp0=s.people[c.id]; const gr=greetingFor(emp0); setLine(gr); setP('speaking'); done.current=true; if(s.settings.voiceEnabled)speakAI(emp0,gr,()=>{if(!dead)setP('listening')}); else setP('listening')
    ;(async()=>{ if(s.backend.connected&&s.ai.stt){ try{ vad.current=await startVAD(async b=>{ if(ph.current!=='listening'||mutedRef.current)return; try{const t=await transcribe(b);if(t)ask(t)}catch(e:any){setErr(e.message)} }); if(dead)vad.current.stop(); else vad.current.pause(false) }catch{setErr('Microphone unavailable — type below')} }
      else { rec.current=listen(t=>{ if(ph.current==='listening'&&!mutedRef.current)ask(t) }); if(!rec.current)setErr('No speech-to-text key configured and this browser has no built-in recognition — type below, or add a Gemini/OpenAI key in Lexon Workspace > Integrations > Lexon Office.') } })()
    return()=>{dead=true;vad.current?.stop();vad.current=null;rec.current?.stop();rec.current=null;stopAI()} },[c?.status,c?.id])
  useEffect(()=>{ let raf=0; const draw=(t:number)=>{ const cv=wave.current; if(cv){const x=cv.getContext('2d')!;x.clearRect(0,0,cv.width,cv.height);const n=32,bw=cv.width/n;const arr=new Uint8Array(64)
      const src=ph.current==='speaking'&&lastWasServer()?outAnalyser:ph.current==='listening'&&!mutedRef.current?vad.current?.analyser:null; src?.getByteFrequencyData(arr)
      for(let i=0;i<n;i++){let v=src?arr[i]/255:0;if(!src){v=ph.current==='speaking'?0.25+0.55*Math.abs(Math.sin(t/140+i*0.6)*Math.sin(t/330+i*0.23)):ph.current==='thinking'?0.08+0.06*Math.sin(t/200+i):0.04}
        const h=Math.max(3,Math.min(1,v*1.4)*cv.height);x.fillStyle=ph.current==='speaking'?'#3ddc84':ph.current==='listening'?'#3b82f6':'#5b6270';x.fillRect(i*bw+2,(cv.height-h)/2,bw-4,h)} } raf=requestAnimationFrame(draw) }; raf=requestAnimationFrame(draw); return()=>cancelAnimationFrame(raf) },[])
  if(!c)return null
  const p=o.people[c.id],mm=`${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`,end=()=>{stopAI();setMuted(false);setLine('');setYou('');setErr('');o.endCall()}
  const label=c.status==='calling'?'Calling…':{ringing:'Connecting…',listening:'Listening',thinking:'Thinking…',speaking:'Speaking'}[phase]
  return <WindowFrame fixed title={p.name} sub={c.status==='calling'?(c.mode==='voice'?'Ringing (live voice)…':'Calling…'):`${label} · ${mm}`} init={{x:110,y:70}} w={380} onClose={end}>
    <div className={'callui '+phase}><div className="empcam"><canvas width={320} height={240} ref={el=>{employeeCam.canvas=el}}/><span className="chip">{p.role}</span></div>
      <div className="wavew"><canvas ref={wave} width={340} height={56}/><b className={'state '+phase}><i className="sdot"/>{c.status==='calling'?'Calling…':label}</b></div>
      {you&&<small className="mut">You: {you}</small>}{line&&<div className="msg">{line}</div>}{err&&<small style={{color:'var(--y)'}}>{err}</small>}
      {c.status==='connected'&&c.mode==='ai'&&<div className="comp"><input value={txt} placeholder="Or type…" onChange={e=>setTxt(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&txt.trim()&&ph.current==='listening'){ask(txt.trim());setTxt('')}}}/></div>}
      <div className="acts" style={{justifyContent:'center'}}><button className={muted?'on':''} onClick={()=>setMuted(!muted)}>{muted?'🔇 Unmute':'🎙 Mute'}</button><button className="end" onClick={end}>✕ End call</button></div></div></WindowFrame>
}
