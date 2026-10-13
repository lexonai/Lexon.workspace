'use client'
import { useEffect, useRef, useState } from 'react'
import { profile } from '@/3d/perf'
import { useOffice } from '@/store/officeStore'
/** FPS / frame-time / draw-call profiler. Toggle with Ctrl+Shift+P or Settings → Graphics. */
export default function ProfilerHUD(){
  const [on,setOn]=useState(false),ref=useRef<HTMLPreElement>(null),lvl=useOffice(s=>s.perfLevel)
  useEffect(()=>{ const k=(e:KeyboardEvent)=>{if(e.ctrlKey&&e.shiftKey&&e.key.toLowerCase()==='p'){e.preventDefault();setOn(v=>!v)}}; const t=()=>setOn(v=>!v); window.addEventListener('keydown',k); window.addEventListener('office-profiler',t); return()=>{window.removeEventListener('keydown',k);window.removeEventListener('office-profiler',t)} },[])
  useEffect(()=>{ if(!on)return; const i=setInterval(()=>{ if(ref.current)ref.current.textContent=`FPS ${profile.fps.toFixed(0)}  (avg ${profile.avgMs.toFixed(1)} ms · p95 ${profile.p95Ms.toFixed(1)} · max ${profile.maxMs.toFixed(0)})\nJank frames >33ms: ${profile.jank}  of ${profile.frames}\nDraw calls/frame ${profile.calls} · triangles ${(profile.tris/1000).toFixed(0)}k\nGeometries ${profile.geoms} · textures ${profile.textures}\nRender submit ${profile.submitMs.toFixed(1)} ms · quality level ${lvl}` },500); return()=>clearInterval(i) },[on,lvl])
  return on?<pre className="hud" ref={ref}>profiling…</pre>:null
}
